import type { CampaignGoal, SikSayfa } from '@advetics/shared';

/**
 * ═══ REKLAM OLUŞTUR, MARKA MERKEZİ'NİN BİLDİĞİNİ SORMUYOR ═══
 *
 * Marka sekmesinde ana amaç ve sık kullanılan sayfalar kaydediliyor; bu
 * dosya olmadan sihirbaz ikisini de her seferinde boş açıyordu ve
 * kullanıcı aynı bilgiyi ikinci kez veriyordu.
 *
 * SAF FONKSİYON, effect değil: panelde bileşen render eden test altyapısı
 * yok ve effect içindeki karar yalnızca kaynak taramasıyla sınanabiliyordu
 * (CLAUDE.md, `domaYazilmali` dersi).
 */

/**
 * "Siteye trafik" hedefinin ilk adresi. Kayıtlı sayfa varsa İLKİ: kullanıcı
 * listeyi reklamın gideceği yerler olarak kurdu. Yoksa workspace kartındaki
 * site. İkisi de yoksa boş — adres UYDURULMUYOR.
 */
export function varsayilanAdres(sikSayfalar: readonly SikSayfa[], clientWebsite: string | null): string {
  return sikSayfalar[0]?.url ?? clientWebsite ?? '';
}

/**
 * Sihirbazın açılış seçimi. Amaç kayıtlıysa seçili gelir (kullanıcı yine
 * değiştirebilir); adres yalnızca amaç "site" ise doldurulur — başka bir
 * amaçta dolu bir adres, gönderilmeyecek bir alanı dolu gösterirdi.
 */
export function baslangicSecimi(p: {
  anaAmac: CampaignGoal | null;
  sikSayfalar: readonly SikSayfa[];
  clientWebsite: string | null;
}): { goal: CampaignGoal | null; linkUrl: string } {
  return {
    goal: p.anaAmac,
    linkUrl: p.anaAmac === 'website' ? varsayilanAdres(p.sikSayfalar, p.clientWebsite) : '',
  };
}
