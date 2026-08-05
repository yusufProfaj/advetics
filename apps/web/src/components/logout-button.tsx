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
      title="Çıkış yap"
      aria-label="Çıkış yap"
      className="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-danger disabled:opacity-50"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" aria-hidden>
        <path
          d="M12.5 6.5V4.5h-8v11h8v-2M9 10h7.5m0 0-2.5-2.5M16.5 10 14 12.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
