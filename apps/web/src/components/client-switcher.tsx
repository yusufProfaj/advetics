'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface AvailableClient {
  id: string;
  name: string;
  status: string;
}

/**
 * Aktif müşteri seçici.
 *
 * Liste `session.availableClients`ten gelir, membership'lerden TÜRETİLMEZ:
 * org geneli yetkili bir kullanıcının tek membership satırı vardır ve
 * `clientId` null'dır. Listeyi membership'lerden çıkarmak, yöneticiye boş bir
 * seçici gösteriyordu ve müşteri seçilemediği için bağlantı kurmak imkânsız
 * hâle geliyordu.
 *
 * Seçim sunucuya bildirilir ve cookie'de saklanır. Cookie'yi elle değiştirmek
 * erişim kazandırmaz: API her istekte seçimi kullanıcının gerçek erişim
 * listesine karşı doğrular ve geçersizse org geneli görünüme düşer.
 */
export function ClientSwitcher({
  availableClients,
  activeClientId,
  isOrgAdmin,
}: {
  availableClients: AvailableClient[];
  activeClientId: string | null;
  isOrgAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const active = availableClients.find((c) => c.id === activeClientId) ?? null;

  async function select(clientId: string | null) {
    setOpen(false);
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

  if (availableClients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-muted">
        Henüz müşteri yok —{' '}
        <a href="/ayarlar/musteriler" className="text-brand underline">
          müşteri ekle
        </a>
      </div>
    );
  }

  // Tek müşterisi olan ve org geneli yetkisi olmayan kullanıcıya seçici gösterme.
  if (!isOrgAdmin && availableClients.length === 1) {
    return (
      <div className="flex items-center gap-2.5">
        <Avatar name={availableClients[0]!.name} />
        <span className="text-sm font-medium">{availableClients[0]!.name}</span>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-[13rem] items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:bg-surface-muted disabled:opacity-60"
      >
        <Avatar name={active?.name ?? '∗'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">
            {active?.name ?? 'Tüm müşteriler'}
          </span>
          <span className="block text-[11px] leading-tight text-ink-muted">
            {active ? 'Müşteri görünümü' : `${availableClients.length} müşteri`}
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {isOrgAdmin && (
            <>
              <Option
                label="Tüm müşteriler"
                hint="Organizasyon geneli görünüm"
                selected={activeClientId === null}
                onSelect={() => void select(null)}
              />
              <div className="h-px bg-line" />
            </>
          )}
          <div className="max-h-72 overflow-y-auto">
            {availableClients.map((c) => (
              <Option
                key={c.id}
                label={c.name}
                hint={c.status === 'paused' ? 'Duraklatıldı' : undefined}
                selected={c.id === activeClientId}
                onSelect={() => void select(c.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition ${
        selected ? 'bg-brand-soft' : 'hover:bg-surface-muted'
      }`}
    >
      <Avatar name={label} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${selected ? 'font-semibold text-brand' : ''}`}>
          {label}
        </span>
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </span>
      {selected && (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-brand" aria-hidden>
          <path d="m5 10 3.5 3.5L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-[11px] font-semibold uppercase text-white">
      {name.slice(0, 2)}
    </span>
  );
}
