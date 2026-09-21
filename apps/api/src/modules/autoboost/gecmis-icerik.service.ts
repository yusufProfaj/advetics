import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncQueueService } from '../../queue/sync-queue.service';
import { AutoBoostQueueService, ILK_CEKIM_ADEDI } from './autoboost-queue.service';
import { YouTubeApiService } from './youtube-api.service';
import { youtubeWatchUrl } from './youtube-websub';

/**
 * ═══ GEÇMİŞ İÇERİĞİ AKILLI BOOST'A ÇEKME ═══
 *
 * Kullanıcının isteği birebir: "geçmişteki gönderileri yayınlayabilmek".
 *
 * ═══ NEDEN OTOMATİK TOHUM YETMEDİ ═══
 *
 * Kart üretimi iki otomatik yola bağlıydı ve ikisi de TEK SEFERLİK:
 * Instagram'da ön ayarın `seed_at` damgası, YouTube'da kanalın atanma anı.
 * Tek seferlik bir yol, koşullardan biri o an yerinde değilse (gönderi henüz
 * çekilmemiş, ön ayar sonradan açılmış, sayfa sonradan atanmış) fırsatı
 * harcıyor ve kullanıcının elinde hiçbir düğme kalmıyor. Üretimde tam olarak
 * bu oldu: bir workspace'te YouTube kartları geldi, Instagram kartları
 * gelmedi ve kullanıcının yapabileceği bir şey yoktu.
 *
 * Bu servis o yolu ELLE ve TEKRARLANABİLİR hâle getiriyor. Damgaya
 * dokunmuyor: mükerrer engeli kısıtta olduğu için ikinci basış zaten hiçbir
 * şey üretmiyor ve bir düğmenin "sadece bir kez çalışması" açıklanamazdı.
 *
 * ═══ İKİ KAYNAK, İKİ AYRI YOL ═══
 *
 * Instagram gönderileri ARŞİVDEN (`organic_posts`) geliyor — o tabloyu
 * süpürme dolduruyor ve penceresi 45 gün. YouTube videoları ise doğrudan
 * Data API'den; bizim tarafta arşivleri yok.
 *
 * ARŞİV BOŞSA SÜPÜRME DE TETİKLENİYOR ve kullanıcıya söyleniyor. Sessizce
 * "0 kart" demek, düğmenin bozuk olduğunu düşündürürdü.
 */
@Injectable()
export class GecmisIcerikService {
  private readonly logger = new Logger(GecmisIcerikService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kuyruk: AutoBoostQueueService,
    private readonly youtube: YouTubeApiService,
    private readonly sync: SyncQueueService,
  ) {}

  async cek(
    ctx: TenantContext,
    clientId: string,
  ): Promise<{ kartlar: number; notlar: string[] }> {
    const scoped = { ...ctx, activeClientId: clientId };

    const profiller = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<
        Array<{
          id: string;
          org_id: string;
          profile_type: string;
          external_id: string;
          name: string;
        }>
      >(Prisma.sql`
        SELECT id::text AS id, org_id::text AS org_id,
               profile_type::text AS profile_type, external_id, name
        FROM social_profiles
        WHERE client_id = ${clientId}::uuid
        ORDER BY name
      `),
    );

    if (profiller.length === 0) {
      return {
        kartlar: 0,
        notlar: [
          'Bu workspace’e Instagram sayfası ya da YouTube kanalı atanmamış. ' +
            'Platform Bağlantıları ekranından ata.',
        ],
      };
    }

    let kartlar = 0;
    const notlar: string[] = [];

    for (const p of profiller) {
      if (p.profile_type === 'youtube_channel') {
        const sonuc = await this.kanaldanCek(p, clientId);
        kartlar += sonuc.kartlar;
        notlar.push(sonuc.note);
        continue;
      }

      const sonuc = await this.kuyruk.enqueueForProfile(p.id, { gecmis: true });
      kartlar += sonuc.created;
      notlar.push(sonuc.note);

      /*
       * ARŞİV TAZELENİYOR — ama kart bu çağrının sonucunu BEKLEMİYOR.
       *
       * Süpürme kuyrukta koşuyor ve platform çağrısı içeriyor; isteğin içinde
       * beklemek kullanıcıyı dakikalarca boş ekranda tutardı. İşin sonunda
       * `enqueueForProfile` zaten yeniden koşuyor, yani yeni gelen gönderiler
       * kendiliğinden karta dönüyor.
       *
       * `interactive`: kullanıcı ekranda bekliyor, takılmış bir iş varsa
       * kaldırılıp yenisi konsun.
       */
      await this.sync.enqueue({
        clientId,
        platform: 'meta',
        jobType: 'organic_posts',
        socialProfileId: p.id,
        interactive: true,
      });
    }

    this.logger.log(`Geçmiş içerik çekimi (${clientId}): ${kartlar} kart.`);
    return { kartlar, notlar };
  }

  /**
   * YouTube kanalının son videoları.
   *
   * Kanal atanırken de çekiliyor ama ORADA DAHA AZ (kurulum anında kullanıcı
   * bir liste istemiyor). Burada sayı Instagram'la AYNI: kullanıcı tek bir
   * düğmeye basıyor ve iki mecradan farklı derinlikte sonuç gelmesi
   * açıklanamazdı.
   */
  private async kanaldanCek(
    profil: { id: string; org_id: string; external_id: string; name: string },
    clientId: string,
  ): Promise<{ kartlar: number; note: string }> {
    const sonuc = await this.youtube.listRecentVideos(profil.external_id, ILK_CEKIM_ADEDI);

    if (sonuc.durum === 'hata') {
      return { kartlar: 0, note: `${profil.name}: videolar çekilemedi — ${sonuc.message}` };
    }
    if (sonuc.durum === 'bulunamadi') {
      return { kartlar: 0, note: `${profil.name}: kanalda yüklenmiş video yok` };
    }

    let kartlar = 0;
    for (const video of sonuc.videolar) {
      const yazildi = await this.kuyruk.enqueueOne({
        orgId: profil.org_id,
        clientId,
        socialProfileId: profil.id,
        platform: 'google',
        externalId: video.id,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        permalink: youtubeWatchUrl(video.id),
        mediaType: 'video',
        publishedAt: video.publishedAt,
        // GEÇMİŞ ÇEKİMİ: mail "yeni içerik" diyor ve bunlar yeni değil.
        bildirim: false,
      });
      if (yazildi) kartlar += 1;
    }

    return {
      kartlar,
      note:
        kartlar > 0
          ? `${profil.name}: ${kartlar} video karta çevrildi`
          : `${profil.name}: geçmiş videolar zaten listede`,
    };
  }
}
