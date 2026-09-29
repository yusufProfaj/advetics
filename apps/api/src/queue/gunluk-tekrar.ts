/**
 * ═══ "DÜN" BİR KEZ ÇEKİLİR ═══
 *
 * `sweep:daily` her saat başı koşuyor ve gerekçesi doğru: hesapların zaman
 * dilimi farklı, "dün" her hesap için başka bir saatte kapanıyor. Ama
 * süpürme bir hesabın dününü ZATEN çekip çekmediğine bakmıyordu, ve kuyruğun
 * mükerrer engeli de bunu yakalamıyor: iş TAMAMLANINCA kimliği serbest
 * kalıyor (`enqueue` tamamlanmış işi kaldırıp yenisini koyuyor). Sonuç her
 * saat aynı günün yeniden çekilmesiydi.
 *
 * Üretimde ölçüldü (2026-09-29, `olcum-google-kota`, son 7 gün, 54 Google
 * hesabı): 4.159 başarılı `insights_daily` = hesap başına GÜNDE ~11 kez,
 * ~4.700 Google çağrısı/gün. Başarılı işlerin toplamı ~10.300/gün; Basic
 * Access sınırı belgeye göre ~15.000 işlem/gün (`ARCHITECTURE.md`, canlıda
 * sayı doğrulanmadı). Kota hatası her gece 01:00-04:00 arası başlayıp
 * İstanbul 10:00'da (Pasifik gece yarısı, günlük sıfırlama) kesiliyordu —
 * dağınık değil, günlük tavanın imzası.
 *
 * Tekrar çekmenin bir getirisi de yok: atıf penceresi yüzünden değişen
 * günleri `insights_backfill` her gece son 7 gün için zaten düzeltiyor.
 *
 * Yalnızca BAŞARILI iş sayılıyor: düşen bir günlük iş bir sonraki saatte
 * tekrar açılmalı, yoksa o günün verisi hiç gelmez.
 */

/** Hesap + gün anahtarı. Gün `YYYY-MM-DD` — Date'e çevirmek saat dilimi kaydırır. */
export function gunlukAnahtar(adAccountId: string, gun: string): string {
  return `${adAccountId}__${gun}`;
}

/**
 * Başarılı `insights_daily` satırlarından "bu hesabın bu günü çekildi"
 * kümesi. `date_from` DATE kolonu ve Prisma onu UTC gece yarısı Date olarak
 * veriyor; `toISOString().slice(0, 10)` o yüzden doğru günü veriyor.
 */
export function cekilmisGunler(
  satirlar: ReadonlyArray<{ adAccountId: string | null; dateFrom: Date | null }>,
): Set<string> {
  const kume = new Set<string>();
  for (const s of satirlar) {
    if (s.adAccountId === null || s.dateFrom === null) continue;
    kume.add(gunlukAnahtar(s.adAccountId, s.dateFrom.toISOString().slice(0, 10)));
  }
  return kume;
}
