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
      className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted"
    >
      PDF olarak kaydet
    </button>
  );
}
