import type { OzelKategori } from '../reklam/meta/hedefleme';
import type { UyumSektoru } from './tipler';

/**
 * ═══ SİNYAL SÖZLÜKLERİ (TASARIM.md §10.6) ═══
 *
 * Sözlük KARAR VERMEZ, SORAR: "daire" bir kampanyanın adı olabilir. O
 * yüzden sözlükten doğan bulgular UYARI'dır (işaretlenir) ya da kanıtın
 * yokluğunu söyleyen ENGEL'dir; hiçbir sözlük eşleşmesi kendiliğinden bir
 * kategori seçmez.
 *
 * EŞLEŞME KELİME SINIRIYLA ve Türkçe küçük harfle. JavaScript'in `\b`'si
 * `ğ ü ş ı ö ç` harflerini kelime karakteri saymıyor: "dairesel" içindeki
 * "daire"yi yakalar, "kılıç" içindeki "kılı"yı da. Sınır Unicode harf
 * sınıfıyla elle kuruluyor.
 */
export function normallestir(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

const HARF = /[\p{L}\p{N}]/u;

/**
 * Türkçe çekim ekleri: "kliniğe", "dairesi", "kredisi" eşleşsin ama
 * "dairesel" (yapım eki) eşleşmesin. KAPALI LİSTE: ek uzunluğuna göre
 * izin vermek "tekstil"i "tek"e düşürürdü. Ünsüz yumuşaması (klinik →
 * kliniği) bu listeyle çözülmüyor; o biçimler sözlükte ayrıca yazılı.
 */
const CEKIM_EKLERI = new Set([
  'ı', 'i', 'u', 'ü', 'a', 'e', 'sı', 'si', 'su', 'sü', 'yı', 'yi', 'yu', 'yü', 'ya', 'ye',
  'ın', 'in', 'un', 'ün', 'nın', 'nin', 'nun', 'nün', 'da', 'de', 'ta', 'te', 'dan', 'den', 'tan', 'ten',
  'lar', 'ler', 'ları', 'leri', 'larda', 'lerde', 'la', 'le', 'yla', 'yle', 'mı', 'mi', 'mu', 'mü',
]);

/** İlk eşleşen kalıbı döndürür; yoksa `null`. Kalıplar normalleştirilmiş yazılmalı. */
export function kalipBul(metin: string, kaliplar: readonly string[]): string | null {
  const m = normallestir(metin);
  for (const k of kaliplar) {
    let i = m.indexOf(k);
    while (i >= 0) {
      const once = i === 0 ? '' : m[i - 1]!;
      let j = i + k.length;
      while (j < m.length && HARF.test(m[j]!)) j++;
      const ek = m.slice(i + k.length, j);
      if (!HARF.test(once) && (ek === '' || CEKIM_EKLERI.has(ek))) return k;
      i = m.indexOf(k, i + 1);
    }
  }
  return null;
}

/** Özel kategori sinyali (GNL-13). Kategori başına ayrı liste; sürümlü (katalog sürümüyle). */
export const KATEGORI_SINYALLERI: Readonly<Record<OzelKategori, readonly string[]>> = {
  HOUSING: ['satılık', 'kiralık', 'kiralık daire', 'satılık daire', 'daire', 'rezidans', '1+1', '2+1', '3+1', '4+1', 'konut projesi', 'tapu', 'emlak', 'konut kredisi'],
  EMPLOYMENT: ['iş ilanı', 'eleman aranıyor', 'personel aranıyor', 'kariyer', 'iş başvurusu', 'maaş'],
  FINANCIAL_PRODUCTS_SERVICES: ['kredi', 'faiz', 'taksit', 'sigorta', 'yatırım', 'kredi kartı'],
  ISSUES_ELECTIONS_POLITICS: ['seçim', 'aday', 'parti', 'oy ver'],
};

/** Üstünlük/garanti iddiası (GNL-08). */
export const USTUNLUK_KALIPLARI = ['en iyi', 'en ucuz', '1 numara', 'bir numara', 'lider', '%100', 'yüzde yüz', 'garanti', 'garantili'] as const;

/** Kişisel nitelik kalıbı (GNL-09): kişiyi bir özelliğiyle muhatap almak. */
export const KISISEL_NITELIK_KALIPLARI = [
  'borçların mı var',
  'borcun mu var',
  'kilo mu vermek',
  'kilo vermek mi',
  'fazla kilolarından',
  'saçların mı dökülüyor',
  'işsiz misin',
  'yalnız mısın',
  'hasta mısın',
] as const;

/** Finans genişletmesi (FIN-03). */
export const FINANS_KISISEL_KALIPLARI = ['kredi notu', 'kredi notun', 'icra', 'borç yapılandırma', 'borcunu kapat'] as const;

/** Kayıt dışı "bedava" iddiası (GNL-12). Sayı/yüzde dedektörü ayrı bir iş (Tur 2). */
export const BEDAVA_KALIPLARI = ['ücretsiz', 'bedava', 'hediye'] as const;

/** Medikal sözlük (SGL-05, YRL-01): sektör seçimi kaçırıldığında ikinci ağ. */
export const MEDIKAL_KALIPLAR = [
  'botoks',
  'dolgu',
  'mezoterapi',
  'saç ekimi',
  'implant',
  'diş beyazlatma',
  'estetik ameliyat',
  'burun estetiği',
  'liposuction',
  'lazer epilasyon',
  'tedavi',
  'muayene',
  'klinik',
  'kliniği',
  'hastane',
  'doktor',
  'diyetisyen',
  'fizik tedavi',
] as const;

/** Konut metni: fiyat kalıbı ve m² beyanı (KNT-03), kredi/vade (KNT-05). */
export const FIYAT_DESENI = /\d[\d.,]*\s*(tl|₺|try|usd|\$|€|eur)\b|(tl|₺)\s*\d/iu;
export const M2_KALIPLARI = ['m²', 'm2', 'metrekare'] as const;
export const VADE_KALIPLARI = ['kredi', 'vade', 'vadeli', 'taksit', 'peşinatsız'] as const;
export const MALIYET_ORANI_KALIPLARI = ['maliyet oranı', 'yıllık maliyet', 'aylık maliyet'] as const;
export const VERGI_DAHIL_KALIPLARI = ['kdv dahil', 'vergiler dahil', 'kdv dâhil', 'vergiler dâhil'] as const;

/**
 * SERBEST METİN SEKTÖR → KAPALI SÖZLÜK. Marka Merkezi'nde sektör bugün
 * serbest metin (`client_profiles.sektor`, VARCHAR 120); kapalı seçim
 * Veri adımıyla gelecek (Tur 3). Eşleme bir TAHMİN değil bir okuma:
 *   · boş/null → `null` (beyan yok, GNL-18 ENGEL),
 *   · tanınan kelime → o sektör(ler),
 *   · tanınmayan ama dolu → `DIGER` (beyan var; GENEL koşar) — medikal
 *     sözlük ayrıca sektör METNİNE de bakıyor (SGL-05), yani "Medikal
 *     Estetik" yazan bir workspace DIGER'e düşse bile sağlık engeline takılır.
 */
const SEKTOR_ESLEME: ReadonlyArray<[readonly string[], UyumSektoru]> = [
  [['emlak', 'emlakçı', 'gayrimenkul danışman', 'emlak ofisi'], 'EMLAK_ARACI'],
  [['inşaat', 'konut', 'gayrimenkul', 'yapı', 'rezidans', 'proje geliştirme', 'müteahhit'], 'KONUT_GELISTIRICI'],
  [['kısa süreli kiralık', 'günlük kiralık', 'apart'], 'KISA_SURELI_KIRALIK'],
  [['otel', 'konaklama', 'pansiyon', 'tatil köyü'], 'OTEL_KONAKLAMA'],
  [['seyahat', 'tur şirketi', 'turizm acentesi', 'seyahat acentası', 'seyahat acentesi'], 'SEYAHAT_ACENTASI'],
  [['sağlık turizmi'], 'SAGLIK_TURIZMI'],
  [['hastane', 'klinik', 'tıp merkezi', 'poliklinik', 'diş', 'sağlık', 'estetik', 'medikal'], 'SAGLIK_KURULUSU'],
  [['doktor', 'hekim', 'diyetisyen', 'psikolog', 'fizyoterapist'], 'SAGLIK_MESLEK_MENSUBU'],
  [['e-ticaret', 'eticaret', 'online mağaza', 'internet mağazası'], 'ETICARET'],
  [['üretim', 'imalat', 'sanayi', 'fabrika', 'b2b', 'toptan'], 'B2B_URETICI'],
  [['kuaför', 'güzellik merkezi', 'tamir', 'temizlik', 'oto servis', 'yerel hizmet'], 'YEREL_HIZMET'],
  [['anaokulu', 'ilkokul', 'ortaokul', 'lise', 'kolej', 'dershane', 'etüt merkezi'], 'EGITIM_MEB'],
  [['eğitim', 'kurs', 'akademi', 'dil okulu'], 'EGITIM_DIGER'],
];

export function sektorCoz(metin: string | null | undefined): UyumSektoru[] | null {
  if (!metin || !metin.trim()) return null;
  const bulunan: UyumSektoru[] = [];
  for (const [kaliplar, sektor] of SEKTOR_ESLEME) {
    if (kalipBul(metin, kaliplar) && !bulunan.includes(sektor)) bulunan.push(sektor);
  }
  return bulunan.length > 0 ? bulunan : ['DIGER'];
}
