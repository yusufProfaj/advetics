import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreativeAssetRef,
  CreativeInput,
  CreativeRecord,
  CreativeTexts,
  TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';

/**
 * Kreatif kütüphanesi — metin havuzu + görsel havuzu.
 *
 * KREATİF TASLAĞA BAĞLI DEĞİL, MÜŞTERİYE AİT. `ad_draft_assets` bir taslağa
 * çiviliydi ve aynı kreatifi ikinci bir kampanyada kullanmanın yolu yoktu;
 * "geçen ayki reklamı tekrarla" bir ajansın en sık yapacağı iş ve bugün
 * mümkün değil.
 */

interface CreativeRow {
  id: string;
  client_id: string;
  name: string;
  texts: Partial<CreativeTexts> | null;
  created_at: Date;
  updated_at: Date;
}

interface AssetRow {
  creative_id: string;
  asset_id: string;
  name: string;
  width: number;
  height: number;
  kind: string;
}

@Injectable()
export class CreativeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: TenantContext, clientId: string): Promise<CreativeRecord[]> {
    return this.prisma.withTenant(ctx, (tx) =>
      this.select(
        tx,
        ctx,
        Prisma.sql`c.org_id = ${ctx.orgId}::uuid AND c.client_id = ${clientId}::uuid`,
      ),
    );
  }

  async get(ctx: TenantContext, id: string): Promise<CreativeRecord> {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      this.select(tx, ctx, Prisma.sql`c.id = ${id}::uuid AND c.org_id = ${ctx.orgId}::uuid`),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Kreatif bulunamadı');
    return row;
  }

  async create(ctx: TenantContext, input: CreativeInput): Promise<CreativeRecord> {
    const id = await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertAssetsOwned(tx, input);

      const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO ad_creatives (id, org_id, client_id, name, texts, created_by, updated_at)
        VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid, ${input.name},
          ${JSON.stringify(input.texts)}::jsonb, ${ctx.userId}::uuid, now()
        )
        RETURNING id::text AS id
      `);
      if (!row) throw new BadRequestException('Kreatif oluşturulamadı');

      /**
       * SIRA KULLANICININ VERDİĞİ SIRA.
       *
       * Meta tek görselli kreatifte ilk elemanı kullanıyor; sıranın veriden
       * gelmesi, kullanıcının "önce kare" tercihinin korunması demek.
       */
      for (const [position, assetId] of input.assetIds.entries()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO ad_creative_assets (id, org_id, creative_id, asset_id, position)
          VALUES (gen_random_uuid(), ${ctx.orgId}::uuid, ${row.id}::uuid, ${assetId}::uuid, ${position})
        `);
      }

      return row.id;
    });

    return this.get(ctx, id);
  }

  /**
   * Kreatifi günceller.
   *
   * YAYINLANMIŞ REKLAMDA KULLANILIYORSA DEĞİŞTİRİLEMİYOR.
   *
   * Sebebi `ad_drafts` güncellemesindekiyle aynı: değişiklik platformda
   * hiçbir şeyi değiştirmiyor (Meta ve Google kendi kopyalarını aldı) ama
   * panelde yayındaki reklamdan FARKLI bir şey gösteriyor. "Reklamda ne
   * yazıyor" sorusunun cevabı yanlış olur — ve o soru kampanya kötü
   * gittiğinde sorulur.
   *
   * Çözüm engellemek değil YÖNLENDİRMEK: mesaj kopyalamayı söylüyor ve
   * `duplicate` o işi tek çağrıda yapıyor.
   */
  async update(ctx: TenantContext, id: string, input: CreativeInput): Promise<CreativeRecord> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const [yayinda] = await tx.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS n
        FROM draft_ads d
        JOIN draft_ad_groups g ON g.id = d.ad_group_id
        JOIN draft_campaigns c ON c.id = g.campaign_id
        WHERE d.creative_id = ${id}::uuid AND c.status = 'published'
      `);
      if (yayinda && Number(yayinda.n) > 0) {
        throw new BadRequestException(
          `Bu kreatif ${Number(yayinda.n)} yayınlanmış reklamda kullanılıyor ve ` +
            'değiştirilemez — panelde yazan ile yayındaki reklam ayrışırdı. ' +
            'Kopyasını oluşturup onu düzenle.',
        );
      }

      await this.assertAssetsOwned(tx, input);

      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE ad_creatives
        SET name = ${input.name}, texts = ${JSON.stringify(input.texts)}::jsonb,
            updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
          AND client_id = ${input.clientId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Kreatif bulunamadı');

      /**
       * GÖRSELLER SİLİNİP YENİDEN YAZILIYOR.
       *
       * Fark hesaplamak (hangisi eklendi, hangisi çıktı) daha zarif görünüyor
       * ama SIRA da veriyi taşıyor: kullanıcı görselleri yeniden sıralamış
       * olabilir ve fark hesabı bunu göremez. Silip yazmak sırayı da
       * doğruluyor.
       */
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM ad_creative_assets WHERE creative_id = ${id}::uuid
      `);
      for (const [position, assetId] of input.assetIds.entries()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO ad_creative_assets (id, org_id, creative_id, asset_id, position)
          VALUES (gen_random_uuid(), ${ctx.orgId}::uuid, ${id}::uuid, ${assetId}::uuid, ${position})
        `);
      }
    });

    return this.get(ctx, id);
  }

  /**
   * Kreatifi kopyalar.
   *
   * YAYINLANMIŞ KREATİFİ DÜZENLEMENİN YOLU BU. Ajansın en sık yapacağı iş
   * "geçen ayki reklamı metnini değiştirip tekrar ver" ve bugün o iş her şeyi
   * baştan yazmayı gerektiriyor.
   */
  async duplicate(ctx: TenantContext, id: string): Promise<CreativeRecord> {
    const kaynak = await this.get(ctx, id);
    return this.create(ctx, {
      clientId: kaynak.clientId,
      // ADA "kopya" EKLENİYOR: iki özdeş ad, listede hangisinin hangisi
      // olduğunu bulmayı imkânsız kılardı.
      name: `${kaynak.name} (kopya)`.slice(0, 200),
      texts: kaynak.texts,
      assetIds: kaynak.assets.map((a) => a.assetId),
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      /**
       * KULLANIMDA OLAN KREATİF SİLİNEMİYOR ve mesaj NEDEN olduğunu söylüyor.
       *
       * Yabancı anahtar (RESTRICT) bunu zaten engelliyor ama oradan çıkan hata
       * ham bir kısıt ihlali: kullanıcı "silinemedi" görür, sebebini görmez.
       * Kaç taslakta kullanıldığını söylemek, kullanıcıya yapacak bir şey
       * bırakıyor.
       */
      const [used] = await tx.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS n FROM draft_ads WHERE creative_id = ${id}::uuid
      `);
      if (used && Number(used.n) > 0) {
        throw new BadRequestException(
          `Bu kreatif ${Number(used.n)} reklamda kullanılıyor — önce onları sil.`,
        );
      }

      const n = await tx.$executeRaw(Prisma.sql`
        DELETE FROM ad_creatives WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Kreatif bulunamadı');
    });
  }

  /**
   * Görsellerin AYNI MÜŞTERİYE ait olduğunu doğrular.
   *
   * RLS BUNU YAKALAMIYOR: iki satır da aynı `org_id`'ye sahip ve politika
   * ikisini de geçirir. Bir müşterinin görselini diğerinin reklamında
   * yayınlamak sessiz ve ciddi bir hata — `attachFromLibrary` aynı kontrolü
   * aynı sebeple yapıyor.
   */
  private async assertAssetsOwned(tx: TxLike, input: CreativeInput): Promise<void> {
    if (input.assetIds.length === 0) return;

    /**
     * MÜKERRER GÖRSEL ÖNCE YAKALANIYOR — yoksa TEŞHİS YANLIŞ ÇIKIYOR.
     *
     * Aşağıdaki sorgu tekrarları tekilleştiriyor, dolayısıyla aynı görsel iki
     * kez verildiğinde `rows.length` girdiden küçük kalıyor ve kullanıcı
     * "1 görsel arşivde bulunamadı" mesajını alıyordu. Görsel arşivde duruyor;
     * sorun tekrarın kendisi. Veritabanındaki tekil indeks de bunu reddediyor
     * ama oradan çıkan hata ham bir kısıt ihlali.
     */
    const tekil = new Set(input.assetIds);
    if (tekil.size !== input.assetIds.length) {
      throw new BadRequestException(
        'Aynı görsel kreatife iki kez eklenemez. ' +
          'Meta böyle bir kreatifi kabul edip ikinci kopyayı sessizce yok sayıyor.',
      );
    }

    const rows = await tx.$queryRaw<Array<{ id: string; client_id: string }>>(Prisma.sql`
      SELECT id::text AS id, client_id::text AS client_id
      FROM assets WHERE id = ANY(${input.assetIds}::uuid[])
    `);

    if (rows.length !== input.assetIds.length) {
      // KAÇ TANESİNİN BULUNAMADIĞI YAZILIYOR: "görsel bulunamadı" demek,
      // kullanıcıya hangisini aradığını söylemiyor.
      throw new NotFoundException(
        `${input.assetIds.length - rows.length} görsel arşivde bulunamadı.`,
      );
    }

    const yabanci = rows.filter((r) => r.client_id !== input.clientId);
    if (yabanci.length > 0) {
      throw new BadRequestException(
        `${yabanci.length} görsel başka bir müşteriye ait — kreatife eklenemez.`,
      );
    }
  }

  private async select(
    tx: TxLike,
    ctx: TenantContext,
    where: Prisma.Sql,
  ): Promise<CreativeRecord[]> {
    const rows = await tx.$queryRaw<CreativeRow[]>(Prisma.sql`
      SELECT c.id::text AS id, c.client_id::text AS client_id, c.name, c.texts,
             c.created_at, c.updated_at
      FROM ad_creatives c
      WHERE ${where}
      ORDER BY c.created_at DESC
    `);
    if (rows.length === 0) return [];

    const assets = await tx.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT ca.creative_id::text AS creative_id, a.id::text AS asset_id, a.name,
             a.width, a.height, a.kind
      FROM ad_creative_assets ca
      JOIN assets a ON a.id = ca.asset_id
      WHERE ca.creative_id = ANY(${rows.map((r) => r.id)}::uuid[])
        AND ca.org_id = ${ctx.orgId}::uuid
      ORDER BY ca.position
    `);

    const byCreative = new Map<string, CreativeAssetRef[]>();
    for (const a of assets) {
      const list = byCreative.get(a.creative_id) ?? [];
      list.push({
        assetId: a.asset_id,
        name: a.name,
        width: a.width,
        height: a.height,
        kind: a.kind,
        previewUrl: `/assets/${a.asset_id}/preview`,
      });
      byCreative.set(a.creative_id, list);
    }

    return rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      name: r.name,
      texts: normalizeTexts(r.texts),
      assets: byCreative.get(r.id) ?? [],
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }
}

/**
 * JSONB'den gelen havuzun eksik alanlarını tamamlar.
 *
 * Şema alanları zorunlu tutuyor ama veritabanındaki eski bir satır yalnızca
 * `headlines` taşıyor olabilir; `undefined` bir dizi üzerinde `.map` çağırmak
 * arayüzde beyaz ekran demek.
 */
function normalizeTexts(raw: Partial<CreativeTexts> | null): CreativeTexts {
  return {
    primaryText: raw?.primaryText,
    headlines: raw?.headlines ?? [],
    longHeadlines: raw?.longHeadlines ?? [],
    descriptions: raw?.descriptions ?? [],
  };
}
