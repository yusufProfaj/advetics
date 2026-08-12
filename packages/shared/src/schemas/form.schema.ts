import { z } from 'zod';

/**
 * Meta Anlık Form (Instant Form) — Kütüphane > Formlar.
 *
 * BU MODÜLÜN MERKEZİ SORUNU DEĞİŞMEZLİK.
 *
 * Meta'da yayınlanmış bir form DÜZENLENEMİYOR. API `leadgen_forms` üzerinde
 * güncelleme kabul etmiyor; form bir kez oluşturulduktan sonra soruları,
 * gizlilik metni ve teşekkür ekranı sabitleniyor. Sebep hukuki: kullanıcı
 * belirli bir metni onaylayarak veri verdi ve o metnin sonradan değişmesi
 * onayı geçersiz kılar.
 *
 * Sonuç: "düzenle" diye bir işlem YOK. Bizim yaptığımız şey YENİ BİR SÜRÜM
 * oluşturmak — eski form olduğu gibi kalıyor (topladığı lead'lerle birlikte),
 * yeni sürüm ayrı bir `form_id` alıyor.
 *
 * KRİTİK VE KOLAY GÖZDEN KAÇAN: yeni sürüm YAYINDAKİ REKLAMLARI DEĞİŞTİRMİYOR.
 * Meta'da çalışan bir reklamın kreatifindeki form kimliği değiştirilemiyor;
 * yeni formu kullanmak için yeni bir reklam gerekiyor. Arayüz bunu açıkça
 * söylüyor, yoksa kullanıcı "düzenledim ama değişmedi" diye düşünür.
 */

// -----------------------------------------------------------------------------
// 1. Form tipi
// -----------------------------------------------------------------------------

export const FORM_TYPES = ['more_volume', 'higher_intent', 'rich_form'] as const;
export type FormType = (typeof FORM_TYPES)[number];

export const FORM_TYPE_META: Record<
  FormType,
  { label: string; promise: string; tradeoff: string }
> = {
  more_volume: {
    label: 'Daha fazla form',
    promise: 'Form hızlı doldurulur, daha çok kişi tamamlar.',
    // HER SEÇİMİN BEDELİ YAZIYOR. "Daha fazla form" kulağa her zaman iyi
    // geliyor; ajansın bilmesi gereken şey neyi feda ettiği.
    tradeoff: 'Gelen kişilerin bir kısmı yanlışlıkla ya da düşünmeden doldurur.',
  },
  higher_intent: {
    label: 'Daha nitelikli',
    promise: 'Gönder demeden önce bir onay adımı eklenir.',
    tradeoff: 'Form sayısı düşer, gelen kişiler daha ciddi olur.',
  },
  rich_form: {
    label: 'Tanıtımlı form',
    promise: 'Formdan önce görsel ve metinle proje tanıtılır.',
    tradeoff: 'Uzun sürer; yalnızca anlatılacak bir şey varsa değer.',
  },
};

// -----------------------------------------------------------------------------
// 2. Sorular
// -----------------------------------------------------------------------------

/**
 * Meta'nın ÖN DOLDURDUĞU soru tipleri.
 *
 * Kullanıcının profilinden geliyorlar ve bu yüzden dönüşümü yükseltiyorlar —
 * kişi yazmıyor, onaylıyor. Listeyi kısa tuttuk: Meta onlarca tip destekliyor
 * ama bir inşaat ya da sağlık müşterisinin ihtiyacı bu beşi.
 */
export const PREFILL_QUESTIONS = [
  'FULL_NAME',
  'EMAIL',
  'PHONE',
  'CITY',
  'COMPANY_NAME',
] as const;
export type PrefillQuestion = (typeof PREFILL_QUESTIONS)[number];

export const PREFILL_LABELS: Record<PrefillQuestion, string> = {
  FULL_NAME: 'Ad soyad',
  EMAIL: 'E-posta',
  PHONE: 'Telefon',
  CITY: 'Şehir',
  COMPANY_NAME: 'Firma adı',
};

export const CUSTOM_QUESTION_TYPES = ['short_answer', 'multiple_choice'] as const;
export type CustomQuestionType = (typeof CUSTOM_QUESTION_TYPES)[number];

export const customQuestionSchema = z
  .object({
    type: z.enum(CUSTOM_QUESTION_TYPES),
    label: z.string().trim().min(1, 'Soru metni boş olamaz').max(200),
    /** Yalnızca `multiple_choice` için. */
    options: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'multiple_choice' && v.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Çoktan seçmeli soruda en az 2 seçenek olmalı',
      });
    }
  });
export type CustomQuestion = z.infer<typeof customQuestionSchema>;

// -----------------------------------------------------------------------------
// 3. Gizlilik ve KVKK
// -----------------------------------------------------------------------------

/**
 * Ek onay kutusu — KVKK için.
 *
 * Meta'nın `custom_disclaimer` yapısı. Türkiye'de açık rıza ayrı bir onay
 * gerektiriyor ve gizlilik politikası linki tek başına yeterli sayılmıyor;
 * ticari elektronik ileti için de ayrı onay şart.
 *
 * `required` alanı önemli: zorunlu bir kutu formu tamamlamayı engelliyor ve
 * dönüşümü düşürüyor. Hangisinin zorunlu olacağı hukuki bir karar, bu yüzden
 * varsayılan yapılmadı.
 */
export const consentBoxSchema = z.object({
  text: z.string().trim().min(1, 'Onay metni boş olamaz').max(600),
  required: z.boolean().default(false),
});
export type ConsentBox = z.infer<typeof consentBoxSchema>;

/** Türkiye'de en sık kullanılan iki onay — hazır metin olarak öneriliyor. */
export const CONSENT_PRESETS: Array<{ key: string; label: string; text: string }> = [
  {
    key: 'kvkk',
    label: 'KVKK aydınlatma onayı',
    text:
      'Kişisel verilerimin, 6698 sayılı KVKK kapsamında aydınlatma metninde ' +
      'belirtilen amaçlarla işlenmesine açık rıza veriyorum.',
  },
  {
    key: 'eti',
    label: 'Ticari ileti onayı',
    text:
      'Tarafıma kampanya ve tanıtım amaçlı ticari elektronik ileti ' +
      'gönderilmesini kabul ediyorum.',
  },
];

// -----------------------------------------------------------------------------
// Girdi
// -----------------------------------------------------------------------------

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .regex(/^https:\/\/.+\..+/i, 'Adres https:// ile başlamalı');

export const leadFormInputSchema = z.object({
  clientId: z.string().uuid(),
  /** Formun ait olduğu Facebook sayfası — form sayfaya ait, hesaba değil. */
  socialProfileId: z.string().uuid(),

  /** Yalnızca panelde görünen ad; müşteri görmüyor. */
  name: z.string().trim().min(1, 'Forma bir ad ver').max(200),
  formType: z.enum(FORM_TYPES).default('more_volume'),

  // --- Giriş ekranı ---
  headline: z.string().trim().max(60).optional(),
  /** Formdan önce gösterilen açıklama. */
  intro: z.string().trim().max(1000).optional(),

  // --- Sorular ---
  prefillQuestions: z
    .array(z.enum(PREFILL_QUESTIONS))
    .min(1, 'En az bir soru gerekiyor')
    .max(5),
  customQuestions: z.array(customQuestionSchema).max(5).default([]),

  // --- Gizlilik ---
  /**
   * ZORUNLU ve Meta bunu doğruluyor.
   *
   * Gizlilik politikası olmayan bir form oluşturulamıyor. Müşterinin sitesi
   * yoksa ajansın kendi sayfası kullanılabiliyor ama bir adres şart.
   */
  privacyPolicyUrl: httpsUrl,
  privacyPolicyLinkText: z.string().trim().max(80).default('Gizlilik Politikası'),
  consentBoxes: z.array(consentBoxSchema).max(4).default([]),

  // --- Teşekkür ekranı ---
  thankYouHeadline: z.string().trim().max(60).default('Teşekkürler!'),
  thankYouBody: z.string().trim().max(300).default('En kısa sürede size dönüş yapacağız.'),
  /** Teşekkür ekranındaki butonun metni ve hedefi. */
  thankYouCtaText: z.string().trim().max(40).default('Siteyi ziyaret et'),
  thankYouCtaUrl: httpsUrl.optional(),
});
export type LeadFormInput = z.infer<typeof leadFormInputSchema>;

// -----------------------------------------------------------------------------
// Kayıt
// -----------------------------------------------------------------------------

export const LEAD_FORM_STATUSES = ['draft', 'published', 'superseded', 'failed'] as const;
export type LeadFormStatus = (typeof LEAD_FORM_STATUSES)[number];

export const LEAD_FORM_STATUS_LABELS: Record<LeadFormStatus, string> = {
  draft: 'Taslak',
  published: 'Yayında',
  // "Eski sürüm" DEĞİL "değiştirildi": form hâlâ çalışıyor ve lead topluyor
  // olabilir; yalnızca daha yeni bir sürümü var.
  superseded: 'Yeni sürümü var',
  failed: 'Yayınlanamadı',
};

export interface LeadFormRecord {
  id: string;
  clientId: string;
  socialProfileId: string;
  socialProfileName: string;
  name: string;
  formType: FormType;
  headline: string | null;
  intro: string | null;
  prefillQuestions: PrefillQuestion[];
  customQuestions: CustomQuestion[];
  privacyPolicyUrl: string;
  privacyPolicyLinkText: string;
  consentBoxes: ConsentBox[];
  thankYouHeadline: string;
  thankYouBody: string;
  thankYouCtaText: string;
  thankYouCtaUrl: string | null;

  status: LeadFormStatus;
  /** Meta'daki form kimliği. Yayınlanana kadar null. */
  externalFormId: string | null;
  /** Sürüm numarası — 1'den başlıyor. */
  version: number;
  /** Bu formun ilk sürümünün kimliği. İlk sürümde kendi kimliği. */
  rootId: string;
  /** Bu formu geçersiz kılan yeni sürüm. */
  supersededById: string | null;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
}

/**
 * Bir formun düzenlenip düzenlenemeyeceği ve düzenlenirse ne olacağı.
 *
 * Arayüz bunu KAYDETMEDEN ÖNCE gösteriyor. "Düzenle"ye basıp sonra "yeni
 * sürüm oluşturuldu" mesajıyla karşılaşmak, kullanıcının istemediği bir şeyi
 * yapmış olması demek.
 */
export interface EditPlan {
  /** Doğrudan üzerine yazılabilir mi. */
  inPlace: boolean;
  /** Yeni sürüm oluşacaksa kaçıncı sürüm olacağı. */
  nextVersion: number | null;
  /** Kullanıcıya gösterilecek açıklama. */
  explanation: string;
  /** Yayındaki reklamları etkileyip etkilemediği. */
  affectsLiveAds: boolean;
}
