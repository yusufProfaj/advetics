import { metinUyariIceriyor } from '../../reklam/taslak-alanlari';
import type { OzelKategori } from '../../reklam/meta/hedefleme';
import { BEDAVA_KALIPLARI, FIYAT_DESENI, KATEGORI_SINYALLERI, KISISEL_NITELIK_KALIPLARI, USTUNLUK_KALIPLARI, kalipBul, VERGI_DAHIL_KALIPLARI } from '../sozluk';
import type { KuralSonucu, UyumKurali, UyumSektoru } from '../tipler';
import { metinler, SON_KONTROL, sozlukKurali, YURURLUKTE } from './yardimci';

/**
 * ═══ GENEL PAKET — her plan ve her taslak (TASARIM.md §10.5 `GENEL`) ═══
 *
 * KATALOGDA OLMAYAN KURALLAR (bilerek, sırada): GNL-02 `user_age_unknown`
 * (derleyici zaten açıkça false yazıyor, geri okuma sınıyor), GNL-03..07
 * yapay zekâ medya beyanı (Pilot medyayı varlık arşivinden alıyor ve beyan
 * alanı henüz şemada yok — Tur 3 Veri adımı), GNL-11 indirim beyanı
 * (yapılandırılmış indirim alanı yok), GNL-15 Gelişmiş'e özgü, GNL-16
 * niyet yok, GNL-17 derleyicide (OPT_OUT). Eksik bir kuralı "geçti" saymak
 * yerine adını burada yazmak, kataloğun neyi denetlemediğini görünür tutar.
 */

/**
 * Paketi KATALOGDA HENÜZ OLMAYAN sektörler. Bu sektörlerin tasarımında
 * ENGEL seviyesinde kurallar var (KON-01, ALK-01, EGT-01, STR-*); paket
 * yazılmadan "geçti" demek o kuralları sessizce atlamak olurdu (C-2'nin
 * kaçağı). Paket yazıldığında sektör bu listeden çıkar.
 */
export const PAKETI_OLMAYAN_SEKTORLER: readonly UyumSektoru[] = [
  'SAGLIK_TURIZMI',
  'OTEL_KONAKLAMA',
  'KISA_SURELI_KIRALIK',
  'SEYAHAT_ACENTASI',
  'EGITIM_MEB',
];

const GNL = (k: Omit<UyumKurali, 'paket' | 'sonKontrol' | 'yururlukTarihi'> & Partial<Pick<UyumKurali, 'yururlukTarihi'>>): UyumKurali => ({
  paket: 'GENEL',
  sonKontrol: SON_KONTROL,
  yururlukTarihi: YURURLUKTE,
  ...k,
});

export const GENEL_KURALLARI: readonly UyumKurali[] = [
  GNL({
    kimlik: 'GNL-01',
    seviye: 'ENGEL',
    mesaj: 'Reklamlar yalnız 18 yaş ve üstüne gösterilir; kitlenin en düşük yaşı 18’in altında.',
    neYapmali: 'Kitle şablonunda en düşük yaşı 18 ya da üstü yap.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Advetics kuralı (karar C-9)', madde: 'C-9, R3-O-9', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) => g.satirlar.filter((s) => s.kitle && s.kitle.yasMin < 18).map((s) => ({ yer: s.yer, durum: 'kaldi', ek: `en düşük yaş ${s.kitle!.yasMin}` })),
  }),
  GNL({
    kimlik: 'GNL-08',
    seviye: 'UYARI',
    mesaj: 'Metinde üstünlük ya da garanti iddiası var; kanıt belgesi yoksa ifade değişmeli.',
    neYapmali: 'İddianın belgesi elindeyse "Okudum" de; yoksa ifadeyi değiştir.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği', madde: 'md. 8', tarih: '2015-01-10' },
    hukukGorusu: 'gerekmez',
    denetle: (g) => sozlukKurali(g, USTUNLUK_KALIPLARI),
  }),
  GNL({
    kimlik: 'GNL-09',
    seviye: 'UYARI',
    aiUretimindeSeviye: 'ENGEL',
    mesaj: 'Metin kişiyi bir kişisel niteliğiyle muhatap alıyor (borç, kilo, sağlık).',
    neYapmali: 'Cümleyi kişiye değil ürüne yönelik yaz.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Meta Reklam Politikaları: kişisel nitelikler', madde: 'R3-O-10, R6-O-52', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) => sozlukKurali(g, KISISEL_NITELIK_KALIPLARI),
  }),
  GNL({
    kimlik: 'GNL-10',
    seviye: 'UYARI',
    mesaj: 'Metinde fiyat var ama "vergiler dahil" ibaresi yok.',
    neYapmali: 'Fiyatın yanına "KDV dahil" yaz ya da fiyatı metinden çıkar.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Fiyat Etiketi Yönetmeliği', madde: 'R3-O-12', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) => {
      const r = new Map<string, KuralSonucu>();
      for (const { yer, m } of metinler(g)) {
        if (!FIYAT_DESENI.test(m.metin) || kalipBul(m.metin, VERGI_DAHIL_KALIPLARI)) continue;
        if (!r.has(yer)) r.set(yer, { yer, durum: 'kaldi', ai: m.uretici === 'ai' });
      }
      return [...r.values()];
    },
  }),
  GNL({
    kimlik: 'GNL-12',
    seviye: 'UYARI',
    aiUretimindeSeviye: 'ENGEL',
    mesaj: 'Metinde "ücretsiz/bedava" iddiası var; kayıtlı bir teklif değilse yanıltıcı sayılabilir.',
    neYapmali: 'Teklif gerçekten ücretsizse "Okudum" de; değilse ifadeyi çıkar.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Ticari Reklam Yönetmeliği; iddia dedektörü', madde: 'R5-O-42/43', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g) => sozlukKurali(g, BEDAVA_KALIPLARI),
  }),
  GNL({
    kimlik: 'GNL-13',
    seviye: 'UYARI',
    mesaj: 'Metin bir özel reklam kategorisine işaret ediyor ama workspace o kategoride değil.',
    neYapmali: 'Reklam gerçekten bu kategorideyse Marka Merkezi’nde özel kategoriyi seç; değilse "Okudum" de.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Meta özel reklam kategorileri', madde: 'T-16, C-7 §4', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g, p) => {
      // Soru cevaplanmadıysa sinyal anlamsız: GNL-20 zaten ENGEL.
      if (p.ozelKategoriler === null) return [];
      const r = new Map<string, KuralSonucu>();
      for (const { yer, m } of metinler(g)) {
        for (const [kat, kaliplar] of Object.entries(KATEGORI_SINYALLERI) as Array<[OzelKategori, readonly string[]]>) {
          if (p.ozelKategoriler.includes(kat)) continue;
          const k = kalipBul(m.metin, kaliplar);
          if (k && !r.has(yer)) r.set(yer, { yer, durum: 'kaldi', ek: `"${k}" geçiyor`, ai: m.uretici === 'ai' });
        }
      }
      return [...r.values()];
    },
  }),
  GNL({
    kimlik: 'GNL-14',
    seviye: 'ENGEL',
    mesaj: 'Workspace’in zorunlu yasal uyarısı reklam metninde yok.',
    neYapmali: 'Yasal uyarıyı ana metnin başına ekle.',
    kimCozer: 'kullanici',
    dayanak: { metin: 'Marka Merkezi yasal uyarısı; ibarenin yeri', madde: 'C-13, C-29, T-42', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    // Yalnız reklam METNİNE bakar; planda metin yok ve kural sessiz kalır.
    denetle: (g, p) => {
      const uyari = p.yasalUyari?.trim();
      if (!uyari) return [];
      const r = new Map<string, KuralSonucu>();
      for (const s of g.satirlar) {
        for (const m of s.metinler.filter((x) => x.alan === 'metin')) {
          if (!metinUyariIceriyor(m.metin, uyari) && !r.has(s.yer)) r.set(s.yer, { yer: s.yer, durum: 'kaldi', ai: m.uretici === 'ai' });
        }
      }
      return [...r.values()];
    },
  }),
  GNL({
    kimlik: 'GNL-18',
    seviye: 'ENGEL',
    mesaj: 'Workspace’in sektörü beyan edilmedi; sektöre özgü kurallar denetlenemiyor.',
    neYapmali: 'Marka Merkezi’nde sektörü yaz.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Advetics kuralı: boş kanıt geçti sayılmaz', madde: 'TASARIM §10.1.1, T-45', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (_g, p) => (p.sektorler === null ? [{ yer: 'plan', durum: 'bilinmiyor' }] : []),
  }),
  GNL({
    kimlik: 'GNL-20',
    seviye: 'ENGEL',
    mesaj: 'Özel reklam kategorisi sorusu cevaplanmadı (konut, istihdam, finans, siyaset).',
    neYapmali: 'Marka Merkezi’nde özel kategori sorusunu cevapla; hiçbiri değilse "Hayır" de.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Meta özel reklam kategorileri; beyan hesap seviyesinde', madde: 'T-16, B-13', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (g, p) => (p.ozelKategoriler === null && g.satirlar.some((s) => s.platform === 'meta') ? [{ yer: 'plan', durum: 'bilinmiyor' }] : []),
  }),
  GNL({
    kimlik: 'GNL-21',
    seviye: 'ENGEL',
    mesaj: 'Bu sektörün uyum kuralları henüz katalogda yok; kanıtlanmadan yayın açılmaz.',
    neYapmali: 'Ajans katalog güncellemesini bekler; bu süre zarfında kurulum test kipinde kalır.',
    kimCozer: 'katalog',
    dayanak: { metin: 'Advetics kuralı: paketi olmayan sektör geçti sayılmaz', madde: 'TASARIM §10.4, C-2', tarih: '2026-10-07' },
    hukukGorusu: 'gerekmez',
    denetle: (_g, p) =>
      (p.sektorler ?? [])
        .filter((s) => PAKETI_OLMAYAN_SEKTORLER.includes(s))
        .slice(0, 1)
        .map((s) => ({ yer: 'plan', durum: 'bilinmiyor', ek: s })),
  }),
  GNL({
    kimlik: 'OZK-SYS',
    seviye: 'ENGEL',
    mesaj: 'Siyasi ya da toplumsal konulu reklam Advetics’ten henüz yayınlanamıyor: Meta’nın kimlik doğrulaması ve "ödeyen" beyanı gerekiyor.',
    neYapmali: 'Bu reklamı Meta Reklam Yöneticisi’nden, doğrulanmış hesapla yayınla.',
    kimCozer: 'ajans',
    dayanak: { metin: 'Meta: Sosyal konular, seçimler veya siyaset', madde: 'TASARIM §10.6', tarih: '2026-08-01' },
    hukukGorusu: 'gerekmez',
    denetle: (_g, p) => (p.ozelKategoriler?.includes('ISSUES_ELECTIONS_POLITICS') ? [{ yer: 'plan', durum: 'kaldi' }] : []),
  }),
];
