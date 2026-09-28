/**
 * ═══ YETKİ NE ZAMAN GERÇEKTEN BİTİYOR — ERİŞİM TOKEN'I DEĞİL ═══
 *
 * `token_expires_at` ERİŞİM token'ının bitişi ve token kasası onu doğru
 * amaçla kullanıyor: ne zaman yenileyeceğine onunla karar veriyor. Uyarılar
 * ise aynı alanı YETKİNİN ömrü sandı. Canlıda (2026-09-28) Google Ads
 * bağlantısı "yetki 1 gün içinde doluyor" diyordu: kaydedilen an son
 * doğrulamanın TAM BİR SAAT sonrasıydı, yani Google'ın saatlik erişim
 * token'ı. Yenileme token'ının süresi yok; uyarı hiç kaybolmayacak ve 52
 * hesaplık bağlantının gerçek sorunlarını gürültünün içinde saklayacaktı.
 *
 * Üç platformda üç ayrı gerçek:
 *   · Meta: yenileme token'ı YOK. Erişim token'ı ölünce yetki ölüyor, yani
 *     erişim bitişi = yetki bitişi.
 *   · Google: yenileme token'ı var ve SÜRESİ YOK. Yetki bitişi bilinmiyor
 *     değil, yok: `null` ve panel bunu "otomatik" diye yazıyor.
 *   · LinkedIn: yenileme token'ı İLK yetkilendirmeden itibaren 365 gün
 *     yaşıyor ve yenilemede UZAMIYOR (CLAUDE.md, ölçüldü). Uyarı 60 günlük
 *     erişim token'ına bakıyordu; asıl ölüm bir yıl sonra ve habersiz.
 *
 * `yenilemeVar` ÇAĞIRANDAN GELİYOR, yanıttan türetilmiyor: Google yenileme
 * yanıtında refresh token GÖNDERMİYOR ve eskisi korunuyor. Yanıta bakıp
 * "yenileme yok" demek, Google bağlantısını Meta gibi saatlik ölüme mahkûm
 * gösterirdi.
 */
export function yetkiBitisi(p: {
  yenilemeVar: boolean;
  erisimBitisi: Date | null | undefined;
  yenilemeBitisi: Date | null | undefined;
}): Date | null {
  if (!p.yenilemeVar) return p.erisimBitisi ?? null;
  return p.yenilemeBitisi ?? null;
}
