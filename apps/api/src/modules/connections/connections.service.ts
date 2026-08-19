import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Platform as PrismaPlatform, type Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type {
  AdAccountSummary,
  ConnectionSummary,
  GeoLocationOption,
  Platform,
  ProviderAvailability,
  SavedAudienceList,
  SocialProfileSummary,
  TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistry } from './provider.registry';
import { decideConnectionOwnership } from './connection-ownership';
import {
  PlatformApiError,
  type FetchContext,
  type IAdPlatformProvider,
} from './provider.types';
import { TokenVaultService } from './token-vault.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** OAuth state ömrü. Kısa tutuluyor: bu pencere bir CSRF fırsat penceresidir. */
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly vault: TokenVaultService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistry,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private provider(platform: Platform): IAdPlatformProvider {
    return this.registry.get(platform);
  }

  /** OAuth callback adresi. Meta/Google konsolunda BİREBİR kayıtlı olmalı. */
  private redirectUri(platform: Platform): string {
    const base = this.config.platforms.oauthRedirectBaseUrl;
    if (!base) {
      throw new BadRequestException(
        'OAUTH_REDIRECT_BASE_URL tanımlı değil. Üretimde https://advetics.com olmalı.',
      );
    }
    return `${base.replace(/\/$/, '')}/${this.config.globalPrefix}/connections/${platform}/callback`;
  }

  // ---------------------------------------------------------------------------
  // Yapılandırma durumu
  // ---------------------------------------------------------------------------

  availability(): ProviderAvailability[] {
    const { meta, google, oauthRedirectBaseUrl } = this.config.platforms;

    const metaMissing: string[] = [];
    if (!meta.appId) metaMissing.push('META_APP_ID');
    if (!meta.appSecret) metaMissing.push('META_APP_SECRET');
    if (!oauthRedirectBaseUrl) metaMissing.push('OAUTH_REDIRECT_BASE_URL');

    const googleMissing: string[] = [];
    if (!google.clientId) googleMissing.push('GOOGLE_CLIENT_ID');
    if (!google.clientSecret) googleMissing.push('GOOGLE_CLIENT_SECRET');
    if (!google.developerToken) googleMissing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
    if (!oauthRedirectBaseUrl) googleMissing.push('OAUTH_REDIRECT_BASE_URL');

    return [
      {
        platform: 'meta',
        configured: metaMissing.length === 0,
        missingConfig: metaMissing,
        requiredScopes: [...this.provider('meta').requiredScopes],
        optionalScopes: [...this.provider('meta').optionalScopes],
      },
      {
        platform: 'google',
        configured: googleMissing.length === 0,
        missingConfig: googleMissing,
        requiredScopes: [...this.provider('google').requiredScopes],
        optionalScopes: [...this.provider('google').optionalScopes],
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Listeleme
  // ---------------------------------------------------------------------------

  /**
   * Bağlantılar — ORGANİZASYON GENELİ.
   *
   * Bağlantı ajansa ait; müşteri seçimi artık ön koşul DEĞİL. Eskiden seçim
   * zorunluydu ve "önce bir müşteri seçin" hatası veriyordu; o model aynı Meta
   * kimliğini müşteri başına yeniden yetkilendirmeyi gerektiriyor ve
   * bağlantıları koparıyordu.
   *
   * `clientId` verilirse REKLAM HESAPLARI VE SOSYAL PROFİLLER o müşteriye
   * daraltılır — bağlantılar değil. Kurallar, formlar ve toplu oluşturucu
   * ekranları bu uç noktayı tam olarak bunun için çağırıyor: "bu müşterinin
   * hesapları". Bağlantıyı da süzseydik, ajans bağlantısı altındaki atanmış
   * hesaplar o ekranlarda kaybolurdu.
   *
   * SOSYAL PROFİL SÜZGECİ ŞART. Eskiden bağlantının kendisi müşteriye aitti,
   * dolayısıyla altındaki sayfalar da örtük olarak o müşteriye aitti. Bağlantı
   * org geneline çıkınca bu örtük daraltma kayboldu: `kutuphane/formlar`
   * ekranı, süzgeç olmadan başka müşterilerin Facebook sayfalarını listelerdi.
   */
  async list(ctx: TenantContext, clientId: string | null): Promise<ConnectionSummary[]> {
    if (clientId && !ctx.clientIds.includes(clientId)) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    /**
     * KAPSAM İSTEĞE GÖRE KURULUYOR, OTURUMDAKİ SEÇİME GÖRE DEĞİL.
     *
     * `app.can_access_client()` panelde seçili müşteriye daraltıyor ve bu
     * daraltma iki yerde birden yanlış sonuç üretiyordu:
     *
     *   · Parametresiz çağrı (Platform Bağlantıları ekranı) — bir müşteri
     *     seçiliyken HAVUZ dışındaki her şey düşerdi, yani atama ekranı
     *     hesapların bir kısmını hiç göstermezdi.
     *   · Açık `?clientId=X` çağrısı, oturumda BAŞKA bir müşteri seçiliyken —
     *     RLS X'in satırlarını gizler ve ekran boş bir hesap listesi gösterir.
     *     Kurallar ekranı adres çubuğundan gelen müşteriyle çalışıyor ve bu
     *     ikisi rahatlıkla farklı olabiliyor.
     *
     * İkisinin de cevabı aynı: kapsamı İSTEĞİN kendisi belirlesin. Erişim
     * yetkisi zaten yukarıda `ctx.clientIds` ile doğrulandı; buradaki değer
     * yalnızca görünümü daraltıyor, genişletmiyor.
     */
    const scoped: TenantContext = { ...ctx, activeClientId: clientId };

    return this.prisma.withTenant(scoped, async (tx) => {
      const rows = await tx.platformConnection.findMany({
        where: { status: { not: 'revoked' } },
        orderBy: { createdAt: 'asc' },
        include: {
          adAccounts: {
            where: clientId ? { clientId } : undefined,
            orderBy: { name: 'asc' },
            include: { client: { select: { name: true } } },
          },
          socialProfiles: {
            where: clientId ? { clientId } : undefined,
            orderBy: { name: 'asc' },
            include: { client: { select: { name: true } } },
          },
        },
      });

      return rows.map((c) => this.toSummary(c));
    });
  }

  /**
   * Şifreli token kolonları BU FONKSİYONDAN GEÇMEZ.
   *
   * `accessTokenEnc` / `refreshTokenEnc` hiçbir API yanıtında yer almaz;
   * yalnızca TokenVaultService içinde çözülür. Yeni bir alan eklerken bu
   * kuralın korunduğunu kontrol et.
   */
  private toSummary(
    c: Prisma.PlatformConnectionGetPayload<{
      include: {
        adAccounts: { include: { client: { select: { name: true } } } };
        socialProfiles: { include: { client: { select: { name: true } } } };
      };
    }>,
  ): ConnectionSummary {
    const prov = this.provider(c.platform as Platform);
    const missingScopes = prov.requiredScopes.filter((s) => !c.grantedScopes.includes(s));
    const missingOptionalScopes = prov.optionalScopes.filter(
      (s) => !c.grantedScopes.includes(s),
    );

    return {
      id: c.id,
      platform: c.platform as Platform,
      accountLabel: c.accountLabel,
      status: c.status,
      missingScopes,
      missingOptionalScopes,
      tokenExpiresAt: c.tokenExpiresAt?.toISOString() ?? null,
      lastVerifiedAt: c.lastVerifiedAt?.toISOString() ?? null,
      lastErrorCode: c.lastErrorCode,
      connectedAt: c.createdAt.toISOString(),
      adAccounts: c.adAccounts.map(
        (a): AdAccountSummary => ({
          id: a.id,
          platform: a.platform as Platform,
          externalId: a.externalId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          status: a.status,
          syncEnabled: a.syncEnabled,
          isManager: a.managerExternalId === a.externalId,
          lastInsightsSyncAt: a.lastInsightsSyncAt?.toISOString() ?? null,
          // ATAMA BİLGİSİ YANITTA. Havuzda 157 hesap varken "bu hesap kimin"
          // sorusunun cevabı ekranda görünmezse atama ekranı kullanılamaz.
          clientId: a.clientId,
          clientName: a.client?.name ?? null,
        }),
      ),
      socialProfiles: c.socialProfiles.map(
        (p): SocialProfileSummary => ({
          id: p.id,
          profileType: p.profileType,
          externalId: p.externalId,
          name: p.name,
          username: p.username,
          pictureUrl: p.pictureUrl,
          linkedAdAccountId: p.linkedAdAccountId,
          syncEnabled: p.syncEnabled,
          clientId: p.clientId,
          clientName: p.client?.name ?? null,
        }),
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // OAuth başlatma
  // ---------------------------------------------------------------------------

  /**
   * İKİ MODEL: workspace bazlı bağlantı ya da ajans havuzu.
   *
   * `clientId` VERİLİRSE bağlantı o workspace'e kurulur ve keşfedilen bütün
   * reklam hesapları/sayfalar doğrudan ona yazılır — havuz adımı yok.
   * VERİLMEZSE eski davranış: bağlantı ajansa kurulur, hesaplar havuza düşer
   * ve `assignAdAccount` ile müşteriye atanır.
   *
   * NEDEN İKİSİ BİRDEN: ajansın bugün havuzda duran bağlantısı ve ona bağlı
   * 157 hesabı çalışmaya devam etmek zorunda. Havuz yolunu kaldırmak,
   * üretimde yayında olan boost'ların hesaplarını kopartırdı.
   *
   * WORKSPACE BAZLI MODELİN KOŞULU: her workspace KENDİ platform hesabıyla
   * bağlanmalı. Aynı Meta kimliği bir organizasyonda tek satır
   * (`orgId_platform_externalUserId`) ve platform her yeni yetkilendirmede
   * öncekinin token'ını geçersiz kılıyor — aynı hesabı ikinci bir
   * workspace'e bağlamak `persistConnection` içinde REDDEDİLİYOR.
   */
  async startOAuth(
    ctx: TenantContext,
    platform: Platform,
    opts: { redirectTo?: string; forceReconsent?: boolean; clientId?: string },
    meta: Meta,
  ): Promise<{ authorizeUrl: string }> {
    const provider = this.provider(platform);
    if (!provider.isConfigured()) {
      const missing = this.availability().find((a) => a.platform === platform)?.missingConfig ?? [];
      throw new BadRequestException(
        `${platform} yapılandırılmamış. Eksik: ${missing.join(', ')}`,
      );
    }

    /*
     * HEDEF WORKSPACE ERİŞİM LİSTESİNE KARŞI DOĞRULANIYOR.
     *
     * RLS zaten reddederdi (`adv_oauth_states_insert` → `can_access_client`)
     * ama oradan gelen hata ham bir politika ihlali olur ve sebebi
     * anlaşılmaz. Burada durdurmak, kullanıcıya ne olduğunu söylüyor.
     */
    if (opts.clientId && !ctx.clientIds.includes(opts.clientId)) {
      throw new BadRequestException('Bu workspace için yetkin yok.');
    }

    // State: rastgele token, veritabanında yalnızca SHA-256 hash'i saklanır.
    // Tek kullanımlık olması `consumedAt` ile garanti edilir — imzalı bir
    // token tekrar sunulabilirdi.
    const rawState = randomBytes(32).toString('base64url');

    await this.prisma.withTenant(ctx, (tx) =>
      tx.oAuthState.create({
        data: {
          orgId: ctx.orgId,
          // NULL = ajans havuzu, dolu = o workspace'e kurulan bağlantı.
          // Geri dönüşte bu değer bağlantıya, oradan keşfedilen bütün
          // hesap ve sayfalara akıyor.
          clientId: opts.clientId ?? null,
          platform: platform as PrismaPlatform,
          tokenHash: this.hash(rawState),
          redirectTo: opts.redirectTo ?? null,
          requestedScopes: [...provider.requiredScopes],
          createdByUserId: ctx.userId,
          expiresAt: new Date(Date.now() + STATE_TTL_MS),
          ip: meta.ip ?? null,
        },
      }),
    );

    return {
      authorizeUrl: provider.buildAuthorizeUrl({
        state: rawState,
        redirectUri: this.redirectUri(platform),
        forceReconsent: opts.forceReconsent,
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // OAuth callback
  // ---------------------------------------------------------------------------

  /**
   * Platformdan dönüş.
   *
   * Kimlik doğrulaması YOKTUR ve olamaz: kullanıcı Meta/Google'dan üst düzey bir
   * GET yönlendirmesiyle döner ve access token o sırada dolmuş olabilir. Yetki
   * kaynağı `state` satırıdır — kim, hangi müşteri için, ne zaman başlattı.
   * Bu yüzden PrismaAdminService kullanılıyor.
   */
  async handleCallback(
    platform: Platform,
    params: {
      code?: string;
      state?: string;
      error?: string;
      errorDescription?: string;
      errorCode?: string;
      errorMessage?: string;
    },
    meta: Meta,
  ): Promise<{ redirectPath: string }> {
    // Platform hatası standart VEYA standart dışı isimlerle gelebilir.
    const platformError = params.error ?? params.errorCode;
    const platformErrorText = params.errorDescription ?? params.errorMessage;

    // State yoksa panele okunabilir bir mesajla dönüyoruz. Ham 400 fırlatmak,
    // kullanıcıyı JSON hata sayfasında bırakıyordu — hangi ayarın eksik
    // olduğunu anlamasının hiçbir yolu yoktu.
    if (!params.state) {
      const reason = platformError
        ? describePlatformOAuthError(platform, platformError, platformErrorText)
        : 'Yetkilendirme yanıtı eksik döndü (state parametresi yok).';
      this.logger.warn(`OAuth callback state'siz döndü: ${platformError ?? 'bilinmiyor'} — ${reason}`);
      return {
        redirectPath: `/ayarlar/baglantilar?connection=hata&platform=${platform}&mesaj=${encodeURIComponent(reason)}`,
      };
    }

    const state = await this.admin.oAuthState.findUnique({
      where: { tokenHash: this.hash(params.state) },
    });

    if (!state) throw new BadRequestException('Geçersiz veya bilinmeyen state');
    if (state.consumedAt) throw new BadRequestException('Bu yetkilendirme bağlantısı zaten kullanıldı');
    if (state.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Yetkilendirme süresi doldu, tekrar deneyin');
    }
    if (state.platform !== platform) {
      throw new BadRequestException('State platformla uyuşmuyor');
    }

    // Tek kullanımlık: başarısız olsa bile tüketiyoruz. Aksi halde aynı state
    // ile tekrar denenebilir ve CSRF penceresi açık kalır.
    await this.admin.oAuthState.update({
      where: { id: state.id },
      data: { consumedAt: new Date() },
    });

    const backTo = state.redirectTo ?? '/ayarlar/baglantilar';

    // Platform hata döndürdüyse: kullanıcı izni reddetti VEYA yapılandırma hatası.
    if (platformError) {
      const declined = platformError === 'access_denied';
      await this.audit.recordUnauthenticated(state.orgId, {
        action: declined ? 'connection.oauth_declined' : 'connection.oauth_failed',
        targetType: 'platform',
        targetId: platform,
        clientId: state.clientId,
        actorId: state.createdByUserId,
        after: { error: platformError, description: platformErrorText },
        ...meta,
      });

      if (declined) {
        return { redirectPath: `${backTo}?connection=iptal&platform=${platform}` };
      }

      const reason = describePlatformOAuthError(platform, platformError, platformErrorText);
      this.logger.error(`OAuth başarısız (${platform}): ${platformError} — ${platformErrorText ?? ''}`);
      return {
        redirectPath: `${backTo}?connection=hata&platform=${platform}&mesaj=${encodeURIComponent(reason)}`,
      };
    }

    if (!params.code) {
      return {
        redirectPath: `${backTo}?connection=hata&platform=${platform}&mesaj=${encodeURIComponent(
          'Yetkilendirme kodu dönmedi. Platform izin ekranını tamamlamadan geri dönülmüş olabilir.',
        )}`,
      };
    }

    const provider = this.provider(platform);

    try {
      const tokens = await provider.exchangeCode(params.code, this.redirectUri(platform));

      const missing = provider.requiredScopes.filter((s) => !tokens.grantedScopes.includes(s));
      const connectionId = await this.persistConnection(
        state.orgId,
        state.clientId,
        state.createdByUserId,
        platform,
        tokens,
      );

      // Hesap keşfi bağlantıyı bozmamalı: token kaydedildi, kullanıcı zaten
      // bağlandı. Keşif başarısız olursa sonradan "Hesapları yenile" ile
      // tekrar denenebilir.
      let discovered = { adAccounts: 0, socialProfiles: 0 };
      try {
        discovered = await this.discoverAndStore(connectionId, platform, tokens.accessToken);
      } catch (err) {
        this.logger.warn(
          `Hesap keşfi başarısız (bağlantı ${connectionId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      await this.audit.recordUnauthenticated(state.orgId, {
        action: 'connection.created',
        targetType: 'platform_connection',
        targetId: connectionId,
        clientId: state.clientId,
        actorId: state.createdByUserId,
        after: {
          platform,
          accountLabel: tokens.accountLabel,
          grantedScopes: tokens.grantedScopes,
          missingScopes: missing,
          ...discovered,
        },
        ...meta,
      });

      const q = new URLSearchParams({
        connection: missing.length ? 'eksik_izin' : 'basarili',
        platform,
        hesap: String(discovered.adAccounts),
      });
      return { redirectPath: `${backTo}?${q.toString()}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`OAuth callback başarısız (${platform}): ${message}`);

      await this.audit.recordUnauthenticated(state.orgId, {
        action: 'connection.oauth_failed',
        targetType: 'platform',
        targetId: platform,
        clientId: state.clientId,
        actorId: state.createdByUserId,
        after: {
          platform,
          kind: err instanceof PlatformApiError ? err.kind : 'unknown',
          message: message.slice(0, 500),
        },
        ...meta,
      });

      const q = new URLSearchParams({
        connection: 'hata',
        platform,
        mesaj: message.slice(0, 200),
      });
      return { redirectPath: `${backTo}?${q.toString()}` };
    }
  }

  /**
   * Bağlantıyı kaydeder. Aynı platform hesabı yeniden bağlanırsa GÜNCELLENİR —
   * yeni satır açmak, aynı reklam hesabının iki bağlantı altında görünmesine ve
   * çift senkronizasyona yol açardı.
   *
   * TEKİLLİK ARTIK ORGANİZASYON BAZINDA. Eskiden `[clientId, platform,
   * externalUserId]` idi ve ajansın TEK Meta kimliği her müşteri için ayrı bir
   * satır açıyordu; Meta ise her yeni yetkilendirmede öncekinin token'ını
   * geçersiz kılıyordu, yani bir müşteriye bağlanmak diğerinin bağlantısını
   * KOPARIYORDU. Aynı kimlik artık organizasyonda tek satır: ikinci
   * yetkilendirme aynı satırı tazeliyor.
   */
  private async persistConnection(
    orgId: string,
    clientId: string | null,
    userId: string,
    platform: Platform,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      grantedScopes: string[];
      externalUserId: string;
      accountLabel: string;
    },
  ): Promise<string> {
    /*
     * ═══ SAHİPLİK DEĞİŞTİRİLEMEZ — SESSİZ YANLIŞ WORKSPACE'İN ÖNÜ ═══
     *
     * Aşağıdaki `upsert`'ün `update` dalı `clientId`'ye DOKUNMUYOR (ve
     * dokunmamalı: token tazelemesi sahipliği değiştirmemeli). Ama bu, kontrol
     * edilmezse şu sessiz hatayı üretiyordu:
     *
     *   1. Meta hesabı X, "Ege Birlik Yapı" workspace'ine bağlanır.
     *   2. Kullanıcı "Fenbay"ı seçip AYNI Meta hesabıyla yetkilendirir.
     *   3. Tekillik `orgId_platform_externalUserId` üzerinde: aynı satır
     *      bulunur, `update` koşar, token tazelenir — ama `client_id` HÂLÂ
     *      Ege'dir.
     *   4. `discoverAndStore` bağlantının `clientId`'sini okuyor: Fenbay için
     *      keşfedilen bütün hesaplar EGE'YE yazılır.
     *
     * Ekran "bağlandı" der, kullanıcı Fenbay'a bağladığını sanır, hesaplar
     * başka workspace'te görünür. Hata yok, log yok.
     *
     * NULL → workspace geçişi de reddediliyor: bugün havuzda duran bağlantının
     * altında 157 hesap var ve çoğu BAŞKA müşterilere ait. Onu tek bir
     * workspace'e işaretlemek, sonraki keşiflerin hepsini o workspace'e
     * yazdırırdı.
     */
    const mevcut = await this.admin.platformConnection.findUnique({
      where: {
        orgId_platform_externalUserId: {
          orgId,
          platform: platform as PrismaPlatform,
          externalUserId: tokens.externalUserId,
        },
      },
      select: { clientId: true, client: { select: { name: true } } },
    });

    const sahiplik = decideConnectionOwnership({
      platform,
      // `undefined` = satır YOK (ilk bağlantı), `null` = var ve havuzda.
      // İkisini ayırmak şart: ilki serbest, ikincisi reddediliyor.
      existingClientId: mevcut ? mevcut.clientId : undefined,
      existingClientName: mevcut?.client?.name ?? null,
      requestedClientId: clientId,
    });
    if (!sahiplik.ok) throw new BadRequestException(sahiplik.message);

    const access = this.vault.encrypt(tokens.accessToken);
    const refresh = tokens.refreshToken ? this.vault.encrypt(tokens.refreshToken) : null;

    const saved = await this.admin.platformConnection.upsert({
      where: {
        orgId_platform_externalUserId: {
          orgId,
          platform: platform as PrismaPlatform,
          externalUserId: tokens.externalUserId,
        },
      },
      create: {
        orgId,
        clientId,
        platform: platform as PrismaPlatform,
        externalUserId: tokens.externalUserId,
        accountLabel: tokens.accountLabel,
        accessTokenEnc: access.data,
        refreshTokenEnc: refresh?.data ?? null,
        keyVersion: access.keyVersion,
        tokenExpiresAt: tokens.expiresAt ?? null,
        grantedScopes: tokens.grantedScopes,
        status: 'active',
        lastVerifiedAt: new Date(),
        connectedByUserId: userId,
      },
      update: {
        accountLabel: tokens.accountLabel,
        accessTokenEnc: access.data,
        // Google yenileme yanıtında refresh token göndermez; mevcut olanı
        // null ile ezmek bağlantıyı kurtarılamaz hale getirir.
        ...(refresh ? { refreshTokenEnc: refresh.data } : {}),
        keyVersion: access.keyVersion,
        tokenExpiresAt: tokens.expiresAt ?? null,
        grantedScopes: tokens.grantedScopes,
        status: 'active',
        failureCount: 0,
        lastErrorCode: null,
        lastErrorAt: null,
        lastVerifiedAt: new Date(),
        revokedAt: null,
      },
      select: { id: true },
    });

    return saved.id;
  }

  /**
   * Reklam hesaplarını ve sosyal profilleri keşfeder.
   *
   * KRİTİK: keşfedilen hesaplar `syncEnabled: false` ile kaydedilir. 40 hesaplı
   * bir Business Manager'ı bağlayan biri istemeden 40 hesabın API kotasını
   * yakmasın — hangi hesapların izleneceğini kullanıcı açıkça seçer.
   */
  private async discoverAndStore(
    connectionId: string,
    platform: Platform,
    accessToken: string,
  ): Promise<{ adAccounts: number; socialProfiles: number }> {
    const provider = this.provider(platform);
    const conn = await this.admin.platformConnection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { orgId: true, clientId: true },
    });

    const accounts = await provider.listAdAccounts(accessToken);
    for (const a of accounts) {
      await this.admin.adAccount.upsert({
        where: {
          // ORGANİZASYON BAZLI. Müşteri bazlıyken ajansın 157 hesabı her
          // müşteriye ayrı ayrı yazılıyordu ve üretimde 1.134 mükerrer satır
          // birikti — bir müşterinin hesabı diğerinin altında listeleniyordu.
          platform_externalId_orgId: {
            platform: platform as PrismaPlatform,
            externalId: a.externalId,
            orgId: conn.orgId,
          },
        },
        create: {
          orgId: conn.orgId,
          // Bağlantı ajans geneliyse hesap HAVUZA düşer (client_id NULL) ve
          // müşteriye ayrıca atanır.
          clientId: conn.clientId,
          connectionId,
          platform: platform as PrismaPlatform,
          externalId: a.externalId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          status: a.status,
          managerExternalId: a.managerExternalId ?? null,
          syncEnabled: false,
          raw: a.raw as Prisma.InputJsonValue,
        },
        update: {
          // syncEnabled ve clientId KASITLI olarak güncellenmiyor —
          // kullanıcının seçimi ve yaptığı müşteri ATAMASI her hesap
          // yenilemesinde sıfırlanmamalı. Sıfırlansaydı "Hesapları yenile"
          // düğmesi bütün atamaları sessizce havuza geri döndürürdü.
          connectionId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          status: a.status,
          managerExternalId: a.managerExternalId ?? null,
          raw: a.raw as Prisma.InputJsonValue,
        },
      });
    }

    let socialCount = 0;
    if (platform === 'meta') {
      const profiles = await provider.listSocialProfiles(accessToken);

      for (const p of profiles) {
        const pageToken = p.pageAccessToken ? this.vault.encrypt(p.pageAccessToken) : null;
        await this.admin.socialProfile.upsert({
          // ORGANİZASYON BAZLI, bağlantı bazlı DEĞİL. İkinci bir Meta kimliği
          // bağlandığında aynı Facebook sayfası iki bağlantının da altında
          // görünüyor; bağlantı bazlı anahtar aynı sayfa için ikinci bir satır
          // açardı ve Auto-Boost hangisini kullanacağını bilemezdi.
          where: { orgId_externalId: { orgId: conn.orgId, externalId: p.externalId } },
          create: {
            orgId: conn.orgId,
            // Bağlantı ajans geneliyse sayfa da HAVUZA düşer, müşteriye
            // ayrıca atanır.
            clientId: conn.clientId,
            connectionId,
            profileType: p.profileType,
            externalId: p.externalId,
            name: p.name,
            username: p.username ?? null,
            pictureUrl: p.pictureUrl ?? null,
            parentPageExternalId: p.parentPageExternalId ?? null,
            pageAccessTokenEnc: pageToken?.data ?? null,
            keyVersion: pageToken?.keyVersion ?? 1,
            syncEnabled: false,
            raw: p.raw as Prisma.InputJsonValue,
          },
          update: {
            // `clientId` ve `syncEnabled` KASITLI olarak güncellenmiyor:
            // "Hesapları yenile" düğmesi yapılmış atamaları ve izleme
            // seçimlerini sessizce sıfırlamamalı. `connectionId` güncelleniyor
            // çünkü sayfa ikinci bir kimlikle yeniden keşfedilmiş olabilir ve
            // sayfa token'ı o bağlantıdan geliyor.
            connectionId,
            name: p.name,
            username: p.username ?? null,
            pictureUrl: p.pictureUrl ?? null,
            /**
             * ANA SAYFA GÜNCELLENİYOR — atama ve izleme gibi korunmuyor.
             *
             * Bu bir kullanıcı tercihi değil, platformdan okunan gerçek.
             * Üstelik korunması AKTİF ZARAR verirdi: kolon bu satırlar
             * keşfedildikten sonra eklendi, yani üretimdeki Instagram
             * satırlarının hepsinde NULL. Güncellenmeseydi "Hesapları yenile"
             * onları hiç doldurmazdı ve tek doldurma yolu satırları silmek
             * olurdu — atamalarla birlikte.
             */
            parentPageExternalId: p.parentPageExternalId ?? null,
            ...(pageToken
              ? { pageAccessTokenEnc: pageToken.data, keyVersion: pageToken.keyVersion }
              : {}),
            raw: p.raw as Prisma.InputJsonValue,
          },
        });
        socialCount++;
      }
    }

    return { adAccounts: accounts.length, socialProfiles: socialCount };
  }

  // ---------------------------------------------------------------------------
  // Yönetim
  // ---------------------------------------------------------------------------

  /** Hesap listesini platformdan yeniden çeker. Kullanıcı seçimleri korunur. */
  async refreshAccounts(ctx: TenantContext, connectionId: string, meta: Meta) {
    const conn = await this.prisma.withTenant(ctx, (tx) =>
      tx.platformConnection.findUnique({
        where: { id: connectionId },
        select: { id: true, platform: true, clientId: true },
      }),
    );
    if (!conn) throw new NotFoundException('Bağlantı bulunamadı');

    const platform = conn.platform as Platform;
    const provider = this.provider(platform);

    try {
      const token = await this.vault.getAccessToken(conn.id, provider);
      const result = await this.discoverAndStore(conn.id, platform, token);
      await this.vault.recordSuccess(conn.id);

      await this.prisma.withTenant(ctx, (tx) =>
        this.audit.record(tx, ctx, {
          action: 'connection.accounts_refreshed',
          targetType: 'platform_connection',
          targetId: conn.id,
          clientId: conn.clientId,
          after: result,
          ...meta,
        }),
      );

      return result;
    } catch (err) {
      await this.vault.recordFailure(conn.id, err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Hedefleme aramaları — platformdan okunuyor, saklanmıyor
  // ---------------------------------------------------------------------------

  /**
   * Coğrafi hedefleme araması — şehir/il/ülke.
   *
   * REKLAM HESABI ÜZERİNDEN SORULUYOR, org geneli bir token üzerinden değil.
   * Sebebi yetkilendirme: hesap kullanıcının erişebildiği bir hesap olmak
   * zorunda ve bunu RLS zaten söylüyor. Org'un herhangi bir Meta token'ını
   * kullanmak, müşteri düzeyindeki bir kullanıcıya ajansın bütün
   * bağlantılarını dolaylı olarak açardı.
   */
  async searchGeoLocations(
    ctx: TenantContext,
    adAccountId: string,
    query: string,
  ): Promise<GeoLocationOption[]> {
    const { provider, fetchCtx } = await this.lookupContext(ctx, adAccountId);
    return provider.searchGeoLocations(fetchCtx, query);
  }

  /**
   * Reklam hesabında kurulu kayıtlı kitleler.
   *
   * BOŞ LİSTE GEÇERLİ BİR CEVAP ve hata değil: ajans Ads Manager'da hiç kitle
   * kurmamış olabilir. Ekranın bunu "kayıtlı kitle bulunamadı" diye yazması
   * gerekiyor — boş bir açılır liste, kullanıcıya kendi kurulumunda bir şey
   * eksik olduğunu düşündürür (K16).
   */
  async listSavedAudiences(
    ctx: TenantContext,
    adAccountId: string,
  ): Promise<SavedAudienceList> {
    const { provider, fetchCtx } = await this.lookupContext(ctx, adAccountId);
    const items = await provider.listSavedAudiences(fetchCtx);
    return { items, total: items.length };
  }

  /**
   * Reklam hesabından sağlayıcı + token bağlamı kurar.
   *
   * ATANMAMIŞ HESAP REDDEDİLİYOR. Havuzdaki bir hesap üzerinden hedefleme
   * araması yapmak teknik olarak çalışırdı, ama o hesabın hangi müşterinin
   * kampanyasında kullanılacağı belli değil — ve elle boost ekranı zaten
   * atanmış bir hesapla çalışıyor. Erken hata, `assertAssigned()` ile aynı
   * gerekçe.
   */
  private async lookupContext(
    ctx: TenantContext,
    adAccountId: string,
  ): Promise<{ provider: IAdPlatformProvider; fetchCtx: FetchContext }> {
    const account = await this.prisma.withTenant(ctx, (tx) =>
      tx.adAccount.findUnique({
        where: { id: adAccountId },
        select: {
          id: true,
          clientId: true,
          platform: true,
          externalId: true,
          connectionId: true,
          managerExternalId: true,
        },
      }),
    );
    if (!account) throw new NotFoundException('Reklam hesabı bulunamadı');
    if (account.clientId === null) {
      throw new BadRequestException(
        'Bu reklam hesabı henüz bir müşteriye atanmamış. Platform Bağlantıları ' +
          'ekranından ata.',
      );
    }

    const provider = this.provider(account.platform as Platform);
    const accessToken = await this.vault.getAccessToken(account.connectionId, provider);

    return {
      provider,
      fetchCtx: {
        accessToken,
        accountExternalId: account.externalId,
        loginCustomerId: account.managerExternalId ?? undefined,
      },
    };
  }

  /** Token'ı platforma karşı doğrular. Sağlık göstergesini tazeler. */
  async verify(ctx: TenantContext, connectionId: string) {
    const conn = await this.prisma.withTenant(ctx, (tx) =>
      tx.platformConnection.findUnique({
        where: { id: connectionId },
        select: { id: true, platform: true },
      }),
    );
    if (!conn) throw new NotFoundException('Bağlantı bulunamadı');

    const provider = this.provider(conn.platform as Platform);
    try {
      const token = await this.vault.getAccessToken(conn.id, provider);
      const result = await provider.verifyToken(token);
      if (result.valid) await this.vault.recordSuccess(conn.id);
      else await this.vault.recordFailure(conn.id, new PlatformApiError(conn.platform as Platform, 'invalid_token', 'Token geçersiz'));
      return result;
    } catch (err) {
      await this.vault.recordFailure(conn.id, err);
      throw err;
    }
  }

  async setAccountSync(
    ctx: TenantContext,
    adAccountId: string,
    syncEnabled: boolean,
    meta: Meta,
  ) {
    // SAYFANINKİYLE AYNI GEREKÇE: Müşteriler ekranı bütün müşterilerin
    // kartlarını gösteriyor ve seçili olmayan bir müşterinin hesabını
    // izlemeye almak, oturumdaki daraltma yüzünden "bulunamadı" ile düşüyordu.
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    return this.prisma.withTenant(scoped, async (tx) => {
      const before = await tx.adAccount.findUnique({ where: { id: adAccountId } });
      if (!before) throw new NotFoundException('Reklam hesabı bulunamadı');

      /**
       * ATANMAMIŞ HESAP İZLEMEYE ALINAMAZ — DOĞRULAMA BURADA, KULLANIM ANINDA
       * DEĞİL.
       *
       * İzin verseydik: süpürme işi bu hesabı `client_id` süzgecinde eler,
       * kullanıcı ise ekranda "izleniyor" görür. Hiçbir hata çıkmaz, hiçbir
       * veri gelmez. Kullanıcı yanlış yeri arar — token'ı, kotayı, platform
       * ayarlarını.
       */
      if (before.clientId === null && syncEnabled) {
        throw new BadRequestException(
          `"${before.name}" henüz bir müşteriye atanmamış. Önce hesabı bir ` +
            `müşteriye atayın; atanmamış hesap senkronize edilmez.`,
        );
      }

      const after = await tx.adAccount.update({
        where: { id: adAccountId },
        data: { syncEnabled },
      });

      await this.audit.record(tx, ctx, {
        action: syncEnabled ? 'ad_account.sync_enabled' : 'ad_account.sync_disabled',
        targetType: 'ad_account',
        targetId: adAccountId,
        clientId: before.clientId,
        before: { syncEnabled: before.syncEnabled },
        after: { syncEnabled: after.syncEnabled, name: after.name },
        ...meta,
      });

      return { id: after.id, syncEnabled: after.syncEnabled };
    });
  }

  /**
   * SAYFANIN organik gönderi senkronizasyonunu aç/kapat.
   *
   * NEDEN SONRADAN EKLENDİ VE NEDEN ÖNEMLİ: ajans geneli havuz modeline
   * geçilirken (§0.2–0.3) reklam hesaplarına yazılan izleme anahtarı
   * sayfalara YAZILMAMIŞTI. Sonucu ölçüldü: üretimde 199 sosyal profilin
   * hepsi `sync_enabled = false` ve o alanı değiştirebilecek tek bir uç nokta
   * yoktu. Yani kullanıcı sayfayı müşteriye atıyor, hiçbir hata almıyor,
   * hiçbir gönderi gelmiyor ve sebebi hiçbir ekranda yazmıyor — bu projenin
   * baş belası olan sessiz hatanın ta kendisi. Auto-Boost'un girdisi olan
   * `organic_posts` bu yüzden BOŞTU.
   *
   * ATAMA BUNU OTOMATİK AÇMIYOR ve bu bilinçli — reklam hesaplarındaki
   * kararın aynısı. Bir sayfa reklam yayınlamak ya da lead formu için de
   * atanıyor; organik senkronizasyon ise her süpürmede sayfa başına bir
   * Graph çağrısı demek ve o çağrı yalnızca Auto-Boost'a yarıyor.
   */
  async setProfileSync(
    ctx: TenantContext,
    socialProfileId: string,
    syncEnabled: boolean,
    meta: Meta,
  ) {
    /**
     * BAĞLAM `activeClientId: null` İLE KURULUYOR — atama ucundaki kuralın
     * aynısı ve ilk yazımda ATLANMIŞTI.
     *
     * `app.can_access_client()` panelde seçili müşteriye daraltıyor. Müşteriler
     * ekranı ise BÜTÜN müşterilerin kartlarını yan yana gösteriyor: yönetici
     * Fenbay seçiliyken Ege Birlik'in sayfasını izlemeye almaya çalıştığında
     * RLS satırı gizliyor ve hata "Sayfa bulunamadı" oluyordu — sayfa oradaydı,
     * görünmeyen şey yetki değil KAPSAMDI.
     *
     * Yetki bu satırla gevşemiyor: `can_access_client` hâlâ org yöneticisi ya
     * da `clientIds` üyeliği arıyor. Kalkan tek şey oturumdaki GÖRÜNÜM
     * daraltması.
     */
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    return this.prisma.withTenant(scoped, async (tx) => {
      const before = await tx.socialProfile.findUnique({ where: { id: socialProfileId } });
      if (!before) throw new NotFoundException('Sayfa bulunamadı');

      /**
       * ATANMAMIŞ SAYFA İZLEMEYE ALINAMAZ — `setAccountSync` ile aynı gerekçe.
       *
       * İzin verseydik süpürme işi bu sayfayı `client_id` süzgecinde eler,
       * kullanıcı ekranda "izlemede" görür ve hiçbir gönderi gelmez.
       * `organic_posts.client_id` zaten NOT NULL: satır yazılamazdı.
       */
      if (before.clientId === null && syncEnabled) {
        throw new BadRequestException(
          `"${before.name}" henüz bir müşteriye atanmamış. Önce sayfayı bir ` +
            `müşteriye atayın; atanmamış sayfanın gönderileri çekilmez.`,
        );
      }

      const after = await tx.socialProfile.update({
        where: { id: socialProfileId },
        data: { syncEnabled },
      });

      await this.audit.record(tx, ctx, {
        action: syncEnabled ? 'social_profile.sync_enabled' : 'social_profile.sync_disabled',
        targetType: 'social_profile',
        targetId: socialProfileId,
        clientId: before.clientId,
        before: { syncEnabled: before.syncEnabled },
        after: { syncEnabled: after.syncEnabled, name: after.name },
        ...meta,
      });

      return { id: after.id, syncEnabled: after.syncEnabled };
    });
  }

  /**
   * Sayfanın BOOST FATURALANDIRMA hesabını eşleştirir.
   *
   * NEDEN SONRADAN EKLENDİ: `social_profiles.linked_ad_account_id` kolonu
   * baştan beri vardı ve SEKİZ yerde OKUNUYORDU (aday üretimi, elle boost,
   * gönderi listesi, kural doğrulaması...) ama HİÇBİR YERDE YAZILMIYORDU — ne
   * uç nokta ne düğme. Yani boost'un zorunlu ön koşulu ayarlanamıyordu ve
   * ekran her gönderide "bu sayfaya bağlı bir reklam hesabı yok" diyordu.
   * `sync_enabled` ile birebir aynı boşluk.
   *
   * MÜŞTERİ VE PLATFORM SUNUCUDA DOĞRULANIYOR. Yanlış hesap, başka bir
   * müşterinin bütçesinden harcamak demek ve bunu geri almanın yolu yok:
   * Meta'da oluşmuş bir kampanya silinse bile harcanan para geri gelmiyor.
   * Google hesabı da reddediliyor — boost yalnızca Meta'da var.
   */
  async setProfileAdAccount(
    ctx: TenantContext,
    socialProfileId: string,
    adAccountId: string | null,
    meta: Meta,
  ) {
    // BAĞLAM `activeClientId: null` — Müşteriler ekranı bütün müşterilerin
    // kartlarını gösteriyor ve seçili olmayan bir müşterinin sayfasına
    // dokunmak oturumdaki daraltma yüzünden "bulunamadı" ile düşüyordu.
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    return this.prisma.withTenant(scoped, async (tx) => {
      const before = await tx.socialProfile.findUnique({ where: { id: socialProfileId } });
      if (!before) throw new NotFoundException('Sayfa bulunamadı');

      if (adAccountId !== null) {
        const account = await tx.adAccount.findUnique({ where: { id: adAccountId } });
        if (!account) throw new NotFoundException('Reklam hesabı bulunamadı');

        if (account.platform !== 'meta') {
          throw new BadRequestException(
            'Boost yalnızca Meta’da çalışıyor — faturalandırma hesabı bir Meta ' +
              'reklam hesabı olmalı.',
          );
        }
        /**
         * HESAP VE SAYFA AYNI MÜŞTERİDE OLMAK ZORUNDA.
         *
         * Havuz modelinde hesap ve sayfa ayrı ayrı atanıyor, yani ikisinin
         * farklı müşterilere ait olması mümkün. Eşleştirmeye izin vermek, bir
         * müşterinin gönderisini başka müşterinin hesabından faturalandırmak
         * demek — panelde hiçbir yerde görünmeyecek bir karışıklık.
         */
        if (account.clientId === null || account.clientId !== before.clientId) {
          throw new BadRequestException(
            'Reklam hesabı bu sayfanın müşterisine atanmamış. Aynı müşteride ' +
              'olmayan bir hesaptan boost faturalandırılamaz.',
          );
        }
      }

      const after = await tx.socialProfile.update({
        where: { id: socialProfileId },
        data: { linkedAdAccountId: adAccountId },
      });

      await this.audit.record(tx, ctx, {
        action: adAccountId
          ? 'social_profile.boost_account_linked'
          : 'social_profile.boost_account_unlinked',
        targetType: 'social_profile',
        targetId: socialProfileId,
        clientId: before.clientId,
        before: { linkedAdAccountId: before.linkedAdAccountId },
        after: { linkedAdAccountId: after.linkedAdAccountId, name: after.name },
        ...meta,
      });

      return { id: after.id, linkedAdAccountId: after.linkedAdAccountId };
    });
  }

  /**
   * Reklam hesabını bir müşteriye atar ya da havuza geri koyar.
   *
   * BAĞLAM `activeClientId: null` İLE KURULUYOR VE BU ŞART.
   *
   * Postgres'te bir UPDATE'ten sonra YENİ satır, tablonun SELECT
   * politikasından da geçmek zorunda. `app.can_access_client()` panelde seçili
   * müşteriye daraltıyor; org yöneticisi A müşterisi seçiliyken havuzdaki bir
   * hesabı B'ye atarsa satır kendi görüş alanının dışına çıkıyor ve Postgres
   * reddediyor: "new row violates row-level security policy". Politikayı
   * gevşetmek çözüm DEĞİL — o daraltma, yöneticinin bir müşteri seçiliyken
   * başka müşterinin verisini görmesi hatasının düzeltmesi. Seçim bir GÖRÜNÜM
   * süzgeci; atama ise yönetim işlemi. Davranış
   * `ad-account-pool-rls.spec.ts` içinde kilitli.
   *
   * ATAMA KALKINCA İZLEME DE KAPANIYOR. Atanmamış hesap süpürme işinde
   * eleniyor; `sync_enabled` açık kalsaydı kullanıcı hesabın hâlâ senkronize
   * olduğunu sanır, hiçbir hata görmez ve veri gelmezdi.
   */
  async assignAdAccount(
    ctx: TenantContext,
    adAccountId: string,
    clientId: string | null,
    meta: Meta,
  ) {
    if (clientId !== null && !ctx.clientIds.includes(clientId)) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    const scoped: TenantContext = { ...ctx, activeClientId: null };

    return this.prisma.withTenant(scoped, async (tx) => {
      const before = await tx.adAccount.findUnique({ where: { id: adAccountId } });
      if (!before) throw new NotFoundException('Reklam hesabı bulunamadı');

      if (before.clientId === clientId) {
        return {
          id: before.id,
          clientId: before.clientId,
          syncEnabled: before.syncEnabled,
          changed: false,
        };
      }

      // YÖNETİCİ (MCC) HESABI ATANAMAZ. Reklam yayınlamıyor; atamak boş bir
      // senkronizasyon turu ve boşa kota demek. Arayüzde de kapalı ama karar
      // burada, çünkü uç nokta arayüz olmadan da çağrılabiliyor.
      if (clientId !== null && before.managerExternalId === before.externalId) {
        throw new BadRequestException(
          `"${before.name}" bir yönetici (MCC) hesabı — reklam yayınlamıyor, müşteriye atanamaz.`,
        );
      }

      const after = await tx.adAccount.update({
        where: { id: adAccountId },
        data: {
          clientId,
          ...(clientId === null ? { syncEnabled: false } : {}),
        },
      });

      await this.audit.record(tx, ctx, {
        action: clientId === null ? 'ad_account.unassigned' : 'ad_account.assigned',
        targetType: 'ad_account',
        targetId: adAccountId,
        // Denetim kaydı ATAMANIN YAPILDIĞI müşteriye yazılıyor; kaldırmada
        // hesabın AYRILDIĞI müşteriye. İkisi de "bu müşterinin hesap listesi
        // ne zaman değişti" sorusunu cevaplıyor.
        clientId: clientId ?? before.clientId,
        before: { clientId: before.clientId, syncEnabled: before.syncEnabled },
        after: { clientId: after.clientId, syncEnabled: after.syncEnabled, name: after.name },
        ...meta,
      });

      return {
        id: after.id,
        clientId: after.clientId,
        syncEnabled: after.syncEnabled,
        changed: true,
      };
    });
  }

  /**
   * Sayfayı/Instagram hesabını bir müşteriye atar ya da havuza geri koyar.
   *
   * Reklam hesabı atamasıyla AYNI kurallar geçerli ve aynı sebeplerle:
   * bağlam `activeClientId: null` ile kuruluyor (yoksa Postgres UPDATE'i
   * reddediyor — sebep `assignAdAccount` notunda) ve atama kalkınca izleme
   * kapanıyor.
   *
   * BİR FARK VAR: sayfanın müşterisi DEĞİŞİRSE, o sayfaya bağlı formlar ve
   * organik gönderiler ESKİ müşterinin altında kalıyor. Bunlar geçmiş kayıt ve
   * taşınmaları yanlış olurdu — bir markanın topladığı potansiyel müşteriler
   * başka bir markanın CRM'ine geçemez. Çağıran bu durumu kullanıcıya
   * söylemek zorunda; sayı yanıtta dönüyor.
   */
  async assignSocialProfile(
    ctx: TenantContext,
    socialProfileId: string,
    clientId: string | null,
    meta: Meta,
  ) {
    if (clientId !== null && !ctx.clientIds.includes(clientId)) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    const scoped: TenantContext = { ...ctx, activeClientId: null };

    return this.prisma.withTenant(scoped, async (tx) => {
      const before = await tx.socialProfile.findUnique({ where: { id: socialProfileId } });
      if (!before) throw new NotFoundException('Sayfa bulunamadı');

      if (before.clientId === clientId) {
        return {
          id: before.id,
          clientId: before.clientId,
          syncEnabled: before.syncEnabled,
          changed: false,
          leftBehindForms: 0,
        };
      }

      // ESKİ MÜŞTERİDE KALACAK FORM SAYISI. Sessiz bırakmak, kullanıcının
      // sayfayı taşıdıktan sonra "formlarım nerede" diye aramasına yol açardı.
      const leftBehindForms =
        before.clientId === null
          ? 0
          : await tx.leadForm.count({
              where: { socialProfileId, clientId: before.clientId },
            });

      const after = await tx.socialProfile.update({
        where: { id: socialProfileId },
        data: {
          clientId,
          ...(clientId === null ? { syncEnabled: false } : {}),
        },
      });

      await this.audit.record(tx, ctx, {
        action: clientId === null ? 'social_profile.unassigned' : 'social_profile.assigned',
        targetType: 'social_profile',
        targetId: socialProfileId,
        clientId: clientId ?? before.clientId,
        before: { clientId: before.clientId, syncEnabled: before.syncEnabled },
        after: { clientId: after.clientId, syncEnabled: after.syncEnabled, name: after.name },
        ...meta,
      });

      return {
        id: after.id,
        clientId: after.clientId,
        syncEnabled: after.syncEnabled,
        changed: true,
        leftBehindForms,
      };
    });
  }

  /**
   * Bağlantıyı kaldırır.
   *
   * Kayıt SİLİNMEZ, `revoked` işaretlenir ve token'lar temizlenir. Sebep:
   * denetim izi korunmalı ve aynı hesap yeniden bağlanırsa geçmiş reklam
   * verisiyle eşleşmeli. Reklam hesabı satırları da kalır — üzerlerindeki
   * geçmiş metrikler (Modül 3) bir müşteriye ait finansal kayıttır.
   */
  async disconnect(ctx: TenantContext, connectionId: string, meta: Meta) {
    // Token'ı PLATFORM TARAFINDA iptal et — kendi kaydımızı silmek yetmez.
    //
    // Sıra önemli: iptal önce yapılır, çünkü şifreli token'a hâlâ ihtiyacımız
    // var. Ama başarısız olması bağlantının kaldırılmasını ENGELLEMEZ: token
    // zaten geçersiz olabilir ya da platform erişilemez olabilir. İptal en iyi
    // çabadır, kaydı silmek kesindir. Aksi hâlde kullanıcı bir platform
    // kesintisi yüzünden bağlantısını kaldıramaz hâle gelirdi.
    const target = await this.prisma.withTenant(ctx, (tx) =>
      tx.platformConnection.findUnique({
        where: { id: connectionId },
        select: { platform: true },
      }),
    );
    if (!target) throw new NotFoundException('Bağlantı bulunamadı');
    await this.vault.revokeOnPlatform(connectionId, this.provider(target.platform as Platform));

    return this.prisma.withTenant(ctx, async (tx) => {
      const conn = await tx.platformConnection.findUnique({ where: { id: connectionId } });
      if (!conn) throw new NotFoundException('Bağlantı bulunamadı');

      await tx.adAccount.updateMany({
        where: { connectionId },
        data: { syncEnabled: false },
      });
      await tx.socialProfile.updateMany({
        where: { connectionId },
        data: { syncEnabled: false },
      });

      await tx.platformConnection.update({
        where: { id: connectionId },
        data: {
          status: 'revoked',
          revokedAt: new Date(),
          // Token'lar okunamaz hale getirilir. Boş buffer, "şifreli veri bozuk"
          // hatası verir ve kazara kullanım imkânsızlaşır.
          accessTokenEnc: new Uint8Array(0),
          refreshTokenEnc: null,
          tokenExpiresAt: null,
          grantedScopes: [],
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'connection.revoked',
        targetType: 'platform_connection',
        targetId: connectionId,
        clientId: conn.clientId,
        before: { platform: conn.platform, accountLabel: conn.accountLabel },
        ...meta,
      });

      return { ok: true };
    });
  }

  /** Süresi geçmiş state kayıtlarını temizler. Modül 3'te cron'a bağlanacak. */
  async pruneExpiredStates(): Promise<number> {
    const { count } = await this.admin.oAuthState.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    return count;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }


}

/**
 * Platform OAuth hatasını, kullanıcının ne yapacağını bilebileceği bir mesaja
 * çevirir.
 *
 * Ham kodu ("1349048") göstermek kimseye yardım etmiyor. Bu kodların çoğu
 * Meta/Google panelinde eksik BİR ayara işaret ediyor; hangisi olduğunu
 * söylemek dakikalar yerine saniyeler kazandırıyor.
 */
export function describePlatformOAuthError(
  platform: string,
  code: string,
  detail?: string,
): string {
  const known: Record<string, string> = {
    // Meta — "URL Yüklenemedi": redirect_uri'nin alan adı App Domains'te yok.
    '1349048':
      'Meta uygulama ayarlarında "App Domains" alanı eksik. ' +
      'App settings → Basic → App Domains alanına advetics.com ekleyip kaydet.',
    // Meta — redirect_uri kayıtlı değil.
    '191':
      'Yönlendirme adresi Meta uygulamasında kayıtlı değil. ' +
      'Facebook Login for Business → Settings → Valid OAuth Redirect URIs alanına ' +
      'https://advetics.com/api/connections/meta/callback ekle.',
    // Google — redirect_uri eşleşmiyor.
    redirect_uri_mismatch:
      'Yönlendirme adresi Google OAuth istemcisinde kayıtlı değil. ' +
      'Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs ' +
      'alanına https://advetics.com/api/connections/google/callback ekle.',
    // Google — uygulama doğrulanmadı / test kullanıcısı değil.
    access_blocked:
      'Google uygulaması henüz doğrulanmadı. OAuth consent screen → Test users ' +
      'listesine kendi hesabını ekle veya doğrulama başvurusunu tamamla.',
    admin_policy_enforced:
      'Google Workspace yöneticisi bu uygulamaya erişimi engelliyor. ' +
      'Yönetici konsolundan izin verilmesi gerekiyor.',
  };

  const hit = known[code];
  if (hit) return hit;

  const suffix = detail ? ` — ${detail}` : '';
  return `${platform === 'meta' ? 'Meta' : 'Google'} yetkilendirmeyi reddetti (kod ${code})${suffix}`;
}
