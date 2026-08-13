import { z } from 'zod';
import type { AssetPlatform } from './asset-routing.schema';

/**
 * Varlık arşivi (BASE) — müşteri bazlı görsel kütüphanesi.
 *
 * NEDEN GEREKLİ: bugüne kadar her görsel bir taslağa bağlıydı. Aynı ürün
 * fotoğrafını ikinci bir kampanyada kullanmak, dosyayı yeniden yüklemek ve
 * Meta'ya yeniden göndermek demekti. Toplu oluşturucuda ise durum daha kötü:
 * kullanıcı her satıra `image_hash` değerini ELLE yazıyor — o hash'i bulmak
 * için Ads Manager'a gidip bakması gerekiyor.
 *
 * ARŞİVİN ÇÖZDÜĞÜ İKİNCİ ŞEY GOOGLE PMAX LOGOSU. Logo bir reklam görseli
 * değil: markaya ait, kampanyadan kampanyaya değişmiyor ve bir kez yüklenip
 * tekrar tekrar kullanılıyor. Taslağa bağlı bir yükleme akışında yeri yoktu
 * ve bu, PMax varlık grubunun önündeki gerçek engeldi.
 */

// -----------------------------------------------------------------------------
// Tür
// -----------------------------------------------------------------------------

export const ASSET_KINDS = ['image', 'logo'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_KIND_META: Record<
  AssetKind,
  { label: string; hint: string; minEdge: number }
> = {
  image: {
    label: 'Reklam görseli',
    hint: 'Kampanyalarda kullanılan ürün, mekân ya da kreatif görselleri.',
    minEdge: 300,
  },
  logo: {
    label: 'Logo',
    hint: 'Marka logosu. Google Performance Max bunsuz kampanya oluşturmuyor.',
    /**
     * LOGO SINIRI DAHA DÜŞÜK — 128 piksel.
     *
     * Google kare logoda 128×128 kabul ediyor. Reklam görselinin sınırını
     * (300) logoya uygulamak, tamamen geçerli bir logoyu reddetmek olurdu ve
     * kullanıcı sebebini anlamazdı.
     */
    minEdge: 128,
  },
};

// -----------------------------------------------------------------------------
// Kayıt
// -----------------------------------------------------------------------------

/**
 * Varlığın bir platformdaki karşılığı.
 *
 * META HASH'İ REKLAM HESABI BAŞINA. Aynı görsel iki hesapta kullanılıyorsa
 * iki ayrı hash var. Tek bir kolonda tutmak, A hesabına ait bir hash'i B
 * hesabında kullanmak demek — Meta bunu ya "Invalid parameter" ile reddediyor
 * ya da kreatifi görselsiz oluşturuyor.
 */
export interface AssetPlatformRef {
  platform: AssetPlatform;
  /** Hangi reklam hesabına yüklendi. */
  adAccountId: string;
  adAccountName: string;
  /** Meta'da `image_hash`, Google'da varlık kaynak adı. */
  externalRef: string;
  uploadedAt: string;
}

export interface AssetRecord {
  id: string;
  clientId: string;
  kind: AssetKind;

  /** Kullanıcının verdiği ad. Varsayılan olarak dosya adı. */
  name: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;

  /** Kimlik doğrulamalı önizleme adresi. */
  previewUrl: string;

  /**
   * Kaç reklamda kullanıldı.
   *
   * SİLME KARARININ DAYANAĞI: kullanımdaki bir varlığı silmek, Meta'da
   * çalışmaya devam eden bir reklamın kaydını koparmak demek.
   */
  usageCount: number;
  platformRefs: AssetPlatformRef[];

  createdAt: string;
}

// -----------------------------------------------------------------------------
// Girdiler
// -----------------------------------------------------------------------------

export const assetQuerySchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(ASSET_KINDS).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AssetQuery = z.infer<typeof assetQuerySchema>;

export const assetRenameSchema = z.object({
  name: z.string().trim().min(1, 'Ad boş olamaz').max(200),
});
export type AssetRenameInput = z.infer<typeof assetRenameSchema>;

export interface AssetListResult {
  rows: AssetRecord[];
  total: number;
  byKind: Record<AssetKind, number>;
}

/**
 * Yükleme sonucu.
 *
 * `duplicate` alanı önemli: aynı dosya ikinci kez yüklendiğinde yeni satır
 * açılmıyor, mevcut kayıt dönüyor. Kullanıcıya "zaten vardı" demek, sessizce
 * aynı görseli iki kez listelemekten iyi — ikincisini görüp hangisinin doğru
 * olduğunu sorardı.
 */
export interface AssetUploadResult {
  asset: AssetRecord;
  duplicate: boolean;
}
