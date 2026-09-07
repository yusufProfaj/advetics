import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GeoLocationOption, SavedAudienceOption } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import {
  PlatformApiError,
  type AuthorizeUrlParams,
  type BoostResult,
  type BreakdownRequest,
  type CampaignSummary,
  type CreateAdResult,
  type DiscoveredAdAccount,
  type DiscoveredKeywordRow,
  type DiscoveredOrganicPost,
  type DiscoveredSearchTermRow,
  type DiscoveredSocialProfile,
  type FetchContext,
  type IAdPlatformProvider,
  type InsightsRequest,
  type OAuthTokens,
  type PlatformActionRequest,
  type PlatformActionResult,
  type PlatformBreakdowns,
  type PlatformInsights,
  type PlatformStructure,
  type PublishDraftRequest,
  type PublishDraftResult,
  type TokenVerification,
} from '../provider.types';
import { platformFetch } from './http';

/**
 * ═══ LINKEDIN ADS SAĞLAYICISI ═══
 *
 * 2026-09-07'de eklendi. O güne kadar bu depo yalnızca Meta ve Google
 * destekliyordu ve `CLAUDE.md` bunu bir kapsam kilidi olarak yazıyordu;
 * kilidin gerekçesi "istenmedi"ydi ve kullanıcının açık talebiyle düştü.
 *
 * ┌─ BU DOSYA HENÜZ CANLIDA HİÇ ÇALIŞTIRILMADI ────────────────────────────┐
 * │ LinkedIn Advertising API "Development Tier" başvurusu 2026-09-07'de     │
 * │ yapıldı. Onay gelene kadar uygulamaya SCOPE atanmıyor (Developer Portal │
 * │ > Auth: "No permissions added"), yani tek bir çağrı bile başarılı       │
 * │ olamaz. Aşağıdaki istek gövdeleri LinkedIn'in resmi dokümanından        │
 * │ yazıldı, canlı yanıttan DEĞİL.                                          │
 * │                                                                         │
 * │ Bu depoda "200 döndü" doğrulama sayılmıyor: ilk gerçek çağrılar en      │
 * │ küçük bütçeyle yapılmalı ve sonuç Campaign Manager'dan GÖZLE            │
 * │ doğrulanmalı.                                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ META'DAKİ DUVAR BURADA YOK ───────────────────────────────────────────┐
 * │ Meta'da `ads_read` ve `ads_management` AYRI onaylar ve ikincisi         │
 * │ alınamadığı için yazma tarafı aylardır canlıda çalıştırılamadı.         │
 * │ LinkedIn'de okuma ve yazma TEK ürünle geliyor: "Advertising API"        │
 * │ onaylandığında `r_ads`, `rw_ads` ve `r_ads_reporting` birlikte          │
 * │ atanıyor. Yani ilk onaydan sonra yazma yolu GERÇEKTEN denenebilir.      │
 * │                                                                         │
 * │ Bedeli başka yerde: Development katmanında yazma en fazla BEŞ reklam    │
 * │ hesabıyla sınırlı ve o hesaplar Developer Portal'da ELLE beyaz listeye  │
 * │ ekleniyor. Advetics'in havuz modeli (tek ajans kimliği, yüzlerce hesap) │
 * │ o katmanda çalışmıyor — sınırsız yazma için Standard katmanı gerekiyor  │
 * │ ve o başvuru VİDEO DEMO istiyor.                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * OKUMA tarafında böyle bir tavan yok: Development katmanı "yönettiğin
 * hesaplar" için sınırsız okuma veriyor. Bu yüzden ilk faz RAPORLAMA.
 */
@Injectable()
export class LinkedInProvider implements IAdPlatformProvider {
  readonly platform = 'linkedin' as const;

  private readonly logger = new Logger(LinkedInProvider.name);

  /**
   * ZORUNLU SCOPE'LAR.
   *
   * `r_ads` hesapları ve yapıyı, `r_ads_reporting` metrikleri açıyor. İkisi
   * olmadan panel boş kalır.
   *
   * DİKKAT: scope almak YETMİYOR. LinkedIn ayrıca yetkilendiren ÜYENİN o
   * reklam hesabında bir ROLÜ olmasını istiyor; rolü yoksa scope verilmiş
   * olsa bile hesap listede görünmüyor. Müşteri hesaplarına erişim LinkedIn
   * Business Manager partnerliğiyle veriliyor (Meta'nın partner erişiminin,
   * Google'ın MCC'sinin karşılığı).
   */
  readonly requiredScopes = ['r_ads', 'r_ads_reporting'] as const;

  /**
   * İSTEĞE BAĞLI SCOPE'LAR — olmadan da okuma çalışıyor.
   *
   * `rw_ads` yazma yolunu açıyor. Ayrı tutulmasının sebebi Meta'dakiyle aynı
   * değil (LinkedIn ikisini tek onayla veriyor) ama sonuç aynı: yazma yolu
   * canlıda hiç denenmediği için, o scope eksik diye bağlantıyı BOZUK
   * göstermek yanlış olurdu — okuma tarafı pekâlâ çalışıyor.
   */
  readonly optionalScopes = ['rw_ads', 'r_organization_social'] as const;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  isConfigured(): boolean {
    const { clientId, clientSecret } = this.config.platforms.linkedin;
    return Boolean(clientId && clientSecret);
  }

  // ---------------------------------------------------------------------------
  // OAUTH — doğrulanmış uçlar, canlıda henüz koşmadı
  // ---------------------------------------------------------------------------

  buildAuthorizeUrl({ state, redirectUri }: AuthorizeUrlParams): string {
    const { clientId } = this.config.platforms.linkedin;
    if (!clientId) {
      throw new PlatformApiError('linkedin', 'permanent', 'LINKEDIN_CLIENT_ID tanımlı değil.');
    }

    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    /*
     * SCOPE'LAR BOŞLUKLA ayrılıyor (Meta virgül kullanıyor). İsteğe bağlı
     * olanları da gönderiyoruz: LinkedIn onaylanmamış bir scope istendiğinde
     * TÜM isteği reddediyor, ama bu uygulamaya atanmış scope'lar listesi
     * onaydan sonra sabit — yani burada istediğimiz şey uygulamanın zaten
     * sahip olduğu şey.
     */
    url.searchParams.set('scope', [...this.requiredScopes, ...this.optionalScopes].join(' '));
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    return this.tokenIste({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
  }

  /**
   * ═══ REFRESH — VE YILDA BİR KESİN ÖLÜM ═══
   *
   * LinkedIn'in token rejimi hem Meta'dan hem Google'dan farklı:
   *
   *   · access token  → 60 gün (konsolda "2 months / 5184000 seconds")
   *   · refresh token → 365 gün, ve YENİLEMEYLE UZAMIYOR
   *
   * İkinci satır kritik. Google'da refresh token süresiz, Meta'da uzun ömürlü
   * token takasla tazeleniyor. LinkedIn'de refresh token'ın ömrü ilk
   * yetkilendirmede başlıyor ve her yenilemede AYNI kalıyor — yani bağlantı
   * bir yıl sonra, hiçbir şey bozulmadan, kesin olarak ölüyor ve ÜYENİN
   * yeniden yetkilendirmesi gerekiyor.
   *
   * Belirtisi bu projenin en sevmediği türden: senkronizasyon durur, panelde
   * hiçbir şey yazmaz, kullanıcı "veri gelmiyor" der. Bağlantı ajansa ait ve
   * TEK olduğu için bütün müşteriler aynı anda susar.
   *
   * ŞU AN EKSİK OLAN: `platform_connections` tablosunda refresh token'ın
   * BİTİŞ tarihini tutacak bir kolon yok — yalnızca access token'ınki var.
   * O kolon eklenmeden bu ölüm önceden haber verilemez. Ayrı bir iş olarak
   * duruyor ve onay gelmeden önce yazılmalı.
   */
  async refreshTokens(tokens: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      /*
       * SESSİZCE ESKİ TOKEN'I GERİ DÖNDÜRMÜYORUZ. Öyle yapmak "yenilendi"
       * diyip 60 gün sonra sebebi anlaşılamayan bir kesinti bırakırdı.
       *
       * Not: programatik refresh token LinkedIn'de HER uygulamada yok —
       * doküman "onaylı MDP partnerleri" diyor. Yoksa 60 günde bir insan
       * eliyle yeniden yetkilendirme gerekiyor ve bu, ürün için ayrı bir
       * karar. Onay geldiğinde İLK doğrulanacak şeylerden biri bu.
       */
      throw new PlatformApiError(
        'linkedin',
        'permanent',
        'LinkedIn refresh token yok — bağlantı yeniden yetkilendirilmeli. ' +
          'Programatik yenileme yalnızca onaylı MDP partnerlerinde çalışıyor.',
      );
    }

    return this.tokenIste({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    });
  }

  private async tokenIste(alanlar: Record<string, string>): Promise<OAuthTokens> {
    const { clientId, clientSecret } = this.config.platforms.linkedin;
    if (!clientId || !clientSecret) {
      throw new PlatformApiError(
        'linkedin',
        'permanent',
        'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET tanımlı değil.',
      );
    }

    const govde = new URLSearchParams({ ...alanlar, client_id: clientId, client_secret: clientSecret });

    const { data } = await platformFetch<{
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
      scope?: string;
    }>('linkedin', 'https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: govde.toString(),
    });

    if (!data.access_token) {
      throw new PlatformApiError(
        'linkedin',
        'permanent',
        'LinkedIn token yanıtı access_token taşımıyor.',
      );
    }

    /*
     * `externalUserId` ve `accountLabel` HENÜZ DOLDURULAMIYOR: ikisi de
     * yetkilendiren üyenin profilinden geliyor ve o çağrı (`/rest/me`) canlıda
     * doğrulanmadı. Boş string yazmak sessiz bir yalan olurdu — bağlantı
     * ekranında adsız bir satır belirir ve sebebi hiçbir yerde yazmaz.
     *
     * Bu yüzden token takası ŞU AN eksik: OAuth akışı onay geldikten sonra
     * `/rest/me` ile tamamlanacak. Buraya kadar olan kısım (istek biçimi,
     * scope ayracı, form-urlencoded gövde) dokümandan doğrulandı.
     */
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn token takası yazıldı ama üye kimliği çekimi (/rest/me) henüz yazılmadı — ' +
        'bağlantı adsız kaydedilemez.',
    );
  }

  /**
   * `LinkedIn-Version` başlığı ZORUNLU ve varsayılanı YOK.
   *
   * Eksikse istek hata döner, sürüm ömrünü doldurmuşsa HTTP 426 gelir.
   * Değer ortam değişkeninden geliyor ve TAKVİMDEN TÜRETİLMİYOR: LinkedIn'in
   * ARALIK SÜRÜMÜ YOK (…202510, 202511, sonra doğrudan 202601), yani aydan
   * sürüm üreten bir kod her Aralık bütün istekleri düşürürdü.
   */
  private basliklar(accessToken: string): Record<string, string> {
    return {
      authorization: `Bearer ${accessToken}`,
      'linkedin-version': this.config.platforms.linkedin.apiVersion,
      // Rest.li 2.0.0 çoğu uçta gerekli; eksikse istek sessizce farklı
      // yorumlanabiliyor.
      'x-restli-protocol-version': '2.0.0',
    };
  }

  // ---------------------------------------------------------------------------
  // AŞAĞISI HENÜZ YAZILMADI — ve sessizce boş dönmüyor
  // ---------------------------------------------------------------------------

  /*
   * Buradan aşağıdaki her metot AÇIK bir `PlatformApiError` fırlatıyor.
   * Google sağlayıcısındaki desenin aynısı ve sebebi aynı: boş dizi döndüren
   * bir metot çağırana "veri yok" der, oysa gerçek "kod yok"tur. Bu ayrım bu
   * depoda bir turu kaybettirdi.
   */

  async verifyToken(_accessToken: string): Promise<TokenVerification> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn token doğrulama henüz yazılmadı. Onay gelmeden canlı doğrulanamıyor.',
    );
  }

  async revokeToken(_tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn token iptali henüz yazılmadı.',
    );
  }

  /**
   * Ajans modelinin karşılığı BU UÇTA:
   * `GET /rest/adAccountUsers?q=authenticatedUser` yetkilendiren üyenin rol
   * sahibi olduğu BÜTÜN reklam hesaplarını döndürüyor — "bir kez yetkilendir,
   * hesaplar havuza düşsün" modeli LinkedIn'de kurulabiliyor.
   *
   * Henüz yazılmadı: yanıt biçimi canlıda görülmeden yazmak, kimlik biçimi
   * tuzağına (aynı API'de üç ayrı konvansiyon) düşmek demek.
   */
  async listAdAccounts(_accessToken: string): Promise<DiscoveredAdAccount[]> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn hesap keşfi henüz yazılmadı (adAccountUsers?q=authenticatedUser).',
    );
  }

  /**
   * LinkedIn'de "sosyal profil" karşılığı şirket sayfası (organization).
   * Auto-Boost yazılana kadar gerekmiyor; boş dizi DEĞİL, açık hata —
   * çağıran "sayfa yok" ile "kod yok"u ayırt edebilsin.
   */
  async listSocialProfiles(_accessToken: string): Promise<DiscoveredSocialProfile[]> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn şirket sayfası keşfi henüz yazılmadı.',
    );
  }

  async fetchStructure(_ctx: FetchContext, _since?: Date): Promise<PlatformStructure> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn yapı taraması henüz yazılmadı. ' +
        'SEVİYE EŞLEMESİ hazır: Campaign Group → campaign, Campaign → ad_group, Creative → ad.',
    );
  }

  /**
   * Raporlama — ilk fazın hedefi.
   *
   * Yazılırken UNUTULMAMASI GEREKEN: `adAnalytics` SAYFALAMA DESTEKLEMİYOR ve
   * yanıt 15.000 elemanla sınırlı. Meta'daki "hata görünce limiti yarıla"
   * refleksi burada işlemiyor çünkü ortada hata YOK — aşım büyük olasılıkla
   * sessiz kesme üretiyor. Tarih penceresini parçalamak ZORUNLU.
   *
   * İkinci tuzak: günlük seviyede her satıra ±3 gürültü ekleniyor (üyelerin
   * gizliliği için). Günlükleri toplayarak dönem toplamı üretmek Campaign
   * Manager'la uyuşmayan bir rakam veriyor ve fark hiçbir yerde yazmıyor.
   */
  async fetchInsights(_ctx: FetchContext, _request: InsightsRequest): Promise<PlatformInsights> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn metrik çekimi henüz yazılmadı (adAnalytics).',
    );
  }

  /**
   * KIRILIMLAR — ve burada bir ÜRÜN KARARI bekliyor.
   *
   * Advetics'in "Kitle Özeti" sayfası yaş ve cinsiyet halkaları çiziyor.
   * LinkedIn'in pivot listesinde YAŞ, CİNSİYET ve SAAT YOK; yerlerinde
   * şirket, sektör, ünvan, kıdem ve şirket büyüklüğü var — kırılım B2B.
   *
   * Yani LinkedIn kırılımları bugünkü `insight_breakdowns` boyutlarına
   * eşlenmiyor ve olduğu gibi bağlanırsa rapor sayfası her LinkedIn
   * raporunda "Kitle verisi henüz toplanmadı" yazar. O cümle YANLIŞ olur:
   * veri toplanmadığı için değil, o boyut platformda OLMADIĞI için boş.
   *
   * Karar verilmeden yazılmamalı.
   */
  async fetchBreakdowns(
    _ctx: FetchContext,
    _request: BreakdownRequest,
  ): Promise<PlatformBreakdowns> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn kırılımları henüz yazılmadı — pivot eşlemesi bir ürün kararı bekliyor ' +
        '(LinkedIn\'de yaş/cinsiyet pivotu YOK, karşılığı şirket/sektör/ünvan/kıdem).',
    );
  }

  async applyAction(
    _ctx: FetchContext,
    action: PlatformActionRequest,
  ): Promise<PlatformActionResult> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      `LinkedIn yazma işlemleri henüz yazılmadı (${action.type}).`,
    );
  }

  canWrite(_grantedScopes: readonly string[]): { ok: boolean; missing: string[] } {
    /*
     * SCOPE VAR OLSA BİLE `false`. LinkedIn `rw_ads`i okuma onayıyla BİRLİKTE
     * veriyor, yani token pekâlâ yazma yetkisi taşıyabilir — ama bizim yazma
     * KODUMUZ yok. `ok: true` döndürmek kural motoruna "burada aksiyon
     * uygulayabilirsin" demek olurdu ve her kural sessizce hata kaydederdi.
     */
    return { ok: false, missing: ['linkedin-yazma-yolu-yazilmadi'] };
  }

  async fetchOrganicPosts(): Promise<DiscoveredOrganicPost[]> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn organik gönderi çekimi henüz yazılmadı. ' +
        'NOT: LinkedIn\'de "yeni gönderi" webhook\'u YOK — tespit yoklamayla yapılmak zorunda.',
    );
  }

  async createBoost(): Promise<BoostResult> {
    throw new PlatformApiError('linkedin', 'permanent', 'LinkedIn boost henüz yazılmadı.');
  }

  async createVideoBoost(): Promise<never> {
    /*
     * YouTube video boost'unun LinkedIn'de karşılığı YOK — bu metot arayüzde
     * Google/YouTube yolu için duruyor. Yine de boş dönmüyor: çağıran bir gün
     * platformu ayırt etmeyi unutursa, sessiz bir "başarılı" yerine açık bir
     * hata görsün.
     */
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn\'de YouTube video boost karşılığı yok.',
    );
  }


  async getCampaignSummaries(
    _ctx: FetchContext,
    _campaignExternalIds: string[],
  ): Promise<Record<string, CampaignSummary>> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn kampanya özeti henüz yazılmadı.',
    );
  }

  async searchGeoLocations(): Promise<GeoLocationOption[]> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn lokasyon araması henüz yazılmadı.',
    );
  }

  async listSavedAudiences(): Promise<SavedAudienceOption[]> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn kayıtlı kitle listesi henüz yazılmadı.',
    );
  }

  async getSavedAudienceTargeting(): Promise<never> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn kayıtlı kitle hedeflemesi henüz yazılmadı.',
    );
  }

  async uploadAdImage(): Promise<never> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn görsel yükleme henüz yazılmadı. ' +
        'NOT: LinkedIn varlığı REKLAM HESABINA değil ORGANİZASYONA bağlı — Meta\'nın ' +
        'hesap başına `image_hash` kuralının tersi.',
    );
  }

  async publishDraft(_ctx: FetchContext, _req: PublishDraftRequest): Promise<PublishDraftResult> {
    throw new PlatformApiError('linkedin', 'permanent', 'LinkedIn taslak yayını henüz yazılmadı.');
  }

  async createLeadForm(): Promise<never> {
    throw new PlatformApiError('linkedin', 'permanent', 'LinkedIn form oluşturma henüz yazılmadı.');
  }

  async fetchLead(): Promise<never> {
    throw new PlatformApiError('linkedin', 'permanent', 'LinkedIn lead çekimi henüz yazılmadı.');
  }

  async fetchFormLeads(): Promise<never> {
    throw new PlatformApiError('linkedin', 'permanent', 'LinkedIn form leadleri henüz yazılmadı.');
  }

  /**
   * Anahtar kelime ve arama terimi GOOGLE'A ÖZGÜ kavramlar.
   *
   * LinkedIn'de karşılığı yok ve olmayacak — bu iki metot boş dizi döndürüyor,
   * hata DEĞİL. Ayrım kasıtlı: "bu platformda böyle bir şey yok" ile "kod
   * yazılmadı" farklı iki durum ve çağıran ikisine farklı davranıyor.
   */
  async fetchKeywords(): Promise<{ rows: DiscoveredKeywordRow[]; apiCalls: number }> {
    return { rows: [], apiCalls: 0 };
  }

  async fetchSearchTerms(): Promise<{ rows: DiscoveredSearchTermRow[]; apiCalls: number }> {
    return { rows: [], apiCalls: 0 };
  }

  async createAd(): Promise<CreateAdResult> {
    throw new PlatformApiError(
      'linkedin',
      'permanent',
      'LinkedIn toplu reklam oluşturma henüz yazılmadı.',
    );
  }
}
