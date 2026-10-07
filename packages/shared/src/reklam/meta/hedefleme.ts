/**
 * Yeni modülün TEK Meta hedefleme üreticisi (TASARIM.md § 7.1-7.4).
 *
 * İkinci üretici yasak: bu depoda üç tane vardı ve biri şehirle birlikte
 * ülkeyi de gönderiyordu — `geo_locations` kovaları BİRLEŞİM olduğu için
 * "Türkiye + İzmir" Türkiye geneli demek ve Meta hata vermiyor.
 *
 * `advantageAudience` VARSAYILANSIZ: yeni reklam 1, Akıllı Boost 0 geçirir.
 * Varsayılan koymak boost'u kimse fark etmeden otomatik kitleye geçirmenin
 * en kısa yolu (kullanıcı kararı: boost'un kuralları korunuyor).
 *
 * Konumun da varsayılanı YOK: boş konum gövde üretmez, retle durur. Eski
 * kodun "boşsa TR" yedeği bir kısıt değil tahmindi — İzmir'deki işletmenin
 * bütçesi Türkiye geneline harcanır ve hiçbir yer hata vermez.
 */

export const OZEL_KATEGORILER = [
  'HOUSING',
  'EMPLOYMENT',
  'FINANCIAL_PRODUCTS_SERVICES',
  'ISSUES_ELECTIONS_POLITICS',
] as const;
export type OzelKategori = (typeof OZEL_KATEGORILER)[number];

export const OZEL_KATEGORI_ETIKETLERI: Record<OzelKategori, string> = {
  HOUSING: 'Konut',
  EMPLOYMENT: 'İş ilanı',
  FINANCIAL_PRODUCTS_SERVICES: 'Kredi ya da finans ürünü',
  ISSUES_ELECTIONS_POLITICS: 'Siyasi ya da toplumsal konu',
};

/**
 * Etkin küme = müşteri kartı (taban) ∪ taslak (ek). Taban taslak başına
 * DÜŞÜRÜLEMEZ: Meta Türkiye'de beyanı zorunlu tutmuyor, tek bir yanlış
 * "Hayır" beyansız ve hatasız yayınlanan bir konut reklamı üretir. Fazla
 * kısıt görünür ve geri alınabilir; eksik kısıt görünmez.
 */
export function etkinKategoriler(taban: readonly OzelKategori[], ek: readonly OzelKategori[]): OzelKategori[] {
  return OZEL_KATEGORILER.filter((k) => taban.includes(k) || ek.includes(k));
}

/** Kısıtlı kategoriler: yaş, cinsiyet, ilgi ve yarıçap kuralı uygulanır. */
const KISITLI: readonly OzelKategori[] = ['HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES'];

/**
 * Nokta çevresinin en küçük yarıçapı. ABD ve Kanada'da Meta 25 km; geri
 * kalan her ülke 17 km — Türkiye'deki 17 km Meta'nın değil ADVETICS kuralı
 * (karar 4): Meta'nın sayfaları 15 km / 10 mil / 17 km diye çelişiyor ve
 * 17 hepsini karşılıyor.
 */
export const KONUT_YARICAP_TABANI_KM: Readonly<Record<string, number>> = { US: 25, CA: 25 };
export const VARSAYILAN_YARICAP_TABANI_KM = 17;

export type KonumTuru = 'country' | 'region' | 'city' | 'custom';

export interface HedefKonum {
  tur: KonumTuru;
  /** Ülkede iki harf, il/şehirde Meta'nın sayısal anahtarı; noktada boş. */
  key: string;
  etiket: string;
  /** Meta'nın döndürdüğü ülke kodu; noktada okunamamış olabilir. */
  ulkeKodu: string | null;
  yaricapKm?: number;
  enlem?: number;
  boylam?: number;
}

export interface HedeflemeGirdisi {
  konumlar: HedefKonum[];
  /** Kesin en düşük yaş, 18-25. */
  enDusukYas: number;
  /** Meta'ya ipucu; Advantage+ açıkken Meta dışına çıkabilir. */
  ipucuYas: { min: number; max: number } | null;
  ipucuCinsiyet: 'erkek' | 'kadin' | null;
  /** VARSAYILANSIZ — çağıran açıkça yazar. */
  advantageAudience: 0 | 1;
  kategoriler: readonly OzelKategori[];
}

export interface HedeflemeReti {
  kod: string;
  mesaj: string;
}

export type HedeflemeSonucu =
  | {
      tur: 'tamam';
      targeting: Record<string, unknown>;
      /** `special_ad_category_country` değeri; kategori yoksa yine hesaplanır. */
      ulkeler: string[];
      /** Gözden geçir Blok C: dayatılan daralmalar, adıyla. */
      kapatilanlar: string[];
    }
  | { tur: 'ret'; retler: HedeflemeReti[] };

/** Meta'nın enum'unda Birleşik Krallık GB; UK yok. */
function ulkeKoduNormallestir(k: string): string {
  const u = k.toUpperCase();
  return u === 'UK' ? 'GB' : u;
}

export function hedeflemeUret(g: HedeflemeGirdisi): HedeflemeSonucu {
  const retler: HedeflemeReti[] = [];
  const kapatilanlar: string[] = [];
  const kisitli = g.kategoriler.some((k) => KISITLI.includes(k));

  if (g.kategoriler.includes('ISSUES_ELECTIONS_POLITICS')) {
    retler.push({
      kod: 'OZK-SIYASI',
      mesaj:
        "Siyasi ve toplumsal konulu reklamlar Advetics'ten yayınlanamıyor. Meta bu reklamlar için ayrı kimlik doğrulaması ve 'ödeyen' beyanı istiyor.",
    });
  }
  // Konum ÜRETİCİYİ ÇAĞIRMADAN önce kontrol ediliyor: boş konumla gövde yok.
  if (g.konumlar.length === 0) retler.push({ kod: 'KNM-01', mesaj: 'Konum seçilmedi.' });
  if (!Number.isInteger(g.enDusukYas) || g.enDusukYas < 18 || g.enDusukYas > 25) {
    retler.push({
      kod: 'KTL-01',
      mesaj: "Meta'nın otomatik kitlesi açıkken en düşük yaş 18 ile 25 arasında kesin tutulabilir.",
    });
  }

  const ulkeKumesi = new Set<string>();
  for (const k of g.konumlar) {
    if (k.tur === 'country') ulkeKumesi.add(ulkeKoduNormallestir(k.key));
    else if (k.ulkeKodu) ulkeKumesi.add(ulkeKoduNormallestir(k.ulkeKodu));
    else if (g.kategoriler.length > 0) {
      retler.push({
        kod: 'OZK-04',
        mesaj: `"${k.etiket}" noktasının hangi ülkede olduğu Meta'dan okunamadı; özel kategorili reklamda ülke bilinmek zorunda.`,
      });
    }
  }
  const ulkeler = [...ulkeKumesi].sort();

  if (kisitli) {
    const taban = Math.max(
      VARSAYILAN_YARICAP_TABANI_KM,
      ...ulkeler.map((u) => KONUT_YARICAP_TABANI_KM[u] ?? VARSAYILAN_YARICAP_TABANI_KM),
    );
    for (const k of g.konumlar) {
      if ((k.tur === 'city' || k.tur === 'custom') && k.yaricapKm !== undefined && k.yaricapKm < taban) {
        retler.push({
          kod: 'OZK-06',
          mesaj: `"${k.etiket}": bu reklam türünde bir noktanın çevresi en az ${taban} km olmalı.`,
        });
      }
    }
  }
  for (const k of g.konumlar) {
    if (k.tur === 'custom' && (k.enlem === undefined || k.boylam === undefined || !k.yaricapKm)) {
      retler.push({ kod: 'KNM-02', mesaj: `"${k.etiket}": nokta için konum ve yarıçap gerekli.` });
    }
  }
  if (retler.length > 0) return { tur: 'ret', retler };

  const geo: Record<string, unknown> = {};
  const ekle = (kova: string, deger: unknown) => {
    ((geo[kova] ??= []) as unknown[]).push(deger);
  };
  for (const k of g.konumlar) {
    if (k.tur === 'country') ekle('countries', ulkeKoduNormallestir(k.key));
    // regions/cities kovasına `{ key }` NESNESİ: düz string canlıda reddediliyor.
    else if (k.tur === 'region') ekle('regions', { key: k.key });
    else if (k.tur === 'city') {
      ekle(
        'cities',
        k.yaricapKm !== undefined ? { key: k.key, radius: k.yaricapKm, distance_unit: 'kilometer' } : { key: k.key },
      );
    } else {
      // distance_unit HER ZAMAN açıkça: varsayılan mil, 1,6 kat büyük alan.
      ekle('custom_locations', {
        latitude: k.enlem,
        longitude: k.boylam,
        radius: k.yaricapKm,
        distance_unit: 'kilometer',
      });
    }
  }

  const targeting: Record<string, unknown> = {
    geo_locations: geo,
    age_min: kisitli ? 18 : g.enDusukYas,
    // Mayıs 2026'dan beri yazılmazsa WhatsApp Durum'da yaşı bilinmeyenler
    // dahil ediliyor ve "18 kesin" sözü sessizce deliniyor.
    user_age_unknown: false,
    targeting_automation: { advantage_audience: g.advantageAudience },
  };
  // age_max HİÇ yazılmıyor: Advantage+ açıkken Meta 65'e çeviriyor ve
  // yazılan değer geri okumada yalancı bir fark üretir.

  if (kisitli) {
    if (g.enDusukYas !== 18) kapatilanlar.push(`En düşük yaş ${g.enDusukYas} (bu reklam türünde 18 sabit)`);
    if (g.ipucuYas) kapatilanlar.push(`Yaş aralığı ${g.ipucuYas.min}-${g.ipucuYas.max}`);
    if (g.ipucuCinsiyet) kapatilanlar.push(`Cinsiyet: ${g.ipucuCinsiyet === 'kadin' ? 'Kadın' : 'Erkek'}`);
  } else {
    if (g.ipucuYas) targeting.age_range = [g.ipucuYas.min, g.ipucuYas.max];
    if (g.ipucuCinsiyet) targeting.genders = [g.ipucuCinsiyet === 'erkek' ? 1 : 2];
  }

  return { tur: 'tamam', targeting, ulkeler, kapatilanlar };
}
