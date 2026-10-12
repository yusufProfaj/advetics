import { z } from 'zod';
import { TELEFON_E164 } from '../reklam/taslak-alanlari';

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
    label: 'Daha fazla hacim',
    promise: 'Form hızlı doldurulur, daha çok kişi tamamlar.',
    // HER SEÇİMİN BEDELİ YAZIYOR. "Daha fazla form" kulağa her zaman iyi
    // geliyor; ajansın bilmesi gereken şey neyi feda ettiği.
    tradeoff: 'Gelen kişilerin bir kısmı yanlışlıkla ya da düşünmeden doldurur.',
  },
  higher_intent: {
    label: 'Daha yüksek niyet',
    // TEK SATIR: kullanıcı reklam bilmiyor; "onay adımı" mekanizmayı,
    // bu cümle sonucu anlatıyor.
    promise: 'Daha az ama daha istekli kişi.',
    tradeoff: 'Form sayısı düşer, gelen kişiler daha ciddi olur.',
  },
  rich_form: {
    label: 'Tanıtımlı form',
    promise: 'Formdan önce görsel ve metinle proje tanıtılır.',
    tradeoff: 'Uzun sürer; yalnızca anlatılacak bir şey varsa değer.',
  },
};

/**
 * VARSAYILAN FORM TÜRÜ `higher_intent` (yönetici kararı, 2026-10-12). Hedef
 * kullanıcı reklam bilmiyor ve "daha fazla hacim"in bedeli (yanlışlıkla
 * dolduran, aranınca açmayan kişi) ancak satış ekibinin ayında görünüyor.
 * Kullanıcı değiştirebilir; şema ve form oluşturucu BU sabiti okur.
 */
export const VARSAYILAN_FORM_TURU: FormType = 'higher_intent';

/**
 * Önerilen hazır soru seti: ad soyad + telefon (ikisi de Meta'da önden dolu)
 * ve kullanıcının yazacağı TEK eleme sorusu (çoktan seçmeli). Eleme sorusu
 * boş bırakılırsa forma hiç girmez; boş soruyla form kaydedilmez.
 */
export const ONERILEN_ON_DOLU_SORULAR: readonly ['FULL_NAME', 'PHONE'] = ['FULL_NAME', 'PHONE'];

/**
 * Bu kadar ve üstü soruda "uzun form" uyarısı: her ek soru tamamlama oranını
 * düşürüyor. Eşik ÖLÇÜLMEDİ: önerilen setin (3 soru) iki katı. Uyarı
 * yayını engellemez.
 */
export const UZUN_FORM_SORU_SAYISI = 6;

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

/**
 * Teşekkür ekranı düğmesi. `CALL_BUSINESS` = "Bizi ara": formu dolduran
 * kişi teşekkür ekranından işletmeyi hemen arayabiliyor (Marka Merkezi
 * telefonu önden dolar). Meta'nın diğer türleri (WhatsApp, randevu, indirme)
 * ölçülmediği için listede yok.
 */
export const TESEKKUR_DUGME_TURLERI = ['VIEW_WEBSITE', 'CALL_BUSINESS', 'NONE'] as const;
export type TesekkurDugmeTuru = (typeof TESEKKUR_DUGME_TURLERI)[number];
export const TESEKKUR_DUGME_ETIKETI: Record<TesekkurDugmeTuru, string> = {
  VIEW_WEBSITE: 'Siteyi ziyaret et',
  CALL_BUSINESS: 'Bizi ara',
  NONE: 'Düğme yok',
};

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
  formType: z.enum(FORM_TYPES).default(VARSAYILAN_FORM_TURU),

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
  /**
   * Düğmenin TÜRÜ açıkça. Önceden tür adresten türetiliyordu (adres varsa
   * site, yoksa düğme yok) ve "Bizi ara" seçeneği hiç yoktu. Verilmezse eski
   * türetme (`tesekkurDugmesiTuru`): eski kayıtlar ve istemciler değişmesin.
   */
  thankYouCtaType: z.enum(TESEKKUR_DUGME_TURLERI).optional(),
  /** CALL_BUSINESS: aranacak numara, E.164 (`+90...`). */
  thankYouPhone: z.string().trim().regex(TELEFON_E164, 'Telefon +90 ile başlamalı').optional(),
}).superRefine((v, ctx) => {
  // Doğrulama GİRİŞTE: türün istediği alan yoksa form kaydedilmiyor; aksi
  // hâlde hata ancak "Meta'da yayınla"da, geri alınamaz bir adımın önünde çıkardı.
  const tur = tesekkurDugmesiTuru(v);
  if (tur === 'CALL_BUSINESS' && !v.thankYouPhone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['thankYouPhone'], message: '"Bizi ara" için telefon numarası gerekli' });
  }
  if (tur === 'VIEW_WEBSITE' && !v.thankYouCtaUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['thankYouCtaUrl'], message: '"Siteyi ziyaret et" için adres gerekli' });
  }
});
export type LeadFormInput = z.infer<typeof leadFormInputSchema>;

/** Teşekkür ekranı düğme türünün TEK kararı (şema, servis ve gövde okur). */
export function tesekkurDugmesiTuru(v: { thankYouCtaType?: TesekkurDugmeTuru | null; thankYouCtaUrl?: string | null }): TesekkurDugmeTuru {
  return v.thankYouCtaType ?? (v.thankYouCtaUrl ? 'VIEW_WEBSITE' : 'NONE');
}

// -----------------------------------------------------------------------------
// Kayıt
// -----------------------------------------------------------------------------

/**
 * `publishing` = YAYIN SAHİPLENİLDİ, Meta'nın cevabı kayda geçmedi. İki iş
 * görüyor: (1) aynı satır için ikinci yayın isteğini (iki sekme) koşullu
 * UPDATE ile reddediyor; (2) Meta form açtıktan sonra kimlik YAZILAMAZSA
 * satır burada KALIYOR ve yeniden yayın engelleniyor. `failed`a düşmek
 * satırı yeniden denenebilir yapardı ve Meta'da İKİNCİ form açılırdı (form
 * silinemiyor). Bu hâlden çıkış elle: Formlar'da Meta'daki formla eşleştir.
 */
export const LEAD_FORM_STATUSES = ['draft', 'publishing', 'published', 'superseded', 'failed'] as const;
export type LeadFormStatus = (typeof LEAD_FORM_STATUSES)[number];

export const LEAD_FORM_STATUS_LABELS: Record<LeadFormStatus, string> = {
  draft: 'Taslak',
  publishing: 'Yayın belirsiz',
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
  /** Eski kayıtlarda kolon boş; kayıt okunurken `tesekkurDugmesiTuru` ile doluyor. */
  thankYouCtaType: TesekkurDugmeTuru;
  thankYouPhone: string | null;

  status: LeadFormStatus;
  /** Meta'daki form kimliği. Yayınlanana kadar null. */
  externalFormId: string | null;
  /**
   * Yayından sonraki GERİ OKUMA uyarısı (`formGeriOkumaUyarisi`). `null` =
   * Meta'daki form gönderilenle aynı ya da form henüz yayınlanmadı. Dolu =
   * form Meta'da AÇIK ama KVKK kutusu, dil ya da niyet adımı farklı duruyor
   * veya doğrulanamadı; ekranda kırmızı yazılır.
   */
  readbackWarning: string | null;
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
