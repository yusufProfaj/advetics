import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CHANNEL_KINDS,
  type ChannelGroup,
  type ChannelItem,
  type ChannelKind,
  type ClientChannels,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** Kanal tipinin veritabanı karşılığı — eşleme TEK YERDE. */
const KAYNAK: Record<ChannelKind, { tablo: 'ad_accounts' | 'social_profiles'; suzgec: Prisma.Sql }> =
  {
    meta_ads: { tablo: 'ad_accounts', suzgec: Prisma.sql`platform = 'meta'` },
    google_ads: { tablo: 'ad_accounts', suzgec: Prisma.sql`platform = 'google'` },
    facebook: { tablo: 'social_profiles', suzgec: Prisma.sql`profile_type = 'facebook_page'` },
    instagram: {
      tablo: 'social_profiles',
      suzgec: Prisma.sql`profile_type = 'instagram_business'`,
    },
    youtube: { tablo: 'social_profiles', suzgec: Prisma.sql`profile_type = 'youtube_channel'` },
  };

interface Satir {
  id: string;
  name: string;
  external_id: string;
  sync_enabled: boolean;
  is_manager: boolean;
}

/**
 * BAĞLI KANALLAR — bir workspace'in görünümü.
 *
 * Kullanıcı "Meta Ads / Google Ads / Facebook / Instagram / YouTube" diye
 * düşünüyor; veritabanı `ad_accounts` (platforma göre) ve `social_profiles`
 * (profil tipine göre) diye tutuyor. Bu servis ikisini kullanıcının diliyle
 * birleştiriyor.
 *
 * BAĞLANTI AJANSA, KANAL WORKSPACE'E. Ajans Meta'ya bir kez bağlanıyor
 * (müşterilerin kendi Facebook hesabı yok, her yetkilendirme aynı kimliğe
 * çakışıyor); bu ekran o havuzdan hangi hesabın hangi müşteriye ait olduğunu
 * seçtiriyor. Başka müşterilerin ATANMIŞ hesapları burada GÖRÜNMÜYOR —
 * yalnızca bu workspace'inkiler ve havuzda bekleyenler.
 */
@Injectable()
export class ClientChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: TenantContext, clientId: string): Promise<ClientChannels> {
    /*
     * AKTİF MÜŞTERİ DARALTMASI KAPATILIYOR. Havuz satırlarının `client_id`'si
     * NULL; daraltma açıkken RLS onları da gizlerdi ve "atanabilecek hesap"
     * listesi her zaman boş çıkardı.
     *
     * Üyelik sınırı yerinde kalıyor: erişimi olmayan bir müşteri kimliği
     * verilirse aşağıdaki sorgu boş dönüyor ve 404 veriliyor.
     */
    const scoped: TenantContext = { ...ctx, activeClientId: null };

    return this.prisma.withTenant(scoped, async (tx) => {
      const [client] = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT name FROM clients WHERE id = ${clientId}::uuid
      `);
      if (!client) throw new NotFoundException('Müşteri bulunamadı');

      const groups: ChannelGroup[] = [];
      for (const kind of CHANNEL_KINDS) {
        const k = KAYNAK[kind];
        const rows =
          k.tablo === 'ad_accounts'
            ? await tx.$queryRaw<Array<Satir & { client_id: string | null }>>(Prisma.sql`
                SELECT id::text AS id, name, external_id, sync_enabled,
                       -- YÖNETİCİ (MCC) HESABI: kendi kimliğini yönetici
                       -- olarak gösteren hesap reklam yayınlamıyor.
                       (manager_external_id IS NOT NULL
                        AND manager_external_id = external_id) AS is_manager,
                       client_id::text AS client_id
                FROM ad_accounts
                -- SQL SÜZGECİ KAPSAMI DARALTIYOR, GÖRÜNÜRLÜĞÜ BELİRLEMİYOR.
                -- Aşağıdaki JS ayrımı (connected / available) yabancı satırı
                -- zaten iki listeye de koymuyor; buradaki koşul veritabanından
                -- gereksiz satır çekmemek için. İkisini birden tutmak bilinçli:
                -- biri kaldırılırsa çıktı değişmiyor, yalnızca maliyet artıyor.
                WHERE ${k.suzgec} AND (client_id = ${clientId}::uuid OR client_id IS NULL)
                ORDER BY name
              `)
            : await tx.$queryRaw<Array<Satir & { client_id: string | null }>>(Prisma.sql`
                SELECT id::text AS id, name, external_id, sync_enabled,
                       false AS is_manager,
                       client_id::text AS client_id
                FROM social_profiles
                WHERE ${k.suzgec} AND (client_id = ${clientId}::uuid OR client_id IS NULL)
                ORDER BY name
              `);

        const map = (r: Satir): ChannelItem => ({
          id: r.id,
          name: r.name,
          externalId: r.external_id,
          syncEnabled: r.sync_enabled,
          isManager: r.is_manager === true,
        });

        groups.push({
          kind,
          connected: rows.filter((r) => r.client_id === clientId).map(map),
          available: rows.filter((r) => r.client_id === null).map(map),
        });
      }

      /*
       * BOŞ LİSTENİN SEBEBİ. "Havuzda hesap yok" ile "ajans henüz Meta'ya
       * bağlanmadı" farklı iki iş ve ikisi de boş liste olarak görünüyor.
       */
      const hicKanalVar = groups.some((g) => g.connected.length + g.available.length > 0);
      let emptyReason: string | null = null;
      if (!hicKanalVar) {
        const [conn] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS n FROM platform_connections WHERE status <> 'revoked'
        `);
        emptyReason =
          (conn?.n ?? 0) === 0
            ? 'Ajansın henüz bir platform bağlantısı yok. Ayarlar → Platform ' +
              'Bağlantıları ekranından Meta ya da Google Ads hesabını bir kez bağla; ' +
              'erişilen hesaplar burada seçilebilir hâle gelir.'
            : 'Platform bağlantısı var ama hiç hesap keşfedilmemiş. Platform ' +
              'Bağlantıları ekranındaki "Hesapları yenile" ile tekrar dene.';
      }

      return { clientId, clientName: client.name, groups, emptyReason };
    });
  }
}
