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

export const PAKETLER: Paket[] = [
  {
    kod: 'kucuk-isletme',
    ad: 'Küçük İşletme',
    kim: 'Kendi reklamını yöneten tek işletme.',
    aylikSent: 4_900,
    eylem: 'deneme',
    sinir: { workspace: 1, reklamHesabi: 2, kullanici: 2 },
    ozellikler: [
      'Tek panel: Meta, Google, LinkedIn',
      'AdvCampaign ile reklam kurma',
      `Akıllı Boost (ayda ${AKILLI_BOOST_AYLIK_ONERI} öneri)`,
      'Aylık PDF rapor',
      'Ölçüm kurulum sihirbazı',
    ],
    yok: ['Kurallar ile otomatik iyileştirme', 'Beyaz etiketli rapor'],
  },
  {
    kod: 'sirket',
    ad: 'Şirket',
    kim: 'Birden çok projesi ve pazarlama ekibi olan şirket.',
    aylikSent: 14_900,
    one: true,
    eylem: 'deneme',
    sinir: { workspace: 5, reklamHesabi: 10, kullanici: 10 },
    ozellikler: [
      "Küçük İşletme'nin tamamı",
      'AdvStrategy strateji raporu ve onay',
      'Kurallar ile otomatik iyileştirme',
      'Sınırsız Akıllı Boost',
      'Planlı rapor + fatura maili',
      'Yapay zekâ asistanı',
    ],
    yok: ['Beyaz etiketli rapor'],
  },
  {
    kod: 'ajans',
    ad: 'Ajans',
    kim: "Müşterilerini Advetics'ten yöneten ajans.",
    aylikSent: AJANS.tabanSent,
    eylem: 'teklif',
    sinir: { workspace: AJANS.dahilWorkspace, reklamHesabi: null, kullanici: null },
    ozellikler: [
      'Şirket paketinin tamamı',
      'Müşteri başına workspace',
      'Beyaz etiketli rapor ve mail',
      'Müşteriye salt okunur panel',
      'Ajans havuzu: hesap atama',
      'Öncelikli destek',
    ],
    yok: [],
  },
];

export function paketBul(kod: PaketKodu): Paket {
  const p = PAKETLER.find((x) => x.kod === kod);
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
export function sinirMetni(p: Paket): string {
  if (p.kod === 'ajans') return `Taban ${p.sinir.workspace} workspace · sınırsız kullanıcı`;
  const parca = (n: number | null, ad: string) => (n === null ? `sınırsız ${ad}` : `${n} ${ad}`);
  return [
    parca(p.sinir.workspace, 'workspace'),
    parca(p.sinir.reklamHesabi, 'reklam hesabı'),
    parca(p.sinir.kullanici, 'kullanıcı'),
  ].join(' · ');
}

/** Ajans kırılımının açıklama satırı: "Ek workspace (11-50: $19, 51+: $12)". */
export function ajansKademeMetni(donem: Donem): string {
  const ilk = AJANS.dahilWorkspace + 1;
  return (
    `Ek workspace (${ilk}-${AJANS.kademeUst}: ${usd(donemFiyatiSent(AJANS.kademeBirSent, donem))}, ` +
    `${AJANS.kademeUst + 1}+: ${usd(donemFiyatiSent(AJANS.kademeIkiSent, donem))})`
  );
}

export function eylemMetni(p: Paket): string {
  return p.eylem === 'teklif' ? 'Teklif al' : `${DENEME_GUN} gün ücretsiz dene`;
}

/**
 * Paket düğmesinin e-posta adresi. Konuda paketin adı; ajansta seçilen
 * workspace sayısı ve dönem gövdede (bkz. `iletisim.ts`).
 */
export function paketTalepAdresi(p: Paket, secim: { donem: Donem; workspace?: number }): string {
  const donemAdi = secim.donem === 'yil' ? 'Yıllık' : 'Aylık';
  if (p.eylem === 'teklif') {
    const ws = secim.workspace ?? AJANS.dahilWorkspace;
    return talepAdresi(
      `Advetics ${p.ad} paketi teklif talebi`,
      'Merhaba,\n\n' +
        `Advetics ${p.ad} paketi için teklif istiyoruz.\n\n` +
        `Yaklaşık workspace (müşteri) sayısı: ${ws}\n` +
        `Ödeme dönemi: ${donemAdi}\n` +
        'Ajans adı:\n' +
        'Reklam verdiğimiz yerler (Meta, Google, LinkedIn):\n',
    );
  }
  return talepAdresi(
    `Advetics ${p.ad} paketi ${DENEME_GUN} günlük ücretsiz deneme`,
    'Merhaba,\n\n' +
      `Advetics ${p.ad} paketini ${DENEME_GUN} gün ücretsiz denemek istiyorum.\n\n` +
      `Ödeme dönemi: ${donemAdi}\n` +
      'Şirket adı:\n' +
      'Reklam verdiğimiz yerler (Meta, Google, LinkedIn):\n',
  );
}

/**
 * Karşılaştırma tablosu. Sınır satırları paketlerin KENDİ sınırından
 * türüyor; özellik satırları paket listesiyle aynı sırayla (Küçük İşletme,
 * Şirket, Ajans). `true` = var, `false` = yok, dize = ayrıntı.
 */
export type Hucre = boolean | string;

export function karsilastirmaSatirlari(): { ad: string; degerler: Hucre[] }[] {
  const sinirHucresi = (n: number | null) => (n === null ? 'Sınırsız' : String(n));
  return [
    {
      ad: 'Workspace',
      degerler: PAKETLER.map((p) =>
        p.kod === 'ajans' ? `${p.sinir.workspace} + ek` : sinirHucresi(p.sinir.workspace),
      ),
    },
    { ad: 'Reklam hesabı', degerler: PAKETLER.map((p) => sinirHucresi(p.sinir.reklamHesabi)) },
    { ad: 'Kullanıcı', degerler: PAKETLER.map((p) => sinirHucresi(p.sinir.kullanici)) },
    { ad: 'Tek panel (Meta, Google, LinkedIn)', degerler: [true, true, true] },
    { ad: 'AdvCampaign reklam kurma', degerler: [true, true, true] },
    { ad: 'Akıllı Boost', degerler: [`Ayda ${AKILLI_BOOST_AYLIK_ONERI}`, 'Sınırsız', 'Sınırsız'] },
    { ad: 'AdvStrategy', degerler: [false, true, true] },
    { ad: 'Kurallar', degerler: [false, true, true] },
    { ad: 'Planlı rapor maili', degerler: [false, true, true] },
    { ad: 'Yapay zekâ asistanı', degerler: [false, true, true] },
    { ad: 'Beyaz etiket', degerler: [false, false, true] },
    { ad: 'Müşteriye salt okunur panel', degerler: [false, false, true] },
  ];
}
