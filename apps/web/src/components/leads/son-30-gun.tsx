'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * ═══ SON 30 GÜNÜ GETİR ═══
 *
 * Zamanlanmış tarama imleçten devam ediyor ve imleç bir kez ilerledikten
 * sonra geriye dönmüyor. Panel yeni bağlandığında, sayfa sonradan
 * atandığında ya da tarama bir dönem hiç koşmadığında kullanıcının elinde
 * tutulacak hiçbir düğme yoktu: ekran boş, sebep yok, yapılacak iş yok.
 *
 * Akıllı Boost'taki "Geçmiş içerikleri getir" ile aynı gerekçe ve aynı
 * güvence: mükerrer kayıt tehlikesi YOK, `leads_external_uniq` tekil indeksi
 * aynı kaydı ikinci kez yazmıyor.
 */
export function Son30Gun({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [bekliyor, setBekliyor] = useState(false);
  const [notlar, setNotlar] = useState<string[] | null>(null);
  const [kayitlar, setKayitlar] = useState<number | null>(null);

  async function getir(): Promise<void> {
    setBekliyor(true);
    setNotlar(null);
    setKayitlar(null);
    try {
      const r = await apiFetch<{ kayitlar: number; notlar: string[] }>('/leads/son-30-gun', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      /*
       * SONUÇ SAYFA BAZINDA YAZILIYOR. "0 kayıt" tek başına düğmenin bozuk
       * olduğunu düşündürüyor; sunucu her sayfa için sebebini söylüyor
       * (token yok, form yok, kaç form tarandı).
       */
      setKayitlar(r.kayitlar);
      setNotlar(r.notlar);
      router.refresh();
    } catch (err) {
      setNotlar([
        err instanceof ApiRequestError ? err.message : 'Kayıtlar çekilemedi.',
      ]);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void getir()}
        disabled={bekliyor}
        title="Meta’daki bütün anlık formların son 30 günlük kayıtlarını çeker"
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        {bekliyor ? 'Çekiliyor…' : 'Son 30 günü getir'}
      </button>

      {notlar && (
        <div
          role="status"
          className="max-w-md rounded-lg border border-line bg-surface-sunken px-3 py-2 text-right"
        >
          {kayitlar !== null && (
            <p className="text-[11px] font-medium text-ink">{kayitlar} yeni kayıt</p>
          )}
          <ul className="space-y-0.5 text-[11px] text-ink-muted">
            {notlar.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
