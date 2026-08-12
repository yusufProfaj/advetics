import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Platform } from '@advetics/shared';
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
  type PlatformActionRequest,
  type PublishDraftResult,
  type PlatformActionResult,
  type PlatformInsights,
  type NormalizedAccountStatus,
  type NormalizedBudgetMode,
  type NormalizedEntityStatus,
  type OAuthTokens,
  type PlatformStructure,
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
            ? `Google Ads ${customerLabel(customers[0]!)}`
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
   * KASITLI OLARAK UYGULANMADI.
   *
   * Google Ads bağlantısı bugüne kadar CANLI API'ye hiç çıkmadı — Basic
   * Access onayı bekleniyor ve `fetchStructure`/`fetchInsights` bile tek bir
   * kez gerçek yanıtla doğrulanmadı. Bu koşulda yazma uygulamak, test
   * edilmemiş kodun müşterinin kampanyalarını değiştirmesi demek olurdu.
   *
   * Sessizce başarılı dönmek ya da hiç metot tanımlamamak daha kötü olurdu:
   * kural motoru Google varlıklarını da eşleştiriyor ve aksiyonun
   * uygulanmadığını bilmeden "uygulandı" kaydı yazardı. Açık bir `permanent`
   * hata, kural kaydına sebebiyle birlikte düşüyor ve arayüzde görünüyor.
   *
   * Basic Access geldikten ve okuma tarafı canlıda doğrulandıktan sonra
   * `CampaignService.mutate` / `AdGroupService.mutate` ile yazılacak.
   */
  async applyAction(
    _ctx: FetchContext,
    action: PlatformActionRequest,
  ): Promise<PlatformActionResult> {
    throw new PlatformApiError(
      'google',
      'permanent',
      `Google Ads yazma işlemleri henüz uygulanmadı (${action.type}). ` +
        'Basic Access onayı ve okuma tarafının canlı doğrulaması bekleniyor.',
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
   * Toplu reklam oluşturma — Google'da HENÜZ UYGULANMADI.
   *
   * applyAction ile aynı gerekçe: Google bağlantısı canlı API'ye hiç çıkmadı
   * ve test edilmemiş kodun müşterinin hesabında 60 reklam oluşturması kabul
   * edilemez.
   */
  async createAd(): Promise<CreateAdResult> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads toplu oluşturma henüz uygulanmadı — Basic Access ve canlı doğrulama bekleniyor.',
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
   * Modül 4 — Google'da KARŞILIĞI VAR ama yazılmadı.
   *
   * Google Ads'te de görsel yükleme (`MediaFileService`) ve kampanya
   * oluşturma mümkün. Yazılmama sebebi Auto-Boost ile aynı: okuma tarafı bile
   * canlı API'de doğrulanmadı ve test edilmemiş kodun müşteri hesabında
   * kampanya açması kabul edilemez.
   */
  async uploadAdImage(): Promise<string> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads görsel yükleme henüz uygulanmadı — Basic Access onayı bekleniyor.',
    );
  }

  async publishDraft(): Promise<PublishDraftResult> {
    throw new PlatformApiError(
      'google',
      'permanent',
      'Google Ads reklam oluşturma henüz uygulanmadı — Basic Access onayı bekleniyor.',
    );
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
