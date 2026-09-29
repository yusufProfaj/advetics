/**
 * SAYFA GEÇİŞİ.
 *
 * `layout.tsx` gezinmeler arasında monte kalıyor (kenar çubuğu ve üst bar
 * yeniden çizilmesin diye); `template.tsx` ise HER gezinmede yeniden monte
 * ediliyor. Giriş animasyonu bu yüzden burada: sınıf `globals.css`
 * içindeki `.sayfa-gecis` ve sayfanın ilk seviye bloklarını sırayla getiriyor.
 *
 * Yalnızca bir sarmalayıcı: veri çekmiyor, durum tutmuyor. Arama
 * parametresi (süzgeç, tarih aralığı) değişince yeniden monte OLMUYOR, yani
 * süzgeç değiştiren kullanıcı sayfanın baştan "uçarak" gelmesini görmüyor.
 */
export default function PanelSablonu({ children }: { children: React.ReactNode }) {
  return <div className="sayfa-gecis">{children}</div>;
}
