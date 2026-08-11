'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Reklam hesabı seçici.
 *
 * NEDEN AYRI BİR BİLEŞEN: Google Basic Access'ten sonra tek bir bağlantı 129
 * hesap getirdi. Düz liste 129 satır demek ve o listede iki şey birden
 * imkânsızdı — aradığını bulmak ve neyin izlendiğini görmek.
 *
 * İKİYE AYRILDI:
 *
 *   · İZLENENLER SABİT BLOK. Her zaman üstte, aramadan bağımsız. "Hangisini
 *     izliyorum" bu ürünün en sık sorulan sorusu ve cevabı kaydırma
 *     gerektirmemeli. Kota da buna bağlı: izlenen her hesap her gün
 *     sorgulanıyor.
 *
 *   · GERİ KALANI ARAMAYLA. Arama boşken hiçbir şey listelenmiyor. 129 kapalı
 *     hesabı göstermek, izlenen 2 hesabı gürültüde boğmak olurdu.
 */

export interface PickerAccount {
  id: string;
  name: string;
  externalId: string;
  currency: string | null;
  timezone: string | null;
  status: string;
  syncEnabled: boolean;
  isManager: boolean;
}

export function AccountPicker({ accounts }: { accounts: PickerAccount[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const tracked = useMemo(() => accounts.filter((a) => a.syncEnabled), [accounts]);

  /**
   * Arama sonuçları — İZLENENLER HARİÇ.
   *
   * İzlenen bir hesap zaten üstteki blokta duruyor; arama sonucunda tekrar
   * çıkması aynı hesabın ekranda iki kez görünmesi demek olurdu ve hangisine
   * tıklayacağını bilmek zorlaşırdı.
   */
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return accounts
      .filter((a) => !a.syncEnabled)
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.externalId.toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [accounts, search]);

  const untrackedCount = accounts.length - tracked.length;

  async function toggle(account: PickerAccount, next: boolean): Promise<void> {
    setBusy(account.id);
    setError(null);
    try {
      await apiFetch(`/connections/ad-accounts/${account.id}/sync`, {
        method: 'PATCH',
        body: JSON.stringify({ syncEnabled: next }),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Hesap durumu değiştirilemedi.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4">
      {/* İZLENENLER — sabit blok */}
      <div className="rounded-lg border border-line bg-surface-sunken p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">
            İzlenen hesaplar
          </h4>
          <span className="text-[11px] text-ink-muted">
            {tracked.length} / {accounts.length}
          </span>
        </div>

        {tracked.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            Henüz hiçbir hesap izlenmiyor. Aşağıdan arayıp <strong>İzle</strong> de.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {tracked.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md bg-surface px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {a.externalId}
                    {a.currency && ` · ${a.currency}`}
                    {a.timezone && ` · ${a.timezone}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggle(a, false)}
                  disabled={busy !== null || isPending}
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-50"
                >
                  {busy === a.id ? '…' : 'Bırak'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {tracked.length > 0 && (
          // İZLEMEYİ BIRAKMANIN SONUCU ÖNCEDEN SÖYLENİYOR. Kullanıcı "Bırak"a
          // bastığında panelden veri kaybolacak ve sebebini bilmeden bunu
          // yaşamamalı.
          <p className="mt-2 text-[11px] text-ink-muted">
            İzlemeyi bıraktığın hesap panelden ve raporlardan çıkar. Verisi silinmez —
            yeniden izlemeye alırsan geçmişiyle geri gelir.
          </p>
        )}
      </div>

      {/* ARAMA */}
      <div className="mt-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Hesap ekle
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${untrackedCount} izlenmeyen hesap arasında ara — ad ya da kimlik`}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </label>

        {search.trim() === '' ? (
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Aramaya başla. İzlenen her hesap her gün API kotası tüketiyor, bu yüzden
            keşfedilen hesaplar kapalı geliyor.
          </p>
        ) : results.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Eşleşen hesap yok.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {results.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {a.name}
                    {a.isManager && (
                      <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted">
                        yönetici hesabı
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {a.externalId}
                    {a.currency && ` · ${a.currency}`} · {a.status}
                  </p>
                </div>

                {/* YÖNETİCİ (MCC) HESAPLARI REKLAM YAYINLAMIYOR.
                    İzlemek boş bir senkronizasyon turu ve boşa kota demek. */}
                <button
                  type="button"
                  onClick={() => void toggle(a, true)}
                  disabled={busy !== null || isPending || a.isManager}
                  title={a.isManager ? 'Yönetici hesapları reklam yayınlamaz' : undefined}
                  className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition disabled:opacity-40"
                >
                  {busy === a.id ? '…' : 'İzle'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {search.trim() !== '' && results.length === 25 && (
          // SESSİZ KESME YOK. 25'te duruyoruz ama bunu söylüyoruz; aksi hâlde
          // kullanıcı aradığı hesabın var olmadığını sanabilir.
          <p className="mt-1.5 text-[11px] text-ink-muted">
            İlk 25 sonuç gösteriliyor — aramayı daralt.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
