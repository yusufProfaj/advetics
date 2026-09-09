import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Oturum ekranlarının ORTAK KABUĞU — giriş, şifremi unuttum, şifre sıfırlama.
 *
 * Üç sayfanın da aynı markup'ı kendi içinde taşıması, ilk gerekli değişiklikte
 * (logo, başlık, dip not) ikisinin güncellenip birinin unutulması demekti;
 * fark yalnızca o sayfaya düşen kullanıcıya görünür ve kimse bildirmez.
 */
export function AuthKabuk({
  baslik,
  aciklama,
  children,
  altBaglanti,
}: {
  baslik: string;
  aciklama: string;
  children: ReactNode;
  /** Kart altındaki dönüş bağlantısı. Giriş ekranında yok. */
  altBaglanti?: { href: string; metin: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white">
            A
          </div>
          <h1 className="text-xl font-semibold text-ink">{baslik}</h1>
          <p className="mt-1 text-sm text-ink-muted">{aciklama}</p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">{children}</div>

        {altBaglanti && (
          <p className="mt-4 text-center text-sm">
            <Link href={altBaglanti.href} className="text-brand hover:underline">
              {altBaglanti.metin}
            </Link>
          </p>
        )}

        <p className="mt-6 text-center text-xs text-ink-muted">
          Advetics · Meta ve Google Ads otomasyonu
        </p>
      </div>
    </main>
  );
}
