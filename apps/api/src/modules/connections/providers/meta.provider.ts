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
import { parseMetaRateLimit, platformFetch } from './http';

/**
 * Graph API sayfalı yanıtı.
 *
 * Bu tipi INLINE generic olarak yazmak TS7022 döngüsel çıkarım hatası veriyordu:
 * döngü sonundaki `cursor = body.paging?.next` ataması, `cursor`un akış tipini
 * o çağrıdan çıkarılan `data`ya bağlıyor. Adlandırılmış tip bağı koparıyor.
 */
interface GraphPage {
  data?: Array<Record<string, unknown>>;
  paging?: { next?: string };
}

/**
 * Meta (Facebook / Instagram) — Marketing API adapter'ı.
 *
 * Kapsam: reklam hesabı keşfi, sayfa/Instagram profili keşfi, token yaşam
 * döngüsü. Kampanya okuma/yazma Modül 3–4'te bu sınıfa eklenecek.
 */
@Injectable()
export class MetaProvider implements IAdPlatformProvider {
  readonly platform: Platform = 'meta';
  private readonly logger = new Logger(MetaProvider.name);

  /**
   * Zorunlu scope'lar. Her biri App Review'da ayrı ayrı gerekçelendirilmeli.
   *
   * `ads_management` yazma (bütçe/durum değiştirme, Modül 5) için,
   * `ads_read` okuma için, `business_management` müşteri Business Manager'ına
   * erişim için, `pages_*` + `instagram_*` Auto-Boost (Modül 7) için.
   */
  readonly requiredScopes = [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_show_list',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_insights',
  ] as const;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  private get meta() {
    return this.config.platforms.meta;
  }

  private get graph(): string {
    return `https://graph.facebook.com/${this.meta.apiVersion}`;
  }

  isConfigured(): boolean {
    return Boolean(this.meta.appId && this.meta.appSecret);
  }

  private assertConfigured(): { appId: string; appSecret: string } {
    if (!this.meta.appId || !this.meta.appSecret) {
      throw new PlatformApiError(
        'meta',
        'permanent',
        'Meta uygulaması yapılandırılmamış: META_APP_ID ve META_APP_SECRET gerekli',
      );
    }
    return { appId: this.meta.appId, appSecret: this.meta.appSecret };
  }

  buildAuthorizeUrl({ state, redirectUri, forceReconsent }: AuthorizeUrlParams): string {
    const { appId } = this.assertConfigured();
    const url = new URL(`https://www.facebook.com/${this.meta.apiVersion}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.requiredScopes.join(','));
    // Kullanıcı daha önce izin verdiyse Meta ekranı atlar; yeniden
    // yetkilendirmede (needs_reauth) bu istenmez — eksik scope'u düzeltmek için
    // ekranın gösterilmesi gerekir.
    if (forceReconsent) url.searchParams.set('auth_type', 'rerequest');
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const { appId, appSecret } = this.assertConfigured();

    const url = new URL(`${this.graph}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code', code);

    const { data } = await platformFetch<{ access_token: string; expires_in?: number }>(
      'meta',
      url.toString(),
      {},
      parseMetaRateLimit,
    );

    // Kod değişiminden gelen token kısa ömürlüdür (~1-2 saat). Uzun ömürlüye
    // (~60 gün) takas ediyoruz; aksi halde bağlantı aynı gün ölür.
    const longLived = await this.exchangeForLongLivedToken(data.access_token);
    return this.describeToken(longLived.accessToken, longLived.expiresAt);
  }

  /**
   * Meta'da refresh token yoktur. Uzun ömürlü token'ın kendisi
   * `fb_exchange_token` ile tazelenir — süresi dolmadan yapılırsa yeni bir
   * 60 günlük token verir.
   */
  async refreshTokens(tokens: { accessToken: string }): Promise<OAuthTokens> {
    const refreshed = await this.exchangeForLongLivedToken(tokens.accessToken);
    return this.describeToken(refreshed.accessToken, refreshed.expiresAt);
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<{ accessToken: string; expiresAt?: Date }> {
    const { appId, appSecret } = this.assertConfigured();

    const url = new URL(`${this.graph}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    const { data } = await platformFetch<{ access_token: string; expires_in?: number }>(
      'meta',
      url.toString(),
      {},
      parseMetaRateLimit,
    );

    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  }

  /** Token'ın kime ait olduğunu ve hangi scope'ları taşıdığını okur. */
  private async describeToken(accessToken: string, expiresAt?: Date): Promise<OAuthTokens> {
    const verification = await this.verifyToken(accessToken);
    if (!verification.valid || !verification.externalUserId) {
      throw new PlatformApiError('meta', 'invalid_token', 'Alınan token doğrulanamadı');
    }

    let accountLabel = `Meta ${verification.externalUserId}`;
    try {
      const { data } = await platformFetch<{ name?: string }>(
        'meta',
        `${this.graph}/me?fields=name&access_token=${encodeURIComponent(accessToken)}`,
        {},
        parseMetaRateLimit,
      );
      if (data.name) accountLabel = data.name;
    } catch {
      // İsim kozmetik — alınamazsa bağlantıyı bozmuyoruz.
    }

    return {
      accessToken,
      expiresAt: expiresAt ?? verification.expiresAt,
      grantedScopes: verification.grantedScopes ?? [],
      externalUserId: verification.externalUserId,
      accountLabel,
    };
  }

  async verifyToken(accessToken: string): Promise<TokenVerification> {
    const { appId, appSecret } = this.assertConfigured();

    const url = new URL(`${this.graph}/debug_token`);
    url.searchParams.set('input_token', accessToken);
    // App access token: uygulamanın kendi kimliği. Kullanıcı token'ını
    // doğrulamak için gereken yetki bu.
    url.searchParams.set('access_token', `${appId}|${appSecret}`);

    try {
      const { data } = await platformFetch<{
        data: {
          is_valid: boolean;
          user_id?: string;
          scopes?: string[];
          expires_at?: number;
        };
      }>('meta', url.toString(), {}, parseMetaRateLimit);

      const d = data.data;
      const granted = d.scopes ?? [];
      const missing = this.requiredScopes.filter((s) => !granted.includes(s));

      return {
        valid: d.is_valid === true,
        externalUserId: d.user_id,
        grantedScopes: granted,
        // expires_at = 0 → süresiz (uygulama token'ı veya sistem kullanıcısı)
        expiresAt: d.expires_at && d.expires_at > 0 ? new Date(d.expires_at * 1000) : undefined,
        missingScopes: missing.length ? missing : undefined,
      };
    } catch (err) {
      if (err instanceof PlatformApiError && err.kind === 'invalid_token') {
        return { valid: false };
      }
      throw err;
    }
  }

  async listAdAccounts(accessToken: string): Promise<DiscoveredAdAccount[]> {
    const fields = [
      'id',
      'account_id',
      'name',
      'account_status',
      'currency',
      'timezone_name',
      'business',
    ].join(',');

    const accounts: DiscoveredAdAccount[] = [];
    let next: string | undefined =
      `${this.graph}/me/adaccounts?fields=${fields}&limit=100&access_token=${encodeURIComponent(accessToken)}`;

    // Sayfalama: bir Business Manager'da 100'den fazla hesap olabilir.
    // Sonsuz döngüye karşı sert bir üst sınır koyuyoruz.
    let pages = 0;
    while (next && pages < 25) {
      const res = await platformFetch<GraphPage>('meta', next, {}, parseMetaRateLimit);
      const body: GraphPage = res.data;

      for (const raw of body.data ?? []) {
        accounts.push({
          // Meta `act_123456789` döner; API çağrılarında bu prefix'li hâli gerekir.
          externalId: String(raw.id),
          name: String(raw.name ?? raw.id),
          currency: String(raw.currency ?? 'USD').toUpperCase().slice(0, 3),
          timezone: String(raw.timezone_name ?? 'UTC'),
          status: this.mapAccountStatus(Number(raw.account_status)),
          managerExternalId:
            raw.business && typeof raw.business === 'object'
              ? String((raw.business as Record<string, unknown>).id ?? '') || undefined
              : undefined,
          raw,
        });
      }

      next = body.paging?.next;
      pages++;
    }

    if (pages >= 25) {
      this.logger.warn('Meta hesap listesi 25 sayfada kesildi — beklenenden fazla hesap var');
    }

    return accounts;
  }

  /**
   * Meta'nın sayısal `account_status` değerlerini ortak dile çevirir.
   * 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW,
   * 8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED
   */
  private mapAccountStatus(status: number): NormalizedAccountStatus {
    if (status === 1) return 'active';
    if (status === 2) return 'disabled';
    if (status === 101 || status === 100) return 'closed';
    if ([3, 7, 8, 9].includes(status)) return 'paused';
    return 'unknown';
  }

  /**
   * Facebook sayfaları ve her sayfaya bağlı Instagram Business hesabı.
   *
   * Sayfa token'ları kullanıcı token'ından ayrıdır ve Auto-Boost'ta organik
   * post metriklerini okumak için gerekir — ayrı şifrelenerek saklanır.
   */
  async listSocialProfiles(accessToken: string): Promise<DiscoveredSocialProfile[]> {
    const profiles: DiscoveredSocialProfile[] = [];

    const fields = [
      'id',
      'name',
      'username',
      'access_token',
      'picture{url}',
      'instagram_business_account{id,username,name,profile_picture_url}',
    ].join(',');

    let next: string | undefined =
      `${this.graph}/me/accounts?fields=${fields}&limit=100&access_token=${encodeURIComponent(accessToken)}`;
    let pages = 0;

    while (next && pages < 10) {
      const res = await platformFetch<GraphPage>('meta', next, {}, parseMetaRateLimit);
      const body: GraphPage = res.data;

      for (const raw of body.data ?? []) {
        const picture = raw.picture as { data?: { url?: string } } | undefined;

        profiles.push({
          profileType: 'facebook_page',
          externalId: String(raw.id),
          name: String(raw.name ?? raw.id),
          username: raw.username ? String(raw.username) : undefined,
          pictureUrl: picture?.data?.url,
          pageAccessToken: raw.access_token ? String(raw.access_token) : undefined,
          raw,
        });

        const ig = raw.instagram_business_account as Record<string, unknown> | undefined;
        if (ig?.id) {
          profiles.push({
            profileType: 'instagram_business',
            externalId: String(ig.id),
            name: String(ig.name ?? ig.username ?? ig.id),
            username: ig.username ? String(ig.username) : undefined,
            pictureUrl: ig.profile_picture_url ? String(ig.profile_picture_url) : undefined,
            // IG Business hesabına erişim, bağlı olduğu SAYFANIN token'ı ile olur.
            pageAccessToken: raw.access_token ? String(raw.access_token) : undefined,
            raw: ig,
          });
        }
      }

      next = body.paging?.next;
      pages++;
    }

    return profiles;
  }
}
