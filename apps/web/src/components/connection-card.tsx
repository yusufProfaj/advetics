'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectionSummary } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

const PLATFORM_LABEL: Record<string, string> = {
  meta: 'Meta',
  google: 'Google Ads',
};

const STATUS: Record<
  ConnectionSummary['status'],
  { label: string; cls: string; dot: string }
> = {
  active: { label: 'Aktif', cls: 'text-emerald-700', dot: 'bg-emerald-500' },
  needs_reauth: { label: 'Yeniden yetkilendirme gerekli', cls: 'text-amber-700', dot: 'bg-amber-500' },
  error: { label: 'Hata', cls: 'text-red-700', dot: 'bg-red-500' },
  revoked: { label: 'Kaldırıldı', cls: 'text-[var(--text-muted)]', dot: 'bg-slate-400' },
};

export function ConnectionCard({ connection }: { connection: ConnectionSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = STATUS[connection.status];
  const syncedCount = connection.adAccounts.filter((a) => a.syncEnabled).length;

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  }

  async function reauthorize() {
    const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>(
      `/connections/${connection.id}/reauthorize?platform=${connection.platform}`,
      { method: 'POST' },
    );
    window.location.href = authorizeUrl;
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
            <h3 className="text-sm font-semibold">
              {PLATFORM_LABEL[connection.platform] ?? connection.platform} ·{' '}
              {connection.accountLabel}
            </h3>
          </div>
          <p className={`mt-1 text-xs ${status.cls}`}>
            {status.label}
            {connection.lastErrorCode ? ` (kod ${connection.lastErrorCode})` : ''}
            {connection.lastVerifiedAt
              ? ` · son doğrulama ${new Date(connection.lastVerifiedAt).toLocaleString('tr-TR')}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run('verify', () => apiFetch(`/connections/${connection.id}/verify`, { method: 'POST' }))}
            disabled={busy !== null || isPending}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            {busy === 'verify' ? '…' : 'Doğrula'}
          </button>
          <button
            type="button"
            onClick={() => void run('refresh', () => apiFetch(`/connections/${connection.id}/refresh-accounts`, { method: 'POST' }))}
            disabled={busy !== null || isPending}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            {busy === 'refresh' ? '…' : 'Hesapları yenile'}
          </button>
          {(connection.status === 'needs_reauth' ||
            connection.missingScopes.length > 0 ||
            connection.missingOptionalScopes.length > 0) && (
            <button
              type="button"
              onClick={() => void run('reauth', reauthorize)}
              disabled={busy !== null || isPending}
              className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'reauth' ? '…' : 'Yeniden yetkilendir'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!confirm('Bağlantı kaldırılacak ve tüm senkronizasyon duracak. Geçmiş veriler korunur. Devam?')) return;
              void run('disconnect', () => apiFetch(`/connections/${connection.id}/disconnect`, { method: 'POST' }));
            }}
            disabled={busy !== null || isPending}
            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            {busy === 'disconnect' ? '…' : 'Kaldır'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Çekirdek izin eksiği = bağlantı iş görmez → uyarı */}
      {connection.missingScopes.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
          <strong>Eksik çekirdek izinler:</strong> {connection.missingScopes.join(', ')}
          <p className="mt-1 text-xs">
            Bu izinler olmadan senkronizasyon ve otomasyon çalışmaz.
          </p>
        </div>
      )}

      {/* Özellik izin eksiği = bağlantı çalışır, özellik kapalı → bilgi.
          Meta App Review izinleri tek tek onayladığı için aşamalı başvuru
          normaldir; bunu hata gibi göstermek kullanıcıyı yanıltır. */}
      {connection.missingOptionalScopes.length > 0 && connection.missingScopes.length === 0 && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
          <strong>Auto-Boost için ek izin bekliyor</strong>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Bağlantı çalışıyor. Eksik: {connection.missingOptionalScopes.join(', ')} — bu izinler
            Meta App Review&apos;dan onaylandıktan sonra &quot;Yeniden yetkilendir&quot; ile
            eklenebilir.
          </p>
        </div>
      )}

      {/* Reklam hesapları */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Reklam hesapları ({syncedCount}/{connection.adAccounts.length} izleniyor)
          </h4>
        </div>

        {connection.adAccounts.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Hesap bulunamadı. Google&apos;da bu genelde developer token&apos;ın Basic Access
            onayı olmadığını gösterir.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {connection.adAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.name}
                    {a.isManager && (
                      <span className="ml-2 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                        yönetici hesabı
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {a.externalId} · {a.currency} · {a.timezone} · {a.status}
                  </p>
                </div>

                {/* Yönetici (MCC) hesapları reklam yayınlamaz — izlemek anlamsız. */}
                <label className="flex shrink-0 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={a.syncEnabled}
                    disabled={busy !== null || isPending || a.isManager}
                    onChange={(e) =>
                      void run(`sync-${a.id}`, () =>
                        apiFetch(`/connections/ad-accounts/${a.id}/sync`, {
                          method: 'PATCH',
                          body: JSON.stringify({ syncEnabled: e.target.checked }),
                        }),
                      )
                    }
                    className="h-4 w-4 accent-[var(--brand-primary)] disabled:opacity-40"
                  />
                  <span className={a.isManager ? 'text-[var(--text-muted)]' : ''}>İzle</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Her izlenen hesap API kotası tüketir. Keşfedilen hesaplar bu yüzden kapalı başlar.
        </p>
      </div>

      {/* Sosyal profiller — yalnızca Meta */}
      {connection.socialProfiles.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Sayfalar & Instagram ({connection.socialProfiles.length})
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {connection.socialProfiles.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs"
              >
                <span className="text-[var(--text-muted)]">
                  {p.profileType === 'instagram_business' ? 'IG' : 'FB'}
                </span>
                <span className="font-medium">{p.name}</span>
                {p.username && <span className="text-[var(--text-muted)]">@{p.username}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Auto-Boost (Modül 7) bu profilleri kullanacak.
          </p>
        </div>
      )}
    </section>
  );
}
