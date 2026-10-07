import { FINANS_KISISEL_KALIPLARI, FIYAT_DESENI, kalipBul, M2_KALIPLARI, MALIYET_ORANI_KALIPLARI, MEDIKAL_KALIPLAR, VADE_KALIPLARI } from '../sozluk';
import type { KuralSonucu, UyumGirdisi, UyumKurali, UyumPaketi, UyumSatiri } from '../tipler';
import { SON_KONTROL, sozlukKurali, YURURLUKTE } from './yardimci';

/**
 * ═══ SEKTÖR VE KONU PAKETLERİ (TASARIM.md §10.5, §10.7) ═══
 *
 * Tur 1 kapsamı (MIMARI §6 madde 1): FORM_KVKK, KONUT, FINANS + ETICARET,
 * YEREL_HIZMET ve SAGLIK'in ENGEL kuralları. Sağlık paketinin yalnız
 * kapatan iki kuralı var (SGL-01, SGL-05): sağlıkta "açan" modlar
 * (SGL-03/04) tasarımda da kapalı ve kapalı bir modu kodda yazmak, açık
 * olduğu izlenimini verir.
 *
 * KANITI ŞEMADA OLMAYAN KURAL `bilinmiyor` DÖNER. FRM-01'in aydınlatma
 * adresi, KNT-02'nin "satışı kim yapıyor" cevabı ve ETC-01'in çerez beyanı
 * bugün hiçbir tabloda yok (Veri adımı Tur 3). ENGEL'de bilinmiyor = kaldı:
 * FORM ve konut planları gerçek yayına geçemez ve sebebi ekranda yazar —
 * kanıtsız "geçti" bunun tersini, yani kayıtsız bir konut reklamını
 * müşterinin hesabında açardı.
 */
const kural = (paket: UyumPaketi, k: Omit<UyumKurali, 'paket' | 'sonKontrol' | 'yururlukTarihi'>): UyumKurali => ({
  paket,
  sonKontrol: SON_KONTROL,
  yururlukTarihi: YURURLUKTE,
  ...k,
});

/** Konut ve finansın ORTAK kısıt seti (07 OZK-06): yaş 18, üst sınır yok, cinsiyet yok, özel/benzer kitle yok. */
function kisitSetiIhlali(s: UyumSatiri): string | null {
  if (s.platform !== 'meta' || !s.kitle) return null;
  const k = s.kitle;
  if (k.yasMin !== 18) return `en düşük yaş ${k.yasMin} (18 olmalı)`;
  if (k.yasMax < 65) return `üst yaş sınırı ${k.yasMax} (sınır konamaz)`;
  if (k.cinsiyet !== 'all') return 'cinsiyet süzgeci var';
  if (k.ozelKitleVar) return 'özel/benzer kitle kullanılıyor';
  return null;
}

/** Satırın KENDİ metinlerinde koşul (plan gerekçe paragrafı hariç: konut beyanı reklamın metninde aranır). */
function satirMetniBul(s: UyumSatiri, kosul: (metin: string) => boolean): boolean {
  return s.metinler.some((m) => kosul(m.metin));
}

export const FORM_KVKK_KURALLARI: readonly UyumKurali[] = [
  kural('FORM_KVKK', {
    kimlik: 'FRM-01',
    seviye: 'ENGEL',
    mesaj: 'Form reklamı için workspace’in HTML aydınlatma sayfası tanımlı değil.',
    neYapmali: 'Marka Merkezi’nde KVKK aydınlatma sayfasının https adresini gir (PDF ya da indirme bağlantısı olmaz).',
    kimCozer: 'ajans',
    dayanak: { metin: 'KVKK md. 10; Aydınlatma Yükümlülüğü Tebliği', madde: 'C-10 §3, R3-O-18', tarih: '2018-03-10' },
    hukukGorusu: 'gerekmez',
    denetle: (g, p) => {
      const formSatirlari = g.satirlar.filter((s) => s.niyet === 'FORM');
      if (formSatirlari.length === 0) return [];
      const adres = p.kvkkAydinlatmaAdresi?.trim() ?? '';
      if (!adres) return formSatirlari.map((s) => ({ yer: s.yer, durum: 'bilinmiyor' as const }));
      if (!/^https:\/\/[^\s/]+\.[^\s]+$/.test(adres) || /advetics\./i.test(adres) || /\.pdf($|\?)/i.test(adres)) {
        return formSatirlari.map((s) => ({ yer: s.yer, durum: 'kaldi' as const, ek: 'adres https HTML sayfası değil' }));
      }
      return [];
    },
  }),
];

export const KONUT_KURALLARI: readonly UyumKurali[] = [
  kural('KONUT', {
    kimlik: 'KNT-01',
    seviye: 'ENGEL',
    mesaj: 'Konut reklamında hedefleme kısıtlı: yaş 18, üst yaş sınırı ve cinsiyet süzgeci yok, özel/benzer kitle yok.',
    neYapmali: 'Kitle şablonunu konut kısıtlarına uygun hâle getir ya da bu satır için başka kitle seç.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Advetics kuralı (karar 4); Meta konut kategorisi', madde: 'C-4, T-34', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) =>
      g.satirlar.flatMap((s) => {
        const ihlal = kisitSetiIhlali(s);
        return ihlal ? [{ yer: s.yer, durum: 'kaldi' as const, ek: ihlal }] : [];
      }),
  }),
  kural('KONUT', {
    kimlik: 'KNT-02',
    seviye: 'ENGEL',
    mesaj: 'Konut satışını kimin yaptığı (geliştirici mi aracı mı) beyan edilmedi.',
    neYapmali: 'Marka Merkezi’nde satışı yapanı seç; aracıysa yetki belgesi numarası ve belgedeki işletme adı ana metinde olmalı.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Taşınmaz Ticareti Hakkında Yönetmelik', madde: 'R3-O-33, R3-K-48', tarih: '2026-08-01' },
    hukukGorusu: 'gerekli',
    denetle: (g, p) => {
      if (p.konutSatisYapan === null) return [{ yer: 'plan', durum: 'bilinmiyor' }];
      if (p.konutSatisYapan === 'gelistirici' || g.an !== 'taslak') return [];
      return g.satirlar
        .filter((s) => s.platform === 'meta' && !s.metinler.some((m) => m.alan === 'metin' && kalipBul(m.metin, ['yetki belgesi'])))
        .map((s) => ({ yer: s.yer, durum: 'kaldi' as const, ek: 'ana metinde yetki belgesi numarası yok' }));
    },
  }),
  kural('KONUT', {
    kimlik: 'KNT-03',
    seviye: 'ENGEL',
    mesaj: 'Konut metninde fiyat var; brüt ve net m² de yazılmalı.',
    neYapmali: 'Fiyatın yanına brüt ve net metrekareyi ekle ya da fiyatı metinden çıkar.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Taşınmaz Ticareti Hakkında Yönetmelik', madde: 'R3-O-34', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) =>
      g.satirlar
        .filter((s) => satirMetniBul(s, (m) => FIYAT_DESENI.test(m)))
        .filter((s) => {
          const hepsi = s.metinler.map((m) => m.metin).join(' ');
          return !(kalipBul(hepsi, M2_KALIPLARI) && kalipBul(hepsi, ['brüt']) && kalipBul(hepsi, ['net']));
        })
        .map((s) => ({ yer: s.yer, durum: 'kaldi' as const })),
  }),
  kural('KONUT', {
    kimlik: 'KNT-05',
    seviye: 'UYARI',
    mesaj: 'Metinde kredi ya da vadeli satış ifadesi var; aylık ve yıllık maliyet oranı yazılmalı.',
    neYapmali: 'Maliyet oranlarını ekle ya da vade ifadesini çıkar.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Konut Finansmanı Sözleşmeleri Yönetmeliği', madde: 'R3-O-34', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) => {
      const r: KuralSonucu[] = [];
      for (const s of g.satirlar) {
        const hepsi = s.metinler.map((m) => m.metin).join(' ');
        const vade = kalipBul(hepsi, VADE_KALIPLARI);
        if (vade && !kalipBul(hepsi, MALIYET_ORANI_KALIPLARI)) r.push({ yer: s.yer, durum: 'kaldi', ek: `"${vade}" geçiyor` });
      }
      return r;
    },
  }),
];

export const FINANS_KURALLARI: readonly UyumKurali[] = [
  kural('FINANS', {
    kimlik: 'FIN-01',
    seviye: 'ENGEL',
    mesaj: 'Finans reklamında hedefleme kısıtlı: yaş 18, üst yaş sınırı ve cinsiyet süzgeci yok, özel/benzer kitle yok.',
    neYapmali: 'Kitle şablonunu finans kısıtlarına uygun hâle getir.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Meta finansal ürünler ve hizmetler kategorisi', madde: 'C-7 §8', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) =>
      g.satirlar.flatMap((s) => {
        const ihlal = kisitSetiIhlali(s);
        return ihlal ? [{ yer: s.yer, durum: 'kaldi' as const, ek: ihlal }] : [];
      }),
  }),
  kural('FINANS', {
    kimlik: 'FIN-03',
    seviye: 'UYARI',
    aiUretimindeSeviye: 'ENGEL',
    mesaj: 'Metin kişinin finansal durumuna doğrudan değiniyor (kredi notu, icra, borç).',
    neYapmali: 'Cümleyi kişiye değil hizmete yönelik yaz.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Meta Reklam Politikaları: kişisel nitelikler', madde: 'R3-K-20', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) => sozlukKurali(g, FINANS_KISISEL_KALIPLARI),
  }),
];

export const ETICARET_KURALLARI: readonly UyumKurali[] = [
  kural('ETICARET', {
    kimlik: 'ETC-01',
    seviye: 'UYARI',
    mesaj: 'Site trafiği satırı var; sitede çerez rızası mekanizması olduğu beyan edilmedi.',
    neYapmali: 'Sitede çerez rızası varsa "Okudum" de; yoksa site sahibine bildir.',
    kimCozer: 'ajans',
    dayanak: { metin: 'KVKK Çerez Uygulamaları Rehberi', madde: 'ana-spek §2.7', tarih: '2022-06-20' },
    hukukGorusu: 'gerekli',
    denetle: (g, p) =>
      p.cerezRizasiBeyani === true || !g.satirlar.some((s) => s.niyet === 'SITE')
        ? []
        : [{ yer: 'plan', durum: p.cerezRizasiBeyani === false ? 'kaldi' : 'bilinmiyor' }],
  }),
];

/**
 * Medikal sözlük metinde ya da SEKTÖR METNİNDE. Sektör metnine de
 * bakılıyor çünkü serbest metin eşlemesi "Medikal Estetik"i DIGER'e
 * düşürebilir; sözlük ikinci ağ (C-2).
 */
function medikalEslesmeler(g: UyumGirdisi, sektorMetni: string | null): KuralSonucu[] {
  const r = sozlukKurali(g, MEDIKAL_KALIPLAR);
  if (r.length === 0 && sektorMetni) {
    const k = kalipBul(sektorMetni, MEDIKAL_KALIPLAR);
    if (k) r.push({ yer: 'plan', durum: 'kaldi', ek: `sektörde "${k}" geçiyor` });
  }
  return r;
}

export const YEREL_HIZMET_KURALLARI: readonly UyumKurali[] = [
  kural('YEREL_HIZMET', {
    kimlik: 'YRL-01',
    seviye: 'ENGEL',
    mesaj: 'Yerel hizmet metninde medikal işlem sözcüğü var; Türkiye’de ücretli sağlık reklamı yayınlanamaz.',
    neYapmali: 'Medikal işlemleri metinden çıkar.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik', madde: 'R3-O-48', tarih: '2025-11-12' },
    hukukGorusu: 'gerekmez',
    denetle: (g, p) => medikalEslesmeler(g, p.sektorMetni),
  }),
];

export const SAGLIK_KURALLARI: readonly UyumKurali[] = [
  kural('SAGLIK', {
    kimlik: 'SGL-01',
    seviye: 'ENGEL',
    mesaj: 'Sağlık kuruluşu ya da sağlık meslek mensubunun Türkiye hedefli ücretli reklamı yayınlanamaz.',
    neYapmali: 'Bu workspace için ücretli reklam kurulmaz; organik içerik ve bilgilendirme kullanılır.',
    kimCozer: 'katalog',
    dayanak: { metin: 'Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik', madde: 'md. 5', tarih: '2025-11-12' },
    hukukGorusu: 'alindi',
    denetle: (_g, p) =>
      p.sektorler?.some((s) => s === 'SAGLIK_KURULUSU' || s === 'SAGLIK_MESLEK_MENSUBU') ? [{ yer: 'plan', durum: 'kaldi' }] : [],
  }),
  kural('SAGLIK', {
    kimlik: 'SGL-05',
    seviye: 'ENGEL',
    mesaj: 'Metinde ya da sektörde medikal sözcük var; sağlık reklamı "diğer" sektör olarak yayınlanamaz.',
    neYapmali: 'Sektör sağlıksa Marka Merkezi’nde öyle yaz; değilse medikal sözcüğü metinden çıkar.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Sağlık Tanıtım Yönetmeliği; sektör kaçağı ikinci ağı', madde: 'C-2, R3-O-48', tarih: '2025-11-12' },
    hukukGorusu: 'gerekmez',
    denetle: (g, p) => (p.sektorler?.includes('DIGER') ? medikalEslesmeler(g, p.sektorMetni) : []),
  }),
];
