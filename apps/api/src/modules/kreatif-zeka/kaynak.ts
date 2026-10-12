import {
  ETIKET_SEMA_SURUMU,
  KAYNAK_ANAHTARI_DESENI,
  gorselAdresleri,
  type EtiketlenemezNedeni,
  type KesinEtiketler,
  type Platform,
} from '@advetics/shared';
import { gorselKaynakAdlari, varlikKimligi } from '../connections/providers/google.provider';

/**
 * ═══ KREATİFİN KAYNAĞI: NE ETİKETLENECEK, NEREDEN TANINACAK ═══
 *
 * Saf fonksiyon: platform aynasındaki satırdan (`creatives.raw`,
 * `asset_urls`, `creative_type`) üç şeyi çıkarıyor:
 *
 * 1. KAPSAM: etiketlenebilir mi, değilse KALICI nedeni. Metin reklamı,
 *    LinkedIn ve görseli olmayan Google reklamı Gemini'ye hiç gitmiyor ve
 *    SAYILIYOR (MIMARI § 4 adım 2): "incelenemiyor" ile "henüz bakılmadı"
 *    aynı boş alana düşmesin.
 * 2. BİÇİM (görsel/video/karusel): platform verisinden KESİN okunuyor;
 *    modele sorulsaydı aynı kreatif iki çağrıda iki cevap alabilirdi.
 * 3. KAYNAK ANAHTARI: görseli İNDİRMEDEN tanımanın yolu. Meta aynı içerikli
 *    kreatifi yeniden kullanıyor (N-12) ve aynı görsel onlarca reklamda;
 *    anahtar eşleşirse ne tazeleme çağrısı ne indirme ne Gemini.
 *
 * Meta `image_hash` HESAP BAŞINA (CLAUDE.md): anahtar hesabın platform
 * kimliğini taşıyor. `act_` öneki atılıyor ve elle eklenmiyor; burada bir
 * yol kurulmuyor, yalnız bir kimlik.
 */

export type KaynakSonucu =
  | { tur: 'kalici'; neden: EtiketlenemezNedeni; bicim: KesinEtiketler['bicim'] }
  | {
      tur: 'gorsel';
      kaynakAnahtari: string;
      bicim: KesinEtiketler['bicim'];
      kismi: 'video_kapagi' | 'ilk_kart' | null;
    };

/**
 * Google'da METİN reklamı sayılan türler. Arama reklamının görseli yok ve
 * olmayacak (CLAUDE.md "metin reklamının kreatifi metnidir"); bu bir hata
 * değil kapsam.
 */
const GOOGLE_METIN_TURLERI = new Set(['RESPONSIVE_SEARCH_AD', 'EXPANDED_TEXT_AD', 'TEXT_AD', 'CALL_AD', 'EXPANDED_DYNAMIC_SEARCH_AD']);

const nesne = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const metin = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);

/** Desene uymayan anahtar yazılmıyor: kreatif kimliğine düşülüyor (indirilir, özetle tekilleşir). */
function anahtarYaDaKreatif(aday: string | null, creativeId: string): string {
  return aday && KAYNAK_ANAHTARI_DESENI.test(aday) ? aday : `kreatif:${creativeId}`;
}

export function kreatifKaynagi(g: {
  creativeId: string;
  platform: Platform;
  creativeType: string | null;
  raw: unknown;
  assetUrls: unknown;
  /** Kampanyanın `objective` alanı (Google'da kanal türü). */
  kanal: string | null;
  hesapExternalId: string;
}): KaynakSonucu {
  if (g.platform === 'linkedin') return { tur: 'kalici', neden: 'platform_disi', bicim: 'gorsel' };

  if (g.platform === 'google') {
    const tur = (g.creativeType ?? '').toUpperCase();
    if (GOOGLE_METIN_TURLERI.has(tur) || (g.kanal ?? '').toUpperCase() === 'SEARCH') {
      return { tur: 'kalici', neden: 'metin_reklami', bicim: 'gorsel' };
    }
    // GÖRSEL ADRESİ YOKSA (Performance Max, video, adres sorgusu düştü)
    // kalıcı: `asset_urls` yapı taramasında yazılıyor ve bu iş onu
    // değiştiremez. Kaynak adı süzgeçten geçmiyor (`gorselAdresleri`).
    if (gorselAdresleri(g.assetUrls).length === 0) return { tur: 'kalici', neden: 'gorsel_yok', bicim: 'gorsel' };
    const ham = nesne(g.raw) ?? {};
    const varlik = gorselKaynakAdlari(ham).map(varlikKimligi).find((x): x is string => x !== null) ?? null;
    return { tur: 'gorsel', kaynakAnahtari: anahtarYaDaKreatif(varlik ? `google:asset:${varlik}` : null, g.creativeId), bicim: 'gorsel', kismi: null };
  }

  // ─── Meta ───
  const c = nesne(g.raw) ?? {};
  const story = nesne(c.object_story_spec);
  const link = nesne(story?.link_data);
  const video = nesne(story?.video_data);
  const feed = nesne(c.asset_feed_spec);
  const hesap = g.hesapExternalId.toLowerCase().replace(/^act_/, '');
  const img = (hash: string | undefined) => (hash ? `meta:img:${hesap}:${hash.toLowerCase()}` : null);
  const vid = (id: string | undefined) => (id ? `meta:vid:${id}` : null);

  const kartlar = Array.isArray(link?.child_attachments) ? link!.child_attachments : [];
  if (kartlar.length > 1) {
    // KARUSEL: yalnız İLK kart etiketleniyor ve ekranda söyleniyor (Ç-6).
    const ilk = nesne(kartlar[0]) ?? {};
    const aday = img(metin(ilk.image_hash)) ?? vid(metin(ilk.video_id));
    return { tur: 'gorsel', kaynakAnahtari: anahtarYaDaKreatif(aday, g.creativeId), bicim: 'karusel', kismi: 'ilk_kart' };
  }

  const feedVideo = Array.isArray(feed?.videos) ? nesne(feed!.videos[0]) : undefined;
  const videoId = metin(video?.video_id) ?? metin(feedVideo?.video_id);
  if (videoId || (g.creativeType ?? '').toUpperCase() === 'VIDEO') {
    // VİDEO: yalnız KAPAK karesi (Ç-5). Akışta ilk görülen kare odur.
    return { tur: 'gorsel', kaynakAnahtari: anahtarYaDaKreatif(vid(videoId), g.creativeId), bicim: 'video', kismi: 'video_kapagi' };
  }

  const feedGorsel = Array.isArray(feed?.images) ? nesne(feed!.images[0]) : undefined;
  const hash = metin(link?.image_hash) ?? metin(feedGorsel?.hash) ?? metin(c.image_hash);
  return { tur: 'gorsel', kaynakAnahtari: anahtarYaDaKreatif(img(hash), g.creativeId), bicim: 'gorsel', kismi: null };
}

/** İş ve ekranın okuduğu güncel şema; yalnız bu sürümün etiketleri sayılır. */
export const GUNCEL_SEMA = ETIKET_SEMA_SURUMU;
