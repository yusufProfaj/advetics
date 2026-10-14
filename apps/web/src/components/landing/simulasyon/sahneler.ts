import type { Sahne } from './motor';

/**
 * ═══ SAHNELERİN SENARYOSU ═══
 *
 * Her sahnenin başlangıç durumu ve adımları. Sıra ve süreler onaylı
 * taslaktan (`docs/site/taslak.html`, `sahneler` nesnesi) birebir. React'siz
 * düz veri: `simulasyon.spec.ts` her sahneyi `zamanCizelgesi` ile çalıştırıp
 * son hâlini sınıyor.
 *
 * SAHNE İÇİNDEKİ RAKAMLAR VE ADLAR ÖRNEKTİR ("Ege Yapı", "48.250 ₺").
 * Sayfada "Ekrandaki rakamlar örnektir." notu duruyor; gerçek bir müşteri
 * verisi gibi okunmamalı (`site-icerik.ts`, yazım kuralları).
 */

export interface HeroDurumu {
  sayac: boolean;
  cubuk: boolean;
  oneri: boolean;
  onaylandi: boolean;
  bildirim: boolean;
}

export const HERO: Sahne<HeroDurumu> = {
  ilk: { sayac: false, cubuk: false, oneri: false, onaylandi: false, bildirim: false },
  adimlar: [
    { degis: { sayac: true, cubuk: true } },
    { bekle: 1560, degis: { oneri: true } },
    { bekle: 1200, fare: 'onayla' },
    { degis: { onaylandi: true } },
    { bekle: 300, degis: { bildirim: true } },
  ],
};

export type TabloSekmesi = 'Tümü' | 'Meta' | 'Google' | 'LinkedIn';
export const TABLO_SEKMELERI: TabloSekmesi[] = ['Tümü', 'Meta', 'Google', 'LinkedIn'];

export interface TabloDurumu {
  sekme: TabloSekmesi;
}

export const TABLO: Sahne<TabloDurumu> = {
  ilk: { sekme: 'Tümü' },
  adimlar: [
    { bekle: 1600, fare: 'Meta' },
    { degis: { sekme: 'Meta' } },
    { bekle: 1800, fare: 'Google' },
    { degis: { sekme: 'Google' } },
    { bekle: 1800, fare: 'Tümü' },
    { degis: { sekme: 'Tümü' } },
  ],
};

export interface KurmaDurumu {
  amac: boolean;
  butce: string;
  bolge: string;
  hazir: boolean;
  dugme: string;
  durum: 'Taslak' | 'Önizleme' | 'Kuruldu';
  telefon: boolean;
  bildirim: boolean;
}

export const KURMA: Sahne<KurmaDurumu> = {
  ilk: {
    amac: false,
    butce: '',
    bolge: '',
    hazir: false,
    dugme: 'Önizlemeyi hazırla',
    durum: 'Taslak',
    telefon: false,
    bildirim: false,
  },
  adimlar: [
    { fare: 'amac', degis: { amac: true } },
    { bekle: 300, fare: 'butce', yaz: { alan: 'butce', metin: '300 ₺' } },
    { fare: 'bolge', yaz: { alan: 'bolge', metin: 'İzmir, 30 km' }, degis: { hazir: true } },
    { bekle: 300, fare: 'kur', degis: { dugme: 'Hazırlanıyor…' } },
    { bekle: 900, degis: { telefon: true, dugme: 'Kur', durum: 'Önizleme' } },
    { bekle: 1300, fare: 'kur', degis: { durum: 'Kuruldu', bildirim: true } },
  ],
};

export interface PlanDurumu {
  kaydir: boolean;
  adim: number;
  dagilim: boolean;
  gonderildi: boolean;
  bildirim: boolean;
}

/** Plan sahnesinde bütçe kaydırıcısı (₺): başlangıç, varılan değer, adım ve kaydırıcının üst ucu. */
export const PLAN_BUTCE = { baslangic: 20_000, hedef: 60_000, adim: 1_000, ust: 100_000 } as const;

export const PLAN: Sahne<PlanDurumu> = {
  ilk: { kaydir: false, adim: 1, dagilim: false, gonderildi: false, bildirim: false },
  adimlar: [
    { fare: 'kaydir', tikla: false, degis: { kaydir: true } },
    { bekle: 1200 + 450, degis: { adim: 2 } },
    { bekle: 450, degis: { adim: 3 } },
    { bekle: 450, degis: { adim: 4, dagilim: true } },
    { bekle: 1600, fare: 'gonder', degis: { gonderildi: true } },
    { bekle: 1500, degis: { bildirim: true } },
  ],
};

export interface BoostDurumu {
  gonderi: boolean;
  bildirim: boolean;
  kart: boolean;
  dugme: string;
  yayinda: boolean;
}

export const BOOST: Sahne<BoostDurumu> = {
  ilk: { gonderi: false, bildirim: false, kart: false, dugme: 'Öne çıkar', yayinda: false },
  adimlar: [
    { bekle: 300, degis: { gonderi: true } },
    { bekle: 700, degis: { bildirim: true } },
    { bekle: 1300, degis: { bildirim: false, kart: true } },
    { bekle: 1200, fare: 'boost', degis: { dugme: 'Kuruluyor…' } },
    { bekle: 900, degis: { dugme: 'Öne çıkarıldı ✓', yayinda: true } },
  ],
};

export interface KuralDurumu {
  kosul: boolean;
  karsilastirma: boolean;
  esik: string;
  eylem: boolean;
  acik: boolean;
  cpa: string;
  durduruldu: boolean;
  bildirim: boolean;
}

export const KURAL: Sahne<KuralDurumu> = {
  ilk: {
    kosul: false,
    karsilastirma: false,
    esik: '',
    eylem: false,
    acik: false,
    cpa: '231 ₺',
    durduruldu: false,
    bildirim: false,
  },
  adimlar: [
    { fare: 'kosul', degis: { kosul: true } },
    { fare: 'karsilastirma', degis: { karsilastirma: true } },
    { fare: 'esik', yaz: { alan: 'esik', metin: '250 ₺' } },
    { fare: 'eylem', degis: { eylem: true } },
    { fare: 'kaydet', degis: { acik: true } },
    { bekle: 1100, degis: { cpa: '268 ₺' } },
    { bekle: 800, degis: { durduruldu: true, bildirim: true } },
  ],
};

export interface RaporDurumu {
  /** PDF'te görünen satır sayısı (0..5). */
  satir: number;
  mail: boolean;
  bildirim: boolean;
}

export const RAPOR_SATIRI = 5;

export const RAPOR: Sahne<RaporDurumu> = {
  ilk: { satir: 0, mail: false, bildirim: false },
  adimlar: [
    ...Array.from({ length: RAPOR_SATIRI }, (_, i) => ({ bekle: i === 0 ? 0 : 420, degis: { satir: i + 1 } })),
    { bekle: 420 + 400, degis: { mail: true } },
    { bekle: 1500, degis: { bildirim: true } },
  ],
};

export const OLCUM_LISTESI: string[] = [
  'Meta reklam hesabı atandı',
  'Google Ads hesabı atandı',
  'Facebook sayfası ve Instagram',
  'Marka bilgileri',
  'Rapor alıcıları',
  'Özel reklam kategorisi',
  'Meta Pixel',
  'Tag Manager konteyneri',
  'GA4 mülkü',
  'Google Ads dönüşümü',
];
/** Sahne başında tamamlanmış adım sayısı. */
export const OLCUM_BASLANGIC = 6;

export interface OlcumDurumu {
  tamam: number;
  /** Kurulmakta olan satırın sırası; `null` = hiçbiri. */
  calisan: number | null;
  dugme: string;
}

export const OLCUM: Sahne<OlcumDurumu> = {
  ilk: { tamam: OLCUM_BASLANGIC, calisan: null, dugme: 'Eksikleri tamamla' },
  adimlar: [
    { bekle: 600, fare: 'tamamla', degis: { dugme: 'Kuruluyor…', calisan: OLCUM_BASLANGIC } },
    ...OLCUM_LISTESI.slice(OLCUM_BASLANGIC).map((_, i, eksik) => {
      const sira = OLCUM_BASLANGIC + i;
      const sonuncu = i === eksik.length - 1;
      return {
        bekle: 800,
        degis: sonuncu
          ? { tamam: sira + 1, calisan: null, dugme: 'Hepsi tamam ✓' }
          : { tamam: sira + 1, calisan: sira + 1 },
      };
    }),
  ],
};

export interface AsistanDurumu {
  soru: boolean;
  cevapKutusu: boolean;
  cevap: string;
  rakamlar: boolean;
  oneriler: boolean;
}

export const ASISTAN_CEVABI =
  "Artışın tamamı tek reklam setinden geliyor. Manisa · geniş setinde form başı 154 ₺'den 268 ₺'ye çıktı; diğerleri düştü.";

export const ASISTAN: Sahne<AsistanDurumu> = {
  ilk: { soru: false, cevapKutusu: false, cevap: '', rakamlar: false, oneriler: false },
  adimlar: [
    { bekle: 300, degis: { soru: true } },
    { bekle: 900, degis: { cevapKutusu: true } },
    { yaz: { alan: 'cevap', metin: ASISTAN_CEVABI, hiz: 18 }, degis: { rakamlar: true } },
    { bekle: 900, degis: { oneriler: true } },
  ],
};
