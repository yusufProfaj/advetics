/**
 * ═══ GOOGLE'IN ALAN YOLU → KULLANICININ ANLADIĞI YER ═══
 *
 * Prova hataları Google'ın alan yoluyla geliyor:
 * `mutate_operations[7].ad_group_ad_operation.create.ad.demand_gen_video_responsive_ad.headlines[0].text`.
 * Bu yol doğru ama okunmuyor; kullanıcının bilmesi gereken "reklamın
 * başlığı". İşlem türü ve son alan Türkçeye çevriliyor, bilinmeyen parça
 * olduğu gibi kalıyor (uydurmak yerine ham hâl).
 */
const ISLEM: Record<string, string> = {
  campaign_budget_operation: 'Bütçe',
  campaign_operation: 'Kampanya',
  campaign_criterion_operation: 'Konum',
  ad_group_operation: 'Reklam grubu',
  audience_operation: 'Yaş kitlesi',
  // Konum da (2026-10-09'dan beri) ve yaş kitlesi bağlantısı da burada;
  // hangisi olduğunu alan etiketi söylüyor (`geo_target_constant` → konum).
  ad_group_criterion_operation: 'Reklam grubu hedeflemesi',
  asset_operation: 'Varlık (video ya da logo)',
  ad_group_ad_operation: 'Reklam',
};

const ALAN: Record<string, string> = {
  headlines: 'başlık',
  long_headlines: 'uzun başlık',
  descriptions: 'açıklama',
  business_name: 'işletme adı',
  logo_images: 'logo',
  videos: 'video',
  final_urls: 'hedef adres',
  amount_micros: 'günlük bütçe',
  end_date_time: 'bitiş tarihi',
  start_date_time: 'başlangıç tarihi',
  target_spend: 'teklif stratejisi',
  geo_target_constant: 'konum',
  image_asset: 'logo görseli',
  youtube_video_asset: 'YouTube videosu',
  youtube_video_title: 'video başlığı',
  name: 'ad',
  status: 'durum',
};

export function googleAlanEtiketi(alan: string | null): string | null {
  if (!alan) return null;
  const parcalar = alan.split('.');
  const islem = parcalar.map((p) => p.replace(/\[\d+\]$/, '')).find((p) => p in ISLEM);
  const son = [...parcalar].reverse().map((p) => p.replace(/\[\d+\]$/, '')).find((p) => p in ALAN);
  const etiket = [islem ? ISLEM[islem] : null, son ? ALAN[son] : null].filter(Boolean).join(' › ');
  return etiket || alan;
}
