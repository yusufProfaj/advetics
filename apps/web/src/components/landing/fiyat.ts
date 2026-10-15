import { sec, type Dil } from '@advetics/shared';
import { fiyatSozlugu } from '@/dil/sozlukler/fiyat';
import { talepAdresi } from './iletisim';

/**
 * ═══ FİYAT: VERİ VE HESAP TEK YERDE ═══
 *
 * Kullanıcı kararı (2026-10-14): Küçük İşletme $49, Şirket $149, Ajans
 * $299'dan (10 workspace dahil; 11-50 arası her ek workspace $19, 51'den
 * sonrası her biri $12). Yıllık ödemede %20 indirim. Küçük İşletme ve
 * Şirket'te 14 günlük ücretsiz deneme, Ajans "Teklif al". Fiyat USD ve KDV
 * hariç, ödeme günün kuruyla TL. Harcama yüzdesi ya da harcama bandı YOK.
 *
 * Neden tek dosya: aynı rakam paket kartında, ajans kırılımında,
 * karşılaştırma tablosunda ve sık sorulanlarda görünüyor. Panelde "10 MB"
 * elle yazılıp sınır 20 MB olunca ekranın YANLIŞ sayıyı söylediği görüldü
 * (CLAUDE.md, "KULLANICIYA GÖSTERİLEN SINIR SABİTTEN TÜREMELİ"); burada da
 * kademe sınırı ya da indirim değişirse dört yer birlikte değişmeli.
 *
 * TUTARLAR SENT CİNSİNDEN TAM SAYI. Yıllık indirim $49'u $39,20 yapıyor;
 * kayan noktayla kırılımın satırları toplamı tutmayabilirdi ve ekranda
 * toplamı tutmayan bir kırılım, yanlış fiyat göstermekle aynı şey.
 */

export type Donem = 'ay' | 'yil';
export type PaketKodu = 'kucuk-isletme' | 'sirket' | 'ajans';

export const YILLIK_INDIRIM_YUZDE = 20;
export const DENEME_GUN = 14;
/** Küçük İşletme paketinde Akıllı Boost'un aylık öneri sınırı. */
export const AKILLI_BOOST_AYLIK_ONERI = 10;

/**
 * Ajans kademesi. `enCokWorkspace` yalnız kaydırıcının üst ucu: daha büyük
 * ajans "Teklif al" ile yazıyor, fiyat formülü yine aynı.
 */
export const AJANS = {
  tabanSent: 29_900,
  dahilWorkspace: 10,
  /** Bu sayıya KADAR (dahil) ek workspace birinci kademeden ücretleniyor. */
  kademeUst: 50,
  kademeBirSent: 1_900,
  kademeIkiSent: 1_200,
  enCokWorkspace: 100,
} as const;

export interface Sinirlar {
  workspace: number;
  /** `null` = sınırsız. */
  reklamHesabi: number | null;
  kullanici: number | null;
}

export interface Paket {
  kod: PaketKodu;
  ad: string;
  kim: string;
  /** Aylık fiyat (sent). Ajans için TABAN fiyat. */
  aylikSent: number;
  /** "En çok seçilen" rozeti. Yalnız bir paket taşır. */
  one?: boolean;
  /** Deneme yalnız Küçük İşletme ve Şirket'te; ajans teklifle. */
  eylem: 'deneme' | 'teklif';
  sinir: Sinirlar;
  ozellikler: string[];
  yok: string[];
}

/**
 * PAKETLER: rakam ve sınır BURADA, metin sözlükte (`dil/sozlukler/fiyat.ts`,
 * iki dil). `PAKETLER` Türkçe metinli liste (testler ve eski çağıranlar);
 * ekran `paketler(dil)` okur.
 */
const PAKET_RAKAMLARI: Omit<Paket, 'ad' | 'kim' | 'ozellikler' | 'yok'>[] = [
  { kod: 'kucuk-isletme', aylikSent: 4_900, eylem: 'deneme', sinir: { workspace: 1, reklamHesabi: 2, kullanici: 2 } },
  { kod: 'sirket', aylikSent: 14_900, one: true, eylem: 'deneme', sinir: { workspace: 5, reklamHesabi: 10, kullanici: 10 } },
  {
    kod: 'ajans',
    aylikSent: AJANS.tabanSent,
    eylem: 'teklif',
    sinir: { workspace: AJANS.dahilWorkspace, reklamHesabi: null, kullanici: null },
  },
];

export function paketler(dil: Dil = 'tr'): Paket[] {
  const d = sec(fiyatSozlugu, dil);
  return PAKET_RAKAMLARI.map((r) => {
    const m = d.paket[r.kod];
    return {
      ...r,
      ad: m.ad,
      kim: m.kim,
      // `{n}` yalnız Akıllı Boost satırında: aylık öneri sayısı rakamın evinden.
      ozellikler: m.ozellikler.map((o) => o.replace('{n}', String(AKILLI_BOOST_AYLIK_ONERI))),
      yok: 'yok' in m ? [...m.yok] : [],
    };
  });
}

export const PAKETLER: Paket[] = paketler('tr');

export function paketBul(kod: PaketKodu, dil: Dil = 'tr'): Paket {
  const p = paketler(dil).find((x) => x.kod === kod);
  if (!p) throw new Error(`Bilinmeyen paket: ${kod}`);
  return p;
}

/** Dönem fiyatı: yıllıkta indirimli AYLIK karşılık (kartta "/ ay" ile yazılıyor). */
export function donemFiyatiSent(aylikSent: number, donem: Donem): number {
  return donem === 'yil' ? Math.round((aylikSent * (100 - YILLIK_INDIRIM_YUZDE)) / 100) : aylikSent;
}

export interface AjansKirilimi {
  workspace: number;
  tabanSent: number;
  /** 11-50 arası ek workspace. */
  kademeBir: { adet: number; birimSent: number; tutarSent: number };
  /** 51 ve sonrası. */
  kademeIki: { adet: number; birimSent: number; tutarSent: number };
  toplamSent: number;
}

/**
 * Ajansın aylık fiyatının kırılımı. Dahil sayının ALTINDA kalan ajans taban
 * fiyatı öder (sıfır ya da eksi ek ücret yok). Yıllıkta HER SATIR ayrı ayrı
 * indiriliyor ve toplam satırlardan toplanıyor: toplamı ayrı indirmek,
 * kuruş yuvarlamasında kırılımla toplamın ayrışması demekti.
 */
export function ajansKirilimi(workspace: number, donem: Donem = 'ay'): AjansKirilimi {
  const ws = Math.max(0, Math.floor(workspace));
  const birAdet = Math.max(0, Math.min(ws, AJANS.kademeUst) - AJANS.dahilWorkspace);
  const ikiAdet = Math.max(0, ws - AJANS.kademeUst);
  const taban = donemFiyatiSent(AJANS.tabanSent, donem);
  const birBirim = donemFiyatiSent(AJANS.kademeBirSent, donem);
  const ikiBirim = donemFiyatiSent(AJANS.kademeIkiSent, donem);
  const kademeBir = { adet: birAdet, birimSent: birBirim, tutarSent: birAdet * birBirim };
  const kademeIki = { adet: ikiAdet, birimSent: ikiBirim, tutarSent: ikiAdet * ikiBirim };
  return {
    workspace: ws,
    tabanSent: taban,
    kademeBir,
    kademeIki,
    toplamSent: taban + kademeBir.tutarSent + kademeIki.tutarSent,
  };
}

/** Ajansın aylık fiyatı (sent). */
export function ajansFiyatiSent(workspace: number, donem: Donem = 'ay'): number {
  return ajansKirilimi(workspace, donem).toplamSent;
}

/**
 * Dolar biçimi. Tam dolar kuruşsuz ($49), kesirli tutar iki basamaklı
 * ($39.20). Hepsini yuvarlamak yıllıkta $39 yazdırır ve kırılımdaki
 * satırların toplamı karttaki rakamı tutmaz.
 */
export function usd(sent: number): string {
  const tam = sent % 100 === 0;
  return (
    '$' +
    (sent / 100).toLocaleString('en-US', {
      minimumFractionDigits: tam ? 0 : 2,
      maximumFractionDigits: tam ? 0 : 2,
    })
  );
}

/** Kartın altındaki sınır satırı. Rakamlar paketin kendi sınırından. */
export function sinirMetni(p: Paket, dil: Dil = 'tr'): string {
  const d = sec(fiyatSozlugu, dil);
  if (p.kod === 'ajans') return d.ajansSiniri(p.sinir.workspace);
  const parca = (n: number | null, ad: string) => (n === null ? d.sinirsiz(ad) : `${n} ${ad}`);
  return [
    parca(p.sinir.workspace, d.birimWorkspace),
    parca(p.sinir.reklamHesabi, d.birimReklamHesabi),
    parca(p.sinir.kullanici, d.birimKullanici),
  ].join(' · ');
}

export function ajansKademeMetni(donem: Donem, dil: Dil = 'tr'): string {
  const ilk = AJANS.dahilWorkspace + 1;
  return sec(fiyatSozlugu, dil).ekWorkspace(
    `${ilk}-${AJANS.kademeUst}`,
    usd(donemFiyatiSent(AJANS.kademeBirSent, donem)),
    `${AJANS.kademeUst + 1}+`,
    usd(donemFiyatiSent(AJANS.kademeIkiSent, donem)),
  );
}

export function eylemMetni(p: Paket, dil: Dil = 'tr'): string {
  const d = sec(fiyatSozlugu, dil);
  return p.eylem === 'teklif' ? d.teklifAl : d.ucretsizDene(DENEME_GUN);
}

export function paketTalepAdresi(p: Paket, secim: { donem: Donem; workspace?: number }, dil: Dil = 'tr'): string {
  const d = sec(fiyatSozlugu, dil);
  const donemAdi = secim.donem === 'yil' ? d.donemYillik : d.donemAylik;
  if (p.eylem === 'teklif') {
    const ws = secim.workspace ?? AJANS.dahilWorkspace;
    return talepAdresi(d.teklifKonu(p.ad), d.teklifGovde(p.ad, ws, donemAdi));
  }
  return talepAdresi(d.denemeKonu(p.ad, DENEME_GUN), d.denemeGovde(p.ad, DENEME_GUN, donemAdi));
}

export type Hucre = boolean | string;

export function karsilastirmaSatirlari(dil: Dil = 'tr'): { ad: string; degerler: Hucre[] }[] {
  const t = sec(fiyatSozlugu, dil).tablo;
  const liste = paketler(dil);
  const sinirHucresi = (n: number | null) => (n === null ? t.sinirsizHucre : String(n));
  return [
    {
      ad: 'Workspace',
      degerler: liste.map((p) => (p.kod === 'ajans' ? t.ek(p.sinir.workspace) : sinirHucresi(p.sinir.workspace))),
    },
    { ad: t.reklamHesabi, degerler: liste.map((p) => sinirHucresi(p.sinir.reklamHesabi)) },
    { ad: t.kullanici, degerler: liste.map((p) => sinirHucresi(p.sinir.kullanici)) },
    { ad: t.tekPanel, degerler: [true, true, true] },
    { ad: t.advCampaign, degerler: [true, true, true] },
    { ad: t.akilliBoost, degerler: [t.ayda(AKILLI_BOOST_AYLIK_ONERI), t.sinirsizHucre, t.sinirsizHucre] },
    { ad: 'AdvStrategy', degerler: [false, true, true] },
    { ad: t.kurallar, degerler: [false, true, true] },
    { ad: t.planliRapor, degerler: [false, true, true] },
    { ad: t.asistan, degerler: [false, true, true] },
    { ad: t.beyazEtiket, degerler: [false, false, true] },
    { ad: t.saltOkunur, degerler: [false, false, true] },
  ];
}
