import { z } from 'zod';
import { ROLES } from '../auth/roles';

/**
 * Şifre politikası.
 *
 * Karmaşıklık kurallarını bilerek hafif tutuyoruz; asıl güvenlik uzunluktan
 * ve argon2id'den geliyor. Aşırı karmaşıklık kuralları kullanıcıyı
 * "Sifre123!" gibi tahmin edilebilir kalıplara iter.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Şifre en az 12 karakter olmalı')
  .max(128, 'Şifre en fazla 128 karakter olabilir')
  .refine((v) => /[a-zA-Z]/.test(v), 'Şifre en az bir harf içermeli')
  .refine((v) => /[0-9]/.test(v), 'Şifre en az bir rakam içermeli');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Geçerli bir e-posta adresi girin')
  .max(255);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Şifre gerekli').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** İlk kurulum: organizasyon + owner kullanıcı birlikte oluşur. */
export const registerOrganizationSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(255),
  fullName: z.string().trim().min(2).max(120),
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const createInvitationSchema = z
  .object({
    email: emailSchema,
    role: z.enum(ROLES),
    /** null => org geneli erişim. Sadece owner/admin rolleri için geçerli. */
    clientId: z.string().uuid().nullable(),
  })
  .refine(
    (v) => v.clientId !== null || v.role === 'owner' || v.role === 'admin',
    {
      message: 'Org geneli erişim yalnızca owner ve admin rollerine verilebilir',
      path: ['clientId'],
    },
  );
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const requestPasswordResetSchema = z.object({ email: emailSchema });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z.object({
  token: z.string().min(20).max(255),
  password: passwordSchema,
});
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Client switcher. null => org geneli görünüm (yalnızca owner/admin). */
export const switchClientSchema = z.object({
  clientId: z.string().uuid().nullable(),
});
export type SwitchClientInput = z.infer<typeof switchClientSchema>;
