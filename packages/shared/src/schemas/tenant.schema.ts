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
});
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
