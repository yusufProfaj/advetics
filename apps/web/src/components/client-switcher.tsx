'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@advetics/shared';
import { apiFetch } from '@/lib/api';

interface Membership {
  id: string;
  clientId: string | null;
  clientName: string | null;
  role: Role;
}

/**
 * Aktif müşteri seçici.
 *
 * Seçim sunucuya bildirilir ve bir cookie'de saklanır. Cookie'yi elle
 * değiştirmek erişim kazandırmaz: API her istekte seçimi kullanıcının gerçek
 * membership listesine karşı doğrular ve geçersizse organizasyon geneli
 * görünüme düşer (bkz. TenantContextService.resolve).
 */
export function ClientSwitcher({
  memberships,
  activeClientId,
  isOrgAdmin,
}: {
  memberships: Membership[];
  activeClientId: string | null;
  isOrgAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const clients = memberships
    .filter((m) => m.clientId !== null)
    .map((m) => ({ id: m.clientId as string, name: m.clientName ?? 'İsimsiz müşteri' }));

  async function onChange(value: string) {
    const clientId = value === '__all__' ? null : value;
    setPending(true);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  // Org yöneticisi değilse ve tek müşterisi varsa seçici anlamsız.
  if (!isOrgAdmin && clients.length <= 1) {
    return (
      <span className="text-sm font-medium">
        {clients[0]?.name ?? 'Müşteri atanmamış'}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--text-muted)]">Müşteri:</span>
      <select
        value={activeClientId ?? '__all__'}
        disabled={pending}
        onChange={(e) => void onChange(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm outline-none transition focus:border-[var(--brand-primary)] disabled:opacity-60"
      >
        {isOrgAdmin && <option value="__all__">Tüm müşteriler</option>}
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
