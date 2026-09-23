'use client';

import { useState } from 'react';
import { Halka } from '@/components/yukleniyor';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { kurulumAdresi } from './kurulum-akisi';

/**
 * "TÜM ŞİRKETLER" MODUNDA WORKSPACE HANGİ ŞİRKETE KURULACAK?
 *
 * O modda tek bir aktif şirket yok ve `/clients/setup` workspace'i
 * `ctx.orgId`ye, yani kullanıcının EV şirketine kurardı. Ekran hiçbir şey
 * söylemeden yanlış şirkette bir workspace açılırdı ve kullanıcı onu
 * aradığı şirketin listesinde bulamazdı. Kurulumdan önce şirket seçiliyor
 * ve O ŞİRKETE geçiliyor.
 */
export function SirketSec({ sirketler }: { sirketler: Array<{ id: string; name: string }> }) {
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function sec(id: string): Promise<void> {
    setBekleyen(id);
    setHata(null);
    try {
      await apiFetch('/auth/switch-org', {
        method: 'POST',
        body: JSON.stringify({ organizationId: id }),
      });
      // TAM SAYFA: üst bardaki seçici oturumdan besleniyor ve
      // `router.refresh()` onu tazelemiyor.
      window.location.assign(kurulumAdresi('workspace', 'baglantilar'));
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Şirkete geçilemedi.');
      setBekleyen(null);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface px-4 py-5 sm:px-6">
      <h2 className="text-lg font-semibold text-ink">Workspace hangi şirkette olacak?</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Şu an bütün şirketleri birlikte görüyorsun. Seçtiğin şirkete geçilir ve kurulum orada
        devam eder.
      </p>
      {hata && (
        <p role="alert" className="mt-3 text-sm text-danger-strong">
          {hata}
        </p>
      )}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {sirketler.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => void sec(s.id)}
              disabled={bekleyen !== null}
              className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-2.5 text-left text-sm font-medium text-ink transition hover:border-brand hover:bg-surface-sunken disabled:opacity-50"
            >
              <span className="truncate">{s.name}</span>
              {bekleyen === s.id && <Halka />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
