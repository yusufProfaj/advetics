import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACCEPTED_MIME,
  AD_TEXT_FIELDS,
  ASSET_RATIOS,
  GOAL_META,
  MAX_IMAGE_BYTES,
  MIN_IMAGE_EDGE,
  RATIO_META,
  matchRatio,
  type AdAssetRecord,
  type AdDraftInput,
  type AdDraftRecord,
  type AdDraftStatus,
  type AssetRatio,
  type CampaignGoal,
  type PublishCheck,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';
import { AssetStorageService } from './asset-storage.service';
import { probeImage } from './image-probe';
import { campaignSpec, totalCommitmentMicros } from './goal-mapping';

/**
 * Reklam Oluşturucu — veri katmanı.
 *
 * DOĞRULAMANIN TAMAMI YÜKLEME ANINDA, yayın anında değil.
 *
 * Sebep: yayın anında verilen bir hata kullanıcıyı en kötü anda yakalıyor —
 * her şeyi doldurmuş, "Yayınla"ya basmış ve bekliyor. Görselin oranı yanlışsa
 * bunu bıraktığı saniyede söylemek gerekiyor.
 */

interface DraftRow {
  id: string;
  org_id: string;
  client_id: string;
  ad_account_id: string;
  ad_account_name: string;
  social_profile_id: string;
  social_profile_name: string;
  linked_ad_account_id: string | null;
  goal: CampaignGoal;
  name: string;
  primary_text: string;
  headline: string | null;
  description: string | null;
  link_url: string | null;
  whatsapp_number: string | null;
  daily_budget_micros: string | number | bigint;
  duration_days: number;
  status: AdDraftStatus;
  external_campaign_id: string | null;
  external_ad_id: string | null;
  error: string | null;
  published_at: Date | null;
  created_at: Date;
}

interface AssetRow {
  id: string;
  draft_id: string;
  ratio: AssetRatio;
  file_name: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  storage_key: string;
  meta_image_hash: string | null;
}

@Injectable()
export class AdBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AssetStorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // Taslak
  // ---------------------------------------------------------------------------

  async list(ctx: TenantContext, clientId: string): Promise<AdDraftRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.selectDrafts(
        tx,
        Prisma.sql`d.org_id = ${ctx.orgId}::uuid AND d.client_id = ${clientId}::uuid`,
      );
      const assets = await this.loadAssets(tx, rows.map((r) => r.id));
      return rows.map((r) => this.toRecord(r, assets.get(r.id) ?? []));
    });
  }

  async get(ctx: TenantContext, id: string): Promise<AdDraftRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.selectDrafts(
        tx,
        Prisma.sql`d.id = ${id}::uuid AND d.org_id = ${ctx.orgId}::uuid`,
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Taslak bulunamadı');
      const assets = await this.loadAssets(tx, [row.id]);
      return this.toRecord(row, assets.get(row.id) ?? []);
    });
  }

  async create(ctx: TenantContext, input: AdDraftInput): Promise<AdDraftRecord> {
    const id = await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertScope(tx, input);
      const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO ad_drafts (
          id, org_id, client_id, ad_account_id, social_profile_id, goal, name,
          primary_text, headline, description, link_url, whatsapp_number,
          daily_budget_micros, duration_days, created_by, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${input.adAccountId}::uuid, ${input.socialProfileId}::uuid,
          ${input.goal}, ${input.name}, ${input.primaryText},
          ${input.headline || null}, ${input.description || null},
          ${input.linkUrl || null}, ${input.whatsappNumber || null},
          ${toMicros(input.dailyBudget)}::bigint, ${input.durationDays},
          ${ctx.userId}::uuid, now()
        )
        RETURNING id
      `);
      if (!row) throw new NotFoundException('Taslak oluşturulamadı');
      return row.id;
    });
    return this.get(ctx, id);
  }

  async update(ctx: TenantContext, id: string, input: AdDraftInput): Promise<AdDraftRecord> {
    await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertScope(tx, input);
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE ad_drafts SET
          ad_account_id = ${input.adAccountId}::uuid,
          social_profile_id = ${input.socialProfileId}::uuid,
          goal = ${input.goal},
          name = ${input.name},
          primary_text = ${input.primaryText},
          headline = ${input.headline || null},
          description = ${input.description || null},
          link_url = ${input.linkUrl || null},
          whatsapp_number = ${input.whatsappNumber || null},
          daily_budget_micros = ${toMicros(input.dailyBudget)}::bigint,
          duration_days = ${input.durationDays},
          updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
          -- YAYINLANMIŞ TASLAK DEĞİŞTİRİLEMEZ.
          --
          -- Değişiklik platformda hiçbir şeyi değiştirmez ama panelde
          -- yayındaki reklamdan farklı bir şey gösterir. "Reklamda ne yazıyor"
          -- sorusunun cevabı yanlış olur.
          AND status IN ('draft', 'failed')
      `);
      if (n === 0) {
        throw new NotFoundException(
          'Taslak bulunamadı ya da yayınlandığı için değiştirilemiyor.',
        );
      }
    });
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const keys = await this.prisma.withTenant(ctx, async (tx) => {
      const assets = await tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        SELECT a.storage_key FROM ad_draft_assets a
        JOIN ad_drafts d ON d.id = a.draft_id
        WHERE d.id = ${id}::uuid AND d.org_id = ${ctx.orgId}::uuid
      `);
      const n = await tx.$executeRaw(Prisma.sql`
        DELETE FROM ad_drafts WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Taslak bulunamadı');
      return assets.map((a) => a.storage_key);
    });

    // Dosyalar VERİTABANI SİLİNDİKTEN SONRA siliniyor. Ters sıra, dosya
    // silinip veritabanı işlemi geri alındığında kaydı olan ama dosyası
    // olmayan bir taslak bırakırdı.
    for (const key of keys) await this.storage.remove(key);
  }

  // ---------------------------------------------------------------------------
  // Görseller
  // ---------------------------------------------------------------------------

  /**
   * Görsel yükler — TÜM DOĞRULAMA BURADA.
   *
   * Kullanıcı görseli bıraktığı saniyede sonucu görüyor. Yayın anına
   * bırakılan bir doğrulama, her şeyi doldurmuş kullanıcıyı en kötü anda
   * yakalar.
   */
  async addAsset(
    ctx: TenantContext,
    draftId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<AdAssetRecord> {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Dosya çok büyük (${mb(file.size)} MB). En fazla ${mb(MAX_IMAGE_BYTES)} MB olabilir.`,
      );
    }

    // İÇERİĞE bakılıyor, `mimetype` başlığına değil: o başlık tarayıcıdan
    // geliyor ve uzantıdan türetiliyor.
    const probe = probeImage(file.buffer);
    if (!probe.ok) throw new BadRequestException(probe.reason);

    const { width, height, mimeType } = probe.info;
    if (!ACCEPTED_MIME.includes(mimeType)) {
      throw new BadRequestException('Yalnızca JPG ve PNG kabul ediliyor.');
    }

    const ratio = matchRatio(width, height);
    if (!ratio) {
      // NE OLDUĞUNU VE NE OLMASI GEREKTİĞİNİ birlikte söylüyoruz. "Geçersiz
      // oran" demek, kullanıcıya hiçbir şey öğretmez.
      throw new BadRequestException(
        `Bu görsel ${width}×${height}. Kabul edilen oranlar: ` +
          ASSET_RATIOS.map((r) => `${RATIO_META[r].label} (${RATIO_META[r].recommended})`).join(
            ', ',
          ) +
          '.',
      );
    }

    if (Math.min(width, height) < MIN_IMAGE_EDGE) {
      throw new BadRequestException(
        `Görsel çok küçük (${width}×${height}). En kısa kenar en az ${MIN_IMAGE_EDGE} piksel olmalı, ` +
          `yoksa reklamda bulanık görünür. Önerilen: ${RATIO_META[ratio].recommended}.`,
      );
    }

    const draft = await this.get(ctx, draftId);
    if (draft.status !== 'draft' && draft.status !== 'failed') {
      throw new BadRequestException('Yayınlanmış taslağa görsel eklenemez.');
    }

    const key = await this.storage.save({
      orgId: ctx.orgId,
      draftId,
      bytes: file.buffer,
      mimeType,
    });

    // ESKİ GÖRSELİN DOSYASI: aynı orana ikinci yükleme öncekini değiştiriyor
    // (tekil indeks) ve eski dosya diskte kalırdı.
    const previousKey = draft.assets.find((a) => a.ratio === ratio)
      ? await this.previousKey(ctx, draftId, ratio)
      : null;

    const id = await this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO ad_draft_assets (
          id, org_id, draft_id, ratio, file_name, mime_type, byte_size,
          width, height, storage_key
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${draftId}::uuid, ${ratio},
          ${file.originalname.slice(0, 300)}, ${mimeType}, ${file.size},
          ${width}, ${height}, ${key}
        )
        ON CONFLICT (draft_id, ratio) DO UPDATE SET
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          byte_size = EXCLUDED.byte_size,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          storage_key = EXCLUDED.storage_key,
          -- HASH SIFIRLANIYOR: görsel değişti, eski Meta hash'i artık başka
          -- bir görseli işaret ediyor. Sıfırlamamak, yayında ESKİ görselin
          -- çıkması demek olurdu.
          meta_image_hash = NULL
        RETURNING id
      `);
      if (!row) throw new NotFoundException('Görsel kaydedilemedi');
      return row.id;
    });

    if (previousKey && previousKey !== key) await this.storage.remove(previousKey);

    return {
      id,
      ratio,
      fileName: file.originalname,
      width,
      height,
      byteSize: file.size,
      previewUrl: `/ad-drafts/${draftId}/assets/${id}/preview`,
    };
  }

  async removeAsset(ctx: TenantContext, draftId: string, assetId: string): Promise<void> {
    const key = await this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        SELECT a.storage_key FROM ad_draft_assets a
        JOIN ad_drafts d ON d.id = a.draft_id
        WHERE a.id = ${assetId}::uuid AND a.draft_id = ${draftId}::uuid
          AND d.org_id = ${ctx.orgId}::uuid
      `);
      if (!row) throw new NotFoundException('Görsel bulunamadı');
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM ad_draft_assets WHERE id = ${assetId}::uuid
      `);
      return row.storage_key;
    });
    await this.storage.remove(key);
  }

  /** Önizleme — kiracı kontrolü yapıp dosyayı okur. */
  async readAsset(
    ctx: TenantContext,
    draftId: string,
    assetId: string,
  ): Promise<{ bytes: Buffer; mimeType: string }> {
    const row = await this.prisma.withTenant(ctx, async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ storage_key: string; mime_type: string }>>(
        Prisma.sql`
          SELECT a.storage_key, a.mime_type
          FROM ad_draft_assets a
          JOIN ad_drafts d ON d.id = a.draft_id
          WHERE a.id = ${assetId}::uuid AND a.draft_id = ${draftId}::uuid
            AND d.org_id = ${ctx.orgId}::uuid
        `,
      );
      return r;
    });
    if (!row) throw new NotFoundException('Görsel bulunamadı');
    return { bytes: await this.storage.read(row.storage_key), mimeType: row.mime_type };
  }

  private async previousKey(
    ctx: TenantContext,
    draftId: string,
    ratio: AssetRatio,
  ): Promise<string | null> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        SELECT storage_key FROM ad_draft_assets
        WHERE draft_id = ${draftId}::uuid AND ratio = ${ratio}
      `);
      return r?.storage_key ?? null;
    });
  }

  // ---------------------------------------------------------------------------
  // Yayın öncesi kontrol
  // ---------------------------------------------------------------------------

  /**
   * Yayınlamadan önce ne eksik, ne riskli.
   *
   * ENGELLEYENLER ve UYARILAR ayrı. Engelleyen bir şey varsa düğme pasif;
   * uyarı varsa düğme aktif ama kullanıcı ne olacağını biliyor. İkisini
   * birleştirmek, "başlığın kısaltılacak" gibi bir notu yayını durduran bir
   * hataya çevirirdi.
   */
  async publishCheck(ctx: TenantContext, draftId: string): Promise<PublishCheck> {
    const draft = await this.get(ctx, draftId);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (draft.status === 'published') blockers.push('Bu reklam zaten yayınlanmış.');

    const hasSquare = draft.assets.some((a) => a.ratio === 'square');
    if (!hasSquare) {
      // Kare tek evrensel yedek: Meta bir yerleşim için görsel bulamazsa
      // reklamı orada göstermiyor.
      blockers.push('Kare görsel zorunlu — reklamın akışta görünmesi için gerekiyor.');
    }

    if (draft.goal === 'website' && !draft.linkUrl) {
      blockers.push('Web sitesi adresi eksik.');
    }

    if (!draft.assets.some((a) => a.ratio === 'vertical')) {
      warnings.push(
        'Dikey görsel yok — reklam Hikâyeler ve Reels’te gösterilmeyecek. ' +
          'Bu yerleşimler genelde en ucuz erişimi veriyor.',
      );
    }

    for (const [field, limit] of Object.entries(AD_TEXT_FIELDS)) {
      const value = (draft as unknown as Record<string, string | null>)[field];
      if (value && value.length > limit.soft) {
        warnings.push(
          `${limit.label} akışta ${limit.soft} karakterden sonra kısaltılacak ` +
            `(şu an ${value.length}).`,
        );
      }
    }

    if (!draft.headline) {
      warnings.push('Başlık boş — reklamın altında kalın yazıyla görünen kısım olmayacak.');
    }

    const daily = BigInt(draft.dailyBudgetMicros);
    const total = totalCommitmentMicros(daily, draft.durationDays);

    if (draft.durationDays === 0) {
      // SÜRESİZ KAMPANYA bu üründe en pahalı kullanıcı hatası: unutuluyor.
      warnings.push(
        'Süre sınırı yok — kampanya sen durdurana kadar her gün harcamaya devam eder.',
      );
    }

    const spec = campaignSpec(draft.goal, '0');
    const summary =
      draft.durationDays > 0
        ? `${GOAL_META[draft.goal].label} · günde ${money(daily)} · ${draft.durationDays} gün · ` +
          `toplam ${money(total!)}`
        : `${GOAL_META[draft.goal].label} · günde ${money(daily)} · süresiz`;

    return {
      ok: blockers.length === 0,
      blockers,
      warnings,
      summary,
      totalBudgetMicros: (total ?? 0n).toString(),
      // `spec` yalnızca açıklamayı taşımak için çağrıldı; arayüz kullanıcıya
      // ne olacağını düz Türkçe anlatıyor.
      ...({ explanation: spec.explanation } as Record<string, string>),
    } as PublishCheck;
  }

  // ---------------------------------------------------------------------------

  private async assertScope(tx: TxLike, input: AdDraftInput): Promise<void> {
    const [acc] = await tx.$queryRaw<Array<{ client_id: string }>>(Prisma.sql`
      SELECT client_id FROM ad_accounts WHERE id = ${input.adAccountId}::uuid
    `);
    if (!acc) throw new NotFoundException('Reklam hesabı bulunamadı');
    if (acc.client_id !== input.clientId) {
      throw new BadRequestException('Reklam hesabı bu müşteriye bağlı değil');
    }

    const [profile] = await tx.$queryRaw<Array<{ client_id: string; profile_type: string }>>(
      Prisma.sql`
        SELECT client_id, profile_type::text AS profile_type
        FROM social_profiles WHERE id = ${input.socialProfileId}::uuid
      `,
    );
    if (!profile) throw new NotFoundException('Sayfa bulunamadı');
    if (profile.client_id !== input.clientId) {
      throw new BadRequestException('Sayfa bu müşteriye bağlı değil');
    }
    // REKLAM SAYFA ADINA YAYINLANIYOR ve Instagram hesabı tek başına bunu
    // yapamıyor: Meta reklamı her zaman bir Facebook sayfasına bağlıyor.
    if (profile.profile_type !== 'facebook_page') {
      throw new BadRequestException(
        'Reklam bir Facebook sayfası adına yayınlanmalı. Instagram hesabı tek başına yeterli değil.',
      );
    }
  }

  private async selectDrafts(tx: TxLike, where: Prisma.Sql): Promise<DraftRow[]> {
    return tx.$queryRaw<DraftRow[]>(Prisma.sql`
      SELECT d.*, a.name AS ad_account_name, sp.name AS social_profile_name,
             sp.linked_ad_account_id::text AS linked_ad_account_id
      FROM ad_drafts d
      JOIN ad_accounts a ON a.id = d.ad_account_id
      JOIN social_profiles sp ON sp.id = d.social_profile_id
      WHERE ${where}
      ORDER BY d.created_at DESC
    `);
  }

  private async loadAssets(tx: TxLike, draftIds: string[]): Promise<Map<string, AssetRow[]>> {
    const out = new Map<string, AssetRow[]>();
    if (draftIds.length === 0) return out;
    const rows = await tx.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT * FROM ad_draft_assets WHERE draft_id = ANY(${draftIds}::uuid[])
    `);
    for (const r of rows) {
      const list = out.get(r.draft_id) ?? [];
      list.push(r);
      out.set(r.draft_id, list);
    }
    return out;
  }

  private toRecord(row: DraftRow, assets: AssetRow[]): AdDraftRecord {
    return {
      id: row.id,
      clientId: row.client_id,
      adAccountId: row.ad_account_id,
      adAccountName: row.ad_account_name,
      socialProfileId: row.social_profile_id,
      socialProfileName: row.social_profile_name,
      goal: row.goal,
      name: row.name,
      primaryText: row.primary_text,
      headline: row.headline,
      description: row.description,
      linkUrl: row.link_url,
      whatsappNumber: row.whatsapp_number,
      dailyBudgetMicros: String(row.daily_budget_micros),
      durationDays: row.duration_days,
      status: row.status,
      assets: assets
        // SIRA SABİT: kare, dikey, yatay. Veritabanı sırası rastgele ve
        // arayüzde kutuların yer değiştirmesi kafa karıştırırdı.
        .sort((a, b) => ASSET_RATIOS.indexOf(a.ratio) - ASSET_RATIOS.indexOf(b.ratio))
        .map((a) => ({
          id: a.id,
          ratio: a.ratio,
          fileName: a.file_name,
          width: a.width,
          height: a.height,
          byteSize: a.byte_size,
          previewUrl: `/ad-drafts/${row.id}/assets/${a.id}/preview`,
        })),
      externalCampaignId: row.external_campaign_id,
      externalAdId: row.external_ad_id,
      error: row.error,
      publishedAt: row.published_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }
}

export function toMicros(amount: string): bigint {
  const normalized = amount.trim().replace(',', '.');
  const parts = normalized.split('.');
  const whole = parts[0] || '0';
  const padded = ((parts[1] ?? '') + '000000').slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}

function money(micros: bigint): string {
  const whole = micros / 1_000_000n;
  return `${whole.toLocaleString('tr-TR')} ₺`;
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}
