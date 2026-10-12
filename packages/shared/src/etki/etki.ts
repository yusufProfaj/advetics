import { z } from 'zod';
import type { Platform } from '../constants/platforms';
import type { Permission } from '../auth/roles';
import type { EtkiDurumu } from './durum';
import {
  ETKI,
  ETKI_METRIK_TANIMI,
  DEGISIKLIK_TURU_ADI,
  type DegisiklikSeviyesi,
  type DegisiklikTuru,
  type EtkiMetrigi,
  type EtkiNedeni,
  type EtkiSonucu,
  type GunAraligi,
  type KapsamSeviyesi,
} from './yontem';

/**
 * ═══ DEĞİŞİKLİK ETKİSİ — SÖZLEŞME (Paket C, Ajan 1 · Mimar, 2026-10-12) ═══
 *
 * Ajan 2 (API) ve Ajan 3 (panel) tip TANIMLAMAZ, buradan okur.
 */

// ─── Değişikliğin kaynağı: YENİ KAYIT YOK, VAR OLAN İKİ TABLO ───────────────

/**
 * Değişikliği nereden öğreniyoruz. Depo okundu (2026-10-12):
 *
 * - `kampanya_eylemi`: `audit_logs` satırı. `CampaignActionsService`in İKİ
 *   yolu da (`applyAction` ve geri okumalı `uygula`) her yazmadan sonra
 *   `action = '<seviye>.<tip>'` ve `target_id = BİZİM UUID'imiz` ile denetim
 *   kaydı yazıyor. İyileştir Uygula, Reklam Yöneticisi satır içi durdur, AI
 *   asistan kartı ve (Paket A) Sinyal Uygula hepsi bu servisten geçiyor;
 *   yani TEK kaynak hepsini kapsıyor. `iyilestir_oneri_karar` AYRI bir
 *   değişiklik DEĞİL, aynı değişikliğin gerekçesi: onu ikinci kaynak saymak
 *   her İyileştir uygulamasını iki kez ölçerdi.
 * - `kural`: `rule_action_logs` satırı, `outcome = 'applied'`. Kural
 *   motoru da `audit_logs`a yazıyor AMA `target_id`ye platform kimliğini
 *   (`entity_external_id`) koyuyor, bizim UUID'imizi değil. O satırı
 *   `audit_logs`tan okumak kural değişikliklerini kimliksiz bırakırdı;
 *   `rule_action_logs.entity_id` UUID taşıyor. Bu yüzden kural kaynağı
 *   `audit_logs`tan DEĞİL `rule_action_logs`tan okunur ve `audit_logs`
 *   taramasında `actor_type = 'rule'` satırları DIŞARIDA bırakılır (iki kez
 *   sayılmasın).
 */
export const DEGISIKLIK_KAYNAKLARI = ['kampanya_eylemi', 'kural'] as const;
export type DegisiklikKaynagi = (typeof DEGISIKLIK_KAYNAKLARI)[number];

/**
 * Değişiklik HANGİ ekrandan geldi: kartta "İyileştir önerisiyle" /
 * "Kural: Yüksek maliyet" / "Reklam Yöneticisi'nden" yazar ve İyileştir
 * kartının altına sonucu koymak için gerekir.
 *
 * Bugün `audit_logs` bunu TAŞIMIYOR. Ajan 2, `CampaignActionsService`e
 * isteğe bağlı bir `iz` parametresi ekler ve denetim kaydının `after`
 * alanına `iz` anahtarıyla yazar (`DENETIM_IZ_ANAHTARI`). Parametre yoksa
 * `bilinmiyor`: Ajan 2'den ÖNCE yazılmış eski satırlar ve iz göndermeyen
 * yeni çağrılar. Eski İyileştir uygulamaları `iyilestir_oneri_karar` ile
 * (aynı varlık, ±10 dakika, `durum = 'uygulandi'`) BİR KEZ eşlenir; eşleşme
 * yoksa `bilinmiyor` kalır, tahmin edilmez.
 */
export const DEGISIKLIK_YOLLARI = ['iyilestir', 'sinyal', 'reklam_yoneticisi', 'asistan', 'kural', 'bilinmiyor'] as const;
export type DegisiklikYolu = (typeof DEGISIKLIK_YOLLARI)[number];

export const DEGISIKLIK_YOLU_ADI: Record<DegisiklikYolu, string> = {
  iyilestir: 'İyileştir önerisi',
  sinyal: 'Sinyal',
  reklam_yoneticisi: 'Reklam Yöneticisi',
  asistan: 'Yapay zekâ asistanı',
  kural: 'Kural',
  bilinmiyor: 'Panel',
};

export const DENETIM_IZ_ANAHTARI = 'iz' as const;

/** `audit_logs.after.iz` biçimi. `ref`: öneri anahtarı, sinyal id'si, kural id'si. */
export const degisiklikIziSchema = z.object({
  yol: z.enum(DEGISIKLIK_YOLLARI),
  ref: z.string().max(200).nullable(),
});
export type DegisiklikIzi = z.infer<typeof degisiklikIziSchema>;

/**
 * Ölçülen ham eylem tipi → değişiklik türü. SAF; keşif sorgusu bunu
 * çağırır. `null` = ölçülmez (`OLCULMEYEN_DEGISIKLIKLER`).
 *
 * Bütçede yön ÖNCE/SONRA tutarından: eşitse (aynı değeri yeniden yazmak)
 * değişiklik yok. Tutarlardan biri okunamazsa `null`: yönü bilinmeyen bir
 * bütçe değişikliğini "artırıldı" saymak hükmü tersine çevirebilir.
 * Para micros STRING (BigInt JSON'a girmiyor).
 */
export function degisiklikTuru(
  eylem: string,
  onceMikros: string | null,
  sonraMikros: string | null,
): DegisiklikTuru | null {
  if (eylem === 'pause') return 'durdur';
  if (eylem === 'set_budget' || eylem === 'adjust_budget') {
    if (!onceMikros || !sonraMikros || !/^\d+$/.test(onceMikros) || !/^\d+$/.test(sonraMikros)) return null;
    const a = BigInt(onceMikros);
    const b = BigInt(sonraMikros);
    if (a === b) return null;
    return b > a ? 'butce_artir' : 'butce_azalt';
  }
  return null;
}

/**
 * `audit_logs.action` → (seviye, eylem). Yalnız kampanya eylemi deseni:
 * `campaign.pause`, `ad_group.set_budget`, `ad.pause`. `rule.*` satırları
 * burada `null` (kural kaynağı ayrı, yukarıdaki not).
 */
export function denetimEylemi(action: string): { seviye: DegisiklikSeviyesi; eylem: string } | null {
  const m = /^(campaign|ad_group|ad)\.([a-z_]+)$/.exec(action);
  if (!m) return null;
  return { seviye: m[1] as DegisiklikSeviyesi, eylem: m[2]! };
}

/**
 * ÖLÇÜLMEYENLER — ekranın "Ölçülmeyen değişiklikler" satırı. Sessizce yok
 * sayılmaz; kullanıcı neyin ölçülmediğini bilmeli.
 */
export const OLCULMEYEN_DEGISIKLIKLER = [
  {
    kod: 'platform_disi',
    ad: 'Meta ya da Google arayüzünden yapılan değişiklikler',
    neden:
      'İlk sürüm yalnız Advetics\'ten yapılan değişiklikleri görüyor. Platformun kendi değişiklik geçmişini okumak (Meta etkinlik günlüğü, Google değişiklik kayıtları) ikinci adım.',
  },
  {
    kod: 'baslat',
    ad: 'Duraklatılmış bir kampanyayı yeniden başlatmak',
    neden: 'Başlatılan varlığın öncesi yok (harcama sıfırdı); kıyaslanacak bir "önce" olmadığı için etkisi hesaplanmıyor.',
  },
  {
    kod: 'yeni_nesne',
    ad: 'Yeni kampanya, kopya, Akıllı Boost',
    neden: 'Yeni açılan kampanyanın öncesi yok. Onun performansı raporlarda ve Reklam Yöneticisi\'nde.',
  },
] as const;
export type OlculmeyenDegisiklikKodu = (typeof OLCULMEYEN_DEGISIKLIKLER)[number]['kod'];

// ─── Ekran tipi ──────────────────────────────────────────────────────────────

/** Bir pencerenin ekranda gösterilen hâli (biçimlenmiş). */
export interface EtkiPenceresiOzeti {
  aralik: GunAraligi;
  /** Hüküm metriğinin değeri ("312 ₺", "4,80 ₺"); payda sıfırsa `null`. */
  deger: string | null;
  tiklama: number;
  donusum: number;
}

/**
 * Kontrol grubu kurulamayan durdurma için GÖZLEM: hüküm değil, olgu.
 * "Durdurulmadan önceki 14 günde günde ortalama 420 ₺ harcıyordu; sonraki
 * 7 günde 0 ₺." Kullanıcı ne kadar harcamanın durduğunu görür; "iyi oldu"
 * diye bir yorum eklenmez.
 */
export interface EtkiGozlemi {
  onceGunlukHarcama: string;
  sonraGunlukHarcama: string;
  onceGunlukDonusum: number;
  sonraGunlukDonusum: number;
}

export interface Etki {
  id: string;
  clientId: string;
  platform: Platform;
  adAccountId: string;
  adAccountAdi: string;
  kaynak: DegisiklikKaynagi;
  yol: DegisiklikYolu;
  /** `yol`a göre: öneri anahtarı, sinyal id, kural id. Panel İyileştir kartını buna göre eşler. */
  yolRef: string | null;
  /** Kural adı ya da uygulayan kişinin adı (LEFT JOIN, RLS dersi); bilinmiyorsa `null`. */
  kim: string | null;
  tur: DegisiklikTuru;
  /** "Bütçe 500 ₺ → 600 ₺", "Durduruldu". Düz metin. */
  degisiklikMetni: string;
  varlik: { seviye: DegisiklikSeviyesi; id: string; ad: string; ustAd: string | null };
  /** Ölçülen kapsam: durdurmada üst varlık (`olcumKapsami`). */
  kapsam: { seviye: KapsamSeviyesi; id: string; ad: string };
  /** "Aynı hesaptaki 6 kampanya" — kontrol grubunun tarifi; yoksa `null`. */
  kontrolMetni: string | null;
  /** Aynı gün aynı türde birlikte ölçülen diğer değişiklik sayısı (0 = tek). */
  birlikteOlculen: number;
  zaman: string;
  /** Hesap saat diliminde `YYYY-MM-DD`. */
  gun: string;
  durum: EtkiDurumu;
  sonuc: EtkiSonucu | null;
  neden: EtkiNedeni | null;
  /** Hüküm metriği; `tiklama_basi_maliyet` ise ekran "dönüşüm az, tıklama maliyetine bakıldı" yazar. */
  metrik: Extract<EtkiMetrigi, 'donusum_basi_maliyet' | 'tiklama_basi_maliyet'> | null;
  /** İşaretli oran; `null` = hesaplanmadı. Ekranda "%18 düştü". */
  etkiOrani: number | null;
  /** Hangi ölçüm noktasında (gün) hükme bağlandı ya da en son bakıldı. */
  noktaGun: number | null;
  /** `olcumde`/`bekliyor` ise bir sonraki değerlendirme günü. */
  sonrakiOlcum: string | null;
  once: EtkiPenceresiOzeti | null;
  sonra: EtkiPenceresiOzeti | null;
  /** Kontrol grubunun aynı metrikteki değişimi (oran); ekranda "diğer kampanyalar %6 düştü". */
  kontrolDegisimi: number | null;
  gozlem: EtkiGozlemi | null;
  /** Tek cümle, şablondan (`etkiCumlesi`); yapay zekâ YAZMAZ. */
  cumle: string;
}

/** Ekranın tek cümlesi. SAF ve şablon: sayı uydurulamaz, yalnız alanlardan. */
export function etkiCumlesi(e: Pick<Etki, 'durum' | 'sonuc' | 'neden' | 'metrik' | 'etkiOrani' | 'sonrakiOlcum' | 'tur'>): string {
  const yuzde = (x: number) => `%${Math.round(Math.abs(x) * 100)}`;
  if (e.durum === 'bekliyor') return e.sonrakiOlcum ? `Etki ${e.sonrakiOlcum} tarihinde ölçülecek.` : 'Etki ölçülecek.';
  if (e.durum === 'olculemedi') {
    switch (e.neden) {
      case 'kontrol_grubu_yok':
        return e.tur === 'durdur'
          ? 'Kıyaslanacak değişmemiş kampanya yok; yalnız durmadan önceki harcama gösteriliyor.'
          : 'Aynı hesapta kıyaslanacak değişmemiş kampanya yok.';
      case 'karisik':
        return 'Aynı dönemde burada başka bir değişiklik de yapıldı; etkiler ayrılamıyor.';
      case 'dogrulanmadi':
        return 'Değişiklik platformda doğrulanamadı; etkisi ölçülmedi.';
      case 'hesap_tasindi':
        return 'Reklam hesabı ölçüm sırasında başka bir workspace\'e taşındı.';
      case 'veri_yok':
        return 'Değişiklikten sonra bu kampanyanın verisi gelmedi.';
      default:
        return 'Etkisi ölçülemedi.';
    }
  }
  const ad = e.metrik ? ETKI_METRIK_TANIMI[e.metrik].ad.toLocaleLowerCase('tr') : 'maliyet';
  const yon = (x: number) => (x < 0 ? 'düştü' : 'arttı');
  if (e.sonuc === 'henuz_belli_degil') {
    const ne = e.neden === 'gurultulu' ? 'Fark, hesabın olağan dalgalanmasından ayrılamıyor' : 'Henüz yeterli veri yok';
    return e.sonrakiOlcum ? `${ne}; ${e.sonrakiOlcum} tarihinde yeniden bakılacak.` : `${ne}.`;
  }
  if (e.sonuc === 'belirsiz') {
    const son = ETKI.olcumNoktalariGun[ETKI.olcumNoktalariGun.length - 1];
    return `${son} gün sonunda da yeterli veri birikmedi; etkisi belli olmadı.`;
  }
  if (e.sonuc === 'fark_yok') return `Değişiklikten sonra ${ad} belirgin biçimde değişmedi.`;
  if (e.etkiOrani === null) return 'Etkisi ölçüldü.';
  const metin = `Değişiklikten sonra ${ad}, aynı hesapta değişmeyenlere göre ${yuzde(e.etkiOrani)} ${yon(e.etkiOrani)}.`;
  return metin;
}

/** "Bütçe 500 ₺ → 600 ₺" / "Durduruldu". Para biçimi çağırandan (API `format`). */
export function degisiklikMetni(tur: DegisiklikTuru, once: string | null, sonra: string | null): string {
  if (tur === 'durdur' || !once || !sonra) return DEGISIKLIK_TURU_ADI[tur];
  return `Bütçe ${once} → ${sonra}`;
}

// ─── Liste yanıtı ────────────────────────────────────────────────────────────

export const ETKI_BOS_NEDENLERI = [
  /** Bu workspace'te Advetics'ten yapılmış ölçülebilir değişiklik yok. */
  'degisiklik_yok',
  /** Keşif işi hiç koşmadı (deploy sonrası ilk sabah). */
  'kesif_kosmadi',
  /** Süzgeç her şeyi eledi. */
  'suzgec_bos',
] as const;
export type EtkiBosNedeni = (typeof ETKI_BOS_NEDENLERI)[number];

export interface EtkiListesi {
  etkiler: Etki[];
  /** Süzgeçten sonra, sayfalamadan önce. Sessiz kesme yok. */
  toplam: number;
  sayilar: Record<EtkiDurumu, number>;
  emptyReason: EtkiBosNedeni | null;
  /** Son başarılı keşif + değerlendirme (`sync_jobs` `impact_evaluate`). */
  sonHesaplama: string | null;
  /** Ekranın "Ölçülmeyen değişiklikler" satırı. Her yanıtta, boş listede de. */
  olculmeyen: typeof OLCULMEYEN_DEGISIKLIKLER;
  hatalar: Array<{ kaynak: string; mesaj: string }>;
  uretildi: string;
}

export const ETKI_SAYFA_BOYUTU = 50;

export const etkiListeSorgusuSchema = z.object({
  clientId: z.string().uuid(),
  /** `acik` = bekliyor + olcumde; `kapali` = son durumlar. */
  durum: z.enum(['hepsi', 'acik', 'kapali']).default('hepsi'),
  /** İyileştir kartının altı: tek varlığın değişiklikleri. */
  varlikId: z.string().uuid().optional(),
  yol: z.enum(DEGISIKLIK_YOLLARI).optional(),
  sayfa: z.coerce.number().int().min(1).max(1000).default(1),
});
export type EtkiListeSorgusu = z.infer<typeof etkiListeSorgusuSchema>;

/** Tek etki + mini grafik: günlük hüküm metriği, deney ve kontrol, değişiklik günü işaretli. */
export interface EtkiAyrintisi {
  etki: Etki;
  seri: {
    gunler: string[];
    deney: Array<number | null>;
    kontrol: Array<number | null>;
    degisiklikGunu: string;
  } | null;
}

// ─── Uçlar ───────────────────────────────────────────────────────────────────

/**
 * TEK KAYNAK. Okuma-yalnız modül: kullanıcının yazdığı hiçbir şey yok,
 * satırları iş yazıyor. İzin `rule.read`: ekran İyileştir'in sekmesi
 * (İyileştir menüsü `rule.read`). Müşteri hesabı ekranı görmez; etkiyi
 * Paket B'nin müşteri özetinde görür (`report.read`).
 */
export const ETKI_UCLARI = [
  { yontem: 'GET', yol: '/etki', izin: 'rule.read', ne: 'Workspace değişiklikleri ve etkileri (süzgeç, sayfa)' },
  { yontem: 'GET', yol: '/etki/:id', izin: 'rule.read', ne: 'Tek etki + günlük seri' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; ne: string }>;
