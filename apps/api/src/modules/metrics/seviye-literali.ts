import { Prisma } from '@prisma/client';
import { METRIC_LEVELS, type MetricLevel } from '@advetics/shared';

/**
 * ═══ `entity_level` SORGUYA LİTERAL OLARAK GİRMEK ZORUNDA ═══
 *
 * `Prisma.sql` içinde `${TOTALS_LEVEL}` yazmak onu BAĞLI PARAMETRE yapıyor
 * (`$1`). Doğru sonucu veriyor, hızlı da görünüyor — ve `insights_daily`
 * üzerindeki kısmi indeksi KULLANILAMAZ hâle getiriyor.
 *
 * ┌─ NEDEN: KISMİ İNDEKS YÜKLEMİ PLAN ANINDA KANITLANIYOR ────────────────┐
 * │ `... WHERE entity_level = 'campaign'` yüklemli bir indeks ancak       │
 * │ planlayıcı sorgunun yükleminin indeksinkini GEREKTİRDİĞİNİ kanıtlarsa │
 * │ kullanılıyor. Değer bağlı parametreyse plan anında bilinmiyor ve      │
 * │ kanıt kurulamıyor.                                                    │
 * │                                                                       │
 * │ PGlite ile ÖLÇÜLDÜ (`entity-level-kismi-indeks.spec.ts`):             │
 * │   literal      → Index Scan ... (kısmi indeks), Filter'da entity_level│
 * │                  YOK, maliyet 212                                     │
 * │   parametreli  → tam indekse düşüyor, `entity_level` Filter'da kalıyor│
 * │                  maliyet 436                                          │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ═══ NEDEN İNDEKSE ALMAK YETMİYOR, KISMİ OLMAK ZORUNDA ═══
 *
 * `entity_level` normal bir indeks sütunu olarak da işe yaramıyor. Üretim
 * planı bunu gösterdi: sütun indekste OLMASINA rağmen `Index Cond`a
 * girmiyor, heap `Filter`ında kalıyor ve satırın sayfası boşuna okunuyor.
 * Sebep RLS: tablo satır seviyesi güvenlik taşıyor ve Postgres, güvenlik
 * yüklemlerinden ÖNCE yalnızca LEAKPROOF operatörleri çalıştırıyor.
 * `date` karşılaştırmaları leakproof (o yüzden `Index Cond`a giriyor),
 * enum eşitliği (`enum_eq`) DEĞİL.
 *
 * Kısmi indeks bu sıralamayı tamamen atlatıyor: yüklem çalışma anında
 * DEĞERLENDİRİLMİYOR, indeksin tanımının parçası.
 *
 * ═══ ENJEKSİYON ═══
 *
 * `Prisma.raw` metni doğrudan sorguya yazıyor. Değer bu depoda her zaman
 * bir DERLEME ZAMANI SABİTİ ama "her zaman" varsayımı bakımdan sağ
 * çıkmıyor; o yüzden liste karşısında doğrulanıyor ve tanınmayan değer
 * sessizce geçmek yerine PATLIYOR.
 */
export function seviyeLiterali(seviye: MetricLevel): Prisma.Sql {
  if (!METRIC_LEVELS.includes(seviye)) {
    throw new Error(`Bilinmeyen metrik seviyesi: ${seviye}`);
  }
  return Prisma.raw(`'${seviye}'::"EntityLevel"`);
}
