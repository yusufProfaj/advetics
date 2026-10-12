import type { Platform } from '../constants/platforms';

/**
 * ═══ ETİKET × PERFORMANS İSTATİSTİĞİ ═══
 *
 * Yöntem ve gerekçe: `docs/kreatif-zeka/MIMARI.md` § 6. Özet:
 *
 * 1. BİRİM KREATİF, GÖSTERİM DEĞİL. Etiket kreatif düzeyinde bir özellik.
 *    Gösterimleri bağımsız örnek sayıp binom güven aralığı kurmak, milyon
 *    gösterimli iki grupta her farkı "kesin" ilan ederdi: aynı kreatifin
 *    gösterimleri birbirinin kopyası, 40 kreatif 40 örnektir, 2 milyon değil.
 * 2. HARCAMA AĞIRLIKLI. Her kreatifin oranı harcamasıyla tartılır: 50 ₺
 *    harcamış bir kreatifin şanslı tıklama oranı, 20.000 ₺ harcamış olanla
 *    aynı sesle konuşmasın. Etkin örneklem `(Σw)² / Σw²` ile küçülür ve
 *    ekranda O yazılır: tek bir dev kreatif grubun "40 kreatifini" fiilen
 *    bire indirir.
 * 3. VERİM ÖLÇEĞİ: her metrik "yüksek daha iyi" yönde tutulur. Tıklama
 *    oranı zaten öyle; maliyet metrikleri tersine çevrilir (dönüşüm / ₺,
 *    gösterim / ₺). İki kazanç: (a) yön karışıklığı yok ("CPA'da artış
 *    kötü" dersi, CLAUDE.md `inverse`), (b) harcama ağırlıklı ortalama
 *    TAM OLARAK toplamların oranına eşit (Σdönüşüm / Σharcama), yani
 *    sıfır dönüşümlü kreatif bölme hatası üretmeden gruba girer. Ekranda
 *    tersine çevrilip TL olarak gösterilir.
 * 4. KARŞILAŞTIRMA AYNI KÜMEDE: aynı platform + aynı amaç. Bilinirlik
 *    kampanyasının ucuz gösterimi ile satış kampanyasının pahalı tıklaması
 *    aynı grupta olursa "insan olan görseller daha ucuz" cümlesi amaç
 *    farkından üretilmiş olur.
 * 5. ÜÇ KARAR, İKİ DEĞİL: `yetersiz` (örneklem küçük, bakılmadı),
 *    `belirsiz` (bakıldı, güven aralığı sıfırı kapsıyor), `anlamli`. İlk
 *    ikisini aynı "fark yok" cümlesine çevirmek, az verili workspace'e
 *    "renk fark etmiyor" demek olurdu; oysa söylenecek şey "henüz bilmiyoruz".
 */

// ─── Metrikler ──────────────────────────────────────────────────────────────

export const KREATIF_METRIKLERI = ['tiklama_orani', 'donusum_verimi', 'gosterim_verimi'] as const;
export type KreatifMetrigi = (typeof KREATIF_METRIKLERI)[number];

/** Ekranda gösterilen karşılık (verim ölçeği tersine çevrilerek). */
export const METRIK_GOSTERIMI: Record<KreatifMetrigi, { ad: string; gosterim: 'yuzde' | 'tl_ters' }> = {
  tiklama_orani: { ad: 'Tıklama oranı', gosterim: 'yuzde' },
  donusum_verimi: { ad: 'Dönüşüm başı maliyet', gosterim: 'tl_ters' },
  gosterim_verimi: { ad: '1.000 gösterim maliyeti', gosterim: 'tl_ters' },
};

/** Bir kreatifin pencere toplamı (son `PENCERE_GUN`). Para RAPOR para biriminde, micros. */
export interface KreatifOlcusu {
  creativeId: string;
  gosterim: number;
  tiklama: number;
  donusum: number;
  harcamaMicros: bigint;
}

export const PENCERE_GUN = 90;

/**
 * Kreatifin verim değeri. Harcaması sıfır olan kreatif hiçbir maliyet
 * metriğine giremez (`null`), tıklama oranına gösterimi varsa girer.
 */
export function kreatifMetrikDegeri(o: KreatifOlcusu, m: KreatifMetrigi): number | null {
  const tl = Number(o.harcamaMicros) / 1e6;
  switch (m) {
    case 'tiklama_orani':
      return o.gosterim > 0 ? o.tiklama / o.gosterim : null;
    case 'donusum_verimi':
      return tl > 0 ? o.donusum / tl : null;
    case 'gosterim_verimi':
      return tl > 0 ? o.gosterim / 1000 / tl : null;
  }
}

// ─── Karşılaştırma kümesi: aynı platform + aynı amaç ────────────────────────

export const AMAC_GRUPLARI = ['bilinirlik', 'trafik', 'etkilesim', 'potansiyel', 'satis', 'uygulama', 'goruntulu', 'demand_gen'] as const;
export type AmacGrubu = (typeof AMAC_GRUPLARI)[number];

export const AMAC_GRUBU_ADI: Record<AmacGrubu, string> = {
  bilinirlik: 'Bilinirlik',
  trafik: 'Trafik',
  etkilesim: 'Etkileşim ve mesaj',
  potansiyel: 'Potansiyel müşteri',
  satis: 'Satış',
  uygulama: 'Uygulama',
  goruntulu: 'Görüntülü reklam',
  demand_gen: 'Demand Gen',
};

/**
 * Meta `objective` → amaç grubu. ODAX (OUTCOME_*) ve eski adlar birlikte:
 * hesaplarda eski kampanyalar duruyor. Tanınmayan değer `null` →
 * kreatif hiçbir kümeye girmez ve SAYILIR (`kumesiz`), sessizce
 * yanlış kümeye düşmez.
 *
 * Google'da `objective` kanal türü (`google.provider.ts`: "Google'ın
 * objective karşılığı kanal türü"); amaç bilgisi yok, küme kanalın kendisi.
 * Arama kampanyası kümeye girmez: kreatifi metin (etiketlenmez).
 */
const META_AMAC: Record<string, AmacGrubu> = {
  OUTCOME_AWARENESS: 'bilinirlik',
  BRAND_AWARENESS: 'bilinirlik',
  REACH: 'bilinirlik',
  OUTCOME_TRAFFIC: 'trafik',
  LINK_CLICKS: 'trafik',
  OUTCOME_ENGAGEMENT: 'etkilesim',
  POST_ENGAGEMENT: 'etkilesim',
  MESSAGES: 'etkilesim',
  VIDEO_VIEWS: 'etkilesim',
  OUTCOME_LEADS: 'potansiyel',
  LEAD_GENERATION: 'potansiyel',
  OUTCOME_SALES: 'satis',
  CONVERSIONS: 'satis',
  PRODUCT_CATALOG_SALES: 'satis',
  OUTCOME_APP_PROMOTION: 'uygulama',
  APP_INSTALLS: 'uygulama',
};
const GOOGLE_KANAL: Record<string, AmacGrubu> = {
  DISPLAY: 'goruntulu',
  DEMAND_GEN: 'demand_gen',
};

export interface KarsilastirmaKumesi {
  /** `meta:satis` biçiminde; URL'de ve önbellek anahtarında taşınır. */
  anahtar: string;
  platform: Platform;
  amac: AmacGrubu;
  ad: string;
}

export function karsilastirmaKumesi(platform: Platform, objective: string | null): KarsilastirmaKumesi | null {
  const k = (objective ?? '').toUpperCase();
  const amac = platform === 'meta' ? META_AMAC[k] : platform === 'google' ? GOOGLE_KANAL[k] : undefined;
  if (!amac) return null;
  return { anahtar: `${platform}:${amac}`, platform, amac, ad: `${platform === 'meta' ? 'Meta' : 'Google'} · ${AMAC_GRUBU_ADI[amac]}` };
}

/**
 * Kümenin ANA metriği: puan ve kova buna göre. Dönüşüm amaçlı kümede
 * dönüşüm verimi — ama yalnız küme toplamında yeterli dönüşüm varsa; takibi
 * olmayan hesapta dönüşüm her zaman sıfır ve sıfıra göre sıralamak listeyi
 * rastgele yapar (`kreatif-performansi.ts` ile aynı ders). Düşüşte tıklama
 * oranına iner ve bunu `dusus` ile SÖYLER.
 */
export const ANA_METRIK_ESIGI = { kumeEnAzDonusum: 30 } as const;

export function anaMetrik(amac: AmacGrubu, kumeToplamDonusum: number): { metrik: KreatifMetrigi; dusus: boolean } {
  if (amac === 'bilinirlik') return { metrik: 'gosterim_verimi', dusus: false };
  if (amac === 'potansiyel' || amac === 'satis' || amac === 'uygulama') {
    return kumeToplamDonusum >= ANA_METRIK_ESIGI.kumeEnAzDonusum
      ? { metrik: 'donusum_verimi', dusus: false }
      : { metrik: 'tiklama_orani', dusus: true };
  }
  return { metrik: 'tiklama_orani', dusus: false };
}

// ─── Ağırlıklı grup özeti ───────────────────────────────────────────────────

export const ISTATISTIK = {
  /** Bir değer grubunda en az bu kadar kreatif (harcama eşiğini geçmiş). */
  enAzKreatif: 5,
  /** Ve etkin örneklem en az bu (tek dev kreatif grubu taşımasın). */
  enAzEtkinOrneklem: 3,
  /** %95 güven aralığı. */
  guvenZ: 1.96,
} as const;

export interface GrupOzeti {
  /** Harcama ağırlıklı ortalama, verim ölçeğinde. */
  ortalama: number;
  kreatif: number;
  /** `(Σw)² / Σw²`. Ekranda "40 kreatif (etkin 12)". */
  etkinOrneklem: number;
  standartHata: number;
  harcamaMicros: bigint;
}

export interface AgirlikliDeger {
  deger: number;
  harcamaMicros: bigint;
}

export function grupOzeti(degerler: readonly AgirlikliDeger[]): GrupOzeti | null {
  const v = degerler.filter((d) => d.harcamaMicros > 0n && Number.isFinite(d.deger));
  if (v.length === 0) return null;
  const w = v.map((d) => Number(d.harcamaMicros) / 1e6);
  const sw = w.reduce((a, b) => a + b, 0);
  const sw2 = w.reduce((a, b) => a + b * b, 0);
  const ort = v.reduce((a, d, i) => a + w[i]! * d.deger, 0) / sw;
  const nEtkin = (sw * sw) / sw2;
  // Ağırlıklı varyans, etkin örneklemle yansızlaştırılmış. nEtkin ≤ 1 iken
  // yayılım tanımsız: standart hata sonsuz, karar `yetersiz`e düşer.
  const varyans = nEtkin > 1 ? (v.reduce((a, d, i) => a + w[i]! * (d.deger - ort) ** 2, 0) / sw) * (nEtkin / (nEtkin - 1)) : Infinity;
  return {
    ortalama: ort,
    kreatif: v.length,
    etkinOrneklem: nEtkin,
    standartHata: Math.sqrt(varyans / nEtkin),
    harcamaMicros: v.reduce((a, d) => a + d.harcamaMicros, 0n),
  };
}

export const FARK_KARARLARI = ['yetersiz', 'belirsiz', 'anlamli'] as const;
export type FarkKarari = (typeof FARK_KARARLARI)[number];

export interface EtiketFarki {
  karar: FarkKarari;
  /** `yetersiz` ise hangi koşul tutmadı (ekranda aynen). */
  yetersizNedeni: string | null;
  a: GrupOzeti | null;
  b: GrupOzeti | null;
  /** (A − B) / B, verim ölçeğinde: +0,20 = A %20 daha iyi. `yetersiz`de null. */
  goreliFark: number | null;
  /** Göreli farkın %95 aralığı. ÖRNEKLEM VE ARALIK HER ZAMAN BİRLİKTE. */
  aralik: [number, number] | null;
}

/**
 * A grubu (ör. "insan var") B grubuna (ör. "insan yok") karşı.
 *
 * Göreli aralık, farkın aralığının B ortalamasına bölünmesi: B'nin kendi
 * belirsizliğini yok sayan bir yaklaşım ve bilerek seçildi (sade,
 * açıklanabilir). Aralık bu yüzden biraz DAR çıkar; `enAzKreatif` ve
 * `enAzEtkinOrneklem` o daralmayı küçük örneklemde engellemek için var.
 */
export function etiketKarsilastir(a: readonly AgirlikliDeger[], b: readonly AgirlikliDeger[]): EtiketFarki {
  const ga = grupOzeti(a);
  const gb = grupOzeti(b);
  const yetersiz = (neden: string): EtiketFarki => ({ karar: 'yetersiz', yetersizNedeni: neden, a: ga, b: gb, goreliFark: null, aralik: null });
  if (!ga || !gb) return yetersiz('gruplardan biri boş');
  if (ga.kreatif < ISTATISTIK.enAzKreatif || gb.kreatif < ISTATISTIK.enAzKreatif) {
    return yetersiz(`her grupta en az ${ISTATISTIK.enAzKreatif} kreatif gerekiyor (${ga.kreatif} ve ${gb.kreatif})`);
  }
  if (ga.etkinOrneklem < ISTATISTIK.enAzEtkinOrneklem || gb.etkinOrneklem < ISTATISTIK.enAzEtkinOrneklem) {
    return yetersiz('harcama birkaç kreatifte toplanmış');
  }
  if (!(gb.ortalama > 0)) return yetersiz('karşılaştırılan grubun değeri sıfır');
  const fark = ga.ortalama - gb.ortalama;
  const se = Math.sqrt(ga.standartHata ** 2 + gb.standartHata ** 2);
  if (!Number.isFinite(se)) return yetersiz('yayılım hesaplanamadı');
  const alt = (fark - ISTATISTIK.guvenZ * se) / gb.ortalama;
  const ust = (fark + ISTATISTIK.guvenZ * se) / gb.ortalama;
  return {
    karar: alt > 0 || ust < 0 ? 'anlamli' : 'belirsiz',
    yetersizNedeni: null,
    a: ga,
    b: gb,
    goreliFark: fark / gb.ortalama,
    aralik: [alt, ust],
  };
}
