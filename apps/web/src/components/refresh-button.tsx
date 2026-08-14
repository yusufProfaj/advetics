'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface RefreshResult {
  accountCount: number;
  queued: number;
  skipped: number;
}

/**
 * "Şimdi güncelle" — panelden senkronizasyon tetikler.
 *
 * İŞ KUYRUĞA KONUYOR, BEKLENMİYOR. Senkronizasyon hesaba göre saniyeler ile
 * dakikalar arasında sürüyor; isteği açık tutup sonucu beklemek hem tarayıcı
 * zaman aşımına düşerdi hem de kullanıcıyı ekrana kilitlerdi.
 *
 * Bunun bedeli şu: düğmeye basınca veri ANINDA gelmiyor. Bu yüzden mesaj
 * "güncellendi" DEMİYOR — "kuyruğa alındı" diyor ve kaç iş olduğunu yazıyor.
 * "Güncellendi" deyip eski veriyi göstermek, kullanıcının taze sandığı bayat
 * veriye bakması demek.
 */
export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<RefreshResult>('/sync/refresh', { method: 'POST' });

      // Atlanan iş SESSİZ KALMAMALI. Düğmeye ikinci kez basan biri "bir şey
      // olmadı" diye düşünüyor; oysa iş zaten kuyrukta ve tekrar eklemek
      // kotayı ikinci kez harcamak olurdu.
      const parts = [`${res.accountCount} hesap`, `${res.queued} iş kuyruğa alındı`];
      if (res.skipped > 0) parts.push(`${res.skipped} iş zaten kuyruktaydı`);
      setMessage(parts.join(' · '));

      // Sayfayı hemen tazelemek işe yaramaz (iş henüz çalışmadı); birkaç
      // saniye sonra tazelemek ilk sonuçları yakalıyor.
      setTimeout(() => router.refresh(), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncelleme başlatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Başlatılıyor…' : 'Şimdi güncelle'}
      </button>
      {message && <span className="text-[11px] text-ink-muted">{message}</span>}
      {error && (
        <span role="alert" className="max-w-xs text-right text-[11px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
