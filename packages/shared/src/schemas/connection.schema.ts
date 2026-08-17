import { z } from 'zod';
import { PLATFORMS } from '../constants/platforms';

export const platformSchema = z.enum(PLATFORMS);

export const startOAuthSchema = z.object({
  platform: platformSchema,
  /** Yetkilendirme sonrası dönülecek panel yolu. Yalnızca göreli yol kabul edilir. */
  redirectTo: z
    .string()
    .max(512)
    .regex(/^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/, 'Yalnızca göreli yol kabul edilir')
    .optional(),
  /** needs_reauth durumunda onay ekranını zorla. */
  forceReconsent: z.boolean().optional(),
});
export type StartOAuthInput = z.infer<typeof startOAuthSchema>;

export const toggleAccountSyncSchema = z.object({
  syncEnabled: z.boolean(),
});
export type ToggleAccountSyncInput = z.infer<typeof toggleAccountSyncSchema>;

/**
 * Havuzdaki bir kaydı (reklam hesabı ya da sayfa) müşteriye atama gövdesi.
 *
 * İkisi için TEK şema: alan da kural da aynı ve ayrı iki şema, birine eklenen
 * bir doğrulamanın diğerinde unutulmasına giden en kısa yol olurdu.
 */
export const assignToClientSchema = z.object({
  /**
   * null = havuza geri koy (atamayı kaldır).
   *
   * Ayrı bir "kaldır" uç noktası açmadık: atama ve kaldırma aynı alanın iki
   * değeri ve ikisini iki uç noktaya bölmek, arayüzde bir seçicinin iki farklı
   * çağrı yapması demekti.
   */
  clientId: z.string().uuid().nullable(),
});
export type AssignToClientInput = z.infer<typeof assignToClientSchema>;

/**
 * Sayfanın BOOST FATURALANDIRMA hesabı.
 *
 * BU ŞEMA VARDI AMA UÇ NOKTASI YOKTU. `social_profiles.linked_ad_account_id`
 * kolonu sekiz yerde OKUNUYOR (aday üretimi, elle boost, gönderi listesi,
 * kural doğrulaması) ama hiçbir yerde yazılmıyordu — ne uç nokta ne düğme.
 * Sonucu: boost'un zorunlu ön koşulu ayarlanamıyor ve ekran her gönderide
 * "bu sayfaya bağlı bir reklam hesabı yok" diyor. `sync_enabled` ile birebir
 * aynı boşluk ve ikisi de aynı gün bulundu.
 *
 * Yanlış hesap, başka bir müşterinin bütçesinden harcamak demek ve geri
 * alınamıyor: Meta'da oluşmuş kampanya silinse bile harcanan para dönmüyor.
 * Bu yüzden müşteri ve platform eşleşmesi SUNUCUDA doğrulanıyor.
 */
export const linkBoostAccountSchema = z.object({
  /** null = bağlantıyı kaldır. */
  adAccountId: z.string().uuid().nullable(),
});
export type LinkBoostAccountInput = z.infer<typeof linkBoostAccountSchema>;

// -----------------------------------------------------------------------------
// Yanıt tipleri
// -----------------------------------------------------------------------------

export type ConnectionStatusValue = 'active' | 'needs_reauth' | 'revoked' | 'error';
export type AdAccountStatusValue = 'active' | 'paused' | 'disabled' | 'closed' | 'unknown';
export type SocialProfileTypeValue = 'facebook_page' | 'instagram_business';

export interface AdAccountSummary {
  id: string;
  platform: 'meta' | 'google';
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  status: AdAccountStatusValue;
  syncEnabled: boolean;
  isManager: boolean;
  lastInsightsSyncAt: string | null;
  /**
   * Atandığı müşteri. null = ajansın HAVUZUNDA, henüz atanmamış.
   *
   * Ajansın tek Meta kimliği 157 reklam hesabına erişiyor ve bunların çoğu
   * hiçbir zaman atanmayacak. Atanmamış hesap senkronize EDİLMEZ.
   */
  clientId: string | null;
  clientName: string | null;
}

export interface SocialProfileSummary {
  id: string;
  profileType: SocialProfileTypeValue;
  externalId: string;
  name: string;
  username: string | null;
  pictureUrl: string | null;
  linkedAdAccountId: string | null;
  syncEnabled: boolean;
  /**
   * Atandığı müşteri. null = ajansın HAVUZUNDA.
   *
   * Reklam hesaplarıyla aynı model. Atanmamış sayfa senkronize edilmez ve
   * üzerine form/reklam kurulamaz — organik gönderi, lead ve form satırları
   * müşteri kimliği taşıyor.
   */
  clientId: string | null;
  clientName: string | null;
}

export interface ConnectionSummary {
  id: string;
  platform: 'meta' | 'google';
  accountLabel: string;
  status: ConnectionStatusValue;
  /** ÇEKİRDEK izinlerden eksik olanlar. Dolu ise bağlantı iş görmez. */
  missingScopes: string[];
  /**
   * ÖZELLİK izinlerinden eksik olanlar (Auto-Boost).
   *
   * Bunlar bağlantıyı bozmaz — yalnızca ilgili özellik kullanılamaz. Meta App
   * Review izinleri tek tek onayladığı için aşamalı başvuru normaldir ve
   * kullanıcıya "bozuk" gibi gösterilmemeli.
   */
  missingOptionalScopes: string[];
  tokenExpiresAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  connectedAt: string;
  adAccounts: AdAccountSummary[];
  socialProfiles: SocialProfileSummary[];
}

/** Platform yapılandırılmış mı — UI butonu buna göre aktif/pasif olur. */
export interface ProviderAvailability {
  platform: 'meta' | 'google';
  configured: boolean;
  /** Yapılandırma eksikse ne gerektiği. */
  missingConfig: string[];
  requiredScopes: string[];
  /** Özellik bazlı ek izinler (Meta: Auto-Boost). */
  optionalScopes: string[];
}
