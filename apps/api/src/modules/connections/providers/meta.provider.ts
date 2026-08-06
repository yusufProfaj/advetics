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
  type PlatformInsights,
  type NormalizedAccountStatus,
  type NormalizedBudgetMode,
  type NormalizedEntityStatus,
  type OAuthTokens,
  type PlatformStructure,
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

/** Ortak seviye adlarımız → Meta'nın `level` parametresi. */
const META_LEVEL: Record<InsightsLevel, string> = {
  account: 'account',
  campaign: 'campaign',
  ad_group: 'adset',
  ad: 'ad',
};

/**
 * "Dönüşüm" sayılan Meta aksiyon türleri.
 *
 * Meta tek bir "conversions" metriği vermiyor; onlarca aksiyon türü döndürüyor
 * ve hangisinin dönüşüm olduğu kampanya amacına göre değişiyor. Bu liste
 * KARARDIR, gerçek değil: lead formu, pixel dönüşümleri ve mesajlaşma
 * başlatmaları sayılıyor; sayfa beğenisi veya video görüntüleme sayılmıyor.
 *
 * Ham aksiyon dizisi `raw_metrics` içinde saklanıyor — liste yanlış çıkarsa
 * geçmiş veriyi yeniden ÇEKMEDEN yeniden hesaplayabiliyoruz.
 */
const CONVERSION_ACTION_TYPES = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.purchase',
  'purchase',
  'complete_registration',
  'submit_application',
] as const;

/**
 * Meta (Facebook / Instagram) — Marketing API adapter'ı.
 *
 * Kapsam: reklam hesabı keşfi, sayfa/Instagram profili keşfi, token yaşam
 * döngüsü, L1 yapı okuma. Yazma aksiyonları Modül 5'te eklenecek.
 */
@Injectable()
export class MetaProvider implements IAdPlatformProvider {
  readonly platform: Platform = 'meta';
  private readonly logger = new Logger(MetaProvider.name);

  /**
   * ÇEKİRDEK izinler — Modül 3-6 (senkronizasyon, Ads Explorer, kurallar,
   * raporlar) bunlar olmadan çalışmaz.
   *
   *   ads_read            → insight ve yapı okuma
   *   ads_management      → bütçe/durum değiştirme (Modül 5 kural aksiyonları)
   *   business_management → müşterinin Business Manager varlıklarına erişim
   */
  readonly requiredScopes = ['ads_read', 'ads_management', 'business_management'] as const;

  /**
   * ÖZELLİK izinleri — yalnızca Auto-Boost (Modül 7) için.
   *
   * Ayrı tutulmalarının sebebi App Review sürecidir: Meta her izni tek tek
   * onaylıyor ve her biri için ayrı ekran kaydı ile API testi istiyor. Auto-Boost
   * henüz yazılmadığı için gösterilemez; bu izinleri ilk başvuruya koymak
   * reddedilme riski demek. Onaylanana kadar bağlantı çalışmaya devam eder,
   * yalnızca Auto-Boost kullanılamaz.
   */
  readonly optionalScopes = [
    'pages_show_list',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_insights',
  ] as const;

  /** İzin ekranında istenen tüm scope'lar. */
  private get allScopes(): string[] {
    return [...this.requiredScopes, ...this.optionalScopes];
  }

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
    url.searchParams.set('scope', this.allScopes.join(','));
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

  /**
   * Meta'da izinleri geri alır.
   *
   * `DELETE /me/permissions` kullanıcının uygulamaya verdiği tüm izinleri
   * kaldırır — Facebook ayarlarından elle kaldırmakla aynı etki. Bu, Meta'nın
   * deauthorize webhook'unu da tetikler; bizim tarafta bağlantı zaten
   * kaldırıldığı için webhook eşleşme bulamaz ve sessizce geçer.
   */
  async revokeToken(tokens: { accessToken: string }): Promise<void> {
    await platformFetch(
      'meta',
      `${this.graph}/me/permissions?access_token=${encodeURIComponent(tokens.accessToken)}`,
      { method: 'DELETE' },
      parseMetaRateLimit,
    );
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
      // Yalnızca ÇEKİRDEK eksikler "missing" sayılır — özellik izinlerinin
      // eksikliği bağlantıyı bozmaz, sadece Auto-Boost'u kapatır.
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

  // ---------------------------------------------------------------------------
  // L1 — yapı senkronizasyonu
  // ---------------------------------------------------------------------------

  /**
   * Kampanya → ad set → ad → creative hiyerarşisini çeker.
   *
   * SEVİYE BAŞINA BİR EDGE ÇAĞRISI, ad başına ayrı creative çağrısı DEĞİL.
   * Meta'nın `adcreatives` alanını ad edge'i içine gömebilmesi (`creative{...}`)
   * burada kritik: 500 reklamlı bir hesapta ad başına creative çekmek 500 ek
   * çağrı, yani kotanın tamamı demek olurdu.
   *
   * `since` verildiğinde `filtering` ile sunucu tarafında süzüyoruz. Meta'nın
   * `updated_time` filtresi ad set ve ad seviyesinde çalışıyor; kampanya
   * seviyesinde de destekli. Delta sonucu KISMİDİR — dönmeyen varlık silinmiş
   * sayılmaz.
   */
  async fetchStructure(ctx: FetchContext, since?: Date): Promise<PlatformStructure> {
    // Hesap kimliği `act_` prefix'i ile gelmeli; keşifte öyle kaydediyoruz ama
    // dışarıdan ham kimlik gelme ihtimaline karşı normalize ediyoruz.
    const act = ctx.accountExternalId.startsWith('act_')
      ? ctx.accountExternalId
      : `act_${ctx.accountExternalId}`;

    const calls = { n: 0 };
    const campaigns: DiscoveredCampaign[] = [];
    const adGroups: DiscoveredAdGroup[] = [];
    const ads: DiscoveredAd[] = [];
    // Aynı creative birden fazla reklamda kullanılabilir; Map ile tekilleştiriyoruz.
    const creatives = new Map<string, DiscoveredCreative>();
    let complete = true;

    const campaignPages = await this.pagedEdge(
      ctx,
      act,
      'campaigns',
      [
        'id',
        'name',
        'objective',
        'status',
        'effective_status',
        'daily_budget',
        'lifetime_budget',
        'bid_strategy',
        'start_time',
        'stop_time',
        'updated_time',
      ],
      since,
      calls,
    );
    if (!campaignPages.complete) complete = false;
    for (const raw of campaignPages.rows) {
      const budget = this.readMetaBudget(raw);
      campaigns.push({
        externalId: String(raw.id),
        name: String(raw.name ?? raw.id),
        objective: raw.objective ? String(raw.objective) : undefined,
        status: this.mapEntityStatus(raw.effective_status ?? raw.status),
        effectiveStatus: raw.effective_status ? String(raw.effective_status) : undefined,
        budgetMode: budget.mode,
        budgetAmountMicros: budget.micros,
        bidStrategy: raw.bid_strategy ? String(raw.bid_strategy) : undefined,
        startTime: this.parseDate(raw.start_time),
        stopTime: this.parseDate(raw.stop_time),
        platformUpdatedAt: this.parseDate(raw.updated_time),
        raw,
      });
    }

    const adSetPages = await this.pagedEdge(
      ctx,
      act,
      'adsets',
      [
        'id',
        'name',
        'campaign_id',
        'status',
        'effective_status',
        'daily_budget',
        'lifetime_budget',
        'bid_amount',
        'optimization_goal',
        'targeting',
        'start_time',
        'end_time',
        'updated_time',
      ],
      since,
      calls,
    );
    if (!adSetPages.complete) complete = false;
    for (const raw of adSetPages.rows) {
      const budget = this.readMetaBudget(raw);
      adGroups.push({
        externalId: String(raw.id),
        name: String(raw.name ?? raw.id),
        campaignExternalId: String(raw.campaign_id ?? ''),
        status: this.mapEntityStatus(raw.effective_status ?? raw.status),
        effectiveStatus: raw.effective_status ? String(raw.effective_status) : undefined,
        budgetMode: budget.mode,
        budgetAmountMicros: budget.micros,
        bidAmountMicros: this.centsToMicros(raw.bid_amount),
        optimizationGoal: raw.optimization_goal ? String(raw.optimization_goal) : undefined,
        targeting: raw.targeting,
        startTime: this.parseDate(raw.start_time),
        // Meta ad set seviyesinde `end_time`, kampanyada `stop_time` diyor.
        stopTime: this.parseDate(raw.end_time),
        platformUpdatedAt: this.parseDate(raw.updated_time),
        raw,
      });
    }

    const adPages = await this.pagedEdge(
      ctx,
      act,
      'ads',
      [
        'id',
        'name',
        'adset_id',
        'status',
        'effective_status',
        'updated_time',
        // ÖNİZLEME BAĞLANTISI — reklamın Meta'daki gerçek görünümü.
        //
        // Alternatifi `/{ad_id}/previews` uç noktası ve o reklam başına AYRI
        // bir çağrı demek (500 reklamlı hesapta kotanın tamamı). Bu alan aynı
        // istekte geliyor ve kullanıcıyı Meta'nın kendi önizlemesine
        // götürüyor — bizim yeniden çizmeye çalışmamızdan her zaman daha
        // doğru, çünkü yerleşim ve biçim kurallarını Meta uyguluyor.
        'preview_shareable_link',
        // Creative'i GÖMÜLÜ istiyoruz — ad başına ayrı çağrı kotayı bitirir.
        // Sayfa gönderisi tabanlı creative'lerde (object_type=SHARE) link
        // `object_story_spec` içinde DEĞİL, gönderinin kendisinde. O yüzden
        // `link_destination_display_url` ve `effective_object_story_id` de
        // isteniyor — aynı çağrıda geliyorlar, ek kota maliyeti yok.
        'creative{id,name,object_type,title,body,link_url,call_to_action_type,' +
          'image_url,thumbnail_url,object_story_spec,asset_feed_spec,' +
          // `asset_feed_spec` BÜTÜN OLARAK isteniyor ve içindeki `images`
          // kendiliğinden geliyor. Bir tur önce `images`i ayrı bir alan gibi
          // listeye eklemiştim; Meta onu `adcreative` alanı sanıp
          // "(#100) Tried accessing nonexisting field (images)" ile tüm
          // senkronizasyonu düşürdü. İç içe bir alanın alt alanı, üst nesne
          // istendiğinde ayrıca istenmez.
          'object_story_id,effective_object_story_id,link_destination_display_url,url_tags}',
        // Reddedilme sebepleri Modül 4'te (Ads Explorer) gösterilecek.
        'ad_review_feedback',
      ],
      since,
      calls,
    );
    if (!adPages.complete) complete = false;
    for (const raw of adPages.rows) {
      const creative =
        raw.creative && typeof raw.creative === 'object'
          ? (raw.creative as Record<string, unknown>)
          : undefined;
      const creativeId = creative?.id ? String(creative.id) : undefined;

      if (creative && creativeId && !creatives.has(creativeId)) {
        creatives.set(creativeId, this.mapMetaCreative(creativeId, creative));
      }

      ads.push({
        externalId: String(raw.id),
        name: String(raw.name ?? raw.id),
        adGroupExternalId: String(raw.adset_id ?? ''),
        status: this.mapEntityStatus(raw.effective_status ?? raw.status),
        effectiveStatus: raw.effective_status ? String(raw.effective_status) : undefined,
        creativeExternalId: creativeId,
        previewUrl: text(raw.preview_shareable_link),
        reviewStatus: this.reviewStatusFrom(raw.effective_status),
        disapprovalReasons: raw.ad_review_feedback,
        platformUpdatedAt: this.parseDate(raw.updated_time),
        raw,
      });
    }

    return {
      campaigns,
      adGroups,
      ads,
      creatives: [...creatives.values()],
      complete,
      apiCalls: calls.n,
    };
  }

  /**
   * Bir edge'in tüm sayfalarını toplar.
   *
   * `limit=500`: Meta bu edge'lerde 500'e izin veriyor ve sayfa sayısını 5×
   * azaltmak kotanın `call_count` bileşenini doğrudan düşürüyor.
   *
   * Sayfa üst sınırı aşılırsa `complete: false` dönüyor — sessizce kesilmiş bir
   * liste, eksik varlıkların silinmiş sanılmasına yol açar.
   */
  private async pagedEdge(
    ctx: FetchContext,
    act: string,
    edge: 'campaigns' | 'adsets' | 'ads',
    fields: string[],
    since: Date | undefined,
    calls: { n: number },
  ): Promise<{ rows: Array<Record<string, unknown>>; complete: boolean }> {
    const url = new URL(`${this.graph}/${act}/${edge}`);
    url.searchParams.set('fields', fields.join(','));
    url.searchParams.set('limit', '500');
    url.searchParams.set('access_token', ctx.accessToken);
    // THUMBNAIL BOYUTU.
    //
    // Meta `thumbnail_url` alanını varsayılan olarak ~64px döndürüyor ve
    // sayfa gönderisi tabanlı creative'lerde `image_url` hiç gelmediği için
    // panelde gösterilen tek görsel o oluyordu — okunamayacak kadar bulanık.
    // Bu parametreler yalnızca reklam edge'inde geçerli.
    if (edge === 'ads') {
      url.searchParams.set('thumbnail_width', '600');
      url.searchParams.set('thumbnail_height', '600');
    }

    // `effective_status` FİLTRESİ KULLANMIYORUZ — kasıtlı.
    //
    // Amaç arşivlenmiş varlıkları da çekmekti (soft delete kararını
    // etkiliyor). Ama bu enum'un geçerli değerleri hem SEVİYEYE hem API
    // SÜRÜMÜNE göre değişiyor ve tek yanlış değer tüm isteği hata 100
    // (Invalid parameter) ile düşürüyor. Üç edge için doğru listeyi ezberden
    // tahmin etmek, her sürüm yükseltmesinde senkronizasyonun sessizce
    // durması riskini taşıyor.
    //
    // Filtre olmadan Meta arşivlenmiş varlıkları döndürmüyor. Sonuç: onlar
    // bizim tarafta "platformdan kayboldu" sayılıp `deleted_at` alıyor.
    // Bu kabul edilebilir bir sadeleştirme — arşivlenmiş bir kampanya artık
    // yayında değil ve geçmiş metrikleri `insights_daily`'de korunuyor.
    // Arşiv/silinme ayrımı gerekirse (Modül 4 Ads Explorer) o zaman seviyeye
    // özel doğrulanmış listelerle geri eklenir.

    if (since) {
      // Meta filtering: alan + operatör + değer. `updated_time` epoch saniye.
      url.searchParams.set(
        'filtering',
        JSON.stringify([
          {
            field: 'updated_time',
            operator: 'GREATER_THAN',
            value: Math.floor(since.getTime() / 1000),
          },
        ]),
      );
    }

    const rows: Array<Record<string, unknown>> = [];
    let next: string | undefined = url.toString();
    let pages = 0;
    const MAX_PAGES = 40;

    while (next && pages < MAX_PAGES) {
      const res = await platformFetch<GraphPage>('meta', next, {}, parseMetaRateLimit);
      calls.n++;
      if (res.rateLimit && ctx.onRateLimit) await ctx.onRateLimit(res.rateLimit);

      const body: GraphPage = res.data;
      rows.push(...(body.data ?? []));
      next = body.paging?.next;
      pages++;
    }

    if (next) {
      this.logger.warn(
        `Meta ${edge} listesi ${MAX_PAGES} sayfada kesildi (${act}) — sonuç KISMİ işaretlendi`,
      );
      return { rows, complete: false };
    }

    return { rows, complete: true };
  }

  /**
   * Gömülü creative nesnesini ortak şekle çevirir.
   *
   * Gerçek iş modül seviyesindeki `mapMetaCreativeFields` fonksiyonunda —
   * saf ve export edilmiş olması birim testi mümkün kılıyor. Bu eşleme iki kez
   * yanlış çıktı ve her ikisinde de hata ancak canlı veriyle görüldü.
   */
  private mapMetaCreative(id: string, c: Record<string, unknown>): DiscoveredCreative {
    return mapMetaCreativeFields(id, c);
  }

  /**
   * Meta'nın bütçe alanlarını okur.
   *
   * Meta bütçeyi hesabın para biriminin EN KÜÇÜK BİRİMİNDE (kuruş/cent) veriyor,
   * Google ise micros. İkisini micros'a çeviriyoruz: 1 cent = 10.000 micros.
   * Bunu karıştırmak bütçeleri 10.000 kat yanlış gösterir.
   */
  private readMetaBudget(raw: Record<string, unknown>): {
    mode: NormalizedBudgetMode;
    micros?: bigint;
  } {
    const daily = this.centsToMicros(raw.daily_budget);
    if (daily !== undefined && daily > 0n) return { mode: 'daily', micros: daily };
    const lifetime = this.centsToMicros(raw.lifetime_budget);
    if (lifetime !== undefined && lifetime > 0n) return { mode: 'lifetime', micros: lifetime };
    // Bütçe yok demek CBO/üst seviye bütçe demek — hata değil.
    return { mode: 'none' };
  }

  private centsToMicros(value: unknown): bigint | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return BigInt(Math.round(n)) * 10_000n;
  }

  private str(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private parseDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  // ---------------------------------------------------------------------------
  // L2 / L3 / L4 — metrikler
  // ---------------------------------------------------------------------------

  /**
   * Günlük metrikleri çeker.
   *
   * `time_increment=1` KRİTİK: bu olmadan Meta tüm aralık için TEK toplam satır
   * döndürüyor. Günlük satır istemek 30 günü tek çağrıda almamızı sağlıyor —
   * gün başına ayrı çağrı yapmak 30× kota demek olurdu.
   */
  async fetchInsights(ctx: FetchContext, request: InsightsRequest): Promise<PlatformInsights> {
    const act = ctx.accountExternalId.startsWith('act_')
      ? ctx.accountExternalId
      : `act_${ctx.accountExternalId}`;

    const url = new URL(`${this.graph}/${act}/insights`);
    url.searchParams.set('level', META_LEVEL[request.level]);
    url.searchParams.set('time_increment', '1');
    url.searchParams.set(
      'time_range',
      JSON.stringify({ since: request.dateFrom, until: request.dateTo }),
    );
    url.searchParams.set('limit', '500');
    url.searchParams.set('access_token', ctx.accessToken);
    url.searchParams.set(
      'fields',
      [
        'date_start',
        'account_currency',
        request.level === 'campaign' ? 'campaign_id' : '',
        request.level === 'ad_group' ? 'adset_id' : '',
        request.level === 'ad' ? 'ad_id' : '',
        'impressions',
        'clicks',
        'spend',
        'reach',
        'frequency',
        'inline_post_engagement',
        // Dönüşümler aksiyon dizilerinde; hangi aksiyonun "dönüşüm" sayıldığı
        // kampanya amacına göre değişiyor, bu yüzden hepsini alıp saklıyoruz.
        'actions',
        'action_values',
        'video_thruplay_watched_actions',
        'video_play_actions',
      ]
        .filter(Boolean)
        .join(','),
    );

    const rows: DiscoveredInsightRow[] = [];
    let next: string | undefined = url.toString();
    let pages = 0;
    let calls = 0;
    const MAX_PAGES = 60;

    while (next && pages < MAX_PAGES) {
      const res = await platformFetch<GraphPage>('meta', next, {}, parseMetaRateLimit);
      calls++;
      if (res.rateLimit && ctx.onRateLimit) await ctx.onRateLimit(res.rateLimit);

      // Adlandırılmış tip bağı koparıyor — bkz. GraphPage yorumundaki TS7022.
      const body: GraphPage = res.data;
      for (const raw of body.data ?? []) {
        const row = this.mapMetaInsightRow(raw, request.level, act);
        if (row) rows.push(row);
      }
      next = body.paging?.next;
      pages++;
    }

    if (next) {
      this.logger.warn(
        `Meta insights ${MAX_PAGES} sayfada bitmedi (${act}, ${request.dateFrom}..${request.dateTo}) — KISMİ`,
      );
      return { rows, apiCalls: calls, complete: false };
    }

    return { rows, apiCalls: calls, complete: true };
  }

  private mapMetaInsightRow(
    raw: Record<string, unknown>,
    level: InsightsLevel,
    act: string,
  ): DiscoveredInsightRow | null {
    const date = text(raw.date_start);
    if (!date) return null;

    // Hesap seviyesinde Meta varlık kimliği döndürmüyor — hesabın kendisi.
    const entityExternalId =
      level === 'account'
        ? act
        : text(raw.campaign_id ?? raw.adset_id ?? raw.ad_id);
    if (!entityExternalId) return null;

    const actions = countActions(raw.actions, CONVERSION_ACTION_TYPES);
    const values = sumActionValues(raw.action_values, CONVERSION_ACTION_TYPES);

    return {
      entityExternalId,
      level,
      date,
      currency: (text(raw.account_currency) ?? 'USD').toUpperCase().slice(0, 3),
      impressions: int(raw.impressions),
      clicks: int(raw.clicks),
      // HARCAMA BÜTÇEDEN FARKLI BİRİMDE.
      //
      // Bütçe alanları (daily_budget) hesabın en küçük biriminde (kuruş) gelir;
      // insights `spend` ise ONDALIK bir string ("1234.56"). İkisini aynı
      // sanmak harcamayı 10.000 kat yanlış gösterir — bütçe 100 TRY iken
      // harcama 1.000.000 TRY görünürdü.
      spendMicros: decimalToMicros(raw.spend),
      conversions: actions,
      conversionValueMicros: decimalToMicros(values),
      // ThruPlay tercih ediliyor: "video görüntüleme" olarak anlamlı olan
      // 15 saniye/tamamlanma eşiği, 3 saniyelik oynatma değil.
      videoViews:
        countActions(raw.video_thruplay_watched_actions, null) ||
        countActions(raw.video_play_actions, null),
      engagements: int(raw.inline_post_engagement),
      reach: int(raw.reach),
      frequency: raw.frequency !== undefined ? Number(raw.frequency) || undefined : undefined,
      raw,
    };
  }

  /**
   * `effective_status`tan YALNIZCA inceleme ile ilgili durumları çıkarır.
   *
   * Önce `effective_status` doğrudan `reviewStatus` alanına yazılıyordu ve
   * sonuç anlamsızdı: duraklatılmış bir reklamın "inceleme durumu"
   * `ADSET_PAUSED` görünüyordu. `reviewStatus` reklamın Meta incelemesinden
   * geçip geçmediğini anlatmalı; duraklatılmış olmak bir inceleme durumu değil.
   *
   * Meta'da Google'ın `approval_status`ına karşılık gelen ayrı bir alan yok;
   * inceleme bilgisi `effective_status`un içine gömülü. Bu yüzden süzüyoruz —
   * inceleme dışı durumlarda alan NULL kalıyor ve Modül 4 "inceleme bilgisi
   * yok" ile "reddedildi" arasını ayırt edebiliyor. Reddedilme SEBEPLERİ
   * ayrıca `disapprovalReasons` alanında (`ad_review_feedback`).
   */
  private reviewStatusFrom(value: unknown): string | undefined {
    const s = String(value ?? '').toUpperCase();
    const REVIEW_STATES = [
      'PENDING_REVIEW',
      'DISAPPROVED',
      'PREAPPROVED',
      'PENDING_BILLING_INFO',
      'WITH_ISSUES',
      'IN_PROCESS',
    ];
    return REVIEW_STATES.includes(s) ? s : undefined;
  }

  /**
   * Meta'nın `effective_status` sözlüğünü ortak dile çevirir.
   *
   * `effective_status` üst seviyeden miras alınan durumu da içeriyor
   * (CAMPAIGN_PAUSED, ADSET_PAUSED): kampanya duraklatıldığında altındaki
   * reklamın kendi `status`u ACTIVE kalır ama gerçekte yayında değildir.
   * Kural motorunun (Modül 5) "aktif" tanımı bu yüzden effective_status'a
   * dayanmalı.
   */
  private mapEntityStatus(value: unknown): NormalizedEntityStatus {
    const s = String(value ?? '').toUpperCase();
    switch (s) {
      case 'ACTIVE':
        return 'active';
      case 'PAUSED':
      case 'CAMPAIGN_PAUSED':
      case 'ADSET_PAUSED':
        return 'paused';
      case 'DELETED':
      case 'ARCHIVED':
        return 'deleted';
      case 'PENDING_REVIEW':
      case 'IN_PROCESS':
      case 'PREAPPROVED':
      case 'PENDING_BILLING_INFO':
        return 'pending_review';
      case 'DISAPPROVED':
      case 'WITH_ISSUES':
        // Reddedilen reklam yayında değil ama "silinmiş" de değil; durumu
        // `effectiveStatus` alanında ham hâliyle korunuyor.
        return 'paused';
      case 'CAMPAIGN_ENDED':
      case 'ADSET_ENDED':
        return 'ended';
      default:
        return 'unknown';
    }
  }
}

/**
 * Meta creative'ini ortak şekle çevirir — SAF FONKSİYON.
 *
 * Meta içeriği ÜÇ ayrı yapıda taşıyor ve hangisini kullandığı creative'in
 * nasıl oluşturulduğuna bağlı:
 *
 *   1. Düz alanlar (`title`, `body`, `link_url`) — eski tekil creative'ler
 *   2. `object_story_spec.link_data` — elle yazılmış link reklamları
 *   3. `asset_feed_spec` — dinamik/Advantage+ creative'ler
 *
 * Canlı veride görülen bir tuzak: mevcut bir sayfa gönderisinden üretilmiş
 * creative'lerde `object_story_spec` GELİYOR ama içinde yalnızca `page_id` ve
 * `instagram_user_id` var — `link_data` YOK. İçerik `asset_feed_spec`te.
 * Yalnızca `object_story_spec.link_data`ya güvenmek bu creative'lerde her şeyi
 * boş bırakıyordu.
 */
export function mapMetaCreativeFields(
  id: string,
  c: Record<string, unknown>,
): DiscoveredCreative {
  const story = asObject(c.object_story_spec);
  const link = asObject(story?.link_data);
  const feed = asObject(c.asset_feed_spec);

  // GÖRSEL SIRASI KALİTEYE GÖRE — `thumbnail_url` EN SONDA.
  //
  // Meta'nın thumbnail'i küçük bir önizleme; tam boyutlu görsel `image_url`
  // ya da dinamik creative'lerde `asset_feed_spec.images[].url` içinde.
  // Önce thumbnail'i koymak panelde bulanık görsel göstermek demekti.
  const feedImages = Array.isArray(feed?.images)
    ? feed.images
        .map((i) => text(asObject(i)?.url ?? asObject(i)?.permalink_url))
        .filter((u): u is string => u !== undefined)
    : [];

  const assetUrls = [c.image_url, ...feedImages, link?.picture, c.thumbnail_url].filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );

  return {
    externalId: id,
    creativeType: c.object_type ? String(c.object_type) : undefined,
    headline: text(c.title ?? link?.name) ?? assetValue(feed?.titles, ['text']),
    primaryText: text(c.body ?? link?.message) ?? assetValue(feed?.bodies, ['text']),
    description: text(link?.description) ?? assetValue(feed?.descriptions, ['text']),
    ctaType:
      text(asObject(link?.call_to_action)?.type) ??
      text(c.call_to_action_type) ??
      // `call_to_action_types` ÇOĞUL ve düz string dizisi. Tekil `call_to_action_type`
      // alanını okumak dinamik creative'lerde CTA'yı hep boş bırakıyordu.
      assetValue(feed?.call_to_action_types, []),
    destinationUrl: realUrl(
      text(c.link_url ?? link?.link) ??
        // `link_urls` girişleri `{ website_url, display_url }` biçiminde —
        // `{ text }` DEĞİL. Yalnızca `text` anahtarına bakmak hedef URL'i her
        // dinamik creative'de kaçırıyordu.
        assetValue(feed?.link_urls, ['website_url', 'url', 'link']),
    ),
    displayUrl: realUrl(
      text(link?.caption ?? c.link_destination_display_url) ??
        assetValue(feed?.link_urls, ['display_url']),
    ),
    assetUrls: assetUrls.length > 0 ? assetUrls : undefined,
    raw: c,
  };
}

/**
 * `asset_feed_spec` dizilerinden ilk anlamlı değeri çeker.
 *
 * Meta bu dizilerin girişlerini alana göre FARKLI şekillerde veriyor:
 *
 *   titles / bodies / descriptions →  [{ text: '…' }]
 *   link_urls                      →  [{ website_url: '…', display_url: '…' }]
 *   call_to_action_types           →  ['LEARN_MORE']            (düz string)
 *
 * Tek bir anahtara bakmak diğer şekilleri sessizce kaçırmak demek. Aday
 * anahtar listesi geçerek şekle bağımlılığı kaldırıyoruz; boş dizi geçmek
 * "girişler düz string" anlamına geliyor.
 *
 * İlk DOLU değeri alıyoruz, ilk girişi değil: dinamik creative'lerde ilk
 * varyasyonun bir alanı boş olabiliyor.
 */
function assetValue(value: unknown, keys: readonly string[]): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0) return trimmed;
      continue;
    }
    const record = asObject(item);
    if (!record) continue;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Meta'nın YER TUTUCU URL'lerini ayıklar.
 *
 * Anlık form (lead) ve Click-to-WhatsApp reklamlarında gerçek bir açılış
 * sayfası yok — kullanıcı bir forma ya da sohbete gidiyor. Meta bu durumda
 * `link_urls` alanına `http://fb.me/` koyuyor.
 *
 * Bunu `destinationUrl` olarak saklamak veriyi kirletiyor: Ads Explorer
 * (Modül 4) "hedef: http://fb.me/" gösterir, raporlar onu açılış sayfası
 * sayar, açılış sayfası bazlı bir kural (Modül 5) yanlış eşleşir. Gerçek gibi
 * görünen çöp veri, boş veriden kötüdür — boş olduğunda en azından
 * "bilinmiyor" olduğu belli.
 *
 * Yalnızca YOLU OLMAYAN fb.me adresleri ayıklanıyor: `http://fb.me/abc`
 * gerçek bir kısa link olabilir, `http://fb.me/` olamaz. Ham değer `raw`
 * içinde korunuyor.
 */
function realUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Ayrıştırılamayan değeri olduğu gibi bırakıyoruz: bozuk da olsa
    // platformun söylediği şey bu ve sessizce silmek bilgi kaybı olur.
    return value;
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const hasPath = parsed.pathname.replace(/\/+$/, '').length > 0;
  if (host === 'fb.me' && !hasPath) return undefined;
  return value;
}

/** Boş ve yalnızca boşluktan oluşan değerleri `undefined`a indirger. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Aksiyon dizisindeki değerleri toplar.
 *
 * `types` null ise TÜM aksiyonlar toplanıyor (video metriklerinde dizi tek
 * türden oluşuyor). Aksi hâlde yalnızca listedeki türler.
 *
 * Meta aynı aksiyonu farklı atıf pencereleriyle tekrarlayabiliyor; biz
 * varsayılan pencereyi (`value`) kullanıyoruz — `1d_view`/`7d_click` gibi
 * alanlar ham gövdede duruyor ve gerekirse oradan okunur.
 */
function countActions(value: unknown, types: readonly string[] | null): number {
  if (!Array.isArray(value)) return 0;
  let total = 0;
  for (const item of value) {
    const record = asObject(item);
    if (!record) continue;
    const actionType = text(record.action_type);
    if (types && (!actionType || !types.includes(actionType))) continue;
    total += Number(record.value ?? 0) || 0;
  }
  return total;
}

/** Aksiyon DEĞERLERİNİ (para) toplar; ondalık string olarak döner. */
function sumActionValues(value: unknown, types: readonly string[]): string {
  return String(countActions(value, types));
}

/**
 * Ondalık para string'ini micros'a çevirir: "1234.56" → 1_234_560_000n.
 *
 * `Number` üzerinden çarpmak kayan nokta hatası üretiyor (0.1 * 1e6 =
 * 100000.00000000001), bu yüzden string olarak ayrıştırıyoruz. Para hatasının
 * bedeli yüksek: kuruş kaymaları raporlarda toplandığında görünür fark yapıyor.
 */
function decimalToMicros(value: unknown): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const raw = String(value).trim();
  const match = /^(-?)(\d*)(?:[.,](\d*))?$/.exec(raw);
  if (!match) {
    // Beklenmeyen biçim — sessizce 0 yazmak harcamayı kaybetmek olurdu.
    const fallback = Number(raw);
    return Number.isFinite(fallback) ? BigInt(Math.round(fallback * 1_000_000)) : 0n;
  }
  const [, sign, whole = '', frac = ''] = match;
  const micros = `${whole || '0'}${frac.padEnd(6, '0').slice(0, 6)}`;
  return BigInt(`${sign}${micros}`);
}

/** Tam sayıya çevirir; Meta sayıları string olarak döndürüyor. */
function int(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
