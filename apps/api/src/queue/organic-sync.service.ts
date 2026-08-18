import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertAssigned } from '../common/utils/ad-account-assignment';
import { PlatformApiError } from '../modules/connections/provider.types';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService } from './quota-guard.service';

/**
 * L6 — organik gönderi senkronizasyonu (Modül 7 Auto-Boost'un girdisi).
 *
 * REKLAM SENKRONİZASYONUNDAN İKİ FARKI VAR:
 *
 *   1. SAYFA TOKEN'I kullanıyor, kullanıcı token'ı değil. Meta sayfa
 *      içgörülerini yalnızca sayfa token'ıyla veriyor ve o token ayrı
 *      şifrelenmiş bir kolonda duruyor.
 *
 *   2. Metrikler `insights_daily`ye YAZILMIYOR. O tablo reklam metrikleri
 *      için; organik erişimle ödenmiş erişimi aynı kovaya koymak, müşteriye
 *      "reklamla 50 bin kişiye ulaştık" derken 30 bininin organik olduğunu
 *      gizlemek olurdu.
 */

/**
 * Ne kadar geriye bakılıyor.
 *
 * Boost kuralı en fazla 30 günlük gönderilere bakabiliyor (şema sınırı 720
 * saat). 45 gün, o pencereyi güvenle kapsıyor ve gönderi metrikleri
 * yayınlandıktan sonra da değiştiği için geçmişi tazelemeye devam ediyor.
 */
const LOOKBACK_DAYS = 45;

@Injectable()
export class OrganicSyncService {
  private readonly logger = new Logger(OrganicSyncService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly providers: ProviderRegistry,
    private readonly crypto: CryptoService,
    private readonly quota: QuotaGuardService,
  ) {}

  async syncProfile(socialProfileId: string): Promise<{ rows: number; note: string }> {
    const found = await this.db.socialProfile.findUniqueOrThrow({
      where: { id: socialProfileId },
      // `org_id` artık SAYFANIN KENDİ kolonu. Eskiden müşteri üzerinden
      // JOIN'leniyordu ve o yolda bir kez org_id kolonuna MÜŞTERİ kimliği
      // yazılmıştı: RLS'in org kontrolü hiçbir satırı eşleştirmedi ve
      // gönderiler panelde hiç görünmedi.
      include: { connection: true },
    });

    // ATANMAMIŞ SAYFA BURADA DURUR. `organic_posts.client_id` NOT NULL; NULL
    // yazılamaz, yazılabilse de RLS o satırları kimseye göstermezdi.
    const profile = assertAssigned(found);

    if (!profile.pageAccessTokenEnc) {
      // SAYFA TOKEN'I YOKSA İŞ YAPILAMAZ ve bu kalıcı bir durum: yeniden
      // denemek aynı sonucu verir. Kullanıcının bağlantıyı sayfa izinleriyle
      // yeniden kurması gerekiyor.
      throw new PlatformApiError(
        'meta',
        'permanent',
        `${profile.name}: sayfa token'ı yok. Bağlantıyı pages_read_engagement izniyle yeniden kurmak gerekiyor.`,
      );
    }

    const gate = await this.quota.acquire({
      platform: 'meta',
      // Kota anahtarı SOSYAL PROFİL, reklam hesabı değil: organik çağrılar
      // sayfa token'ıyla gidiyor ve reklam hesabının kotasından düşmüyor.
      adAccountId: socialProfileId,
      layer: 'organic_posts',
    });
    if (!gate.allowed) {
      throw new PlatformApiError(
        'meta',
        'rate_limited',
        `Kota engeli: ${gate.reason}`,
      );
    }

    // Anahtar sürümü şifreli verinin İLK BAYTINA gömülü; `keyVersion`
    // kolonu yalnızca toplu anahtar rotasyonunun hangi satırları hedefleyeceğini
    // bulmak için var. `decrypt`e ayrıca vermek gereksiz ve iki kaynağın
    // ayrışması riski.
    // Prisma `Bytes` alanını Uint8Array olarak veriyor; crypto katmanı Buffer bekliyor.
    /**
     * YOUTUBE KANALI BU YOLA GİREMEZ.
     *
     * Bu süpürme Meta'nın organik gönderi uçlarını çağırıyor ve profil türünü
     * aşağıda `'facebook_page' | 'instagram_business'` olarak DARALTIYOR.
     * Advetics 1.0 ile `youtube_channel` eklendi ve o daraltma artık bir
     * DENETİMSİZ DÖNÜŞÜM: bir YouTube kanalı buraya düşerse tip sistemi
     * susar, Meta'ya kanal kimliğiyle sayfa gönderisi sorulur ve sonuç boş
     * bir liste olur — yani "bu kanalda hiç video yok" gibi görünür.
     *
     * YouTube içeriği kendi yolundan (WebSub bildirimi) geliyor; buraya
     * düşmesi çağıranın hatası ve sessizce yutulmamalı.
     */
    if (profile.profileType === 'youtube_channel') {
      throw new PlatformApiError(
        'meta',
        'permanent',
        'YouTube kanalı Meta organik gönderi süpürmesine giremez — ' +
          'YouTube içeriği kendi bildirim yolundan geliyor.',
      );
    }

    const pageToken = this.crypto.decrypt(Buffer.from(profile.pageAccessTokenEnc));
    const provider = this.providers.get('meta');

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const posts = await provider.fetchOrganicPosts({
      pageAccessToken: pageToken,
      profileExternalId: profile.externalId,
      profileType: profile.profileType as 'facebook_page' | 'instagram_business',
      since,
      onRateLimit: (snapshot) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: socialProfileId,
          clientId: profile.clientId,
          endpoint: 'organic:posts',
          snapshot,
        }),
    });

    if (posts.length === 0) {
      await this.touch(socialProfileId);
      return { rows: 0, note: `${profile.name}: gönderi yok` };
    }

    // TEK SORGUDA TOPLU UPSERT. Gönderi başına ayrı sorgu, 50 gönderilik bir
    // sayfada 50 gidiş-dönüş demek; senkronizasyon katmanının geri kalanı da
    // aynı deseni kullanıyor.
    const values = posts.map(
      (p) => Prisma.sql`(
        gen_random_uuid(), ${profile.orgId}::uuid,
        ${profile.clientId}::uuid, ${socialProfileId}::uuid,
        ${p.externalId}, ${p.mediaType}, ${p.message?.slice(0, 3000) ?? null},
        ${p.permalink ?? null}, ${p.thumbnailUrl ?? null}, ${p.publishedAt},
        ${p.impressions}, ${p.reach}, ${p.likes}, ${p.comments}, ${p.shares},
        ${p.saves}, ${p.videoViews},
        ${p.likes + p.comments + p.shares + p.saves},
        ${JSON.stringify(p.raw)}::jsonb, now(), now()
      )`,
    );

    const written = await this.db.$executeRaw(Prisma.sql`
      INSERT INTO organic_posts (
        id, org_id, client_id, social_profile_id, external_id, media_type,
        message, permalink, thumbnail_url, published_at,
        impressions, reach, likes, comments, shares, saves, video_views,
        engagements, raw, fetched_at, updated_at
      ) VALUES ${Prisma.join(values, ', ')}
      ON CONFLICT (social_profile_id, external_id) DO UPDATE SET
        message      = EXCLUDED.message,
        permalink    = EXCLUDED.permalink,
        thumbnail_url = EXCLUDED.thumbnail_url,
        impressions  = EXCLUDED.impressions,
        reach        = EXCLUDED.reach,
        likes        = EXCLUDED.likes,
        comments     = EXCLUDED.comments,
        shares       = EXCLUDED.shares,
        saves        = EXCLUDED.saves,
        video_views  = EXCLUDED.video_views,
        engagements  = EXCLUDED.engagements,
        raw          = EXCLUDED.raw,
        fetched_at   = now(),
        updated_at   = now()
        -- boosted_at ÜZERİNE YAZILMIYOR: o bizim kaydımız, platformun değil.
        -- Senkronizasyonun onu sıfırlaması, boost edilmiş bir gönderinin
        -- yeniden aday olması demek olurdu.
    `);

    await this.touch(socialProfileId);
    return { rows: written, note: `${profile.name}: ${posts.length} gönderi` };
  }

  private async touch(socialProfileId: string): Promise<void> {
    await this.db.socialProfile.update({
      where: { id: socialProfileId },
      data: { lastSyncAt: new Date() },
    });
  }
}
