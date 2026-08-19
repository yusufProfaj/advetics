'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Müşteri kartındaki eylemler.
 *
 * "Hesapları yönet" ve "Ekibi yönet" ÖNCE O MÜŞTERİYE GEÇİYOR, sonra sayfayı
 * açıyor. Daha önce düz link'lerdi ve hedef sayfa hâlâ önceki müşterinin
 * bağlamındaydı: Ege Birlik Yapı kartındaki bağlantıya tıklayınca Çiftçi
 * Grup'un hesapları açılıyordu. Hiçbir hata üretmeyen, yalnızca yanlış
 * müşteriyle çalıştıran bir akış — bu projenin en pahalı hata türü.
 *
 * Arşivleme SİLME DEĞİL: sunucu `status: 'archived'` yazıyor, satır ve
 * geçmiş veri duruyor. Arayüz bunu açıkça söylüyor, çünkü "sil" sanıp
 * tereddüt etmek de, kalıcı sanıp rahatça basmak da yanlış.
 */
export function ClientActions({
  clientId,
  clientName,
  accountCount,
}: {
  clientId: string;
  clientName: string;
  accountCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function switchTo(path: string) {
    setBusy(path);
    setError(null);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      router.push(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Müşteriye geçilemedi.');
      setBusy(null);
    }
  }

  async function archive() {
    setBusy('archive');
    setError(null);
    try {
      await apiFetch(`/clients/${clientId}`, { method: 'DELETE' });
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arşivlenemedi.');
    } finally {
      setBusy(null);
    }
  }

  return (
    /*
      İKİ SARMAL: dıştaki `mt-auto` satırı kartın altına itiyor, içteki
      `mt-4` ise içerik kartı doldurduğunda ayırıcı çizginin metne
      yapışmasını engelliyor — `mt-auto` boş alan kalmayınca 0'a düşüyor.
    */
    <div className="mt-auto">
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => switchTo('/ayarlar/baglantilar')}
          className="font-medium text-brand-strong hover:underline disabled:opacity-50"
        >
          {busy === '/ayarlar/baglantilar' ? 'Geçiliyor…' : 'Hesapları yönet'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => switchTo('/ayarlar/ekip')}
          className="font-medium text-brand-strong hover:underline disabled:opacity-50"
        >
          {busy === '/ayarlar/ekip' ? 'Geçiliyor…' : 'Ekibi yönet'}
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setConfirming((v) => !v)}
          className="ml-auto font-medium text-ink-muted hover:text-danger disabled:opacity-50"
        >
          Arşivle
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-line bg-surface-muted p-3">
          <p className="text-xs text-ink">
            <strong>{clientName}</strong> arşivlensin mi? Listeden kalkar;{' '}
            {accountCount > 0
              ? `${accountCount} reklam hesabı ve geçmiş verisi SİLİNMEZ`
              : 'verisi silinmez'}
            . Geri almak için müşterinin durumunu tekrar aktif yapmak yeterli.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={archive}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'archive' ? 'Arşivleniyor…' : 'Evet, arşivle'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
    </div>
  );
}
