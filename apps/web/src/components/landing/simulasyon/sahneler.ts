import { DILLER, sec, type Dil } from '@advetics/shared';

import { simulasyonSozlugu, type SimulasyonMetni } from '@/dil/sozlukler/simulasyon';
import type { Sahne } from './motor';

/**
 * ═══ SAHNELERİN SENARYOSU ═══
 *
 * Her sahnenin başlangıç durumu ve adımları. Sıra ve süreler onaylı
 * taslaktan (`docs/site/taslak.html`, `sahneler` nesnesi) birebir. React'siz
 * düz veri: `simulasyon.spec.ts` her sahneyi `zamanCizelgesi` ile çalıştırıp
 * son hâlini sınıyor.
 *
 * SAHNE İÇİNDEKİ RAKAMLAR VE ADLAR ÖRNEKTİR (Ege Yapı, 48.250 TL).
 * Sayfada "Ekrandaki rakamlar örnektir." notu duruyor; gerçek bir müşteri
 * verisi gibi okunmamalı (`site-icerik.ts`, yazım kuralları).
 *
 * İKİ DİL: yazılan metin (bütçe, bölge, eşik, asistan cevabı) ve düğme
 * etiketleri DURUMUN içinde, yani sahne dile göre ayrı kuruluyor
 * (`sahneKur`). İki dilin sahnesi BİR KEZ, modül yüklenirken kuruluyor
 * (`SAHNELER`): oynatıcı kareleri sahnenin KİMLİĞİNE göre önbelleğe alıyor
 * (`useMemo([sahne])`) ve her çizimde yeni nesne vermek her çizimde
 * zaman çizelgesini yeniden kurup oynatmayı baştan başlatırdı. Adım listesi
 * ve süreler dilden BAĞIMSIZ; `simulasyon.spec.ts` iki dilin aynı adım
 * sayısını taşıdığını kilitliyor.
 */

export interface HeroDurumu {
  sayac: boolean;
  cubuk: boolean;
  oneri: boolean;
  onaylandi: boolean;
  bildirim: boolean;
}

const HERO: Sahne<HeroDurumu> = {
  ilk: { sayac: false, cubuk: false, oneri: false, onaylandi: false, bildirim: false },
  adimlar: [
    { degis: { sayac: true, cubuk: true } },
    { bekle: 1560, degis: { oneri: true } },
    { bekle: 1200, fare: 'onayla' },
    { degis: { onaylandi: true } },
    { bekle: 300, degis: { bildirim: true } },
  ],
};

/**
 * Sekme KİMLİK, etiket değil: imleç hedefi ve süzgeç kimlikle çalışıyor,
 * ekrandaki "Tümü"/"All" bileşende sözlükten. Etiketi kimlik yapmak
 * İngilizcede süzgeci kırardı (satırın platformu "All" olamaz).
 */
export type TabloSekmesi = 'tumu' | 'Meta' | 'Google' | 'LinkedIn';
export const TABLO_SEKMELERI: TabloSekmesi[] = ['tumu', 'Meta', 'Google', 'LinkedIn'];

export interface TabloDurumu {
  sekme: TabloSekmesi;
}

const TABLO: Sahne<TabloDurumu> = {
  ilk: { sekme: 'tumu' },
  adimlar: [
    { bekle: 1600, fare: 'Meta' },
    { degis: { sekme: 'Meta' } },
    { bekle: 1800, fare: 'Google' },
    { degis: { sekme: 'Google' } },
    { bekle: 1800, fare: 'tumu' },
    { degis: { sekme: 'tumu' } },
  ],
};

export interface KurmaDurumu {
  amac: boolean;
  butce: string;
  bolge: string;
  hazir: boolean;
  dugme: string;
  /** Sözlükteki taslak / önizleme / kuruldu etiketi. */
  durum: string;
  telefon: boolean;
  bildirim: boolean;
}

const kurma = (m: SimulasyonMetni): Sahne<KurmaDurumu> => ({
  ilk: {
    amac: false,
    butce: '',
    bolge: '',
    hazir: false,
    dugme: m.kurma.dugmeHazirla,
    durum: m.kurma.durumTaslak,
    telefon: false,
    bildirim: false,
  },
  adimlar: [
    { fare: 'amac', degis: { amac: true } },
    { bekle: 300, fare: 'butce', yaz: { alan: 'butce', metin: m.para(300) } },
    { fare: 'bolge', yaz: { alan: 'bolge', metin: m.ornek.bolge }, degis: { hazir: true } },
    { bekle: 300, fare: 'kur', degis: { dugme: m.kurma.dugmeHazirlaniyor } },
    { bekle: 900, degis: { telefon: true, dugme: m.kurma.dugmeKur, durum: m.kurma.durumOnizleme } },
    { bekle: 1300, fare: 'kur', degis: { durum: m.kurma.durumKuruldu, bildirim: true } },
  ],
});

export interface PlanDurumu {
  kaydir: boolean;
  adim: number;
  dagilim: boolean;
  gonderildi: boolean;
  bildirim: boolean;
}

/** Plan sahnesinde bütçe kaydırıcısı (₺): başlangıç, varılan değer, adım ve kaydırıcının üst ucu. */
export const PLAN_BUTCE = { baslangic: 20_000, hedef: 60_000, adim: 1_000, ust: 100_000 } as const;

const PLAN: Sahne<PlanDurumu> = {
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

const boost = (m: SimulasyonMetni): Sahne<BoostDurumu> => ({
  ilk: { gonderi: false, bildirim: false, kart: false, dugme: m.boost.dugme, yayinda: false },
  adimlar: [
    { bekle: 300, degis: { gonderi: true } },
    { bekle: 700, degis: { bildirim: true } },
    { bekle: 1300, degis: { bildirim: false, kart: true } },
    { bekle: 1200, fare: 'boost', degis: { dugme: m.boost.dugmeKuruluyor } },
    { bekle: 900, degis: { dugme: m.boost.dugmeBitti, yayinda: true } },
  ],
});

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

const kural = (m: SimulasyonMetni): Sahne<KuralDurumu> => ({
  ilk: {
    kosul: false,
    karsilastirma: false,
    esik: '',
    eylem: false,
    acik: false,
    cpa: m.para(231),
    durduruldu: false,
    bildirim: false,
  },
  adimlar: [
    { fare: 'kosul', degis: { kosul: true } },
    { fare: 'karsilastirma', degis: { karsilastirma: true } },
    { fare: 'esik', yaz: { alan: 'esik', metin: m.para(250) } },
    { fare: 'eylem', degis: { eylem: true } },
    { fare: 'kaydet', degis: { acik: true } },
    { bekle: 1100, degis: { cpa: m.para(268) } },
    { bekle: 800, degis: { durduruldu: true, bildirim: true } },
  ],
});

export interface RaporDurumu {
  /** PDF'te görünen satır sayısı (0..5). */
  satir: number;
  mail: boolean;
  bildirim: boolean;
}

export const RAPOR_SATIRI = 5;

const RAPOR: Sahne<RaporDurumu> = {
  ilk: { satir: 0, mail: false, bildirim: false },
  adimlar: [
    ...Array.from({ length: RAPOR_SATIRI }, (_, i) => ({ bekle: i === 0 ? 0 : 420, degis: { satir: i + 1 } })),
    { bekle: 420 + 400, degis: { mail: true } },
    { bekle: 1500, degis: { bildirim: true } },
  ],
};

/**
 * Kurulum listesi. "Meta Pixel" iki dilde aynı ürün adı: sözlük yaprağı
 * olsa sözlük bekçisi onu "çevrilmemiş" sayardı, o yüzden burada sabit.
 */
export function olcumListesi(m: SimulasyonMetni): string[] {
  const o = m.olcum;
  return [o.metaHesap, o.googleHesap, o.sayfa, o.marka, o.alicilar, o.kategori, 'Meta Pixel', o.tagManager, o.ga4, o.googleDonusum];
}
/** Sahne başında tamamlanmış adım sayısı. */
export const OLCUM_BASLANGIC = 6;

export interface OlcumDurumu {
  tamam: number;
  /** Kurulmakta olan satırın sırası; `null` = hiçbiri. */
  calisan: number | null;
  dugme: string;
}

const olcum = (m: SimulasyonMetni): Sahne<OlcumDurumu> => ({
  ilk: { tamam: OLCUM_BASLANGIC, calisan: null, dugme: m.olcum.dugme },
  adimlar: [
    { bekle: 600, fare: 'tamamla', degis: { dugme: m.olcum.dugmeKuruluyor, calisan: OLCUM_BASLANGIC } },
    ...olcumListesi(m).slice(OLCUM_BASLANGIC).map((_, i, eksik) => {
      const sira = OLCUM_BASLANGIC + i;
      const sonuncu = i === eksik.length - 1;
      return {
        bekle: 800,
        degis: sonuncu
          ? { tamam: sira + 1, calisan: null, dugme: m.olcum.dugmeBitti }
          : { tamam: sira + 1, calisan: sira + 1 },
      };
    }),
  ],
});

export interface AsistanDurumu {
  soru: boolean;
  cevapKutusu: boolean;
  cevap: string;
  rakamlar: boolean;
  oneriler: boolean;
}

const asistan = (m: SimulasyonMetni): Sahne<AsistanDurumu> => ({
  ilk: { soru: false, cevapKutusu: false, cevap: '', rakamlar: false, oneriler: false },
  adimlar: [
    { bekle: 300, degis: { soru: true } },
    { bekle: 900, degis: { cevapKutusu: true } },
    { yaz: { alan: 'cevap', metin: m.asistan.cevap, hiz: 18 }, degis: { rakamlar: true } },
    { bekle: 900, degis: { oneriler: true } },
  ],
});

/** Bir dilin bütün sahneleri. Metin taşımayan sahneler iki dilde AYNI nesne. */
export function sahneKur(m: SimulasyonMetni) {
  return {
    HERO,
    TABLO,
    KURMA: kurma(m),
    PLAN,
    BOOST: boost(m),
    KURAL: kural(m),
    RAPOR,
    OLCUM: olcum(m),
    ASISTAN: asistan(m),
  };
}

export type DilinSahneleri = ReturnType<typeof sahneKur>;

/** İki dilin sahneleri, modül yüklenirken BİR KEZ (kimlik kararlı; yukarıya bkz.). */
export const SAHNELER = Object.fromEntries(
  DILLER.map((dil) => [dil, sahneKur(sec(simulasyonSozlugu, dil))]),
) as Record<Dil, DilinSahneleri>;
