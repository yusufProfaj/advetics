import type { Platform, SyncJobType } from '@prisma/client';
import type { InsightsLevel } from '../modules/connections/provider.types';

/**
 * ═══ HANGİ PLATFORM HANGİ İŞİ YAPABİLİYOR — TEK TANIM ═══
 *
 * LinkedIn eklendiğinde kuyruk hiçbir şeyi platforma göre süzmüyordu ve iki
 * iş türü her LinkedIn hesabında HER SEFERİNDE kalıcı hatayla düşüyordu.
 * Üretimde son 7 günde 865 işin 549'u başarısızdı ve büyük kısmı bunlardı;
 * gerçek bir arıza o kalabalığın içinde görünmez hâle geliyordu.
 *
 *   · `insights_breakdowns` → `fetchBreakdowns` LinkedIn'de yazılmadı
 *     (yaş/cinsiyet pivotu yok; karşılığı sektör/ünvan/kıdem ve bu bir ürün
 *     kararı bekliyor). İş kuyruğa HİÇ girmemeli.
 *
 *   · `insights_daily` ve `insights_realtime` → seviye listesi `account` ile
 *     BAŞLIYOR ve LinkedIn'de hesap seviyesinin karşılığı yok. Daha sinsi
 *     olanı bu: ilk seviye kalıcı hata fırlattığı için döngü kampanya, grup
 *     ve reklam seviyelerine HİÇ GELMİYORDU. LinkedIn'in günlük ve gün içi
 *     metriği bu işlerden hiç gelmedi; veri yalnızca gecelik 7 günlük geri
 *     düzeltmeden (o `account` istemiyor) akıyordu. Bu işler kuyruktan
 *     ÇIKARILMAMALI — yalnızca desteklenmeyen seviye atlanmalı.
 *
 * `Record<Platform, ...>` BİLİNÇLİ: yeni bir platform eklendiğinde derleme
 * kırılıyor ve ekleyen kişi bu iki listeyi doldurmak zorunda kalıyor. Liste
 * olmasaydı üçüncü platform gibi dördüncüsü de her işi "yapabilir" sayılırdı.
 */

/**
 * Platformun metrik çekebildiği seviyeler.
 *
 * LinkedIn satırı `LINKEDIN_PIVOT`un anahtarlarıyla AYNI olmak zorunda —
 * `platform-isleri.spec.ts` ikisini karşılaştırıyor. Burada seviye eksik
 * kalırsa o seviyenin verisi sessizce hiç çekilmez; fazla kalırsa iş yine
 * her seferinde düşer.
 */
export const PLATFORM_METRIK_SEVIYELERI: Record<Platform, readonly InsightsLevel[]> = {
  meta: ['account', 'campaign', 'ad_group', 'ad'],
  google: ['account', 'campaign', 'ad_group', 'ad'],
  linkedin: ['campaign', 'ad_group', 'ad'],
};

/**
 * Platformda HİÇ koşturulmaması gereken hesap işleri.
 *
 * Yasak listesi, izin listesi değil: bugüne kadar her iş her platforma
 * açıktı ve Meta ile Google'da düzgün çalışıyor. İzin listesine geçmek o
 * iki platformdaki her iş türünü yeniden kanıtlamayı isterdi.
 *
 * `search_terms` ve `keyword_insights` burada YOK: ikisinin servisi
 * Google dışında erken çıkıyor (0 satır, platforma çağrı yok). Kalıcı
 * hata üretmiyorlar.
 */
const PLATFORMUN_YAPAMADIGI_ISLER: Record<Platform, readonly SyncJobType[]> = {
  meta: [],
  google: [],
  linkedin: ['insights_breakdowns'],
};

/** İş bu platformda kuyruğa girebilir mi? */
export function isYapilabilir(platform: Platform, jobType: SyncJobType): boolean {
  return !PLATFORMUN_YAPAMADIGI_ISLER[platform].includes(jobType);
}

/**
 * İş türünün istediği seviyelerden platformun karşılayabildikleri, ve
 * atlananlar. Atlananlar iş notuna yazılıyor: "LinkedIn'de hesap seviyesi
 * neden yok" sorusunun cevabı teşhis ekranında görünsün.
 */
export function platformSeviyeleri(
  platform: Platform,
  istenen: readonly InsightsLevel[],
): { seviyeler: InsightsLevel[]; atlanan: InsightsLevel[] } {
  const destek = PLATFORM_METRIK_SEVIYELERI[platform];
  return {
    seviyeler: istenen.filter((l) => destek.includes(l)),
    atlanan: istenen.filter((l) => !destek.includes(l)),
  };
}
