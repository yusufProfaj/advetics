'use client';

import { useState } from 'react';
import type { Platform, ProviderAvailability } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

const LABELS: Record<Platform, string> = {
  meta: 'Meta (Facebook / Instagram)',
  google: 'Google Ads',
};

export function ConnectButtons({ availability }: { availability: ProviderAvailability[] }) {
  const [pending, setPending] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(platform: Platform) {
    setError(null);
    setPending(platform);
    try {
      const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>(
        '/connections/authorize',
        {
          method: 'POST',
          body: JSON.stringify({ platform, redirectTo: '/ayarlar/baglantilar' }),
        },
      );
      // Yönlendirmeyi tarayıcı yapmalı: fetch üzerinden gelen bir 302,
      // platformun izin ekranını görünmez kılar.
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Bağlantı başlatılamadı');
      setPending(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {availability.map((a) => (
          <div key={a.platform} className="rounded-lg border border-line p-4">
            <p className="text-sm font-medium">{LABELS[a.platform]}</p>

            {a.configured ? (
              <button
                type="button"
                onClick={() => void connect(a.platform)}
                disabled={pending !== null}
                className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === a.platform ? 'Yönlendiriliyor…' : 'Bağlan'}
              </button>
            ) : (
              <div className="mt-3">
                <button
                  type="button"
                  disabled
                  title={`Eksik yapılandırma: ${a.missingConfig.join(', ')}`}
                  className="w-full cursor-not-allowed rounded-lg border border-line px-3 py-2 text-sm text-ink-muted opacity-60"
                >
                  Yapılandırılmadı
                </button>
                <p className="mt-2 text-xs text-ink-muted">
                  Eksik: {a.missingConfig.join(', ')}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
