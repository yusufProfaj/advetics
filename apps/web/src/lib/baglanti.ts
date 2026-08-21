/**
 * SÜZGEÇ TAŞIYAN BAĞLANTI ÜRETİCİSİ — TEK TANIM.
 *
 * Panelde aralık, platform ve kırılım seviyesi URL'de taşınıyor ve bağlantı
 * üreten her yer bunları ELLE birleştiriyordu. Sonuç kaçınılmazdı: platform
 * sekmesi aralığı taşıyor ama kırılım sekmesi platformu DÜŞÜRÜYORDU —
 * kullanıcı "Meta" seçip "Reklam seti"ne basınca süzgeç sessizce sıfırlanıyor
 * ve hiçbir yerde görünmüyordu.
 *
 * Özel tarih aralığı eklenince bu üç yerine beş anahtar oldu (`baslangic`,
 * `bitis`, `karsilastir`) ve elle birleştirme sürdürülemez hâle geldi.
 *
 * CLAUDE.md: "AYNI SÜZGECİ İKİ YERDE YAZMA."
 */
export type BaglantiParams = Record<string, string | undefined>;

/**
 * Taşınan parametrelerin üzerine `over`ı yazıp yol üretir.
 *
 * `undefined` değer anahtarı DÜŞÜRÜYOR — "bu süzgeci kaldır" demenin yolu bu.
 */
export function baglanti(path: string, tasinan: BaglantiParams, over: BaglantiParams = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...tasinan, ...over })) {
    if (v !== undefined && v !== '') qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
