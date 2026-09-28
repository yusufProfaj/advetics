import { PLATFORMS, PLATFORM_KISA_ADLARI } from '@advetics/shared';

/**
 * ═══ "META VE GOOGLE ADS" CÜMLESİ SABİTTEN TÜRÜYOR ═══
 *
 * Giriş ekranı LinkedIn eklendikten haftalar sonra hâlâ "Meta ve Google Ads
 * hesaplarınız tek yerde" diyordu. CLAUDE.md'nin "elle yazılmış platform
 * listeleri" başlığı altındaki hatanın ta kendisi: hata yok, log yok,
 * yalnızca ürünün ilk ekranı ürünü eksik anlatıyor. Liste `PLATFORMS`tan
 * kuruluyor; dördüncü platform eklendiğinde cümle kendiliğinden uzuyor.
 *
 * `Intl.ListFormat` Türkçe bağlacı ("A, B ve C") doğru kuruyor; elle
 * `join(', ')` yazmak son bağlacı kaybederdi.
 */
export function platformListesi(): string {
  return new Intl.ListFormat('tr', { style: 'long', type: 'conjunction' }).format(
    PLATFORMS.map((p) => PLATFORM_KISA_ADLARI[p]),
  );
}
