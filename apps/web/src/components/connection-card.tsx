'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectionSummary } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { AccountPicker } from './account-picker';

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
  revoked: { label: 'Kaldırıldı', cls: 'text-ink-muted', dot: 'bg-slate-400' },
};

export function ConnectionCard({ connection }: { connection: ConnectionSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = STATUS[connection.status];

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
    <section className="rounded-xl border border-line bg-surface p-5">
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
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition hover:bg-surface-muted disabled:opacity-50"
          >
            {busy === 'verify' ? '…' : 'Doğrula'}
          </button>
          <button
            type="button"
            onClick={() => void run('refresh', () => apiFetch(`/connections/${connection.id}/refresh-accounts`, { method: 'POST' }))}
            disabled={busy !== null || isPending}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition hover:bg-surface-muted disabled:opacity-50"
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
        <div className="mt-3 rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm">
          <strong>Auto-Boost için ek izin bekliyor</strong>
          <p className="mt-1 text-xs text-ink-muted">
            Bağlantı çalışıyor. Eksik: {connection.missingOptionalScopes.join(', ')} — bu izinler
            Meta App Review&apos;dan onaylandıktan sonra &quot;Yeniden yetkilendir&quot; ile
            eklenebilir.
          </p>
        </div>
      )}

      {/* Reklam hesapları — AYRI BİLEŞENDE.
          Google Basic Access'ten sonra tek bağlantı 129 hesap getirdi ve düz
          liste hem aramayı hem "neyi izliyorum" sorusunu imkânsız kıldı. */}
      <AccountPicker accounts={connection.adAccounts} />

      {/* Sosyal profiller — yalnızca Meta */}
      {connection.socialProfiles.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Sayfalar & Instagram ({connection.socialProfiles.length})
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {connection.socialProfiles.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs"
              >
                <span className="text-ink-muted">
                  {p.profileType === 'instagram_business' ? 'IG' : 'FB'}
                </span>
                <span className="font-medium">{p.name}</span>
                {p.username && <span className="text-ink-muted">@{p.username}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Auto-Boost (Modül 7) bu profilleri kullanacak.
          </p>
        </div>
      )}
    </section>
  );
}
