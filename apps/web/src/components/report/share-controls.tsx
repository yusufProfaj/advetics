'use client';

import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Paylaşım linki üretme.
 *
 * Ham token yalnızca ÜRETİM ANINDA bir kez dönüyor (sunucuda hash'i saklanıyor),
 * bu yüzden ekranda gösterilip kopyalanması gerekiyor. Sayfa yenilenince
 * kaybolduğu açıkça yazıyor — kullanıcı "sonra bakarım" diye kapatmasın.
 */
export function ShareControls({
  clientId,
  from,
  to,
  hasData,
}: {
  clientId: string;
  from: string;
  to: string;
  hasData: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<string>('');

  async function createLink() {
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await apiFetch<{ token: string }>('/reports/shares', {
        method: 'POST',
        body: JSON.stringify({
          // `templateId` GÖNDERİLMİYOR: sunucu müşteriye özel şablonu bulup,
          // yoksa tüm bölümleri içeren varsayılanı oluşturuyor. İlk raporu
          // göndermek için önce şablon kurmak zorunda kalmıyoruz.
          clientId,
          from,
          to,
          ...(expiresInDays ? { expiresInDays: Number(expiresInDays) } : {}),
        }),
      });
      setLink(`${window.location.origin}/r/${res.token}`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Link oluşturulamadı. Tekrar deneyin.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Müşteriyle paylaş</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Oturum gerektirmeyen gizli bağlantı. Tarih aralığı sabitlenir — müşteri
            sonradan açtığında aynı sayıları görür.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            Süre
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
            >
              <option value="">Süresiz</option>
              <option value="7">7 gün</option>
              <option value="30">30 gün</option>
              <option value="90">90 gün</option>
            </select>
          </label>
          <button
            type="button"
            onClick={createLink}
            disabled={busy || !hasData}
            title={hasData ? undefined : 'Bu dönemde veri yok'}
            className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Oluşturuluyor…' : 'Bağlantı oluştur'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
      )}

      {link && (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-900">
            Bağlantı hazır — bu bağlantı bir daha gösterilmeyecek, şimdi kopyalayın.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-emerald-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
            >
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
