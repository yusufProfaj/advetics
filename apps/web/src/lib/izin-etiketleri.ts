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
const ETIKETLER: Record<string, string> = {
  ads_management: 'Kural motorunun kampanyalara dokunması',
  pages_show_list: 'Facebook sayfalarının listelenmesi',
  pages_read_engagement: 'Facebook gönderilerinin okunması',
  read_insights: 'Facebook gönderi içgörüleri',
  instagram_basic: 'Instagram hesabı ve gönderileri',
  instagram_manage_insights: 'Instagram gönderi içgörüleri',
  leads_retrieval: 'Potansiyel müşteri kayıtlarının çekilmesi',
  pages_manage_ads: 'Sayfa üzerinden reklam ve form erişimi',
  /*
    Bu izin Advetics'in kendi kod yollarını beslemiyor; token'ı Meta'nın Ads
    MCP sunucusuna kabul ettiriyor. Kullanıcıya "yapay zekâ" demek yerine
    yapılan işi yazıyoruz: hedef kullanıcı reklamcılık bilmiyor, protokol adı
    hiç bilmiyor.
  */
  ads_mcp_management: "Meta'nın yapay zekâ araçlarıyla reklam yönetimi",
};

/**
 * Eksik izinleri kullanıcının anlayacağı özellik adlarına çeviriyor.
 *
 * Sıra KORUNUYOR: sağlayıcıdaki liste sırası önem sırası ve onu alfabetik
 * sıralamak en kritik izni ortaya gömerdi.
 */
export function eksikIzinOzellikleri(kapsamlar: readonly string[]): string[] {
  return kapsamlar.map((k) => ETIKETLER[k] ?? k);
}

/** Uyarı cümlesi. Boş listede `null` — çağıran yeri hiç çizmesin. */
export function eksikIzinMetni(kapsamlar: readonly string[]): string | null {
  const ozellikler = eksikIzinOzellikleri(kapsamlar);
  if (ozellikler.length === 0) return null;

  /*
    SESSİZ KESME YOK. Dört izin eksikken "ve 2 tanesi daha" yazmak, hangi
    ikisi olduğunu öğrenmek için başka bir ekran gerektirir ve o ekran yok.
    Liste kısa (en fazla yedi kalem) ve satıra sığıyor.
  */
  return `Şu özellikler için izin bekliyor: ${ozellikler.join(', ')}. Bağlantının geri kalanı çalışıyor.`;
}
