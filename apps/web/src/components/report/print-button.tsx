'use client';

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
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
    >
      PDF olarak kaydet
    </button>
  );
}
