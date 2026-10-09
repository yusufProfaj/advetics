/**
 * Reklam önizlemesi açık mı?
 *
 * "Önizlemeler" anahtarı KAPALIYKEN aynı anda tek önizleme açık (kullanıcının
 * eski isteği: "farklı reklamın önizlemesini görmek istediğimde diğerinin
 * kapanıp tıkladığım reklamın açılması"); AÇIKKEN hepsi açık ve tek tek
 * kapatılabiliyor. Karar saf fonksiyonda çünkü panelde bileşen render eden
 * test yok: effect ya da JSX içinde kalsaydı yalnızca kaynak taramasıyla,
 * yani kuralın kendisi değil YAZIMI sınanabilirdi.
 *
 * Eskiden `components/breakdown-table.tsx` içindeydi; o tablo kalkınca buraya
 * taşındı (Reklam Yöneticisi tablosu kullanıyor).
 */
export function onizlemeAcikMi(
  d: { hepsiAcik: boolean; tekAcik: string | null; kapatilan: ReadonlySet<string> },
  id: string,
): boolean {
  return d.hepsiAcik ? !d.kapatilan.has(id) : d.tekAcik === id;
}
