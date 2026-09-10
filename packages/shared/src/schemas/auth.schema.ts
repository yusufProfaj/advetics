import { z } from 'zod';
import { ROLES, isOrgScopedRole } from '../auth/roles';

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
  /**
   * "Beni hatırla".
   *
   * VARSAYILANI `true` ÇÜNKÜ BU, CHECKBOX EKLENMEDEN ÖNCEKİ DAVRANIŞ.
   * Giriş cookie'si her zaman `maxAge` ile yazılıyordu, yani herkes zaten
   * hatırlanıyordu. Varsayılanı `false` yapmak, bu alanı göndermeyen HER
   * çağıranı (eski istemci, entegrasyon testi, curl) sessizce "tarayıcı
   * kapanınca çık" davranışına geçirirdi — kimsenin istemediği bir
   * regresyon ve belirtisi yalnızca "sürekli çıkış yapıyorum".
   *
   * `false` geldiğinde oturum cookie'leri `maxAge`SİZ yazılıyor: tarayıcı
   * kapanınca ölüyorlar.
   */
  rememberMe: z.boolean().default(true),
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

/**
 * Ekibe kullanıcı ekleme — DAVET DEĞİL, DOĞRUDAN OLUŞTURMA.
 *
 * Davet akışı kaldırıldı çünkü üretimde çalışmıyordu: token üretiliyor,
 * hash'lenip saklanıyor ve düz metni ATILIYORDU (yalnızca geliştirme
 * ortamında loglanıyordu). E-posta altyapısı olmadığı için kimsenin daveti
 * kabul etmesine imkân yoktu — panel bunu ekranda itiraf ediyordu bile.
 * Kullanılamayan bir akışı ayakta tutmak, çalışıyor sanılmasına yol açıyor.
 *
 * Parolayı ekleyen yönetici belirliyor ve kullanıcıya kendi iletiyor.
 *
 * BİLİNEN AÇIK: ilk girişte parola değiştirme ZORLANMIYOR. `mustChangePassword`
 * alanı şemada var ama okuyan tek satır yok, yani ekleyenin bildiği parola
 * süresiz geçerli kalıyor. Bilinçli olarak sonraya bırakıldı; zorlama
 * yazılana kadar bu bir güven varsayımıdır.
 */
export const createMemberSchema = z
  .object({
    email: emailSchema,
    fullName: z.string().trim().min(2).max(120),
    password: passwordSchema,
    role: z.enum(ROLES),
    /** null => org geneli erişim. Sadece owner/admin rolleri için geçerli. */
    clientId: z.string().uuid().nullable(),
  })
  .refine((v) => v.clientId !== null || isOrgScopedRole(v.role), {
    /*
     * KURAL TERS: `client_viewer` DIŞINDA herkes şirket seviyesinde
     * yetkilendirilebilir. Ayırt eden şey rolün genişliği değil, KİMİN
     * hesabı olduğu — `client_viewer` müşterinin kendi giriş hesabı ve
     * onun sınırı tam olarak workspace.
     *
     * `ORG_SCOPED_ROLES`tan TÜRETİLİYOR, rol adları burada TEKRAR
     * YAZILMIYOR: iki liste ayrışırsa uygulama izin verdiği bir satırı
     * veritabanı `memberships_org_scope_role_chk` ile reddeder.
     */
    message: 'Müşteri hesabı (Görüntüleyici) bir workspace’e bağlanmak zorunda',
    path: ['clientId'],
  });
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/**
 * MEVCUT bir kullanıcıya yeni bir müşteri yetkisi verir.
 *
 * `createMemberSchema`den AYRI olmasının sebebi PAROLA. O şema parolayı
 * zorunlu istiyor — yeni kullanıcı oluşturuyor çünkü. Var olan birine yetki
 * eklerken parola hiçbir işe yaramıyor (sunucu zaten dokunmuyor) ama form
 * istediği için yönetici boşa bir parola uydurmak zorunda kalıyordu. Uydurulan
 * ve hiçbir yere yazılmayan bir alan, arayüzün en hızlı güven kaybetme yolu.
 *
 * Bir kişi birden çok müşteride farklı rollerde olabilir; bu yüzden eklenen
 * şey kullanıcı değil, kullanıcı × müşteri eşleşmesi.
 */
export const createMembershipSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(ROLES),
    /** null => org geneli erişim. Sadece owner/admin rolleri için geçerli. */
    clientId: z.string().uuid().nullable(),
  })
  .refine((v) => v.clientId !== null || isOrgScopedRole(v.role), {
    // Gerekçe `createMemberSchema`da; iki şema aynı kuralı AYNI kaynaktan
    // okuyor.
    message: 'Müşteri hesabı (Görüntüleyici) bir workspace’e bağlanmak zorunda',
    path: ['clientId'],
  });
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

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

/**
 * Şirket değiştirici — üst hesap (MCC) altındaki kardeş şirketlere geçiş.
 *
 * `null` = EV şirketine dön. Ayrı bir "eve dön" ucu yazmak, iki yolun
 * bir gün ayrışması demekti.
 */
/** "Tüm şirketler" görünümünün sentinel değeri. */
export const TUM_SIRKETLER = 'all' as const;

export const switchOrganizationSchema = z.object({
  /**
   * `null` = EV şirketi, `'all'` = TÜM ŞİRKETLER, UUID = o şirket.
   *
   * Sentinel bir DİZGE çünkü `null` zaten "eve dön" anlamını taşıyor ve
   * üçüncü bir hâli ikinci bir alanla anlatmak, iki alanın birbiriyle
   * çelişebildiği bir yüzey açardı.
   */
  organizationId: z.union([z.string().uuid(), z.literal(TUM_SIRKETLER)]).nullable(),
});
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;
