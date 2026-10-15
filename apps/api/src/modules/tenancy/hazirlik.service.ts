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
  /** Hesabın en son veri işi (`sync_jobs`); NULL = hiç iş yok. */
  is_durum: string | null;
  is_zaman: Date | null;
  is_hata: string | null;
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
      const [client] = await tx.$queryRaw<
        Array<{
          name: string;
          website: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_emails: string[] | null;
          address: string | null;
          konum_var: boolean;
        }>
      >(Prisma.sql`
        SELECT name, website, contact_name, contact_phone, contact_emails, address,
               (address_latitude IS NOT NULL AND address_longitude IS NOT NULL) AS konum_var
          FROM clients WHERE id = ${clientId}::uuid
      `);
      if (!client) throw new NotFoundException('Workspace bulunamadı');

      const hesaplar = await tx.$queryRaw<HesapSatiri[]>(Prisma.sql`
        SELECT a.name, a.platform::text AS platform, a.status::text AS status,
               a.sync_enabled, a.last_structure_sync_at, a.last_insights_sync_at,
               c.status::text AS connection_status, cl.status::text AS client_status,
               j.status::text AS is_durum, j.zaman AS is_zaman, j.error_message AS is_hata
          FROM ad_accounts a
          -- LEFT JOIN: RLS gizlediği bağlantıda INNER JOIN hesabı SESSİZCE
          -- eliyordu. Canlıda bir workspace'in kendi bağlantısından gelen
          -- hesabı "Tüm şirketler" modunda "hiç hesap atanmadı" diye
          -- görünüyordu. Görünürlüğe YALNIZCA kendi politikası karar verir.
          LEFT JOIN platform_connections c ON c.id = a.connection_id
          JOIN clients cl ON cl.id = a.client_id
          -- Hesabın EN SON veri işi: ilk çekimin sürdüğünü "hiç koşmadı"dan
          -- ayırmak için (sihirbaz, bekliyor durumu). Kural, sinyal, organik
          -- gönderi işleri sayılmıyor; yalnız hesabın yapısını ve metriğini
          -- çeken türler.
          LEFT JOIN LATERAL (
            SELECT s.status, COALESCE(s.started_at, s.created_at) AS zaman, s.error_message
              FROM sync_jobs s
             WHERE s.ad_account_id = a.id
               AND s.job_type IN ('structure', 'initial_backfill', 'insights_daily', 'insights_backfill', 'insights_realtime')
             ORDER BY s.created_at DESC, s.id DESC
             LIMIT 1
          ) j ON true
         WHERE a.client_id = ${clientId}::uuid
         ORDER BY a.platform, a.name
      `);

      const [kanal] = await tx.$queryRaw<Array<{ etkin: number; toplam: number }>>(Prisma.sql`
        SELECT count(*) FILTER (WHERE etkin)::int AS etkin, count(*)::int AS toplam
          FROM bildirim_kanallari WHERE client_id = ${clientId}::uuid
      `);

      const [ekip] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(DISTINCT user_id)::int AS n FROM memberships
         WHERE client_id = ${clientId}::uuid AND role IN ('admin', 'ad_manager')
      `);

      const [sosyal] = await tx.$queryRaw<Array<{ n: number; youtube: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE profile_type = 'youtube_channel')::int AS youtube
          FROM social_profiles WHERE client_id = ${clientId}::uuid
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

      const [hazirlama] = await tx.$queryRaw<Array<{ durum: string; soru_sayisi: number }>>(Prisma.sql`
        SELECT durum, jsonb_array_length(sorular)::int AS soru_sayisi FROM workspace_hazirlama WHERE client_id = ${clientId}::uuid
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
          sonIs: h.is_durum && h.is_zaman ? { durum: h.is_durum, zaman: new Date(h.is_zaman), hata: h.is_hata } : null,
        })),
        sosyalKanalSayisi: sosyal?.n ?? 0,
        youtubeKanalSayisi: sosyal?.youtube ?? 0,
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
        hazirlama: hazirlama ? { durum: hazirlama.durum, soruSayisi: hazirlama.soru_sayisi } : null,
        bilgiler: {
          website: client.website,
          contactName: client.contact_name,
          contactPhone: client.contact_phone,
          contactEmails: client.contact_emails ?? [],
          address: client.address,
          konumVar: client.konum_var === true,
        },
        bildirimKanali: { etkin: kanal?.etkin ?? 0, toplam: kanal?.toplam ?? 0 },
        /*
         * EKİP LİSTESİNİ GÖREMEYEN için sıfır "kimse yok" DEĞİL. `memberships`
         * politikası yöneticiye hepsini, diğerine yalnız KENDİ satırını
         * gösteriyor: yönetici olmayan biri sıfır görüyorsa bu "kimse
         * atanmamış" da olabilir "göremiyorum" da. Kendi satırı görünüyorsa
         * (n > 0) cevap kesin: en az bir sorumlu var, o kendisi.
         */
        sorumluKisi: ctx.isOrgAdmin || (ekip?.n ?? 0) > 0 ? (ekip?.n ?? 0) : null,
        simdi: now,
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
