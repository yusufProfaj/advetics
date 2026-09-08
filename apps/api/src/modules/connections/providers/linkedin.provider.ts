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
  type DiscoveredInsightRow,
  type InsightsLevel,
  type DiscoveredAd,
  type DiscoveredAdGroup,
  type DiscoveredCampaign,
  type DiscoveredCreative,
  type NormalizedAccountStatus,
  type NormalizedEntityStatus,
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
import { linkedinTutarMicros } from '@advetics/shared';
/*
 * DÖNGÜYÜ KIRAN IMPORT. Bu satır bir süre `queue/insights-sync.service`i
 * gösteriyordu ve ÜRETİMİ DÜŞÜRDÜ: o servis `provider.registry`yi, o da bu
 * dosyayı import ediyor. Nest açılışta bağımlılığı çözemedi.
 *
 * `istek-pencereleri.ts` hiçbir Nest sağlayıcısı tanımıyor ve hiçbirini
 * import etmiyor — döngüye giremez.
 */
import { istekPencereleri } from '../../../queue/istek-pencereleri';

/** Versiyonlu REST tabanı. `/v2/` eski, versiyonsuz uçlar için. */
const LINKEDIN_API = 'https://api.linkedin.com/rest';

/**
 * SEVİYE → PIVOT. Yapı taramasındaki eşlemenin AYNISI ve tek yerde.
 *
 * Campaign Group → `campaign`, Campaign → `ad_group`, Creative → `ad`.
 * İkisi ayrı yazılsaydı ve biri kaysaydı metrikler hiçbir satıra bağlanamaz,
 * iş `succeeded` + `rows = 0` dönerdi — bu depoda adı konmuş bir hata türü.
 */
const LINKEDIN_PIVOT: Partial<Record<InsightsLevel, string>> = {
  campaign: 'CAMPAIGN_GROUP',
  ad_group: 'CAMPAIGN',
  ad: 'CREATIVE',
};

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
  readonly requiredScopes = ['r_ads', 'r_ads_reporting', 'r_basicprofile'] as const;

  /*
   * `r_basicprofile` NEDEN ZORUNLU LİSTEDE:
   *
   * Bağlantının ADI ve `externalUserId`si `/rest/me`den geliyor ve o uç bu
   * scope olmadan 403 `ACCESS_DENIED: partnerApiMe.GET` dönüyor — 2026-09-08
   * ölçüm turunda birebir görüldü (LinkedIn'in kendi token üreticisi bu
   * scope'u vermiyor ve ölçüm tam orada durdu).
   *
   * Scope uygulamaya ATANMIŞ durumda (konsolun OAuth scopes listesinde var),
   * yani yetkilendirme adresinde istenebiliyor. İstenmezse bağlantı ADSIZ
   * kaydedilmek zorunda kalır ve panelde hangi hesabın bağlandığı görünmez.
   */

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
     * KİMLİK AYNI TURDA ÇEKİLİYOR — sonraya bırakılmıyor.
     *
     * `externalUserId` bağlantının tekil anahtarının parçası
     * (`orgId + platform + externalUserId`) ve `accountLabel` panelde
     * görünen ad. İkisi de `/rest/me`den geliyor. Boş bırakmak, bağlantı
     * ekranında adsız bir satır ve ikinci bir yetkilendirmede çakışan bir
     * anahtar demekti.
     */
    const uye = await this.uyeKimligi(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      /*
       * ÖLÇÜLDÜ: `expires_in` SANİYE ve 5.183.999 geldi (= 60 gün), konsolun
       * "2 months (5184000 seconds)" yazısıyla birebir.
       */
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      grantedScopes: data.scope ? data.scope.split(/[\s,]+/).filter(Boolean) : [],
      externalUserId: uye.id,
      accountLabel: uye.ad,
    };
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
  // ORTAK İSTEK KATMANI
  // ---------------------------------------------------------------------------

  /**
   * Versiyonlu REST çağrısı.
   *
   * ÜÇ BAŞLIK DA ZORUNLU ve ikisi ölçülerek doğrulandı (2026-09-08):
   *   · `LinkedIn-Version` YOKSA → HTTP 400
   *   · Ölü sürüm (örn. `202512`) → HTTP 426
   * `202512` gerçekten 426 döndü: LinkedIn'in ARALIK SÜRÜMÜ YOK
   * (…202510, 202511, sonra doğrudan 202601). Takvim ayından sürüm üreten bir
   * kod her Aralık BÜTÜN istekleri düşürürdü; değer sabit ve elle yönetiliyor.
   */
  private async cagir<T>(
    accessToken: string,
    yol: string,
    ctx?: Pick<FetchContext, 'onRateLimit'>,
  ): Promise<T> {
    const { data } = await platformFetch<T>(
      'linkedin',
      `${LINKEDIN_API}${yol}`,
      { headers: this.basliklar(accessToken) },
      (h) => {
        /*
         * LinkedIn kalan kotayı bildiren bir başlık DOKÜMANTE ETMİYOR ve
         * ölçümde de görülmedi. Kota bekçisine yalan söylememek için hiçbir
         * anlık görüntü üretilmiyor — uydurulmuş bir yüzde, gerçek bir
         * daralmayı gizlerdi.
         */
        void h;
        return undefined;
      },
    );
    void ctx;
    return data;
  }

  /**
   * `urn:li:sponsoredCreative:915033233` → `915033233`.
   *
   * AYNI API'DE İKİ KİMLİK KONVANSİYONU VAR ve ölçümle görüldü: kampanya ve
   * kampanya grubu `id` alanını SAYI olarak veriyor, kreatif ise TAM URN
   * olarak. İkisini aynı kolona ham yazmak, `ad` satırlarını kreatiflere
   * bağlayan eşleştirmeyi sessizce bozardı.
   *
   * Dış kimlik her seviyede SAYI olarak saklanıyor; URN gereken yerde
   * `urn()` ile yeniden kuruluyor.
   */
  private sayisal(deger: string | number): string {
    const s = String(deger);
    const i = s.lastIndexOf(':');
    return i === -1 ? s : s.slice(i + 1);
  }

  /** LinkedIn'in `(start:(year:Y,month:M,day:D),end:(...))` biçimi. */
  private tarihAraligi(from: string, to: string): string {
    const p = (t: string): string => {
      const [y, a, g] = t.split('-');
      // Ay ve gün BAŞINDAKİ SIFIRSIZ yazılıyor: `month:09` Rest.li'de
      // ayrıştırma hatası veriyor.
      return `(year:${Number(y)},month:${Number(a)},day:${Number(g)})`;
    };
    return `dateRange=(start:${p(from)},end:${p(to)})`;
  }

  private hesapDurumu(ham: string | undefined): NormalizedAccountStatus {
    switch (ham) {
      case 'ACTIVE':
        return 'active';
      case 'DRAFT':
      case 'PENDING_DELETION':
        return 'paused';
      case 'CANCELED':
      case 'REMOVED':
        return 'closed';
      default:
        return 'unknown';
    }
  }

  /**
   * Varlık durumu.
   *
   * `intendedStatus` KULLANICININ İSTEĞİ, `servingHoldReasons` ise platformun
   * gerçekte ne yaptığı. Ölçümde bir kreatif `intendedStatus: "PAUSED"` ve
   * `servingHoldReasons: ["STOPPED","CAMPAIGN_GROUP_STATUS_HOLD"]` ile geldi.
   * Yalnızca isteği okumak, "aktif" görünen ama YAYINLANMAYAN satırlar
   * üretirdi — bu depoda adı konmuş bir hata türü.
   */
  private varlikDurumu(
    ham: string | undefined,
    tutulmaSebepleri?: readonly string[],
  ): NormalizedEntityStatus {
    if (tutulmaSebepleri && tutulmaSebepleri.length > 0) return 'paused';
    switch (ham) {
      case 'ACTIVE':
        return 'active';
      case 'PAUSED':
        return 'paused';
      case 'ARCHIVED':
      case 'CANCELED':
        return 'ended';
      case 'DRAFT':
        return 'pending_review';
      case 'REMOVED':
        return 'deleted';
      default:
        return 'unknown';
    }
  }

  /** Yetkilendiren üyenin kimliği ve görünen adı. */
  private async uyeKimligi(accessToken: string): Promise<{ id: string; ad: string }> {
    const me = await this.cagir<{
      id?: string;
      localizedFirstName?: string;
      localizedLastName?: string;
    }>(accessToken, '/me');

    if (!me.id) {
      throw new PlatformApiError(
        'linkedin',
        'permanent',
        'LinkedIn /me kimlik döndürmedi — `r_basicprofile` scope\'u verilmemiş olabilir.',
      );
    }
    const ad = [me.localizedFirstName, me.localizedLastName].filter(Boolean).join(' ').trim();
    return { id: me.id, ad: ad === '' ? `LinkedIn (${me.id})` : ad };
  }

  // ---------------------------------------------------------------------------
  // KEŞİF
  // ---------------------------------------------------------------------------

  /**
   * Yetkilendiren üyenin eriştiği reklam hesapları.
   *
   * ┌─ NEDEN `adAccounts?q=search`, `adAccountUsers` DEĞİL ─────────────────┐
   * │ İkisi de "hesaplarım" diyor ve FARKLI sayı veriyor. 2026-09-08        │
   * │ ölçümü: `adAccountUsers` DOKUZ satır, `adAccounts?q=search` YEDİ.     │
   * │ Fazladan gelen ikisi (513078368, 513079337) doğrudan çekilince 404    │
   * │ veriyor — silinmiş hesapların artık kalmış ilişki satırları.          │
   * │                                                                       │
   * │ `adAccountUsers` kullanılsaydı o iki hayalet hesap havuza düşer,      │
   * │ detay çekiminde 404 alır ve her senkronizasyonda hata üretirdi. Bu    │
   * │ depoda "sessizce atla" yasak olduğu için gürültü kalıcı olurdu.       │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * ÖLÇÜLDÜ — 5 HESAP SINIRI OKUMAYI KAPSAMIYOR: Developer Portal'daki beyaz
   * listede 5 hesap varken bu uç 7 hesap döndürdü. Sınır yalnızca YAZMA için.
   * Havuz modeli (tek ajans kimliği, çok hesap) LinkedIn'de çalışıyor.
   */
  async listAdAccounts(accessToken: string): Promise<DiscoveredAdAccount[]> {
    const sonuc: DiscoveredAdAccount[] = [];
    let start = 0;
    const SAYFA = 100;

    for (;;) {
      const y = await this.cagir<{
        elements?: Array<{
          id: number | string;
          name?: string;
          currency?: string;
          status?: string;
          reference?: string;
          test?: boolean;
        }>;
      }>(accessToken, `/adAccounts?q=search&start=${start}&count=${SAYFA}`);

      const parca = y.elements ?? [];
      for (const h of parca) {
        sonuc.push({
          externalId: this.sayisal(h.id),
          name: h.name ?? `LinkedIn ${this.sayisal(h.id)}`,
          currency: h.currency ?? 'USD',
          /*
           * SAAT DİLİMİ HESAPTA YOK — ölçülen tam alan listesinde böyle bir
           * alan geçmiyor. LinkedIn `adAnalytics` tarihleri UTC olduğu için
           * karşılığı UTC. Ajansın yerel saatini yazmak, her günlük metriği
           * saatlerce kaydırır ve "dünün rakamı tutmuyor" hâlini üretirdi.
           */
          timezone: 'UTC',
          status: this.hesapDurumu(h.status),
          /*
           * `reference` hesabın bağlı olduğu ORGANİZASYON URN'i
           * (`urn:li:organization:78316165`). Meta'nın Business Manager
           * kimliğinin karşılığı ve kreatif görseli yüklerken gerekiyor —
           * LinkedIn'de varlık hesaba değil ORGANİZASYONA bağlı.
           */
          managerExternalId: h.reference ? this.sayisal(h.reference) : undefined,
          raw: h,
        });
      }

      if (parca.length < SAYFA) break;
      start += SAYFA;
    }

    return sonuc;
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

  /**
   * Token gerçekten kullanılabilir mi.
   *
   * `introspectToken` KULLANILMIYOR ve bu bilinçli. 2026-09-08 ölçümünde o uç
   * bir REFRESH token'a da `active: true, auth_type: 3L` dedi; aynı token
   * `Authorization: Bearer` olarak 401 `INVALID_ACCESS_TOKEN` aldı. Yani
   * "aktif" ile "bearer olarak kullanılabilir" AYNI ŞEY DEĞİL ve introspection
   * ile doğrulamak çalışmayan bir bağlantıyı sağlıklı gösterirdi.
   *
   * Gerçek doğrulama gerçek bir çağrı: `/me` çalışıyorsa token çalışıyor.
   */
  async verifyToken(accessToken: string): Promise<TokenVerification> {
    try {
      const uye = await this.uyeKimligi(accessToken);
      return { valid: true, externalUserId: uye.id, grantedScopes: [] };
    } catch (e) {
      /*
       * `TokenVerification` bir SEBEP alanı taşımıyor; hata log'a düşüyor ve
       * `valid: false` dönüyor. Sessizce `true` dönmek, çalışmayan bir
       * bağlantıyı panelde sağlıklı gösterirdi.
       */
      this.logger.warn(
        `LinkedIn token doğrulanamadı: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { valid: false };
    }
  }

  /**
   * Token'ı PLATFORM TARAFINDA iptal eder.
   *
   * Kendi kaydımızı silmek YETMİYOR: token LinkedIn'de geçerli kalır ve
   * gizlilik politikamız bağlantı kaldırıldığında erişimin DURDUĞUNU beyan
   * ediyor. Arayüzün sözleşmesi gereği başarısızlık bağlantının
   * kaldırılmasını ENGELLEMİYOR — iptal en iyi çaba, kaydı silmek kesin.
   *
   * REFRESH TOKEN DE İPTAL EDİLİYOR ve bu LinkedIn'e özgü bir zorunluluk:
   * access token 60 gün, refresh token 365 gün yaşıyor (ölçüldü). Yalnızca
   * access token'ı iptal etmek, bir yıl boyunca yeni access token üretebilen
   * bir refresh token'ı ayakta bırakırdı — "erişim durdu" beyanının tam
   * tersi.
   */
  async revokeToken(tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    const { clientId, clientSecret } = this.config.platforms.linkedin;
    if (!clientId || !clientSecret) return;

    for (const token of [tokens.accessToken, tokens.refreshToken]) {
      if (!token) continue;
      try {
        await platformFetch('linkedin', 'https://www.linkedin.com/oauth/v2/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token,
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
        });
      } catch (e) {
        /*
         * YUTULUYOR AMA SESSİZ DEĞİL. Token zaten geçersiz olabilir ya da
         * LinkedIn erişilemez olabilir; ikisi de bağlantıyı kaldırmayı
         * engellememeli. Ama log'suz yutmak, "erişim durdu" beyanının
         * doğrulanamaz olması demekti.
         */
        this.logger.warn(
          `LinkedIn token iptali başarısız: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
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

  /**
   * ═══ YAPI TARAMASI — SEVİYE EŞLEMESİ BURADA UYGULANIYOR ═══
   *
   * LinkedIn dört seviyeli: Account → Campaign Group → Campaign → Creative.
   * Advetics üç: campaign → ad_group → ad.
   *
   *   Campaign Group → `campaign`    (kapsayıcı; hedefleme YOK, bütçe YOK)
   *   Campaign       → `ad_group`    (hedefleme + bütçe + teklif)
   *   Creative       → `ad` + `creative`
   *
   * EŞLEME İSME DEĞİL ALANLARA DAYANIYOR ve 2026-09-08'de canlı veriyle
   * KANITLANDI. Ölçülen Campaign nesnesi: `targetingCriteria`, `dailyBudget`
   * ({"currencyCode":"TRY","amount":"320"}), `unitCost` ("645.33"),
   * `costType: CPM`, `optimizationTargetType` ve bir `campaignGroup`
   * referansı. Ölçülen Campaign Group ise yalnızca `account, name, status,
   * runSchedule, buyingType` — hedefleme yok, bütçe yok.
   *
   * Yani LinkedIn Campaign, Meta'nın ad set'idir. İsme bakarak eşlemek
   * (LinkedIn Campaign → bizim `campaign`) DÖRT SEVİYEYİ ÜÇE sıkıştırır,
   * `ad` seviyesi hiç dolmaz ve metrikler kampanya satırlarına bağlanamaz —
   * hiçbir hata düşmeden.
   *
   * DELTA YOK: `since` şu an KULLANILMIYOR ve `complete: true` dönüyor.
   * LinkedIn'in `q=search` filtresinde güvenilir bir "şu tarihten sonra
   * değişenler" ölçütü canlıda doğrulanmadı; yarım bir delta, dönmeyen
   * varlığı "silinmiş" sandırıp gerçek satırları uçurur. Tam tarama pahalı
   * ama DOĞRU. Delta, ölçülüp doğrulandığında eklenecek.
   */
  async fetchStructure(ctx: FetchContext, since?: Date): Promise<PlatformStructure> {
    void since;
    const hesap = ctx.accountExternalId;
    let apiCalls = 0;
    const notlar: string[] = [];

    // ── 1) Campaign Group → bizim `campaign`
    const gruplar = await this.cagir<{
      elements?: Array<{
        id: number | string;
        name?: string;
        status?: string;
        runSchedule?: { start?: number; end?: number };
        servingStatuses?: string[];
      }>;
    }>(ctx.accessToken, `/adAccounts/${hesap}/adCampaignGroups?q=search&start=0&count=500`);
    apiCalls++;

    const campaigns: DiscoveredCampaign[] = (gruplar.elements ?? []).map((g) => ({
      externalId: this.sayisal(g.id),
      name: g.name ?? `Kampanya Grubu ${this.sayisal(g.id)}`,
      status: this.varlikDurumu(g.status),
      effectiveStatus: g.servingStatuses?.join(',') ?? g.status,
      /*
       * KAMPANYA GRUBU BÜTÇE TAŞIMIYOR. `budgetMode: 'none'` yazmak, "bütçe
       * sıfır" ile "bu seviyede bütçe kavramı yok"u ayırıyor — sıfır yazmak
       * bütçe bekçisine harcanabilir tavanın bittiğini söylerdi.
       */
      budgetMode: 'none',
      startTime: g.runSchedule?.start ? new Date(g.runSchedule.start) : undefined,
      stopTime: g.runSchedule?.end ? new Date(g.runSchedule.end) : undefined,
      raw: g,
    }));

    // ── 2) Campaign → bizim `ad_group`
    const kampanyalar = await this.cagir<{
      elements?: Array<{
        id: number | string;
        name?: string;
        status?: string;
        campaignGroup?: string;
        dailyBudget?: { amount?: string; currencyCode?: string };
        totalBudget?: { amount?: string; currencyCode?: string };
        unitCost?: { amount?: string; currencyCode?: string };
        costType?: string;
        optimizationTargetType?: string;
        targetingCriteria?: unknown;
        runSchedule?: { start?: number; end?: number };
        servingStatuses?: string[];
      }>;
    }>(ctx.accessToken, `/adAccounts/${hesap}/adCampaigns?q=search&start=0&count=500`);
    apiCalls++;

    const adGroups: DiscoveredAdGroup[] = [];
    for (const k of kampanyalar.elements ?? []) {
      if (!k.campaignGroup) {
        /*
         * GRUPSUZ KAMPANYA SESSİZCE ATILMIYOR. Üst katman `ad_group`u
         * `campaign`a bağlıyor; bağı olmayan satır yazılamaz. Atmak, o
         * kampanyanın metriklerini rapordan sessizce düşürmek olurdu.
         */
        notlar.push(`kampanya ${this.sayisal(k.id)} bir kampanya grubuna bağlı değil — atlandı`);
        continue;
      }
      adGroups.push({
        externalId: this.sayisal(k.id),
        name: k.name ?? `Kampanya ${this.sayisal(k.id)}`,
        status: this.varlikDurumu(k.status),
        effectiveStatus: k.servingStatuses?.join(',') ?? k.status,
        campaignExternalId: this.sayisal(k.campaignGroup),
        budgetMode: k.dailyBudget ? 'daily' : k.totalBudget ? 'lifetime' : 'none',
        /*
         * PARA ONDALIK STRING GELİYOR ("320", "645.33") ve micros'a TAM SAYI
         * aritmetiğiyle çevriliyor. Ölçümde `adAnalytics` maliyeti ON SEKİZ
         * ondalıkla geldi ("539.700000000000192784"); `parseFloat` orada
         * kuruş kaydırıyor ve `BigInt()` sonucu reddediyor.
         */
        budgetAmountMicros: this.tutar(k.dailyBudget?.amount ?? k.totalBudget?.amount),
        bidAmountMicros: this.tutar(k.unitCost?.amount),
        optimizationGoal: k.optimizationTargetType ?? k.costType,
        targeting: k.targetingCriteria,
        startTime: k.runSchedule?.start ? new Date(k.runSchedule.start) : undefined,
        stopTime: k.runSchedule?.end ? new Date(k.runSchedule.end) : undefined,
        raw: k,
      });
    }

    // ── 3) Creative → bizim `ad` + `creative`
    const ads: DiscoveredAd[] = [];
    const creatives: DiscoveredCreative[] = [];
    let start = 0;
    const SAYFA = 100;
    for (;;) {
      /*
       * `q=criteria` — `q=search` DEĞİL. Ölçüldü: `q=search` bu uçta
       * HTTP 404 "No virtual resource found" veriyor. Aynı API'de kampanya
       * `q=search`, kreatif `q=criteria` istiyor.
       */
      const kr = await this.cagir<{
        elements?: Array<{
          id: string;
          campaign?: string;
          name?: string;
          intendedStatus?: string;
          servingHoldReasons?: string[];
          isServing?: boolean;
          content?: { reference?: string };
        }>;
      }>(ctx.accessToken, `/adAccounts/${hesap}/creatives?q=criteria&start=${start}&count=${SAYFA}`);
      apiCalls++;

      const parca = kr.elements ?? [];
      for (const c of parca) {
        /*
         * KREATİF `id`si TAM URN GELİYOR (`urn:li:sponsoredCreative:915033233`)
         * ama kampanya `id`si SAYI. Ölçülen fark; ham yazmak `ad` satırlarını
         * kreatiflere bağlayan eşleştirmeyi sessizce bozardı.
         */
        const kimlik = this.sayisal(c.id);
        if (!c.campaign) {
          notlar.push(`kreatif ${kimlik} bir kampanyaya bağlı değil — atlandı`);
          continue;
        }
        ads.push({
          externalId: kimlik,
          name: c.name ?? `Reklam ${kimlik}`,
          status: this.varlikDurumu(c.intendedStatus, c.servingHoldReasons),
          /*
           * `servingHoldReasons` PLATFORMUN GERÇEKTE NE YAPTIĞI, `intendedStatus`
           * kullanıcının isteği. Ölçümde bir kreatif "PAUSED" + ["STOPPED",
           * "CAMPAIGN_GROUP_STATUS_HOLD"] ile geldi. Sebepler saklanıyor:
           * "neden yayında değil" sorusunun tek cevabı bunlar.
           */
          effectiveStatus: c.servingHoldReasons?.join(',') ?? c.intendedStatus,
          adGroupExternalId: this.sayisal(c.campaign),
          creativeExternalId: kimlik,
          disapprovalReasons: c.servingHoldReasons,
          raw: c,
        });
        creatives.push({
          externalId: kimlik,
          /*
           * İÇERİK BİR REFERANS: `content.reference` bir gönderi URN'i
           * (`urn:li:share:...`). Başlık/metin/görsel ORADA ve ayrı bir
           * çağrı istiyor. Uydurulmuş bir başlık yazmaktansa boş bırakılıyor —
           * rapor "metin yok" der ve bu DOĞRU.
           */
          /*
           * `as DiscoveredCreative` CAST'İ YOK ve bu bilinçli: cast eksik alan
           * denetimini tamamen kapatıyor ve bu depoda `rapor-plani.service.
           * spec.ts` mock'ları tam o yüzden çalışma anında patladı. Alan
           * eklendiğinde derleme BURADA kırılsın.
           */
          creativeType: c.content?.reference?.split(':')[2],
          raw: c,
        });
      }
      if (parca.length < SAYFA) break;
      start += SAYFA;
    }

    return { campaigns, adGroups, ads, creatives, complete: true, apiCalls, notes: notlar };
  }

  /** Ondalık string → micros. Boş/eksik alan `undefined` kalıyor, 0 DEĞİL. */
  private tutar(deger: string | undefined): bigint | undefined {
    if (deger === undefined || deger === null || deger === '') return undefined;
    return linkedinTutarMicros(deger);
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
  /**
   * ═══ GÜNLÜK METRİKLER ═══
   *
   * `adAnalytics?q=analytics&timeGranularity=DAILY`. Üç pivot da ölçülerek
   * doğrulandı (2026-09-08): CAMPAIGN_GROUP, CAMPAIGN ve CREATIVE, üçü de
   * gün gün satır döndürüyor ve `dateRange` her satırda geliyor.
   *
   * PIVOT EŞLEMESİ SEVİYE EŞLEMESİNİN AYNISI ve ayrı yazılmamalı: yapı
   * taraması `ad_group`u LinkedIn Campaign'den üretiyorsa, metrik de
   * CAMPAIGN pivotundan gelmek ZORUNDA. İkisi ayrışırsa metrikler hiçbir
   * satıra bağlanamaz ve iş `succeeded` + `rows = 0` döner — bu depoda adı
   * konmuş bir hata türü.
   *
   * ┌─ SAYFALAMA YOK, 15.000 ELEMAN TAVANI VAR ─────────────────────────────┐
   * │ Meta'daki "hata görünce limiti yarıla" refleksi burada İŞLEMİYOR:      │
   * │ ortada hata yok. Doküman aşımda ne olduğunu söylemiyor ve ölçümde de   │
   * │ tetiklenemedi — yani SESSİZ KESME ihtimali açık. Tek savunma tarih     │
   * │ penceresini parçalamak.                                                │
   * │                                                                        │
   * │ Parçalama Meta ile AYNI fonksiyondan (`istekPencereleri`): derin       │
   * │ seviyeler 15 günlük dilimler, sığ seviyeler tek istek. İkinci bir      │
   * │ parçalayıcı yazmak, bir günlük boşluk (sessiz eksik veri) ya da bir    │
   * │ günlük örtüşme (boşa çağrı) demekti.                                   │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * HER PARÇA HEMEN DÖNÜYOR: sonda toplu birleştirmek, doksan günlük bir
   * çekimin son adımdaki bir hatayla tamamen boşa gitmesi demekti.
   */
  async fetchInsights(ctx: FetchContext, request: InsightsRequest): Promise<PlatformInsights> {
    const pivot = LINKEDIN_PIVOT[request.level];
    if (!pivot) {
      throw new PlatformApiError(
        'linkedin',
        'permanent',
        `LinkedIn'de ${request.level} seviyesinin karşılığı yok.`,
      );
    }

    const rows: DiscoveredInsightRow[] = [];
    let apiCalls = 0;
    let complete = true;

    /*
     * ALANLAR AÇIKÇA İSTENİYOR. Doküman "otherwise only impressions and
     * clicks are returned by default" diyor — istemezsek harcama sessizce
     * gelmez ve rapor sıfır harcama gösterir.
     *
     * `conversionValueInLocalCurrency` ÖLÇÜMDE İSTENDİ AMA GELMEDİ: yedi alan
     * istendi, altı döndü ve eksik olan buydu — hata yok, uyarı yok. O yüzden
     * `conversionValueMicros` her zaman 0 ve ROAS LinkedIn'de hesaplanmıyor.
     * Uydurulmuş bir gelir, yanlış bir ROAS'tan beter olurdu.
     */
    const alanlar =
      'fields=impressions,clicks,costInLocalCurrency,externalWebsiteConversions,oneClickLeads,dateRange,pivotValues';

    for (const pencere of istekPencereleri(request.level, request.dateFrom, request.dateTo)) {
      const yol =
        `/adAnalytics?q=analytics&pivot=${pivot}&timeGranularity=DAILY` +
        `&accounts=List(urn%3Ali%3AsponsoredAccount%3A${ctx.accountExternalId})` +
        `&${this.tarihAraligi(pencere.from, pencere.to)}&${alanlar}`;

      const y = await this.cagir<{
        elements?: Array<{
          impressions?: number;
          clicks?: number;
          costInLocalCurrency?: string;
          externalWebsiteConversions?: number;
          oneClickLeads?: number;
          pivotValues?: string[];
          dateRange?: { start?: { year: number; month: number; day: number } };
        }>;
      }>(ctx.accessToken, yol);
      apiCalls++;

      const parca = y.elements ?? [];

      /*
       * TAVANA DEĞDİYSEK SÖYLÜYORUZ. 15.000 elemanlık yanıt kesilmiş OLABİLİR
       * ve LinkedIn bunu bildirmiyor. `complete: false` silinme tespitini
       * kapatıyor — eksik veriyi "silinmiş" sanmaktansa taramayı kısmi saymak
       * doğru davranış.
       */
      if (parca.length >= 15_000) complete = false;

      for (const e of parca) {
        const kimlik = e.pivotValues?.[0];
        const g = e.dateRange?.start;
        if (!kimlik || !g) {
          /*
           * KİMLİKSİZ YA DA TARİHSİZ SATIR YAZILAMAZ. Atlanıyor ama tarama
           * KISMİ işaretleniyor: sessizce düşürmek, harcamanın bir kısmını
           * rapordan kaybettirirdi.
           */
          complete = false;
          continue;
        }
        const tarih = `${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`;
        rows.push({
          entityExternalId: this.sayisal(kimlik),
          level: request.level,
          date: tarih,
          currency: '',
          impressions: e.impressions ?? 0,
          clicks: e.clicks ?? 0,
          spendMicros: this.tutar(e.costInLocalCurrency) ?? 0n,
          /*
           * DÖNÜŞÜM İKİ KAYNAKTAN TOPLANIYOR: site dönüşümü ve tek tıkla
           * gelen form (Lead Gen). LinkedIn'de ikisi AYRI alan ve yalnızca
           * birini saymak B2B raporunda dönüşümlerin yarısını kaybettirir.
           */
          conversions: (e.externalWebsiteConversions ?? 0) + (e.oneClickLeads ?? 0),
          conversionValueMicros: 0n,
          videoViews: 0,
          engagements: 0,
          reach: 0,
          raw: e,
        });
      }
    }

    return { rows, apiCalls, complete };
  }

  /**
   * KIRILIMLAR — İKİ KARAR VERİLDİ, KOD HÂLÂ YAZILMADI.
   *
   * Advetics'in "Kitle Özeti" sayfası yaş ve cinsiyet halkaları çiziyor.
   * LinkedIn'in pivot listesinde YAŞ, CİNSİYET ve SAAT YOK; yerlerinde
   * şirket, sektör, ünvan, kıdem ve şirket büyüklüğü var — kırılım B2B.
   *
   * ┌─ KARAR 1: KİTLE ÖZETİ LINKEDIN İÇİN ÇİZİLMİYOR (2026-09-07) ────────┐
   * │ Sayfa çizilseydi her LinkedIn raporunda "Kitle verisi henüz          │
   * │ toplanmadı" yazacaktı ve o cümle YALAN olurdu: veri toplanmadığı     │
   * │ için değil, boyut platformda OLMADIĞI için boş.                      │
   * │ Uygulaması: `kitleBolumuKarari` (`packages/shared`).                 │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ KARAR 2: COĞRAFİ KIRILIMDA URN SAKLA, ÇÖZÜLMÜŞ ADI SAKLAMA ────────┐
   * │ BU KOD YAZILDIĞINDA BAĞLAYICI. `insight_breakdowns.value` alanına    │
   * │ `urn:li:geo:...` yazılacak; Geo API'den gelen "İstanbul" dizesi      │
   * │ HİÇBİR YERE yazılmayacak — ne kolona, ne önbelleğe, ne log'a. Ad     │
   * │ rapor üretilirken çözülüyor.                                         │
   * │                                                                       │
   * │ Gerekçe HUKUKİ BİR YORUM, "doküman öyle diyor" DEĞİL: saklama tablosu │
   * │ Bing kaynaklı lokasyon verisini saklamayı yasaklıyor ama yasağın ham  │
   * │ URN + sayıyı kapsayıp kapsamadığını AYIRMIYOR. Belirsizlikte dar      │
   * │ tarafta duruyoruz. Ayrıntı: `linkedin-saklama.ts`.                    │
   * │                                                                       │
   * │ Bedeli: coğrafi kırılımı olan rapor AĞA BAĞIMLI oluyor. Çözüm         │
   * │ başarısız olabilir ve SESSİZ OLMAMALI — satır atılmıyor, URN          │
   * │ gösteriliyor (`linkedinGeoEtiketi`).                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * AYRICA YAZILMASI GEREKEN: raporlama verisi en fazla BİR YIL saklanabiliyor
   * (`LINKEDIN_RAPOR_SAKLAMA_GUN`) ve Advetics metrikleri süresiz tutuyor.
   * Bu satırları silen süpürme henüz yok; ilk veri akmadan ÖNCE yazılmalı.
   * İhlalin hiçbir teknik belirtisi yok — bedeli API erişiminin kaybı.
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
