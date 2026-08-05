import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Platform } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import {
  PlatformApiError,
  type AuthorizeUrlParams,
  type DiscoveredAdAccount,
  type DiscoveredSocialProfile,
  type IAdPlatformProvider,
  type NormalizedAccountStatus,
  type OAuthTokens,
  type TokenVerification,
} from '../provider.types';
import { platformFetch } from './http';

/**
 * Google Ads adapter'ı.
 *
 * Meta'dan üç önemli farkı var ve bu farklar tasarımı belirliyor:
 *
 *   1. Access token 1 SAATTE dolar → refresh token zorunlu. `access_type=offline`
 *      olmadan refresh token hiç gelmez ve bağlantı bir saat sonra ölür.
 *   2. Her istek `developer-token` header'ı ister. Bu token'ın Basic Access
 *      onayı olmadan yalnızca test hesapları görünür.
 *   3. Hesap listesi iki adımdır: `listAccessibleCustomers` yalnızca id verir,
 *      isim/para birimi/zaman dilimi için ayrıca GAQL sorgusu gerekir.
 */
@Injectable()
export class GoogleProvider implements IAdPlatformProvider {
  readonly platform: Platform = 'google';
  private readonly logger = new Logger(GoogleProvider.name);

  /** Google Ads API için tek scope yeterli. */
  readonly requiredScopes = ['https://www.googleapis.com/auth/adwords'] as const;

  /** Google'da özellik bazlı ek scope yok — tek scope her şeyi kapsıyor. */
  readonly optionalScopes = [] as const;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  private get google() {
    return this.config.platforms.google;
  }

  private get adsBase(): string {
    return `https://googleads.googleapis.com/${this.google.apiVersion}`;
  }

  isConfigured(): boolean {
    return Boolean(this.google.clientId && this.google.clientSecret && this.google.developerToken);
  }

  private assertConfigured(): {
    clientId: string;
    clientSecret: string;
    developerToken: string;
  } {
    const { clientId, clientSecret, developerToken } = this.google;
    if (!clientId || !clientSecret || !developerToken) {
      throw new PlatformApiError(
        'google',
        'permanent',
        'Google yapılandırılmamış: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ve GOOGLE_ADS_DEVELOPER_TOKEN gerekli',
      );
    }
    return { clientId, clientSecret, developerToken };
  }

  buildAuthorizeUrl({ state, redirectUri, forceReconsent }: AuthorizeUrlParams): string {
    const { clientId } = this.assertConfigured();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.requiredScopes.join(' '));
    url.searchParams.set('state', state);
    // access_type=offline: refresh token'ın ÖN KOŞULU. Olmadan access token
    // bir saatte dolar ve bağlantı kurtarılamaz.
    url.searchParams.set('access_type', 'offline');
    // prompt=consent: Google refresh token'ı YALNIZCA ilk onayda verir.
    // Kullanıcı daha önce onay verdiyse, bunu zorlamadan refresh token gelmez.
    url.searchParams.set('prompt', forceReconsent === false ? 'select_account' : 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = this.assertConfigured();

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const { data } = await platformFetch<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>('google', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!data.refresh_token) {
      // Sessizce devam etmek, bir saat sonra kurtarılamaz bir bağlantı bırakır.
      // Kullanıcıyı hemen doğru akışa yönlendirmek daha iyi.
      throw new PlatformApiError(
        'google',
        'permanent',
        'Google refresh token döndürmedi. Bu genelde uygulamaya daha önce izin verilmiş olmasından kaynaklanır. ' +
          'https://myaccount.google.com/permissions adresinden Advetics erişimini kaldırıp tekrar bağlan.',
      );
    }

    return this.describeToken(data.access_token, data.refresh_token, data.expires_in, data.scope);
  }

  async refreshTokens(tokens: { accessToken: string; refreshToken?: string }): Promise<OAuthTokens> {
    const { clientId, clientSecret } = this.assertConfigured();
    if (!tokens.refreshToken) {
      throw new PlatformApiError(
        'google',
        'invalid_token',
        'Refresh token yok — bağlantı yeniden kurulmalı',
      );
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    });

    const { data } = await platformFetch<{
      access_token: string;
      expires_in?: number;
      scope?: string;
    }>('google', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    // Yenileme yanıtı refresh token içermez — mevcut olanı koruyoruz.
    return this.describeToken(data.access_token, tokens.refreshToken, data.expires_in, data.scope);
  }

  private async describeToken(
    accessToken: string,
    refreshToken: string,
    expiresIn?: number,
    scope?: string,
  ): Promise<OAuthTokens> {
    const verification = await this.verifyToken(accessToken);

    let externalUserId = verification.externalUserId ?? '';
    let accountLabel = 'Google Ads';

    // Hangi hesaplara erişim var — etiket için ilk müşteri kimliğini kullanıyoruz.
    try {
      const customers = await this.listAccessibleCustomerIds(accessToken);
      if (customers.length > 0) {
        externalUserId = externalUserId || customers[0]!;
        accountLabel =
          customers.length === 1
            ? `Google Ads ${this.formatCustomerId(customers[0]!)}`
            : `Google Ads (${customers.length} hesap)`;
      }
    } catch (err) {
      this.logger.warn(
        `Google hesap listesi alınamadı: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!externalUserId) {
      throw new PlatformApiError(
        'google',
        'permanent',
        'Google hesabı belirlenemedi. Developer token Basic Access onayı olmadan yalnızca test hesapları görünür.',
      );
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      grantedScopes: scope ? scope.split(' ') : [...this.requiredScopes],
      externalUserId,
      accountLabel,
    };
  }

  async verifyToken(accessToken: string): Promise<TokenVerification> {
    try {
      const { data } = await platformFetch<{
        sub?: string;
        scope?: string;
        expires_in?: string;
        email?: string;
      }>(
        'google',
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      );

      const granted = data.scope ? data.scope.split(' ') : [];
      const missing = this.requiredScopes.filter((s) => !granted.includes(s));

      return {
        valid: true,
        externalUserId: data.sub,
        grantedScopes: granted,
        expiresAt: data.expires_in
          ? new Date(Date.now() + Number(data.expires_in) * 1000)
          : undefined,
        missingScopes: missing.length ? missing : undefined,
      };
    } catch (err) {
      if (
        err instanceof PlatformApiError &&
        (err.kind === 'invalid_token' || err.kind === 'permanent')
      ) {
        return { valid: false };
      }
      throw err;
    }
  }

  /** Erişilebilir müşteri kimlikleri — yalnızca id döner, detay yok. */
  private async listAccessibleCustomerIds(accessToken: string): Promise<string[]> {
    const { developerToken } = this.assertConfigured();

    const { data } = await platformFetch<{ resourceNames?: string[] }>(
      'google',
      `${this.adsBase}/customers:listAccessibleCustomers`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      },
    );

    // "customers/1234567890" → "1234567890"
    return (data.resourceNames ?? []).map((n) => n.split('/')[1] ?? '').filter(Boolean);
  }

  async listAdAccounts(accessToken: string): Promise<DiscoveredAdAccount[]> {
    const { developerToken } = this.assertConfigured();
    const customerIds = await this.listAccessibleCustomerIds(accessToken);
    const accounts: DiscoveredAdAccount[] = [];

    // İkinci adım: her müşteri için detay. Tek bir GAQL sorgusu ile hepsini
    // birden almak mümkün değil — `customer` kaynağı yalnızca sorgulanan
    // müşterinin kendisini döndürür.
    for (const customerId of customerIds) {
      try {
        const { data } = await platformFetch<{
          results?: Array<{ customer?: Record<string, unknown> }>;
        }>('google', `${this.adsBase}/customers/${customerId}/googleAds:search`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              SELECT customer.id, customer.descriptive_name, customer.currency_code,
                     customer.time_zone, customer.manager, customer.status
              FROM customer
              LIMIT 1
            `.trim(),
          }),
        });

        const c = data.results?.[0]?.customer;
        if (!c) continue;

        // Yönetici (MCC) hesapları reklam yayınlamaz — listeye alıyoruz ama
        // senkronizasyon için anlamsız oldukları not düşülüyor.
        const isManager = c.manager === true;

        accounts.push({
          externalId: customerId,
          name: String(c.descriptiveName ?? c.descriptive_name ?? this.formatCustomerId(customerId)),
          currency: String(c.currencyCode ?? c.currency_code ?? 'USD')
            .toUpperCase()
            .slice(0, 3),
          timezone: String(c.timeZone ?? c.time_zone ?? 'UTC'),
          status: this.mapAccountStatus(String(c.status ?? ''), isManager),
          managerExternalId: isManager ? customerId : undefined,
          raw: c,
        });
      } catch (err) {
        // Bir hesabın detayı alınamazsa (izin yok, hesap kapanmış) diğerlerini
        // düşürmüyoruz — kısmi liste, boş listeden iyidir.
        this.logger.warn(
          `Google müşteri ${customerId} detayı alınamadı: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return accounts;
  }

  private mapAccountStatus(status: string, isManager: boolean): NormalizedAccountStatus {
    if (isManager) return 'paused'; // MCC reklam yayınlamaz
    switch (status.toUpperCase()) {
      case 'ENABLED':
        return 'active';
      case 'CANCELED':
      case 'CLOSED':
        return 'closed';
      case 'SUSPENDED':
      case 'DISABLED':
        return 'disabled';
      default:
        return 'unknown';
    }
  }

  /** 1234567890 → 123-456-7890 (Google arayüzündeki gösterim). */
  private formatCustomerId(id: string): string {
    return id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
  }

  /** Google'da sosyal profil kavramı yok — Auto-Boost yalnızca Meta'da. */
  async listSocialProfiles(): Promise<DiscoveredSocialProfile[]> {
    return [];
  }
}
