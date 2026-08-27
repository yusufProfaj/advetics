import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  demandGenAdGroupBody,
  demandGenCampaignBody,
  demandGenVideoAdBody,
  googleImageAssetBody,
  googleVideoAssetBody,
} from './google-demandgen';
import type { GeoLocationOption, Platform, SavedAudienceOption } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import {
  PlatformApiError,
  type AuthorizeUrlParams,
  type DiscoveredAd,
  type DiscoveredAdAccount,
  type DiscoveredAdGroup,
  type DiscoveredCampaign,
  type DiscoveredCreative,
  type DiscoveredSocialProfile,
  type DiscoveredInsightRow,
  type FetchContext,
  type IAdPlatformProvider,
  type InsightsLevel,
  type InsightsRequest,
  type BoostResult,
  type CreateAdResult,
  type DiscoveredOrganicPost,
  type DiscoveredKeywordRow,
  type DiscoveredSearchTermRow,
  type PlatformActionRequest,
  type PublishDraftRequest,
  type PublishDraftResult,
  type PlatformActionResult,
  type PlatformInsights,
  type NormalizedAccountStatus,
  type NormalizedBudgetMode,
  type NormalizedEntityStatus,
  type OAuthTokens,
  type PlatformStructure,
  type TokenVerification,
  BreakdownRequest,
  DiscoveredBreakdownRow,
  PlatformBreakdowns,
} from '../provider.types';
import { platformFetch } from './http';
import {
  adGroupBody,
  campaignBody,
  campaignBudgetBody,
  googleDate,
  keywordsBody,
  nameStamp,
  removeBody,
  responsiveSearchAdBody,
  resourceCollection,
  type GoogleMutateBody,
} from './google-write';

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
/**
 * Boyut → Google sorgu şekli.
 *
 * Meta'nın tek parametreli `breakdowns`ının aksine her boyut ayrı kaynak ya
 * da ayrı segment. Harita TEK YERDE ve eksik anahtar `unsupported` demek.
 */
/*
 * YARDIMCILAR MODÜL DÜZEYİNDE, sınıfın özel metotları DEĞİL.
 *
 * İlk hâlim haritadan `this.obj`/`this.str`e uzanıyordu ve onları dışa
 * açmak gerekiyordu — bir harita uğruna sınıfın yüzeyini genişletmek.
 */
function okuNesne(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function okuMetin(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

const GOOGLE_BREAKDOWN: Partial<
  Record<
    BreakdownRequest['dimension'],
    {
      kaynak: string;
      alan: string;
      deger: (row: Record<string, unknown>) => string | undefined;
    }
  >
> = {
  age: {
    kaynak: 'age_range_view',
    alan: 'ad_group_criterion.age_range.type',
    deger: (r) => okuMetin(okuNesne(okuNesne(r.adGroupCriterion)?.ageRange)?.type),
  },
  gender: {
    kaynak: 'gender_view',
    alan: 'ad_group_criterion.gender.type',
    deger: (r) => okuMetin(okuNesne(okuNesne(r.adGroupCriterion)?.gender)?.type),
  },
  placement: {
    // Google'da "yerleşim" en yakın karşılığı AĞ TÜRÜ: arama, arama ortağı,
    // görüntülü reklam ağı, YouTube. Meta'daki feed/story ayrımının dengi
    // `detail_placement_view` ama o yalnızca görüntülü reklam ağında dolu.
    kaynak: 'campaign',
    alan: 'segments.ad_network_type',
    deger: (r) => okuMetin(okuNesne(r.segments)?.adNetworkType),
  },
  hour: {
    kaynak: 'campaign',
    alan: 'segments.hour',
    deger: (r) => {
      const h = okuNesne(r.segments)?.hour;
      // 0 GEÇERLİ BİR SAAT. `if (!h)` yazmak gece yarısını sessizce düşürürdü.
      return h === undefined || h === null ? undefined : String(h).padStart(2, '0');
    },
  },
  city: {
    kaynak: 'geographic_view',
    alan: 'geographic_view.country_criterion_id, segments.geo_target_city',
    deger: (r) => {
      // `segments.geo_target_city` "geoTargetConstants/2035120" biçiminde;
      // kimlik son parça ve ada `geoAdlari` çeviriyor.
      const ham = okuMetin(okuNesne(r.segments)?.geoTargetCity);
      return ham?.split('/').pop();
    },
  },
};

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
        /**
         * ETİKETE SAYI YAZILMIYOR ve bu bilinçli.
         *
         * `listAccessibleCustomers` KÖK kimlikleri döndürüyor — çoğu yönetici
         * (MCC) hesabı ve `listAdAccounts` onları bilerek eliyor, çünkü
         * reklam yayınlamıyorlar. Etiket "28 hesap" yazdığında kart,
         * kullanıcıya reklam veremeyeceği şeyleri hesap diye sayıyordu:
         * başlıkta 28, hemen altındaki blokta "2 / 127", onun altında
         * "havuzdaki 125 hesap". Üç sayı, hiçbiri diğerini açıklamıyor.
         *
         * İkinci ve daha sinsi sorun: bu etiket YALNIZCA yetkilendirme
         * anında yazılıyor. `refreshAccounts` ona hiç dokunmuyor, yani
         * "Hesapları yenile" gerçek sayıyı günceller, etiketteki sayıyı
         * güncellemez ve ikisi zamanla sessizce ayrışır.
         *
         * Gerçek sayıyı zaten hesap seçici canlı veriden basıyor.
         */
        accountLabel =
          customers.length === 1 ? `Google Ads ${customerLabel(customers[0]!)}` : 'Google Ads';
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
        // SEBEP TEK DEĞİL ve tek sebep yazmak yanlış teşhis üretiyor: bu
        // mesaj "Basic Access yok" diyordu, oysa erişim 2026-08-16'da alındı.
        // Aynı hata artık yanlış hesapla giriş yapıldığında da çıkabiliyor.
        'Google hesabı belirlenemedi. Bu Google kullanıcısının erişebildiği bir Ads hesabı ' +
          'olmayabilir, ya da developer token yalnızca test hesaplarını görüyor olabilir. ' +
          'Tanı için: pnpm --filter @advetics/api google-check',
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

  /**
   * Google'ın iptal uç noktası.
   *
   * Refresh token iptal edilirse ona bağlı TÜM access token'lar da geçersiz
   * olur — o yüzden refresh token varsa onu tercih ediyoruz.
   */
  async revokeToken(tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    const target = tokens.refreshToken ?? tokens.accessToken;
    await platformFetch('google', 'https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: target }).toString(),
    });
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

  /**
   * GAQL sorgusu çalıştırır.
   *
   * `login-customer-id` başlığı KRİTİK: bir MCC'nin altındaki hesaba erişirken
   * Google, hangi yönetici hesabı üzerinden yetkilendiğini bilmek ister.
   * Başlık olmadan alt hesap sorguları PERMISSION_DENIED döner.
   */
  /**
   * Tek sayfalı GAQL sorgusu.
   *
   * `private` ama tanı aracı (`src/google-check.ts`) alan sondası için buna
   * erişiyor. Public yapmak, sağlayıcı arayüzüne ait olmayan bir metodu
   * sözleşmeye sokmak olurdu; tanı aracının tip kaçışı bilinçli ve tek yerde.
   */
  private async searchGaql<T>(
    accessToken: string,
    customerId: string,
    query: string,
    loginCustomerId?: string,
  ): Promise<T[]> {
    const { developerToken } = this.assertConfigured();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

    const { data } = await platformFetch<{ results?: T[] }>(
      'google',
      `${this.adsBase}/customers/${customerId}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query: query.trim() }) },
    );
    return data.results ?? [];
  }

  /**
   * Reklam hesaplarını keşfeder — MCC hiyerarşisi dâhil.
   *
   * İki adımlı olmak zorunda:
   *
   *   1. `listAccessibleCustomers` yalnızca kullanıcıya DOĞRUDAN bağlı hesapları
   *      verir. Bir ajansta bu genelde MCC'nin (yönetici hesabın) kendisidir.
   *   2. MCC reklam yayınlamaz. Gerçek reklam hesapları onun altındadır ve
   *      `customer_client` kaynağıyla, `login-customer-id` başlığı verilerek
   *      ayrıca sorgulanmalıdır.
   *
   * Bu adım atlanırsa ajans kullanıcısı yalnızca boş bir yönetici hesabı görür.
   */
  async listAdAccounts(accessToken: string): Promise<DiscoveredAdAccount[]> {
    const rootIds = await this.listAccessibleCustomerIds(accessToken);
    const accounts = new Map<string, DiscoveredAdAccount>();

    for (const rootId of rootIds) {
      let root: Record<string, unknown> | undefined;
      try {
        const rows = await this.searchGaql<{ customer?: Record<string, unknown> }>(
          accessToken,
          rootId,
          `SELECT customer.id, customer.descriptive_name, customer.currency_code,
                  customer.time_zone, customer.manager, customer.status
           FROM customer LIMIT 1`,
          rootId,
        );
        root = rows[0]?.customer;
      } catch (err) {
        this.logger.warn(
          `Google müşteri ${customerLabel(rootId)} okunamadı: ${errText(err)}`,
        );
        continue;
      }
      if (!root) continue;

      const isManager = root.manager === true;

      if (!isManager) {
        // Doğrudan erişilen normal reklam hesabı.
        accounts.set(rootId, this.toAdAccount(rootId, root, undefined));
        continue;
      }

      // Yönetici hesap: altındaki tüm hesapları çıkar.
      //
      // customer_client hiyerarşinin TAMAMINI döndürür (level>1 dâhil), yani
      // MCC altındaki alt-MCC'lerin hesapları da tek sorguda gelir. Ayrı ayrı
      // dolaşmak gereksiz kota harcamak olurdu.
      try {
        const children = await this.searchGaql<{
          customerClient?: Record<string, unknown>;
        }>(
          accessToken,
          rootId,
          `SELECT customer_client.client_customer, customer_client.descriptive_name,
                  customer_client.currency_code, customer_client.time_zone,
                  customer_client.manager, customer_client.status, customer_client.level
           FROM customer_client
           WHERE customer_client.status = 'ENABLED'`,
          rootId,
        );

        let added = 0;
        for (const row of children) {
          const c = row.customerClient;
          if (!c) continue;
          // Yönetici hesapları listeye alınmaz — reklam yayınlamazlar ve
          // senkronize etmek anlamsız kota tüketimi olur.
          if (c.manager === true) continue;

          // "customers/1234567890" → "1234567890"
          const resource = String(c.clientCustomer ?? '');
          const childId = resource.includes('/') ? resource.split('/')[1]! : resource;
          if (!childId) continue;

          accounts.set(childId, this.toAdAccount(childId, c, rootId));
          added++;
        }
        this.logger.log(
          `Google MCC ${customerLabel(rootId)} altında ${added} reklam hesabı bulundu`,
        );
      } catch (err) {
        this.logger.warn(
          `Google MCC ${customerLabel(rootId)} alt hesapları okunamadı: ${errText(err)}`,
        );
      }
    }

    return [...accounts.values()];
  }

  /** Hem `customer` hem `customer_client` satırlarını tek şekle indirger. */
  private toAdAccount(
    id: string,
    raw: Record<string, unknown>,
    managerId?: string,
  ): DiscoveredAdAccount {
    return {
      externalId: id,
      name: String(raw.descriptiveName ?? raw.descriptive_name ?? customerLabel(id)),
      currency: String(raw.currencyCode ?? raw.currency_code ?? 'USD')
        .toUpperCase()
        .slice(0, 3),
      timezone: String(raw.timeZone ?? raw.time_zone ?? 'UTC'),
      status: this.mapAccountStatus(String(raw.status ?? ''), raw.manager === true),
      // Modül 3 bu hesaba erişirken login-customer-id olarak bunu kullanacak.
      managerExternalId: managerId,
      raw,
    };
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

  /** Google'da sosyal profil kavramı yok — Auto-Boost yalnızca Meta'da. */
  async listSocialProfiles(): Promise<DiscoveredSocialProfile[]> {
    return [];
  }

  // ---------------------------------------------------------------------------
  // L1 — yapı senkronizasyonu
  // ---------------------------------------------------------------------------

  /**
   * Kampanya → ad group → ad hiyerarşisini çeker.
   *
   * ÜÇ GAQL SORGUSU, seviye başına bir tane. Tek sorguda `ad_group_ad`'den
   * kampanyaya kadar join'lemek teknik olarak mümkün ama sonuç kartezyen
   * olurdu: reklamı olmayan kampanya/ad group hiç dönmez ve her reklam satırı
   * kampanya alanlarını tekrar taşır. Duraklatılmış ama reklamı olmayan bir
   * kampanyayı kaçırmak, kural motorunun (Modül 5) onu görememesi demek.
   *
   * `since` KULLANILMIYOR ve bu kasıtlı. Google Ads'te varlıkların
   * `updated_at` alanı yok; delta için ayrı `change_status` kaynağı sorgulanır,
   * o da yalnızca son 90 günü kapsıyor ve yalnızca kaynak ADLARINI döndürüyor
   * — ardından değişen varlıkları ayrı sorguyla çekmek gerekir. Google'ın
   * kotası Meta gibi çağrı sayısına değil operasyona dayandığı ve tam tarama
   * zaten tek sorgu olduğu için kazanç ek karmaşıklığı hak etmiyor. Ayrıca tam
   * tarama silinme tespitini güvenilir kılıyor.
   */
  async fetchStructure(ctx: FetchContext): Promise<PlatformStructure> {
    const { accessToken, accountExternalId: customerId, loginCustomerId } = ctx;
    const calls = { n: 0 };

    const campaignRows = await this.searchGaqlPaged<{
      campaign?: Record<string, unknown>;
      campaignBudget?: Record<string, unknown>;
    }>(
      accessToken,
      customerId,
      // START_DATE / END_DATE SEÇİLMİYOR.
      //
      // v25 bunları reddediyor:
      //   UNRECOGNIZED_FIELD — "Unrecognized fields in the query:
      //   'campaign.start_date', 'campaign.end_date'."
      //
      // Google alan adlarını sürümler arasında değiştiriyor ve doğru karşılığı
      // tahmin etmek, her denemede canlı bir tur yakmak demek. Bu iki alan
      // ÇEKİRDEK DEĞİL: yalnızca kampanya kartında başlangıç/bitiş göstermeye
      // yarıyorlardı ve yokluklarında senkronizasyonun geri kalanı eksiksiz
      // çalışıyor.
      //
      // Doğru adı bulmak için:  google-check -- --field campaign.start_date
      `SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status,
              campaign.advertising_channel_type, campaign.bidding_strategy_type,
              campaign_budget.amount_micros, campaign_budget.total_amount_micros,
              campaign_budget.period
       FROM campaign`,
      loginCustomerId,
      calls,
    );

    const campaigns: DiscoveredCampaign[] = [];
    for (const row of campaignRows) {
      const c = row.campaign;
      if (!c?.id) continue;
      const budget = this.readGoogleBudget(row.campaignBudget);
      campaigns.push({
        externalId: String(c.id),
        name: this.str(c.name) ?? String(c.id),
        // Google'ın "objective" karşılığı kanal türü: SEARCH, PERFORMANCE_MAX…
        objective: this.str(c.advertisingChannelType),
        status: this.mapEntityStatus(c.status),
        effectiveStatus: this.str(c.servingStatus) ?? this.str(c.status),
        budgetMode: budget.mode,
        budgetAmountMicros: budget.micros,
        bidStrategy: this.str(c.biddingStrategyType),
        // Yukarıdaki sorgu bu alanları seçmiyor (v25 reddediyor). Değerler
        // undefined kalıyor ve kampanya kaydında başlangıç/bitiş boş görünüyor
        // — Meta'da dolu, Google'da boş. Uydurulmuş bir tarih yazmaktan iyi.
        startTime: this.parseGoogleDate(c.startDate),
        stopTime: this.parseGoogleDate(c.endDate),
        // Google `updated_at` vermiyor — delta anahtarı yok.
        raw: row,
      });
    }

    const adGroupRows = await this.searchGaqlPaged<{
      adGroup?: Record<string, unknown>;
    }>(
      accessToken,
      customerId,
      `SELECT ad_group.id, ad_group.name, ad_group.campaign, ad_group.status,
              ad_group.type, ad_group.cpc_bid_micros, ad_group.cpm_bid_micros,
              ad_group.target_cpa_micros
       FROM ad_group`,
      loginCustomerId,
      calls,
    );

    const adGroups: DiscoveredAdGroup[] = [];
    for (const row of adGroupRows) {
      const g = row.adGroup;
      if (!g?.id) continue;
      adGroups.push({
        externalId: String(g.id),
        name: this.str(g.name) ?? String(g.id),
        // `campaign` bir kaynak adı: "customers/123/campaigns/456"
        campaignExternalId: this.lastPathSegment(g.campaign),
        status: this.mapEntityStatus(g.status),
        effectiveStatus: this.str(g.status),
        // Google'da bütçe KAMPANYA seviyesinde; ad group'un kendi bütçesi yok.
        budgetMode: 'none',
        bidAmountMicros:
          this.micros(g.cpcBidMicros) ??
          this.micros(g.cpmBidMicros) ??
          this.micros(g.targetCpaMicros),
        optimizationGoal: this.str(g.type),
        raw: row,
      });
    }

    const adRows = await this.searchGaqlPaged<{
      adGroupAd?: Record<string, unknown>;
    }>(
      accessToken,
      customerId,
      `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
              ad_group_ad.ad.final_urls, ad_group_ad.ad.display_url,
              ad_group_ad.ad.responsive_search_ad.headlines,
              ad_group_ad.ad.responsive_search_ad.descriptions,
              ad_group_ad.ad.responsive_display_ad.headlines,
              ad_group_ad.ad.responsive_display_ad.descriptions,
              ad_group_ad.ad.responsive_display_ad.marketing_images,
              ad_group_ad.ad_group, ad_group_ad.status,
              ad_group_ad.policy_summary.approval_status,
              ad_group_ad.policy_summary.policy_topic_entries
       FROM ad_group_ad`,
      loginCustomerId,
      calls,
    );

    const ads: DiscoveredAd[] = [];
    const creatives: DiscoveredCreative[] = [];
    for (const row of adRows) {
      const aga = row.adGroupAd;
      const ad = this.obj(aga?.ad);
      if (!ad?.id) continue;
      const id = String(ad.id);
      const policy = this.obj(aga?.policySummary);

      ads.push({
        externalId: id,
        name: this.str(ad.name) ?? String(ad.type ?? 'ad') + ' ' + id,
        adGroupExternalId: this.lastPathSegment(aga?.adGroup),
        status: this.mapEntityStatus(aga?.status),
        effectiveStatus: this.str(aga?.status),
        // GOOGLE'DA AYRI CREATIVE VARLIĞI YOK: reklamın kendisi creative'dir.
        // Metinler `ad` nesnesinin içinde. Ortak modeli koruyabilmek için
        // reklamla AYNI kimlikte bir creative satırı üretiyoruz; böylece
        // Ads Explorer ve raporlar iki platformda tek sorguyla çalışıyor.
        creativeExternalId: id,
        reviewStatus: this.str(policy?.approvalStatus),
        disapprovalReasons: policy?.policyTopicEntries,
        raw: row,
      });
      creatives.push(this.mapGoogleCreative(id, ad));
    }

    return { campaigns, adGroups, ads, creatives, complete: true, apiCalls: calls.n };
  }

  // ---------------------------------------------------------------------------
  // L2 / L3 / L4 — metrikler
  // ---------------------------------------------------------------------------

  /**
   * Günlük metrikleri çeker.
   *
   * `segments.date` KRİTİK: bu olmadan Google tüm aralık için tek toplam satır
   * döndürüyor. Segment ile 30 gün tek sorguda geliyor.
   *
   * Meta'dan iki önemli fark:
   *   · Google `metrics.cost_micros` veriyor — zaten micros, çevrim YOK.
   *     (Meta'nın `spend` alanı ondalık string; ikisini aynı sanmak
   *     harcamayı 10.000 kat yanlış gösterir.)
   *   · `conversions` doğrudan bir metrik. Hangi eylemin dönüşüm sayıldığı
   *     Google Ads arayüzünde tanımlı, bizim seçmemize gerek yok.
   */
  async fetchInsights(ctx: FetchContext, request: InsightsRequest): Promise<PlatformInsights> {
    const { accessToken, accountExternalId: customerId, loginCustomerId } = ctx;
    const calls = { n: 0 };
    const view = GOOGLE_VIEW[request.level];

    // Tarihler sabit biçimde ve tırnaklı: GAQL enjeksiyonuna kapalı olması için
    // biçimi doğruluyoruz (dışarıdan gelen bir değer sorguya giriyor).
    for (const d of [request.dateFrom, request.dateTo]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new PlatformApiError('google', 'permanent', `Geçersiz tarih biçimi: ${d}`);
      }
    }

    const rows = await this.searchGaqlPaged<Record<string, unknown>>(
      accessToken,
      customerId,
      // METRICS.VIDEO_VIEWS SEÇİLMİYOR — v25 reddediyor:
      //   UNRECOGNIZED_FIELD — "Unrecognized field in the query:
      //   'metrics.video_views'."
      //
      // Hem hesap hem kampanya seviyesinde reddediliyor, yani seviyeye özgü
      // bir kısıt değil; alan bu sürümde yok. Video görüntüleme Google
      // tarafında sıfır kalıyor ve bu, sıfır sanılmaması gereken bir sıfır —
      // rapor katmanı zaten platforma göre ayrım yapıyor.
      //
      // `metrics.impressions` iki kez yazılmıştı; tekrarı da temizlendi.
      `SELECT ${view.idField}, segments.date, customer.currency_code,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value,
              metrics.engagements
       FROM ${view.resource}
       WHERE segments.date BETWEEN '${request.dateFrom}' AND '${request.dateTo}'`,
      loginCustomerId,
      calls,
    );

    const mapped: DiscoveredInsightRow[] = [];
    for (const row of rows) {
      const segments = this.obj(row.segments);
      const metrics = this.obj(row.metrics);
      const date = this.str(segments?.date);
      if (!date) continue;

      const entityExternalId =
        request.level === 'account' ? customerId : view.readId(row, this);
      if (!entityExternalId) continue;

      mapped.push({
        entityExternalId,
        level: request.level,
        date,
        currency: (this.str(this.obj(row.customer)?.currencyCode) ?? 'USD')
          .toUpperCase()
          .slice(0, 3),
        impressions: Number(metrics?.impressions ?? 0) || 0,
        clicks: Number(metrics?.clicks ?? 0) || 0,
        // Zaten micros — çevrim yok.
        spendMicros: this.micros(metrics?.costMicros) ?? 0n,
        conversions: Number(metrics?.conversions ?? 0) || 0,
        conversionValueMicros: googleValueToMicros(metrics?.conversionsValue),
        // Sorgu bu alanı seçmiyor (v25'te yok) — daima 0.
        videoViews: Number(metrics?.videoViews ?? 0) || 0,
        engagements: Number(metrics?.engagements ?? 0) || 0,
        // Google `reach` vermiyor — bu metrik Meta'ya özgü. 0 bırakıyoruz;
        // 0 ile "bilinmiyor" arasındaki fark rapor katmanında platforma göre
        // ele alınacak.
        reach: 0,
        raw: row,
      });
    }

    return { rows: mapped, apiCalls: calls.n, complete: true };
  }

  /**
   * ═══ KIRILIM METRİKLERİ ═══
   *
   * Meta'daki `breakdowns` parametresinin Google karşılığı YOK: her boyut
   * ayrı bir KAYNAK (`age_range_view`, `gender_view`) ya da ayrı bir SEGMENT
   * (`segments.hour`, `segments.ad_network_type`). Bu yüzden tek bir harita
   * yerine boyut başına sorgu şekli tutuluyor.
   *
   * ŞEHİR İKİ ÇAĞRI İSTİYOR. `geographic_view` şehir ADINI değil kriter
   * KİMLİĞİNİ döndürüyor; adlar `geo_target_constant` kaynağında. İkinci
   * çağrı görülen kimlikleri TEK SEFERDE çözüyor — kimlik başına sorgu
   * yüzlerce çağrı demekti.
   */
  async fetchBreakdowns(
    ctx: FetchContext,
    request: BreakdownRequest,
  ): Promise<PlatformBreakdowns> {
    const { accessToken, accountExternalId: customerId, loginCustomerId } = ctx;
    const calls = { n: 0 };

    for (const d of [request.dateFrom, request.dateTo]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new PlatformApiError('google', 'permanent', `Geçersiz tarih biçimi: ${d}`);
      }
    }

    const sekil = GOOGLE_BREAKDOWN[request.dimension];
    if (!sekil) return { rows: [], apiCalls: 0, complete: true, unsupported: true };

    const ham = await this.searchGaqlPaged<Record<string, unknown>>(
      accessToken,
      customerId,
      `SELECT ${sekil.alan}, segments.date, customer.currency_code,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value
       FROM ${sekil.kaynak}
       WHERE segments.date BETWEEN '${request.dateFrom}' AND '${request.dateTo}'`,
      loginCustomerId,
      calls,
    );

    const satirlar: DiscoveredBreakdownRow[] = [];
    const cozulecekKimlikler = new Set<string>();

    for (const row of ham) {
      const segments = this.obj(row.segments);
      const metrics = this.obj(row.metrics);
      const date = this.str(segments?.date);
      const deger = sekil.deger(row);
      if (!date || !deger) continue;
      if (request.dimension === 'city') cozulecekKimlikler.add(deger);

      satirlar.push({
        dimension: request.dimension,
        value: deger.slice(0, 120),
        date,
        impressions: Number(metrics?.impressions ?? 0) || 0,
        clicks: Number(metrics?.clicks ?? 0) || 0,
        spendMicros: this.micros(metrics?.costMicros) ?? 0n,
        conversions: Number(metrics?.conversions ?? 0) || 0,
        conversionValueMicros: googleValueToMicros(metrics?.conversionsValue),
        currency: (this.str(this.obj(row.customer)?.currencyCode) ?? 'USD')
          .toUpperCase()
          .slice(0, 3),
      });
    }

    /*
     * KİMLİKLER ADA ÇEVRİLİYOR. Çeviri başarısız olursa satır ATILMIYOR,
     * kimlik olduğu gibi kalıyor: "2035120" okunaksız ama satırı düşürmek
     * o şehrin harcamasını raporun toplamından sessizce çıkarırdı.
     */
    if (request.dimension === 'city' && cozulecekKimlikler.size > 0) {
      const adlar = await this.geoAdlari(
        accessToken,
        customerId,
        loginCustomerId,
        [...cozulecekKimlikler],
        calls,
      );
      for (const s of satirlar) s.value = adlar.get(s.value) ?? s.value;
    }

    return { rows: satirlar, apiCalls: calls.n, complete: true, unsupported: false };
  }

  /** Coğrafi kriter kimliklerini ada çevirir — TEK sorguda. */
  private async geoAdlari(
    accessToken: string,
    customerId: string,
    loginCustomerId: string | undefined,
    kimlikler: string[],
    calls: { n: number },
  ): Promise<Map<string, string>> {
    // Kimlikler PLATFORMDAN geldi ama yine de doğrulanıyor: sorguya giren
    // her değer sayı olmak zorunda (GAQL enjeksiyonuna kapalı olması için).
    const guvenli = kimlikler.filter((k) => /^\d+$/.test(k));
    if (guvenli.length === 0) return new Map();

    const rows = await this.searchGaqlPaged<Record<string, unknown>>(
      accessToken,
      customerId,
      `SELECT geo_target_constant.id, geo_target_constant.canonical_name
       FROM geo_target_constant
       WHERE geo_target_constant.id IN (${guvenli.join(',')})`,
      loginCustomerId,
      calls,
    );

    const harita = new Map<string, string>();
    for (const row of rows) {
      const g = this.obj(row.geoTargetConstant);
      const id = this.str(g?.id);
      // `canonical_name` "Izmir,Izmir,Turkey" gibi geliyor — ilk parça
      // kullanıcının "şehir" dediği şey.
      const ad = this.str(g?.canonicalName)?.split(',')[0];
      if (id && ad) harita.set(id, ad);
    }
    return harita;
  }

  /**
   * GAQL sorgusunu SAYFALAYARAK çalıştırır.
   *
   * `searchGaql` tek sayfa döndürüyor ve keşif için yeterliydi (hesap sayısı
   * küçük). Yapı senkronizasyonunda değil: binlerce reklamlı bir hesapta ilk
   * sayfayla yetinmek varlıkların çoğunu görmemek, dolayısıyla onları silinmiş
   * sanmak demek.
   */
  private async searchGaqlPaged<T>(
    accessToken: string,
    customerId: string,
    query: string,
    loginCustomerId: string | undefined,
    calls: { n: number },
  ): Promise<T[]> {
    const { developerToken } = this.assertConfigured();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

    const rows: T[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    const MAX_PAGES = 100;

    do {
      const { data } = await platformFetch<{ results?: T[]; nextPageToken?: string }>(
        'google',
        `${this.adsBase}/customers/${customerId}/googleAds:search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: query.trim(),
            // PAGE_SIZE GÖNDERİLMİYOR — Google artık REDDEDİYOR.
            //
            // v25'te `pageSize` alanı hata veriyor:
            //   PAGE_SIZE_NOT_SUPPORTED — "Setting the page size is not
            //   supported. Search Responses will have fixed page size of
            //   '10000' rows."
            //
            // Yani istediğimiz değerin aynısı zaten sabit varsayılan; alanı
            // göndermek tek başına TÜM sorguyu 400 ile düşürüyordu. İlk canlı
            // çalıştırmada yapı ve metrik sorgularının üçü de bu yüzden
            // patladı — hesap keşfi çalışıyordu çünkü o sayfasız yolu
            // kullanıyor.
            ...(pageToken ? { pageToken } : {}),
          }),
        },
      );
      calls.n++;
      rows.push(...(data.results ?? []));
      pageToken = data.nextPageToken;
      pages++;
    } while (pageToken && pages < MAX_PAGES);

    if (pageToken) {
      throw new PlatformApiError(
        'google',
        'transient',
        `Google sorgusu ${MAX_PAGES} sayfada bitmedi (müşteri ${customerLabel(customerId)}). ` +
          'Kısmi sonucu kaydetmek varlıkları silinmiş gösterirdi.',
      );
    }

    return rows;
  }

  /**
   * Google reklamını ortak creative şekline çevirir.
   *
   * RSA/RDA'da başlık ve açıklama LİSTE hâlinde geliyor (Google kombinasyonları
   * kendisi kuruyor). Birincisini alıp tamamını `raw` içinde saklıyoruz:
   * tek bir "headline" göstermek zorundayız ama bilgiyi kaybetmemeliyiz.
   */
  private mapGoogleCreative(id: string, ad: Record<string, unknown>): DiscoveredCreative {
    const rsa = this.obj(ad.responsiveSearchAd);
    const rda = this.obj(ad.responsiveDisplayAd);
    const source = rsa ?? rda;

    const firstAssetText = (value: unknown): string | undefined => {
      if (!Array.isArray(value)) return undefined;
      for (const item of value) {
        const text = this.obj(item)?.text;
        if (typeof text === 'string' && text.trim().length > 0) return text.trim();
      }
      return undefined;
    };

    const finalUrls = Array.isArray(ad.finalUrls) ? ad.finalUrls : [];
    const images = Array.isArray(rda?.marketingImages)
      ? rda.marketingImages
          .map((i) => this.str(this.obj(i)?.asset))
          .filter((u): u is string => u !== undefined)
      : [];

    return {
      externalId: id,
      creativeType: this.str(ad.type),
      headline: firstAssetText(source?.headlines),
      primaryText: firstAssetText(source?.descriptions),
      description: undefined,
      // Google'da CTA metni reklam türüne gömülü; ayrı alan yok.
      ctaType: undefined,
      destinationUrl: typeof finalUrls[0] === 'string' ? finalUrls[0] : undefined,
      displayUrl: this.str(ad.displayUrl),
      assetUrls: images.length > 0 ? images : undefined,
      raw: ad,
    };
  }

  /**
   * Google'ın kampanya bütçesini okur.
   *
   * Google zaten micros kullanıyor — Meta'daki cent→micros çevrimi burada YOK.
   * `period` DAILY ise günlük, aksi hâlde toplam bütçe alanına bakıyoruz.
   */
  private readGoogleBudget(budget: Record<string, unknown> | undefined): {
    mode: NormalizedBudgetMode;
    micros?: bigint;
  } {
    if (!budget) return { mode: 'none' };
    const daily = this.micros(budget.amountMicros);
    const total = this.micros(budget.totalAmountMicros);
    if (String(budget.period ?? '').toUpperCase() === 'DAILY' && daily !== undefined) {
      return { mode: 'daily', micros: daily };
    }
    if (total !== undefined && total > 0n) return { mode: 'lifetime', micros: total };
    if (daily !== undefined) return { mode: 'daily', micros: daily };
    return { mode: 'none' };
  }

  /** Google int64 alanlarını JSON'da STRING olarak döndürür. */
  private micros(value: unknown): bigint | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    try {
      return BigInt(String(value));
    } catch {
      return undefined;
    }
  }

  /** "customers/123/campaigns/456" → "456" */
  private lastPathSegment(value: unknown): string {
    if (typeof value !== 'string') return '';
    const parts = value.split('/');
    return parts[parts.length - 1] ?? '';
  }

  /**
   * İç içe alanı okur: `readNested(row, ['adGroupAd','ad','id'])`.
   *
   * `public` çünkü GOOGLE_VIEW haritası sınıfın dışında ve okuma mantığını
   * seviye başına orada tutmak, dört ayrı `if` dalından okunaklı.
   */
  readNested(row: Record<string, unknown>, path: readonly string[]): string | undefined {
    let cursor: Record<string, unknown> | undefined = row;
    for (const key of path.slice(0, -1)) {
      cursor = this.obj(cursor?.[key]);
      if (!cursor) return undefined;
    }
    const last = path[path.length - 1];
    const value = last ? cursor?.[last] : undefined;
    return value === undefined || value === null ? undefined : String(value);
  }

  private obj(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private str(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Google tarihleri "YYYY-MM-DD" (saat yok) veriyor.
   *
   * UTC gün başına sabitliyoruz. Yerel saat kullanmak sunucu zaman dilimine
   * göre bir gün kaydırırdı.
   */
  private parseGoogleDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
    const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  /**
   * Google durum sözlüğünü ortak dile çevirir.
   *
   * Meta'nın aksine Google üst seviye durumu MİRAS ETTİRMİYOR: duraklatılmış
   * bir kampanyanın altındaki ad group ENABLED kalır. "Gerçekten yayında mı"
   * sorusunu yanıtlamak için hiyerarşiyi yukarı doğru kontrol etmek gerekir —
   * bunu sorgu katmanı yapıyor, adapter ham durumu bildiriyor.
   */
  private mapEntityStatus(value: unknown): NormalizedEntityStatus {
    switch (String(value ?? '').toUpperCase()) {
      case 'ENABLED':
        return 'active';
      case 'PAUSED':
        return 'paused';
      case 'REMOVED':
        return 'deleted';
      default:
        return 'unknown';
    }
  }

  // ---------------------------------------------------------------------------
  // YAZMA — HENÜZ UYGULANMADI
  // ---------------------------------------------------------------------------

  /**
   * Google tek scope kullanıyor (`adwords`) ve o scope okuma+yazmayı birlikte
   * veriyor. Yani izin açısından yazma her zaman "mümkün" görünüyor.
   *
   * `applyAction` yine de reddediyor — sebep aşağıda.
   */
  canWrite(grantedScopes: readonly string[]): { ok: boolean; missing: string[] } {
    const missing = this.requiredScopes.filter((s) => !grantedScopes.includes(s));
    return { ok: missing.length === 0, missing };
  }

  /**
   * HENÜZ YAZILMADI — engel erişim değil, kod.
   *
   * 2026-08-16'da Google erişimi alındı, hesaplar bağlandı ve okuma tarafı
   * canlıda doğrulandı (127 reklam hesabı keşfedildi, metrikler akıyor).
   * Yani eski gerekçe —"Basic Access bekleniyor"— artık geçerli değil;
   * geriye yalnızca yazma kodunun yazılmamış olması kaldı.
   *
   * MESAJDA ERİŞİMDEN BAHSETMİYORUZ ve bu bilinçli: kullanıcıyı çözülmüş bir
   * sorunu çözmeye göndermek, `preflight.sh`'ın veritabanını "kapalı"
   * göstermesiyle aynı sınıf yanlış teşhis. Mesaj ne eksikse onu söylemeli.
   *
   * Sessizce başarılı dönmek ya da hiç metot tanımlamamak daha kötü olurdu:
   * kural motoru Google varlıklarını da eşleştiriyor ve aksiyonun
   * uygulanmadığını bilmeden "uygulandı" kaydı yazardı. Açık bir `permanent`
   * hata, kural kaydına sebebiyle birlikte düşüyor ve arayüzde görünüyor.
   *
   * Yazılınca `CampaignService.mutate` / `AdGroupService.mutate` kullanılacak.
   */
  async applyAction(
    _ctx: FetchContext,
    action: PlatformActionRequest,
  ): Promise<PlatformActionResult> {
    throw new PlatformApiError(
      'google',
      'permanent',
      `Google Ads yazma işlemleri henüz yazılmadı (${action.type}). ` +
        'Bağlantı ve okuma tarafı çalışıyor; eksik olan yazma kodu.',
    );
  }


  // ---------------------------------------------------------------------------
  // MODÜL 7 — Auto-Boost: Google'da KARŞILIĞI YOK
  // ---------------------------------------------------------------------------

  /**
   * Google Ads'te "organik gönderi" diye bir şey yok.
   *
   * Boş dizi dönüyor, hata değil: Auto-Boost bir Meta özelliği ve Google
   * bağlantısı olan bir müşteride bu senkronizasyonun "başarısız" olması
   * yanlış olurdu — yapacak bir iş yok, hata yok.
   */
  async fetchOrganicPosts(): Promise<DiscoveredOrganicPost[]> {
    return [];
  }

  /**
   * Boost Google'da yok.
   *
   * `fetchOrganicPosts` boş dizi dönerken burada HATA fırlatmak tutarsız
   * görünebilir ama değil: boş liste "boost edilecek gönderi yok" demek ve
   * doğru; bir boost isteğinin buraya ulaşması ise çağıranın hatası ve
   * sessizce yutmak, oluşturulduğu sanılan bir boost bırakırdı.
   */
  /**
   * Toplu reklam oluşturma — Google'da HENÜZ YAZILMADI.
   *
   * `applyAction` ile aynı durum: erişim var, kod yok. Burada risk daha da
   * büyük — test edilmemiş bir yol tek çağrıda 60 reklam oluşturur.
   */
  async createAd(): Promise<CreateAdResult> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads toplu oluşturma henüz yazılmadı.',
    );
  }

  async createBoost(): Promise<BoostResult> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads organik gönderi boost etmeyi desteklemiyor — bu bir Meta özelliği.',
    );
  }

  /**
   * BOŞ KAYIT DÖNÜYOR, hata DEĞİL.
   *
   * `createBoost` hata fırlatıyor çünkü orada kullanıcı bir şey yapmaya
   * çalışıyor ve sessiz kalmak yanlış olur. Burası ise yalnızca bir liste
   * zenginleştirme adımı: Google'da boost kampanyası yok, dolayısıyla durumu
   * okunacak kampanya da yok. Hata fırlatmak, Meta kampanyalarını listeleyen
   * ekranı Google bağlantısı yüzünden çökertirdi.
   */
  async getCampaignSummaries(): Promise<Record<string, never>> {
    return {};
  }

  /**
   * Google'da KARŞILIĞI VAR ama yazılmadı.
   *
   * `GeoTargetConstantService` aynı işi yapıyor ve anahtar biçimi de farklı
   * (kaynak adı, sayısal anahtar değil). BOŞ DİZİ DÖNMÜYOR: boş liste
   * "aradığın yer bulunamadı" diye okunur ve kullanıcı Türkiye'yi arayıp
   * sonuç alamayınca hatayı kendi yazımında arar.
   */
  async searchGeoLocations(): Promise<GeoLocationOption[]> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads lokasyon araması henüz yazılmadı.',
    );
  }

  async listSavedAudiences(): Promise<SavedAudienceOption[]> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads kayıtlı kitle listesi henüz yazılmadı.',
    );
  }

  async getSavedAudienceTargeting(): Promise<Record<string, unknown> | null> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads kayıtlı kitle listesi henüz yazılmadı.',
    );
  }


  /**
   * Modül 4 — Google'da KARŞILIĞI VAR ama yazılmadı.
   *
   * Google Ads'te de görsel yükleme (`MediaFileService`) ve kampanya
   * oluşturma mümkün; erişim de artık var. Eksik olan tek şey kod.
   *
   * YAZILDIĞI GÜN İLK ÇAĞRI AJANSIN KENDİ HESABINDA YAPILMALI. Meta'da ilk
   * gerçek yazma çağrısında altı hata çıktı ve üçü sessizdi; Google'ınki de
   * canlıda öğrenilecek ve o ders müşterinin bütçesiyle alınmamalı.
   */
  /**
   * Görseli Google Ads'e Asset olarak yükler ve KAYNAK ADINI döndürür.
   *
   * META'DAN FARK: Meta bir `image_hash` döndürüyor, Google tam bir kaynak
   * adı (`customers/123/assets/456`). İkisi de hesap başına ve
   * `asset_platform_refs` ikisini de aynı kolonda tutuyor — çağıran hangi
   * platformda olduğunu zaten biliyor.
   *
   * MULTIPART YOK: Google base64'ü JSON gövdesinin içinde bekliyor.
   */
  async uploadAdImage(
    ctx: FetchContext,
    params: { name: string; bytes: Buffer },
  ): Promise<string> {
    return this.mutate(ctx, 'assets', googleImageAssetBody(params));
  }

  /**
   * YouTube videosunu Asset olarak kaydeder.
   *
   * VİDEO INLINE VERİLEMİYOR: `DemandGenVideoResponsiveAdInfo.videos[]` yalnızca
   * Asset kaynak adı taşıyor. Yani reklam kurulmadan önce bu çağrı zorunlu.
   */
  async createYouTubeVideoAsset(
    ctx: FetchContext,
    params: { videoId: string; title: string },
  ): Promise<string> {
    return this.mutate(ctx, 'assets', googleVideoAssetBody(params));
  }

  /**
   * YOUTUBE VİDEO REKLAMI — Demand Gen zinciri.
   *
   * BEŞ ÇAĞRI: bütçe → kampanya → reklam grubu → video varlığı → reklam.
   * (Logo varlığı çağıran tarafından önbellekten geliyor; her yayında yeniden
   * yüklemek gereksiz.)
   *
   * ORTADA KALIRSA GERİ ALINIYOR — `publishDraft` ve Meta `createBoost`
   * desenlerinin aynısı. Yetim bir bütçe para harcamıyor ama hesabı kirletiyor
   * ve aynı adla ikinci bütçe açılamıyor (DUPLICATE_NAME).
   *
   * KAMPANYA PAUSED KALIYOR ve bu Meta yolundan bilinçli farkı: Google yazma
   * yolu canlıda hiç çalışmadı; ilk gerçek çağrının sonucunu insan görmeden
   * para harcamamalı. Ajans Google Ads'te gözden geçirip kendisi açıyor.
   */
  async createVideoBoost(
    ctx: FetchContext,
    request: {
      name: string;
      dailyBudgetMicros: bigint;
      durationDays: number;
      videoId: string;
      videoTitle: string;
      logoAssetResource: string;
      businessName: string;
      finalUrl: string;
      headlines: string[];
      longHeadlines: string[];
      descriptions: string[];
    },
  ): Promise<{ campaignId: string; adGroupId: string; adId: string }> {
    const stamp = nameStamp(new Date());
    const created: Array<{ resource: string; label: string }> = [];

    try {
      const budget = await this.mutate(
        ctx,
        'campaignBudgets',
        campaignBudgetBody({
          name: request.name,
          amountMicros: request.dailyBudgetMicros.toString(),
          stamp,
        }),
      );
      created.push({ resource: budget, label: 'bütçe' });

      const bitis = new Date(Date.now() + request.durationDays * 86_400_000);
      const campaign = await this.mutate(
        ctx,
        'campaigns',
        demandGenCampaignBody({
          name: request.name,
          budgetResource: budget,
          stamp,
          endDate: googleDate(bitis),
        }),
      );
      created.push({ resource: campaign, label: 'kampanya' });

      const adGroup = await this.mutate(
        ctx,
        'adGroups',
        demandGenAdGroupBody({ name: request.name, campaignResource: campaign }),
      );
      created.push({ resource: adGroup, label: 'reklam grubu' });

      /*
       * VİDEO VARLIĞI GERİ ALMA LİSTESİNE GİRMİYOR. Varlıklar hesap
       * seviyesinde ve yeniden kullanılabiliyor; silmek, aynı videoyu ikinci
       * kez tanıtmak istendiğinde yeniden yüklemek demek olurdu. Yetim varlık
       * para harcamıyor ve Ads Manager'da kampanya listesini de kirletmiyor.
       */
      const videoAsset = await this.createYouTubeVideoAsset(ctx, {
        videoId: request.videoId,
        title: request.videoTitle,
      });

      const ad = await this.mutate(
        ctx,
        'adGroupAds',
        demandGenVideoAdBody({
          adGroupResource: adGroup,
          finalUrl: request.finalUrl,
          businessName: request.businessName,
          videoAssetResource: videoAsset,
          logoAssetResource: request.logoAssetResource,
          headlines: request.headlines,
          longHeadlines: request.longHeadlines,
          descriptions: request.descriptions,
        }),
      );

      return { campaignId: campaign, adGroupId: adGroup, adId: ad };
    } catch (err) {
      // TERS SIRADA GERİ AL ve ASIL hatayı fırlat: kullanıcının görmesi
      // gereken, kampanyanın neden kurulamadığı.
      for (const varlik of [...created].reverse()) {
        try {
          await this.mutate(ctx, resourceCollection(varlik.resource), removeBody(varlik.resource));
        } catch (temizlikHatasi) {
          this.logger.error(
            `Google ${varlik.label} geri alınamadı (${varlik.resource}): ` +
              `${temizlikHatasi instanceof Error ? temizlikHatasi.message : String(temizlikHatasi)}`,
          );
        }
      }
      throw err;
    }
  }

  /**
   * Arama kampanyası: bütçe → kampanya → reklam grubu → anahtar kelimeler →
   * reklam.
   *
   * DÖRT DEĞİL BEŞ ÇAĞRI ve Meta'dan yapısal fark burada: bütçe AYRI BİR
   * KAYNAK (`CampaignBudget`) ve kampanya ona referans veriyor. Meta'da bütçe
   * ad set'in bir alanı.
   *
   * ORTADA KALIRSA GERİ ALINIYOR — `createBoost` deseninin aynısı. Bütçe
   * oluşup kampanya oluşmazsa hesapta yetim bir bütçe kalıyor: para
   * harcamıyor ama bir sonraki denemede aynı adla ikinci bir bütçe
   * açılamıyor (DUPLICATE_NAME) ve kullanıcı sebebini anlamıyor.
   *
   * KAMPANYA PAUSED AÇILIYOR VE PAUSED KALIYOR — Meta yolundan bilerek
   * FARKLI. Orada kampanya en sonda ACTIVE'e alınıyor çünkü o yol canlıda bir
   * kez çalıştı; burası HİÇ çalışmadı. İlk gerçek çağrının sonucunu bir insan
   * görmeden para harcanmamalı.
   */
  async publishDraft(
    ctx: FetchContext,
    req: PublishDraftRequest,
  ): Promise<PublishDraftResult> {
    if (!req.linkUrl) {
      throw new PlatformApiError(
        'google',
        'permanent',
        'Google arama reklamı hedef URL olmadan oluşturulamaz.',
      );
    }
    const keywords = (req.keywords ?? []).map((k) => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      // Anahtar kelimesiz arama kampanyası HİÇ HARCAMIYOR ve hata da
      // vermiyor. Burada durdurmak, sessiz sıfırı engelliyor.
      throw new PlatformApiError(
        'google',
        'permanent',
        'Google arama kampanyası en az bir anahtar kelime gerektiriyor — ' +
          'kelimesiz kampanya hiç gösterim almaz.',
      );
    }

    const stamp = nameStamp(new Date());
    const created: Array<{ resource: string; label: string }> = [];

    try {
      const budget = await this.mutate(
        ctx,
        'campaignBudgets',
        campaignBudgetBody({
          name: req.name,
          amountMicros: req.dailyBudgetMicros.toString(),
          stamp,
        }),
      );
      created.push({ resource: budget, label: 'bütçe' });

      const campaign = await this.mutate(
        ctx,
        'campaigns',
        campaignBody({
          name: req.name,
          budgetResource: budget,
          stamp,
          startDate: req.startTime ? googleDate(req.startTime) : undefined,
          endDate: req.endTime ? googleDate(req.endTime) : undefined,
        }),
      );
      created.push({ resource: campaign, label: 'kampanya' });

      /**
       * REKLAM GRUBU TEKLİFİ GÜNLÜK BÜTÇENİN YİRMİDE BİRİ.
       *
       * Elle CPC'de tavan zorunlu ve hesabın varsayılanına bırakmak, aynı
       * kodun iki müşteride farklı davranması demek. Yirmide bir, günde en az
       * yirmi tıklama hedefleyen kaba ama ÖNGÖRÜLEBİLİR bir başlangıç;
       * uzman Google Ads'ten değiştirebiliyor ve kampanya zaten duraklatılmış
       * açılıyor.
       */
      const cpcBidMicros = (req.dailyBudgetMicros / 20n).toString();
      const adGroup = await this.mutate(
        ctx,
        'adGroups',
        adGroupBody({ name: req.name, campaignResource: campaign, cpcBidMicros }),
      );
      created.push({ resource: adGroup, label: 'reklam grubu' });

      await this.mutate(ctx, 'adGroupCriteria', keywordsBody({ adGroupResource: adGroup, keywords }));

      const ad = await this.mutate(
        ctx,
        'adGroupAds',
        responsiveSearchAdBody({
          adGroupResource: adGroup,
          finalUrl: req.linkUrl,
          // METİNLER `packTextsFor('google_rsa')` ÜZERİNDEN GELİYOR ve burada
          // tekrar kırpılmıyor: sınır tek yerde uygulanmalı, yoksa iki kural
          // zamanla ayrışır.
          headlines: req.googleHeadlines ?? [],
          descriptions: req.googleDescriptions ?? [],
        }),
      );

      return {
        campaignId: campaign,
        adSetId: adGroup,
        creativeId: ad,
        adId: ad,
      };
    } catch (err) {
      // TERS SIRADA GERİ AL. Silme başarısız olsa bile ASIL hatayı fırlatıyoruz:
      // kullanıcının görmesi gereken, kampanyanın neden kurulamadığı.
      for (const varlik of [...created].reverse()) {
        try {
          await this.mutate(ctx, resourceCollection(varlik.resource), removeBody(varlik.resource));
        } catch (temizlikHatasi) {
          this.logger.error(
            `Google ${varlik.label} geri alınamadı (${varlik.resource}): ` +
              `${temizlikHatasi instanceof Error ? temizlikHatasi.message : String(temizlikHatasi)}`,
          );
        }
      }
      throw err;
    }
  }

  /**
   * `:mutate` çağrısı — tek işlem, tek kaynak adı döner.
   *
   * `login-customer-id` başlığı okuma tarafındaki kadar KRİTİK: MCC altındaki
   * bir hesapta yazma yaparken de zorunlu ve eksikse Google
   * `USER_PERMISSION_DENIED` dönüyor — mesaj token sorunu gibi okunuyor.
   */
  private async mutate(
    ctx: FetchContext,
    collection: string,
    payload: GoogleMutateBody,
  ): Promise<string> {
    const { developerToken } = this.assertConfigured();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${ctx.accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (ctx.loginCustomerId) headers['login-customer-id'] = ctx.loginCustomerId;

    const { data } = await platformFetch<{ results?: Array<{ resourceName?: string }> }>(
      'google',
      `${this.adsBase}/customers/${ctx.accountExternalId}/${collection}:mutate`,
      { method: 'POST', headers, body: JSON.stringify(payload) },
    );

    const resource = data.results?.[0]?.resourceName;
    if (!resource) {
      /**
       * KAYNAK ADI YOKSA BAŞARILI SAYMIYORUZ.
       *
       * Google 200 dönüp boş sonuç verebiliyor ve bunu başarı saymak,
       * "oluşturuldu" denen ama var olmayan bir kampanya demek olurdu —
       * üstelik geri alınacak bir kimlik de kalmazdı.
       */
      throw new PlatformApiError(
        'google',
        'permanent',
        `Google ${collection} oluşturma yanıtında kaynak adı yok.`,
      );
    }
    return resource;
  }


  // ---------------------------------------------------------------------------
  // Anahtar kelime performansı
  // ---------------------------------------------------------------------------

  /**
   * `keyword_view` üzerinden anahtar kelime metrikleri.
   *
   * GÖSTERİM ALMAYANLAR ÇEKİLMİYOR. Bir arama kampanyasında binlerce anahtar
   * kelime tanımlı olabiliyor ve çoğu belirli bir günde hiç gösterim almıyor.
   * Hepsini çekmek satır sayısını on katına çıkarır ve raporda hiçbir şey
   * eklemez — sıfırlık satırlar zaten gösterilmiyor.
   *
   * ALAN ADLARI SÜRÜME BAĞLI. Bir alan reddedilirse sondayla doğrula:
   *   google-check -- --customer <id> --field ad_group_criterion.keyword.text
   */
  /**
   * Google'da Meta anlık formunun karşılığı YOK.
   *
   * Lead Form uzantısı ayrı bir kavram, ayrı bir uç nokta ve farklı bir veri
   * modeli. Sessizce boş kimlik dönmek, kullanıcının kütüphanede "yayında"
   * görünen ama hiçbir yerde var olmayan bir formu olması demek olurdu.
   */
  async createLeadForm(): Promise<string> {
    throw new PlatformApiError(
      'google',
      'permanent',
      "Google Ads'te anlık form yok — bu özellik yalnızca Meta'da çalışıyor.",
    );
  }

  /**
   * Google'da anlık form kaydı YOK — form uzantısı ayrı bir kavram.
   *
   * Boş dizi dönmek yerine hata: sessizce boş dönmek, Google bağlantısı olan
   * bir müşteride "hiç kayıt gelmiyor" durumunu normal göstermek olurdu.
   */
  async fetchLead(): Promise<never> {
    throw new PlatformApiError('google', 'permanent', "Google Ads'te anlık form kaydı yok.");
  }

  async fetchFormLeads(): Promise<never> {
    throw new PlatformApiError('google', 'permanent', "Google Ads'te anlık form kaydı yok.");
  }

  /**
   * ARAMA TERİMLERİ — `search_term_view`.
   *
   * Anahtar kelime bizim hedeflediğimiz şey, arama terimi kullanıcının
   * YAZDIĞI şey. Geniş eşlemeli bir kelime hiç istemediğimiz sorgulara da
   * gösterim alabiliyor ve fark ancak burada görünüyor.
   *
   * `search_term_view.status` ÜRÜN AÇISINDAN EN DEĞERLİ ALAN: `NONE` olan
   * bir terim para harcıyor ama ne anahtar kelime ne de negatif olarak
   * tanımlı.
   *
   * `metrics.impressions > 0` SÜZGECİ ŞART: gösterim almamış terim yok
   * demektir ve Google onları da döndürebiliyor; süzgeçsiz sorgu hem kotayı
   * hem tabloyu boş satırlarla şişirir.
   */
  async fetchSearchTerms(
    ctx: FetchContext,
    request: { dateFrom: string; dateTo: string },
  ): Promise<{ rows: DiscoveredSearchTermRow[]; apiCalls: number }> {
    const calls = { n: 0 };

    const raw = await this.searchGaqlPaged<Record<string, unknown>>(
      ctx.accessToken,
      ctx.accountExternalId,
      `SELECT search_term_view.search_term,
              search_term_view.status,
              segments.keyword.info.text,
              segments.keyword.info.match_type,
              ad_group.id,
              segments.date,
              customer.currency_code,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value
       FROM search_term_view
       WHERE segments.date BETWEEN '${request.dateFrom}' AND '${request.dateTo}'
         AND metrics.impressions > 0`,
      ctx.loginCustomerId,
      calls,
    );

    const rows: DiscoveredSearchTermRow[] = [];
    for (const row of raw) {
      const stv = this.obj(row.searchTermView);
      const segments = this.obj(row.segments);
      const kw = this.obj(this.obj(segments?.keyword)?.info);
      const metrics = this.obj(row.metrics);

      const term = this.str(stv?.searchTerm);
      const date = this.str(segments?.date);
      // İkisi de zorunlu: terimsiz satır raporda boş bir hücre, tarihsiz
      // satır tekil anahtara yazılamaz.
      if (!term || !date) continue;

      rows.push({
        searchTerm: term.slice(0, 500),
        keywordText: this.str(kw?.text)?.slice(0, 500),
        matchType: normalizeMatchType(this.str(kw?.matchType)),
        status: (this.str(stv?.status) ?? 'NONE').toUpperCase().slice(0, 20),
        adGroupExternalId: this.str(this.obj(row.adGroup)?.id),
        date,
        impressions: Number(metrics?.impressions ?? 0) || 0,
        clicks: Number(metrics?.clicks ?? 0) || 0,
        // Zaten micros — Google `cost_micros` veriyor, çevrim yok.
        spendMicros: this.micros(metrics?.costMicros) ?? 0n,
        conversions: Number(metrics?.conversions ?? 0) || 0,
        // `conversions_value` micros DEĞİL, ondalık double.
        conversionValueMicros: googleValueToMicros(metrics?.conversionsValue),
        currency: (this.str(this.obj(row.customer)?.currencyCode) ?? 'TRY')
          .toUpperCase()
          .slice(0, 3),
      });
    }

    return { rows, apiCalls: calls.n };
  }

  async fetchKeywords(
    ctx: FetchContext,
    request: { dateFrom: string; dateTo: string },
  ): Promise<{ rows: DiscoveredKeywordRow[]; apiCalls: number }> {
    const customerId = ctx.accountExternalId;
    const calls = { n: 0 };

    const raw = await this.searchGaqlPaged<Record<string, unknown>>(
      ctx.accessToken,
      customerId,
      `SELECT ad_group_criterion.criterion_id,
              ad_group_criterion.keyword.text,
              ad_group_criterion.keyword.match_type,
              ad_group.id,
              segments.date,
              customer.currency_code,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value
       FROM keyword_view
       WHERE segments.date BETWEEN '${request.dateFrom}' AND '${request.dateTo}'
         AND metrics.impressions > 0`,
      ctx.loginCustomerId,
      calls,
    );

    const rows: DiscoveredKeywordRow[] = [];
    for (const row of raw) {
      const criterion = this.obj(row.adGroupCriterion);
      const keywordObj = this.obj(criterion?.keyword);
      const metrics = this.obj(row.metrics);
      const segments = this.obj(row.segments);

      const criterionId = this.str(criterion?.criterionId);
      const text = this.str(keywordObj?.text);
      const date = this.str(segments?.date);
      // Üçü de zorunlu: kimliksiz ya da tarihsiz bir satır tekil anahtara
      // yazılamaz ve metinsiz bir satır raporda boş bir hücre olurdu.
      if (!criterionId || !text || !date) continue;

      rows.push({
        externalCriterionId: criterionId,
        keyword: text.slice(0, 500),
        matchType: normalizeMatchType(this.str(keywordObj?.matchType)),
        adGroupExternalId: this.str(this.obj(row.adGroup)?.id),
        date,
        impressions: Number(metrics?.impressions ?? 0) || 0,
        clicks: Number(metrics?.clicks ?? 0) || 0,
        // Zaten micros — Google `cost_micros` veriyor, çevrim yok.
        spendMicros: this.micros(metrics?.costMicros) ?? 0n,
        conversions: Number(metrics?.conversions ?? 0) || 0,
        // `conversions_value` micros DEĞİL, ondalık double. İkisini aynı
        // sanmak değeri bir milyon kat yanlış gösterir.
        conversionValueMicros: googleValueToMicros(metrics?.conversionsValue),
        currency: (this.str(this.obj(row.customer)?.currencyCode) ?? 'TRY')
          .toUpperCase()
          .slice(0, 3),
      });
    }

    return { rows, apiCalls: calls.n };
  }

}

/**
 * Seviye → GAQL kaynağı ve kimlik alanı.
 *
 * Google'da hesap seviyesi metrikleri `customer` kaynağından geliyor; alt
 * seviyeler kendi kaynaklarından. Kimlik alanı da her seviyede farklı adlanıyor,
 * bu yüzden okuma fonksiyonu haritada tutuluyor.
 */
const GOOGLE_VIEW: Record<
  InsightsLevel,
  {
    resource: string;
    idField: string;
    readId: (row: Record<string, unknown>, p: GoogleProvider) => string | undefined;
  }
> = {
  account: {
    resource: 'customer',
    idField: 'customer.id',
    readId: (row, p) => p.readNested(row, ['customer', 'id']),
  },
  campaign: {
    resource: 'campaign',
    idField: 'campaign.id',
    readId: (row, p) => p.readNested(row, ['campaign', 'id']),
  },
  ad_group: {
    resource: 'ad_group',
    idField: 'ad_group.id',
    readId: (row, p) => p.readNested(row, ['adGroup', 'id']),
  },
  ad: {
    resource: 'ad_group_ad',
    idField: 'ad_group_ad.ad.id',
    readId: (row, p) => p.readNested(row, ['adGroupAd', 'ad', 'id']),
  },
};

/**
 * Google dönüşüm DEĞERİ micros değil — ondalık `double`.
 *
 * `cost_micros` micros ama `conversions_value` para birimi biriminde geliyor.
 * İkisini aynı sanmak dönüşüm değerini 1.000.000 kat yanlış gösterir.
 */
function googleValueToMicros(value: unknown): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * 1_000_000));
}

/**
 * Eşleme türünü normalleştirir.
 *
 * Google beklenmedik bir değer verirse `UNKNOWN`: veritabanı kısıtı bilinen
 * dört değeri kabul ediyor ve ham değeri geçirmek tüm senkronizasyonu
 * düşürürdü. Bir anahtar kelimenin eşleme türünü bilmemek, o kelimenin
 * performansını hiç kaydetmemekten iyi.
 */
function normalizeMatchType(raw: string | undefined): DiscoveredKeywordRow['matchType'] {
  const v = (raw ?? '').toUpperCase();
  return v === 'EXACT' || v === 'PHRASE' || v === 'BROAD' ? v : 'UNKNOWN';
}

/** 1234567890 → 123-456-7890 (Google arayüzündeki gösterim). */
function customerLabel(id: string): string {
  return id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
