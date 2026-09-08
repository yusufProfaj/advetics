import type { InsightsLevel } from '../modules/connections/provider.types';
import { shiftDate } from '../modules/budgets/budget-pacing';

/**
 * ═══ İSTEK PENCERELERİ — AYRI DOSYADA VE BU BİR ARIZADAN DOĞDU ═══
 *
 * Bu fonksiyon `insights-sync.service.ts` içindeydi ve LinkedIn sağlayıcısı
 * oradan import etti. Sonuç ÜRETİMİ DÜŞÜRDÜ:
 *
 *   linkedin.provider.ts → queue/insights-sync.service.ts
 *                        → modules/connections/provider.registry.ts
 *                        → linkedin.provider.ts          ← DÖNGÜ
 *
 * Çalışma anında `ProviderRegistry` çözülmeden `InsightsSyncService`in
 * yapıcısına giriyor ve Nest *"can't resolve dependencies ... argument at
 * index [1]"* ile açılışta ölüyor. API ve worker "too many unstable
 * restarts" ile durdu.
 *
 * ┌─ HİÇBİR ŞEY BUNU YAKALAMADI ──────────────────────────────────────────┐
 * │ `tsc` temiz geçti — TypeScript döngüsel import'u hata saymıyor.        │
 * │ 2.326 test geçti — hiçbiri Nest bağımlılık grafiğini ayağa kaldırmıyor.│
 * │ Sağlayıcı kaydını kontrol eden kaynak taraması da geçti — o, sınıfın   │
 * │ listede OLUP OLMADIĞINA bakıyor, import döngüsüne değil.               │
 * │                                                                        │
 * │ CLAUDE.md bunu zaten yazıyordu: "NEST MODÜL KAYDI DERLEMEDE DEĞİL      │
 * │ AÇILIŞTA PATLIYOR." Uyarı vardı, tuzağın ikinci biçimine düşüldü.      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * KURAL: `providers/` altındaki bir dosya `queue/` altındaki bir SERVİSTEN
 * import ETMEZ. Ortak olan şey saf bir fonksiyonsa buraya taşınır — bu dosya
 * hiçbir Nest sağlayıcısı tanımıyor ve hiçbirini import etmiyor, yani
 * döngüye giremez. `import-dongusu.spec.ts` bunu tarıyor.
 */

/**
 * DERİN SEVİYE PENCERESİ — 15 gün.
 *
 * Meta insights `time_increment=1` ile GÜN × VARLIK satırı döndürüyor: 90 gün
 * × reklam seviyesi tek istekte "reduce the amount of data" ile düşüyor ve
 * sayfa yarılama bunu KURTARMIYOR (gövde zaten çok büyük).
 *
 * Sayı büyütülürse aynı hata geri gelir; küçültülürse çağrı sayısı ve
 * dolayısıyla kota tüketimi artar.
 */
const DERIN_SEVIYE_PENCERESI = 15;
const DERIN_SEVIYELER: ReadonlySet<InsightsLevel> = new Set(['ad_group', 'ad']);

/**
 * Bir seviye için istek pencereleri.
 *
 * SINIF DIŞINDA VE SAF: parçalama matematiği taşıyıcı parça — 90 günü kaç
 * isteğe böldüğü, aralarında boşluk ya da örtüşme olup olmadığı. Özel bir
 * metot olsaydı ancak kaynak taramasıyla sınanabilirdi ve tarama "bölme var"
 * der ama "doğru bölüyor" DEMEZ.
 *
 * Sığ seviyeler (hesap, kampanya) tek pencere: bugün 90 günü sorunsuz
 * çekiyorlar ve bölmek çağrı sayısını, dolayısıyla kotayı gereksiz katlıyor.
 *
 * Tarihler `YYYY-MM-DD` STRING olarak taşınıyor ve karşılaştırma da öyle
 * yapılıyor: `Date`e çevirmek bu kod tabanında saat dilimi kayması üretiyor
 * ve bir günü sessizce atlatıyor.
 */
export function istekPencereleri(
  level: InsightsLevel,
  from: string,
  to: string,
): Array<{ from: string; to: string }> {
  if (!DERIN_SEVIYELER.has(level)) return [{ from, to }];

  const out: Array<{ from: string; to: string }> = [];
  let bas = from;
  while (bas <= to) {
    const son = shiftDate(bas, DERIN_SEVIYE_PENCERESI - 1);
    out.push({ from: bas, to: son > to ? to : son });
    bas = shiftDate(son, 1);
  }
  return out;
}
