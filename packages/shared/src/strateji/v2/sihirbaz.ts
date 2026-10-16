import { z } from 'zod';
import { REHBER_AMACLARI, REHBER_AMAC_KODLARI, REHBER_PLATFORMLARI, type RehberAmacKodu, type RehberPlatformu } from '../../reklam/rehber/amaclar';
import { rehberKonumuSchema, type RehberKonumu } from '../../reklam/rehber/alanlar';
import { monthSchema } from '../../schemas/budget.schema';
import { paraOndaligi, tutarGoster } from '../../reklam/para';
import { tutarGirdisiSchema } from '../plan';
import { KALEM_KONUM_SINIRI, STRATEJI_EN_UZUN_AY, stratejiOlusturSchema } from './kalem';

/**
 * ═══ ADVSTRATEGY v2 — ADIM ADIM OLUŞTURMA (SİHİRBAZ) ═══
 * (kullanıcı onaylı taslak `docs/advstrategy/simulasyon.html`, 2026-10-13)
 *
 * Kullanıcının cümlesi: *"simülasyon gibi yapman lazım tek tek kurmaları
 * gerekiyor"*. Sekmeli düzenleyici (strateji / belge / aktarım) yerine yedi
 * ekran, her ekranda TEK soru: Hedef → Bütçe → Bölge → Kime → İnceleme →
 * Plan → Gönder.
 *
 * İLERLEME SUNUCUDA, TASLAK PLANIN İÇİNDE (`strateji_planlari.sihirbaz`).
 * Tarayıcı deposu değil: iki geliştiricinin iki ajansı aynı workspace'te
 * çalışıyor ve "Kaydet ve çık" diyen kişi taslağa başka bir makineden
 * dönebilmeli. Her "Devam" bu durumu sürümle (iyimser kilit) yazar.
 *
 * AMAÇ LİSTESİ SIRALI: seçme sırası = öncelik. Bütçe bu sırayla bölünür
 * (`oncelikPaylari`) ve bölme kuralı panel ile motorda AYNI fonksiyon: bütçe
 * adımı "hedef başına günlük" derken motor başka bir pay hesaplasaydı, adım
 * "yeter" deyip plan asgarinin altında bir kampanya önerirdi.
 */

export const STRATEJI_OLUSTURMA_ADIMLARI = ['hedef', 'butce', 'bolge', 'kime', 'inceleme', 'plan', 'gonder'] as const;
export type StratejiOlusturmaAdimi = (typeof STRATEJI_OLUSTURMA_ADIMLARI)[number];

export const STRATEJI_ADIM_ETIKETI: Record<StratejiOlusturmaAdimi, string> = {
  hedef: 'Hedef',
  butce: 'Bütçe',
  bolge: 'Bölge',
  kime: 'Kime',
  inceleme: 'İnceleme',
  plan: 'Plan',
  gonder: 'Gönder',
};

/** "Kime anlatıyoruz" metni. `onaylandi` ZORUNLU geçiş şartı: tarifi okumadan plana geçilmez. */
export const sihirbazKitleSchema = z.object({
  metin: z.string().trim().min(1).max(2000),
  kaynak: z.enum(['ai', 'ajans']),
  onaylandi: z.boolean(),
});
export type SihirbazKitlesi = z.infer<typeof sihirbazKitleSchema>;

export const stratejiSihirbazDurumuSchema = z.object({
  adim: z.enum(STRATEJI_OLUSTURMA_ADIMLARI),
  /** Sıra = öncelik (ilk seçilen en büyük pay). Tekrar yok. */
  amaclar: z
    .array(z.enum(REHBER_AMAC_KODLARI))
    .max(REHBER_AMAC_KODLARI.length)
    .refine((a) => new Set(a).size === a.length, 'Aynı hedef iki kez seçilemez'),
  /** Bölge adımı; boş = henüz seçilmedi (motor Marka Merkezi'ne düşer). */
  konumlar: z.array(rehberKonumuSchema).max(KALEM_KONUM_SINIRI),
  kitle: sihirbazKitleSchema.nullable(),
  /**
   * İncelemenin koştuğu girdinin imzası (`sihirbazGirdiImzasi`). Kullanıcı
   * Plan'dan "Geri" ile İnceleme'ye döndüğünde inceleme YENİDEN KOŞMAZ
   * (kalemlerde yaptığı düzenlemeler ezilirdi); girdiler değiştiyse koşar.
   */
  incelenen: z.string().max(64).nullable(),
  /**
   * İncelemenin (motorun) notları: "plana alınmadı", "dönemin başı geçmişte".
   * Öneri yanıtı yazılmıyor (`POST …/oner` YAZMAZ); notlar burada durmazsa
   * Plan adımı sayfa yenilenince "Beni arasınlar neden yok?" sorusunu
   * cevapsız bırakırdı.
   */
  notlar: z.array(z.string().max(1000)).max(40).default([]),
});
export type StratejiSihirbazi = z.infer<typeof stratejiSihirbazDurumuSchema>;
/** Gövde hâli (`notlar` verilmeyebilir; şema boş dizi yazar). */
export type StratejiSihirbazGirdisi = z.input<typeof stratejiSihirbazDurumuSchema>;

export function bosSihirbaz(amaclar: RehberAmacKodu[] = []): StratejiSihirbazi {
  return { adim: 'hedef', amaclar, konumlar: [], kitle: null, incelenen: null, notlar: [] };
}

/**
 * `POST /strateji/v2/planlar` gövdesi sihirbazla: v2 oluşturma şeması + ilk
 * durum. Plan BÜTÇE adımının "Devam"ında doğuyor (oluşturma toplam bütçe
 * istiyor ve bütçe o adımda biliniyor); hedef seçimi aynı transaction'da
 * yazılır, iki ayrı istek "plan var ama hedefi yok" yarım hâlini üretirdi.
 */
export const stratejiSihirbazOlusturSchema = stratejiOlusturSchema.extend({
  sihirbaz: stratejiSihirbazDurumuSchema.optional(),
});
export type StratejiSihirbazOlusturGirdisi = z.input<typeof stratejiSihirbazOlusturSchema>;

/** `PUT …/sihirbaz`: durum + isteğe bağlı dönem ve toplam (Bütçe adımı). Sürüm ZORUNLU. */
export const stratejiSihirbazKaydetSchema = z.object({
  surum: z.number().int().positive(),
  sihirbaz: stratejiSihirbazDurumuSchema,
  donem: z.object({ baslangicAyi: monthSchema, sureAy: z.number().int().min(1).max(STRATEJI_EN_UZUN_AY) }).optional(),
  toplamButce: tutarGirdisiSchema.optional(),
});
export type StratejiSihirbazKaydetGirdisi = z.input<typeof stratejiSihirbazKaydetSchema>;

/** `POST …/kitle-oner`. `yeniden` = "Yeniden yaz": öncekinden FARKLI bir tarif istenir. */
export const kitleOnerSchema = z.object({ yeniden: z.boolean().default(false), onceki: z.string().max(2000).optional() });
export type KitleOnerGirdisi = z.input<typeof kitleOnerSchema>;

/** Yapay zekâ tarifi ya da üretilemediyse NEDENİ (boş kutunun sebebi yazılır). */
export type StratejiKitleOnerisi = { tur: 'metin'; metin: string } | { tur: 'yok'; neden: string };

// ─── Bütçe: öncelik sırasıyla bölme ve platform asgarisi ────────────────

/**
 * Öncelik ağırlıkları: n hedefte i. hedefin ağırlığı n − i (ilk n, son 1).
 * İki hedef 2:1, üç hedef 3:2:1. "Advetics kuralı" kaynağıyla gösterilir;
 * hesabın verisinden gelmiyor ve öyle yazılmaz.
 */
export function oncelikAgirliklari(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => n - i);
}

/**
 * Toplamı öncelik ağırlıklarıyla böler; her pay para biriminin en küçük
 * birimine AŞAĞI yuvarlanır ve kalan kuruş İLK hedefe gider (`butceBol`
 * deseni): payların toplamı her zaman yazılan tutar.
 */
export function oncelikPaylari(toplamMicros: bigint, n: number, paraBirimi: string): bigint[] {
  if (n <= 0 || toplamMicros <= 0n) return [];
  const agirlik = oncelikAgirliklari(n);
  const payda = BigInt(agirlik.reduce((a, b) => a + b, 0));
  const birim = 10n ** BigInt(6 - paraOndaligi(paraBirimi));
  const paylar = agirlik.map((w) => {
    const ham = (toplamMicros * BigInt(w)) / payda;
    return ham - (ham % birim);
  });
  paylar[0] = paylar[0]! + (toplamMicros - paylar.reduce((a, b) => a + b, 0n));
  return paylar;
}

export interface AsgariGunluk {
  meta: bigint | null;
  googleTalepYaratma: bigint | null;
}

/**
 * Platformun bu amaçtaki GÜNLÜK asgarisi. TEK KURAL: motor ve bütçe adımı
 * bunu okur. Google Arama'nın resmî asgarisi yok (`0n` = sınır yok); Talep
 * Yaratma'nınki 5 USD karşılığı (bilinmiyorsa `null`); Maks. Performans
 * ölçülmedi (`null`). Meta'nınki hesaptan okunur (`null` = okunamadı).
 */
export function amacGunlukAsgari(amac: RehberAmacKodu, p: RehberPlatformu, a: AsgariGunluk): bigint | null {
  if (p === 'meta') return a.meta;
  const kurgu = REHBER_AMACLARI[amac].google.kurgu;
  if (kurgu === 'ARAMA') return 0n;
  if (kurgu === 'TALEP_YARATMA_VIDEO' || kurgu === 'TALEP_YARATMA_GORSEL') return a.googleTalepYaratma;
  return null;
}

export interface SihirbazButceSatiri {
  amac: RehberAmacKodu;
  payMicros: bigint;
  gunlukMicros: bigint;
  /**
   * `yeter`: açık platformlardan en az biri bu günlük tutarla kurulabilir
   * (motor iki yarım kampanya yerine bir tam kampanya kurar).
   * `yetmez`: açık platformların HEPSİNİN asgarisi biliniyor ve hepsinin altında.
   * `bilinmiyor`: yetmeyen yok ama asgarisi okunamayan platform var; ilerletir, söyler.
   */
  durum: 'yeter' | 'yetmez' | 'bilinmiyor';
  /** Yetmezse en küçük asgari (o platform) ve cümle. */
  cumle: string | null;
}

/**
 * Bütçe adımının kapısı. ASGARİNİN ALTINDA İLERLETMEZ ve nedenini yazar:
 * plan adımında "bu kampanya kurulamaz" demek, kullanıcının yedi ekranı
 * tamamlayıp en sonda geri dönmesi demekti (doğrulama giriş anında).
 * Asgari okunamıyorsa (`null`) uydurulmaz: "kontrol edilemedi" yazılır ve
 * ilerler; risk listesi (R-ASGARI) plan adımında yeniden bakar.
 */
export function sihirbazButceKontrolu(g: {
  amaclar: readonly RehberAmacKodu[];
  toplamMicros: bigint;
  gun: number;
  paraBirimi: string;
  acikPlatformlar: (amac: RehberAmacKodu) => readonly RehberPlatformu[];
  asgari: AsgariGunluk;
}): { satirlar: SihirbazButceSatiri[]; ilerler: boolean } {
  const paylar = oncelikPaylari(g.toplamMicros, g.amaclar.length, g.paraBirimi);
  const satirlar = g.amaclar.map((amac, i): SihirbazButceSatiri => {
    const payMicros = paylar[i] ?? 0n;
    const gunlukMicros = g.gun > 0 ? payMicros / BigInt(g.gun) : 0n;
    const platformlar = g.acikPlatformlar(amac);
    const asgariler = platformlar.map((p) => ({ p, a: amacGunlukAsgari(amac, p, g.asgari) }));
    if (asgariler.some((x) => x.a !== null && gunlukMicros >= x.a)) return { amac, payMicros, gunlukMicros, durum: 'yeter', cumle: null };
    if (asgariler.length > 0 && asgariler.every((x) => x.a !== null)) {
      const enKucuk = asgariler.reduce((m, x) => (x.a! < m.a! ? x : m));
      const ad = enKucuk.p === 'meta' ? 'Meta' : 'Google';
      return {
        amac,
        payMicros,
        gunlukMicros,
        durum: 'yetmez',
        cumle: `“${REHBER_AMACLARI[amac].ekranAdi}” için günde ${tutarGoster(gunlukMicros, g.paraBirimi)} düşüyor; ${ad} bu kampanyada günde en az ${tutarGoster(enKucuk.a!, g.paraBirimi)} istiyor. Bütçeyi artır ya da hedef sayısını azalt.`,
      };
    }
    return {
      amac,
      payMicros,
      gunlukMicros,
      durum: 'bilinmiyor',
      cumle: `“${REHBER_AMACLARI[amac].ekranAdi}” için platformun alt sınırı okunamadı; kontrol edilemedi.`,
    };
  });
  return { satirlar, ilerler: satirlar.length > 0 && satirlar.every((s) => s.durum !== 'yetmez') };
}

// ─── Sihirbazın okuduğu girdiler (plan doğmadan önce) ───────────────────

/** `GET /strateji/v2/sihirbaz-girdileri?clientId=`: hedef ve bütçe adımları plan yokken de çalışır. */
export interface StratejiSihirbazGirdileri {
  /** Her amaç: açık platformlar ve kapalıysa NEDENİ (rehberin kapıları + ölçüm). */
  amaclar: Array<{
    amac: RehberAmacKodu;
    acik: boolean;
    platformlar: RehberPlatformu[];
    /** Kapalı amacın ya da düşen platformun cümlesi; açık amaçta düşen platformlar da yazılır. */
    sebepler: string[];
  }>;
  /** Günlük asgari, micros dizge; `null` = okunamadı / sınır bilinmiyor. */
  asgariGunluk: { meta: string | null; googleTalepYaratma: string | null };
  paraBirimi: string;
  /** Para birimi okunamadıysa (hesap yok, karışık birim) NEDENİ; plan oluşturma bu durumda reddeder. */
  paraBirimiHatasi: string | null;
  /**
   * Para birimi çözülemediğinde kullanıcının seçebileceği birimler: karışık
   * hesaplarda hesapların birimleri, hesap yoksa yaygın birimler. Eskiden
   * ekran "Para birimini seçin" diyordu ama seçici YOKTU; Devam kalıcı
   * kapalı kalıyor ve strateji hiç açılamıyordu (2026-10-16).
   */
  paraBirimiSecenekleri: string[];
  /** Bölge önerisi: Marka Merkezi'nin varsayılan kitlesi. Boşsa neden. */
  konumOnerisi: { konumlar: RehberKonumu[]; kaynak: 'marka' | 'yok'; adres: string | null };
  /** Konum araması Meta hesabı üzerinden; atanmamışsa null ve arama kapalı. */
  konumHesabi: string | null;
  ozelKategori: boolean;
  /** "Müşteri adına onayla" yalnız ajans yöneticisine (`ajansYoneticisiMi`, sunucu da reddeder). */
  ajansYoneticisi: boolean;
  /** Önerilen ilk ay (İstanbul takvimiyle gelecek ay), `YYYY-MM`. */
  baslangicAyi: string;
  /** Okunamayan girdiler (ölçüm, platform asgarisi): sessizce "yok" sayılmaz. */
  okumaHatalari: string[];
}

// ─── İnceleme adımı: girdiler TEK TEK okunur ─────────────────────────────

/**
 * İnceleme ekranının satırları. HER SATIR GERÇEK BİR İSTEK: animasyon yalnız
 * o istek sürerken döner, alt metin istekten gelen veri. Sahte bekleme
 * (`setTimeout` ile ilerleyen liste) kullanıcıya "inceledik" deyip
 * incelememek olurdu. Son satır ("Bütçe dağıtılıyor") `POST …/oner`.
 */
export const STRATEJI_INCELEME_PARCALARI = ['marka', 'site', 'meta', 'google', 'olcum', 'kelime'] as const;
export type StratejiIncelemeParcasi = (typeof STRATEJI_INCELEME_PARCALARI)[number];

export const STRATEJI_INCELEME_ETIKETI: Record<StratejiIncelemeParcasi | 'dagitim', string> = {
  marka: 'Marka Merkezi',
  site: 'Web sitesi',
  meta: 'Meta geçmişi',
  google: 'Google geçmişi',
  olcum: 'Ölçüm',
  kelime: 'Arama kelimeleri',
  dagitim: 'Bütçe dağıtımı',
};

export function stratejiIncelemeParcasi(ham: string): StratejiIncelemeParcasi | null {
  return (STRATEJI_INCELEME_PARCALARI as readonly string[]).includes(ham) ? (ham as StratejiIncelemeParcasi) : null;
}

/** `GET …/inceleme/:parca`. `uyari` = satır kırmızı işaretle biter (eksik, ölçülmüyor). */
export interface StratejiIncelemeSatiri {
  parca: StratejiIncelemeParcasi;
  durum: 'hazir' | 'eksik' | 'bos' | 'bilinmiyor';
  ozet: string;
  uyari: boolean;
}

// ─── İnceleme imzası ────────────────────────────────────────────────────

/**
 * İncelemeyi besleyen girdilerin kısa imzası (FNV-1a, 32 bit, onaltılık).
 * Güvenlik değil, yalnız "değişti mi" sorusu: aynı girdi aynı imza.
 * Kriptografik özet tarayıcıda async ve shared'ın iki tarafta da çalışması
 * gerekiyor.
 */
export function sihirbazGirdiImzasi(s: Pick<StratejiSihirbazi, 'amaclar' | 'konumlar' | 'kitle'>, plan: { baslangic: string; bitis: string; toplamButceMicros: string }): string {
  const metin = JSON.stringify({
    a: s.amaclar,
    k: s.konumlar.map((x) => `${x.tur}:${x.key}`),
    t: s.kitle?.onaylandi ? s.kitle.metin : null,
    d: [plan.baslangic, plan.bitis, plan.toplamButceMicros],
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < metin.length; i++) {
    h ^= metin.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Platformların sırası sabit (Meta, Google): ekranda iki platform her zaman aynı yerde. */
export const SIHIRBAZ_PLATFORM_SIRASI: readonly RehberPlatformu[] = REHBER_PLATFORMLARI;
