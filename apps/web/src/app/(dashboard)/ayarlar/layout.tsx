/**
 * AYARLAR: TEK KAPI, BÖLÜMLER SAYFA İÇİ YAN MENÜDE.
 *
 * Bu düzen bir süre sekme çubuğunu çiziyordu ve başlık sayfanın içinde,
 * sekmelerin ALTINDA kalıyordu. Yeni dilde başlık tam genişlikte üstte,
 * bölüm menüsü onun altında solda (BILESENLER § 9); ikisinin sırası
 * düzenden kurulamıyor, çünkü başlığın sağındaki birincil eylem her bölümün
 * kendi kapısıyla kuruluyor. Çerçeve `AyarlarSayfasi`nda
 * (`components/ayar-kapsam.tsx`) ve her bölüm sayfası onu çağırıyor.
 *
 * Dosya SİLİNMEDİ: `ayarlar.spec.ts` modülün dosyalarını sayıyor ve düzen
 * yeniden bir şey taşıması gerektiğinde yeri burası.
 */
export default function AyarlarDuzeni({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
