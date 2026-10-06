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
import { PrismaAdminService } from '../../prisma/prisma-admin.service';

/** Kanal tipinin veritabanı karşılığı — eşleme TEK YERDE. */
const KAYNAK: Record<ChannelKind, { tablo: 'ad_accounts' | 'social_profiles'; suzgec: Prisma.Sql }> =
  {
    meta_ads: { tablo: 'ad_accounts', suzgec: Prisma.sql`platform = 'meta'` },
    google_ads: { tablo: 'ad_accounts', suzgec: Prisma.sql`platform = 'google'` },
    linkedin_ads: { tablo: 'ad_accounts', suzgec: Prisma.sql`platform = 'linkedin'` },
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
  /** Yalnızca sosyal profillerde; reklam hesabı sorgusu bu kolonu seçmiyor. */
  linked_ad_account_id?: string | null;
}

/**
 * BAĞLI KANALLAR — bir workspace’in görünümü.
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
 * yalnızca bu workspace’inkiler ve havuzda bekleyenler.
 */
@Injectable()
export class ClientChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * YALNIZCA SAHİPLİK KARŞILAŞTIRMASI İÇİN. Müşteri ajansın bağlantısını
     * RLS altında göremiyor ve görünmeyen satır "yok" sayılamaz (CLAUDE.md).
     * Okunan şey kullanıcının ZATEN gördüğü kalemler için iki şirket
     * kimliğinin karşılaştırması; dışarı satır dönmüyor.
     * `connections.service.ts#sahiplikUygula` ile aynı gerekçe.
     */
    private readonly admin: PrismaAdminService,
  ) {}

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
      if (!client) throw new NotFoundException('Workspace bulunamadı');

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
                       client_id::text AS client_id,
                       linked_ad_account_id::text AS linked_ad_account_id
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
          /*
           * BOOST HESABI MARKA MERKEZİ'NDE DE SEÇİLEBİLSİN DİYE TAŞINIYOR.
           * Bu seçim yalnızca Şirketler ekranındaki workspace penceresinde
           * vardı; kullanıcı workspace'i Marka Merkezi'nden kurmak istiyor
           * ve seçim yapılmazsa Akıllı Boost her gönderide "bağlı reklam
           * hesabı yok" diyor. Reklam hesaplarında alan hiç yazılmıyor.
           */
          ...(k.tablo === 'social_profiles'
            ? { linkedAdAccountId: r.linked_ad_account_id ?? null }
            : {}),
        });

        groups.push({
          kind,
          connected: rows.filter((r) => r.client_id === clientId).map(map),
          available: rows.filter((r) => r.client_id === null).map(map),
        });
      }

      /*
       * AJANS MI ATADI — bağlantının şirketi workspace'in şirketinden farklıysa.
       * Yalnızca BAĞLI kalemler; havuzdakiler zaten atanmamış.
       */
      const bagliHesap = groups.filter((g) => KAYNAK[g.kind].tablo === 'ad_accounts')
        .flatMap((g) => g.connected.map((i) => i.id));
      const bagliSayfa = groups.filter((g) => KAYNAK[g.kind].tablo === 'social_profiles')
        .flatMap((g) => g.connected.map((i) => i.id));
      const ajansAtadi = new Set<string>();
      for (const [tablo, idler] of [
        [Prisma.raw('ad_accounts'), bagliHesap],
        [Prisma.raw('social_profiles'), bagliSayfa],
      ] as const) {
        if (idler.length === 0) continue;
        const satirlar = await this.admin.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT x.id::text AS id
            FROM ${tablo} x
            JOIN platform_connections c ON c.id = x.connection_id
            JOIN clients cl ON cl.id = x.client_id
           WHERE x.id = ANY (${idler}::uuid[])
             AND c.org_id <> cl.org_id
        `);
        for (const r of satirlar) ajansAtadi.add(r.id);
      }
      for (const g of groups) {
        g.connected = g.connected.map((i) => ({ ...i, ajansAtadi: ajansAtadi.has(i.id) }));
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
