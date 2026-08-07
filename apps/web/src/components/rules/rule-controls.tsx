'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RuleRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { RuleEditor } from './rule-editor';

/**
 * Bir kuralın eylem düğmeleri: şimdi çalıştır, canlıya al, düzenle, sil.
 *
 * CANLIYA ALMA ONAY İSTİYOR. Tek tıkla canlıya geçen bir düğme, `rule.activate`
 * yetkisini ayrı tutmanın anlamını zayıflatırdı: yetki sahibi olmak niyet
 * etmek demek değil. Onay metni kuralın ne yapacağını tekrar söylüyor.
 */
export function RuleControls({
  rule,
  clientId,
  accounts,
  canActivate,
}: {
  rule: RuleRecord;
  clientId: string;
  accounts: Array<{ id: string; name: string }>;
  canActivate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function call(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  }

  async function runNow(): Promise<void> {
    setResult(null);
    await call('run', async () => {
      const res = await apiFetch<{ matchedCount: number; actionCount: number }>(
        `/rules/${rule.id}/run`,
        { method: 'POST' },
      );
      setResult(
        `${res.matchedCount} varlık koşulu sağladı · ${res.actionCount} aksiyon${
          rule.dryRun ? ' (prova — hiçbir şeye dokunulmadı)' : ' uygulandı'
        }`,
      );
    });
  }

  if (editing) {
    return (
      <RuleEditor
        clientId={clientId}
        accounts={accounts}
        existing={rule}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={runNow}
          disabled={busy !== null}
          className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
        >
          {busy === 'run' ? 'Çalışıyor…' : 'Şimdi çalıştır'}
        </button>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Düzenle
        </button>

        {canActivate &&
          (rule.dryRun ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
              className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Canlıya al
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                call('mode', async () => {
                  await apiFetch(`/rules/${rule.id}/mode`, {
                    method: 'PATCH',
                    body: JSON.stringify({ dryRun: true }),
                  });
                })
              }
              disabled={busy !== null}
              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900"
            >
              Provaya al
            </button>
          ))}

        <button
          type="button"
          onClick={() =>
            call('delete', async () => {
              await apiFetch(`/rules/${rule.id}`, { method: 'DELETE' });
            })
          }
          disabled={busy !== null}
          className="ml-auto rounded-lg px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Sil
        </button>
      </div>

      {confirming && (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-semibold">Bu kural müşterinin hesabında gerçekten çalışacak.</p>
          <p className="mt-1">
            Bundan sonra saatlik değerlendirmede eşleşen varlıklara{' '}
            <strong>
              {rule.action.type === 'pause'
                ? 'duraklatma'
                : rule.action.type === 'resume'
                  ? 'yeniden başlatma'
                  : rule.action.type === 'adjust_budget'
                    ? 'bütçe değişikliği'
                    : 'bildirim'}
            </strong>{' '}
            uygulanacak. Önce &quot;Şimdi çalıştır&quot; ile provada ne olacağını görmeni
            öneririm.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() =>
                call('mode', async () => {
                  await apiFetch(`/rules/${rule.id}/mode`, {
                    method: 'PATCH',
                    body: JSON.stringify({ dryRun: false }),
                  });
                  setConfirming(false);
                })
              }
              disabled={busy !== null}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white"
            >
              Anladım, canlıya al
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-amber-900"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink">{result}</p>
      )}
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}

/** Yeni kural düğmesi — editörü açıp kapatıyor. */
export function NewRuleButton({
  clientId,
  accounts,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
      >
        Yeni kural
      </button>
    );
  }
  return <RuleEditor clientId={clientId} accounts={accounts} onDone={() => setOpen(false)} />;
}
