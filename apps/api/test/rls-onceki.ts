/**
 * Üretim sırası testleri için "önceki deploy'un 02_rls.sql'i".
 *
 * Bugünkü dosya, sınanan migration'dan SONRA gelen modüllerin tablolarını
 * adıyla anıyor ve o tablolar henüz yokken koşulamaz. Sonraki modüllerin
 * bölümleri dosyanın SONUNDA ve kendi başlıklarıyla duruyor; önceki hâl o
 * başlıktan kesilerek türetiliyor. Başlık bulunamazsa PATLAR: sessizce
 * kesilmeyen bir bölüm testi yanlış şemayla yeşil geçirirdi.
 */
export const PILOT_RLS_BASLIGI = '-- PİLOT — pilot_planlari';

export function bolumdenOnce(rls: string, baslik: string): string {
  const i = rls.indexOf(baslik);
  if (i < 0) throw new Error(`02_rls.sql içinde bölüm başlığı yok: ${baslik}`);
  const bas = rls.lastIndexOf('-- ====', i);
  if (bas < 0) throw new Error(`Bölüm çizgisi bulunamadı: ${baslik}`);
  return rls.slice(0, bas);
}
