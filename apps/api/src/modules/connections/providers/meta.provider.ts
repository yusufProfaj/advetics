import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  boostNameWithLabel,
  CONVERSION_BUCKETS,
  restrictTargetingFor,
  type GeoLocationOption,
  type Platform,
  type SavedAudienceOption,
  type SpecialAdCategory,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import {
  PlatformApiError,
  type CampaignSummary,
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
  type BoostRequest,
  type BoostSource,
  type CreateAdRequest,
  type CreateAdResult,
  type BoostResult,
  type DiscoveredKeywordRow,
  type DiscoveredOrganicPost,
  type PlatformActionRequest,
  type CreateLeadFormRequest,
  type DiscoveredLead,
  type PublishDraftRequest,
  type PublishDraftResult,
  type PlatformActionResult,
  type PlatformInsights,
  type NormalizedAccountStatus,
  type NormalizedBudgetMode,
  type NormalizedEntityStatus,
  type OAuthTokens,
  type PlatformStructure,
  type RateLimitSnapshot,
  type TokenVerification,
  BreakdownRequest,
  DiscoveredBreakdownRow,
  PlatformBreakdowns,
} from '../provider.types';
import { parseMetaRateLimit, platformFetch, type PlatformResponse } from './http';

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
 * Dönüşüm sayısı KOVALARDAN türetiliyor — ayrı bir liste YOK.
 *
 * Önce iki ayrı liste vardı: burada `CONVERSION_ACTION_TYPES`, raporda
 * `CONVERSION_BUCKETS`. Sonuç iki farklı "dönüşüm" tanımıydı ve panel ile
 * rapor farklı sayılar gösteriyordu (114 karşı 153). Üstelik ikisi de aynı
 * olayı iki kez sayıyordu: canlı hesapta `lead` ve
 * `onsite_conversion.lead_grouped` ikisi de 40 döndürüyor ve bunlar AYNI
 * 40 lead.
 *
 * Tek tanım: `CONVERSION_BUCKETS` (form + mesaj + satış), her kova öncelik
 * sırasıyla çözülüp toplanıyor. Kovalar birbirini kesmiyor, dolayısıyla
 * toplamak güvenli.
 */

/**
 * Meta (Facebook / Instagram) — Marketing API adapter'ı.
 *
 * Kapsam: reklam hesabı keşfi, sayfa/Instagram profili keşfi, token yaşam
 * döngüsü, L1 yapı okuma. Yazma aksiyonları Modül 5'te eklenecek.
 */
/**
 * Reklam hesabı kimliğini Graph yoluna çevirir — ÖNEKİ İKİ KEZ EKLEMEDEN.
 *
 * `ad_accounts.external_id` Meta'dan `act_` ÖNEKİYLE geliyor ve öyle
 * saklanıyor. Önek körlemesine eklendiğinde `act_act_1602474151544739`
 * çıkıyor ve Meta bunu "Object with ID does not exist, cannot be loaded due
 * to missing permissions" diye reddediyor — mesaj YETKİ sorunu gibi okunuyor
 * ve saatlerce yanlış yerde aranıyor.
 *
 * Bu tuzağa okuma yolunda bir kez düşülmüş ve koruma ORAYA konmuştu; yazma
 * yolları korumasız kaldı ve `ads_management` olmadan hiç çalıştırılamadıkları
 * için görünmedi. Koruma artık TEK YERDE — iki ayrı yerde tutmak, ikisinin
 * zamanla ayrışması demekti ve nitekim ayrıştı.
 */
/** Yapı taramasında sayfa başına istenen kayıt sayısı. */
const ILK_SAYFA_BOYUTU = 500;
/** Bunun altına inmek çağrı sayısını hesabın işleyemeyeceği kadar artırır. */
const EN_KUCUK_SAYFA = 25;
/** 500 → 250 → 125 → 62 → 31 → 25. Beş küçültme yeterli; sonrası döngü olur. */
const MAX_KUCULTME = 5;

/**
 * Meta "istediğin veri fazla" mı diyor?
 *
 * Bu hata HTTP 500 ile geliyor ve mesajı sabit. Kod/subcode'a bakmak
 * güvenilir değil: Meta bu durumda çoğu zaman kod 1 ("An unknown error
 * occurred") döndürüyor ve o kod başka onlarca durumda da çıkıyor. Ayırt
 * eden tek şey mesajın kendisi.
 */
export function veriFazlaHatasi(err: unknown): boolean {
  const mesaj = err instanceof Error ? err.message : String(err);
  return /reduce the amount of data/i.test(mesaj);
}

export function actPath(externalId: string): string {
  return externalId.startsWith('act_') ? externalId : `act_${externalId}`;
}

/**
 * Ad set'ler arası bütçe paylaşımı — META ARTIK AÇIKÇA SORUYOR.
 *
 * Kampanya seviyesinde bütçe kullanmayan (yani bütçeyi ad set'e koyan)
 * kampanyalarda Meta bu alanı ZORUNLU kılıyor ve eksikse isteği şu hatayla
 * reddediyor: "is_adset_budget_sharing_enabled alanında True veya False
 * belirtilmelidir" (subcode 4834011).
 *
 * DEĞER `false` VE İKİ SEBEBİ VAR:
 *
 *   1. Bu üründe her kampanya TEK AD SET ile oluşuyor. Paylaşacak ikinci bir
 *      ad set yok; `true` hiçbir şey değiştirmez ama ileride çok ad set'li bir
 *      kampanya eklendiğinde sessizce devreye girerdi.
 *   2. `true`, Meta'nın bütçenin %20'sini ad set'ler arasında taşımasına izin
 *      veriyor. Aylık bütçe takibi (Modül 5) harcamayı ad set bazında
 *      modelliyor; platformun bütçeyi kendi başına kaydırması, panelde yazan
 *      dağılımla gerçeğin ayrışması demek olurdu.
 *
 * Çok ad set'li kampanya desteği geldiğinde bu karar YENİDEN DÜŞÜNÜLMELİ —
 * orada paylaşım gerçekten performans kazandırabiliyor.
 */
const ADSET_BUDGET_SHARING = 'false';

/**
 * Boyut → Meta `breakdowns` parametresi.
 *
 * Harita TEK YERDE ve eksik anahtar `unsupported` demek. Switch ile yazmak,
 * yeni bir boyut eklendiğinde sessizce boş liste döndürme riski taşıyordu.
 */
const META_BREAKDOWN: Partial<Record<BreakdownRequest['dimension'], string>> = {
  age: 'age',
  gender: 'gender',
  placement: 'publisher_platform,platform_position',
  hour: 'hourly_stats_aggregated_by_advertiser_time_zone',
  // `region`, `city` DEĞİL — bkz. fetchBreakdowns yorumundaki gerekçe.
  city: 'region',
};

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
  /**
   * ÇEKİRDEK izinler — bunlar olmadan bağlantı iş görmez.
   *
   * `ads_management` BURADA DEĞİL, isteğe bağlıda. Yazma yetkisi olmadan
   * panel, Ads Explorer, raporlar ve bütçe takibi eksiksiz çalışıyor; yalnızca
   * kural motoru platforma dokunamıyor. Zorunlu saymak, App Review'un
   * `ads_management`i onaylamadığı dönemde çalışan bir bağlantıyı `needs_reauth`
   * göstermek olurdu — aşamalı başvurunun tam da kaçınmak istediği durum.
   */
  readonly requiredScopes = ['ads_read', 'business_management'] as const;

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
    // Kural motorunun yazma izni (Modül 5). Onaylanana kadar kurallar prova
    // modunda çalışmaya devam ediyor ve ne yapacaklarını gösteriyor.
    'ads_management',
    'pages_show_list',
    'pages_read_engagement',
    /**
     * `read_insights` — FACEBOOK GÖNDERİ İÇGÖRÜLERİ. Listede yoktu.
     *
     * `fetchOrganicPosts` Facebook tarafında `insights.metric(post_impressions,
     * post_impressions_unique,post_video_views)` istiyor ve Meta sayfa/gönderi
     * içgörüleri için bu izni ayrıca arıyor. Instagram tarafı
     * `instagram_manage_insights` ile karşılanıyordu; Facebook karşılığı
     * atlanmış.
     *
     * NEDEN SESSİZ KALDI: içgörüler İÇ İÇE ALAN olarak isteniyor, yani izin
     * eksikliği "metrikler boş geldi" değil "gönderi listesi hiç gelmedi"
     * olarak görünüyor — e5c8547'deki geçersiz metrik hatasının birebir aynı
     * mekanizması.
     */
    'read_insights',
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
      /**
       * `tasks` — kullanıcının SAYFA ÜZERİNDEKİ görevleri.
       *
       * NEDEN İSTENİYOR: sayfa token'ının hangi izinleri taşıyacağını bu
       * belirliyor. Canlıda şu durum çıktı ve teşhis edilemedi — aynı sayfa
       * token'ı Instagram medyası için çalışıyor, sayfa gönderileri için
       * "(#10) requires pages_read_engagement" ile reddediliyor. Kullanıcı
       * token'ında izin VAR; eksik olan şey sayfa seviyesinde.
       *
       * İki ihtimal vardı — sayfada yetersiz rol mü, uygulamada Advanced
       * Access eksikliği mi — ve ikisi de tahminle ayırt edilemiyordu. Meta
       * cevabı zaten veriyor; biz sormuyorduk.
       *
       * `raw` içinde saklanıyor: ayrı bir kolon açmak, tek bir teşhis için
       * şema büyütmek olurdu.
       */
      'tasks',
      'instagram_business_account{id,username,name,profile_picture_url}',
    ].join(',');

    let next: string | undefined =
      `${this.graph}/me/accounts?fields=${fields}&limit=100&access_token=${encodeURIComponent(accessToken)}`;
    let pages = 0;

    while (next && pages < 10) {
      const res = await platformFetch<GraphPage>('meta', next, {}, parseMetaRateLimit);
      const body: GraphPage = res.data;

      for (const raw of body.data ?? []) {
        profiles.push(...mapPageProfiles(raw));
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
    const act = actPath(ctx.accountExternalId);

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
    url.searchParams.set('limit', String(ILK_SAYFA_BOYUTU));
    url.searchParams.set('access_token', ctx.accessToken);
    // THUMBNAIL BOYUTU.
    //
    // Meta `thumbnail_url` alanını varsayılan olarak ~64px döndürüyor ve
    // sayfa gönderisi tabanlı creative'lerde `image_url` hiç gelmediği için
    // panelde gösterilen tek görsel o oluyordu — okunamayacak kadar bulanık.
    // Bu parametreler yalnızca reklam edge'inde geçerli.
    if (edge === 'ads') {
      /*
       * 600 → 1080. Gönderi ve video boost'larında Meta `image_url`
       * DÖNDÜRMÜYOR; elimizdeki tek görsel `thumbnail_url` ve varsayılanı
       * ~64px. Panelde ve raporda "bazı görseller piksel piksel, bazıları
       * net" tablosunun kalıcı yarısı buydu.
       *
       * Ek kota maliyeti YOK: aynı istekte bir parametre. Meta istenen
       * boyutu garanti etmiyor (kaynak daha küçükse onu döndürüyor), ama
       * tavanı yükseltmek bedava.
       *
       * DİKKAT: bu parametre yalnızca YENİ yazılan kreatiflere işliyor.
       * Zamanlanmış yapı taraması delta çalışıyor ve değişmemiş bir reklamı
       * yeniden yazmıyor — eski satırlar panelde "Şimdi güncelle"ye basılana
       * kadar (tam tarama) eski boyutta kalıyor.
       */
      url.searchParams.set('thumbnail_width', '1080');
      url.searchParams.set('thumbnail_height', '1080');
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

    /*
     * ═══ SAYFA BOYUTU KENDİLİĞİNDEN KÜÇÜLÜYOR ═══
     *
     * Meta büyük hesaplarda şu hatayı veriyor ve HTTP durumu 500 oluyor:
     *
     *   "Please reduce the amount of data you're asking for, then retry
     *    your request"
     *
     * Sabit bir eşik yok: kabul edilen sayfa boyutu hesabın büyüklüğüne,
     * istenen alan setine ve o anki yüke göre değişiyor. Aynı istek bir
     * hesapta çalışıp diğerinde düşüyor.
     *
     * Canlıda ürettiği tablo: bir reklam hesabında yapı taraması HİÇ
     * tamamlanamadı. Her denemede aynı yerde aynı hatayla düşüyor, beş
     * denemeden sonra kalıcı `failed` oluyor ve kampanya satırları hiç
     * yazılmadığı için o hesabın METRİKLERİ de hiç yazılamıyordu. Panelde
     * görünen tek şey "Yapı: hiç" idi.
     *
     * Sabit ve küçük bir limit koymak (örn. 50) bu hatayı önlerdi ama bütün
     * hesaplarda 10 kat daha fazla çağrı demek olurdu — kota bu projede
     * gerçek bir kısıt. Bunun yerine 500'den başlayıp hatayı GÖRÜNCE
     * yarılıyoruz; küçük hesaplar tek çağrıda bitmeye devam ediyor.
     */
    let limit = ILK_SAYFA_BOYUTU;
    let kucultme = 0;

    while (next && pages < MAX_PAGES) {
      let res;
      try {
        res = await platformFetch<GraphPage>('meta', next, {}, parseMetaRateLimit);
      } catch (err) {
        if (!veriFazlaHatasi(err) || limit <= EN_KUCUK_SAYFA || kucultme >= MAX_KUCULTME) throw err;
        limit = Math.max(EN_KUCUK_SAYFA, Math.floor(limit / 2));
        kucultme++;
        this.logger.warn(
          `Meta ${edge} (${act}): sayfa boyutu ${limit}'e düşürülüp aynı sayfa tekrar isteniyor ` +
            `(${kucultme}. küçültme).`,
        );
        // AYNI SAYFA yeniden isteniyor: `next` imleci koruyor, yalnızca
        // `limit` değişiyor. `pages` ARTMIYOR — küçültme bir ilerleme değil.
        // Tip AÇIKÇA yazılı: `next` özyinelemeli `GraphPage`'ten besleniyor ve
        // çıkarım TS7022 veriyor (dosya başındaki nota bakın).
        const u: URL = new URL(next as string);
        u.searchParams.set('limit', String(limit));
        next = u.toString();
        continue;
      }
      calls.n++;
      if (res.rateLimit && ctx.onRateLimit) await ctx.onRateLimit(res.rateLimit);

      const body: GraphPage = res.data;
      rows.push(...(body.data ?? []));
      // Meta'nın verdiği `next` kendi limitini taşıyor; küçülttüysek onu
      // korumak zorundayız, yoksa bir sonraki sayfa yine 500'lük olur.
      // Tip AÇIKÇA yazılı: `GraphPage` özyinelemeli ve çıkarım TS7022 veriyor
      // (dosyanın başındaki nota bakın).
      const sonraki: string | undefined = body.paging?.next;
      if (sonraki !== undefined && limit !== ILK_SAYFA_BOYUTU) {
        const u = new URL(sonraki);
        u.searchParams.set('limit', String(limit));
        next = u.toString();
      } else {
        next = sonraki;
      }
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
    const act = actPath(ctx.accountExternalId);

    const url = new URL(`${this.graph}/${act}/insights`);
    url.searchParams.set('level', META_LEVEL[request.level]);
    url.searchParams.set('time_increment', '1');
    url.searchParams.set(
      'time_range',
      JSON.stringify({ since: request.dateFrom, until: request.dateTo }),
    );
    url.searchParams.set('limit', '500');

    /*
     * ═══ ATIF AYARI AÇIKÇA GÖNDERİLİYOR — VARSAYILANA BIRAKILMIYOR ═══
     *
     * Bu üç parametre bir süre HİÇ gönderilmiyordu ve kararı Meta veriyordu.
     * CLAUDE.md'nin "platformun varsayılanına güvenme — aynı kod iki
     * müşteride farklı davranır" kuralının tam ihlaliydi: iki reklam
     * hesabının atıf penceresi farklıysa CPA ve ROAS karşılaştırılamaz hâle
     * geliyor ve fark HİÇBİR YERDE görünmüyor.
     *
     * `use_unified_attribution_setting=true` — dönüşümler ad set'in KENDİ
     * atıf ayarıyla raporlanıyor. Bu, Ads Manager'ın varsayılan olarak
     * gösterdiği sayının aynısı. Sabit bir pencere seçmek (örn. 7d_click)
     * "daha tutarlı" görünürdü ama panelin rakamı müşterinin Ads Manager'da
     * gördüğüyle tutmazdı ve o tartışmayı her ay yeniden yaşardık.
     *
     * `action_report_time=impression` — dönüşüm, GÖSTERİMİN olduğu güne
     * yazılıyor. Bu Meta'nın varsayılanı; buraya AÇIKÇA yazılmasının sebebi
     * varsayılanın değişmesine karşı korunmak. Alternatif (`conversion`)
     * dönüşümü gerçekleştiği güne yazar ve aylık rapor sınırlarında daha
     * doğru görünür — ama Ads Manager ile aramızda fark açar. Değiştirilecekse
     * bilerek ve müşteriye söylenerek değiştirilmeli.
     */
    url.searchParams.set('use_unified_attribution_setting', 'true');
    url.searchParams.set('action_report_time', 'impression');

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

  /**
   * ═══ KIRILIM METRİKLERİ ═══
   *
   * Meta'nın `breakdowns` parametresi. Her boyut AYRI ÇAĞRI: Meta çoğu
   * kombinasyonu reddediyor ("(#100) Breakdowns are not compatible") ve
   * kabul ettiklerinde de satır sayısı çarpım kadar büyüyor.
   *
   * ŞEHİR İÇİN `region` KULLANILIYOR, `city` DEĞİL. Türkiye'de Meta'nın
   * `region` kovaları illere denk geliyor ("Izmir Province") — kullanıcının
   * "şehir" dediği şey bu. `city` kovası ise ilçe/semt düzeyine iniyor,
   * kardinalitesi yüzlere çıkıyor ve raporda okunmaz bir tablo üretiyor.
   *
   * SAAT KOVASI REKLAM HESABININ ZAMAN DİLİMİNDE.
   * `hourly_stats_aggregated_by_advertiser_time_zone` seçildi çünkü panelin
   * geri kalanı da hesabın zaman dilimini kullanıyor; izleyicinin zaman
   * dilimine göre toplayan kova ("...by_audience_time_zone") aynı ekranda
   * iki farklı "gün" tanımı demek olurdu.
   */
  async fetchBreakdowns(
    ctx: FetchContext,
    request: BreakdownRequest,
  ): Promise<PlatformBreakdowns> {
    const kova = META_BREAKDOWN[request.dimension];
    if (!kova) return { rows: [], apiCalls: 0, complete: true, unsupported: true };

    const act = actPath(ctx.accountExternalId);
    const url = new URL(`${this.graph}/${act}/insights`);
    // HESAP SEVİYESİ: rapor "müşterinin kitlesi kim" diye soruyor.
    url.searchParams.set('level', 'account');
    url.searchParams.set('time_increment', '1');
    url.searchParams.set(
      'time_range',
      JSON.stringify({ since: request.dateFrom, until: request.dateTo }),
    );
    url.searchParams.set('breakdowns', kova);
    url.searchParams.set('limit', '500');
    /*
     * ATIF AYARI BURADA DA AÇIKÇA. `fetchInsights` ile aynı gerekçe: iki
     * çağrı farklı pencere kullanırsa kırılım toplamı ana rakamı tutmaz ve
     * fark hiçbir yerde görünmez.
     */
    url.searchParams.set('use_unified_attribution_setting', 'true');
    url.searchParams.set('action_report_time', 'impression');
    url.searchParams.set('access_token', ctx.accessToken);
    url.searchParams.set(
      'fields',
      ['date_start', 'account_currency', 'impressions', 'clicks', 'spend', 'actions', 'action_values'].join(
        ',',
      ),
    );

    const rows: DiscoveredBreakdownRow[] = [];
    let next: string | undefined = url.toString();
    let pages = 0;
    let calls = 0;
    const MAX_PAGES = 40;

    while (next && pages < MAX_PAGES) {
      const res = await platformFetch<GraphPage>('meta', next, {}, parseMetaRateLimit);
      calls++;
      if (res.rateLimit && ctx.onRateLimit) await ctx.onRateLimit(res.rateLimit);
      const body: GraphPage = res.data;

      for (const raw of body.data ?? []) {
        const date = text(raw.date_start);
        const deger = this.breakdownDegeri(raw, request.dimension);
        // DEĞERSİZ SATIR ATILIYOR ama sessizce değil: Meta bazen boş kova
        // döndürüyor ve o satırın toplamı zaten ana rakamda var.
        if (!date || !deger) continue;

        const buckets = bucketsFromActions(raw.actions);
        rows.push({
          dimension: request.dimension,
          value: deger.slice(0, 120),
          date,
          impressions: Number(raw.impressions ?? 0),
          clicks: Number(raw.clicks ?? 0),
          spendMicros: BigInt(Math.round(Number(raw.spend ?? 0) * 1_000_000)),
          conversions: buckets.form + buckets.message + buckets.purchase,
          // `pickActionValue` STRING döndürüyor (hassasiyet için); çarpmadan
          // önce sayıya çevriliyor.
          conversionValueMicros: BigInt(
            Math.round(
              Number(pickActionValue(raw.action_values, CONVERSION_BUCKETS.purchase.actionTypes)) *
                1_000_000,
            ),
          ),
          currency: text(raw.account_currency) ?? 'TRY',
        });
      }

      next = body.paging?.next;
      pages++;
    }

    if (next) {
      this.logger.warn(
        `Meta kırılım ${MAX_PAGES} sayfada bitmedi (${act}, ${request.dimension}) — KISMİ`,
      );
      return { rows, apiCalls: calls, complete: false, unsupported: false };
    }
    return { rows, apiCalls: calls, complete: true, unsupported: false };
  }

  /** Kırılım kovasının değerini ham satırdan okur. */
  private breakdownDegeri(
    raw: Record<string, unknown>,
    dimension: BreakdownRequest['dimension'],
  ): string | undefined {
    switch (dimension) {
      case 'age':
        return text(raw.age);
      case 'gender':
        return text(raw.gender);
      case 'placement': {
        /*
         * PLATFORM VE YERLEŞİM BİRLEŞTİRİLİYOR: "instagram · stories".
         * Yalnızca `publisher_platform` almak "Instagram" diyor ama feed ile
         * story'nin performansı çok farklı ve ajans tam o ayrımı istiyor.
         */
        const platform = text(raw.publisher_platform);
        const konum = text(raw.platform_position);
        if (!platform) return undefined;
        return konum ? `${platform} · ${konum}` : platform;
      }
      case 'hour': {
        // Meta "00:00:00 - 00:59:59" biçiminde döndürüyor; saat numarası
        // yeterli ve tabloda sıralanabilir olması için ondan alınıyor.
        const ham = text(raw.hourly_stats_aggregated_by_advertiser_time_zone);
        return ham?.slice(0, 2);
      }
      case 'city':
        return text(raw.region);
      default:
        return undefined;
    }
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

    // Kova bazında çözülüp toplanıyor — tek dönüşüm tanımı.
    const buckets = bucketsFromActions(raw.actions);
    const conversions = buckets.form + buckets.message + buckets.purchase;
    // Dönüşüm DEĞERİ yalnızca satış kovasından anlamlı: lead ve mesajın
    // parasal değeri yok ve `action_values` içinde de gelmiyor.
    const values = pickActionValue(raw.action_values, CONVERSION_BUCKETS.purchase.actionTypes);

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
      conversions,
      conversionValueMicros: decimalToMicros(values),
      // ThruPlay tercih ediliyor: "video görüntüleme" olarak anlamlı olan
      // 15 saniye/tamamlanma eşiği, 3 saniyelik oynatma değil.
      videoViews:
        sumAll(raw.video_thruplay_watched_actions) || sumAll(raw.video_play_actions),
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

  // ---------------------------------------------------------------------------
  // YAZMA — Modül 5 kural motoru
  // ---------------------------------------------------------------------------

  canWrite(grantedScopes: readonly string[]): { ok: boolean; missing: string[] } {
    const missing = WRITE_SCOPES.filter((s) => !grantedScopes.includes(s));
    return { ok: missing.length === 0, missing };
  }

  /**
   * Varlığı Graph API üzerinden günceller.
   *
   * TEK BİR POST. Meta'da kampanya, ad set ve reklam güncellemesi aynı şekil:
   * varlık kimliğine POST ve değişecek alanlar gövdede. Seviye başına ayrı
   * metot yazmak üç kopya aynı kod olurdu.
   *
   * DÖNÜŞ DEĞERİ PLATFORMDAN OKUNMUYOR. Meta güncelleme yanıtında yalnızca
   * `{"success": true}` dönüyor; yeni durumu doğrulamak için ayrı bir GET
   * gerekirdi ve bu her aksiyonda kotayı ikiye katlardı. Bunun yerine
   * gönderdiğimiz değeri `afterState` olarak kaydediyoruz — bir sonraki
   * yapı senkronizasyonu zaten gerçek durumu getirip üzerine yazacak.
   */
  async applyAction(
    ctx: FetchContext,
    action: PlatformActionRequest,
  ): Promise<PlatformActionResult> {
    const body = new URLSearchParams();
    let afterState: Record<string, unknown>;

    switch (action.type) {
      case 'pause':
        body.set('status', 'PAUSED');
        afterState = { status: 'paused' };
        break;

      case 'resume':
        // ACTIVE gönderiyoruz ama varlık ÜST SEVİYE duraklatılmışsa Meta bunu
        // kabul eder ve yine yayına çıkmaz — `effective_status` farklı kalır.
        // Bu bir hata değil, hiyerarşi kuralı; senkronizasyon gerçek durumu
        // getirdiğinde fark görünür olacak.
        body.set('status', 'ACTIVE');
        afterState = { status: 'active' };
        break;

      case 'set_budget': {
        const minor = toMinorUnits(action.amountMicros, action.currency);
        // Meta sıfır bütçeyi reddediyor; kırpma kural motorunda yapılıyor ama
        // buraya yine de sıfır gelirse platform hatası yerine açık bir mesaj
        // vermek teşhisi kolaylaştırıyor.
        if (minor <= 0n) {
          throw new PlatformApiError('meta', 'permanent', 'Bütçe sıfır ya da negatif olamaz');
        }
        const field = action.budgetMode === 'daily' ? 'daily_budget' : 'lifetime_budget';
        body.set(field, minor.toString());
        afterState = {
          budgetAmountMicros: action.amountMicros.toString(),
          budgetMode: action.budgetMode,
        };
        break;
      }
    }

    const res = await platformFetch<{ success?: boolean }>(
      'meta',
      `${this.graph}/${action.externalId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await ctx.onRateLimit?.(res.rateLimit);

    return { afterState };
  }


  // ---------------------------------------------------------------------------
  // MODÜL 7 — Auto-Boost
  // ---------------------------------------------------------------------------

  /**
   * Sayfanın / Instagram hesabının organik gönderileri.
   *
   * İKİ AYRI UÇ NOKTA, tek metot. Facebook Sayfası `/{page}/posts`, Instagram
   * `/{ig-user}/media` kullanıyor ve içgörü alan adları da farklı
   * (`post_impressions` vs `impressions`). Çağırana bu farkı taşıtmak, her
   * çağrı yerinde aynı `if`i tekrarlatmak olurdu.
   *
   * İÇGÖRÜLER GÖNDERİYLE BİRLİKTE, ayrı çağrıyla değil: 25 gönderi için 25 ek
   * istek atmak kotayı gereksiz yakıyor. Meta iç içe alan sözdizimiyle
   * (`insights.metric(...)`) tek çağrıda veriyor.
   */
  async fetchOrganicPosts(params: {
    pageAccessToken: string;
    profileExternalId: string;
    profileType: 'facebook_page' | 'instagram_business';
    since?: Date;
    onRateLimit?: (snapshot: RateLimitSnapshot) => void | Promise<void>;
  }): Promise<DiscoveredOrganicPost[]> {
    const ig = params.profileType === 'instagram_business';

    const url = new URL(
      `${this.graph}/${params.profileExternalId}/${ig ? 'media' : 'posts'}`,
    );
    url.searchParams.set(
      'fields',
      ig
        ? [
            'id',
            'media_type',
            /**
             * REKLAM KREATİFLERİNİ AYIRAN ALAN — istenmezse gelmiyor.
             *
             * `/{ig-user}/media` yalnızca organik gönderileri döndürmüyor:
             * `AD` türü medya da listeye giriyor. Bu alan olmadan sistemin
             * KENDİ ÜRETTİĞİ reklam kreatifi "yeni gönderi" sanılıyor ve
             * otomatik boost'ta GERİ BESLEME DÖNGÜSÜ oluşuyor — reklam yeni
             * reklam doğuruyor.
             *
             * Değerler: AD | FEED | STORY | REELS. Yalnızca Facebook Login
             * yolunda mevcut ve bu ürün onu kullanıyor.
             */
            'media_product_type',
            'caption',
            'permalink',
            'thumbnail_url',
            'media_url',
            'timestamp',
            'like_count',
            'comments_count',
            /**
             * `views`, `video_views`'ın YERİNE — CANLIDA ÖĞRENİLDİ.
             *
             * Meta isteği reddetti ve geçerli değerleri tek tek saydı:
             * "(#100) metric[3] must be one of the following values:
             * impressions, reach, replies, saved, likes, comments, shares,
             * total_interactions, follows, profile_visits, ..., views, ..."
             * Listede `video_views` YOK; Instagram medya içgörülerinde o ad
             * artık kabul edilmiyor.
             *
             * TEK BİR GEÇERSİZ METRİK BÜTÜN ÇAĞRIYI DÜŞÜRÜYOR — içgörüler iç
             * içe alan olarak isteniyor, yani gönderiler de gelmiyor. Bu
             * yüzden hata "video izlenmesi eksik" değil "hiç gönderi yok"
             * olarak görünüyordu.
             *
             * `views` daha geniş: yalnızca video değil tüm görüntülenmeler.
             * Meta iki metriği birleştirdi ve ayrı bir video sayacı bırakmadı.
             */
            'insights.metric(impressions,reach,saved,views)',
          ].join(',')
        : [
            'id',
            'message',
            'permalink_url',
            'full_picture',
            'created_time',
            'attachments{media_type}',
            'shares',
            'likes.summary(true).limit(0)',
            'comments.summary(true).limit(0)',
            'insights.metric(post_impressions,post_impressions_unique,post_video_views)',
          ].join(','),
    );
    url.searchParams.set('limit', '50');
    if (params.since) {
      url.searchParams.set('since', String(Math.floor(params.since.getTime() / 1000)));
    }

    const res = await platformFetch<GraphPage>(
      'meta',
      url.toString(),
      { headers: { Authorization: `Bearer ${params.pageAccessToken}` } },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await params.onRateLimit?.(res.rateLimit);

    const out: DiscoveredOrganicPost[] = [];
    for (const row of res.data.data ?? []) {
      const ham = row as Record<string, unknown>;
      /**
       * REKLAM KREATİFİ ORGANİK GÖNDERİ DEĞİL — burada eleniyor.
       *
       * İki şeyi birden bozuyordu: (1) elle boost ekranında reklam
       * kreatifleri "öne çıkarılabilir gönderi" olarak listeleniyordu,
       * (2) otomatik boost'ta kendi reklamımız "yeni gönderi" sanılıp yeni
       * bir reklam doğuruyordu — geri besleme döngüsü.
       *
       * ELEME BURADA, ÇAĞIRANDA DEĞİL: `fetchOrganicPosts` "organik gönderi"
       * vaat ediyor ve reklamı döndürmesi sözleşmenin ihlali. Çağırana
       * bırakmak, üç ayrı yerde hatırlanması gereken bir kural demekti.
       */
      if (ham.media_product_type === 'AD') continue;
      const post = mapOrganicPost(ham, ig);
      if (post) out.push(post);
    }
    return out;
  }

  /**
   * Coğrafi hedefleme araması.
   *
   * `location_types` AÇIKÇA VERİLİYOR. Verilmezse Meta bölge tipini de,
   * posta kodunu da, "designated market area"yı da karıştırıyor ve listede
   * kullanıcının tanımadığı satırlar çıkıyor. Üç tip yeterli: ülke, il, şehir.
   *
   * CANLIDA DOĞRULANMADI — ilk gerçek çağrıda alan adları ve `key` biçimi
   * gözle kontrol edilecek.
   */
  async searchGeoLocations(ctx: FetchContext, query: string): Promise<GeoLocationOption[]> {
    const url = new URL(`${this.graph}/search`);
    url.searchParams.set('type', 'adgeolocation');
    url.searchParams.set('location_types', JSON.stringify(['country', 'region', 'city']));
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '25');

    const res = await platformFetch<GraphPage>(
      'meta',
      url.toString(),
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await ctx.onRateLimit?.(res.rateLimit);

    return (res.data.data ?? [])
      .map((row) => mapGeoLocation(row as Record<string, unknown>))
      .filter((o): o is GeoLocationOption => o !== null);
  }

  /**
   * Reklam hesabında kurulu kayıtlı kitleler.
   *
   * HEDEFLEME NESNESİ ÇEKİLMİYOR, yalnızca kimlik ve ad. Kitlenin içeriği
   * bizi ilgilendirmiyor; hedeflemeye giden şey kimliği ve o kimliği Meta
   * kendi çözüyor. İçeriği çekmek, panelde gösterilmeyecek bir veriyi her
   * ekran açılışında taşımak olurdu.
   */
  async listSavedAudiences(ctx: FetchContext): Promise<SavedAudienceOption[]> {
    const act = actPath(ctx.accountExternalId ?? '');
    const url = new URL(`${this.graph}/${act}/saved_audiences`);
    /*
     * `approximate_count` BU DÜĞÜMDE YOK — ÜRETİMDE 502 ÜRETİYORDU.
     *
     * Meta o alanı Marketing API v17'de (2023) kaldırıp
     * `approximate_count_lower_bound` / `_upper_bound` çiftiyle değiştirdi;
     * v25'te çoktan yok. Graph'in cevabı `(#100) Tried accessing nonexisting
     * field (approximate_count)` ve panele 502 olarak yansıyordu.
     *
     * Belirtisi çok yanıltıcıydı: panel hatayı yutup "Ads Manager'da kayıtlı
     * kitle bulunamadı" yazıyordu, yani kullanıcı KENDİ Meta kurulumunu
     * eksik sanıyordu.
     */
    url.searchParams.set(
      'fields',
      'id,name,approximate_count_lower_bound,approximate_count_upper_bound',
    );
    url.searchParams.set('limit', '100');

    /*
     * SAYFALAMA İZLENİYOR — `limit=100` SESSİZ BİR KESMEYDİ.
     *
     * 100'den fazla kayıtlı kitlesi olan bir hesapta liste sessizce
     * kırpılıyordu ve panel yine de "N kitle" yazıyordu; aradığı kitleyi
     * bulamayan kullanıcı için hiçbir açıklama yoktu.
     *
     * ÜST SINIR VAR: 20 sayfa (~2.000 kitle). Sınırsız takip, bozuk bir
     * `paging.next` zincirinde işi sonsuza kadar döndürürdü.
     */
    const toplam: SavedAudienceOption[] = [];
    let sonraki: string | null = url.toString();
    for (let sayfa = 0; sayfa < 20 && sonraki !== null; sayfa++) {
      const istek: string = sonraki;
      const res = await platformFetch<GraphPage>(
        'meta',
        istek,
        { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
        parseMetaRateLimit,
      );
      if (res.rateLimit) await ctx.onRateLimit?.(res.rateLimit);

      for (const row of res.data.data ?? []) {
        const o = mapSavedAudience(row as Record<string, unknown>);
        if (o !== null) toplam.push(o);
      }
      sonraki = res.data.paging?.next ?? null;
    }
    return toplam;
  }

  /**
   * Kayıtlı kitlenin hedefleme nesnesi.
   *
   * CANLIDA DOĞRULANMADI. `targeting` alanının kitle nesnesinde döndüğü
   * belgeden okundu; ilk gerçek çağrıda gövde gözle kontrol edilecek. Alan
   * boş dönerse `null` veriliyor ve çağıran yayını DURDURUYOR — boş bir
   * hedeflemeyle devam etmek, kullanıcının seçtiği kitle yerine herkese
   * reklam vermek demek olurdu.
   */
  async getSavedAudienceTargeting(
    ctx: FetchContext,
    savedAudienceId: string,
  ): Promise<Record<string, unknown> | null> {
    const url = new URL(`${this.graph}/${savedAudienceId}`);
    url.searchParams.set('fields', 'id,targeting');

    const res = await platformFetch<{ targeting?: unknown }>(
      'meta',
      url.toString(),
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await ctx.onRateLimit?.(res.rateLimit);

    const t = res.data.targeting;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    const spec = t as Record<string, unknown>;
    return Object.keys(spec).length > 0 ? spec : null;
  }

  /**
   * Gönderiyi boost eder: kampanya + ad set + reklam.
   *
   * ÜÇ ÇAĞRI VE HEPSİ BAŞARILI OLMALI. Ortada kalırsa (ad set açıldı, reklam
   * açılamadı) bütçesi olan ama reklamı olmayan bir ad set kalıyor — para
   * harcamıyor ama Ads Manager'ı kirletiyor. Bu yüzden hata durumunda
   * oluşturulan varlıklar GERİ ALINIYOR.
   *
   * Kampanya PAUSED açılıyor, ad set ve reklam ACTIVE. Sonra kampanya
   * ACTIVE'e alınıyor: üçü de ACTIVE açılsaydı, ad set hazır olmadan kampanya
   * yayına girer ve Meta bunu "eksik yapılandırma" diye reddedebilirdi.
   */
  async createBoost(ctx: FetchContext, request: BoostRequest): Promise<BoostResult> {
    const act = actPath(request.adAccountExternalId);
    const created: Array<{ id: string; label: string }> = [];

    /**
     * HANGİ ADIMDA DÜŞTÜĞÜ KAYDEDİLİYOR.
     *
     * Beş ayrı Meta çağrısı var ve hatanın metni hangisinden geldiğini
     * söylemiyor. `destination_type` hatası tam bu yüzden ilk turda ad set'e
     * değil kreatife bağlandı: mesaj "reklam kreatifi kısmında bir eylem
     * çağrısı seçin" diyordu, oysa eksik olan ad set alanıydı. Meta'nın
     * tarifi kendi arayüzüne göre yazılmış ve API'de yanıltıyor.
     */
    const hedefKampanya = request.campaign ?? { mode: 'new' };
    let adim =
      hedefKampanya.mode === 'new'
        ? 'Kampanya oluşturulurken'
        : 'Seçilen kampanya denetlenirken';

    try {
      /**
       * VAR OLAN KAMPANYA `created` LİSTESİNE GİRMİYOR (K21).
       *
       * Geri alma listesi "biz ne oluşturduysak onu sil" demek. Paylaşılan bir
       * kampanya buraya girerse, BAŞARISIZ bir ikinci boost BİRİNCİ boost'un
       * yayındaki reklamını silerdi — bu özelliğin tek geri dönülemez hatası.
       * Ayrım tek yerde ve burada: aşağıdaki bütün blok `campaignId`'yi
       * yalnızca OKUYOR, kimin oluşturduğunu bilmiyor ve bilmesi de gerekmiyor.
       */
      const campaignId =
        hedefKampanya.mode === 'existing'
          ? await this.assertReusableCampaign(
              ctx,
              request,
              hedefKampanya.externalCampaignId,
            )
          : await this.createBoostCampaign(ctx, act, request, created);

      adim = 'Ad set (bütçe ve hedefleme) oluşturulurken';
      const adSet = await this.graphPost<{ id: string }>(
        ctx,
        `${act}/adsets`,
        buildBoostAdSetParams(request, campaignId, new Date()),
      );
      created.push({ id: adSet.id, label: 'ad set' });

      /**
       * KREATİF İKİ AYRI YOL — ve fark alan adlarında değil, ÇAĞRI SAYISINDA.
       *
       * FACEBOOK: `object_story_id` reklamın içine gömülüyor, ayrı bir
       * kreatif çağrısı YOK. Mevcut gönderiyi olduğu gibi reklama çeviriyor ve
       * organik etkileşimi (beğeni, yorum) koruyor.
       *
       * INSTAGRAM: `object_story_id` GEÇERSİZ — o biçim Facebook sayfa
       * gönderisine ait. Instagram için AYRI bir `adcreatives` çağrısı
       * gerekiyor ve orada üç KÖK alan var: `object_id` (Facebook sayfası),
       * `instagram_user_id`, `source_instagram_media_id`. `object_story_spec`
       * HİÇ gönderilmiyor: o, sıfırdan yayınlanmamış gönderi yaratma yolu ve
       * `source_instagram_media_id` onun alan listesinde yok.
       */
      let creativeRef: string;
      if (request.source.surface === 'instagram') {
        adim = 'Instagram kreatifi oluşturulurken';
        const creative = await this.graphPost<{ id: string }>(
          ctx,
          `${act}/adcreatives`,
          instagramCreativeBody(request.source, request.name),
        );
        created.push({ id: creative.id, label: 'kreatif' });

        /**
         * KREATİF OLUŞTU DİYE DOĞRU GÖNDERİYE BAĞLANDIĞI ANLAMINA GELMİYOR.
         *
         * K17'nin bütün çekincesi buydu: Meta bir alanı kabul edip sessizce
         * yok sayabiliyor ve o zaman boost oluşuyor, para harcıyor, YANLIŞ
         * gönderiyi gösteriyor. `effective_instagram_media_id` reklamda
         * fiilen kullanılan medyayı söylüyor — salt okunur ve tam bu iş için
         * var. Eşleşmiyorsa reklam hiç açılmıyor.
         *
         * "200 döndü" bu projede doğrulama sayılmıyor; doğrulama budur.
         */
        adim = 'Instagram kreatifi doğrulanırken';
        await this.assertInstagramCreative(ctx, creative.id, request.source);
        creativeRef = JSON.stringify({ creative_id: creative.id });
      } else {
        creativeRef = JSON.stringify({
          object_story_id: `${request.source.pageExternalId}_${stripPagePrefix(request.source.postExternalId, request.source.pageExternalId)}`,
        });
      }

      adim = 'Reklam oluşturulurken';
      const ad = await this.graphPost<{ id: string }>(ctx, `${act}/ads`, {
        name: boostNameWithLabel(request.name, 'ad'),
        adset_id: adSet.id,
        creative: creativeRef,
        status: 'ACTIVE',
      });
      created.push({ id: ad.id, label: 'reklam' });

      /**
       * VAR OLAN KAMPANYANIN DURUMUNA DOKUNULMUYOR (K21).
       *
       * Yeni kampanya PAUSED açılıp burada yayına alınıyor — sırası bilinçli,
       * ad set hazır olmadan yayına giren kampanya "eksik yapılandırma" diye
       * reddedilebiliyor. Var olan kampanya ise ZATEN yayında: durumu
       * `assertReusableCampaign` doğruladı. Yine de ACTIVE göndermek çoğu
       * zaman etkisiz bir çağrı olurdu ama şu riski taşıyor: kullanıcı
       * kampanyayı Ads Manager'da bilerek duraklattıysa ve doğrulama ile bu
       * çağrı arasında duraklattıysa, biz onun kararını sessizce geri alırdık.
       * Paylaşılan bir nesneyi ancak sahibi yayına alır.
       */
      if (hedefKampanya.mode === 'new') {
        adim = 'Kampanya yayına alınırken';
        await this.graphPost(ctx, campaignId, { status: 'ACTIVE' });
      }

      return {
        externalCampaignId: campaignId,
        externalAdSetId: adSet.id,
        externalAdId: ad.id,
      };
    } catch (err) {
      // GERİ ALMA — ters sırada sil.
      //
      // En iyi çaba: silme de başarısız olabilir ve o zaman yapılacak bir şey
      // yok. Ama denememek, her başarısız boost denemesinde Ads Manager'da
      // yetim bir kampanya bırakmak demek.
      for (const entity of created.reverse()) {
        try {
          await platformFetch('meta', `${this.graph}/${entity.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${ctx.accessToken}` },
          });
        } catch {
          this.logger.warn(
            `Boost geri alınamadı: ${entity.label} ${entity.id} platformda kaldı`,
          );
        }
      }
      throw labelBoostError(adim, err);
    }
  }

  /**
   * YouTube video reklamı Meta'da YOK.
   *
   * `getCampaignSummaries` boş kayıt dönerken burada HATA fırlatmak tutarsız
   * görünebilir ama değil: orası bir liste zenginleştirme adımı, burada ise
   * kullanıcı bir şey YAYINLAMAYA çalışıyor ve sessizce yutmak, oluşturulduğu
   * sanılan bir kampanya bırakırdı.
   */
  async createVideoBoost(): Promise<never> {
    throw new PlatformApiError(
      'meta',
      'permanent',
      'YouTube video reklamı Meta’da yok — bu bir Google Ads özelliği.',
    );
  }

  /**
   * Kampanyaların PLATFORMDAKİ güncel adı ve durumu — TEK ÇAĞRIDA (K21).
   *
   * Meta'nın kök `?ids=` biçimi kullanılıyor: kampanya başına bir istek
   * atmak, seçim ekranını her açılışta kampanya sayısı kadar yavaşlatır ve
   * kotayı boşa harcar.
   *
   * PARÇALARA BÖLÜNÜYOR. Meta `ids` listesine sınır koyuyor ve sınırı aşan
   * istek TAMAMEN reddediliyor — yani tek bir uzun liste, bütün kampanyaların
   * durumunu "okunamadı" yapar. 50'lik partiler güvenli tarafta.
   *
   * BİR PARTİ DÜŞERSE DİĞERLERİ DEVAM EDİYOR ve düşen partinin kimlikleri
   * kayıttan EKSİK kalıyor. Çağıran eksikliği "durumu bilinmiyor" olarak
   * gösteriyor; burada boş dizge ya da 'PAUSED' gibi bir değer uydurmak,
   * okunamayan durumu okunmuş göstermek olurdu.
   */
  async getCampaignSummaries(
    ctx: FetchContext,
    campaignExternalIds: string[],
  ): Promise<Record<string, CampaignSummary>> {
    const sonuc: Record<string, CampaignSummary> = {};
    if (campaignExternalIds.length === 0) return sonuc;

    for (let i = 0; i < campaignExternalIds.length; i += 50) {
      const parti = campaignExternalIds.slice(i, i + 50);
      const url = new URL(this.graph);
      url.searchParams.set('ids', parti.join(','));
      // AD DA İSTENİYOR: kampanyanın Ads Manager'daki gerçek adı bizde saklı
      // değil ve kendi ürettiğimiz bir etiket seçim yapmaya yetmiyor.
      url.searchParams.set('fields', 'id,name,effective_status');

      try {
        const res = await platformFetch<
          Record<string, { id?: string; name?: string; effective_status?: string }>
        >(
          'meta',
          url.toString(),
          { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
          parseMetaRateLimit,
        );
        for (const [id, kampanya] of Object.entries(res.data ?? {})) {
          /*
           * SATIR YALNIZCA DURUM VARSA YAZILIYOR. Ad dönüp durum dönmezse
           * kampanya "okunabildi" görünür ve seçilebilirlik kararı eksik bilgiye
           * dayanırdı; kaydın yokluğu "okunamadı" demek ve bu ayrım korunmalı.
           */
          if (kampanya?.effective_status) {
            sonuc[id] = {
              name: kampanya.name,
              status: kampanya.effective_status,
            };
          }
        }
      } catch (err) {
        // SESSİZ DEĞİL ama ÖLDÜRÜCÜ DE DEĞİL: durumu okunamayan kampanya
        // seçilemez olarak gösteriliyor ve kullanıcı sebebini ekranda görüyor.
        this.logger.warn(
          `Kampanya özetleri okunamadı (${parti.length} kampanya): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return sonuc;
  }

  /**
   * Boost için YENİ kampanya açar ve geri alma listesine ekler.
   *
   * `created`'a eklemek bu metodun İŞİNİN PARÇASI, çağıranın hatırlaması
   * gereken bir adım değil: oluşturup listeye eklemeyi ayırmak, bir gün
   * birinin ikincisini atlaması ve başarısız boost'un Ads Manager'da yetim
   * kampanya bırakması demekti.
   */
  private async createBoostCampaign(
    ctx: FetchContext,
    act: string,
    request: BoostRequest,
    created: Array<{ id: string; label: string }>,
  ): Promise<string> {
    const campaign = await this.graphPost<{ id: string }>(ctx, `${act}/campaigns`, {
      // TABAN AD + SEVİYE EKİ (K22). `request.name` seviye eki TAŞIMIYOR;
      // taşısaydı ad `… - Boost - Kampanya - Reklam Seti` gibi çift seviyeli
      // çıkardı. Ek tek yerden geliyor: `boostNameWithLabel`.
      name: boostNameWithLabel(request.name, 'campaign'),
      objective: request.objective,
      status: 'PAUSED',
      /**
       * ÖZEL REKLAM KATEGORİLERİ — SABİT '[]' DEĞİL.
       *
       * Konut, istihdam ve kredi reklamları düzenlemeye tabi ve kategori
       * beyan edilmeden yayınlanan reklam politika ihlali. Cezası kampanya
       * seviyesinde değil HESAP seviyesinde: bir müşteri için unutulan
       * beyan, ajansın o hesaptaki bütün kampanyalarını riske atıyor.
       *
       * Boş dizi hâlâ geçerli ve çoğu müşteride doğru cevap — ama artık
       * SABİT değil, müşterinin beyanından geliyor.
       */
      special_ad_categories: JSON.stringify(request.specialAdCategories ?? []),
      is_adset_budget_sharing_enabled: ADSET_BUDGET_SHARING,
    });
    created.push({ id: campaign.id, label: 'kampanya' });
    return campaign.id;
  }

  /**
   * VAR OLAN kampanyanın altına gönderi eklenebilir mi? (K21)
   *
   * HİÇBİR ŞEY OLUŞTURULMADAN ÖNCE çalışıyor. Sıra önemli: ad set açıldıktan
   * sonra reddetmek, geri alınacak bir varlık bırakmak ve geri almanın da
   * başarısız olabileceği bir pencere açmak olurdu. Uygunsuz kampanya
   * seçildiğinde Meta'da hiçbir iz kalmıyor.
   *
   * Kararın kendisi `decideCampaignReuse` içinde ve saf — dört kontrolün her
   * biri sessizce atlanabilir türden ve teste bağlanmadan güvenilmez.
   */
  private async assertReusableCampaign(
    ctx: FetchContext,
    request: BoostRequest,
    campaignId: string,
  ): Promise<string> {
    const url = new URL(`${this.graph}/${campaignId}`);
    url.searchParams.set(
      'fields',
      'id,objective,status,effective_status,special_ad_categories,account_id',
    );

    const res = await platformFetch<{
      id: string;
      objective?: string;
      status?: string;
      effective_status?: string;
      special_ad_categories?: string[];
      account_id?: string;
    }>(
      'meta',
      url.toString(),
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
      parseMetaRateLimit,
    );

    const karar = decideCampaignReuse({
      objectiveWanted: request.objective,
      categoriesWanted: request.specialAdCategories ?? [],
      adAccountWanted: request.adAccountExternalId,
      campaign: res.data,
    });

    if (!karar.ok) {
      throw new PlatformApiError('meta', 'permanent', karar.message);
    }
    return campaignId;
  }

  /**
   * Oluşan Instagram kreatifinin GERÇEKTEN istenen gönderiye bağlandığını
   * doğrular.
   *
   * `effective_instagram_media_id` salt okunur ve reklamda FİİLEN kullanılan
   * medyayı söylüyor. Gönderdiğimiz `source_instagram_media_id` ile
   * eşleşmiyorsa Meta alanı kabul edip başka bir şey kullanmış demektir —
   * boost oluşur, para harcar, yanlış gönderiyi gösterir ve hiçbir yerde
   * görünmez.
   *
   * ALAN HİÇ DÖNMEZSE HATA VERİLMİYOR. `fields` ile açıkça istenmediğinde
   * dönmüyor ve bazı hesaplarda gecikmeli doluyor; yokluğunu "yanlış" saymak,
   * çalışan bir yolu sebepsiz kapatmak olurdu. Log'a yazılıyor ve devam
   * ediliyor — kısıt burada bilinçli olarak "eşleşmiyorsa dur", "eşleşme
   * bilgisi yoksa dur" değil.
   */
  private async assertInstagramCreative(
    ctx: FetchContext,
    creativeId: string,
    source: Extract<BoostSource, { surface: 'instagram' }>,
  ): Promise<void> {
    const url = new URL(`${this.graph}/${creativeId}`);
    url.searchParams.set(
      'fields',
      'object_id,instagram_user_id,source_instagram_media_id,effective_instagram_media_id',
    );

    const res = await platformFetch<{
      effective_instagram_media_id?: string;
      source_instagram_media_id?: string;
    }>(
      'meta',
      url.toString(),
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
      parseMetaRateLimit,
    );

    const karar = decideInstagramCreativeCheck({
      sent: source.mediaExternalId,
      echo: res.data.source_instagram_media_id,
      effective: res.data.effective_instagram_media_id,
    });

    if (karar.verdict === 'reject') {
      throw new PlatformApiError('meta', 'permanent', karar.message);
    }
    if (karar.verdict === 'warn') {
      this.logger.warn(`Instagram kreatifi ${creativeId}: ${karar.message}`);
    }
  }

  /**
   * Tek bir reklam oluşturur: creative + ad.
   *
   * İKİ ÇAĞRI. Meta'da reklam bir creative'e işaret ediyor ve creative ayrı
   * bir varlık. Gömülü creative göndermek de mümkün ama o zaman yeniden
   * kullanılamıyor ve Ads Manager'da isimsiz görünüyor.
   *
   * CREATIVE BAŞARILI OLUP AD BAŞARISIZ OLURSA creative siliniyor. Yetim
   * creative zarar vermiyor ama her başarısız satır bir tane bırakırsa hesap
   * birkaç partide çöplüğe dönüyor.
   */
  async createAd(ctx: FetchContext, request: CreateAdRequest): Promise<CreateAdResult> {
    const act = actPath(request.adAccountExternalId);
    const fallbackLink = `https://facebook.com/${request.pageExternalId}`;
    const link = request.linkUrl ?? fallbackLink;

    const linkData: Record<string, unknown> = {
      // GÖRSEL HASH'İ Mİ VİDEO MU: Meta ikisini farklı alanlarda istiyor ve
      // yanlış alan "Invalid parameter" ile dönüyor — hangi alanın sorunlu
      // olduğunu söylemeden. Hash 32 haneli onaltılık, video kimliği sayısal.
      ...(/^[0-9a-f]{32}$/i.test(request.mediaRef)
        ? { image_hash: request.mediaRef }
        : { video_id: request.mediaRef }),
      link,
      message: request.primaryText ?? '',
    };
    if (request.headline) linkData.name = request.headline;
    if (request.description) linkData.description = request.description;
    if (request.callToAction) {
      linkData.call_to_action = {
        type: request.callToAction.toUpperCase(),
        value: { link },
      };
    }

    const creative = await this.graphPost<{ id: string }>(ctx, `${act}/adcreatives`, {
      name: `${request.name} — creative`,
      object_story_spec: JSON.stringify({
        page_id: request.pageExternalId,
        link_data: linkData,
      }),
    });

    try {
      const ad = await this.graphPost<{ id: string }>(ctx, `${act}/ads`, {
        name: request.name,
        adset_id: request.adSetExternalId,
        creative: JSON.stringify({ creative_id: creative.id }),
        // PAUSED AÇILIYOR ve bu bilinçli.
        //
        // 60 reklamlık bir parti ACTIVE açılırsa hepsi anında harcamaya
        // başlıyor ve yanlış bir satır fark edilmeden para yakıyor. Ajans
        // partiyi gözden geçirip topluca açıyor.
        status: 'PAUSED',
      });
      return { externalAdId: ad.id, externalCreativeId: creative.id };
    } catch (err) {
      try {
        await platformFetch('meta', `${this.graph}/${creative.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        });
      } catch {
        this.logger.warn(`Yetim creative kaldı: ${creative.id}`);
      }
      throw err;
    }
  }

  /** Graph API'ye form-encoded POST — boost akışının üç adımı da bunu kullanıyor. */
  private async graphPost<T>(
    ctx: FetchContext,
    path: string,
    fields: Record<string, string>,
  ): Promise<T> {
    const body = new URLSearchParams(fields);
    const res = await platformFetch<T>(
      'meta',
      `${this.graph}/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await ctx.onRateLimit?.(res.rateLimit);
    return res.data;
  }


  // ---------------------------------------------------------------------------
  // MODÜL 4 — Reklam Oluşturucu
  // ---------------------------------------------------------------------------

  /**
   * Görseli reklam hesabına yükler.
   *
   * MULTIPART DEĞİL, form-encoded base64. Meta ikisini de kabul ediyor ama
   * multipart Node'da elle sınır (boundary) üretmeyi gerektiriyor ve tek bir
   * yanlış bayt "geçersiz istek" ile dönüyor — mesaj hangi baytın yanlış
   * olduğunu söylemiyor. Base64 %33 daha büyük gidiyor; 30 MB sınırında bu
   * kabul edilebilir bir maliyet.
   *
   * YANIT ŞEKLİ TUZAKLI: Meta hash'i `images.<gönderdiğin ad>.hash` altında
   * dönüyor, sabit bir anahtarda değil. Şekle göre okumak, adı değiştirdiğin
   * gün sessizce undefined döndürür.
   */
  async uploadAdImage(
    ctx: FetchContext,
    params: { name: string; bytes: Buffer },
  ): Promise<string> {
    const body = new URLSearchParams({ bytes: params.bytes.toString('base64') });

    const res = await platformFetch<{ images?: Record<string, { hash?: string }> }>(
      'meta',
      `${this.graph}/${actPath(ctx.accountExternalId)}/adimages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        // Görsel yüklemesi normal çağrılardan yavaş; varsayılan 30 sn
        // 20 MB'lık bir dosyada yetmiyor.
        timeoutMs: 120_000,
      },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await ctx.onRateLimit?.(res.rateLimit);

    const images = res.data.images ?? {};
    // Anahtar adı Meta tarafından belirleniyor; ilk (ve tek) girdiyi alıyoruz.
    const hash = Object.values(images)[0]?.hash;
    if (!hash) {
      throw new PlatformApiError(
        'meta',
        'permanent',
        'Görsel yüklendi ama Meta hash döndürmedi — yanıt beklenmedik şekilde geldi.',
      );
    }
    return hash;
  }

  /**
   * Taslaktan tam reklam: kampanya + ad set + kreatif + reklam.
   *
   * SIRA VE DURUMLAR ÖNEMLİ. Kampanya PAUSED açılıyor, en sonda ACTIVE'e
   * alınıyor: üçü de ACTIVE açılsaydı ad set hazır olmadan kampanya yayına
   * girer ve Meta bunu eksik yapılandırma diye reddedebilirdi.
   *
   * Anlık form tipinde ÖNCE FORM oluşturuluyor: kreatif forma referans
   * veriyor ve form yoksa kreatif reddediliyor.
   */
  async publishDraft(
    ctx: FetchContext,
    req: PublishDraftRequest,
  ): Promise<PublishDraftResult> {
    const act = actPath(req.adAccountExternalId);
    const created: Array<{ id: string; label: string }> = [];

    try {
      /**
       * KÜTÜPHANEDEN FORM GELDİYSE YENİSİ OLUŞTURULMUYOR.
       *
       * Gelişmiş modda kullanıcı formu kütüphaneden seçiyor ve o form zaten
       * Meta'da yayında. Burada bir tane daha oluşturmak, aynı formun iki
       * kopyasını bırakmak ve gelen bilgilerin hangi forma ait olduğunu
       * karıştırmak demek olurdu.
       */
      let leadFormId: string | undefined = req.leadFormExternalId;
      if (!leadFormId && req.spec.destinationType === 'ON_AD') {
        leadFormId = await this.createEmbeddedLeadForm(ctx, req);
        // Form SAYFAYA ait, reklam hesabına değil; geri alma listesine
        // eklenmiyor çünkü silinmesi sayfa token'ı gerektiriyor ve boş bir
        // form zararsız.
      }

      const campaign = await this.graphPost<{ id: string }>(ctx, `${act}/campaigns`, {
        name: req.name,
        objective: req.spec.objective,
        status: 'PAUSED',
        // Kategoriler müşterinin beyanından geliyor (bkz. createBoost).
        special_ad_categories: JSON.stringify(req.specialAdCategories ?? []),
        is_adset_budget_sharing_enabled: ADSET_BUDGET_SHARING,
      });
      created.push({ id: campaign.id, label: 'kampanya' });

      const adSetFields: Record<string, string> = {
        name: `${req.name} — ad set`,
        campaign_id: campaign.id,
        billing_event: req.spec.billingEvent,
        optimization_goal: req.spec.optimizationGoal,
        targeting: JSON.stringify({ ...req.targeting, ...req.placements }),
        status: 'ACTIVE',
      };

      /**
       * GÜNLÜK VE TOPLAM BÜTÇE BİRLİKTE GÖNDERİLEMİYOR.
       *
       * Meta ikisini birden alırsa isteği reddediyor. Alan adı da farklı:
       * `daily_budget` / `lifetime_budget`. Toplam bütçede `end_time` zorunlu
       * ve doğrulama bunu zaten engelliyor.
       */
      const budgetMinor = toMinorUnits(req.dailyBudgetMicros, req.currency).toString();
      if (req.budgetMode === 'lifetime') {
        adSetFields.lifetime_budget = budgetMinor;
      } else {
        adSetFields.daily_budget = budgetMinor;
      }

      /**
       * TEKLİF STRATEJİSİ HER ZAMAN AÇIKÇA GÖNDERİLİYOR.
       *
       * Eskiden yalnızca tavanlı stratejilerde yazılıyordu; varsayılan durumda
       * alan hiç gitmiyordu ve karar Meta'ya bırakılıyordu. Meta da hesabın
       * varsayılanına düşüyor — o varsayılan tavanlı bir strateji ise istek
       * şu hatayla reddediliyor: "Teklif Stratejisi İçin Teklif Tutarı veya
       * Teklif Sınırı Gerekiyor" (subcode 2490487).
       *
       * Bu ürünün ilkesi zaten "Meta'nın sorduğu her soruya biz cevap
       * veriyoruz". Cevabı söylememek, cevabı bilmemekle aynı kapıya çıkıyor:
       * kampanyanın nasıl teklif verdiği hesap ayarına göre değişiyor ve iki
       * müşteride aynı taslak farklı davranıyor.
       */
      adSetFields.bid_strategy = req.bidStrategy ?? 'LOWEST_COST_WITHOUT_CAP';
      if (
        adSetFields.bid_strategy !== 'LOWEST_COST_WITHOUT_CAP' &&
        req.bidAmountMinor !== undefined
      ) {
        // Tavanlı stratejide tutar zorunlu; doğrulama bunu engelliyor ama
        // alan yine de koşullu — sağlayıcı çağıranın doğruluğuna güvenmiyor.
        adSetFields.bid_amount = req.bidAmountMinor.toString();
      }

      if (req.startTime) adSetFields.start_time = req.startTime.toISOString();
      if (req.spec.destinationType) adSetFields.destination_type = req.spec.destinationType;
      /**
       * FORM KİMLİĞİ `promoted_object` İÇİNE GİRMİYOR.
       *
       * Meta reddediyor: `(#100) Invalid keys "leadgen_form_id" were found in
       * param "promoted_object"`. Ad set yalnızca hangi SAYFA adına
       * yayınlandığını biliyor; form KREATİFE bağlı ve
       * `call_to_action.value.lead_gen_form_id` ile veriliyor.
       *
       * Ayrım mantıklı: aynı ad set altında farklı formlara giden birden çok
       * kreatif olabiliyor.
       */
      if (req.spec.promotedObject) {
        adSetFields.promoted_object = JSON.stringify(req.spec.promotedObject);
      }
      if (req.endTime) adSetFields.end_time = req.endTime.toISOString();

      const adSet = await this.graphPost<{ id: string }>(ctx, `${act}/adsets`, adSetFields);
      created.push({ id: adSet.id, label: 'ad set' });

      const creative = await this.graphPost<{ id: string }>(ctx, `${act}/adcreatives`, {
        name: `${req.name} — kreatif`,
        object_story_spec: JSON.stringify({ page_id: req.pageExternalId }),
        ...buildCreativeSpec(req, leadFormId),
      });
      created.push({ id: creative.id, label: 'kreatif' });

      const ad = await this.graphPost<{ id: string }>(ctx, `${act}/ads`, {
        name: req.name,
        adset_id: adSet.id,
        creative: JSON.stringify({ creative_id: creative.id }),
        status: 'ACTIVE',
      });
      created.push({ id: ad.id, label: 'reklam' });

      await this.graphPost(ctx, campaign.id, { status: 'ACTIVE' });

      return {
        campaignId: campaign.id,
        adSetId: adSet.id,
        creativeId: creative.id,
        adId: ad.id,
        leadFormId,
      };
    } catch (err) {
      // GERİ ALMA — ters sırada. En iyi çaba: silme de başarısız olabilir ve
      // o zaman yapılacak bir şey yok. Ama denememek, her başarısız yayında
      // Ads Manager'da yarım bir kampanya bırakmak demek.
      for (const entity of created.reverse()) {
        try {
          await platformFetch('meta', `${this.graph}/${entity.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${ctx.accessToken}` },
          });
        } catch {
          this.logger.warn(`Geri alınamadı: ${entity.label} ${entity.id} platformda kaldı`);
        }
      }
      throw err;
    }
  }

  /**
   * Anlık form oluşturur.
   *
   * ALANLAR SABİT: ad, e-posta, telefon. Form alanlarını kullanıcıya
   * seçtirmek ayrı bir ekran demek ve bu üründe hedef kitle formu
   * tasarlamak istemiyor — iletişim bilgisi topluyor.
   *
   * Form SAYFAYA ait olduğu için sayfa üzerinden oluşturuluyor.
   */
  private async createEmbeddedLeadForm(
    ctx: FetchContext,
    req: PublishDraftRequest,
  ): Promise<string> {
    const form = await this.graphPost<{ id: string }>(
      ctx,
      `${req.pageExternalId}/leadgen_forms`,
      {
        name: `${req.name} — form`,
        // Gizlilik politikası ZORUNLU ve Meta bunu doğruluyor. Müşterinin
        // sitesi yoksa kendi gizlilik sayfamız kullanılıyor.
        privacy_policy: JSON.stringify({
          url: req.linkUrl ?? 'https://advetics.com/gizlilik',
          link_text: 'Gizlilik Politikası',
        }),
        questions: JSON.stringify([
          { type: 'FULL_NAME' },
          { type: 'EMAIL' },
          { type: 'PHONE' },
        ]),
        follow_up_action_url: req.linkUrl ?? 'https://advetics.com',
      },
    );
    return form.id;
  }


  // ---------------------------------------------------------------------------
  // FORMLAR KÜTÜPHANESİ
  // ---------------------------------------------------------------------------

  /**
   * Kütüphanedeki formu Meta'da oluşturur.
   *
   * `publishDraft` içindeki gömülü form oluşturmadan AYRI TUTULDU. Orada form
   * reklamın bir parçası, alanları sabit ve ömrü o reklama bağlı; burada form
   * başlı başına bir varlık, birden çok reklamda kullanılabiliyor ve içeriğini
   * kullanıcı belirliyor. İkisini tek metotta birleştirmek, basit akıştaki
   * "hiçbir karar verme" sözünü bozardı.
   *
   * GERİ ALINAMAZ. Meta oluşan formu güncellemiyor; içerik değişikliği yeni
   * form demek. Çağıran bunu kullanıcıya söylemeden yayınlamamalı.
   */
  async createLeadForm(ctx: FetchContext, req: CreateLeadFormRequest): Promise<string> {
    const fields: Record<string, string> = {
      name: req.name,
      // Gizlilik politikası ZORUNLU — Meta formu onsuz kabul etmiyor.
      privacy_policy: JSON.stringify({
        url: req.privacyPolicyUrl,
        link_text: req.privacyPolicyLinkText,
      }),
      questions: JSON.stringify(
        req.questions.map((q) =>
          q.type === 'CUSTOM'
            ? {
                type: 'CUSTOM',
                label: (q as { label: string }).label,
                ...((q as { options?: string[] }).options?.length
                  ? {
                      options: (q as { options: string[] }).options.map((o) => ({
                        value: o,
                        key: o,
                      })),
                    }
                  : {}),
              }
            : { type: q.type },
        ),
      ),
    };

    /**
     * `higher_intent` AYRI BİR ALAN DEĞİL.
     *
     * Meta'nın arayüzündeki "daha nitelikli" seçeneği API'de
     * `is_optimized_for_quality` bayrağına karşılık geliyor; form tipi diye
     * bir alan yok. Kendi enum'umuzu tutup burada çeviriyoruz.
     */
    if (req.formType === 'higher_intent') {
      fields.is_optimized_for_quality = 'true';
    }

    if (req.headline || req.intro) {
      fields.context_card = JSON.stringify({
        title: req.headline ?? req.name,
        content: req.intro ? [req.intro] : [],
        style: req.formType === 'rich_form' ? 'PARAGRAPH_STYLE' : 'LIST_STYLE',
        button_text: 'Devam',
      });
    }

    /**
     * KVKK onay kutuları `custom_disclaimer` altında gidiyor.
     *
     * `checkbox: true` olan her satır kullanıcıya ayrı bir onay kutusu
     * gösteriyor; `is_required` işaretlenmişse form o kutu olmadan
     * gönderilemiyor. Türkiye'de açık rıza bunu gerektiriyor — gizlilik
     * politikası linki tek başına yeterli sayılmıyor.
     */
    if (req.consentBoxes.length > 0) {
      fields.legal_content = JSON.stringify({
        custom_disclaimer: {
          title: 'Onaylar',
          body: {
            text: '',
            url_entities: [],
          },
          checkboxes: req.consentBoxes.map((c, i) => ({
            key: `onay_${i + 1}`,
            text: c.text,
            is_required: c.required,
          })),
        },
      });
    }

    fields.thank_you_page = JSON.stringify({
      title: req.thankYouHeadline,
      body: req.thankYouBody,
      button_type: req.thankYouCtaUrl ? 'VIEW_WEBSITE' : 'NONE',
      ...(req.thankYouCtaUrl
        ? { website_url: req.thankYouCtaUrl, button_text: req.thankYouCtaText }
        : {}),
    });

    // Form SAYFA TOKEN'IYLA oluşturuluyor.
    //
    // `leadgen_forms` sayfanın altında yaşıyor. Kullanıcı token'ıyla çağrı,
    // izinler doğru olsa bile "(#200) izin gerekiyor" ile dönüyor ve mesaj
    // hangi token'ın eksik olduğunu söylemiyor — saatler yiyen bir hata.
    const res = await platformFetch<{ id: string }>(
      'meta',
      `${this.graph}/${req.pageExternalId}/leadgen_forms`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${req.pageAccessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(fields).toString(),
      },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await ctx.onRateLimit?.(res.rateLimit);
    return res.data.id;
  }

  // ---------------------------------------------------------------------------
  // POTANSİYEL MÜŞTERİLER
  // ---------------------------------------------------------------------------

  /**
   * Tek kaydı çeker.
   *
   * SAYFA TOKEN'I + `leads_retrieval`. Kullanıcı token'ıyla çağrı, izinler
   * doğru olsa bile boş dönüyor ya da "(#200)" ile reddediliyor.
   */
  async fetchLead(params: {
    pageAccessToken: string;
    externalLeadId: string;
    onRateLimit?: (snapshot: RateLimitSnapshot) => void | Promise<void>;
  }): Promise<DiscoveredLead> {
    const url = new URL(`${this.graph}/${params.externalLeadId}`);
    url.searchParams.set(
      'fields',
      ['id', 'created_time', 'form_id', 'ad_id', 'field_data'].join(','),
    );

    const res = await platformFetch<RawLead>(
      'meta',
      url.toString(),
      { headers: { Authorization: `Bearer ${params.pageAccessToken}` } },
      parseMetaRateLimit,
    );
    if (res.rateLimit) await params.onRateLimit?.(res.rateLimit);
    return mapLead(res.data);
  }

  /**
   * Bir formun kayıtlarını tarar.
   *
   * `filtering` ile zaman kısıtı: Meta `created_time` üzerinde `GREATER_THAN`
   * kabul ediyor ve saniye cinsinden epoch bekliyor.
   *
   * SAYFALAMA TAKİP EDİLİYOR ama ÜST SINIRLA. Sınırsız takip, ilk taramada
   * yıllık geçmişi çekip kotayı bitirebilir; sınır ise sessiz olmasın diye
   * loglanıyor ve bir sonraki tur kaldığı yerden devam ediyor (imleç en eski
   * okunmamış kayda göre ilerliyor).
   */
  async fetchFormLeads(params: {
    pageAccessToken: string;
    externalFormId: string;
    since: Date;
    onRateLimit?: (snapshot: RateLimitSnapshot) => void | Promise<void>;
  }): Promise<DiscoveredLead[]> {
    const out: DiscoveredLead[] = [];
    let next: string | null = null;
    let pages = 0;

    const first = new URL(`${this.graph}/${params.externalFormId}/leads`);
    first.searchParams.set(
      'fields',
      ['id', 'created_time', 'form_id', 'ad_id', 'field_data'].join(','),
    );
    first.searchParams.set('limit', '100');
    first.searchParams.set(
      'filtering',
      JSON.stringify([
        {
          field: 'time_created',
          operator: 'GREATER_THAN',
          value: Math.floor(params.since.getTime() / 1000),
        },
      ]),
    );

    let url: string = first.toString();
    while (pages < MAX_LEAD_PAGES) {
      const res: PlatformResponse<GraphPage> = await platformFetch<GraphPage>(
        'meta',
        url,
        { headers: { Authorization: `Bearer ${params.pageAccessToken}` } },
        parseMetaRateLimit,
      );
      if (res.rateLimit) await params.onRateLimit?.(res.rateLimit);

      for (const row of res.data.data ?? []) {
        out.push(mapLead(row as unknown as RawLead));
      }

      pages++;
      next = res.data.paging?.next ?? null;
      if (!next) break;
      url = next;
    }

    if (next) {
      // SESSİZ KESME YOK. Sayfa sınırına takıldıysak bunu söylüyoruz;
      // bir sonraki tur imleçten devam ediyor.
      this.logger.warn(
        `Form ${params.externalFormId}: ${MAX_LEAD_PAGES} sayfa sınırına ulaşıldı, ` +
          'kalanı bir sonraki turda okunacak',
      );
    }
    return out;
  }

  /**
   * Meta'da anahtar kelime YOK.
   *
   * Boş dizi dönüyor, hata değil: bu bir yetenek farkı, arıza değil. Hata
   * fırlatmak, Meta bağlantısı olan her müşteride anahtar kelime
   * senkronizasyonunun başarısız görünmesi ve iş listesinin kırmızıya
   * boyanması demek olurdu.
   */
  async fetchKeywords(): Promise<{ rows: DiscoveredKeywordRow[]; apiCalls: number }> {
    return { rows: [], apiCalls: 0 };
  }
  /**
   * Meta'da ARAMA TERİMİ diye bir kavram YOK.
   *
   * Boş dizi döndürmek "bu dönemde terim yok" gibi okunurdu; oysa doğrusu
   * "bu platformda böyle bir şey yok". `fetchLead` ile aynı karar.
   */
  async fetchSearchTerms(): Promise<never> {
    throw new PlatformApiError(
      'meta',
      'permanent',
      "Meta'da arama terimi raporu yok — bu yalnızca Google Ads'te var.",
    );
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
 * Aksiyon dizisini tür → değer haritasına indirger.
 *
 * Aynı tür birden fazla girdi olarak gelebiliyor (Meta atıf penceresine göre
 * bölüyor); o durumda toplanıyor. Varsayılan pencere (`value`) kullanılıyor —
 * `1d_view`/`7d_click` gibi alanlar ham gövdede duruyor ve gerekirse oradan
 * okunabilir.
 */
function actionMap(value: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    const record = asObject(item);
    if (!record) continue;
    const type = text(record.action_type);
    if (!type) continue;
    const n = Number(record.value ?? 0);
    if (Number.isFinite(n)) out.set(type, (out.get(type) ?? 0) + n);
  }
  return out;
}

/**
 * Kova sayılarını ÖNCELİK SIRASIYLA çözer.
 *
 * `packages/shared`'daki tanımla aynı mantık; orada rapor için sorgu anında,
 * burada senkronizasyon anında uygulanıyor. Mantığı iki yerde tutmak hoş değil
 * ama sağlayıcı katmanının `modules/reports`a bağımlı olması daha kötü —
 * sağlayıcılar hiçbir üst katmanı tanımıyor. TANIM tek yerde (shared), yalnızca
 * uygulama tekrar ediyor ve testler ikisini de aynı canlı şekle karşı
 * doğruluyor.
 */
function bucketsFromActions(value: unknown): { form: number; message: number; purchase: number } {
  const map = actionMap(value);
  const pick = (types: readonly string[]): number => {
    for (const t of types) {
      const v = map.get(t);
      // Sıfır "dolu değil" sayılıyor: dolu bir yedeği engellememeli.
      if (v !== undefined && v !== 0) return v;
    }
    return 0;
  };
  return {
    form: pick(CONVERSION_BUCKETS.form.actionTypes),
    message: pick(CONVERSION_BUCKETS.message.actionTypes),
    purchase: pick(CONVERSION_BUCKETS.purchase.actionTypes),
  };
}

/** Aksiyon DEĞERLERİNDEN (para) öncelik sırasıyla seçer; ondalık string döner. */
function pickActionValue(value: unknown, types: readonly string[]): string {
  const map = actionMap(value);
  for (const t of types) {
    const v = map.get(t);
    if (v !== undefined && v !== 0) return String(v);
  }
  return '0';
}

/**
 * Gönderi kimliğinden sayfa önekini ayıklar.
 *
 * Meta gönderi kimliğini iki biçimde veriyor: `<page>_<post>` ve yalnızca
 * `<post>`. `object_story_id` her zaman birleşik biçimi istiyor; öneki iki kez
 * eklemek `<page>_<page>_<post>` üretir ve Meta bunu "gönderi bulunamadı" diye
 * reddeder — mesajı da hangi kimliğin yanlış olduğunu söylemez.
 */
export function stripPagePrefix(postId: string, pageId: string): string {
  return postId.startsWith(`${pageId}_`) ? postId.slice(pageId.length + 1) : postId;
}

/**
 * Coğrafi arama satırını hedefleme seçeneğine çevirir.
 *
 * ETİKET ÜÇ PARÇADAN KURULUYOR: "İzmir, İzmir, Türkiye". Yalnızca `name`
 * göstermek yetmiyor — Meta'da aynı adı taşıyan onlarca yer var (Türkiye'de
 * bile birden fazla "Merkez" ilçesi) ve yanlış seçim ancak fatura geldiğinde
 * fark ediliyor.
 */
export function mapGeoLocation(row: Record<string, unknown>): GeoLocationOption | null {
  const key = row.key;
  const name = row.name;
  // ANAHTARSIZ SATIR ATILIYOR: `key` hedeflemeye giden değerin ta kendisi ve
  // olmadan bu satır seçilse bile Meta'ya gönderilemez. Listeye koymak,
  // tıklanınca hiçbir şey olmayan bir seçenek göstermek olurdu.
  if (typeof key !== 'string' || typeof name !== 'string') return null;

  const parcalar = [name];
  if (typeof row.region === 'string' && row.region && row.region !== name) {
    parcalar.push(row.region);
  }
  if (typeof row.country_name === 'string' && row.country_name) {
    parcalar.push(row.country_name);
  }

  return {
    key,
    type: typeof row.type === 'string' ? row.type : 'unknown',
    name,
    label: parcalar.join(', '),
    countryCode: typeof row.country_code === 'string' ? row.country_code : null,
  };
}

/**
 * Kayıtlı kitle satırı.
 *
 * `approximate_count` YOKSA NULL, sıfır DEĞİL. Meta bu alanı küçük kitlelerde
 * ve yeni kurulmuş kitlelerde vermiyor; sıfır yazmak "bu kitlede kimse yok"
 * demek olurdu ve kullanıcı çalışan bir kitleyi kullanmaktan vazgeçerdi.
 * Ölçülmemiş olanı sıfır saymak bu projede raporlarda da kaçınılan hata.
 */
export function mapSavedAudience(row: Record<string, unknown>): SavedAudienceOption | null {
  const id = row.id;
  if (typeof id !== 'string') return null;
  /*
   * İKİ SINIR ALANI — ve -1 ÖLÇÜLMEMİŞ DEMEK.
   *
   * Meta pasif lookalike'larda bu alanları **-1** döndürüyor. Ham sayıyı
   * geçirmek panelde "~-1 kişi" yazdırırdı; `typeof === 'number'` kontrolü
   * -1'i geçerli sayıyor. Ölçülmemiş olanı bir sayı gibi göstermek, bu
   * projede raporlarda da kaçınılan hatanın aynısı.
   *
   * Alt sınır tercih ediliyor: kullanıcıya kitlenin EN AZ kaç kişi olduğunu
   * söylemek, üst sınırla şişirmekten dürüst.
   */
  const alt = row.approximate_count_lower_bound;
  const ust = row.approximate_count_upper_bound;
  const gecerli = (v: unknown): number | null =>
    typeof v === 'number' && v >= 0 ? v : null;

  return {
    id,
    name: typeof row.name === 'string' && row.name ? row.name : id,
    approximateCount: gecerli(alt) ?? gecerli(ust),
  };
}

/**
 * Instagram kreatif doğrulamasının KARARI — saf, sınanabilir.
 *
 * K17'nin bütün çekincesi Meta'nın bir alanı kabul edip sessizce yok saymasıydı
 * ve canlıda tam olarak bu belirsizlik çıktı: gönderilen 18090331100389207,
 * Meta'nın `effective` olarak döndürdüğü 18117166231898791.
 *
 * KARAR ÜÇ DURUMLU ve hangi alana bakıldığı belirleyici:
 *
 *   · `reject` — `source_instagram_media_id` YANKISI farklı. Aynı alanı geri
 *     okumak aynı uzayda karşılaştırmak demek; farklıysa Meta gerçekten başka
 *     bir medya kaydetmiş. Reklam açılmıyor.
 *   · `warn` — yankı doğru ama `effective_instagram_media_id` farklı. Büyük
 *     olasılıkla kimlik uzayı farkı (Instagram medyasında üç uzay var). Engel
 *     yapmak, çalışan bir yolu doğrulanmamış bir varsayım yüzünden kapatmak
 *     olurdu; ama sessiz de kalmıyor.
 *   · `warn` — yankı hiç dönmedi. `fields` ile istenmediğinde dönmüyor ve
 *     gecikmeli dolabiliyor; yokluğunu "yanlış" saymak yine sebepsiz engel.
 *
 * Hiçbir durumda "her şey yolunda" varsayımı yok: `ok` yalnızca yankı BİREBİR
 * eşleştiğinde dönüyor.
 */
/**
 * Boost hatasına HANGİ ADIMDA çıktığını ekler.
 *
 * NEDEN GEREKLİ: boost beş Meta çağrısından oluşuyor ve Meta'nın hata metni
 * hangisinden geldiğini söylemiyor. Bu, ilk canlı denemede doğrudan yanlış
 * teşhise yol açtı: eksik alan ad set'in `destination_type`'ıydı ama mesaj
 * *"reklam kreatifi kısmında bir eylem çağrısı seçin"* diyordu — Meta'nın
 * tarifi kendi arayüzüne göre yazılmış ve API'de yanlış yeri gösteriyor.
 *
 * HATA SINIFI KORUNUYOR. `kind` yeniden üretiliyor çünkü `retryable` ona
 * bakıyor: `permanent` bir hatayı sarıp `transient` yapmak, boost'u sonsuza
 * kadar yeniden denemek demek olurdu. `detail` de taşınıyor — subcode olmadan
 * Meta'nın hata kataloğunda arama yapılamıyor.
 *
 * PlatformApiError DIŞINDAKİ hata OLDUĞU GİBİ geçiyor: onu sarmak, üstteki
 * `instanceof` kontrollerini (örneğin transaction hatası ayrımı) bozardı.
 */
/**
 * VAR OLAN bir kampanyanın altına gönderi eklenebilir mi? (K21)
 *
 * Kampanya seviyesindeki alanlar SONRADAN DEĞİŞTİRİLEMİYOR ve bu yüzden
 * yeniden kullanılan bir kampanya, altına eklenen her gönderiye kendi
 * ayarlarını dayatıyor. Dördü de sessiz hataya açık:
 *
 *   1. AMAÇ — `POST_ENGAGEMENT` optimizasyonu ve `ON_POST` hedefi yalnızca
 *      OUTCOME_ENGAGEMENT altında geçerli. Başka amaçlı bir kampanyaya
 *      eklemek, ya hata ya da Meta'nın kabul edip başka bir şey yapması.
 *
 *   2. ÖZEL REKLAM KATEGORİSİ — kampanyada beyan edilmiş kategoriler
 *      değiştirilemiyor. Müşterinin beyanı sonradan "konut" olduysa, eski
 *      kampanyaya eklenen reklam BEYANSIZ yayınlanır. Cezası kampanya
 *      seviyesinde değil HESAP seviyesinde: bir müşteri için unutulan beyan,
 *      ajansın o hesaptaki bütün kampanyalarını riske atıyor. Bu, listedeki
 *      en pahalı hata.
 *
 *   3. REKLAM HESABI — kampanya tek bir hesapta yaşıyor. Sayfanın
 *      faturalandırma hesabı sonradan değiştiyse, eski kampanya artık yanlış
 *      hesapta ve para başka müşterinin hesabından çıkar.
 *
 *   4. DURUM — duraklatılmış bir kampanyanın altındaki yeni ad set HİÇ
 *      HARCAMIYOR. Panelde boost "yayında" görünür, Ads Manager'da hiçbir
 *      şey olmaz ve hiçbir hata da yazmaz. Bu projenin baş belası tam olarak
 *      bu tür.
 *
 * DURUM META'DAN OKUNUYOR, kendi kaydımızdan değil: kullanıcı kampanyayı Ads
 * Manager'dan duraklatmış olabilir ve bizim satırımız hâlâ 'active' der.
 *
 * KAMPANYA KENDİLİĞİNDEN YAYINA ALINMIYOR. Duraklatmayı kullanıcı bilerek
 * yapmış olabilir; paylaşılan bir nesnenin durumunu bizim değiştirmemiz,
 * onun kararını sessizce geri almak olurdu. Reddedip SÖYLÜYORUZ.
 */
export function decideCampaignReuse(params: {
  objectiveWanted: string;
  categoriesWanted: string[];
  adAccountWanted: string;
  campaign: {
    id: string;
    objective?: string;
    effective_status?: string;
    status?: string;
    special_ad_categories?: string[];
    account_id?: string;
  };
}): { ok: true } | { ok: false; message: string } {
  const { objectiveWanted, categoriesWanted, adAccountWanted, campaign } = params;

  if (campaign.objective && campaign.objective !== objectiveWanted) {
    return {
      ok: false,
      message:
        `Seçilen kampanyanın amacı "${campaign.objective}", oysa gönderi öne çıkarma ` +
        `"${objectiveWanted}" istiyor. Kampanyanın amacı sonradan değiştirilemiyor — ` +
        `bu gönderi için yeni bir kampanya oluştur.`,
    };
  }

  /*
   * KÜME KARŞILAŞTIRMASI, dizi karşılaştırması değil: Meta sırayı korumuyor
   * ve sıraya duyarlı bir kontrol, aynı beyanı "farklı" sayıp çalışan bir
   * yolu kapatırdı.
   */
  const kampanyaKat = [...(campaign.special_ad_categories ?? [])].sort();
  const istenenKat = [...categoriesWanted].sort();
  if (kampanyaKat.join('|') !== istenenKat.join('|')) {
    return {
      ok: false,
      message:
        `Seçilen kampanyanın özel reklam kategorisi beyanı (${kampanyaKat.join(', ') || 'yok'}) ` +
        `müşterinin bugünkü beyanıyla (${istenenKat.join(', ') || 'yok'}) uyuşmuyor. ` +
        `Beyan kampanya oluşturulduktan sonra değiştirilemiyor ve eksik beyan hesap ` +
        `seviyesinde yaptırıma açık — bu gönderi için yeni bir kampanya oluştur.`,
    };
  }

  /*
   * HESAP KİMLİĞİNDE ÖNEK NORMALLEŞTİRİLİYOR. Meta `account_id`'yi öneksiz
   * döndürüyor ama bizim kaydımızda `act_` önekiyle duruyor; çıplak
   * karşılaştırma her seferinde uyuşmazlık verir ve özellik hiç çalışmaz.
   */
  if (
    campaign.account_id &&
    actPath(campaign.account_id) !== actPath(adAccountWanted)
  ) {
    return {
      ok: false,
      message:
        `Seçilen kampanya başka bir reklam hesabında (${campaign.account_id}); bu boost ` +
        `${adAccountWanted} hesabından faturalandırılıyor. Kampanya hesaplar arasında ` +
        `taşınamıyor — yeni bir kampanya oluştur.`,
    };
  }

  const durum = campaign.effective_status ?? campaign.status;
  if (durum !== 'ACTIVE') {
    return {
      ok: false,
      message:
        `Seçilen kampanya yayında değil (durumu: ${durum ?? 'bilinmiyor'}). Duraklatılmış ` +
        `bir kampanyanın altına eklenen reklam hiç harcamıyor ve hiçbir hata da vermiyor. ` +
        `Kampanyayı Ads Manager'da yayına al ya da yeni bir kampanya oluştur.`,
    };
  }

  return { ok: true };
}

export function labelBoostError(step: string, err: unknown): unknown {
  if (err instanceof PlatformApiError) {
    return new PlatformApiError(
      err.platform,
      err.kind,
      `${step}: ${err.message}`,
      err.detail,
    );
  }
  return err;
}

export function decideInstagramCreativeCheck(params: {
  sent: string;
  echo?: string;
  effective?: string;
}): { verdict: 'ok' } | { verdict: 'reject' | 'warn'; message: string } {
  const { sent, echo, effective } = params;

  if (echo && echo !== sent) {
    return {
      verdict: 'reject',
      message:
        `Instagram kreatifi YANLIŞ gönderiye bağlandı: gönderilen ${sent}, ` +
        `Meta'nın kaydettiği ${echo}. Boost geri alındı.`,
    };
  }

  if (!echo) {
    return {
      verdict: 'warn',
      message:
        'Meta gönderilen medya kimliğini geri döndürmedi, doğrulama yapılamadı. ' +
        'Reklam açılıyor — Ads Manager’dan gözle kontrol et.',
    };
  }

  if (effective && effective !== sent) {
    return {
      verdict: 'warn',
      message:
        `Gönderilen medya kimliği ${sent} kaydedildi ama Meta "effective" olarak ` +
        `${effective} raporluyor. Muhtemelen kimlik uzayı farkı; reklamın DOĞRU ` +
        'gönderiyi gösterdiği Ads Manager’dan gözle doğrulanmalı.',
    };
  }

  return { verdict: 'ok' };
}

/**
 * Instagram kreatif gövdesi — `POST /act_<id>/adcreatives`.
 *
 * ÜÇ ALAN VE ÜÇÜ DE KÖK SEVİYEDE. `object_story_spec` İÇİNE YAZILMIYOR:
 * `source_instagram_media_id` o nesnenin alan listesinde hiç yok, yani içine
 * yazmak imkânsız — ve `object_story_spec` zaten başka bir yolun aracı
 * (sıfırdan yayınlanmamış gönderi yaratmak). Var olan organik gönderiyi
 * boost etmek bu üç alanla oluyor.
 *
 * `object_id` SAYFA KİMLİĞİ, gönderi kimliği DEĞİL. Alanın genel tanımı
 * "tanıtılan Facebook nesnesi" ama Instagram boost yolunda buraya sayfa
 * yazılıyor. Meta'nın kendi örneği birebir böyle.
 *
 * GÖNDERİLMEYEN ALANLAR VE SEBEPLERİ — hepsi bilinçli:
 *
 *   · `call_to_action`: boost yolunda hangi `type` değerlerinin geçerli
 *     olduğu belgelenmemiş ve linksiz organik gönderide ne olacağı belirsiz.
 *     Kararı Meta'ya bırakmak yerine ALANI HİÇ göndermiyoruz; gönderinin
 *     kendi düğmesi neyse o kalıyor.
 *   · `degrees_of_freedom_spec…enroll_status`: Meta bazı hesaplarda bunu
 *     zorunlu tutuyor ("Creative Must Provide enroll_status"). Ama `OPT_IN`
 *     organik gönderinin GÖRÜNÜMÜNÜ otomatik iyileştirmelerle değiştiriyor ve
 *     boost'un amacı gönderiyi olduğu gibi öne çıkarmak. Hata gelirse
 *     `OPT_OUT` ile eklenecek.
 *   · `instagram_permalink_url`: referansta yazılabilir görünüyor ama Meta'nın
 *     boost rehberinde hiç geçmiyor. Bilinen yola düşülüyor.
 *
 * KULLANILMAYAN ESKİ ADLAR: `instagram_actor_id` (v22.0'da kaldırıldı),
 * `instagram_story_id` (yerine `source_instagram_media_id`),
 * `legacy_instagram_media_id` (v21 ve öncesi kimlik uzayı).
 */
export function instagramCreativeBody(
  source: Extract<BoostSource, { surface: 'instagram' }>,
  name: string,
): Record<string, string> {
  return {
    name: boostNameWithLabel(name, 'creative'),
    object_id: source.pageExternalId,
    instagram_user_id: source.instagramUserId,
    source_instagram_media_id: source.mediaExternalId,
  };
}

/**
 * Instagram yerleşimi — medya türüne göre.
 *
 * BOŞ BIRAKILMIYOR ve sebebi "platformun varsayılanına güvenme" kuralı:
 * `instagram_positions` verilmezse Meta reklamı BÜTÜN Instagram yerleşimlerine
 * dağıtıyor ve bir akış fotoğrafı Reels'te gösterildiğinde kırpılıp kötü
 * görünüyor. `publisher_platforms` ise Facebook'a sızmayı engelliyor: Instagram
 * medyasından üretilen kreatifin Facebook akışında karşılığı yok.
 *
 * KASITLI OLARAK DAR: her medya türü için tek yerleşim. Genişletmek bir sonraki
 * turun işi ve canlı veriye bakarak yapılmalı; şimdi geniş bırakmak, sonucun
 * neden kötü olduğunu bilemediğimiz bir dağıtım demek.
 */
export function instagramPlacements(mediaType: string): {
  publisher_platforms: string[];
  instagram_positions: string[];
} {
  return {
    publisher_platforms: ['instagram'],
    instagram_positions: mediaType === 'reel' ? ['reels'] : ['stream'],
  };
}

/**
 * BOOST HEDEFLEMESİNİN VARSAYILANI — ülke geneli Türkiye.
 *
 * Boost'un amacı mevcut ilgiyi büyütmek; dar hedefleme onu zaten gören
 * kitleye tekrar göstermek olurdu. Kural yolunun bugünkü davranışı bu ve
 * hedefleme alanı eklenirken KORUNDU (§3 — çalışan davranış bozulmuyor).
 */
export const DEFAULT_BOOST_TARGETING: Record<string, unknown> = {
  geo_locations: { countries: ['TR'] },
};

/**
 * Boost ad set'inin Graph gövdesi.
 *
 * DÖNGÜDEN ÇIKARILDI Kİ SINANABİLSİN: burada üretilen üç değer de yanlış
 * olduğunda SESSİZ. Yanlış bütçe alanı beklenenin katlarını harcar, yanlış
 * hedefleme reklamı başka şehre gösterir, eksik `end_time` boost'u süresiz
 * çalıştırır — üçü de Meta tarafından kabul edilir ve hiçbir hata üretmez.
 *
 * `now` DIŞARIDAN GELİYOR: `Date.now()` içeride olsaydı bitiş zamanı teste
 * bağlanamazdı.
 */
export function buildBoostAdSetParams(
  request: BoostRequest,
  campaignId: string,
  now: Date,
): Record<string, string> {
  /**
   * Bitiş zamanı SÜREDEN türetiliyor ve HER İKİ KİPTE DE gönderiliyor.
   *
   * Günlük bütçede boost'un kendiliğinden durmasını sağlayan tek şey bu:
   * bitiş vermezsek "3 günlük boost" süresiz çalışan bir kampanya olur.
   * Toplam bütçede ise Meta parayı süreye bölüyor ve süre olmadan bölecek
   * bir şeyi yok.
   */
  const endTime = new Date(now.getTime() + request.durationDays * 86_400_000);

  /**
   * ÖZEL KATEGORİ KISITI ÇAĞIRANDA DEĞİL, BURADA.
   *
   * Konut/istihdam/kredi beyanı olan müşteride Meta yaş ve cinsiyet
   * daraltmasını kabul etmiyor — ya reddediyor ya da KABUL EDİP sessizce yok
   * sayıyor. İkincisinde kullanıcı uygulanmamış bir hedeflemeye reklam
   * verdiğini sanır.
   *
   * Kısıtın telde son duraktan önce uygulanması bilinçli: boost'un iki
   * çağıranı var (kural yürütücüsü ve ağaç yayıncısı) ve üçüncüsü elle boost
   * olacak. Çağırana bırakmak, bir gün birinin unutması demek — ve unutulduğu
   * hiçbir yerde görünmez. Çağıran katman kullanıcıya UYARIYI gösteriyor;
   * garantiyi burası veriyor.
   */
  const { targeting } = restrictTargetingFor(
    (request.specialAdCategories ?? []) as SpecialAdCategory[],
    request.targeting ?? DEFAULT_BOOST_TARGETING,
  );

  /**
   * INSTAGRAM'DA YERLEŞİM AÇIKÇA YAZILIYOR.
   *
   * Facebook boost'unda yerleşim verilmiyor ve o davranış korunuyor (§3);
   * Instagram'da ise verilmemesi, IG medyasından üretilen kreatifin Facebook
   * yerleşimlerine de dağıtılmaya çalışılması demek.
   */
  const yerlesim =
    request.source.surface === 'instagram'
      ? instagramPlacements(request.source.mediaType)
      : {};

  const params: Record<string, string> = {
    name: boostNameWithLabel(request.name, 'adSet'),
    campaign_id: campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'POST_ENGAGEMENT',
    /**
     * HEDEF AÇIKÇA "GÖNDERİNİN ÜZERİNDE" — verilmemesi boost'u öldürüyordu.
     *
     * Alan gönderilmediğinde Meta hedefi kendi çözüyor ve harici bir web
     * sitesine düşüyor: ilk canlı denemede istek *"Eylem Çağrısı Gerekiyor ·
     * Kampanya amacınız için harici bir internet sitesi URL'si gerekiyor"*
     * (subcode 2446383) ile reddedildi. Boost'un tanımı gereği harici bir URL
     * YOK — kullanıcı var olan gönderiyi öne çıkarıyor, bir siteye trafik
     * göndermiyor. `ON_POST`, OUTCOME_ENGAGEMENT altında tam bu durumun
     * değeri ve `POST_ENGAGEMENT` optimizasyonuyla eşleşen tek tutarlı hedef.
     *
     * FACEBOOK YOLUNA DA GÖNDERİLİYOR ve bu, yerleşim kararının tersi
     * (yerleşim yalnızca Instagram'da yazılıyor). Fark şurada: yerleşimde
     * korunacak çalışan bir davranış vardı, burada YOK — Facebook boost'u da
     * aynı amacı ve aynı optimizasyonu kullanıyor, yani App Review açıldığı
     * gün aynı hataya düşerdi. İki yolu ayırmak, aynı hatayı ikinci kez
     * bulmayı beklemek olurdu.
     */
    destination_type: 'ON_POST',
    // Reklam oluşturucuyla AYNI GEREKÇE: strateji söylenmezse Meta hesabın
    // varsayılanına düşüyor ve tavanlı bir varsayılan isteği reddediyor.
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    end_time: endTime.toISOString(),
    targeting: JSON.stringify({ ...targeting, ...yerlesim }),
    status: 'ACTIVE',
  };

  if (request.budget.mode === 'lifetime') {
    /**
     * TOPLAM BÜTÇE — kullanıcının yazdığı sayının kendisi.
     *
     * Günlük bütçe Meta'da SERT TAVAN DEĞİL: günü aşabiliyor ve dengelemeyi
     * hafta içine yayıyor. Ekranda "300 TL" yazarken altından 5 × 60 TL
     * göndermek, panelde yazan sayı ile hesaptan çıkan sayının ayrışması
     * demek (K18).
     *
     * `start_time` toplam bütçeyle birlikte AÇIKÇA gönderiliyor: Meta parayı
     * bir aralığa bölüyor ve aralığın başlangıcını söylememek, kararı
     * platformun varsayılanına bırakmak olur. CANLIDA DOĞRULANMADI —
     * ilk gerçek çağrıda bakılacak.
     */
    params.lifetime_budget = toMinorUnits(
      request.budget.totalMicros,
      request.currency,
    ).toString();
    params.start_time = now.toISOString();
  } else {
    params.daily_budget = toMinorUnits(
      request.budget.dailyMicros,
      request.currency,
    ).toString();
  }

  return params;
}

/**
 * `/me/accounts` satırını sosyal profillere çevirir: sayfa, varsa artı IG.
 *
 * BİR SATIR İKİ PROFİL ÜRETEBİLİYOR ve ikisinin kimlikleri FARKLI UZAYDAN:
 * sayfanınki Facebook sayfa kimliği, Instagram'ınki IG kullanıcı kimliği.
 * Meta'da reklam her zaman bir Facebook sayfasına bağlı olduğu için Instagram
 * satırı sayfanın kimliğini de taşımak zorunda — taşımadığı sürece "bu
 * Instagram hesabı hangi sayfaya ait" sorusunun veritabanında cevabı yoktu ve
 * boost yolu IG kullanıcı kimliğini sayfa kimliği sanıyordu.
 *
 * DÖNGÜDEN ÇIKARILDI ki sınanabilsin: bu eşlemenin hatası sessiz — profil
 * kaydedilir, adı doğru görünür, yalnızca yayın anında yanlış kimlik gider.
 */
export function mapPageProfiles(raw: Record<string, unknown>): DiscoveredSocialProfile[] {
  const picture = raw.picture as { data?: { url?: string } } | undefined;
  const pageToken = raw.access_token ? String(raw.access_token) : undefined;

  const out: DiscoveredSocialProfile[] = [
    {
      profileType: 'facebook_page',
      externalId: String(raw.id),
      name: String(raw.name ?? raw.id),
      username: raw.username ? String(raw.username) : undefined,
      pictureUrl: picture?.data?.url,
      pageAccessToken: pageToken,
      raw,
    },
  ];

  const ig = raw.instagram_business_account as Record<string, unknown> | undefined;
  if (ig?.id) {
    out.push({
      profileType: 'instagram_business',
      externalId: String(ig.id),
      name: String(ig.name ?? ig.username ?? ig.id),
      username: ig.username ? String(ig.username) : undefined,
      pictureUrl: ig.profile_picture_url ? String(ig.profile_picture_url) : undefined,
      // IG Business hesabına erişim, bağlı olduğu SAYFANIN token'ı ile olur.
      pageAccessToken: pageToken,
      parentPageExternalId: String(raw.id),
      raw: ig,
    });
  }

  return out;
}

/**
 * Graph yanıtını organik gönderiye çevirir.
 *
 * Facebook ve Instagram AYRI alan adları kullanıyor ve içgörüler iç içe bir
 * `data` dizisinde `{name, values:[{value}]}` şeklinde geliyor. Şekle bağımlı
 * okumak yerine ada göre arama yapılıyor: Meta alan sırasını garanti etmiyor.
 */
export function mapOrganicPost(
  row: Record<string, unknown>,
  ig: boolean,
): DiscoveredOrganicPost | null {
  const id = typeof row.id === 'string' ? row.id : null;
  if (!id) return null;

  const insights = readInsights(row.insights);
  const timestamp = ig ? row.timestamp : row.created_time;
  const publishedAt = typeof timestamp === 'string' ? new Date(timestamp) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return null;

  const likes = ig
    ? num(row.like_count)
    : num(readNested(row, ['likes', 'summary', 'total_count']));
  const comments = ig
    ? num(row.comments_count)
    : num(readNested(row, ['comments', 'summary', 'total_count']));
  // Paylaşım YALNIZCA Facebook'ta var; Instagram paylaşımı raporlamıyor.
  // Sıfır yazmak "hiç paylaşılmadı" demek olurdu — ölçülmemiş olanı sıfır
  // saymak, tam da bu projede raporlarda kaçınılan hata.
  const shares = ig ? 0 : num(readNested(row, ['shares', 'count']));
  const saves = ig ? insights.saved : 0;

  return {
    externalId: id,
    mediaType: mapMediaType(row, ig),
    message: str(ig ? row.caption : row.message),
    permalink: str(ig ? row.permalink : row.permalink_url),
    thumbnailUrl: str(ig ? (row.thumbnail_url ?? row.media_url) : row.full_picture),
    publishedAt,
    impressions: insights.impressions,
    reach: insights.reach,
    likes,
    comments,
    shares,
    saves,
    videoViews: insights.videoViews,
    raw: row,
  };
}

function mapMediaType(row: Record<string, unknown>, ig: boolean): DiscoveredOrganicPost['mediaType'] {
  if (ig) {
    const t = String(row.media_type ?? '').toUpperCase();
    if (t === 'VIDEO') return 'video';
    if (t === 'CAROUSEL_ALBUM') return 'carousel';
    if (t === 'IMAGE') return 'photo';
    return 'photo';
  }
  const att = readNested(row, ['attachments', 'data', '0', 'media_type']);
  const t = String(att ?? '').toLowerCase();
  if (t === 'video') return 'video';
  if (t === 'album') return 'carousel';
  if (t === 'photo') return 'photo';
  if (t === 'link') return 'link';
  return row.message ? 'text' : 'photo';
}

/**
 * `insights.data[]` dizisini ada göre okur.
 *
 * Facebook ve Instagram farklı metrik adları kullanıyor; ikisini de aynı
 * sözlüğe indirip burada eşliyoruz.
 */
function readInsights(value: unknown): {
  impressions: number;
  reach: number;
  saved: number;
  videoViews: number;
} {
  const out = { impressions: 0, reach: 0, saved: 0, videoViews: 0 };
  const data = readNested(value as Record<string, unknown>, ['data']);
  if (!Array.isArray(data)) return out;

  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const name = String(e.name ?? '');
    const values = e.values;
    const v = Array.isArray(values) && values.length > 0 ? num((values[0] as Record<string, unknown>)?.value) : 0;

    if (name === 'impressions' || name === 'post_impressions') out.impressions = v;
    else if (name === 'reach' || name === 'post_impressions_unique') out.reach = v;
    else if (name === 'saved') out.saved = v;
    // `views` Instagram'da `video_views`ın halefi; Facebook hâlâ
    // `post_video_views` döndürüyor. Eski ad da okunmaya devam ediyor:
    // veritabanındaki `raw` kayıtları ve olası sürüm farkları için zararsız.
    else if (name === 'views' || name === 'video_views' || name === 'post_video_views') {
      out.videoViews = v;
    }
  }
  return out;
}

function readNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Kreatif alanlarını kurar.
 *
 * İKİ YOL:
 *   · TEK GÖRSEL → basit `object_story_spec`. En güvenilir yol ve Meta'nın
 *     en iyi desteklediği biçim.
 *   · ÇOK GÖRSEL → `asset_feed_spec` + yerleşim kuralları. Her yerleşime
 *     kendi oranındaki görsel gidiyor.
 *
 * Tek görselde de `asset_feed_spec` kullanmak "tutarlı" görünürdü ama o
 * biçim daha kırılgan: eksik bir alan Meta tarafından anlaşılmaz bir hatayla
 * reddediliyor. Basit yol basit kalmalı.
 */
function buildCreativeSpec(
  req: PublishDraftRequest,
  leadFormId: string | undefined,
): Record<string, string> {
  const link = req.spec.destinationType === 'WHATSAPP'
    // WhatsApp reklamında bağlantı, numaraya giden wa.me adresi. Numara
    // verilmemişse Meta sayfaya bağlı numarayı kullanıyor.
    ? (req.whatsappNumber ? `https://wa.me/${req.whatsappNumber}` : `https://wa.me/`)
    : (req.linkUrl ?? `https://facebook.com/${req.pageExternalId}`);

  /**
   * FORM KAMPANYASINDA HER ZAMAN TEK GÖRSELLİ KREATİF.
   *
   * Çok görselli yol `asset_feed_spec` kullanıyor ve orada form kimliğinin
   * nereye yazılacağını CANLIDA DOĞRULAYAMIYORUZ. Yanlış alana yazmanın iki
   * sonucu var ve ikincisi tehlikeli olan:
   *
   *   · Meta reddeder — görünür, düzeltilir.
   *   · Meta KABUL EDER ve alanı görmezden gelir. Reklam yayınlanır, "Kaydol"
   *     butonu görünür, tıklayan kişiye form AÇILMAZ. Hata yok, harcama var,
   *     potansiyel müşteri yok.
   *
   * Tahmin etmek yerine bildiğimiz yola düşüyoruz: tek görselli kreatifte
   * `call_to_action.value.lead_gen_form_id` Meta'nın belgelediği standart
   * biçim. Bedeli oran özelleştirmesinin kaybı ve bunu `publishCheck`
   * kullanıcıya SÖYLÜYOR — sessizce kırpmıyoruz.
   *
   * `ads_management` canlıda tam çalıştığında `asset_feed_spec` içindeki
   * doğru alan denenip Ads Manager'dan formun gerçekten bağlandığı
   * doğrulanmalı; ondan sonra bu kısıt kalkabilir.
   */
  if (req.images.length <= 1 || leadFormId) {
    // Kare her zaman ilk sırada (`ad-publisher` sıralıyor), yani çok görsel
    // yüklenmiş bir form kampanyasında akışa uygun olan seçiliyor.
    const hash = req.images[0]?.hash;
    return {
      object_story_spec: JSON.stringify({
        page_id: req.pageExternalId,
        link_data: {
          message: req.primaryText,
          ...(req.headline ? { name: req.headline } : {}),
          ...(req.description ? { description: req.description } : {}),
          link,
          ...(hash ? { image_hash: hash } : {}),
          call_to_action: {
            type: req.spec.callToAction,
            value: leadFormId ? { lead_gen_form_id: leadFormId } : { link },
          },
        },
      }),
    };
  }

  return {
    object_story_spec: JSON.stringify({ page_id: req.pageExternalId }),
    asset_feed_spec: JSON.stringify({
      images: req.images.map((img) => ({
        hash: img.hash,
        adlabels: [{ name: `advetics_${img.ratio}` }],
      })),
      bodies: [{ text: req.primaryText }],
      ...(req.headline ? { titles: [{ text: req.headline }] } : {}),
      ...(req.description ? { descriptions: [{ text: req.description }] } : {}),
      link_urls: [{ website_url: link }],
      call_to_action_types: [req.spec.callToAction],
      ad_formats: ['SINGLE_IMAGE'],
      asset_customization_rules: req.customizationRules ?? [],
    }),
  };
}

/**
 * Yazma için gereken izinler.
 *
 * `optionalScopes` içinde de var ama liste orada UI'ın izin ekranı için;
 * burada AMACA göre ayrı duruyor. İkisini tek listeden türetmek, ileride
 * yazma için ikinci bir izin gerektiğinde onun izin ekranına eklenmesini de
 * zorunlu kılardı — istenmeyen bir bağ.
 */
const WRITE_SCOPES = ['ads_management'] as const;

/**
 * Micros → para biriminin EN KÜÇÜK BİRİMİ.
 *
 * Meta bütçeyi minor unit istiyor: TRY için kuruş, JPY için yen. Micros'u
 * doğrudan göndermek bütçeyi bir milyon katına çıkarırdı — kural motorunun
 * yapabileceği en pahalı hata.
 *
 * Küsuratsız ve üç küsuratlı para birimleri ISO 4217'de istisnadır ve
 * varsayılan 2'yi uygulamak JPY'de bütçeyi 100 katına çıkarır.
 */
export function toMinorUnits(micros: bigint, currency: string): bigint {
  const code = currency.toUpperCase();
  const digits = ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2;
  const divisor = 10n ** BigInt(6 - digits);
  return micros / divisor;
}

const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/**
 * Video görüntüleme gibi TEK TÜRLÜ dizilerin toplamı.
 *
 * `video_thruplay_watched_actions` tek bir aksiyon türü taşıyor; orada öncelik
 * sırası anlamsız, toplam doğru.
 */
function sumAll(value: unknown): number {
  let total = 0;
  for (const v of actionMap(value).values()) total += v;
  return total;
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

/**
 * İlk taramanın sayfa sınırı.
 *
 * 100'lük sayfalarla 10.000 kayıt. Sınırsız takip, yeni bağlanan bir sayfada
 * yıllık geçmişi tek turda çekip kotayı bitirebilir.
 */
const MAX_LEAD_PAGES = 100;

interface RawLead {
  id?: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
}

/**
 * Meta kaydını bizim biçimimize çevirir.
 *
 * `values` DİZİ: çoktan seçmeli sorularda birden çok cevap olabiliyor.
 * İlkini almak, kullanıcının işaretlediği diğer seçenekleri SESSİZCE atmak
 * olurdu; virgülle birleştiriyoruz.
 */
function mapLead(raw: RawLead): DiscoveredLead {
  return {
    externalLeadId: String(raw.id ?? ''),
    externalFormId: raw.form_id ? String(raw.form_id) : null,
    externalAdId: raw.ad_id ? String(raw.ad_id) : null,
    // `created_time` yoksa ŞİMDİ kullanılıyor: kaydı atmaktansa yaklaşık bir
    // zamanla tutmak yeğ. Zaman sıralaması bozulur ama kişi kaybolmaz.
    submittedAt: raw.created_time ? new Date(raw.created_time) : new Date(),
    fields: (raw.field_data ?? []).map((f) => ({
      name: String(f.name ?? ''),
      label: String(f.name ?? ''),
      value: (f.values ?? []).join(', '),
    })),
  };
}
