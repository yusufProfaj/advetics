import { z } from 'zod';
import { specialAdCategoriesSchema } from './special-category.schema';
import { ROLES } from '../auth/roles';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug yalnızca küçük harf, rakam ve tire içerebilir');

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Geçerli bir hex renk kodu girin');

/**
 * IANA timezone doğrulaması.
 * Bu alan kritik: "bugünün harcaması" tanımı buna bağlı. Yanlış TZ,
 * kural motorunun yanlış günün verisiyle bütçe kapatması demek.
 */
const timezoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Geçerli bir IANA zaman dilimi girin (örn: Europe/Istanbul)' },
);


/**
 * Müşteri iletişim ve fatura bilgisi — hepsi opsiyonel.
 *
 * BOŞ DİZGE `null`'A ÇEVRİLİYOR. Form boş bir alanı `""` olarak gönderiyor ve
 * veritabanına `""` yazmak, "girilmedi" ile "boş girildi" ayrımını kaybetmek
 * demek: rapor gönderimi `contact_email` dolu sanıp boş bir adrese göndermeye
 * çalışırdı.
 */
const bosDizgeNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v))
    .nullable();

export const clientContactSchema = z.object({
  contactName: bosDizgeNull(120),
  contactEmail: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v))
    .nullable()
    // GEVŞEK KONTROL, tam RFC değil: tam doğrulama regex'le yapılamıyor ve
    // denemek geçerli adresleri reddetmekle sonuçlanıyor. Veritabanında da
    // aynı kontrol var (`clients_contact_email_chk`).
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: 'Geçerli bir e-posta adresi girin',
    }),
  contactPhone: bosDizgeNull(40),
  website: bosDizgeNull(255),
  address: bosDizgeNull(500),
  taxOffice: bosDizgeNull(120),
  taxNumber: bosDizgeNull(40),
  iban: bosDizgeNull(34),
  notes: bosDizgeNull(2000),
});
export type ClientContactInput = z.infer<typeof clientContactSchema>;

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  timezone: timezoneSchema.default('Europe/Istanbul'),
  reportingCurrency: z.string().length(3).toUpperCase().default('TRY'),

  /**
   * Meta özel reklam kategorileri — MÜŞTERİNİN ÖZELLİĞİ.
   *
   * Konut, istihdam ve kredi reklamları düzenlemeye tabi; kategori beyan
   * edilmeden yayınlanan reklam politika ihlali ve cezası HESAP seviyesinde.
   * Kampanya başına sormak, bir gün unutulacağı anlamına gelir.
   *
   * VARSAYILAN BOŞ ve çoğu müşteride doğru cevap bu.
   */
  specialAdCategories: specialAdCategoriesSchema,
})
  // İLETİŞİM ALANLARI OLUŞTURMADA DA VAR: sihirbaz zaten topluyor ve
  // ayrı bir "sonra güncelle" adımı, kullanıcının unutabileceği ikinci bir
  // ekran demekti.
  .merge(clientContactSchema);
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema
  .partial()
  .extend({ status: z.enum(['active', 'paused', 'archived']).optional() });
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: slugSchema.optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const updateMembershipSchema = z.object({
  role: z.enum(ROLES),
  /** Yetki override: `{ "rule.activate": false }`. Rolü daima ezer. */
  permissions: z.record(z.string(), z.boolean()).nullable().optional(),
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

/**
 * White-label marka profili.
 * clientId null ise org varsayılanıdır; bir client'a özel profil yoksa
 * o profile geri düşülür.
 */
export const upsertBrandingSchema = z.object({
  clientId: z.string().uuid().nullable(),
  logoUrl: z.string().url().max(1024).nullable().optional(),
  logoDarkUrl: z.string().url().max(1024).nullable().optional(),
  faviconUrl: z.string().url().max(1024).nullable().optional(),
  primaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  fontFamily: z.string().trim().max(120).optional(),
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .regex(
      /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
      'Geçerli bir alan adı girin (örn: rapor.musterim.com)',
    )
    .nullable()
    .optional(),
  emailFromName: z.string().trim().max(120).optional(),
  emailFromAddress: z.string().email().max(255).nullable().optional(),
  footerText: z.string().trim().max(500).nullable().optional(),
  hidePoweredBy: z.boolean().optional(),
});
export type UpsertBrandingInput = z.infer<typeof upsertBrandingSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * KURULUM SİHİRBAZI — tek çağrıda müşteri, hesaplar ve kullanıcı.
 *
 * NEDEN TEK UÇ: bugüne kadar akış "müşteri oluştur → bağlantılar ekranına git
 * → hesabı ata → sayfayı ata → izlemeyi aç" idi ve kullanıcının tarifi
 * "hepsi angarya" oldu. Adımlardan birinin atlanması sessiz: izleme
 * açılmayınca hiçbir veri gelmiyor ve sebebi hiçbir ekranda yazmıyor.
 *
 * ATAMALAR MEVCUT YOLDAN GEÇİYOR (`assignAdAccount` / `assignSocialProfile`)
 * — ikinci bir atama yolu yazılmadı. O yol izlemeyi açıyor ve 90 günlük
 * geçmişi kuyruğa alıyor; kopyalamak, o iki adımın bir gün birinde
 * unutulması demekti.
 */
export const clientSetupSchema = createClientSchema.extend({
  /** Havuzdan bu müşteriye atanacak reklam hesapları. */
  adAccountIds: z.array(z.string().uuid()).max(50).default([]),
  /** Havuzdan atanacak Facebook sayfaları / Instagram hesapları. */
  socialProfileIds: z.array(z.string().uuid()).max(50).default([]),
  /**
   * Müşteriye teslim edilecek giriş hesabı. Verilmezse oluşturulmuyor.
   *
   * Rol SABİT `client_viewer` ve istemciden ALINMIYOR: buradan rol seçilebilse
   * müşteriye ajans yetkisi verilebilirdi ve o hesap teslim ediliyor.
   */
  clientUser: z
    .object({
      email: z.string().trim().email().max(255),
      fullName: z.string().trim().min(2).max(120),
      password: z.string().min(10).max(200),
    })
    .optional(),
});
export type ClientSetupInput = z.infer<typeof clientSetupSchema>;

/** Sihirbazın sonucu — hangi adımın ne yaptığı AYRI AYRI dönüyor. */
export interface ClientSetupResult {
  clientId: string;
  name: string;
  /** Atanan reklam hesabı sayısı. */
  assignedAccounts: number;
  /** Atanan sayfa/Instagram sayısı. */
  assignedProfiles: number;
  /** Müşteri kullanıcısı oluşturuldu mu. */
  userCreated: boolean;
  /**
   * Atanamayan kayıtlar ve SEBEPLERİ.
   *
   * Sessiz atlama YOK: müşteri açıldı ama üç hesaptan biri atanamadıysa
   * kullanıcı bunu ekranda görmeli. "Kuruldu" deyip eksik bırakmak, veri
   * gelmediğinde sebebin aranacağı yeri gizlerdi.
   */
  failures: Array<{ kind: 'adAccount' | 'socialProfile' | 'user'; id: string; reason: string }>;
}
