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

export const ASSET_KINDS = ['image', 'logo', 'video'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Türün dosyası video mu — arşiv, önizleme ve yayın yolları buna bakıyor. */
export function videoMu(kind: AssetKind): boolean {
  return kind === 'video';
}

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
  video: {
    label: 'Video',
    hint: 'Reklamda oynatılacak video. MP4 ya da MOV.',
    /**
     * VİDEODA ALT SINIR 120 PİKSEL.
     *
     * Meta reklam videosunda en kısa kenar için 120 piksel istiyor; görselin
     * 300'lük sınırını uygulamak, platformun kabul ettiği bir videoyu
     * reddetmek olurdu.
     */
    minEdge: 120,
  },
};

/**
 * VİDEO BİÇİMLERİ — GÖRSELDEN AYRI LİSTE.
 *
 * Tek bir listede toplamak, logo yüklerken MP4 kabul etmek demekti: kullanıcı
 * yanlış kutuya video bırakır, sistem onu logo olarak kaydeder ve hata ancak
 * Google kampanyası kurulurken çıkar.
 */
export const ACCEPTED_VIDEO_MIME = ['video/mp4', 'video/quicktime'] as const;

/**
 * VİDEO ÜST SINIRI — GÖRSELDEN YÜKSEK.
 *
 * Meta 4 GB'a kadar kabul ediyor ama bu sunucu 11 siteyle paylaşılıyor ve
 * dosya İSTEK BOYUNCA BELLEKTE duruyor (`FileInterceptor` bellekte
 * tutuyor). 200 MB, bir dakikalık 1080p reklam videosu için fazlasıyla
 * yeterli ve paylaşımlı makinede güvenli.
 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * VİDEO SÜRE ÜST SINIRI — SANİYE.
 *
 * Meta teknik olarak 241 dakikaya kadar kabul ediyor ama akışta izlenen
 * reklam videosu 15-60 saniye; daha uzunu yüklemek kullanıcının bekleyeceği
 * bir yükleme ve izlenmeyecek bir reklam demek. Sınır GİRİŞTE söyleniyor,
 * yayın anında değil.
 */
export const MAX_VIDEO_SECONDS = 180;

/**
 * ═══ VİDEODA ORAN KOVASI YOK, ARALIK VAR ═══
 *
 * Görseller üç kovaya oturuyor (kare, 9:16, 16:9) çünkü Meta bir yerleşim
 * için görsel bulamazsa reklamı orada hiç göstermiyor: eksik kova = kapalı
 * yerleşim. Videoda öyle değil, TEK video bütün yerleşimlere gidiyor ve Meta
 * onu yerleşim başına kendisi kırpıyor. Kabul ettiği aralık 9:16 ile 1.91:1
 * arasında.
 *
 * Kovayı videoya da uygulamak, akışın EN YAYGIN video oranını (4:5 = 0,8)
 * seçilemez yapıyordu: hiçbir kovaya %8 toleransla girmiyor, tıklanamıyor ve
 * altındaki kaçış yolu ("kırpıp kullan") görsel kırpıcısına gidiyor — yani
 * videoda hiç çalışmıyor. Kullanıcı dosyayı yüklüyor, karşısında soluk bir
 * kutu buluyor ve yapacak bir şey yok.
 */
export const VIDEO_ORAN_ALT = 9 / 16;
export const VIDEO_ORAN_UST = 1.91;

export function videoOraniUygun(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const oran = width / height;
  return oran >= VIDEO_ORAN_ALT - 0.01 && oran <= VIDEO_ORAN_UST + 0.01;
}

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
