'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SocialProfileSummary } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import type { PickerClient } from './account-picker';

/**
 * Facebook sayfaları ve Instagram hesapları — havuz modeli.
 *
 * Sayfa da reklam hesabı gibi AJANSA ait ve müşteriye ATANIYOR. Atanmamış
 * sayfa senkronize edilmiyor, üzerine form kurulamıyor ve o sayfadan gelen
 * lead bildirimi YAZILAMIYOR — kaydın hangi markaya ait olduğu bilinmiyor.
 *
 * Bu yüzden atanmamışlar listenin ÜSTÜNDE ve sayıyla duruyor: reklam
 * hesaplarında havuz 157 satır olduğu için aramaya gömüldü, sayfalarda ise
 * onlarla ölçülüyor ve gizlemek "sayfam neden çalışmıyor" sorusunu doğururdu.
 */
export function SocialProfileList({
  profiles,
  clients,
  canManage,
}: {
  profiles: SocialProfileSummary[];
  clients: PickerClient[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pooled = useMemo(() => profiles.filter((p) => p.clientId === null), [profiles]);
  const assigned = useMemo(() => profiles.filter((p) => p.clientId !== null), [profiles]);

  async function assign(profile: SocialProfileSummary, clientId: string | null): Promise<void> {
    setBusy(profile.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ leftBehindForms: number }>(
        `/connections/social-profiles/${profile.id}/client`,
        { method: 'PATCH', body: JSON.stringify({ clientId }) },
      );
      /**
       * GEÇMİŞ ESKİ MÜŞTERİDE KALIYOR ve bu SÖYLENİYOR.
       *
       * Sayfanın müşterisi değişince ona bağlı formlar ve toplanmış kayıtlar
       * taşınmıyor — bir markanın topladığı potansiyel müşteriler başka bir
       * markanın CRM'ine geçemez. Söylenmezse kullanıcı formlarını kaybettiğini
       * sanır.
       */
      if (res.leftBehindForms > 0) {
        setNotice(
          `${res.leftBehindForms} form ve toplanmış kayıtları ESKİ müşteride kaldı — ` +
            'geçmiş veri taşınmıyor. Yeni müşteri için formu yeniden oluşturman gerekir.',
        );
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Sayfa atanamadı.');
    } finally {
      setBusy(null);
    }
  }

  function clientSelect(p: SocialProfileSummary) {
    if (!canManage) {
      return <span className="text-[11px] text-ink-muted">{p.clientName ?? 'havuzda'}</span>;
    }
    return (
      <select
        value={p.clientId ?? ''}
        disabled={busy !== null || isPending}
        onChange={(e) => void assign(p, e.target.value === '' ? null : e.target.value)}
        className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand disabled:opacity-40"
      >
        <option value="">— havuzda —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }

  function row(p: SocialProfileSummary) {
    return (
      <li key={p.id} className="flex items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted">
            {p.profileType === 'instagram_business' ? 'IG' : 'FB'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{p.name}</p>
            {p.username && <p className="text-[11px] text-ink-muted">@{p.username}</p>}
          </div>
        </div>
        {clientSelect(p)}
      </li>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Sayfalar &amp; Instagram ({profiles.length})
        </h4>
        {pooled.length > 0 && (
          <span className="text-[11px] text-amber-700">{pooled.length} atanmamış</span>
        )}
      </div>

      {pooled.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
          <p className="text-xs text-amber-900">
            <strong>Atanmamış sayfalar</strong> — bunlardan gelen potansiyel müşteri
            kaydı YAZILAMAZ (hangi markaya ait olduğu bilinmiyor) ve organik gönderi
            senkronizasyonu çalışmaz.
          </p>
          <ul className="mt-1 divide-y divide-amber-200/70">{pooled.map(row)}</ul>
        </div>
      )}

      {assigned.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line px-2.5">
          {assigned.map(row)}
        </ul>
      )}

      <p className="mt-2 text-xs text-ink-muted">
        Lead formları, reklam yayını ve Auto-Boost bu sayfaları kullanıyor.
      </p>

      {notice && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
