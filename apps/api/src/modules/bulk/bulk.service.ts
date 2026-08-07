import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BulkBatchDetail,
  BulkBatchInput,
  BulkBatchRecord,
  BulkBatchStatus,
  BulkIssue,
  BulkItemRecord,
  BulkItemStatus,
  TenantContext,
} from '@advetics/shared';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';
import { isPublishable, validateBatch, validateItem } from './bulk-validator';

/**
 * Modül 8 — Toplu Oluşturucu.
 *
 * İKİ AŞAMA VE ARALARINDA BİR KARAR NOKTASI:
 *   1. Parti kaydedilir → her satır DOĞRULANIR (yerel, platform çağrısı yok).
 *   2. Yetkili yayınlar (`bulk.publish`) → satır satır platforma yazılır.
 *
 * Doğrulama yayından ayrı olmalı çünkü bu modülün asıl değeri o: 60 reklamlık
 * bir partide 41. satırın hatasını platformdan öğrenmek, 40 reklam oluşmuş
 * hâlde kalmak demek.
 *
 * KISMİ BAŞARI NORMAL SAYILIYOR. Satırlar tek tek yazılıyor ve her birinin
 * durumu ayrı; yeniden yayınlama yalnızca `published` OLMAYANLARI alıyor.
 */

interface BatchRow {
  id: string;
  org_id: string;
  client_id: string;
  ad_account_id: string;
  ad_account_name: string;
  name: string;
  status: BulkBatchStatus;
  target_campaign_external_id: string | null;
  published_at: Date | null;
  created_at: Date;
  item_count: string | number;
  counts: Record<string, number> | null;
}

interface ItemRow {
  id: string;
  row_number: number;
  name: string;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  link_url: string | null;
  call_to_action: string | null;
  media_ref: string | null;
  status: BulkItemStatus;
  issues: BulkIssue[] | null;
  external_ad_id: string | null;
  error: string | null;
}

const EMPTY_COUNTS: Record<BulkItemStatus, number> = {
  pending: 0,
  invalid: 0,
  publishing: 0,
  published: 0,
  failed: 0,
};

@Injectable()
export class BulkService {
  private readonly logger = new Logger(BulkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  // ---------------------------------------------------------------------------
  // Parti oluşturma ve doğrulama
  // ---------------------------------------------------------------------------

  /**
   * Partiyi kaydeder ve HEMEN doğrular.
   *
   * Doğrulama ayrı bir adım değil: kullanıcı yapıştırdığı tabloyu kaydettiği
   * anda sorunları görmeli. "Kaydet" ve sonra "doğrula" iki tıklama, ikisi
   * arasında hiçbir karar yok — ve ikinciyi unutmak, sorunları yayın anına
   * ertelemek demek.
   */
  async create(ctx: TenantContext, input: BulkBatchInput): Promise<BulkBatchDetail> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [acc] = await tx.$queryRaw<Array<{ client_id: string }>>(Prisma.sql`
        SELECT client_id FROM ad_accounts WHERE id = ${input.adAccountId}::uuid
      `);
      if (!acc) throw new NotFoundException('Reklam hesabı bulunamadı');
      if (acc.client_id !== input.clientId) {
        throw new BadRequestException('Reklam hesabı bu müşteriye bağlı değil');
      }

      const [batch] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO bulk_batches (
          id, org_id, client_id, ad_account_id, name, status, defaults,
          target_campaign_external_id, created_by, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${input.adAccountId}::uuid, ${input.name}, 'draft',
          ${JSON.stringify(input.defaults)}::jsonb,
          ${input.targetCampaignExternalId ?? null}, ${ctx.userId}::uuid, now()
        )
        RETURNING id
      `);
      if (!batch) throw new NotFoundException('Parti oluşturulamadı');

      // PARTİ GENELİ sorunlar satır bazında dağıtılıyor: kullanıcı sorunu
      // satırın yanında görmeli, ayrı bir "parti uyarıları" kutusunda değil.
      const batchIssues = validateBatch(input.items);

      const values = input.items.map((item) => {
        const issues = [...validateItem(item), ...(batchIssues.get(item.rowNumber) ?? [])];
        const status: BulkItemStatus = isPublishable(issues) ? 'pending' : 'invalid';
        return Prisma.sql`(
          gen_random_uuid(), ${ctx.orgId}::uuid, ${batch.id}::uuid, ${item.rowNumber},
          ${item.name}, ${item.primaryText ?? null}, ${item.headline ?? null},
          ${item.description ?? null}, ${item.linkUrl ?? null},
          ${item.callToAction ?? null}, ${item.mediaRef ?? null},
          ${item.overrides ? JSON.stringify(item.overrides) : null}::jsonb,
          ${status},
          ${issues.length > 0 ? JSON.stringify(issues) : null}::jsonb,
          now()
        )`;
      });

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO bulk_items (
          id, org_id, batch_id, row_number, name, primary_text, headline,
          description, link_url, call_to_action, media_ref, overrides,
          status, issues, updated_at
        ) VALUES ${Prisma.join(values, ', ')}
      `);

      await this.refreshBatchStatus(tx, batch.id);
      return this.get(ctx, batch.id);
    });
  }

  async list(ctx: TenantContext, clientId: string): Promise<BulkBatchRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.selectBatches(
        tx,
        Prisma.sql`b.org_id = ${ctx.orgId}::uuid AND b.client_id = ${clientId}::uuid`,
      );
      return rows.map((r) => this.toBatchRecord(r));
    });
  }

  async get(ctx: TenantContext, id: string): Promise<BulkBatchDetail> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.selectBatches(
        tx,
        Prisma.sql`b.id = ${id}::uuid AND b.org_id = ${ctx.orgId}::uuid`,
      );
      const batch = rows[0];
      if (!batch) throw new NotFoundException('Parti bulunamadı');

      const items = await tx.$queryRaw<ItemRow[]>(Prisma.sql`
        SELECT * FROM bulk_items WHERE batch_id = ${id}::uuid ORDER BY row_number
      `);
      return { ...this.toBatchRecord(batch), items: items.map((i) => this.toItemRecord(i)) };
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      // YAYINLANMIŞ PARTİ SİLİNEMİYOR.
      //
      // Kaydı silmek platformdaki reklamları silmiyor; geriye izlenemeyen 60
      // reklam kalırdı. Yayınlanmış parti bir kayıt, taslak değil.
      const n = await tx.$executeRaw(Prisma.sql`
        DELETE FROM bulk_batches
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
          AND status NOT IN ('published', 'publishing')
      `);
      if (n === 0) {
        throw new BadRequestException(
          'Parti bulunamadı ya da yayınlanmış — yayınlanmış partiler silinemez.',
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Yayınlama
  // ---------------------------------------------------------------------------

  /**
   * Partiyi yayınlar — satır satır.
   *
   * `adSetExternalId` ve `pageExternalId` parti ayarlarından geliyor. Bunlar
   * olmadan reklam oluşturulamaz ve eksikse yayın HİÇ BAŞLAMIYOR: yarısı
   * açılmış bir parti bırakmak, hiç başlamamaktan kötü.
   */
  async publish(
    ctx: TenantContext,
    batchId: string,
  ): Promise<{ published: number; failed: number; skipped: number }> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [batch] = await tx.$queryRaw<
        Array<{
          id: string;
          status: BulkBatchStatus;
          defaults: Record<string, unknown>;
          account_external_id: string;
          connection_id: string;
          granted_scopes: string[];
          connection_status: string;
          ad_account_id: string;
        }>
      >(Prisma.sql`
        SELECT b.id, b.status, b.defaults, b.ad_account_id::text AS ad_account_id,
               a.external_id AS account_external_id,
               a.connection_id::text AS connection_id,
               c.granted_scopes, c.status::text AS connection_status
        FROM bulk_batches b
        JOIN ad_accounts a ON a.id = b.ad_account_id
        JOIN platform_connections c ON c.id = a.connection_id
        WHERE b.id = ${batchId}::uuid AND b.org_id = ${ctx.orgId}::uuid
      `);
      if (!batch) throw new NotFoundException('Parti bulunamadı');

      const adSetId = String(batch.defaults.adSetExternalId ?? '');
      const pageId = String(batch.defaults.pageExternalId ?? '');
      if (!adSetId || !pageId) {
        // ÖN KONTROL: eksik ayarla başlamak, ilk satırda patlayıp geri
        // kalanı belirsiz bırakmak demek olurdu.
        throw new BadRequestException(
          'Parti ayarlarında ad set ve sayfa kimliği zorunlu — yayın başlatılmadı.',
        );
      }

      const provider = this.providers.get('meta');
      if (batch.connection_status !== 'active') {
        throw new BadRequestException(
          `Platform bağlantısı etkin değil (${batch.connection_status}).`,
        );
      }
      const can = provider.canWrite(batch.granted_scopes ?? []);
      if (!can.ok) {
        throw new BadRequestException(
          `Yazma izni yok: ${can.missing.join(', ')}. Platform onayı gelene kadar yayınlanamaz.`,
        );
      }

      // YALNIZCA YAYINLANMAMIŞ satırlar alınıyor.
      //
      // Yeniden yayınlamada `published` satırları atlamak, aynı reklamın iki
      // kez oluşmasını engelliyor. `invalid` satırlar da alınmıyor: sorunları
      // düzeltilmeden gönderilmeleri platformdan hata almak demek.
      const items = await tx.$queryRaw<ItemRow[]>(Prisma.sql`
        SELECT * FROM bulk_items
        WHERE batch_id = ${batchId}::uuid AND status IN ('pending', 'failed')
        ORDER BY row_number
      `);

      const skipped = await this.countInvalid(tx, batchId);

      /**
       * YAPACAK İŞ KALMADIYSA reddediliyor — "durum published" olduğu için
       * DEĞİL.
       *
       * İlk yazımda kontrol `status === 'published'` idi ve kısmen başarısız
       * bir parti (bazı satırlar published, bazıları failed) "published"
       * sayıldığı için YENİDEN DENENEMİYORDU. Oysa yeniden deneme bu
       * modülün varlık sebebi: 60 satırın 3'ü patladığında geri kalanı
       * elle açmak istemiyoruz.
       */
      if (items.length === 0) {
        throw new BadRequestException(
          skipped > 0
            ? `Yayınlanacak satır yok — ${skipped} satır geçersiz, önce düzeltilmeli.`
            : 'Bu partideki tüm satırlar zaten yayınlandı.',
        );
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE bulk_batches SET status = 'publishing', published_by = ${ctx.userId}::uuid,
          published_at = now(), updated_at = now()
        WHERE id = ${batchId}::uuid
      `);

      const accessToken = await this.vault.getAccessToken(batch.connection_id, provider);
      let published = 0;
      let failed = 0;

      for (const item of items) {
        const gate = await this.quota.acquire({
          platform: 'meta',
          adAccountId: batch.ad_account_id,
          layer: 'rule_action',
        });
        if (!gate.allowed) {
          // KOTA BİTTİĞİNDE DURUYORUZ, devam etmiyoruz. Kalan satırlar
          // `pending` kalıyor ve yeniden yayınlamada alınıyor.
          await this.failItem(tx, item.id, `Kota engeli: ${gate.reason}`);
          failed++;
          break;
        }

        try {
          const res = await provider.createAd(
            {
              accessToken,
              accountExternalId: batch.account_external_id,
              onRateLimit: (snapshot) =>
                this.quota.record({
                  platform: 'meta',
                  adAccountId: batch.ad_account_id,
                  endpoint: 'bulk:create_ad',
                  snapshot,
                }),
            },
            {
              adAccountExternalId: batch.account_external_id,
              adSetExternalId: adSetId,
              pageExternalId: pageId,
              name: item.name,
              primaryText: item.primary_text ?? undefined,
              headline: item.headline ?? undefined,
              description: item.description ?? undefined,
              linkUrl: item.link_url ?? undefined,
              callToAction: item.call_to_action ?? undefined,
              mediaRef: item.media_ref!,
            },
          );

          await tx.$executeRaw(Prisma.sql`
            UPDATE bulk_items SET status = 'published',
              external_ad_id = ${res.externalAdId},
              external_creative_id = ${res.externalCreativeId},
              external_ad_set_id = ${adSetId},
              error = NULL, updated_at = now()
            WHERE id = ${item.id}::uuid
          `);
          published++;
        } catch (err) {
          const message =
            err instanceof PlatformApiError
              ? `${err.kind}: ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          // SATIR BAŞARISIZ, PARTİ DEVAM EDİYOR. Tek bir kötü satır yüzünden
          // kalan 59'u yazmamak, kullanıcıyı hepsini yeniden denemeye zorlar.
          await this.failItem(tx, item.id, message);
          failed++;
        }
      }

      await this.refreshBatchStatus(tx, batchId);
      return { published, failed, skipped };
    });
  }

  private async failItem(tx: TxLike, itemId: string, error: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE bulk_items SET status = 'failed', error = ${error.slice(0, 1000)}, updated_at = now()
      WHERE id = ${itemId}::uuid
    `);
  }

  private async countInvalid(tx: TxLike, batchId: string): Promise<number> {
    const [row] = await tx.$queryRaw<Array<{ n: string | number }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM bulk_items
      WHERE batch_id = ${batchId}::uuid AND status = 'invalid'
    `);
    return Number(row?.n ?? 0);
  }

  /**
   * Parti durumunu satırlardan TÜRETİYOR.
   *
   * Durumu elle yazmak, satırlarla partinin ayrışması demek olurdu: 3 satırı
   * başarısız bir parti "yayınlandı" görünürdü. Tek doğruluk kaynağı satırlar.
   */
  private async refreshBatchStatus(tx: TxLike, batchId: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE bulk_batches b SET status = (
        SELECT CASE
          WHEN COUNT(*) FILTER (WHERE i.status = 'published') = COUNT(*) THEN 'published'
          WHEN COUNT(*) FILTER (WHERE i.status = 'publishing') > 0 THEN 'publishing'
          WHEN COUNT(*) FILTER (WHERE i.status = 'failed') > 0
               AND COUNT(*) FILTER (WHERE i.status = 'published') > 0 THEN 'published'
          WHEN COUNT(*) FILTER (WHERE i.status = 'failed') > 0 THEN 'failed'
          WHEN COUNT(*) FILTER (WHERE i.status = 'invalid') > 0 THEN 'draft'
          ELSE 'validated'
        END
        FROM bulk_items i WHERE i.batch_id = b.id
      ), updated_at = now()
      WHERE b.id = ${batchId}::uuid
    `);
  }

  private async selectBatches(tx: TxLike, where: Prisma.Sql): Promise<BatchRow[]> {
    return tx.$queryRaw<BatchRow[]>(Prisma.sql`
      SELECT b.*, a.name AS ad_account_name,
             (SELECT COUNT(*) FROM bulk_items i WHERE i.batch_id = b.id) AS item_count,
             (SELECT jsonb_object_agg(s.status, s.n) FROM (
                SELECT i.status, COUNT(*) AS n FROM bulk_items i
                WHERE i.batch_id = b.id GROUP BY i.status
              ) s) AS counts
      FROM bulk_batches b
      JOIN ad_accounts a ON a.id = b.ad_account_id
      WHERE ${where}
      ORDER BY b.created_at DESC
    `);
  }

  private toBatchRecord(row: BatchRow): BulkBatchRecord {
    return {
      id: row.id,
      name: row.name,
      clientId: row.client_id,
      adAccountId: row.ad_account_id,
      adAccountName: row.ad_account_name,
      targetCampaignExternalId: row.target_campaign_external_id,
      status: row.status,
      itemCount: Number(row.item_count ?? 0),
      counts: { ...EMPTY_COUNTS, ...(row.counts ?? {}) },
      publishedAt: row.published_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }

  private toItemRecord(row: ItemRow): BulkItemRecord {
    return {
      id: row.id,
      rowNumber: row.row_number,
      name: row.name,
      primaryText: row.primary_text,
      headline: row.headline,
      description: row.description,
      linkUrl: row.link_url,
      callToAction: row.call_to_action,
      mediaRef: row.media_ref,
      status: row.status,
      issues: row.issues ?? [],
      externalAdId: row.external_ad_id,
      error: row.error,
    };
  }
}
