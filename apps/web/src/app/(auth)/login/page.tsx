import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';

export const metadata = { title: 'Giriş — Advetics' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white">
            A
          </div>
          <h1 className="text-xl font-semibold text-ink">Panele giriş yapın</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Meta ve Google Ads hesaplarınız tek yerde.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          Advetics · Meta ve Google Ads otomasyonu
        </p>
      </div>
    </main>
  );
}
