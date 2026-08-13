import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACCEPTED_MIME,
  ASSET_KINDS,
  ASSET_KIND_META,
  MAX_IMAGE_BYTES,
  type AssetKind,
  type AssetListResult,
  type AssetPlatformRef,
  type AssetQuery,
  type AssetRecord,
  type AssetUploadResult,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';
import { AssetStorageService } from '../ad-builder/asset-storage.service';
import { probeImage } from '../ad-builder/image-probe';

/**
 * Varlık arşivi — müşteri bazlı görsel kütüphanesi.
 *
 * ÜÇ ŞEYİ ÇÖZÜYOR:
 *
 *   1. Aynı görseli ikinci kampanyada yeniden yüklemek gerekmiyor.
 *   2. Toplu oluşturucuda `image_hash` elle yazmak gerekmiyor — o değeri
 *      bulmak için Ads Manager'a gitmek gerekiyordu.
 *   3. Google PMax logosunun bir yeri var. Logo bir reklam görseli değil:
 *      markaya ait, kampanyadan kampanyaya değişmiyor ve taslağa bağlı bir
 *      yükleme akışında yeri yoktu.
 */

interface AssetRow {
  id: string;
  client_id: string;
  kind: AssetKind;
  name: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  storage_key: string;
  usage_count: number | bigint;
  created_at: Date;
}

interface RefRow {
  asset_id: string;
  platform: 'meta' | 'google';
  ad_account_id: string;
  ad_account_name: string;
  external_ref: string;
  uploaded_at: Date;
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AssetStorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // Okuma
  // ---------------------------------------------------------------------------

  async list(ctx: TenantContext, query: AssetQuery): Promise<AssetListResult> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const where = this.filters(ctx, query);
      const rows = await this.select(tx, where, query.limit, query.offset);

      const [countRow] = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT count(*) AS total FROM assets a WHERE ${where}
      `);

      /**
       * TÜR SAYIMLARI TÜR FİLTRESİNDEN BAĞIMSIZ.
       *
       * Sekmeler "Görseller 24 · Logolar 2" diyor. Tür filtresi uygulanmış
       * sayımlar, seçili olmayan sekmeyi hep sıfır gösterirdi.
       */
      const kindWhere = this.filters(ctx, { ...query, kind: undefined });
      const kindRows = await tx.$queryRaw<Array<{ kind: AssetKind; n: bigint }>>(Prisma.sql`
        SELECT kind, count(*) AS n FROM assets a WHERE ${kindWhere} GROUP BY kind
      `);

      const byKind = Object.fromEntries(ASSET_KINDS.map((k) => [k, 0])) as Record<
        AssetKind,
        number
      >;
      for (const r of kindRows) byKind[r.kind] = Number(r.n);

      const refs = await this.loadRefs(tx, rows.map((r) => r.id));

      return {
        rows: rows.map((r) => toRecord(r, refs.get(r.id) ?? [])),
        total: Number(countRow?.total ?? 0),
        byKind,
      };
    });
  }

  async get(ctx: TenantContext, id: string): Promise<AssetRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.select(
        tx,
        Prisma.sql`a.id = ${id}::uuid AND a.org_id = ${ctx.orgId}::uuid`,
        1,
        0,
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Varlık bulunamadı');
      const refs = await this.loadRefs(tx, [row.id]);
      return toRecord(row, refs.get(row.id) ?? []);
    });
  }

  /** Önizleme için ham baytlar. */
  async bytes(ctx: TenantContext, id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const [row] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ storage_key: string; mime_type: string }>>(Prisma.sql`
        SELECT storage_key, mime_type FROM assets
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
    if (!row) throw new NotFoundException('Varlık bulunamadı');
    return { buffer: await this.storage.read(row.storage_key), mimeType: row.mime_type };
  }

  // ---------------------------------------------------------------------------
  // Yükleme
  // ---------------------------------------------------------------------------

  /**
   * Kütüphaneye görsel ekler.
   *
   * DOĞRULAMA YÜKLEME ANINDA, kullanım anında değil. Kütüphaneye giren bir
   * görselin sonradan "aslında çok küçükmüş" diye reddedilmesi, kullanıcının
   * onu bir kampanyada seçtikten sonra öğrenmesi demek.
   */
  async upload(
    ctx: TenantContext,
    params: {
      clientId: string;
      kind: AssetKind;
      fileName: string;
      mimeType: string;
      bytes: Buffer;
      name?: string;
    },
  ): Promise<AssetUploadResult> {
    if (!(ACCEPTED_MIME as readonly string[]).includes(params.mimeType)) {
      throw new BadRequestException('Yalnızca JPEG ve PNG yüklenebiliyor.');
    }
    if (params.bytes.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Dosya çok büyük (${Math.round(params.bytes.length / 1024 / 1024)} MB). ` +
          `En fazla ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
      );
    }

    const probe = probeImage(params.bytes);
    if (!probe.ok) {
      // `probeImage` sebebi yazıyor ("PNG dosyası bozuk görünüyor"); onu
      // aynen geçirmek, kullanıcıya genel bir hata vermekten iyi.
      throw new BadRequestException(probe.reason);
    }
    const info = probe.info;

    /**
     * ALT SINIR TÜRE GÖRE.
     *
     * Logo 128 pikselden, reklam görseli 300 pikselden başlıyor. Tek bir
     * sınır uygulamak, Google'ın kabul ettiği bir logoyu reddetmek olurdu ve
     * kullanıcı sebebini anlamazdı.
     */
    const minEdge = ASSET_KIND_META[params.kind].minEdge;
    if (Math.min(info.width, info.height) < minEdge) {
      throw new BadRequestException(
        `${ASSET_KIND_META[params.kind].label} en az ${minEdge} piksel olmalı ` +
          `(yüklenen: ${info.width}×${info.height}).`,
      );
    }

    const contentHash = AssetStorageService.digest(params.bytes);

    /**
     * MÜKERRER KONTROLÜ DİSKE YAZMADAN ÖNCE.
     *
     * Önce yazıp sonra çakışmayı görmek, her tekrar yüklemede diskte yetim
     * bir dosya bırakmak demek — kimse fark etmez, disk sessizce dolar.
     */
    const existing = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id::text AS id FROM assets
        WHERE client_id = ${params.clientId}::uuid AND content_hash = ${contentHash}
      `),
    );
    if (existing[0]) {
      return { asset: await this.get(ctx, existing[0].id), duplicate: true };
    }

    const storageKey = await this.storage.save({
      orgId: ctx.orgId,
      // Kütüphane varlığı bir taslağa ait değil.
      scope: 'library',
      bytes: params.bytes,
      mimeType: params.mimeType,
    });

    try {
      const id = await this.prisma.withTenant(ctx, async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO assets (
            id, org_id, client_id, kind, name, file_name, mime_type,
            byte_size, width, height, storage_key, content_hash, created_by, updated_at
          ) VALUES (
            gen_random_uuid(), ${ctx.orgId}::uuid, ${params.clientId}::uuid,
            ${params.kind}, ${(params.name ?? params.fileName).slice(0, 200)},
            ${params.fileName.slice(0, 300)}, ${params.mimeType},
            ${params.bytes.length}, ${info.width}, ${info.height},
            ${storageKey}, ${contentHash}, ${ctx.userId}::uuid, now()
          )
          RETURNING id::text AS id
        `);
        if (!row) throw new BadRequestException('Varlık kaydedilemedi');
        return row.id;
      });
      return { asset: await this.get(ctx, id), duplicate: false };
    } catch (err) {
      // VERİTABANI YAZAMADIYSA DOSYAYI BIRAK.
      //
      // Yarış durumunda tekil kısıt patlayabiliyor (iki sekme aynı dosyayı
      // aynı anda yükledi). Diskteki dosyayı temizlemezsek yetim kalır.
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  async rename(ctx: TenantContext, id: string, name: string): Promise<AssetRecord> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE assets SET name = ${name}, updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Varlık bulunamadı');
    });
    return this.get(ctx, id);
  }

  /**
   * Siler — KULLANIMDA DEĞİLSE.
   *
   * Kullanımdaki bir varlığı silmek, Meta'da çalışmaya devam eden bir
   * reklamın kaydını koparmak demek: reklam yayında kalıyor, "bu görsel
   * nereden geldi" sorusunun cevabı kayboluyor ve arşiv, gerçekte yayında
   * olan görselleri göstermemeye başlıyor.
   *
   * Platform referansları da gidiyor (CASCADE) ama bu zararsız: varlık
   * kullanılmıyorsa o hash'lere de ihtiyaç yok.
   */
  async remove(ctx: TenantContext, id: string): Promise<void> {
    const key = await this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ storage_key: string; usage_count: bigint }>>(
        Prisma.sql`
          SELECT a.storage_key,
                 (SELECT count(*) FROM ad_draft_assets d WHERE d.asset_id = a.id) AS usage_count
          FROM assets a
          WHERE a.id = ${id}::uuid AND a.org_id = ${ctx.orgId}::uuid
        `,
      );
      if (!row) throw new NotFoundException('Varlık bulunamadı');
      if (Number(row.usage_count) > 0) {
        throw new BadRequestException(
          `Bu görsel ${row.usage_count} reklamda kullanılıyor. ` +
            'Silmek, yayındaki reklamların kaydını koparır.',
        );
      }
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM assets WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      return row.storage_key;
    });

    // Dosya VERİTABANI SİLİNDİKTEN SONRA siliniyor: ters sıra, dosya silinip
    // işlem geri alındığında kaydı olan ama dosyası olmayan bir varlık
    // bırakırdı.
    await this.storage.remove(key);
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private filters(ctx: TenantContext, query: Partial<AssetQuery>): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`a.org_id = ${ctx.orgId}::uuid`,
      Prisma.sql`a.client_id = ${query.clientId}::uuid`,
    ];
    if (query.kind) parts.push(Prisma.sql`a.kind = ${query.kind}`);
    if (query.search) {
      const term = `%${query.search}%`;
      parts.push(Prisma.sql`(a.name ILIKE ${term} OR a.file_name ILIKE ${term})`);
    }
    return Prisma.join(parts, ' AND ');
  }

  private async select(
    tx: TxLike,
    where: Prisma.Sql,
    limit: number,
    offset: number,
  ): Promise<AssetRow[]> {
    return tx.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT a.id::text AS id, a.client_id::text AS client_id, a.kind, a.name,
             a.file_name, a.mime_type, a.byte_size, a.width, a.height,
             a.storage_key, a.created_at,
             (SELECT count(*) FROM ad_draft_assets d WHERE d.asset_id = a.id) AS usage_count
      FROM assets a
      WHERE ${where}
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }

  private async loadRefs(tx: TxLike, ids: string[]): Promise<Map<string, RefRow[]>> {
    const out = new Map<string, RefRow[]>();
    if (ids.length === 0) return out;
    const rows = await tx.$queryRaw<RefRow[]>(Prisma.sql`
      SELECT r.asset_id::text AS asset_id, r.platform::text AS platform,
             r.ad_account_id::text AS ad_account_id, acc.name AS ad_account_name,
             r.external_ref, r.uploaded_at
      FROM asset_platform_refs r
      JOIN ad_accounts acc ON acc.id = r.ad_account_id
      WHERE r.asset_id = ANY(${ids}::uuid[])
    `);
    for (const r of rows) {
      const list = out.get(r.asset_id) ?? [];
      list.push(r);
      out.set(r.asset_id, list);
    }
    return out;
  }
}

function toRecord(row: AssetRow, refs: RefRow[]): AssetRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    kind: row.kind,
    name: row.name,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    previewUrl: `/assets/${row.id}/preview`,
    usageCount: Number(row.usage_count ?? 0),
    platformRefs: refs.map(
      (r): AssetPlatformRef => ({
        platform: r.platform,
        adAccountId: r.ad_account_id,
        adAccountName: r.ad_account_name,
        externalRef: r.external_ref,
        uploadedAt: r.uploaded_at.toISOString(),
      }),
    ),
    createdAt: row.created_at.toISOString(),
  };
}
