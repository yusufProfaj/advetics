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
}

export interface ConnectionSummary {
  id: string;
  platform: 'meta' | 'google';
  accountLabel: string;
  status: ConnectionStatusValue;
  /** Zorunlu ama verilmemiş scope'lar. Dolu ise bağlantı iş görmez. */
  missingScopes: string[];
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
}
