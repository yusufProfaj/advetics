import { sec, type Dil } from '@advetics/shared';
import { baglantilarSozlugu } from '@/dil/sozlukler/ayarlar-baglantilar';

/**
 * ═══ EKSİK İZİN → HANGİ ÖZELLİK KAPALI ═══
 *
 * Panelde eksik isteğe bağlı izin uyarısı TEK BİR CÜMLEYDİ: "Akıllı Boost
 * için ek izin bekliyor". O cümle listede tek bir özellik varken doğruydu;
 * `optionalScopes` bugün organik içerik, içgörü ve Meta'nın Ads MCP sunucusu
 * için ayrı ayrı izin taşıyor ve aynı cümle artık YANLIŞ ÖZELLİĞİ söylüyor.
 *
 * Yanlış özellik söylemek eksik uyarıdan kötü: kullanıcı Akıllı Boost'ta
 * olmayan bir arızayı aramaya gidiyor, gerçekte kapalı olan Instagram
 * içgörüleri hiç konuşulmuyor.
 *
 * TANIMADIĞI İZİN İÇİN UYDURMUYOR — ham kapsam adını yazıyor. Sağlayıcıya
 * yeni bir izin eklenip buraya eklenmediğinde kullanıcı en azından ARANACAK
 * KELİMEYİ görüyor; `izin-etiketleri.spec.ts` bu boşluğu zaten kırmızıya
 * çeviriyor ama üretimdeki kullanıcı testin kırmızısını görmüyor.
 */
/*
  ETİKETLER SÖZLÜKTE (`ayarlar-baglantilar.ts` › `izin.etiketler`), iki dilde.
  `ads_mcp_management` Advetics'in kendi kod yollarını beslemiyor; token'ı
  Meta'nın Ads MCP sunucusuna kabul ettiriyor. Kullanıcıya "yapay zekâ"
  demek yerine yapılan işi yazıyoruz: hedef kullanıcı protokol adını bilmiyor.
*/

/**
 * Eksik izinleri kullanıcının anlayacağı özellik adlarına çeviriyor.
 *
 * Sıra KORUNUYOR: sağlayıcıdaki liste sırası önem sırası ve onu alfabetik
 * sıralamak en kritik izni ortaya gömerdi.
 */
export function eksikIzinOzellikleri(kapsamlar: readonly string[], dil: Dil = 'tr'): string[] {
  const etiketler = sec(baglantilarSozlugu, dil).izin.etiketler;
  return kapsamlar.map((k) => etiketler[k] ?? k);
}

/** Uyarı cümlesi. Boş listede `null` — çağıran yeri hiç çizmesin. */
export function eksikIzinMetni(kapsamlar: readonly string[], dil: Dil = 'tr'): string | null {
  const ozellikler = eksikIzinOzellikleri(kapsamlar, dil);
  if (ozellikler.length === 0) return null;

  /*
    SESSİZ KESME YOK. Dört izin eksikken "ve 2 tanesi daha" yazmak, hangi
    ikisi olduğunu öğrenmek için başka bir ekran gerektirir ve o ekran yok.
    Liste kısa (en fazla yedi kalem) ve satıra sığıyor.
  */
  return sec(baglantilarSozlugu, dil).izin.metin(ozellikler.join(', '));
}
