import { GtmEnvanterKuyrugu } from '../kurulum/gtm-envanter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Platform as PrismaPlatform, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type {
  AdAccountSummary,
  BaglantiKaldirmaOnizlemesi,
  ConnectionSummary,
  GeoLocationOption,
  InterestOption,
  CustomAudienceList,
  Platform,
  ProviderAvailability,
  SavedAudienceList,
  SocialProfileSummary,
  TenantContext,
  SocialProfileTypeValue,
} from '@advetics/shared';
// DEĞER import'u AYRI: `PLATFORMS` bir dizi, yukarıdaki blok `import type`
// ve oraya değer koymak TS1361 veriyor (bu depoda bir kez düşüldü).
import { PLATFORMS, ayarlarAdresi } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { yetkiBitisi } from './yetki-bitisi';
import { PrismaService, type TenantClient } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistry } from './provider.registry';
import { SyncQueueService } from '../../queue/sync-queue.service';
import { PLATFORM_ADI, decideConnectionOwnership } from './connection-ownership';
import { baglantiKaldirmaKarari, baglantiKorunsunMu, cakismaKarari, sahiplikKarari } from './hesap-sahipligi';
import {
  PlatformApiError,
  type FetchContext,
  type IAdPlatformProvider,
  type OAuthTokens,
} from './provider.types';
import { eksikKokler, googleMusteriEtiketi, googleMusteriKimligiMi, kimlikKarari } from './baglanti-kimligi';
import { baglantiHatasiMetni } from './baglanti-hatasi';
import { TokenVaultService } from './token-vault.service';
import { OdemeTetigiService } from '../alerts/odeme-tetigi.service';
import { OdemeMailiGonderici } from '../alerts/odeme-maili-gonderici.service';
import { CryptoService } from '../../crypto/crypto.service';
import { MetaProvider } from './providers/meta.provider';
import { hesapVerisiniTasi, type TasimaSonucu } from './hesap-verisi-tasima';
import { IZLEME_KAPANDI_NOTU, hesapSinyalleriniKapat } from '../sinyal/hesap-sinyalleri';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Atama sonrası geçmiş metrik işinin BEKLETİLDİĞİ süre.
 *
 * 90 saniye ölçülmüş bir üst sınır değil, yapı taramasının tipik süresine
 * göre seçilmiş bir pay. Garanti değil ve olmak zorunda da değil: yapı hâlâ
 * bitmemişse metrik işi artık sessizce başarılı sayılmıyor, tekrar denenebilir
 * hata veriyor (`insights-sync.service.ts`).
 */
const YAPI_ICIN_TANINAN_SURE_MS = 90_000;

/** OAuth state ömrü. Kısa tutuluyor: bu pencere bir CSRF fırsat penceresidir. */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * `/connections` LİSTESİNİN ÇEKTİĞİ ALANLAR — TEK YERDE.
 *
 * Sorgu ile `toSummary`'nin tipi buradan türetiliyor. Ayrı yazılsalardı
 * biri güncellenmediğinde TypeScript susardı ve alan `undefined` gelirdi;
 * `$queryRaw<T>` için CLAUDE.md'de yazılı olan tuzağın Prisma karşılığı bu.
 */
const HESAP_ALANLARI = {
  id: true,
  platform: true,
  externalId: true,
  name: true,
  currency: true,
  timezone: true,
  status: true,
  syncEnabled: true,
  managerExternalId: true,
  lastInsightsSyncAt: true,
  clientId: true,
  client: { select: { name: true } },
} satisfies Prisma.AdAccountSelect;

const PROFIL_ALANLARI = {
  id: true,
  profileType: true,
  externalId: true,
  name: true,
  username: true,
  pictureUrl: true,
  linkedAdAccountId: true,
  syncEnabled: true,
  clientId: true,
  client: { select: { name: true } },
} satisfies Prisma.SocialProfileSelect;

const BAGLANTI_ALANLARI = {
  id: true,
  // SAHİBİ SÖYLEMEK İÇİN — `toSummary` bağlantının ajansın mı şirketin mi
  // olduğunu buradan çıkarıyor. Yanıta kimlik olarak GİTMİYOR.
  orgId: true,
  platform: true,
  accountLabel: true,
  status: true,
  grantedScopes: true,
  tokenExpiresAt: true,
  lastVerifiedAt: true,
  lastErrorCode: true,
  createdAt: true,
  adAccounts: { select: HESAP_ALANLARI },
  socialProfiles: { select: PROFIL_ALANLARI },
} satisfies Prisma.PlatformConnectionSelect;

/** `toSummary` girdisi — sorgunun alan listesinden TÜRETİLİYOR. */
type BaglantiSatiri = Prisma.PlatformConnectionGetPayload<{
  select: typeof BAGLANTI_ALANLARI;
}>;

/**
 * PROFİL TÜRÜ → REKLAMIN YAYINLANDIĞI PLATFORM.
 *
 * `Record` BİLEREK: yeni bir profil türü eklendiğinde derleme burada kırılıyor.
 * İki yollu bir üçlü ifade ("youtube ise google, değilse meta") üçüncü türü
 * sessizce Meta'ya düşürürdü — LinkedIn eklenirken bu depoda tam olarak böyle
 * kaybolan listeler bulundu.
 */
const PROFIL_REKLAM_PLATFORMU: Record<SocialProfileTypeValue, { platform: string; hata: string }> = {
  facebook_page: {
    platform: 'meta',
    hata: 'Boost yalnızca Meta’da çalışıyor — faturalandırma hesabı bir Meta reklam hesabı olmalı.',
  },
  instagram_business: {
    platform: 'meta',
    hata: 'Boost yalnızca Meta’da çalışıyor — faturalandırma hesabı bir Meta reklam hesabı olmalı.',
  },
  youtube_channel: {
    platform: 'google',
    hata: 'YouTube reklamı Google Ads hesabından yayınlanıyor — kanala bir Google Ads hesabı bağla.',
  },
};

/**
 * VARSAYILAN OAUTH DÖNÜŞÜ — Ayarlar › Platform bağlantıları, ÇAPASIZ.
 *
 * Panelin üreticisinden (`ayarlarAdresi`), elle değil: sayfa taşındığında
 * elle yazılmış yol kullanıcıyı izin ekranından ölü bir adrese döndürür.
 * Çapa (`#kanallar`) BİLEREK yok: dönüşte arkasına `?connection=…`
 * ekleniyor ve çapanın ardına gelen sorgu, çapanın parçası sayılıp
 * sunucuya hiç gitmez — "bağlandı" bandı hiç görünmezdi.
 */
export const VARSAYILAN_DONUS = ayarlarAdresi('baglantilar');

/**
 * OAUTH DÖNÜŞ ADRESİ — sorgu dizesi VARSA `&` ile eklenir.
 *
 * Dönüş yolu uzun süre sorgusuz bir yoldu (`/ayarlar/baglantilar`) ve
 * sonuç `${yol}?connection=...` diye elle birleştiriliyordu. Kurulum
 * sihirbazı kendi adımını sorguda taşıyor (`/kurulum?tur=sirket&adim=...`)
 * ve elle birleştirme İKİNCİ bir `?` üretiyordu: tarayıcı onu `adim`
 * değerinin parçası sayıyor, sihirbaz adımı tanımıyor ve kullanıcı
 * bağlandıktan sonra sihirbazın BAŞINA dönüyordu. Hata yok, yalnızca
 * yanlış ekran.
 */
export function donusAdresi(yol: string, sorgu: string): string {
  return `${yol}${yol.includes('?') ? '&' : '?'}${sorgu}`;
}

/** Kimliği zaten bağlı olan kullanıcıya ölçüm izninin DOĞRU yolunu söyler. */
const OLCUM_IZNI_NOTU: Partial<Record<Platform, string>> = {
  google: ' Tag Manager ve Analytics izni için Marka Merkezi › Kurulum’daki "Ölçüm izinlerini ver" düğmesini kullan.',
};

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
    private readonly queue: SyncQueueService,
    /**
     * SAYFA TOKEN'INI ÇÖZMEK İÇİN — EN SONDA.
     *
     * Parametre listenin sonuna eklendi: testler bağımlılıkları KONUMLA
     * geçiriyor ve araya sokmak, hiçbiri derlemede görünmeden hepsini
     * kaydırırdı.
     */
    private readonly crypto: CryptoService,
    /**
     * ÖDEME TETİĞİ — hesap durumu yazılan her yol sorunu o an bildiriyor.
     * En sonda, `crypto` ile aynı gerekçe: testler konumla geçiriyor.
     */
    private readonly odemeTetigi: OdemeTetigiService,
    /**
     * AJANSA MAİL — müşteri ajansın atamasını kaldırdığında. En sonda, aynı
     * gerekçe: testler konumla geçiriyor. `OdemeTetigiModule` bu modüle
     * zaten bağlı ve sağlayıcıyı dışa veriyor; yeni modül kaydı yok.
     */
    private readonly odemeMaili: OdemeMailiGonderici,
    /**
     * TAG MANAGER ENVANTERİ — ölçüm izni gelince tam tarama. En sonda,
     * aynı gerekçe: testler konumla geçiriyor.
     */
    private readonly gtmEnvanteri: GtmEnvanterKuyrugu,
  ) {}

  /**
   * ═══ SAYFAYA BAĞLI WHATSAPP NUMARASI — TEYİT İÇİN ═══
   *
   * Kullanıcının isteği: "whatsapp numarasının doğru olup olmadığını teyit
   * etmem için gözükmesini istiyorum". Reklam numarayı sormuyor (Meta onu
   * sayfadan alıyor) ama hangi hatta mesaj düşeceği yayından ÖNCE
   * görünmeli — yanlış hat, ancak müşteri "hiç mesaj gelmiyor" dediğinde
   * fark ediliyor.
   *
   * ÜÇ HÂL AYRI AYRI DÖNÜYOR ve üçünün yapılacak işi farklı: numara geldi /
   * sayfada okunamıyor / çağrı düştü. Tek bir `null`, "numara yok" ile
   * "okuyamadık"ı aynı kutuya çevirirdi.
   */
  async pageWhatsapp(
    ctx: TenantContext,
    socialProfileId: string,
  ): Promise<{ number: string | null; error: string | null }> {
    const profil = await this.prisma.withTenant(ctx, (tx) =>
      tx.socialProfile.findUnique({ where: { id: socialProfileId } }),
    );
    if (!profil) throw new NotFoundException('Sayfa bulunamadı');
    if (!profil.pageAccessTokenEnc) {
      return {
        number: null,
        error:
          'Sayfa token’ı yok. "Hesapları yenile" ile sayfayı yeniden keşfedince numara okunabilir.',
      };
    }

    const provider = this.registry.get('meta');
    // ARAYÜZDE YOK, SAĞLAYICIDA VAR: `IAdPlatformProvider` 29 metot taşıyor
    // ve Meta'ya özgü bir okuma için otuzuncuyu eklemek, Google ve
    // LinkedIn'e karşılığı olmayan bir metot dayatmak olurdu.
    if (!(provider instanceof MetaProvider)) {
      return { number: null, error: 'Bu okuma yalnızca Meta sayfalarında var.' };
    }

    const sonuc = await provider.fetchPageWhatsapp({
      pageExternalId: profil.externalId,
      pageAccessToken: this.crypto.decrypt(Buffer.from(profil.pageAccessTokenEnc)),
    });
    return { number: sonuc.number, error: sonuc.hata };
  }

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
    const { meta, google, linkedin, oauthRedirectBaseUrl } = this.config.platforms;

    const metaMissing: string[] = [];
    if (!meta.appId) metaMissing.push('META_APP_ID');
    if (!meta.appSecret) metaMissing.push('META_APP_SECRET');
    if (!oauthRedirectBaseUrl) metaMissing.push('OAUTH_REDIRECT_BASE_URL');

    const googleMissing: string[] = [];
    if (!google.clientId) googleMissing.push('GOOGLE_CLIENT_ID');
    if (!google.clientSecret) googleMissing.push('GOOGLE_CLIENT_SECRET');
    if (!google.developerToken) googleMissing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
    if (!oauthRedirectBaseUrl) googleMissing.push('OAUTH_REDIRECT_BASE_URL');

    const linkedinMissing: string[] = [];
    if (!linkedin.clientId) linkedinMissing.push('LINKEDIN_CLIENT_ID');
    if (!linkedin.clientSecret) linkedinMissing.push('LINKEDIN_CLIENT_SECRET');
    if (!oauthRedirectBaseUrl) linkedinMissing.push('OAUTH_REDIRECT_BASE_URL');

    const eksikler: Record<Platform, string[]> = {
      meta: metaMissing,
      google: googleMissing,
      linkedin: linkedinMissing,
    };

    /*
     * LİSTE `PLATFORMS`TAN TÜRETİLİYOR — elle yazılmıyor.
     *
     * Burada iki nesne ELLE sayılıyordu ve LinkedIn eklenirken bu ekran onu
     * hiç göstermeyecekti: hata yok, log yok, yalnızca bağlantı sayfasında
     * OLMAYAN bir platform. `Record<Platform, ...>` sayesinde dördüncü
     * platform eklendiğinde DERLEME kırılıyor ve eksik anahtar listesini
     * yazmayı unutmak imkânsız hâle geliyor.
     */
    return PLATFORMS.map((platform) => ({
      platform,
      configured: eksikler[platform].length === 0,
      missingConfig: eksikler[platform],
      requiredScopes: [...this.provider(platform).requiredScopes],
      optionalScopes: [...this.provider(platform).optionalScopes],
    }));
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
  async list(
    ctx: TenantContext,
    clientId: string | null,
    /**
     * KALDIRILMIŞ BAĞLANTILAR YALNIZ İSTENİNCE (Ayarlar › Platform
     * bağlantıları). Kurulum, hedefleme ve sorun rozeti aynı ucu okuyor ve
     * kaldırılmış bir satırı "bağlı" saymamalı; onlara dokunulmadı.
     */
    kaldirilanlar = false,
  ): Promise<ConnectionSummary[]> {
    if (clientId && !ctx.clientIds.includes(clientId)) {
      throw new NotFoundException('Workspace bulunamadı');
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

    /*
     * AJANS ŞİRKETİ BİR KEZ OKUNUYOR — bağlantının sahibini ekranda
     * yazabilmek için. Üst hesap üyeliği yoksa bilinmiyor ve bu doğru:
     * üyeliği olmayan kullanıcı politika gereği yalnızca KENDİ şirketinin
     * bağlantılarını görüyor, hepsi "şirketin".
     */
    const [ajans] = ctx.managerAccountId
      ? await this.admin.$queryRaw<Array<{ ajans_org_id: string | null }>>(Prisma.sql`
          SELECT ajans_org_id::text AS ajans_org_id FROM manager_accounts
           WHERE id = ${ctx.managerAccountId}::uuid
        `)
      : [];
    const ajansOrgId = ajans?.ajans_org_id ?? null;

    return this.prisma.withTenant(scoped, async (tx) => {
      const rows = await tx.platformConnection.findMany({
        /*
         * WORKSPACE SEÇİLİYSE BAĞLANTILAR DA SÜZÜLÜYOR — eskiden yalnızca
         * hesaplar süzülüyordu ve sonuç şuydu: ajansın havuz bağlantısı HER
         * workspace’in ekranında SIFIR hesapla görünüyordu. Kullanıcı
         * "bağlantı var ama hesap yok" sanıyordu; oysa o bağlantı bu
         * workspace’e ait bile değildi.
         *
         * İKİ DAL, VE İKİNCİSİ GEÇİŞ İÇİN ŞART: bağlantı ya bu workspace’e
         * AİT, ya da havuz döneminden kalma ve altındaki hesaplardan/
         * sayfalardan en az biri bu workspace’e ATANMIŞ. İkinci dal olmadan
         * bugün üretimde çalışan müşteriler bağlantılarını göremezdi —
         * hesapları havuz bağlantısının altında duruyor.
         */
        where: clientId
          ? {
              status: { not: 'revoked' },
              OR: [
                { clientId },
                { adAccounts: { some: { clientId } } },
                { socialProfiles: { some: { clientId } } },
              ],
            }
          : kaldirilanlar
            ? {
                /*
                 * 2026-10-15: ajansın kaldırılan bağlantısı listeden düştü ve
                 * kart "Bağlı değil · Bağlan" gösterdi; "Bağlan" ikinci satır
                 * açıyordu. Kaldırılmış satır, altında hesabı ya da sayfası
                 * kaldıysa listede: çaresi kendi `reauthorize`u. Altı boş
                 * kaldırılmış satırın geri getirecek bir şeyi yok.
                 */
                OR: [
                  { status: { not: 'revoked' } },
                  { adAccounts: { some: {} } },
                  { socialProfiles: { some: {} } },
                ],
              }
            : { status: { not: 'revoked' } },
        orderBy: { createdAt: 'asc' },
        /*
         * ═══ `select`, `include` DEĞİL — VE FARK ÜRETİMDE ÖLÇÜLDÜ ═══
         *
         * `include` ilişkinin BÜTÜN skaler kolonlarını çekiyor. Bu sorgu
         * havuzda 481 reklam hesabı ve 199 sayfa varken şunları da
         * okuyordu ve `toSummary` hepsini ATIYORDU:
         *
         *   · `ad_accounts.raw` — her hesabın TAM platform yanıtı (JSONB)
         *   · `ad_accounts.rate_limit_state` (JSONB)
         *   · `social_profiles.raw` (JSONB)
         *   · `social_profiles.page_access_token_enc` — ŞİFRELİ SAYFA TOKEN'I
         *   · `platform_connections.access_token_enc` / `refresh_token_enc`
         *
         * Yani megabaytlarca veri Postgres'ten okunup Node'a taşınıyor ve
         * yanıta hiç girmeden çöpe gidiyordu. Panelde "yavaş" olarak
         * görünen şeyin ölçülebilir kısmı buydu: yük yanıtta GÖRÜNMÜYOR,
         * çünkü yanıt zaten doğru — pahalı olan ona giden yol.
         *
         * GÜVENLİK TARAFI DA VAR: aşağıdaki `toSummary` yorumu "şifreli
         * token kolonları bu fonksiyondan geçmez" diyor ve yanıt için
         * doğruydu; ama SORGU onları yine de belleğe alıyordu. Artık
         * alınmıyor.
         *
         * YENİ ALAN EKLERKEN buraya da eklemek gerekiyor — `select`
         * unutulan alanı `undefined` yapar ve TypeScript bunu yakalar
         * (`include`'un aksine sessiz kalmaz).
         */
        select: {
          ...BAGLANTI_ALANLARI,
          // Süzgeç ve sıralama dinamik; ALAN LİSTESİ sabitten geliyor.
          adAccounts: {
            where: clientId ? { clientId } : undefined,
            orderBy: { name: 'asc' },
            select: HESAP_ALANLARI,
          },
          socialProfiles: {
            where: clientId ? { clientId } : undefined,
            orderBy: { name: 'asc' },
            select: PROFIL_ALANLARI,
          },
        },
      });

      return rows.map((c) => this.toSummary(c, ajansOrgId));
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
    c: BaglantiSatiri,
    ajansOrgId: string | null,
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
      sahip: ajansOrgId !== null && c.orgId === ajansOrgId ? 'ajans' : 'sirket',
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
   * `clientId` VERİLİRSE bağlantı o workspace’e kurulur ve keşfedilen bütün
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
   * workspace’e bağlamak `persistConnection` içinde REDDEDİLİYOR.
   */
  async startOAuth(
    ctx: TenantContext,
    platform: Platform,
    opts: {
      redirectTo?: string;
      forceReconsent?: boolean;
      clientId?: string;
      kapsam?: 'olcum';
      /**
       * Dönüşte YENİ SATIR AÇILMAZ, bu bağlantı tazelenir. Yalnız
       * `reauthorize` veriyor ve yetki kapısını o kuruyor.
       */
      hedefBaglantiId?: string;
    },
    meta: Meta,
  ): Promise<{ authorizeUrl: string }> {
    const provider = this.provider(platform);
    // ÖLÇÜM İZNİ YALNIZ GOOGLE'DA ek istek: Meta zaten bütün izinlerini
    // (`allScopes`) her onayda istiyor.
    const ekScopes = opts.kapsam === 'olcum' && platform === 'google' ? [...provider.optionalScopes] : [];
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
          // NULL = ajans havuzu, dolu = o workspace’e kurulan bağlantı.
          // Geri dönüşte bu değer bağlantıya, oradan keşfedilen bütün
          // hesap ve sayfalara akıyor.
          clientId: opts.clientId ?? null,
          platform: platform as PrismaPlatform,
          tokenHash: this.hash(rawState),
          redirectTo: opts.redirectTo ?? null,
          requestedScopes: [...provider.requiredScopes, ...ekScopes],
          targetConnectionId: opts.hedefBaglantiId ?? null,
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
        ekScopes,
      }),
    };
  }

  /**
   * YENİDEN YETKİLENDİRME — sahipliği KORUYARAK.
   *
   * BU METOT OLMADAN WORKSPACE BAZLI BAĞLANTI TEK KULLANIMLIKTI. Uç nokta
   * `startOAuth`'u `clientId` vermeden çağırıyordu, yani state satırına `null`
   * yazılıyordu; geri dönüşte `persistConnection` "havuza bağlanıyor" diye
   * okuyor ve sahiplik koruması bunu REDDEDİYORDU. Sonuç: bir workspace’e
   * bağlanan hesap, token'ı süresi dolup `needs_reauth` olduğu anda KALICI
   * OLARAK yenilenemez hâle geliyordu — ve kullanıcıya gösterilen mesaj
   * "önce mevcut bağlantıyı kaldır" diyordu, yani tek çıkış yolu bağlantıyı
   * silmekti.
   *
   * Meta token'larının süresi rutin olarak doluyor; bu bir ihtimal değil,
   * takvimli bir kesintiydi.
   *
   * `id` PARAMETRESİ ARTIK KULLANILIYOR. Eskiden imzada duruyor ama gövdede
   * hiç okunmuyordu — bağlantının hangi workspace’e ait olduğu tam da orada
   * yazılı olduğu için o parametre bu metodun var oluş sebebi.
   */
  async reauthorize(
    ctx: TenantContext,
    connectionId: string,
    platform: Platform,
    meta: Meta,
    ek: { kapsam?: 'olcum'; redirectTo?: string } = {},
  ): Promise<{ authorizeUrl: string }> {
    const { conn, yazabilir } = await this.prisma.withTenant({ ...ctx, activeClientId: null }, async (tx) => {
      const c = await tx.platformConnection.findFirst({
        where: { id: connectionId },
        select: { clientId: true, platform: true, orgId: true },
      });
      /*
       * ═══ YETKİ KAPISI: VERİTABANININ BU SATIRA YAZMA KURALI ═══
       *
       * Dönüş bu satırın TOKEN'INI ve İZİNLERİNİ değiştiriyor ve yönetim
       * istemcisiyle (RLS'siz) yazıyor — kimlik doğrulaması orada yok. Kapı
       * burada ve İKİNCİ BİR KURAL YAZILMADI: politikanın kendisine soruluyor
       * (`adv_connections_write`). Havuz bağlantısında bu "kendi şirketi ya
       * da üyesi olduğu ajans + havuz yönetimi" demek; müşteri şirketinin
       * yöneticisi ajansın Google bağlantısına GÖREBİLDİĞİ hâlde (havuz
       * okuma kapsamı) dokunamıyor. Okuyabilmek yeterli sayılsaydı, ajansın
       * 55 atanmış hesabını besleyen token'ı bir müşteri değiştirebilirdi.
       * Yoklama no-op bir UPDATE: satırı değiştirmiyor, yalnızca politikanın
       * USING koşulundan geçip geçmediğini RETURNING ile sayıyor.
       */
      const y = c
        ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            UPDATE platform_connections SET updated_at = updated_at
             WHERE id = ${connectionId}::uuid
            RETURNING id::text AS id`)
        : [];
      return { conn: c, yazabilir: y.length === 1 };
    });
    if (!conn) throw new NotFoundException('Bağlantı bulunamadı');
    if (!yazabilir) {
      throw new ForbiddenException(
        conn.clientId === null && conn.orgId !== ctx.orgId
          ? 'Bu bağlantı ajansın. İzni yalnızca ajansın yöneticisi verebilir.'
          : 'Bu bağlantıyı yeniden yetkilendirme yetkin yok.',
      );
    }

    /*
     * PLATFORM KAYITTAN DOĞRULANIYOR. Adres çubuğundan gelen `?platform=`
     * ile kaydın platformu ayrışırsa, Meta bağlantısı için Google izin
     * ekranına gidilir ve dönüşte BAŞKA bir bağlantı tazelenirdi.
     */
    if (conn.platform !== platform) {
      throw new BadRequestException('Bağlantının platformu eşleşmiyor.');
    }

    return this.startOAuth(
      ctx,
      platform,
      // SAHİPLİK OLDUĞU GİBİ TAŞINIYOR: havuz bağlantısı havuz kalıyor,
      // workspace bağlantısı kendi workspace’inde kalıyor.
      {
        forceReconsent: true,
        redirectTo: ek.redirectTo ?? VARSAYILAN_DONUS,
        clientId: conn.clientId ?? undefined,
        ...(ek.kapsam ? { kapsam: ek.kapsam } : {}),
        /*
         * HEDEF BAĞLANTI. Olmadan dönüş `başlatanın şirketi + kimlik` ile
         * upsert ediyordu: ajansın bağlantısı müşteri şirketinden
         * yetkilendirilince o şirkette YENİ satır açıldı ve izin verilen
         * satır, kurulumun okuduğu satır değildi (2026-10-13 üretim).
         */
        hedefBaglantiId: connectionId,
      },
      meta,
    );
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
/**
   * İZİN VERİLDİ — İZİN YÜZÜNDEN DURAN VERİ KAYNAKLARI YENİDEN KUYRUĞA.
   *
   * Kullanıcı kartta "Analytics iznini ver"e basıp Google'dan döndüğünde
   * kaynak `izin_eksik`/`erisim_yok`ta kalıyordu: gece süpürmesi bu durumları
   * BİLEREK atlıyor (her gece aynı reddi almamak için) ve kullanıcının ayrıca
   * "Şimdi yenile"yi bilmesi gerekiyordu. Belirti "izni verdim, hâlâ izin
   * gerekiyor yazıyor". Yapı işi kendi ön koşulunu (izin var mı) zaten
   * platforma gitmeden denetliyor; izin hâlâ eksikse çağrısız biter.
   * Yutuluyor ama SESSİZ DEĞİL: bağlantı kuruldu, bu ek adım onu bozmamalı.
   */
  private async izinBekleyenKaynaklariKuyrukla(connectionId: string): Promise<number> {
    try {
      const kaynaklar = await this.admin.$queryRaw<Array<{ id: string; client_id: string }>>(Prisma.sql`
        SELECT id::text AS id, client_id::text AS client_id FROM veri_kaynaklari
         WHERE connection_id = ${connectionId}::uuid AND durum IN ('izin_eksik', 'erisim_yok')`);
      for (const k of kaynaklar) {
        await this.queue.enqueue({ clientId: k.client_id, platform: 'google', jobType: 'kaynak_yapi', veriKaynagiId: k.id, interactive: true });
      }
      return kaynaklar.length;
    } catch (err) {
      this.logger.error(`İzin sonrası veri kaynakları kuyruğa alınamadı (${connectionId}): ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }

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
        redirectPath: donusAdresi(
          VARSAYILAN_DONUS,
          `connection=hata&platform=${platform}&mesaj=${encodeURIComponent(reason)}`,
        ),
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

    const backTo = state.redirectTo ?? VARSAYILAN_DONUS;
    const provider = this.provider(platform);
    /*
     * ÖLÇÜM İZNİ AKIŞI MI — dönüş bandı ona göre konuşuyor. Kurulum ekranı
     * bu parametre olmadan hiçbir şey söylemiyordu: kullanıcı Google'dan
     * dönüyor, aynı düğmeyi görüyor ve neyin olmadığını bilmiyordu.
     */
    const olcumIstendi = state.requestedScopes.some((s) => provider.optionalScopes.includes(s));
    const izinEki = olcumIstendi ? '&izin=olcum' : '';

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
        return { redirectPath: donusAdresi(backTo, `connection=iptal&platform=${platform}${izinEki}`) };
      }

      const reason = describePlatformOAuthError(platform, platformError, platformErrorText);
      this.logger.error(`OAuth başarısız (${platform}): ${platformError} — ${platformErrorText ?? ''}`);
      return {
        redirectPath: donusAdresi(
          backTo,
          `connection=hata&platform=${platform}&mesaj=${encodeURIComponent(reason)}${izinEki}`,
        ),
      };
    }

    if (!params.code) {
      return {
        redirectPath: donusAdresi(
          backTo,
          `connection=hata&platform=${platform}&mesaj=${encodeURIComponent(
            'Yetkilendirme kodu dönmedi. Platform izin ekranını tamamlamadan geri dönülmüş olabilir.',
          )}${izinEki}`,
        ),
      };
    }

    try {
      const tokens = await provider.exchangeCode(params.code, this.redirectUri(platform));

      /*
       * EKSİK İZİN = İSTENİP VERİLMEYEN. Eskiden yalnız zorunlu kapsamlara
       * bakılıyordu: Google'ın onay ekranında Tag Manager/Analytics kutusu
       * işaretsiz bırakılınca dönüş "başarılı" diyordu ve kurulum aynı
       * düğmeyi göstermeye devam ediyordu.
       */
      const istenen = state.requestedScopes.length > 0 ? state.requestedScopes : [...provider.requiredScopes];
      const missing = istenen.filter((s) => !tokens.grantedScopes.includes(s));
      /*
       * HEDEFLİ DÖNÜŞ (yeniden yetkilendirme, ölçüm izni) YENİ SATIR AÇMAZ:
       * başlatılan bağlantı tazelenir ya da açık bir sebeple reddedilir.
       */
      const connectionId = state.targetConnectionId
        ? await this.hedefBaglantiyiTazele(state.targetConnectionId, platform, tokens, {
            userId: state.createdByUserId,
            orgId: state.orgId,
          })
        : await this.persistConnection(state.orgId, state.clientId, state.createdByUserId, platform, tokens);

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

      /*
       * WORKSPACE BAĞLANTISINDA VERİ HEMEN ÇEKİLİYOR.
       *
       * Havuz modelinde bu doğru olmazdı: bağlanan Meta kimliği ONLARCA
       * müşterinin hesabını görüyordu ve hepsini açmak, kullanıcının hiç
       * istemediği hesapların kotasını yakardı. Bu yüzden keşif
       * `syncEnabled: false` yazıyor ve hangi hesabın izleneceğini kullanıcı
       * seçiyordu.
       *
       * Workspace modelinde bağlanan hesap MÜŞTERİNİN KENDİ hesabı: altından
       * çıkan reklam hesapları zaten o müşteriye ait ve hepsi isteniyor.
       * Ayrıca kullanıcının bağlandıktan sonra ikinci bir ekranda tek tek
       * anahtar açması, "bağladım ama veri gelmiyor" hâlinin en sık sebebiydi.
       *
       * HAVUZ BAĞLANTISI DIŞARIDA: `state.clientId` yoksa eski davranış
       * aynen sürüyor.
       */
      if (state.clientId) {
        await this.ilkVeriCekimi(connectionId, state.clientId, platform);
      }

      // İZİN AKIŞININ SONU — TEK YER (Paket F1, Ajan 4 N): izin yüzünden duran
      // veri kaynakları kendiliğinden yeniden denensin.
      await this.izinBekleyenKaynaklariKuyrukla(connectionId);

      /*
       * TAG MANAGER ENVANTERİ İZİN ANINDA (kullanıcı, 2026-10-15: "yetkiyi
       * aldığında 1 kez tarasa"). Kurulum seçicisi açılana kadar beklemek,
       * ilk açılışı yarım listeyle karşılamaktı. Düşerse bağlantı BOZULMAZ:
       * seçici ilk açılışta eksik hesapları zaten kuyruğa atıyor.
       */
      if (platform === 'google') {
        await this.gtmEnvanteri
          .izinleBaslat(connectionId, tokens.accessToken, tokens.grantedScopes, new Date())
          .catch((e: unknown) =>
            this.logger.warn(`Tag Manager envanteri başlatılamadı (bağlantı ${connectionId}): ${e instanceof Error ? e.message : String(e)}`),
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
          // Hedefli dönüş YENİ bağlantı değil: aynı satırın tazelenmesi.
          ...(state.targetConnectionId ? { yenidenYetki: true } : {}),
          ...discovered,
        },
        ...meta,
      });

      const q = new URLSearchParams({
        connection: missing.length ? 'eksik_izin' : 'basarili',
        platform,
        hesap: String(discovered.adAccounts),
        ...(olcumIstendi ? { izin: 'olcum' } : {}),
      });
      return { redirectPath: donusAdresi(backTo, q.toString()) };
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

      /*
       * KULLANICIYA GİDEN METİN HAM DEĞİL. `err.kind` hatanın geçici mi kalıcı
       * mı olduğunu zaten biliyor ve denetim kaydına da yazılıyor; ekrana
       * yalnızca platformun ham cümlesini basmak o bilgiyi çöpe atıyordu.
       * Üretimde görülen hâli "(#4) Application request limit reached" idi:
       * doğru, ama kullanıcı ne yapacağını bilmiyor ve genelde tekrar tekrar
       * deneyip kotayı daha da yakıyor.
       *
       * SINIR 200'DEN 300'E ÇIKTI: açıklama eklenince ham mesaj kırpılıyordu
       * ve kırpılan ilk şey `fbtrace` oluyordu — Meta'ya soru sorarken istenen
       * tek şey o.
       */
      /*
       * KENDİ CÜMLEMİZ KIRPILMAZ. 300 sınırı platformun ham (ve boyu
       * bilinmeyen) metni için; kimlik/izin reddi gibi bizim yazdığımız
       * cümleler ajans adıyla 300'ü aşıyordu ve kırpılan şey cümlenin SONU
       * oluyordu: "Bağlantı değiştirilmedi" ve ne yapılacağı (Ajan 4,
       * 2026-10-13 ölçüm: 328 karakter). Üst sınır yine var — adres sonsuz
       * uzamasın.
       */
      const q = new URLSearchParams({
        connection: 'hata',
        platform,
        mesaj: baglantiHatasiMetni(err).slice(0, err instanceof BadRequestException ? 800 : 300),
        ...(olcumIstendi ? { izin: 'olcum' } : {}),
      });
      return { redirectPath: donusAdresi(backTo, q.toString()) };
    }
  }

  /**
   * ═══ HEDEFLİ DÖNÜŞ — BAŞLATILAN BAĞLANTI TAZELENİR, YENİ SATIR AÇILMAZ ═══
   *
   * "Ölçüm izinlerini ver" ve "Yeniden yetkilendir" bir BAĞLANTIYA izin
   * ekliyor. Dönüş eskiden `persistConnection`a gidiyordu ve o, başlatanın
   * şirketi + platform kimliğiyle upsert ediyordu. Ajansın Google bağlantısı
   * ajans şirketinde; kullanıcı müşteri şirketinin Kurulum ekranından izin
   * verince tekil anahtar eşleşmedi ve O ŞİRKETTE yeni bir bağlantı açıldı.
   * Keşif ajans havuzunun kopyasını oraya yazdı, kurulum ise hâlâ ajansın
   * (yalnız `adwords` taşıyan) satırını okuduğu için düğme hiç kaybolmadı
   * (2026-10-13 üretim: üç deneme, üç şirket, 133–134'er havuz satırı).
   *
   * Üç kapı, hepsi YAZMADAN ÖNCE ve hepsi açık bir cümleyle:
   *   1. Kimlik — izni veren kişi bu bağlantının kişisi mi
   *      (`baglanti-kimligi.ts`; Google'da iki kimlik uzayı var).
   *   2. Zorunlu kapsam — Google'ın onay ekranında kutular tek tek
   *      kaldırılabiliyor. Ads izni düşmüş bir token'ı ajansın satırına
   *      yazmak, ona bağlı bütün hesapların senkronizasyonunu durdururdu.
   *   3. Satır var ve aynı platformda.
   * Sahiplik (`org_id`, `client_id`) ve `external_user_id` DEĞİŞMİYOR: bu bir
   * token tazelemesi, taşıma değil.
   */
  private async hedefBaglantiyiTazele(
    hedefId: string,
    platform: Platform,
    tokens: OAuthTokens,
    baslatan: { userId: string; orgId: string },
  ): Promise<string> {
    const hedef = await this.admin.platformConnection.findUnique({
      where: { id: hedefId },
      select: {
        id: true,
        orgId: true,
        clientId: true,
        platform: true,
        externalUserId: true,
        status: true,
        grantedScopes: true,
        organization: { select: { name: true } },
        connectedBy: { select: { fullName: true } },
      },
    });
    if (!hedef || hedef.platform !== platform) {
      throw new BadRequestException('Yetkilendirilecek bağlantı bulunamadı. Sayfayı yenileyip tekrar dene.');
    }

    const ad = PLATFORM_ADI[platform];
    /*
     * KİŞİNİN E-POSTASI BU CÜMLEDE YOK (Ajan 4, 2026-10-13). Metin dönüş
     * adresinin SORGU DİZESİNDE (`mesaj=`) taşınıyor: tarayıcı geçmişine,
     * sunucunun erişim kayıtlarına ve yönlendirme başlığına düşüyor. Ad
     * yeterli ipucu; e-posta bağlantı kartında zaten görünüyor.
     */
    const kimin = hedef.clientId === null ? `ajansın (${hedef.organization.name}) ${ad}` : `bu workspace’in ${ad}`;
    const kurucu = `Bağlantıyı kuran: ${hedef.connectedBy.fullName}.`;
    const karar = kimlikKarari(hedef.externalUserId, tokens);
    if (!karar.ayni) {
      const hesapIpucu = googleMusteriKimligiMi(hedef.externalUserId)
        ? ` (Google Ads ${googleMusteriEtiketi(hedef.externalUserId)} hesabına erişen)`
        : '';
      throw new BadRequestException(
        `Bağlantı değiştirilmedi: izin ekranında ${kimin} bağlantısının hesabı yerine başka bir ${ad} hesabı seçildi. ` +
          `Kuran hesapla${hesapIpucu} tekrar dene. ${kurucu}`,
      );
    }
    if (karar.kanit === 'hesap_erisimi') {
      // (b) kişi kanıtı değil — bkz. `eksikKokler`. Bağlantının beslediği
      // hesap ağaçlarının HEPSİNİ görmeyen token buraya yazılmaz.
      const kokler = await this.admin.$queryRaw<Array<{ kok: string }>>(Prisma.sql`
        SELECT DISTINCT COALESCE(manager_external_id, external_id) AS kok
          FROM ad_accounts
         WHERE connection_id = ${hedefId}::uuid AND client_id IS NOT NULL`);
      const eksik = eksikKokler(
        kokler.map((k) => k.kok),
        tokens.erisilebilirHesaplar,
      );
      if (eksik.length > 0) {
        throw new BadRequestException(
          `Bağlantı değiştirilmedi: seçilen ${ad} hesabı bu bağlantının beslediği ${eksik.length} hesap ağacını görmüyor ` +
            `(${eksik.slice(0, 3).map(googleMusteriEtiketi).join(', ')}${eksik.length > 3 ? ', …' : ''}). ` +
            `Bu token yazılsaydı o hesapların verisi dururdu. Kuran hesapla tekrar dene. ${kurucu}`,
        );
      }
    }

    const provider = this.provider(platform);
    const zorunluEksik = provider.requiredScopes.filter((s) => !tokens.grantedScopes.includes(s));
    if (zorunluEksik.length > 0) {
      throw new BadRequestException(
        `${ad} izin ekranında ${ad} reklam erişimi işaretsiz bırakıldı. Bağlantı değiştirilmedi; ` +
          'tekrar dene ve bütün kutuları işaretli bırak.',
      );
    }

    const access = this.vault.encrypt(tokens.accessToken);
    const refresh = tokens.refreshToken ? this.vault.encrypt(tokens.refreshToken) : null;
    // Şifreli eski token belleğe ALINMIYOR: yalnızca var olup olmadığı.
    const eskiYenileme = refresh
      ? false
      : (
          await this.admin.$queryRaw<Array<{ var: boolean }>>(Prisma.sql`
            SELECT refresh_token_enc IS NOT NULL AS var FROM platform_connections WHERE id = ${hedefId}::uuid`)
        )[0]?.var === true;

    /*
     * GERİ GETİRME DE İZ BIRAKIR. Kaldırma `connection.revoked` olarak
     * yazılıyordu, geri getirme hiç yazılmıyordu: 2026-10-15'te ajansın
     * kaldırılan Google bağlantısı bu yolla onarıldı ve denetim kaydında
     * bağlantı hâlâ "kaldırıldı" görünüyordu. Kayıt güncelleme ile AYNI
     * transaction'da: biri yazılıp diğeri düşerse iz yalan söyler.
     * Kayıt BAĞLANTININ şirketinde (kaldırma kaydıyla yan yana okunsun);
     * akışı hangi şirketten başlatıldığı `after` içinde.
     */
    await this.admin.$transaction(async (a) => {
      await a.platformConnection.update({
        where: { id: hedefId },
        data: {
          accessTokenEnc: access.data,
          // Google yenileme yanıtında refresh token göndermeyebilir; eskisini
          // null ile ezmek bağlantıyı kurtarılamaz yapar.
          ...(refresh ? { refreshTokenEnc: refresh.data } : {}),
          keyVersion: access.keyVersion,
          tokenExpiresAt: tokens.expiresAt ?? null,
          authorizationExpiresAt: yetkiBitisi({
            yenilemeVar: refresh !== null || eskiYenileme,
            erisimBitisi: tokens.expiresAt,
            yenilemeBitisi: tokens.refreshTokenExpiresAt,
          }),
          // Google `include_granted_scopes=true` ile BİRLEŞİK izni döndürüyor:
          // önceki `adwords` + yeni ölçüm kapsamları.
          grantedScopes: tokens.grantedScopes,
          status: 'active',
          failureCount: 0,
          lastErrorCode: null,
          lastErrorAt: null,
          lastVerifiedAt: new Date(),
          revokedAt: null,
        },
      });
      await a.auditLog.create({
        data: {
          orgId: hedef.orgId,
          clientId: hedef.clientId,
          actorType: 'user',
          actorId: baslatan.userId,
          action: 'connection.reauthorized',
          targetType: 'platform_connection',
          targetId: hedef.id,
          before: { status: hedef.status, grantedScopes: hedef.grantedScopes },
          after: { status: 'active', grantedScopes: tokens.grantedScopes, baslatanOrgId: baslatan.orgId },
        },
      });
    });
    return hedef.id;
  }

  /**
   * ═══ AYNI KİMLİK BAŞKA BİR SATIR OLARAK AÇILMAZ ═══
   *
   * Tekil anahtar `(org, platform, external_user_id)`: (1) ŞİRKET başına,
   * (2) Google'da kimliğin hangi uzaydan yazıldığına bağlı. İkisi birlikte
   * ajansın kimliğinin müşteri şirketinde ikinci bağlantı olarak açılmasına
   * izin veriyordu ve keşif ajans havuzunu o şirkete kopyalıyordu. Kural
   * CLAUDE.md'de ("AJANSIN BAĞLANTISI BİR KEZ KURULUR") ama yalnız aynı
   * şirkette ve yalnız birebir eşit kimlikte zorlanıyordu.
   *
   * Bakılan yer: bu şirketin ve AJANSININ bağlantıları. Kardeş müşteri
   * şirketleri bilerek dışarıda — onların kendi bağlantıları kendi işi.
   * Eşleşme yoksa `null`; varsa kullanıcıya gösterilecek cümle.
   */
  private async ayniKimlikBaskaSatirda(orgId: string, platform: Platform, tokens: OAuthTokens): Promise<string | null> {
    const [a] = await this.admin.$queryRaw<Array<{ ajans_org_id: string | null }>>(Prisma.sql`
      SELECT m.ajans_org_id::text AS ajans_org_id
        FROM organizations o JOIN manager_accounts m ON m.id = o.manager_account_id
       WHERE o.id = ${orgId}::uuid`);
    const ajansOrgId = a?.ajans_org_id ?? null;
    const orgler = ajansOrgId && ajansOrgId !== orgId ? [orgId, ajansOrgId] : [orgId];

    const adaylar = await this.admin.platformConnection.findMany({
      /*
       * KALDIRILMIŞ SATIRLAR DA ADAY (2026-10-15). Eskiden dışarıdaydı ve
       * ajansın kaldırılan Google bağlantısı için "Bağlan" yeni bir satır
       * açıyordu (Google'da kimlik başka uzaydan yazılınca tekil anahtar
       * eşleşmiyor): 56 atanmış hesap ESKİ satırda kaldı, yeni satır yalnız
       * havuz kopyası getirdi ve ekran "bağlı" dedi. Kaldırılmış satırın
       * çaresi o satırın kendisini yeniden yetkilendirmek; yeni satır değil.
       */
      where: { orgId: { in: orgler }, platform: platform as PrismaPlatform },
      select: { orgId: true, externalUserId: true, status: true, organization: { select: { name: true } } },
    });
    // CANLI SATIR ÖNCE: aynı kimliğin hem canlı hem kaldırılmış satırı varsa
    // kullanıcıyı çalışan bağlantıya göndermek doğru cevap.
    const eslesenler = adaylar.filter((c) => kimlikKarari(c.externalUserId, tokens).ayni);
    const eslesen = eslesenler.find((c) => c.status !== 'revoked') ?? eslesenler[0];
    if (!eslesen) return null;

    const ad = PLATFORM_ADI[platform];
    if (eslesen.status === 'revoked') {
      return (
        `Bu ${ad} hesabının bağlantısı ${eslesen.organization.name} şirketinde kaldırılmış ve atanmış hesaplar o bağlantıda duruyor. ` +
        `Yeni bağlantı açılmadı: Ayarlar › Platform bağlantıları’nda kaldırılmış bağlantının "Yeniden bağlan" düğmesini kullan.`
      );
    }
    // Ölçüm izni yalnız Google'da ayrı bir akış; diğerlerinde not yok.
    const olcumNotu = OLCUM_IZNI_NOTU[platform] ?? '';
    if (eslesen.orgId !== orgId) {
      return (
        `Bu ${ad} hesabı zaten ajansın bağlantısı olarak bağlı (${eslesen.organization.name}). ` +
        `Aynı kimliği şirket başına yeniden bağlamak gerekmiyor: ajansın bağlantısı bu şirkete de hizmet ediyor.${olcumNotu}`
      );
    }
    return (
      `Bu ${ad} hesabı bu şirkette zaten bağlı. Yeni bağlantı yerine Ayarlar › Platform bağlantıları’nda ` +
      `o bağlantının "Yeniden yetkilendir" düğmesini kullan.${olcumNotu}`
    );
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
    tokens: OAuthTokens,
  ): Promise<string> {
    /*
     * ═══ SAHİPLİK DEĞİŞTİRİLEMEZ — SESSİZ YANLIŞ WORKSPACE'İN ÖNÜ ═══
     *
     * Aşağıdaki `upsert`'ün `update` dalı `clientId`'ye DOKUNMUYOR (ve
     * dokunmamalı: token tazelemesi sahipliği değiştirmemeli). Ama bu, kontrol
     * edilmezse şu sessiz hatayı üretiyordu:
     *
     *   1. Meta hesabı X, "Ege Birlik Yapı" workspace’ine bağlanır.
     *   2. Kullanıcı "Fenbay"ı seçip AYNI Meta hesabıyla yetkilendirir.
     *   3. Tekillik `orgId_platform_externalUserId` üzerinde: aynı satır
     *      bulunur, `update` koşar, token tazelenir — ama `client_id` HÂLÂ
     *      Ege'dir.
     *   4. `discoverAndStore` bağlantının `clientId`'sini okuyor: Fenbay için
     *      keşfedilen bütün hesaplar EGE'YE yazılır.
     *
     * Ekran "bağlandı" der, kullanıcı Fenbay'a bağladığını sanır, hesaplar
     * başka workspace’te görünür. Hata yok, log yok.
     *
     * NULL → workspace geçişi de reddediliyor: bugün havuzda duran bağlantının
     * altında 157 hesap var ve çoğu BAŞKA müşterilere ait. Onu tek bir
     * workspace’e işaretlemek, sonraki keşiflerin hepsini o workspace’e
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

    // Satır yoksa: aynı kişi başka bir kimlik uzayıyla ya da ajansın
    // şirketinde zaten bağlı mı (bkz. `ayniKimlikBaskaSatirda`).
    if (!mevcut) {
      const engel = await this.ayniKimlikBaskaSatirda(orgId, platform, tokens);
      if (engel) throw new BadRequestException(engel);
    }

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

    /*
     * YETKİNİN GERÇEK BİTİŞİ (`yetki-bitisi.ts`). Yeniden bağlanmada Google
     * refresh token'ı her zaman GÖNDERMİYOR ve aşağıdaki `update` eskisini
     * koruyor; yani "yenileme var mı" sorusu yanıta değil satıra da
     * soruluyor. Şifreli token belleğe ALINMIYOR: SQL yalnızca var olup
     * olmadığını döndürüyor.
     */
    const eskiYenileme =
      !refresh && mevcut
        ? (
            await this.admin.$queryRaw<Array<{ var: boolean }>>(Prisma.sql`
              SELECT refresh_token_enc IS NOT NULL AS var
                FROM platform_connections
               WHERE org_id = ${orgId}::uuid
                 AND platform = ${platform}::"Platform"
                 AND external_user_id = ${tokens.externalUserId}
            `)
          )[0]?.var === true
        : false;
    const authorizationExpiresAt = yetkiBitisi({
      yenilemeVar: refresh !== null || eskiYenileme,
      erisimBitisi: tokens.expiresAt,
      yenilemeBitisi: tokens.refreshTokenExpiresAt,
    });

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
        authorizationExpiresAt,
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
        authorizationExpiresAt,
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
   * TEK BİR REKLAM HESABI İÇİN geçmiş veriyi kuyruğa alır.
   *
   * `ilkVeriCekimi`nin tek hesaplık eşi: orada bağlantı kurulurken bütün
   * hesaplar, burada ATAMA anında yalnızca atanan hesap.
   *
   * NEDEN ATAMADA: müşterilerin kendi Facebook hesabı yok, dolayısıyla
   * bağlantı ajans seviyesinde kalmak zorunda (aynı Meta kimliği tek satır).
   * Bir workspace’in verisi bağlanınca değil, HESAP ONA ATANINCA başlıyor.
   * Ata → izlemeyi aç → bekle üçlüsü, kullanıcının "angarya" dediği şeydi ve
   * ikinci adımı atlamak "atadım ama veri gelmiyor" hâlini üretiyordu.
   *
   * TRANSACTION'IN DIŞINDA ÇAĞRILIYOR: kuyruk Redis'e gidiyor ve Prisma'nın
   * etkileşimli transaction sınırı 5 saniye.
   */
  private async hesabaGecmisiKuyrukla(
    clientId: string,
    platform: Platform,
    adAccountId: string,
  ): Promise<void> {
    try {
      const bugun = new Date();
      const baslangic = new Date(bugun.getTime() - 90 * 86_400_000);
      const gun = (d: Date): string => d.toISOString().slice(0, 10);

      /*
       * ═══ ÖNCE AĞAÇ, SONRA METRİK — VE ÖNCELİK BUNU GARANTİ ETMİYOR ═══
       *
       * Metrik satırı, ait olduğu kampanya satırı veritabanında yoksa
       * YAZILAMIYOR. Bu iki iş bir süre art arda, gecikmesiz kuyruğa
       * giriyordu ve "sıra" yalnızca ÖNCELİKLE (structure 4, backfill 10)
       * sağlanıyordu. Öncelik bir BAĞIMLILIK DEĞİL: worker dört işi paralel
       * çalıştırıyor, yani yapı işi hâlâ koşarken metrik işi ikinci bir
       * slotta başlayabiliyor. Sonuç canlıda görüldü — bütün metrikler
       * eşlenemeyip atlanıyor, iş `succeeded` + `rows=0` kapanıyor ve BİR
       * DAHA denenmiyordu. Belirtisi tam olarak "atadım, veri gelmiyor".
       *
       * İKİ KATMANLI ÇÖZÜM, ÇÜNKÜ TEK BAŞINA HİÇBİRİ YETMİYOR:
       *
       *   1. GECİKME (burada) — yarışın çoğunu ortadan kaldırıyor. Ama bir
       *      GARANTİ DEĞİL: yapı taraması yavaş bir hesapta 90 saniyeyi de
       *      aşabilir.
       *   2. GERÇEK GÜVENCE `insights-sync.service.ts` içinde: hiçbir satır
       *      yazılamadıysa ve o hesapta yapı taraması hiç koşmadıysa iş
       *      BAŞARILI SAYILMIYOR, tekrar denenebilir hata veriyor ve BullMQ
       *      artan bekleme ile yeniden deniyor.
       *
       * Gecikme olmasaydı 2. katman işi kurtarırdı ama her seferinde bir
       * başarısız deneme ve boşa giden bir API turu pahasına.
       */
      await this.queue.enqueue({ clientId, platform, jobType: 'structure', adAccountId });
      await this.queue.enqueue({
        clientId,
        platform,
        jobType: 'initial_backfill',
        adAccountId,
        entityLevel: 'campaign',
        dateFrom: gun(baslangic),
        dateTo: gun(bugun),
        delayMs: YAPI_ICIN_TANINAN_SURE_MS,
      });
      this.logger.log(
        `Reklam hesabı ${adAccountId} workspace’e atandı: izleme açıldı, 90 günlük geçmiş kuyruğa eklendi`,
      );
    } catch (err) {
      /*
       * ATAMAYI GERİ ALMIYORUZ ama sessiz de kalmıyoruz. Atama yazıldı ve
       * doğru; eksik olan yalnızca geçmiş verinin tetiklenmesi ve o
       * "Şimdi güncelle" ile tekrar denenebilir. Belirtisi "atadım, eski veri
       * gelmedi" olur ve sebebi burada yazılı.
       */
      this.logger.error(
        `Atama sonrası geçmiş veri kuyruğa alınamadı (hesap ${adAccountId}): ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Bağlantı kurulur kurulmaz izlemeyi açar ve GEÇMİŞ VERİYİ kuyruğa alır.
   *
   * ÜÇ İŞ, BU SIRAYLA VE SIRA ÖNEMLİ:
   *   1. `syncEnabled` açılıyor — kapalı hesap hiçbir taramaya girmiyor.
   *   2. `structure` — kampanya/reklam seti/reklam ağacı. Metrikler bu
   *      satırlara bağlanıyor; önce metrik çekmek, bağlanacak satırı olmayan
   *      veri demek.
   *   3. `initial_backfill` — 90 günlük geçmiş, KAMPANYA seviyesinde. Reklam
   *      seviyesinde 90 gün çekmek yeni bir hesabın kotasını saatlerce
   *      bloklar (`insights-sync.service.ts` bu kararı taşıyor).
   *
   * HATA YUTULMUYOR AMA BAĞLANTIYI DA DÜŞÜRMÜYOR: bu noktada token
   * kaydedildi ve kullanıcı bağlandı. Kuyruk erişilemezse bağlantıyı geri
   * almak, çalışan bir yetkilendirmeyi çöpe atmak olurdu — ama sessiz
   * kalmak da olmaz, çünkü belirtisi "bağladım, veri gelmiyor" oluyor ve
   * sebebi kodda aranıyor.
   */
  private async ilkVeriCekimi(
    connectionId: string,
    clientId: string,
    platform: Platform,
  ): Promise<void> {
    try {
      // İZLEMEYİ AÇ. Yalnızca BU bağlantının ve BU müşterinin hesapları —
      // aynı workspace’e ait başka bir bağlantının hesaplarına dokunmuyoruz.
      await this.admin.adAccount.updateMany({
        where: { connectionId, clientId },
        data: { syncEnabled: true },
      });

      const accounts = await this.admin.adAccount.findMany({
        where: { connectionId, clientId },
        select: { id: true, name: true },
      });

      // Sosyal profillerde de izleme açılıyor: organik gönderi süpürmesi
      // (Akıllı Boost'un beslendiği yer) buna bakıyor.
      await this.admin.socialProfile.updateMany({
        where: { connectionId, clientId },
        data: { syncEnabled: true },
      });

      /*
       * ═══ GÖNDERİLER DE HEMEN ÇEKİLİYOR ═══
       *
       * İzlemeyi açmak tek başına yetmiyordu: organik süpürme zamanlanmış bir
       * iş ve yeni kurulan bir workspace bir sonraki turu BEKLİYORDU. Bu
       * sürede Akıllı Boost ekranı boş duruyor ve kullanıcı bunu "çalışmıyor"
       * diye okuyor — bildirilen belirti buydu.
       *
       * Kuyruğa alınan iş gönderileri çekiyor; `enqueueForProfile` de aynı
       * işin sonunda koşuyor ve ön ayar varsa son gönderileri KART hâline
       * getiriyor (tek seferlik ilk çekim).
       */
      const profiller = await this.admin.socialProfile.findMany({
        where: {
          connectionId,
          clientId,
          /*
           * YOUTUBE KANALI BU LİSTEYE GİREMEZ.
           *
           * Organik süpürme Meta'nın gönderi uçlarını çağırıyor ve bir
           * YouTube kanalı oraya düştüğünde iş KALICI olarak düşüyor
           * (`organic-sync.service.ts` açıkça patlıyor). Kanal aynı Google
           * bağlantısının altında yaşadığı için süzgeçsiz bir sorgu onu
           * yakalıyordu: Google reklam hesabı atanan her workspace'te,
           * panelde sebebi yazmayan başarısız bir iş kalırdı.
           *
           * Liste AÇIK uçlu değil: yeni bir profil türü eklendiğinde
           * varsayılan DIŞARIDA kalmak, yanlış uca gitmekten iyi.
           */
          profileType: { in: ['facebook_page', 'instagram_business'] },
        },
        select: { id: true },
      });
      for (const p of profiller) {
        await this.queue.enqueue({
          clientId,
          platform,
          jobType: 'organic_posts',
          socialProfileId: p.id,
          // Kullanıcı ekranda bekliyor: takılmış bir iş varsa kaldırılıp
          // yenisi konsun.
          interactive: true,
        });
      }

      const bugun = new Date();
      const baslangic = new Date(bugun.getTime() - 90 * 86_400_000);
      const gun = (d: Date): string => d.toISOString().slice(0, 10);

      for (const a of accounts) {
        await this.queue.enqueue({
          clientId,
          platform,
          jobType: 'structure',
          adAccountId: a.id,
        });
        await this.queue.enqueue({
          clientId,
          platform,
          jobType: 'initial_backfill',
          adAccountId: a.id,
          entityLevel: 'campaign',
          dateFrom: gun(baslangic),
          dateTo: gun(bugun),
        });
      }

      // KAÇ HESAP AÇILDIĞI YAZILIYOR. Sessiz kesme yok: sıfır hesapla dönen
      // bir bağlantı ("izin verilen hesap yok") ile onlarca hesaplı bir
      // bağlantı panelde aynı görünüyor.
      this.logger.log(
        `Bağlantı ${connectionId}: ${accounts.length} reklam hesabı izlemeye alındı, ` +
          `90 günlük geçmiş kuyruğa eklendi`,
      );
    } catch (err) {
      this.logger.error(
        `İlk veri çekimi kurulamadı (bağlantı ${connectionId}): ` +
          `${err instanceof Error ? err.message : String(err)}. ` +
          'Bağlantı KURULDU ama geçmiş veri gelmeyecek; "Hesapları yenile" ile tekrar denenebilir.',
      );
    }
  }

  /**
   * Reklam hesaplarını ve sosyal profilleri keşfeder.
   *
   * KRİTİK: keşfedilen hesaplar `syncEnabled: false` ile kaydedilir. 40 hesaplı
   * bir Business Manager'ı bağlayan biri istemeden 40 hesabın API kotasını
   * yakmasın — hangi hesapların izleneceğini kullanıcı açıkça seçer.
   */
  /**
   * ═══ ZAMANLANMIŞ HESAP DURUMU TAZELEME ═══
   *
   * Reklam hesabının PLATFORMDAKİ durumu (`account_status`, `customer.status`)
   * yalnızca kullanıcı elle "Hesapları yenile" dediğinde yazılıyordu:
   * `listAdAccounts`ı çağıran tek yol oydu. Yani bir hesabın ödemesi bugün
   * alınmasa panel bunu haftalarca öğrenmiyordu ve uyarı bandı doğru ama
   * BAYAT bir bilgi gösteriyordu.
   *
   * TENANT BAĞLAMI YOK ve olamaz: zamanlanmış iş bir kullanıcının adına
   * koşmuyor. `discoverAndStore` zaten `PrismaAdminService` üzerinden
   * yazıyor (BYPASSRLS) — worker ve webhook'un kullandığı yolun aynısı.
   *
   * BİR BAĞLANTININ DÜŞMESİ DİĞERLERİNİ DURDURMUYOR. Sekiz bağlantının
   * ikincisi token hatası verirse kalan altısının hesapları da tazelenmeli;
   * hata sayılıyor ve çağırana bildiriliyor, çünkü "tazelendi" deyip
   * yarısını atlamak sessiz hatanın ta kendisi.
   */
  async tumBaglantilariTazele(): Promise<{
    baglanti: number;
    basarili: number;
    hatalar: Array<{ connectionId: string; platform: string; mesaj: string }>;
  }> {
    const baglantilar = await this.admin.platformConnection.findMany({
      where: { status: 'active', revokedAt: null },
      select: { id: true, platform: true },
    });

    const hatalar: Array<{ connectionId: string; platform: string; mesaj: string }> = [];
    let basarili = 0;

    for (const conn of baglantilar) {
      const platform = conn.platform as Platform;
      try {
        const provider = this.provider(platform);
        const token = await this.vault.getAccessToken(conn.id, provider);
        await this.discoverAndStore(conn.id, platform, token);
        await this.vault.recordSuccess(conn.id);
        basarili += 1;
      } catch (err) {
        /*
         * BAŞARISIZLIK BAĞLANTIYA DA YAZILIYOR. Yalnızca sayıp geçmek,
         * `failure_count` ve `last_error_code` alanlarını bu yolda hiç
         * güncellemeyecekti ve bağlantı sağlığı ekranı elle yenilemeye
         * bağımlı kalırdı.
         */
        await this.vault.recordFailure(conn.id, err);
        hatalar.push({
          connectionId: conn.id,
          platform,
          mesaj: err instanceof Error ? err.message : 'bilinmeyen hata',
        });
      }
    }

    return { baglanti: baglantilar.length, basarili, hatalar };
  }

  /**
   * ÖDEME TETİĞİ — hesap durumu yazıldıktan HEMEN sonra.
   *
   * HATASI KEŞFİ DÜŞÜRMÜYOR. Hesaplar zaten yazıldı; bir SMTP ya da
   * sorgu hatası yüzünden bağlantı dönüşünü "başarısız" göstermek, çalışan
   * bir bağlantıyı bozuk gösterirdi. Ama sessiz de değil: log'a yazılıyor
   * ve tetik bir sonraki nabızda (en geç 15 dakika) aynı hesaplara yeniden
   * bakıyor, çünkü damga yalnızca mail GİTTİĞİNDE kalıyor.
   */
  private async odemeTetiginiCek(adAccountIds: string[]): Promise<string> {
    try {
      const r = await this.odemeTetigi.degerlendir(adAccountIds);
      return r.not;
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      this.logger.error(`Ödeme tetiği çalışmadı (${adAccountIds.length} hesap): ${mesaj}`);
      return `ÖDEME TETİĞİ ÇALIŞMADI: ${mesaj}`;
    }
  }

  /**
   * ═══ ÖDEME NABZI — atanmış hesapların yalnızca platform durumu ═══
   *
   * Tam tazeleme (`tumBaglantilariTazele`) günde iki kez koşuyor ve bir
   * bağlantının BÜTÜN hesaplarını ve sayfalarını sayfa sayfa listeliyor
   * (havuzda yüzlerce hesap, yüzlerce sayfa). "(#4) Application request
   * limit reached" bu projede zaten yaşandı; o listeyi 15 dakikaya indirmek
   * aynı duvara daha sık çarpmak demekti.
   *
   * Nabız yalnızca MÜŞTERİYE ATANMIŞ ve workspace'i AKTİF hesapları soruyor
   * ve yalnızca durum alanlarını istiyor. Sağlayıcı bunu desteklemiyorsa
   * (LinkedIn) o bağlantı atlanıyor ve notta yazıyor: o platformda ödeme
   * sorunu hâlâ yalnızca günde iki kezlik tam tazelemede görülüyor.
   *
   * YAZILAN ŞEY `status` VE `raw` İÇİNDEKİ DURUM ALANLARI. `raw` birleştirilerek
   * yazılıyor: üzerine yazmak keşfin getirdiği adı, para birimini, işletme
   * bilgisini silerdi.
   */
  async odemeDurumlariniTazele(): Promise<{ hesap: number; not: string }> {
    const hesaplar = await this.admin.adAccount.findMany({
      where: {
        clientId: { not: null },
        client: { status: 'active' },
        connection: { status: 'active', revokedAt: null },
      },
      select: {
        id: true,
        externalId: true,
        managerExternalId: true,
        raw: true,
        connectionId: true,
        platform: true,
      },
    });

    const baglantiya = new Map<string, typeof hesaplar>();
    for (const h of hesaplar) {
      const g = baglantiya.get(h.connectionId) ?? [];
      g.push(h);
      baglantiya.set(h.connectionId, g);
    }

    let okunan = 0;
    let degisen = 0;
    const atlanan: string[] = [];
    const hatalar: string[] = [];

    for (const [connectionId, grup] of baglantiya) {
      const platform = grup[0]!.platform as Platform;
      const provider = this.provider(platform);
      if (!provider.hesapDurumlari) {
        atlanan.push(`${platform} (${grup.length} hesap)`);
        continue;
      }
      try {
        const token = await this.vault.getAccessToken(connectionId, provider);
        const okuma = await provider.hesapDurumlari(
          token,
          grup.map((h) => ({ externalId: h.externalId, managerExternalId: h.managerExternalId })),
        );
        hatalar.push(...okuma.hatalar.map((m) => `${platform}: ${m}`));
        const hedef = new Map(grup.map((h) => [h.externalId, h]));
        for (const d of okuma.durumlar) {
          const h = hedef.get(d.externalId);
          if (!h) continue;
          okunan++;
          const eskiRaw =
            h.raw !== null && typeof h.raw === 'object' && !Array.isArray(h.raw)
              ? (h.raw as Record<string, unknown>)
              : {};
          const yeniRaw = { ...eskiRaw, ...d.rawYama };
          const r = await this.admin.adAccount.updateMany({
            where: { id: h.id },
            data: { status: d.status, raw: yeniRaw as Prisma.InputJsonValue },
          });
          degisen += r.count;
        }
      } catch (err) {
        /*
         * BAĞLANTININ SAĞLIK SAYACINA YAZILMIYOR. Nabız günde 96 kez koşuyor;
         * her geçici hatayı `failure_count`a yazmak bağlantı ekranını gürültüye
         * boğardı. Tam tazeleme (günde iki kez) sağlığı zaten yazıyor.
         */
        hatalar.push(`${platform}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    /*
     * TETİK OKUNAN HER HESAP İÇİN — yalnızca değişenler için değil. Damga
     * bir sonraki kontrolde yeniden denenmek üzere geri alınmış olabilir
     * (mail gidemedi) ve o hesapta durum DEĞİŞMEMİŞ olacak.
     */
    const tetik = await this.odemeTetiginiCek(hesaplar.map((h) => h.id));

    const not =
      `${okunan}/${hesaplar.length} hesabın durumu okundu · ${tetik}` +
      (atlanan.length > 0 ? ` · nabız desteklenmiyor: ${atlanan.join(', ')}` : '') +
      (hatalar.length > 0 ? ` · ${hatalar.length} hata: ${hatalar.join('; ')}` : '');
    return { hesap: degisen, not: not.slice(0, 500) };
  }

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

    /*
     * K3 — ATANMIŞ SATIRIN BAĞLANTISI KEŞİFLE ELE GEÇİRİLMİYOR.
     *
     * Var olan satırlar TEK sorguda okunuyor: hesap başına ayrı bir okuma,
     * 481 hesaplık bir havuzda her yenilemede 481 ek tur demekti. Kararın
     * gerekçesi `hesap-sahipligi.ts#baglantiKorunsunMu`.
     */
    const mevcutHesaplar = new Map(
      (
        await this.admin.adAccount.findMany({
          where: {
            orgId: conn.orgId,
            platform: platform as PrismaPlatform,
            externalId: { in: accounts.map((a) => a.externalId) },
          },
          select: {
            externalId: true,
            clientId: true,
            connectionId: true,
            connection: { select: { status: true } },
          },
        })
      ).map((r) => [r.externalId, r]),
    );

    const yazilanHesaplar: string[] = [];
    for (const a of accounts) {
      const mevcut = mevcutHesaplar.get(a.externalId);
      const koru =
        mevcut !== undefined &&
        baglantiKorunsunMu({
          mevcutClientId: mevcut.clientId,
          mevcutConnectionId: mevcut.connectionId,
          mevcutBaglantiDurumu: mevcut.connection.status,
          yeniConnectionId: connectionId,
        });
      const yazilan = await this.admin.adAccount.upsert({
        select: { id: true },
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
          //
          // `connectionId` de ATANMIŞ satırda korunuyor (K3): yazılsaydı
          // müşterinin kendi bağlantısı ajansın atadığı hesabı devralır ve
          // müşteri bağlantısını kaldırdığında o hesabın verisi dururdu.
          ...(koru ? {} : { connectionId }),
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          status: a.status,
          managerExternalId: a.managerExternalId ?? null,
          raw: a.raw as Prisma.InputJsonValue,
        },
      });
      yazilanHesaplar.push(yazilan.id);
    }

    await this.odemeTetiginiCek(yazilanHesaplar);

    let socialCount = 0;
    if (platform === 'meta') {
      const profiles = await provider.listSocialProfiles(accessToken);

      // K3 sayfalarda da — aynı gerekçe, aynı tek sorgu.
      const mevcutSayfalar = new Map(
        (
          await this.admin.socialProfile.findMany({
            where: { orgId: conn.orgId, externalId: { in: profiles.map((p) => p.externalId) } },
            select: {
              externalId: true,
              clientId: true,
              connectionId: true,
              connection: { select: { status: true } },
            },
          })
        ).map((r) => [r.externalId, r]),
      );

      for (const p of profiles) {
        const mevcut = mevcutSayfalar.get(p.externalId);
        const koru =
          mevcut !== undefined &&
          baglantiKorunsunMu({
            mevcutClientId: mevcut.clientId,
            mevcutConnectionId: mevcut.connectionId,
            mevcutBaglantiDurumu: mevcut.connection.status,
            yeniConnectionId: connectionId,
          });
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
            //
            // ATANMIŞ SAYFADA İKİSİ DE KORUNUYOR (K3): bağlantı ve onun sayfa
            // token'ı birlikte gidiyor. Yalnızca bağlantıyı koruyup token'ı
            // yazmak, sayfanın bir bağlantıya ait görünüp başkasının
            // token'ıyla yayın yapması demekti.
            ...(koru ? {} : { connectionId }),
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
            ...(pageToken && !koru
              ? { pageAccessTokenEnc: pageToken.data, keyVersion: pageToken.keyVersion }
              : {}),
            raw: p.raw as Prisma.InputJsonValue,
          },
        });
        socialCount++;
      }
    }

    /*
     * WORKSPACE BAĞLANTISI SAHİPSİZ SATIRLARI SAHİPLENİYOR.
     *
     * Yukarıdaki upsert'ler `clientId`'yi BİLEREK güncellemiyor ve bu havuz
     * modelinde doğruydu: "Hesapları yenile" yapılmış müşteri atamalarını
     * sessizce havuza geri döndürmemeli.
     *
     * Ama tekil anahtar BAĞLANTIYA DEĞİL ORGANİZASYONA bağlı
     * (`platform + externalId + orgId`), yani havuz döneminde keşfedilmiş bir
     * hesap, müşterinin kendi Meta hesabıyla yeniden bağlanınca İKİNCİ SATIR
     * AÇMIYOR — var olan satır güncelleniyor ve `connectionId` yeni bağlantıya
     * geçiyor. `clientId` ise NULL kalıyordu.
     *
     * Sonucu sessizdi: satırın bağlantısı yeni workspace’i gösteriyor,
     * ataması ise hâlâ boş. `ilkVeriCekimi` hesapları
     * `{ connectionId, clientId }` ile arıyor, eşleşme olmuyor, izleme
     * açılmıyor ve geçmiş veri kuyruğa girmiyor. Kullanıcı "bağlandı" görüyor
     * ve hiçbir veri gelmiyor — bu üründeki en pahalı hata tipi.
     *
     * YALNIZCA SAHİPSİZ (`clientId IS NULL`) SATIRLAR SAHİPLENİLİYOR. Başka
     * bir müşteriye ATANMIŞ bir hesabı buradan taşımak, iki müşterinin Meta
     * hesabının aynı reklam hesabını görmesi gibi gerçek bir belirsizliği
     * sessizce çözmek olurdu; o durum insan kararı ister ve aşağıda log'a
     * yazılıyor.
     */
    if (conn.clientId) {
      const [hesap, profil] = await Promise.all([
        this.admin.adAccount.updateMany({
          where: { connectionId, clientId: null },
          data: { clientId: conn.clientId },
        }),
        this.admin.socialProfile.updateMany({
          where: { connectionId, clientId: null },
          data: { clientId: conn.clientId },
        }),
      ]);

      const cakisan = await this.admin.adAccount.count({
        where: { connectionId, clientId: { not: conn.clientId } },
      });

      this.logger.log(
        `Bağlantı ${connectionId}: ${hesap.count} reklam hesabı ve ${profil.count} sayfa ` +
          `bu workspace’e sahiplendirildi` +
          (cakisan > 0
            ? `. DİKKAT: ${cakisan} hesap BAŞKA bir workspace’e atanmış ve taşınmadı — ` +
              'aynı reklam hesabı iki workspace’in Meta hesabında görünüyor, elle karar verilmeli'
            : ''),
      );
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

  /** Özel/benzer kitleler — aynı kapı. Boş liste geçerli bir cevap. */
  async listCustomAudiences(ctx: TenantContext, adAccountId: string): Promise<CustomAudienceList> {
    const { provider, fetchCtx } = await this.lookupContext(ctx, adAccountId);
    const items = await provider.listCustomAudiences(fetchCtx);
    return { items, total: items.length };
  }

  /** İlgi alanı araması — konum aramasıyla aynı kapı (hesap üzerinden, RLS'li). */
  async searchInterests(
    ctx: TenantContext,
    adAccountId: string,
    query: string,
  ): Promise<InterestOption[]> {
    const { provider, fetchCtx } = await this.lookupContext(ctx, adAccountId);
    return provider.searchInterests(fetchCtx, query);
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
        'Bu reklam hesabı henüz bir workspace’e atanmamış. Ayarlar › Platform bağlantıları ' +
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
          `"${before.name}" henüz bir workspace’e atanmamış. Önce hesabı bir ` +
            `workspace’e atayın; atanmamış hesap senkronize edilmez.`,
        );
      }

      const after = await tx.adAccount.update({
        where: { id: adAccountId },
        data: { syncEnabled },
      });
      // İzleme kapanınca hesaplama da duruyor: açık sinyaller bir daha hiç
      // kapanmazdı (sinyal/hesap-sinyalleri.ts, Ajan 4 Ö3).
      if (!syncEnabled) await hesapSinyalleriniKapat(tx, adAccountId, IZLEME_KAPANDI_NOTU);

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
          `"${before.name}" henüz bir workspace’e atanmamış. Önce sayfayı bir ` +
            `workspace’e atayın; atanmamış sayfanın gönderileri çekilmez.`,
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

        /*
         * PROFİL TÜRÜ HESABIN PLATFORMUNU BELİRLİYOR. Sayfa ve Instagram
         * boost'u Meta'dan, YouTube videosu Google Ads'ten yayınlanıyor.
         * Kapı bir süre YALNIZCA Meta kabul ediyordu: YouTube kanalına Google
         * hesabı hiçbir ekrandan bağlanamıyordu ve kart "doğru hesabı seç"
         * diyordu — seçilemeyen bir şeyi.
         */
        const beklenen = PROFIL_REKLAM_PLATFORMU[before.profileType as SocialProfileTypeValue];
        if (!beklenen || account.platform !== beklenen.platform) {
          throw new BadRequestException(
            beklenen?.hata ?? 'Bu profil türü bir reklam hesabına bağlanamıyor.',
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
            'Reklam hesabı bu sayfanın workspace’ine atanmamış. Aynı workspace’te ' +
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
  /**
   * HEDEF WORKSPACE'İN ŞİRKETİ — `ctx.orgId` DEĞİL.
   *
   * ═══ BU FONKSİYON BİR ÜRETİM HATASINDAN DOĞDU ═══
   *
   * Atama yolları `org_id` kolonuna `ctx.orgId` yazıyordu ve gerekçesi
   * yazılıydı: "clientId yukarıda ctx.clientIds listesine karşı doğrulandı,
   * yani hedef workspace AKTİF şirkette". O cümle "Tüm şirketler" modunda
   * DOĞRU DEĞİL. `ctx.clientIds` orada bütün kardeş şirketlerin
   * workspace'lerini taşıyor ama `ctx.orgId` EV ŞİRKETİ olarak kalıyor
   * (`tenant-context.service.ts` bunu bilerek yapıyor: okuma kapsamı
   * genişliyor, yazma tek şirkete çivili).
   *
   * Sonuç: üst hesap "Tüm şirketler" moduyla çalışırken başka bir şirketin
   * workspace'ine hesap/sayfa/kanal atamak `(client_id, org_id)` kompozit
   * yabancı anahtarını ihlal ediyor ve panelde YALNIZCA "İlişkili kayıt
   * geçersiz" yazıyordu. Kullanıcının gördüğü şey, sebebi hiçbir yerde
   * yazmayan bir ret.
   *
   * Doğrusu: kompozit anahtar `(client_id, org_id)` çiftinin `clients`ta var
   * olmasını istiyor, yani `org_id` HEDEF MÜŞTERİDEN okunmalı.
   */
  private async musteriOrgId(
    tx: Prisma.TransactionClient,
    clientId: string,
  ): Promise<string> {
    const [row] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
      SELECT org_id::text AS org_id FROM clients WHERE id = ${clientId}::uuid
    `);
    if (!row) throw new NotFoundException('Workspace bulunamadı');
    return row.org_id;
  }

  /**
   * SAHİPLİK KARARINI UYGULAR — hesap ve sayfa atamasının ortak kapısı.
   *
   * Karar `hesap-sahipligi.ts` içinde ve saf; burası yalnızca girdilerini
   * topluyor.
   *
   * BAĞLANTININ ŞİRKETİ ve AJANS ŞİRKETİ ADMİN İSTEMCİSİYLE OKUNUYOR. RLS
   * altında müşteri admini ajansın bağlantısını GÖREMİYOR (doğrusu bu) ve
   * görünmeyen satır "yok" sayılamaz (CLAUDE.md). Okunan şey yalnızca bir
   * kimlik ve kullanıcının zaten GÖREBİLDİĞİ bir satırın bağlantısına ait;
   * dışarı hiçbir şey dönmüyor, karar için kullanılıyor.
   *
   * ÇAKIŞMA DA ADMİN İSTEMCİSİYLE: hedef şirketteki ikiz satır bu kişiye
   * görünmeyebilir ve görünmediği için "yok" sayılırsa tekil anahtar
   * UPDATE'te patlar — kullanıcı sebepsiz bir "kayıt zaten var" görür.
   */
  private async sahiplikUygula(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    p: {
      tur: string;
      ad: string;
      satirOrgId: string;
      connectionId: string;
      hedefClientId: string | null;
      cakisanVarMi: (orgId: string) => Promise<boolean>;
    },
  ): Promise<{ orgId: string; not: string | null; iz?: 'musteri_ajans_kaldirma' }> {
    /*
     * TEK SORGU, HAM SQL. İki ayrı model okuması yerine tek tur; ham olması
     * test koşum ortamının onu gerçek şemaya karşı çalıştırabilmesi için
     * (`pglite-harness` model yüzeyini taklit ediyor, SQL'i taklit etmiyor).
     */
    /*
     * `sirket_ajans_org_id`: AKTİF ŞİRKETİN üst hesabının ajansı, üyelikten
     * bağımsız. Müşteri admininin üyeliği yok ve `ajans_org_id` onda hep
     * NULL; K4 istisnası "bu bağlantı benim ajansımın mı" sorusunu bununla
     * cevaplıyor (`hesap-sahipligi.ts`).
     */
    const [baglanti] = await this.admin.$queryRaw<
      Array<{ org_id: string; ajans_org_id: string | null; sirket_ajans_org_id: string | null }>
    >(Prisma.sql`
      SELECT c.org_id::text AS org_id,
             (SELECT m.ajans_org_id::text FROM manager_accounts m
               WHERE m.id = ${ctx.managerAccountId}::uuid) AS ajans_org_id,
             (SELECT m.ajans_org_id::text
                FROM organizations o
                JOIN manager_accounts m ON m.id = o.manager_account_id
               WHERE o.id = ${ctx.orgId}::uuid) AS sirket_ajans_org_id
        FROM platform_connections c
       WHERE c.id = ${p.connectionId}::uuid
    `);
    // Yabancı anahtar bağlantının var olduğunu garanti ediyor; yoksa
    // tahminle devam etmek yerine duruyoruz.
    if (!baglanti) throw new NotFoundException('Bağlantı bulunamadı');

    const hedefOrgId =
      p.hedefClientId === null ? null : await this.musteriOrgId(tx, p.hedefClientId);

    const karar = sahiplikKarari({
      tur: p.tur,
      ad: p.ad,
      satirOrgId: p.satirOrgId,
      baglantiOrgId: baglanti.org_id,
      hedefOrgId,
      aktifOrgId: ctx.orgId,
      // `Boolean`, `!== null` DEĞİL: alan bir yerde `undefined` gelirse
      // (eksik kurulmuş bir bağlam) üyelik VAR sayılmasın — kapalı düşsün.
      ustHesapVar: Boolean(ctx.managerAccountId),
      ajansOrgId: baglanti.ajans_org_id,
      sirketAjansOrgId: baglanti.sirket_ajans_org_id,
    });
    if (!karar.ok) throw new BadRequestException(karar.mesaj);

    const cakisma = cakismaKarari({
      atama: p.hedefClientId !== null,
      ad: p.ad,
      satirOrgId: p.satirOrgId,
      yeniOrgId: karar.yeniOrgId,
      cakisanVar:
        karar.yeniOrgId === p.satirOrgId ? false : await p.cakisanVarMi(karar.yeniOrgId),
    });
    if (!cakisma.ok) throw new BadRequestException(cakisma.mesaj);
    return { orgId: cakisma.orgId, not: cakisma.not, ...(karar.iz ? { iz: karar.iz } : {}) };
  }

  /**
   * ═══ MÜŞTERİ AJANSIN ATAMASINI KALDIRIYOR — DAR BYPASSRLS DALI ═══
   *
   * Kullanıcının kararı (2026-09-28): müşteri ajansın atadığı hesabı ya da
   * sayfayı KALDIRABİLİR, ama iz bırakır. Yetki kararı RLS altında ve saf
   * fonksiyonda verildi (`sahiplikKarari`, K4 istisnası); buraya yalnızca
   * o karar `iz` ile döndüyse geliniyor.
   *
   * NEDEN BYPASSRLS: satır ajansın şirketine dönüyor ve müşteri onu artık
   * göremiyor. UPDATE sonrası yeni satır SELECT politikasından geçmek zorunda
   * (CLAUDE.md) ve Postgres "new row violates row-level security policy" ile
   * reddediyor. Politikayı gevşetmek ajansın havuzunu müşteriye açmak olurdu.
   *
   * UPDATE ESKİ ATAMAYA ÇAPALI (`client_id = önceki`): karar ile yazma arasında
   * başka biri satırı taşıdıysa sessizce üstüne yazmak yerine duruyoruz.
   *
   * DENETİM KAYDI AYNI TRANSACTION'DA: ya kaldırma ve iz birlikte olur ya
   * hiçbiri. İzsiz bir kaldırma kararın özünü bozardı.
   */
  private async musteriAjansAtamasiniKaldir(
    ctx: TenantContext,
    meta: Meta,
    p: {
      tur: 'ad_account' | 'social_profile';
      id: string;
      ad: string;
      oncekiClientId: string;
      yeniOrgId: string;
    },
  ): Promise<{ tasima: TasimaSonucu | null }> {
    return this.admin.$transaction(async (a) => {
      const n =
        p.tur === 'ad_account'
          ? await a.$executeRaw(Prisma.sql`
              UPDATE ad_accounts
                 SET client_id = NULL, sync_enabled = false,
                     org_id = ${p.yeniOrgId}::uuid, updated_at = now()
               WHERE id = ${p.id}::uuid AND client_id = ${p.oncekiClientId}::uuid
            `)
          : await a.$executeRaw(Prisma.sql`
              UPDATE social_profiles
                 SET client_id = NULL, sync_enabled = false,
                     org_id = ${p.yeniOrgId}::uuid, updated_at = now()
               WHERE id = ${p.id}::uuid AND client_id = ${p.oncekiClientId}::uuid
            `);
      if (n !== 1) {
        throw new ConflictException(
          `"${p.ad}" bu arada başka biri tarafından değiştirilmiş. Sayfayı yenileyip tekrar dene.`,
        );
      }
      // Veri eski workspace'te kalıyor (kaldırmada taşıma yok); bu çağrı
      // kalanı sayıyor ve artık eşleşmeyen Boost fatura bağını koparıyor.
      const tasima = p.tur === 'ad_account' ? await hesapVerisiniTasi(a, p.id, null) : null;
      await this.audit.record(a as unknown as TenantClient, ctx, {
        action: p.tur === 'ad_account' ? 'ad_account.unassigned_by_client' : 'social_profile.unassigned_by_client',
        targetType: p.tur,
        targetId: p.id,
        clientId: p.oncekiClientId,
        before: { clientId: p.oncekiClientId },
        after: { clientId: null, orgId: p.yeniOrgId },
        ...meta,
      });
      return { tasima };
    });
  }

  /**
   * AJANSA HABER — kaldırma COMMIT edildikten SONRA.
   *
   * Mail başarısız olursa kaldırma GERİ ALINMIYOR (müşterinin kararı geçerli
   * ve iz denetim kaydında zaten var), ama başarısızlık ayrı bir denetim
   * kaydına yazılıyor ve yanıtta dönüyor: sessizce "bildirildi" sanılmasın.
   * Alıcı ödeme uyarılarıyla aynı: ajansın kendi gönderici adresi
   * (`OdemeMailiGonderici`); müşteriye gitmiyor.
   */
  private async ajansaKaldirmayiBildir(
    ctx: TenantContext,
    p: { tur: 'ad_account' | 'social_profile'; ad: string; clientId: string },
  ): Promise<boolean> {
    const [ws] = await this.admin.$queryRaw<Array<{ ad: string; sirket: string }>>(Prisma.sql`
      SELECT c.name AS ad, o.name AS sirket
        FROM clients c JOIN organizations o ON o.id = c.org_id
       WHERE c.id = ${p.clientId}::uuid
    `);
    const turAdi = p.tur === 'ad_account' ? 'reklam hesabı' : 'sayfa';
    const kacir = (t: string) =>
      t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    try {
      await this.odemeMaili.gonder(
        `${ws?.sirket ?? 'Bir şirket'} ajansın atadığı bir ${turAdi} kaldırdı`,
        `<p><strong>${kacir(ws?.sirket ?? '')}</strong> şirketinden bir yönetici, ` +
          `<strong>${kacir(ws?.ad ?? '')}</strong> workspace'ine ajansın atadığı ` +
          `<strong>${kacir(p.ad)}</strong> ${turAdi} atamasını kaldırdı.</p>` +
          `<p>Hesap ajans havuzuna döndü ve izleme kapandı; bu workspace'e bu hesaptan yeni veri gelmeyecek. ` +
          `Geçmiş veri workspace'te duruyor.</p>`,
      );
      return true;
    } catch (e) {
      await this.audit.recordUnauthenticated(ctx.orgId, {
        action: 'ajans_bildirimi_gonderilemedi',
        targetType: p.tur,
        clientId: p.clientId,
        after: { sebep: e instanceof Error ? e.message : String(e) },
      });
      return false;
    }
  }

  async assignAdAccount(
    ctx: TenantContext,
    adAccountId: string,
    clientId: string | null,
    meta: Meta,
  ) {
    if (clientId !== null && !ctx.clientIds.includes(clientId)) {
      throw new NotFoundException('Workspace bulunamadı');
    }

    const scoped: TenantContext = { ...ctx, activeClientId: null };

    const sonuc = await this.prisma.withTenant(scoped, async (tx) => {
      const before = await tx.adAccount.findUnique({ where: { id: adAccountId } });
      if (!before) throw new NotFoundException('Reklam hesabı bulunamadı');

      if (before.clientId === clientId) {
        return {
          id: before.id,
          clientId: before.clientId,
          syncEnabled: before.syncEnabled,
          changed: false,
          platform: before.platform as Platform,
          // YANIT ŞEKLİ HER DALDA AYNI. Alanı yalnızca değişiklik olan dalda
          // döndürmek, panelde `undefined` okuyup "0 kayıt taşındı" yazmak
          // demekti — ki hiçbir şey yapılmadığında bu doğru bir cümle değil.
          movedRows: 0,
          movedByTable: {} as TasimaSonucu['tasinan'],
          leftBehind: {} as TasimaSonucu['kalan'],
          stayingRows: 0,
          clientWide: {} as TasimaSonucu['musteriGeneli'],
          unlinkedBoostPages: 0,
          poolNote: null as string | null,
        };
      }

      // YÖNETİCİ (MCC) HESABI ATANAMAZ. Reklam yayınlamıyor; atamak boş bir
      // senkronizasyon turu ve boşa kota demek. Arayüzde de kapalı ama karar
      // burada, çünkü uç nokta arayüz olmadan da çağrılabiliyor.
      if (clientId !== null && before.managerExternalId === before.externalId) {
        throw new BadRequestException(
          `"${before.name}" bir yönetici (MCC) hesabı — reklam yayınlamıyor, workspace’e atanamaz.`,
        );
      }

      /*
       * SAHİPLİK — satır hangi şirkete gidecek ve bu kişi onu taşıyabilir mi.
       * Kurallar ve gerekçeleri `hesap-sahipligi.ts` içinde (K1, K2, K4).
       */
      const sahiplik = await this.sahiplikUygula(tx, ctx, {
        tur: 'reklam hesabı',
        ad: before.name,
        satirOrgId: before.orgId,
        connectionId: before.connectionId,
        hedefClientId: clientId,
        cakisanVarMi: async (orgId) => {
          const ikiz = await this.admin.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id::text AS id FROM ad_accounts
             WHERE platform = ${before.platform}::"Platform"
               AND external_id = ${before.externalId}
               AND org_id = ${orgId}::uuid
               AND id <> ${before.id}::uuid
             LIMIT 1
          `);
          return ikiz.length > 0;
        },
      });

      /*
       * MÜŞTERİ AJANSIN ATAMASINI KALDIRIYOR — yazma BYPASSRLS ile, dar dal.
       * Gerekçe `musteriAjansAtamasiniKaldir`. `before.clientId` burada
       * dolu: kaldırılacak bir atama var (aynıysa yukarıda erken dönüldü).
       */
      if (sahiplik.iz === 'musteri_ajans_kaldirma' && before.clientId) {
        const { tasima } = await this.musteriAjansAtamasiniKaldir(ctx, meta, {
          tur: 'ad_account',
          id: before.id,
          ad: before.name,
          oncekiClientId: before.clientId,
          yeniOrgId: sahiplik.orgId,
        });
        return {
          id: before.id,
          clientId: null as string | null,
          syncEnabled: false,
          changed: true,
          platform: before.platform as Platform,
          movedRows: 0,
          movedByTable: {} as TasimaSonucu['tasinan'],
          leftBehind: tasima?.kalan ?? ({} as TasimaSonucu['kalan']),
          stayingRows: tasima?.kalanVeri ?? 0,
          clientWide: tasima?.musteriGeneli ?? ({} as TasimaSonucu['musteriGeneli']),
          unlinkedBoostPages: tasima?.koparilanFaturaBagi ?? 0,
          poolNote: sahiplik.not,
          ajansBildirimi: { ad: before.name, clientId: before.clientId },
        };
      }

      /*
       * ATAMA İZLEMEYİ AÇIYOR — ayrı bir adım DEĞİL.
       *
       * Keşif hesapları `syncEnabled: false` yazıyor ve gerekçesi havuz
       * modeliydi: bağlanan Meta kimliği onlarca müşterinin hesabını
       * görüyordu, hepsini açmak istenmeyen hesapların kotasını yakardı.
       * Ama ATAMA zaten bir seçim: kullanıcı bu hesabın bu müşteriye ait
       * olduğunu söylüyor. İzlemeyi ayrıca istemek, "atadım ama veri
       * gelmiyor" hâlinin doğrudan sebebiydi.
       *
       * Atama KALKINCA izleme kapanıyor (eski davranış): atanmamış hesabı
       * senkronize etmek boşa kota.
       */
      /*
       * `orgId` DE YAZILIYOR — HAVUZ ARTIK ŞİRKETLER ARASI ORTAK.
       *
       * Üst hesap (MCC) altında tek Meta yetkilendirmesi bütün şirketlere
       * hizmet ediyor, yani havuzdaki bir hesabın `org_id`'si yetkilendirmeyi
       * yapan şirket, atanacağı workspace ise BAŞKA bir şirkette olabiliyor.
       *
       * `ad_accounts_client_org_fkey` kompozit yabancı anahtarı
       * `(client_id, org_id)` çiftinin `clients`ta VAR OLMASINI şart koşuyor.
       * `org_id`'yi güncellemeden atama denemek, anlaşılmaz bir yabancı
       * anahtar hatasıyla düşerdi — ve bu, kullanıcıya "bir şeyler ters
       * gitti" olarak görünen türden.
       *
       * ORG HEDEF MÜŞTERİDEN OKUNUYOR, `ctx.orgId`DEN DEĞİL. Burada bir süre
       * "clientId doğrulandı, yani hedef workspace AKTİF şirkette" yazıyordu
       * ve o cümle "Tüm şirketler" modunda yanlıştı — gerekçesi
       * `musteriOrgId` üzerinde.
       *
       * KALDIRMADA SATIR SAHİBİNE DÖNÜYOR. Burada bir süre "bulunduğu
       * şirkette kalıyor, havuz ajansın" yazıyordu; iki havuz olunca o cümle
       * yanlışlaştı: ajansın hesabı 3A'dan çözülünce 3A'nın havuzuna düşer ve
       * bir daha hiçbir kardeş şirketten görünmezdi. Hangi şirkete gideceğine
       * `sahiplikUygula` karar veriyor.
       */
      const after = await tx.adAccount.update({
        where: { id: adAccountId },
        data: {
          clientId,
          syncEnabled: clientId !== null,
          orgId: sahiplik.orgId,
        },
      });

      /*
       * VERİ DE TAŞINIYOR — AYNI TRANSACTION'DA.
       *
       * Ayrı bir transaction'a almak, "hesap taşındı ama verisi taşınmadı"
       * durumunu MÜMKÜN kılardı ve o durumun hiçbir belirtisi yok: iki
       * müşterinin raporu da sessizce yanlış olurdu. İkisi ya birlikte olur
       * ya hiç olmaz.
       *
       * Kuyruğa alma bilerek DIŞARIDA (aşağıda): Redis yavaşladığında
       * transaction ölür ve atama bile kaydedilemezdi.
       */
      const tasima = await hesapVerisiniTasi(tx, adAccountId, clientId);

      await this.audit.record(tx, ctx, {
        action: clientId === null ? 'ad_account.unassigned' : 'ad_account.assigned',
        targetType: 'ad_account',
        targetId: adAccountId,
        // Denetim kaydı ATAMANIN YAPILDIĞI müşteriye yazılıyor; kaldırmada
        // hesabın AYRILDIĞI müşteriye. İkisi de "bu müşterinin hesap listesi
        // ne zaman değişti" sorusunu cevaplıyor.
        clientId: clientId ?? before.clientId,
        before: { clientId: before.clientId, syncEnabled: before.syncEnabled },
        after: {
          clientId: after.clientId,
          syncEnabled: after.syncEnabled,
          name: after.name,
          // TAŞINAN SATIR SAYILARI DENETİM KAYDINDA. Bir müşterinin
          // raporundaki rakam bir gün "geçen ay başkaydı" diye
          // sorgulandığında, cevabın nerede olduğu belli olsun.
          tasinanSatirlar: tasima.tasinan,
          eskiMusteridekiKayitlar: tasima.kalan,
        },
        ...meta,
      });

      /*
       * ESKİ MÜŞTERİ DE KENDİ DENETİM SATIRINI ALIYOR.
       *
       * Denetim kaydı `clientId ?? before.clientId` ile YENİ müşteriye
       * yazılıyor; doğrudan A→B atamasında A hiçbir satır almıyordu. Oysa
       * kaybeden taraf A: kampanyaları, kreatifleri ve geçmiş metrikleri
       * onun altından ÇIKTI ve raporundaki rakam değişti. "Geçen ay bu sayı
       * başkaydı" sorusunun cevabı A'nın kendi denetim kaydında olmalı —
       * B'nin kaydını A göremiyor (RLS).
       */
      if (before.clientId !== null && clientId !== null) {
        await this.audit.record(tx, ctx, {
          action: 'ad_account.unassigned',
          targetType: 'ad_account',
          targetId: adAccountId,
          clientId: before.clientId,
          before: { clientId: before.clientId, syncEnabled: before.syncEnabled },
          after: {
            clientId: after.clientId,
            name: after.name,
            tasinanSatirlar: tasima.tasinan,
            eskiMusteridekiKayitlar: tasima.kalan,
          },
          ...meta,
        });
      }

      return {
        id: after.id,
        clientId: after.clientId,
        syncEnabled: after.syncEnabled,
        changed: true,
        platform: after.platform as Platform,
        movedRows: tasima.toplam,
        movedByTable: tasima.tasinan,
        leftBehind: tasima.kalan,
        stayingRows: tasima.kalanVeri,
        clientWide: tasima.musteriGeneli,
        unlinkedBoostPages: tasima.koparilanFaturaBagi,
        poolNote: sahiplik.not,
      };
    },
    /*
     * SÜRE UZATILDI — TEK SEBEP `insights_daily`.
     *
     * Bir reklam hesabının 90 günlük geçmişi dört varlık seviyesinde yüz
     * binlerce satır olabiliyor ve hepsinin `client_id`'si tek `UPDATE` ile
     * değişiyor. Varsayılan 5 saniyede transaction ölseydi hesap taşınmış,
     * verisi taşınmamış olarak kalırdı. Bu bir istek yolu değil, seyrek bir
     * yönetim işlemi — bağlantıyı 30 saniye tutması kabul edilebilir.
     */
    { timeoutMs: 30_000 });

    /*
     * KUYRUK TRANSACTION'IN DIŞINDA. `withTenant` etkileşimli bir transaction
     * açıyor ve Prisma'nın sınırı 5 saniye; Redis yavaşladığında transaction
     * ölür ve atama bile kaydedilemezdi.
     */
    if (sonuc.changed && sonuc.clientId) {
      await this.hesabaGecmisiKuyrukla(sonuc.clientId, sonuc.platform, adAccountId);
    }

    /*
     * AJANSA HABER TRANSACTION'IN DIŞINDA: SMTP yavaşlarsa RLS transaction'ı
     * açık kalmasın. `ajansaBildirildi` yanıtta dönüyor; panel "ajansa
     * bildirildi" ya da "bildirim gönderilemedi" diye AYRI yazabilsin.
     */
    if ('ajansBildirimi' in sonuc && sonuc.ajansBildirimi) {
      const { ajansBildirimi, ...geri } = sonuc;
      return {
        ...geri,
        ajansaBildirildi: await this.ajansaKaldirmayiBildir(ctx, {
          tur: 'ad_account',
          ...ajansBildirimi,
        }),
      };
    }
    return sonuc;
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
      throw new NotFoundException('Workspace bulunamadı');
    }

    const scoped: TenantContext = { ...ctx, activeClientId: null };

    const sonuc = await this.prisma.withTenant(scoped, async (tx) => {
      const before = await tx.socialProfile.findUnique({ where: { id: socialProfileId } });
      if (!before) throw new NotFoundException('Sayfa bulunamadı');

      if (before.clientId === clientId) {
        return {
          id: before.id,
          clientId: before.clientId,
          syncEnabled: before.syncEnabled,
          // TÜR DÖNÜYOR: kurulum boost hesabını yalnızca Meta sayfalarına
          // bağlıyor ve YouTube kanalını ayırt etmenin tek yolu bu.
          profileType: before.profileType,
          changed: false,
          leftBehindForms: 0,
          poolNote: null as string | null,
        };
      }

      // SAHİPLİK — reklam hesabı atamasıyla AYNI kapı (`hesap-sahipligi.ts`).
      // Sayfanın tekil anahtarı `(org_id, external_id)`; platform yok.
      const sahiplik = await this.sahiplikUygula(tx, ctx, {
        tur: 'sayfa',
        ad: before.name,
        satirOrgId: before.orgId,
        connectionId: before.connectionId,
        hedefClientId: clientId,
        cakisanVarMi: async (orgId) => {
          const ikiz = await this.admin.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id::text AS id FROM social_profiles
             WHERE external_id = ${before.externalId}
               AND org_id = ${orgId}::uuid
               AND id <> ${before.id}::uuid
             LIMIT 1
          `);
          return ikiz.length > 0;
        },
      });

      // ESKİ MÜŞTERİDE KALACAK FORM SAYISI. Sessiz bırakmak, kullanıcının
      // sayfayı taşıdıktan sonra "formlarım nerede" diye aramasına yol açardı.
      const leftBehindForms =
        before.clientId === null
          ? 0
          : await tx.leadForm.count({
              where: { socialProfileId, clientId: before.clientId },
            });

      /*
       * MÜŞTERİ AJANSIN ATAMASINI KALDIRIYOR — reklam hesabıyla aynı dar
       * BYPASSRLS dalı (`musteriAjansAtamasiniKaldir`). Formlar eski
       * workspace'te kalıyor ve sayısı yine söyleniyor.
       */
      if (sahiplik.iz === 'musteri_ajans_kaldirma' && before.clientId) {
        await this.musteriAjansAtamasiniKaldir(ctx, meta, {
          tur: 'social_profile',
          id: before.id,
          ad: before.name,
          oncekiClientId: before.clientId,
          yeniOrgId: sahiplik.orgId,
        });
        return {
          id: before.id,
          clientId: null as string | null,
          syncEnabled: false,
          profileType: before.profileType,
          changed: true,
          leftBehindForms,
          poolNote: sahiplik.not,
          ajansBildirimi: { ad: before.name, clientId: before.clientId },
        };
      }

      /*
       * ATAMA İZLEMEYİ AÇIYOR — reklam hesabı atamasıyla aynı gerekçe.
       *
       * Sayfada bu ayrıca kritik: organik gönderi süpürmesi `syncEnabled`
       * bakıyor ve Akıllı Boost'un bildirim havuzu ondan besleniyor. Kapalı
       * kalan bir sayfa "hiç yeni gönderi gelmiyor" olarak görünüyor ve sebebi
       * Instagram'da, izinlerde, webhook'ta aranıyor — oysa tek eksik bir
       * anahtardı.
       */
      /*
       * `orgId` DE YAZILIYOR — gerekçesi `assignAdAccount` ile aynı:
       * havuz üst hesap (MCC) altında şirketler arası ortak ve
       * `social_profiles_client_org_fkey` kompozit anahtarı
       * `(client_id, org_id)` çiftinin `clients`ta var olmasını istiyor.
       * Değer HEDEF MÜŞTERİDEN geliyor; sebebi `musteriOrgId` üzerinde.
       */
      const after = await tx.socialProfile.update({
        where: { id: socialProfileId },
        data: {
          clientId,
          syncEnabled: clientId !== null,
          // Kaldırmada SAHİBİNE dönüyor — bkz. `assignAdAccount`.
          orgId: sahiplik.orgId,
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
        profileType: after.profileType,
        changed: true,
        leftBehindForms,
        poolNote: sahiplik.not,
      };
    });

    // AJANSA HABER TRANSACTION'IN DIŞINDA — gerekçe `assignAdAccount`.
    if ('ajansBildirimi' in sonuc && sonuc.ajansBildirimi) {
      const { ajansBildirimi, ...geri } = sonuc;
      return {
        ...geri,
        ajansaBildirildi: await this.ajansaKaldirmayiBildir(ctx, {
          tur: 'social_profile',
          ...ajansBildirimi,
        }),
      };
    }
    return sonuc;
  }

  /**
   * Bağlantıyı kaldırır.
   *
   * Kayıt SİLİNMEZ, `revoked` işaretlenir ve token'lar temizlenir. Sebep:
   * denetim izi korunmalı ve aynı hesap yeniden bağlanırsa geçmiş reklam
   * verisiyle eşleşmeli. Reklam hesabı satırları da kalır — üzerlerindeki
   * geçmiş metrikler (Modül 3) bir müşteriye ait finansal kayıttır.
   */
  /**
   * ═══ İZLEMEYİ TOPLU GERİ AÇ ═══
   *
   * `disconnect` bu bağlantıdaki HER reklam hesabının ve sayfanın
   * `syncEnabled`ını kapatıyor ve keşif upsert'i onu BİLEREK geri açmıyor
   * (o karar doğru: "Hesapları tara" yapılmış atamaları sıfırlamamalı).
   * Sonuç, bağlantı yeniden kurulduğunda atamaları duran ama tek satır veri
   * çekmeyen bir havuz — üretimde 131 hesapta yaşandı ve tek çare hesap
   * başına tıklamaktı.
   *
   * NE AÇILACAĞI TAHMİN DEĞİL: `assignAdAccount` `syncEnabled: clientId !==
   * null` yazıyor, yani "atanmış hesap izlenir" bu üründe bir DEĞİŞMEZ. Bu
   * metot yalnızca o değişmezi geri kuruyor; atanmamış (havuzdaki) satırlara
   * DOKUNMUYOR, çünkü onların kapalı olması keşfin kasıtlı varsayılanı ve
   * açmak ajansın 481 hesabını kotaya sokardı.
   *
   * `initial_backfill` KUYRUĞA GİRMİYOR: kaldırma metrik satırlarını silmiyor,
   * geçmiş yerinde duruyor. Doksan günlük çekimi tekrarlamak kotayı boşa
   * harcar. Yalnızca `structure` isteniyor — izleme kapalıyken platformda
   * açılan kampanyalar bizde yok ve metrikler onlara bağlanacak.
   */
  async resumeSync(
    ctx: TenantContext,
    connectionId: string,
    meta: Meta,
  ): Promise<{ adAccounts: number; socialProfiles: number }> {
    /*
     * `activeClientId` KAPATILIYOR. Bağlantı ajansa ait ve altındaki hesaplar
     * birden çok workspace'e dağılmış olabiliyor; aktif müşteri seçiliyken
     * sorgu yalnızca onunkileri görür ve geri kalanı SESSİZCE kapalı bırakır.
     * Belirtisi "bir müşteride düzeldi, diğerinde düzelmedi" olurdu.
     */
    const kapsam: TenantContext = { ...ctx, activeClientId: null };

    const conn = await this.prisma.withTenant(kapsam, (tx) =>
      tx.platformConnection.findFirst({
        where: { id: connectionId },
        select: { id: true, platform: true },
      }),
    );
    if (!conn) throw new NotFoundException('Bağlantı bulunamadı');

    const sonuc = await this.prisma.withTenant(kapsam, async (tx) => {
      const hesaplar = await tx.adAccount.updateMany({
        where: { connectionId, clientId: { not: null }, syncEnabled: false },
        data: { syncEnabled: true },
      });
      const profiller = await tx.socialProfile.updateMany({
        where: { connectionId, clientId: { not: null }, syncEnabled: false },
        data: { syncEnabled: true },
      });

      await this.audit.record(tx, ctx, {
        action: 'connection.sync_resumed',
        targetType: 'platform_connection',
        targetId: connectionId,
        after: { adAccounts: hesaplar.count, socialProfiles: profiller.count },
        ...meta,
      });

      return { adAccounts: hesaplar.count, socialProfiles: profiller.count };
    });

    /*
     * KUYRUĞA ALMA TRANSACTION'IN DIŞINDA. `withTenant` etkileşimli bir
     * transaction ve Prisma'nın sınırı 5 saniye; Redis yavaşladığında yüz
     * hesaplık bir döngü transaction'ı öldürür ve AÇILAN İZLEME DE GERİ
     * ALINIRDI — yani düzeltme, düzeltmeye çalıştığı arızayı geri getirirdi.
     */
    const acilanlar = await this.prisma.withTenant(kapsam, (tx) =>
      tx.adAccount.findMany({
        where: { connectionId, clientId: { not: null }, syncEnabled: true },
        select: { id: true, clientId: true },
      }),
    );

    for (const a of acilanlar) {
      if (!a.clientId) continue;
      await this.queue.enqueue({
        clientId: a.clientId,
        platform: conn.platform as Platform,
        jobType: 'structure',
        adAccountId: a.id,
        // Kullanıcı ekranda bekliyor: kotaya takılıp `delayed`e düşmüş eski
        // bir yapı taraması bu isteği sessizce yutmasın.
        interactive: true,
      });
    }

    return sonuc;
  }

  /**
   * KALDIRMADAN ÖNCE NE DURACAĞI — panel onay penceresini bununla çiziyor.
   *
   * SAYILAR BÜTÜN ŞİRKETLERDEN (yönetim istemcisi). Ekranın kendi listesi
   * başka şirkete atanmış hesapları RLS yüzünden göremiyor; oradan sayılan
   * bir "N workspace" ajansın bağlantısında hep eksik çıkardı. Bağlantının
   * kendisi ise kullanıcının bağlamında okunuyor: göremediği bağlantının
   * sayısını öğrenemez.
   */
  async disconnectOnizleme(ctx: TenantContext, connectionId: string): Promise<BaglantiKaldirmaOnizlemesi> {
    const d = await this.kaldirmaDurumu(ctx, connectionId);
    const karar = baglantiKaldirmaKarari({ ...d.girdi, onaylananWorkspaceSayisi: d.girdi.workspaceSayisi });
    return {
      kaldirabilir: karar.ok,
      sebep: karar.ok ? null : karar.mesaj,
      sahipSirketAdi: d.girdi.sahipSirketAdi,
      workspaceSayisi: d.girdi.workspaceSayisi,
      izlenenHesapSayisi: d.izlenenHesapSayisi,
    };
  }

  /** Önizleme ve kaldırmanın ORTAK okuması: ikisi ayrı sayarsa onay sayısı tutmaz. */
  private async kaldirmaDurumu(ctx: TenantContext, connectionId: string) {
    /*
     * `activeClientId` KAPALI: seçili workspace bağlantıyı gizlememeli
     * (`resumeSync` ile aynı gerekçe). Kapsam yine kullanıcının şirketi;
     * göremediği bağlantı "bulunamadı".
     */
    const [conn] = await this.prisma.withTenant({ ...ctx, activeClientId: null }, (tx) =>
      tx.$queryRaw<
        Array<{ platform: Platform; orgId: string; clientId: string | null; accountLabel: string; status: string }>
      >(Prisma.sql`
        SELECT platform::text AS platform, org_id::text AS "orgId", client_id::text AS "clientId",
               account_label AS "accountLabel", status::text AS status
          FROM platform_connections
         WHERE id = ${connectionId}::uuid
      `),
    );
    if (!conn) throw new NotFoundException('Bağlantı bulunamadı');

    const [sayim] = await this.admin.$queryRaw<
      Array<{ ws: number; izlenen: number; sahip: string }>
    >(Prisma.sql`
      SELECT
        (SELECT count(DISTINCT w.client_id)::int FROM (
           SELECT client_id FROM ad_accounts
            WHERE connection_id = ${connectionId}::uuid AND client_id IS NOT NULL
           UNION
           SELECT client_id FROM social_profiles
            WHERE connection_id = ${connectionId}::uuid AND client_id IS NOT NULL
         ) w) AS ws,
        (SELECT count(*)::int FROM ad_accounts
          WHERE connection_id = ${connectionId}::uuid AND sync_enabled) AS izlenen,
        (SELECT name FROM organizations WHERE id = ${conn.orgId}::uuid) AS sahip
    `);
    return {
      conn,
      izlenenHesapSayisi: sayim?.izlenen ?? 0,
      girdi: {
        baglantiOrgId: conn.orgId,
        sahipSirketAdi: sayim?.sahip ?? 'başka bir şirket',
        aktifOrgId: ctx.orgId,
        workspaceSayisi: sayim?.ws ?? 0,
      },
    };
  }

  async disconnect(
    ctx: TenantContext,
    connectionId: string,
    meta: Meta,
    onayWorkspaceSayisi: number | null = null,
  ): Promise<{ ok: true; adAccounts: number; socialProfiles: number }> {
    const { conn, girdi } = await this.kaldirmaDurumu(ctx, connectionId);
    const karar = baglantiKaldirmaKarari({ ...girdi, onaylananWorkspaceSayisi: onayWorkspaceSayisi });
    if (!karar.ok) {
      throw karar.kod === 'sahip_degil' ? new ForbiddenException(karar.mesaj) : new ConflictException(karar.mesaj);
    }

    // Token'ı PLATFORM TARAFINDA iptal et — kendi kaydımızı silmek yetmez.
    //
    // Sıra önemli: iptal önce yapılır, çünkü şifreli token'a hâlâ ihtiyacımız
    // var. Ama başarısız olması bağlantının kaldırılmasını ENGELLEMEZ: token
    // zaten geçersiz olabilir ya da platform erişilemez olabilir. İptal en iyi
    // çabadır, kaydı silmek kesindir. Aksi hâlde kullanıcı bir platform
    // kesintisi yüzünden bağlantısını kaldıramaz hâle gelirdi.
    //
    // İPTAL YETKİ KAPISINDAN SONRA: eskiden önce iptal ediliyordu ve
    // reddedilecek bir istek bile platformdaki token'ı öldürebilirdi.
    await this.vault.revokeOnPlatform(connectionId, this.provider(conn.platform as Platform));

    /*
     * ═══ YAZMA YÖNETİM İSTEMCİSİYLE — TEK KARAR, BÜTÜN SATIRLAR ═══
     *
     * 2026-10-15 üretim: bu güncelleme `withTenant` altında koşuyordu ve RLS
     * yalnızca kullanıcının şirketindeki satırları gösterdi. Ajansın
     * bağlantısındaki 56 atanmış hesabın 1'i kapandı, 55'i açık kaldı:
     * bağlantı "kaldırıldı", token iptal edildi, ama izleme listesi yarım.
     * Bu satırlar her gece ölü bir token'la kuyruğa giriyor ve düşüyordu.
     * Kapı yukarıda (`baglantiKaldirmaKarari`): sahibi olan şirket bağlantının
     * HER satırına karar verir, başka şirkete ödünç verilmiş hesaplar dahil.
     * Satırlar SİLİNMİYOR ve ATAMALAR KALIYOR; yeniden bağlanınca
     * `resumeSync` aynı izlemeyi geri açıyor.
     */
    return this.admin.$transaction(async (a) => {
      // RETURNING İLE SAYILIYOR: sayı denetim kaydına ve yanıta gidiyor ve
      // "kaç satır gerçekten kapandı" sorusunun tek dürüst cevabı bu.
      const hesaplar = await a.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE ad_accounts SET sync_enabled = false, updated_at = now()
         WHERE connection_id = ${connectionId}::uuid AND sync_enabled
        RETURNING id::text AS id
      `);
      const profiller = await a.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE social_profiles SET sync_enabled = false, updated_at = now()
         WHERE connection_id = ${connectionId}::uuid AND sync_enabled
        RETURNING id::text AS id
      `);
      /*
       * Token kolonları okunamaz hâle getiriliyor: boş bayt dizisi "şifreli
       * veri bozuk" hatası verir ve kazara kullanım imkânsızlaşır.
       */
      const kapanan = await a.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE platform_connections
           SET status = 'revoked', revoked_at = now(), updated_at = now(),
               access_token_enc = ''::bytea, refresh_token_enc = NULL,
               token_expires_at = NULL, authorization_expires_at = NULL,
               granted_scopes = ARRAY[]::text[]
         WHERE id = ${connectionId}::uuid
        RETURNING id::text AS id
      `);
      if (kapanan.length !== 1) throw new NotFoundException('Bağlantı bulunamadı');

      await this.audit.record(a as unknown as TenantClient, ctx, {
        action: 'connection.revoked',
        targetType: 'platform_connection',
        targetId: connectionId,
        clientId: conn.clientId,
        before: { platform: conn.platform, accountLabel: conn.accountLabel, status: conn.status },
        // KAÇ SATIRIN DURDUĞU İZDE: "kaldırıldı" tek başına neyin durduğunu
        // söylemiyor ve geri getiren kişi neyi açacağını buradan okuyor.
        after: {
          workspaceSayisi: girdi.workspaceSayisi,
          kapananHesap: hesaplar.length,
          kapananSayfa: profiller.length,
        },
        ...meta,
      });

      return { ok: true as const, adAccounts: hesaplar.length, socialProfiles: profiller.length };
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
