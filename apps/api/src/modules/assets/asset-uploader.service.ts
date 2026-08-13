import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetStorageService } from '../ad-builder/asset-storage.service';
import type { FetchContext } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';

/**
 * Varlığı platforma yükler ve referansı ÖNBELLEĞE ALIR.
 *
 * BU SINIFIN VARLIK SEBEBİ TEK BİR GERÇEK: Meta'nın `image_hash` değeri
 * REKLAM HESABI BAŞINA üretiliyor. Aynı görsel iki hesapta kullanılıyorsa iki
 * ayrı hash var ve biri diğerinin yerine kullanılamıyor.
 *
 * Bunu bilmeyen bir uygulama şunu yapar: görseli bir kez yükler, hash'i
 * saklar, ikinci hesapta da aynı hash'i gönderir. Meta bunu ya "Invalid
 * parameter" ile reddeder ya da — daha kötüsü — kreatifi GÖRSELSİZ oluşturur.
 * İkinci durumda reklam yayınlanır, para harcar ve boş görünür.
 *
 * `asset_platform_refs` tablosu (varlık, hesap) çiftini tekil tutuyor;
 * önbellek isabet ederse Meta'ya hiç gidilmiyor.
 */
@Injectable()
export class AssetUploaderService {
  private readonly logger = new Logger(AssetUploaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AssetStorageService,
    private readonly providers: ProviderRegistry,
  ) {}

  /**
   * Varlığın bu hesaptaki karşılığını döner — gerekirse yükleyerek.
   *
   * ÖNBELLEK ÖNCE. İsabet ederse ne kota harcanıyor ne de Meta'da mükerrer
   * görsel oluşuyor. Bir kampanyada aynı görselin üç orana bölünmüş hâlleri
   * kullanıldığında fark belirgin: üç yerine sıfır çağrı.
   */
  async ensureExternalRef(
    ctx: TenantContext,
    params: {
      assetId: string;
      adAccountId: string;
      /**
       * `asset_feed_spec` etiketiyle eşleşmesi gereken ad.
       *
       * Hesabın DIŞ kimliği burada İSTENMİYOR: yükleme `fetchCtx` üzerinden
       * yapılıyor ve `act_` öneki sağlayıcının içinde tek bir yerde
       * kuruluyor. İkinci bir kaynak, o önekin iki kez eklenmesine yol açan
       * hatanın tekrarı olurdu.
       */
      label: string;
      fetchCtx: FetchContext;
    },
  ): Promise<string> {
    const cached = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ external_ref: string }>>(Prisma.sql`
        SELECT external_ref FROM asset_platform_refs
        WHERE asset_id = ${params.assetId}::uuid
          AND ad_account_id = ${params.adAccountId}::uuid
      `),
    );
    if (cached[0]) return cached[0].external_ref;

    const [asset] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        SELECT storage_key FROM assets
        WHERE id = ${params.assetId}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
    if (!asset) throw new Error(`Varlık bulunamadı: ${params.assetId}`);

    const bytes = await this.storage.read(asset.storage_key);
    const provider = this.providers.get('meta');
    const hash = await provider.uploadAdImage(params.fetchCtx, {
      name: params.label,
      bytes,
    });

    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        INSERT INTO asset_platform_refs (
          id, org_id, asset_id, platform, ad_account_id, external_ref
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${params.assetId}::uuid,
          'meta'::"Platform", ${params.adAccountId}::uuid, ${hash}
        )
        -- YARIŞ DURUMU: iki yayın aynı anda aynı görseli yükleyebiliyor.
        --
        -- Meta ikisini de kabul ediyor ve aynı hash'i dönüyor (içerik aynı),
        -- yani çakışma zararsız. Hata fırlatmak, ikinci yayını sebepsiz
        -- düşürmek olurdu.
        ON CONFLICT (asset_id, ad_account_id) DO NOTHING
      `),
    );

    return hash;
  }

  /**
   * Bir taslağın görselini kütüphaneye bağlar.
   *
   * TASLAĞA BIRAKILAN GÖRSEL DE ARŞİVE GİRİYOR. Aksi hâlde arşiv yalnızca
   * "kütüphaneye git ve yükle" diyenlerle dolardı; asıl kullanım akışı reklam
   * oluştururken sürükleyip bırakmak ve o görsellerin bir daha bulunamaması,
   * arşivi işe yaramaz kılardı.
   */
  async linkDraftAsset(
    ctx: TenantContext,
    params: { draftAssetId: string; assetId: string },
  ): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE ad_draft_assets SET asset_id = ${params.assetId}::uuid
        WHERE id = ${params.draftAssetId}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
  }
}
