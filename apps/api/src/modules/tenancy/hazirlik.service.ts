import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Platform, TenantContext, WorkspaceHazirlik } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { hazirlikMaddeleri } from './hazirlik';

interface HesapSatiri {
  name: string;
  platform: Platform;
  status: string;
  sync_enabled: boolean;
  last_structure_sync_at: Date | null;
  last_insights_sync_at: Date | null;
  /** `null` = bağlantı bu kapsamda görünmüyor (RLS). Yokluk değil. */
  connection_status: string | null;
  client_status: string;
}

/**
 * ═══ MARKA MERKEZİ HAZIRLIK LİSTESİ — VERİYİ TOPLAYAN TARAF ═══
 *
 * Karar `hazirlik.ts` içinde ve saf; burası yalnızca girdiyi kuruyor.
 *
 * BAĞLAM BU WORKSPACE'E DARALTILIYOR (`activeClientId: clientId`). Sayfa
 * workspace'i URL'den de alabiliyor (`?musteri=`), yani üst barda BAŞKA bir
 * workspace seçili olabilir. Bağlam o başka workspace'e daralıyken RLS bu
 * workspace'in satırlarını gizler ve liste her maddeyi "eksik" gösterirdi:
 * görünmeyen satırı "yok" saymak (CLAUDE.md). Daraltma burada GENİŞLETME
 * değil: `clientId` zaten `ctx.clientIds` içinde doğrulanıyor.
 *
 * TEK TRANSACTION, PLATFORM ÇAĞRISI YOK. Liste yalnızca veritabanını
 * okuyor; sayfa her açıldığında Meta'ya gitmek kota harcardı.
 */
@Injectable()
export class HazirlikService {
  constructor(private readonly prisma: PrismaService) {}

  async get(ctx: TenantContext, clientId: string, now = new Date()): Promise<WorkspaceHazirlik> {
    if (!ctx.clientIds.includes(clientId)) throw new NotFoundException('Workspace bulunamadı');
    const scoped: TenantContext = { ...ctx, activeClientId: clientId };

    /*
     * BÜTÇE YETKİSİ YOKSA SORULMUYOR. `monthly_budgets` politikası bu kişiye
     * satırı göstermezse sayım sıfır döner ve bu "bütçe yok" gibi okunurdu.
     * Madde `bilinmiyor` olarak dönüyor.
     */
    const butceOkunur = ctx.permissions?.includes('budget.read') ?? false;
    // Bütçe ekranı "bu ay"ı UTC ile kuruyor (`budgets.service.ts`); ay
    // sınırında iki ekranın farklı ayı göstermemesi için aynısı.
    const ay = `${now.toISOString().slice(0, 7)}-01`;

    return this.prisma.withTenant(scoped, async (tx) => {
      const [client] = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT name FROM clients WHERE id = ${clientId}::uuid
      `);
      if (!client) throw new NotFoundException('Workspace bulunamadı');

      const hesaplar = await tx.$queryRaw<HesapSatiri[]>(Prisma.sql`
        SELECT a.name, a.platform::text AS platform, a.status::text AS status,
               a.sync_enabled, a.last_structure_sync_at, a.last_insights_sync_at,
               c.status::text AS connection_status, cl.status::text AS client_status
          FROM ad_accounts a
          -- LEFT JOIN: RLS gizlediği bağlantıda INNER JOIN hesabı SESSİZCE
          -- eliyordu. Canlıda bir workspace'in kendi bağlantısından gelen
          -- hesabı "Tüm şirketler" modunda "hiç hesap atanmadı" diye
          -- görünüyordu. Görünürlüğe YALNIZCA kendi politikası karar verir.
          LEFT JOIN platform_connections c ON c.id = a.connection_id
          JOIN clients cl ON cl.id = a.client_id
         WHERE a.client_id = ${clientId}::uuid
         ORDER BY a.platform, a.name
      `);

      const [sosyal] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS n FROM social_profiles WHERE client_id = ${clientId}::uuid
      `);

      const [profil] = await tx.$queryRaw<
        Array<{
          marka_bilgileri: string | null;
          hedef_kitle: string | null;
          bilgi_bankasi: string | null;
          logo_asset_id: string | null;
          sektor: string | null;
          ana_amac: string | null;
          kategori_sayisi: number;
          vaat_sayisi: number;
          sayfa_sayisi: number;
        }>
      >(Prisma.sql`
        SELECT marka_bilgileri, hedef_kitle, bilgi_bankasi, logo_asset_id::text AS logo_asset_id,
               sektor, ana_amac,
               cardinality(urun_kategorileri)::int AS kategori_sayisi,
               cardinality(vaatler)::int AS vaat_sayisi,
               jsonb_array_length(sik_sayfalar)::int AS sayfa_sayisi
          FROM client_profiles WHERE client_id = ${clientId}::uuid
      `);

      let buAyButceVar: boolean | null = null;
      if (butceOkunur) {
        const [b] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS n FROM monthly_budgets
           WHERE client_id = ${clientId}::uuid AND month = ${ay}::date
        `);
        buAyButceVar = (b?.n ?? 0) > 0;
      }

      const maddeler = hazirlikMaddeleri({
        hesaplar: hesaplar.map((h) => ({
          name: h.name,
          platform: h.platform,
          status: h.status,
          syncEnabled: h.sync_enabled,
          lastStructureSyncAt: h.last_structure_sync_at,
          lastInsightsSyncAt: h.last_insights_sync_at,
          connection: h.connection_status === null ? null : { status: h.connection_status },
          client: { status: h.client_status },
        })),
        sosyalKanalSayisi: sosyal?.n ?? 0,
        profil: profil
          ? {
              markaBilgileri: profil.marka_bilgileri,
              hedefKitle: profil.hedef_kitle,
              bilgiBankasi: profil.bilgi_bankasi,
              logoAssetId: profil.logo_asset_id,
              sektor: profil.sektor,
              anaAmac: profil.ana_amac,
              kategoriSayisi: profil.kategori_sayisi,
              vaatSayisi: profil.vaat_sayisi,
              sayfaSayisi: profil.sayfa_sayisi,
            }
          : null,
        buAyButceVar,
      });

      return {
        clientId,
        clientName: client.name,
        maddeler,
        hazir: maddeler.every((m) => !m.zorunlu || m.durum === 'tamam'),
      };
    });
  }
}
