/**
 * ═══ YOUTUBE REKLAMI HANGİ GOOGLE ADS HESABINDAN ÇIKIYOR ═══
 *
 * Canlıda görülen hâl: kart "Bu kanala bağlı hesap bir Google Ads hesabı
 * değil ... Workspace'ler ekranından doğru hesabı seç" diyordu ve o adım
 * FİİLEN YOKTU. Kanal ile reklam hesabı arasındaki bağı yazan tek yol
 * (`setProfileAdAccount`) yalnızca Meta hesabı kabul ediyordu ve panelde
 * YouTube kanalının seçicisi gizliydi; kanalda duran bağ eski bir Meta
 * hesabını gösteriyordu. Kullanıcı hiçbir ekrandan düzeltemiyordu.
 *
 * KARAR TEK YERDE: kart uyarısı (okuma servisi), ön ayar ekranı ve yayın bu
 * fonksiyonu çağırıyor. Üçü ayrı yazılsaydı biri "hazır" derken diğeri
 * reddederdi.
 *
 * SIRA:
 *   1. Kanala bu workspace'in bir Google hesabı bağlıysa o.
 *   2. Değilse ve workspace'te TEK Google Ads hesabı varsa o — sormak angarya,
 *      cevap belli. Yayın bu seçimi kanala da yazıyor.
 *   3. Hiç yoksa ya da birden çoksa: TAHMİN YOK, kullanıcı seçiyor. Yanlış
 *      hesap başka bir müşterinin bütçesinden harcamak demek.
 *
 * Kanala bağlı ama GOOGLE OLMAYAN (Meta) ya da BAŞKA workspace'e ait hesap
 * YOK SAYILIYOR: onunla Google'a gitmek "hesap bulunamadı" ile döner.
 */
export type YoutubeHesabiKarari =
  | { durum: 'kanal'; hesapId: string }
  | { durum: 'tek-hesap'; hesapId: string }
  | { durum: 'yok' }
  | { durum: 'birden-cok'; adet: number };

export function youtubeHesabiSec(
  bagli: { id: string; platform: string; clientId: string | null } | null,
  clientId: string,
  workspaceGoogleHesaplari: readonly string[],
): YoutubeHesabiKarari {
  if (bagli && bagli.platform === 'google' && bagli.clientId === clientId) {
    return { durum: 'kanal', hesapId: bagli.id };
  }
  if (workspaceGoogleHesaplari.length === 1) {
    return { durum: 'tek-hesap', hesapId: workspaceGoogleHesaplari[0]! };
  }
  if (workspaceGoogleHesaplari.length === 0) return { durum: 'yok' };
  return { durum: 'birden-cok', adet: workspaceGoogleHesaplari.length };
}

/** Yayını engelleyen durumun cümlesi — engel yoksa `null`. Yeri de söylüyor. */
export function youtubeHesabiEngeli(k: YoutubeHesabiKarari): string | null {
  if (k.durum === 'yok') {
    return (
      'Bu workspace’e atanmış bir Google Ads hesabı yok. Şirketler ekranında ' +
      'workspace’e Google Ads hesabını ata; YouTube reklamı oradan yayınlanıyor.'
    );
  }
  if (k.durum === 'birden-cok') {
    return (
      `Bu workspace’te ${k.adet} Google Ads hesabı var. Şirketler ekranında ` +
      'YouTube kanalının satırından reklamın hangi hesaptan çıkacağını seç.'
    );
  }
  return null;
}

/**
 * Workspace'in Google Ads hesaplarını süzen SQL koşulu — okuma servisi ve
 * çözümleyici AYNI koşulu kullanıyor (`$queryRaw` içinde `Prisma.raw`).
 *
 * YÖNETİCİ (MCC) HESABI DIŞARIDA: reklam yayınlamıyor ve "tek hesap" sayımına
 * girseydi gerçek tek hesabı "birden çok" yapıp soruyu gereksiz yere açardı.
 */
export const YOUTUBE_HESAP_KOSULU =
  "aa.platform = 'google' AND (aa.manager_external_id IS NULL OR aa.manager_external_id <> aa.external_id)";
