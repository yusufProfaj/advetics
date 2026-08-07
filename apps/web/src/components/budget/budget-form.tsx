'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BudgetRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Bütçe tanımlama / güncelleme.
 *
 * TUTAR KULLANICI BİRİMİNDE giriliyor ve micros çevrimi SUNUCUDA yapılıyor.
 * Burada çevirmek, ondalık ayırıcı hatasını (Türkçe arayüzde "45.000,50")
 * ve kayan nokta kaymasını istemciye dağıtmak olurdu.
 *
 * Alan `type="text"`, `type="number"` DEĞİL: sayı girdisi Türkçe klavyede
 * virgülü sessizce yutuyor ve "1500,75" tarayıcıya göre "1500" ya da geçersiz
 * oluyor. Doğrulama sunucuda, biçim serbest.
 */
export function BudgetForm({
  clientId,
  adAccountId,
  adAccountName,
  month,
  existing,
  currency,
}: {
  clientId: string;
  adAccountId: string | null;
  adAccountName: string | null;
  month: string;
  existing: BudgetRecord | null;
  currency: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(existing ? microsToInput(existing.amountMicros) : '');
  const [dailyCap, setDailyCap] = useState(
    existing?.dailyCapMicros ? microsToInput(existing.dailyCapMicros) : '',
  );
  const [alertPct, setAlertPct] = useState(String(existing?.alertThresholdPct ?? 80));
  const [autoPause, setAutoPause] = useState(
    existing?.autoPauseAtPct === null || existing?.autoPauseAtPct === undefined
      ? ''
      : String(existing.autoPauseAtPct),
  );
  const [note, setNote] = useState(existing?.note ?? '');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/budgets', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          adAccountId,
          month,
          amount: amount.trim(),
          ...(dailyCap.trim() ? { dailyCap: dailyCap.trim() } : {}),
          alertThresholdPct: Number(alertPct),
          ...(autoPause.trim() ? { autoPauseAtPct: Number(autoPause) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      setOpen(false);
      // Pacing sunucuda hesaplanıyor; sayfayı tazelemek tek doğru yol.
      // İstemcide yeniden hesaplamak, iki ayrı pacing tanımı demek olurdu.
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Bütçe kaydedilemedi. Tekrar deneyin.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/budgets/${existing.id}`, { method: 'DELETE' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Bütçe silinemedi.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken"
      >
        {existing ? 'Düzenle' : 'Bütçe tanımla'}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 text-left shadow-sm">
      <h3 className="text-sm font-semibold text-ink">
        {adAccountName ?? 'Müşteri geneli'} · {monthLabel(month)}
      </h3>
      {adAccountId === null && (
        <p className="mt-1 text-[11px] text-ink-muted">
          Şemsiye bütçe: müşterinin tüm reklam hesaplarının toplamı bu tutarla karşılaştırılır.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={`Aylık bütçe${currency ? ` (${currency})` : ''}`}>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="45000"
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </Field>

        <Field label="Günlük limit (opsiyonel)">
          <input
            type="text"
            inputMode="decimal"
            value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)}
            placeholder="boş = limit yok"
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </Field>

        <Field label="Uyarı eşiği (%)">
          <input
            type="number"
            min={1}
            max={200}
            value={alertPct}
            onChange={(e) => setAlertPct(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </Field>

        <Field label="Otomatik durdurma (%)">
          <input
            type="number"
            min={1}
            max={200}
            value={autoPause}
            onChange={(e) => setAutoPause(e.target.value)}
            placeholder="boş = kapalı"
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
          {/* Alan kaydediliyor ama HENÜZ UYGULANMIYOR. Kullanıcının açık
              bıraktığı bir korumanın çalıştığını sanması, hiç olmamasından
              kötü — o yüzden burada yazıyor. */}
          <p className="mt-1 text-[11px] text-ink-muted">
            Kural motoru (Modül 5) yazılana kadar yalnızca kaydediliyor, kampanya durdurulmuyor.
          </p>
        </Field>
      </div>

      <Field label="Not (opsiyonel)">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          className="mt-3 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
        />
      </Field>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !amount.trim()}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50"
        >
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken"
        >
          Vazgeç
        </button>
        {existing && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
          >
            Bütçeyi sil
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Micros → düzenlenebilir metin.
 *
 * Kuruş sıfırsa gösterilmiyor: "45000" yazan kullanıcı formu yeniden açtığında
 * "45000,00" görmek istemiyor. Kuruş varsa korunuyor.
 */
function microsToInput(micros: string): string {
  const value = BigInt(micros);
  const whole = value / 1_000_000n;
  const cents = (value % 1_000_000n) / 10_000n;
  return cents === 0n ? whole.toString() : `${whole},${cents.toString().padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [y, m] = [month.slice(0, 4), month.slice(5, 7)];
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
