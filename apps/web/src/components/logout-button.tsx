'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Sunucu tarafı iptal başarısız olsa bile kullanıcıyı çıkarıyoruz —
      // ekranda takılı kalmasındansa cookie'siz devam etmesi daha iyi.
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
    >
      {pending ? '…' : 'Çıkış'}
    </button>
  );
}
