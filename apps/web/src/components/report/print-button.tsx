'use client';

import { dugmeSinifi } from '@/components/ui/dugme';

/**
 * Yazdırma düğmesi.
 *
 * Ayrı bir istemci bileşeni çünkü `window.print()` tarayıcıda çalışıyor.
 * Alternatifi düğmeye satır içi `onclick` özniteliği basmaktı; React bilinmeyen
 * küçük harfli olay özniteliklerini güvenilir biçimde DOM'a yazmıyor ve düğme
 * SESSİZCE çalışmaz hâle geliyor.
 *
 * Sayfanın geri kalanı sunucuda render ediliyor: JS hiç yüklenmese bile rapor
 * okunabilir kalıyor ve kullanıcı tarayıcının kendi yazdırma menüsünü
 * kullanabilir. Bu düğme bir kolaylık, bağımlılık değil.
 *
 * YAZDIRMA EKRANDAKİ DÖNEMİ BASIYOR: rapor linkinde kişi dönemi kendisi
 * seçebiliyor (2026-10-21) ve PDF o dönemin belgesi. Sunucunun ürettiği
 * PDF (mail eki, panelden indirme) linke bağlı değil.
 */
export function PrintButton({ etiket }: { etiket: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={dugmeSinifi('ikincil')}>
      {etiket}
    </button>
  );
}
