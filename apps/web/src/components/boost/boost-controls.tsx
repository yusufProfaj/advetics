'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BoostRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';

/**
 * Aday boost'un onay düğmeleri.
 *
 * ONAY PARA TAAHHÜDÜ ve düğme bunu söylüyor: "Onayla" değil, "1.500 ₺ onayla".
 * Tutarı düğmenin dışına yazmak, onay veren kişinin onu okumadan
 * tıklayabileceği anlamına gelirdi ve bu ekranın tek işi o kararı bilinçli
 * kılmak.
 */
export function BoostDecision({
  boost,
  currency,
}: {
  boost: BoostRecord;
  currency: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/boosts/${boost.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  }

  if (boost.status !== 'candidate') return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => decide(true)}
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {formatMoney(boost.totalBudgetMicros, currency)} onayla
        </button>
        <button
          type="button"
          onClick={() => decide(false)}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
        >
          Reddet
        </button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/**
 * Onaylanmışları platformda oluştur.
 *
 * AYRI BİR DÜĞME, onayın otomatik devamı değil. Zamanlanmış iş bunu günde iki
 * kez zaten yapıyor; bu düğme "şimdi olsun" diyen kullanıcı için. Sonucu
 * açıkça yazıyor, çünkü başarısızlık sessiz olmamalı.
 */
export function CreateApprovedButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ created: number; failed: number }>(
        `/boosts/create-approved?clientId=${clientId}`,
        { method: 'POST' },
      );
      setResult(
        res.failed > 0
          ? `${res.created} boost oluşturuldu, ${res.failed} başarısız — sebepleri aşağıda.`
          : `${res.created} boost oluşturuldu.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
      >
        {busy ? 'Oluşturuluyor…' : 'Onaylananları şimdi oluştur'}
      </button>
      {result && <p className="text-xs text-ink-muted">{result}</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/** Kuralı şimdi çalıştır — aday üretir, platforma dokunmaz. */
export function RunBoostRuleButton({ ruleId }: { ruleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch<{
        evaluated: number;
        created: number;
        cappedOut: number;
        notes: string[];
      }>(`/boosts/rules/${ruleId}/run`, { method: 'POST' });
      setResult(
        [
          `${res.evaluated} gönderi incelendi`,
          `${res.created} aday`,
          // TAVANA TAKILANLAR SESSİZ GEÇİLMİYOR: "0 aday" ile "3 aday ama
          // tavan doldu" tamamen farklı işler.
          res.cappedOut > 0 ? `${res.cappedOut} tanesi aylık tavana takıldı` : null,
          ...res.notes,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      router.refresh();
    } catch {
      setResult('Kural çalıştırılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
      >
        {busy ? 'Çalışıyor…' : 'Şimdi çalıştır'}
      </button>
      {result && <p className="text-[11px] text-ink-muted">{result}</p>}
    </div>
  );
}
