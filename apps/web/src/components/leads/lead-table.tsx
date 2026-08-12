'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  LEAD_STATUSES,
  LEAD_STATUS_META,
  type LeadFormRecord,
  type LeadListResult,
  type LeadRecord,
  type LeadStatus,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';

/**
 * Potansiyel müşteri listesi.
 *
 * DURUM DEĞİŞİKLİĞİ TEK TIKLA ve satırdan çıkmadan. Ajansın günlük işi bu:
 * ara, konuş, durumu ilerlet. Detay sayfasına gidip dönmek gereken bir akış,
 * 40 kayıtta 80 sayfa yüklemesi demek.
 *
 * DEĞİŞİKLİK ANINDA GÖRÜNÜYOR (iyimser güncelleme) ama hata olursa GERİ
 * ALINIYOR. Sunucuyu beklemek her tıklamada yarım saniyelik donma demek;
 * hatayı yutmak ise ajansın "arandı" işaretlediği kaydın hâlâ "yeni" olması.
 */
export function LeadTable({
  initial,
  clientId,
  forms,
  activeStatus,
  activeSearch,
  activeFormId,
  canWrite,
}: {
  initial: LeadListResult;
  clientId: string;
  forms: LeadFormRecord[];
  activeStatus: string | null;
  activeSearch: string;
  activeFormId: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<LeadRecord[]>(initial.rows);
  const [search, setSearch] = useState(activeSearch);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  function navigate(patch: Record<string, string | null>): void {
    const params = new URLSearchParams();
    params.set('musteri', clientId);
    const merged: Record<string, string | null> = {
      durum: activeStatus,
      ara: activeSearch || null,
      form: activeFormId,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    startTransition(() => router.push(`/potansiyel-musteriler?${params.toString()}`));
  }

  async function setStatus(lead: LeadRecord, status: LeadStatus): Promise<void> {
    const previous = lead.status;
    setBusy(lead.id);
    setError(null);
    // İyimser: değişiklik anında görünüyor.
    setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, status } : r)));
    try {
      await apiFetch(`/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      // GERİ AL. Hatayı yutmak, ajansın "arandı" sandığı kaydın hâlâ "yeni"
      // olması demek — ve o kişi bir daha aranmaz.
      setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, status: previous } : r)));
      setError(err instanceof ApiRequestError ? err.message : 'Durum değiştirilemedi.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* DURUM HATTI — rozetler filtreden bağımsız sayıyor. */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => navigate({ durum: null })}
          className={chip(activeStatus === null)}
        >
          Tümü{' '}
          <span className="opacity-60">
            {Object.values(initial.byStatus).reduce((a, b) => a + b, 0)}
          </span>
        </button>
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => navigate({ durum: s })}
            title={LEAD_STATUS_META[s].hint}
            className={chip(activeStatus === s)}
          >
            {LEAD_STATUS_META[s].label}{' '}
            <span className="opacity-60">{initial.byStatus[s]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ ara: search.trim() || null });
          }}
          className="flex-1"
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad, e-posta ya da telefonda ara"
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </form>

        {forms.length > 0 && (
          <select
            value={activeFormId ?? ''}
            onChange={(e) => navigate({ form: e.target.value || null })}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Tüm formlar</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {rows.map((lead) => (
            <li key={lead.id}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(open === lead.id ? null : lead.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-ink">
                    {lead.fullName ?? lead.email ?? lead.phone}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {[lead.phone, lead.email].filter(Boolean).join(' · ')}
                    {lead.leadFormName && ` · ${lead.leadFormName}`}
                    {' · '}
                    {formatRelative(lead.submittedAt)}
                    {/* KAYIT NEREDEN GELDİ — teşhis için, meraktan değil. */}
                    {lead.source === 'reconcile' && (
                      <span className="ml-1 text-amber-700">· taramayla geldi</span>
                    )}
                  </p>
                </button>

                {canWrite ? (
                  <select
                    value={lead.status}
                    disabled={busy !== null || isPending}
                    onChange={(e) => void setStatus(lead, e.target.value as LeadStatus)}
                    className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand disabled:opacity-50"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 rounded bg-surface-sunken px-2 py-1 text-[11px] text-ink-muted">
                    {LEAD_STATUS_META[lead.status].label}
                  </span>
                )}
              </div>

              {open === lead.id && (
                <div className="border-t border-line/60 bg-surface-sunken px-4 py-3">
                  <dl className="grid gap-1.5 sm:grid-cols-2">
                    {lead.fields.map((f, i) => (
                      <div key={i}>
                        <dt className="text-[11px] uppercase tracking-wide text-ink-muted">
                          {f.label}
                        </dt>
                        <dd className="text-sm text-ink">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {lead.campaignName && (
                    <p className="mt-2 text-[11px] text-ink-muted">
                      Kampanya: {lead.campaignName}
                    </p>
                  )}
                  {lead.note && (
                    <p className="mt-2 rounded-md bg-surface px-2.5 py-1.5 text-xs text-ink">
                      {lead.note}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* SESSİZ KESME YOK: kaç kayıt gösterildiği ve toplamın kaç olduğu yazıyor. */}
      <p className="text-[11px] text-ink-muted">
        {rows.length} kayıt gösteriliyor
        {initial.total > rows.length && ` · toplam ${initial.total}. Aramayı daralt.`}
      </p>
    </div>
  );
}

function chip(active: boolean): string {
  return `rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
    active ? 'border-brand bg-brand-soft text-ink' : 'border-line text-ink-muted hover:bg-surface-sunken'
  }`;
}
