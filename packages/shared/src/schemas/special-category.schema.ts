import { z } from 'zod';

/**
 * Özel reklam kategorileri — Meta.
 *
 * NEDEN VAR: konut, istihdam ve kredi reklamları düzenlemeye tabi. Meta bu
 * kategorilerde hedeflemeyi KISITLIYOR (yaş, cinsiyet ve ayrıntılı hedefleme
 * kapanıyor, coğrafi yarıçapın alt sınırı yükseliyor) ve kategori
 * BEYAN EDİLMEDEN yayınlanan bir reklam politika ihlali sayılıyor.
 *
 * CEZASI KAMPANYA SEVİYESİNDE DEĞİL, HESAP SEVİYESİNDE. Yani bir müşteri için
 * unutulan beyan, ajansın o reklam hesabındaki bütün kampanyalarını riske
 * atıyor.
 *
 * KATEGORİ MÜŞTERİNİN ÖZELLİĞİ, KAMPANYANIN DEĞİL. Bir emlak firması her
 * kampanyasında emlakçı; her kampanyada tek tek sormak, bir gün unutulacağı
 * anlamına gelir ve o gün pahalı. Bu yüzden alan `clients` tablosunda.
 *
 * GOOGLE KAPSAM DIŞI: Google'da da benzer kategoriler var ama beyan kampanya
 * API'sinde değil, hesap seviyesinde ve panel üzerinden yapılıyor. Uydurma bir
 * eşleme yazmak, beyan edildiği sanılan ama hiçbir yere gitmeyen bir alan
 * demek olurdu.
 */

export const SPECIAL_AD_CATEGORIES = [
  'HOUSING',
  'EMPLOYMENT',
  'CREDIT',
  'ISSUES_ELECTIONS_POLITICS',
  'ONLINE_GAMBLING_AND_GAMING',
] as const;

export type SpecialAdCategory = (typeof SPECIAL_AD_CATEGORIES)[number];

export const SPECIAL_AD_CATEGORY_META: Record<
  SpecialAdCategory,
  { label: string; hint: string }
> = {
  HOUSING: {
    label: 'Konut',
    hint: 'Emlak satışı/kiralama, konut kredisi, sigortası ya da ilanları.',
  },
  EMPLOYMENT: {
    label: 'İstihdam',
    hint: 'İş ilanı, staj, kariyer fırsatı ya da işe alım hizmeti.',
  },
  CREDIT: {
    label: 'Kredi',
    hint: 'Kredi kartı, banka kredisi, taksitli finansman ya da kredi danışmanlığı.',
  },
  ISSUES_ELECTIONS_POLITICS: {
    label: 'Sosyal konular, seçim ve siyaset',
    hint: 'Siyasi içerik ve toplumsal tartışma konuları. Ayrıca yetkilendirme gerektiriyor.',
  },
  ONLINE_GAMBLING_AND_GAMING: {
    label: 'Çevrimiçi kumar ve oyun',
    hint: 'Bahis, şans oyunları ve gerçek parayla oynanan oyunlar.',
  },
};

export const specialAdCategoriesSchema = z
  .array(z.enum(SPECIAL_AD_CATEGORIES))
  .max(SPECIAL_AD_CATEGORIES.length)
  .default([]);

/**
 * Kategori seçiliyken hedefleme KISITLANIYOR.
 *
 * Meta özel kategorilerde yaş, cinsiyet ve ayrıntılı hedeflemeyi kapatıyor.
 * Alanları yine göndermek, Meta'nın isteği REDDETMESİ demek — ve hata mesajı
 * ("Invalid parameter") hangi alanın sorunlu olduğunu söylemiyor.
 *
 * DAHA SİNSİ İHTİMAL: Meta bazı alanları kabul edip sessizce yok sayıyor. O
 * durumda reklam yayınlanır, hedefleme uygulanmaz ve kullanıcı 25-44 yaşa
 * reklam verdiğini sanır.
 *
 * Bu yüzden kısıtlamayı BİZ uyguluyoruz ve kullanıcıya söylüyoruz.
 */
export function restrictTargetingFor(
  categories: readonly SpecialAdCategory[],
  targeting: Record<string, unknown>,
): { targeting: Record<string, unknown>; removed: string[] } {
  if (categories.length === 0) return { targeting, removed: [] };

  const out = { ...targeting };
  const removed: string[] = [];

  if (out.age_min !== undefined && out.age_min !== 18) {
    removed.push('yaş alt sınırı');
  }
  if (out.age_max !== undefined) removed.push('yaş üst sınırı');
  if (out.genders !== undefined) removed.push('cinsiyet');

  // YAŞ SIFIRLANMIYOR, 18'E SABİTLENİYOR: Meta özel kategorilerde 18+
  // istiyor ve alanı hiç göndermemek "her yaş" demek olurdu.
  out.age_min = 18;
  delete out.age_max;
  delete out.genders;

  return { targeting: out, removed };
}
