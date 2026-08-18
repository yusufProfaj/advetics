import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';

/**
 * ONAY KUYRUĞUNU BESLEYEN SERVİS (Advetics 1.0).
 *
 * İki kaynaktan besleniyor ve ikisi de aynı kapıdan giriyor:
 *   · Instagram — mevcut organik gönderi SÜPÜRMESİ (webhook yok, bkz.
 *     `docs/ADVETICS-1.0.md` §1: Meta'da "yeni gönderi" webhook'u
 *     bulunmuyor)
 *   · YouTube   — WebSub bildirimi
 *
 * TEK KAPI OLMASI BİLİNÇLİ: mükerrer engelleme, ön ayar çözümlemesi ve
 * "ne zamandan itibaren izliyoruz" kuralı iki yerde ayrı yazılsaydı bir gün
 * ayrışırdı — ve ayrıştığı gün ortaya çıkan şey ya kart gelmemesi ya da aynı
 * içerik için iki reklam.
 *
 * WORKER BAĞLAMINDA ÇALIŞIYOR (`PrismaAdminService`, BYPASSRLS). Süpürme ve
 * webhook'un oturumu yok, dolayısıyla RLS politikaları eşleşemezdi ve kayıt
 * SESSİZCE kaybolurdu — `client_id` bağlamı olmayan bir satırı RLS kimseye
 * göstermiyor.
 */
@Injectable()
export class AutoBoostQueueService {
  private readonly logger = new Logger(AutoBoostQueueService.name);

  constructor(private readonly db: PrismaAdminService) {}

  /**
   * Bir sosyal profil için yeni içerikleri kuyruğa yazar.
   *
   * ÜÇ FİLTRE VE ÜÇÜ DE GEREKLİ:
   *
   * 1. ÖN AYAR OLMALI. Ön ayarsız kart onaylanamaz — "onayla" düğmesi hangi
   *    bütçeyle, hangi hedeflemeyle yayınlayacağını bilmez. Kart göstermek,
   *    tıklanınca hata veren bir düğme göstermek olurdu.
   *
   * 2. GÖNDERİ ÖN AYARDAN SONRA YAYINLANMIŞ OLMALI. Aksi hâlde otomatik
   *    boost ilk kez açıldığında son 90 günün gönderileri kuyruğa dolardı.
   *    Kural açıklanabilir: "açtığın andan itibaren izlemeye başlar."
   *
   * 3. DAHA ÖNCE KUYRUĞA GİRMEMİŞ OLMALI. Bu filtre SQL'de değil KISITTA:
   *    `ON CONFLICT DO NOTHING` + tekil indeks. Sorguyla ayıklamak, iki
   *    süpürme aynı anda koştuğunda yarışı kaybederdi.
   */
  async enqueueForProfile(socialProfileId: string): Promise<{
    created: number;
    note: string;
  }> {
    const [profil] = await this.db.$queryRaw<
      Array<{
        org_id: string;
        client_id: string | null;
        profile_type: string;
        name: string;
      }>
    >(Prisma.sql`
      SELECT org_id::text AS org_id, client_id::text AS client_id,
             profile_type::text AS profile_type, name
      FROM social_profiles WHERE id = ${socialProfileId}::uuid
    `);

    if (!profil) return { created: 0, note: 'profil bulunamadı' };

    /*
     * ATANMAMIŞ PROFİL KUYRUĞA GİRMİYOR.
     *
     * `client_id` NULL = ajansın havuzunda, müşteriye atanmamış. O satır için
     * kayıt açmak, RLS'in kimseye göstermeyeceği bir kart üretmek demek —
     * kart var olur ama panelde hiç görünmez. Aynı gerekçe `assertAssigned()`
     * ile senkronizasyon kuyruğunda da uygulanıyor.
     */
    if (!profil.client_id) {
      return { created: 0, note: `${profil.name}: müşteriye atanmamış` };
    }

    const preset = await this.resolvePreset(
      profil.client_id,
      socialProfileId,
      profil.profile_type === 'youtube_channel' ? 'google' : 'meta',
    );

    if (!preset) {
      return { created: 0, note: `${profil.name}: otomatik boost ön ayarı yok` };
    }

    /*
     * KAYNAK TABLO PROFİL TÜRÜNE GÖRE DEĞİŞİYOR ama YouTube tarafı buradan
     * beslenmiyor: video bildirimi WebSub'dan tek tek geliyor ve
     * `enqueueOne` ile yazılıyor. Bu metot yalnızca süpürmeyle çalışan
     * Instagram/Facebook yolunu besliyor.
     */
    if (profil.profile_type === 'youtube_channel') {
      return { created: 0, note: `${profil.name}: YouTube kendi bildirim yolundan gelir` };
    }

    const created = await this.db.$executeRaw(Prisma.sql`
      INSERT INTO auto_boost_queue_items (
        id, org_id, client_id, platform, social_profile_id, external_id,
        title, thumbnail_url, permalink, media_type, published_at, updated_at
      )
      SELECT gen_random_uuid(), p.org_id, p.client_id, 'meta', p.social_profile_id,
             p.external_id, left(p.message, 2000), p.thumbnail_url, p.permalink,
             p.media_type::text, p.published_at, now()
      FROM organic_posts p
      WHERE p.social_profile_id = ${socialProfileId}::uuid
        -- ÖN AYARDAN SONRA YAYINLANANLAR. Bu koşul olmadan otomatik boost
        -- ilk açıldığında son 90 günün gönderileri kuyruğa dolardı.
        AND p.published_at > ${preset.createdAt}
      -- MÜKERRER ENGELLEME KISITTA, sorguda değil: iki süpürme aynı anda
      -- koşabiliyor ve "önce bak sonra yaz" yarışı kaybediyor.
      ON CONFLICT (social_profile_id, external_id) DO NOTHING
    `);

    if (created > 0) {
      this.logger.log(
        `${profil.name}: ${created} yeni gönderi onay kuyruğuna eklendi`,
      );
    }
    return { created, note: `${profil.name}: ${created} yeni kart` };
  }

  /**
   * Tek bir içeriği kuyruğa yazar — YouTube bildirimi bu yoldan giriyor.
   *
   * DÖNÜŞ DEĞERİ MÜKERRERİ AYIRT EDİYOR. `false` "hata" değil, "bu içerik
   * zaten kuyrukta" demek ve webhook'un buna 200 dönmesi gerekiyor: hub'a
   * hata bildirmek, aynı bildirimin tekrar tekrar gönderilmesine yol açar.
   */
  async enqueueOne(params: {
    orgId: string;
    clientId: string;
    socialProfileId: string;
    platform: 'meta' | 'google';
    externalId: string;
    title: string | null;
    thumbnailUrl: string | null;
    permalink: string | null;
    mediaType: string | null;
    publishedAt: Date | null;
  }): Promise<boolean> {
    const yazilan = await this.db.$executeRaw(Prisma.sql`
      INSERT INTO auto_boost_queue_items (
        id, org_id, client_id, platform, social_profile_id, external_id,
        title, thumbnail_url, permalink, media_type, published_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${params.orgId}::uuid, ${params.clientId}::uuid,
        ${params.platform}::"Platform", ${params.socialProfileId}::uuid,
        ${params.externalId}, ${params.title?.slice(0, 2000) ?? null},
        ${params.thumbnailUrl}, ${params.permalink}, ${params.mediaType},
        ${params.publishedAt}, now()
      )
      ON CONFLICT (social_profile_id, external_id) DO NOTHING
    `);
    return yazilan > 0;
  }

  /**
   * Bu profile hangi ön ayar uygulanacak?
   *
   * PROFİL BAZLI ÖN AYAR MÜŞTERİ VARSAYILANINI EZİYOR ve sıra AÇIKÇA
   * yazılıyor. Belirsiz bırakılsaydı hangi ayarla yayınlandığı satır sırasına
   * kalırdı — ve satır sırası bir gün değişir.
   *
   * KAPALI ÖN AYAR YOK SAYILMIYOR, "ön ayar yok" sayılıyor: kullanıcı
   * otomatik boost'u kapattığında kart üretilmemeli. Profil bazlı ön ayar
   * KAPALI ama müşteri varsayılanı AÇIK ise varsayılana düşmüyoruz — o
   * profil için verilmiş bilinçli bir "kapat" kararını geçersiz kılardı.
   */
  private async resolvePreset(
    clientId: string,
    socialProfileId: string,
    platform: 'meta' | 'google',
  ): Promise<{ id: string; createdAt: Date; enabled: boolean } | null> {
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        created_at: Date;
        enabled: boolean;
        social_profile_id: string | null;
      }>
    >(Prisma.sql`
      SELECT id::text AS id, created_at, enabled,
             social_profile_id::text AS social_profile_id
      FROM auto_boost_presets
      WHERE client_id = ${clientId}::uuid
        AND platform = ${platform}::"Platform"
        AND (social_profile_id = ${socialProfileId}::uuid OR social_profile_id IS NULL)
      -- PROFİL BAZLI ÖNCE. NULLS LAST açıkça yazılıyor: Postgres'te NULL'lar
      -- varsayılan olarak ASC sıralamada SONDA ama bu davranışa güvenmek,
      -- sıralamayı okuyan herkesin o kuralı bilmesini gerektirir.
      ORDER BY social_profile_id NULLS LAST
      LIMIT 1
    `);

    const p = rows[0];
    if (!p || !p.enabled) return null;
    return { id: p.id, createdAt: p.created_at, enabled: p.enabled };
  }
}
