import type { Platform } from '@prisma/client';

/**
 * ═══ GÜN İÇİ METRİK SIKLIĞI PLATFORMA GÖRE ═══
 *
 * `sweep:realtime` 30 dakikada bir koşuyor ve her hesaba iş açıyordu.
 * Üretimde ölçüldü (2026-10-01, `olcum-google-kota --gun=1`, 54 Google
 * hesabı): günde 2.544 `insights_realtime` işi ve 10.176 çağrı — Google
 * çağrılarının %84'ü. Toplam ~12.100/gün, Basic Access tavanı belgeye göre
 * ~15.000; yani ~66 izlenen hesapta kota yeniden dolardı. Kullanıcı kararı
 * (2026-10-01): Google gün içi metriği SAATLİK.
 *
 * NEDEN ZAMANLAYICIYI DEĞİL SÜZGECİ DEĞİŞTİRİYORUZ: süpürme platform
 * taşımıyor ve Meta'nın 30 dakikası doğru — Meta kotası hesap başına
 * kovada tutuluyor, günlük tavan yok. Platforma göre ikinci bir zamanlayıcı
 * kurmak aynı fan-out'u iki kez yazmak demekti (CLAUDE.md "AYNI SÜZGECİ İKİ
 * YERDE YAZMA").
 *
 * NEDEN DAKİKAYA DEĞİL SON İŞE BAKIYORUZ: "yalnızca :00 turunda Google" demek
 * süpürmenin dakikasına güvenmek olurdu; gecikmeli koşan bir süpürme ya iki
 * turu birden atlar ya ikisinde de çeker. Son işin yaşı saatten bağımsız.
 * Elle "Şimdi güncelle" de bir iş açıyor ve sayılıyor — az önce tazelenmiş
 * bir hesabı süpürmenin yeniden çekmesine gerek yok.
 *
 * Tüm durumlar sayılıyor (yalnızca başarılı değil): düşen bir gün içi iş
 * bir sonraki saat yeniden açılıyor ve bugünün verisi gecikse bile gece
 * `insights_daily` onu kesin hâliyle yazıyor. Burada tekrar etmek, kotayı
 * dolduran şeyin ta kendisi olurdu. (`gunluk-tekrar.ts` bunun tersini
 * yapıyor ve orada doğru: o günün başka çekimi YOK.)
 */
export const GUN_ICI_ARALIK_DK: Record<Platform, number> = {
  meta: 30,
  google: 60,
  linkedin: 30,
};

/** `sweep:realtime` zamanlayıcısının aralığı (`sync-queue.service.ts`). */
export const GUN_ICI_SUPURME_DK = 30;

/** Bu platform süpürmenin her turunda mı çekiliyor, yoksa seyreltiliyor mu? */
export function seyreltilir(platform: Platform): boolean {
  return GUN_ICI_ARALIK_DK[platform] > GUN_ICI_SUPURME_DK;
}

/**
 * Hesabın gün içi işi bu turda atlanmalı mı?
 *
 * Eşik aralığın yarım süpürme eksiği (Google'da 45 dk): tam 60 dk olsaydı
 * :00'da açılıp :00'dan birkaç saniye sonra kaydedilen iş, bir sonraki
 * :00 turunda "59 dk 58 sn" sayılıp atlanır ve hesap iki saatte bir
 * çekilirdi. Yarım tur pay, süpürmenin gecikmesini de emiyor.
 */
export function gunIciAtlanir(
  platform: Platform,
  sonIs: Date | undefined,
  simdi: Date,
): boolean {
  if (!seyreltilir(platform) || !sonIs) return false;
  const esikMs = (GUN_ICI_ARALIK_DK[platform] - GUN_ICI_SUPURME_DK / 2) * 60_000;
  return simdi.getTime() - sonIs.getTime() < esikMs;
}

/** Hesap başına en son iş zamanı. */
export function sonGunIciIsler(
  satirlar: ReadonlyArray<{ adAccountId: string | null; createdAt: Date }>,
): Map<string, Date> {
  const harita = new Map<string, Date>();
  for (const s of satirlar) {
    if (s.adAccountId === null) continue;
    const onceki = harita.get(s.adAccountId);
    if (!onceki || s.createdAt > onceki) harita.set(s.adAccountId, s.createdAt);
  }
  return harita;
}
