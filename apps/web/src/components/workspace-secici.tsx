'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Aktif workspace'i seçen düğme ızgarası.
 *
 * ÜST BARDAKİ DEĞİŞTİRİCİYLE AYNI UCU ÇAĞIRIYOR (`/auth/switch-client`) ve
 * bu kasıtlı: adrese `?musteri=` yazan ikinci bir denetim doğursaydı, üst bar
 * bir müşteri yazarken gövdenin başkasının verisini göstermesi mümkün olurdu.
 * O çakışma bu projede zaten bir kez yaşandı ve "veri sızıntısı" olarak
 * bildirildi.
 *
 * HATA YUTULMUYOR: seçim sunucuya yazılamazsa sayfa yenilenip hiçbir şey
 * olmamış gibi görünürdü.
 */
export function WorkspaceSecici({
  clients,
}: {
  clients: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function sec(clientId: string): Promise<void> {
    setBekleyen(clientId);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      router.refresh();
    } catch (e) {
      setHata(
        e instanceof ApiRequestError ? e.message : 'Workspace seçilemedi.',
      );
      setBekleyen(null);
    }
  }

  return (
    <div className="mt-4">
      {hata && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {hata}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {clients.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => void sec(c.id)}
            disabled={bekleyen !== null}
            className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition hover:border-brand-soft hover:bg-surface-sunken disabled:opacity-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold uppercase">
              {c.name.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {c.name}
            </span>
            {bekleyen === c.id && (
              <span className="shrink-0 text-[11px] text-ink-muted">açılıyor…</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
