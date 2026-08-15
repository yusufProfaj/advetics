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
 * ÜÇE AYRILDI:
 *
 *   · İZLENENLER SABİT BLOK. Her zaman üstte, aramadan bağımsız. "Hangisini
 *     izliyorum" bu ürünün en sık sorulan sorusu ve cevabı kaydırma
 *     gerektirmemeli. Kota da buna bağlı: izlenen her hesap her gün
 *     sorgulanıyor.
 *
 *   · ATANMIŞ AMA İZLENMEYENLER. Bir müşteriye ait olduğu bilinen, yani ajansın
 *     gerçekten ilgilendiği hesaplar. Sayıları onlarla ölçülüyor, aramaya
 *     gerek yok.
 *
 *   · HAVUZ, YALNIZCA ARAMAYLA. Ajansın erişebildiği geri kalan her şey —
 *     Meta'da 157, Google'da 127 hesap. Arama boşken hiçbiri listelenmiyor;
 *     göstermek, ilgilenilen üç hesabı gürültüde boğmak olurdu.
 *
 * ATAMA VE İZLEME AYRI İKİ KARAR ve sırası var: atanmamış hesap senkronize
 * edilmiyor (`client_id`'si NULL bir iş satırını RLS kimseye göstermez ve iş
 * sessizce kaybolur). Bu yüzden "İzle" düğmesi atama yapılmadan AÇILMIYOR ve
 * sebebi satırın yanında yazıyor.
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
  clientId: string | null;
  clientName: string | null;
}

export interface PickerClient {
  id: string;
  name: string;
}

export function AccountPicker({
  accounts,
  clients,
  canManage,
}: {
  accounts: PickerAccount[];
  clients: PickerClient[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const tracked = useMemo(() => accounts.filter((a) => a.syncEnabled), [accounts]);

  /** Müşterisi olan ama izlenmeyen hesaplar — ajansın ilgi alanı. */
  const assignedIdle = useMemo(
    () => accounts.filter((a) => !a.syncEnabled && a.clientId !== null),
    [accounts],
  );

  /**
   * Arama sonuçları — İZLENEN VE ATANMIŞ OLANLAR HARİÇ.
   *
   * İkisi de yukarıdaki bloklarda duruyor; arama sonucunda tekrar çıkmaları
   * aynı hesabın ekranda iki kez görünmesi demek olurdu.
   */
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return accounts
      .filter((a) => !a.syncEnabled && a.clientId === null)
      .filter((a) => a.name.toLowerCase().includes(q) || a.externalId.toLowerCase().includes(q))
      .slice(0, 25);
  }, [accounts, search]);

  const pooledCount = accounts.filter((a) => a.clientId === null).length;

  async function run(accountId: string, fn: () => Promise<unknown>, fallback: string) {
    setBusy(accountId);
    setError(null);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : fallback);
    } finally {
      setBusy(null);
    }
  }

  function toggle(account: PickerAccount, next: boolean): void {
    void run(
      account.id,
      () =>
        apiFetch(`/connections/ad-accounts/${account.id}/sync`, {
          method: 'PATCH',
          body: JSON.stringify({ syncEnabled: next }),
        }),
      'Hesap durumu değiştirilemedi.',
    );
  }

  function assign(account: PickerAccount, clientId: string | null): void {
    void run(
      account.id,
      () =>
        apiFetch(`/connections/ad-accounts/${account.id}/client`, {
          method: 'PATCH',
          body: JSON.stringify({ clientId }),
        }),
      'Hesap atanamadı.',
    );
  }

  /**
   * Müşteri seçici.
   *
   * Yönetici (MCC) hesaplarında kapalı: reklam yayınlamıyorlar, atamak boş bir
   * senkronizasyon turu ve boşa kota demek. API de reddediyor — burada
   * kapatmak, kullanıcıyı hataya gitmeden önce durduruyor.
   */
  function clientSelect(a: PickerAccount) {
    if (!canManage) {
      return (
        <span className="shrink-0 text-[11px] text-ink-muted">
          {a.clientName ?? 'havuzda'}
        </span>
      );
    }
    return (
      <select
        value={a.clientId ?? ''}
        disabled={busy !== null || isPending || a.isManager}
        title={a.isManager ? 'Yönetici hesapları reklam yayınlamaz, atanamaz' : undefined}
        onChange={(e) => assign(a, e.target.value === '' ? null : e.target.value)}
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
            Henüz hiçbir hesap izlenmiyor. Önce bir hesabı müşteriye ata, sonra{' '}
            <strong>İzle</strong> de.
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
                <div className="flex shrink-0 items-center gap-2">
                  {clientSelect(a)}
                  <button
                    type="button"
                    onClick={() => toggle(a, false)}
                    disabled={busy !== null || isPending}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {busy === a.id ? '…' : 'Bırak'}
                  </button>
                </div>
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
            yeniden izlemeye alırsan geçmişiyle geri gelir. Müşteri atamasını
            kaldırmak izlemeyi de kapatır.
          </p>
        )}
      </div>

      {/* ATANMIŞ AMA İZLENMEYENLER */}
      {assignedIdle.length > 0 && (
        <div className="mt-3 rounded-lg border border-line p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Atanmış, izlenmiyor ({assignedIdle.length})
          </h4>
          <ul className="mt-2 divide-y divide-line">
            {assignedIdle.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {a.externalId} · {a.clientName ?? '—'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {clientSelect(a)}
                  <button
                    type="button"
                    onClick={() => toggle(a, true)}
                    disabled={busy !== null || isPending}
                    className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition disabled:opacity-40"
                  >
                    {busy === a.id ? '…' : 'İzle'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* HAVUZ — arama */}
      <div className="mt-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Havuzdan hesap ata
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Havuzdaki ${pooledCount} hesap arasında ara — ad ya da kimlik`}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </label>

        {search.trim() === '' ? (
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Aramaya başla. Havuz, bu bağlantının eriştiği bütün reklam hesapları —
            çoğu bu ajansın müşterilerine ait değil. Bir hesabı müşteriye atamadan
            izlemeye alamazsın.
          </p>
        ) : results.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Havuzda eşleşen hesap yok.</p>
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
                {clientSelect(a)}
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
