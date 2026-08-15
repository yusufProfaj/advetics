'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Müşteri kartındaki VARLIK GÖRÜNÜMÜ — hangi reklam hesapları ve hangi
 * sayfalar bu müşteriye ait.
 *
 * NEDEN BURADA: bağlantı havuza geçtikten sonra "bu müşterinin hesabı hangisi"
 * sorusunun tek cevabı, Platform Bağlantıları ekranında 157 satır arasında
 * aramaktı. Ajans müşteri müşteri çalışıyor; ekranın da müşteri müşteri
 * cevap vermesi gerekiyor.
 *
 * ATAMA DA BURADAN YAPILABİLİYOR ama havuz LİSTELENMİYOR, aranıyor. Havuzda
 * Meta'da 157, Google'da 127 hesap var ve 12 müşterinin kartına bunları
 * basmak ekranı kullanılamaz hâle getirirdi.
 */

export interface ClientAdAccount {
  id: string;
  name: string;
  platform: string;
  externalId: string;
  syncEnabled: boolean;
}

export interface ClientProfile {
  id: string;
  name: string;
  profileType: string;
}

export interface PoolItem {
  id: string;
  name: string;
  externalId: string;
  kind: 'ad_account' | 'social_profile';
  /** Yönetici (MCC) hesapları reklam yayınlamıyor; atanamıyor. */
  isManager?: boolean;
}

const PLATFORM_LABEL: Record<string, string> = { meta: 'Meta', google: 'Google' };

export function ClientAssets({
  clientId,
  clientName,
  adAccounts,
  profiles,
  pool,
  canManage,
}: {
  clientId: string;
  clientName: string;
  adAccounts: ClientAdAccount[];
  profiles: ClientProfile[];
  /** Ajans havuzu — atanmamış hesap ve sayfalar. Yalnızca org yöneticisi görür. */
  pool: PoolItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pool
      .filter((p) => p.name.toLowerCase().includes(q) || p.externalId.toLowerCase().includes(q))
      .slice(0, 10);
  }, [pool, search]);

  async function assign(item: PoolItem, target: string | null): Promise<void> {
    setBusy(item.id);
    setError(null);
    const path = item.kind === 'ad_account' ? 'ad-accounts' : 'social-profiles';
    try {
      await apiFetch(`/connections/${path}/${item.id}/client`, {
        method: 'PATCH',
        body: JSON.stringify({ clientId: target }),
      });
      setSearch('');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  }

  const watched = adAccounts.filter((a) => a.syncEnabled).length;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Bu müşterinin varlıkları
        </h3>
        {adAccounts.length > 0 && (
          <span className="text-[11px] text-ink-muted">{watched} izlemede</span>
        )}
      </div>

      {adAccounts.length === 0 && profiles.length === 0 ? (
        <p className="mt-2 text-xs text-ink-muted">
          Bu müşteriye hiçbir reklam hesabı ya da sayfa atanmamış — panelde hiç veri
          görünmeyecek.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {adAccounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                <span className="text-ink-muted">
                  {PLATFORM_LABEL[a.platform] ?? a.platform} ·{' '}
                </span>
                <span className="font-medium text-ink">{a.name}</span>
                {/* İZLENMİYOR OLMAK SESSİZ KALMAMALI: atanmış ama kapalı bir
                    hesap, hiç atanmamış bir hesapla panelde birebir aynı
                    görünür — ikisi de "veri yok". */}
                {!a.syncEnabled && <span className="text-amber-700"> · izlenmiyor</span>}
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() =>
                    void assign(
                      { id: a.id, name: a.name, externalId: a.externalId, kind: 'ad_account' },
                      null,
                    )
                  }
                  disabled={busy !== null || isPending}
                  title="Havuza geri koy — bu müşteriden çıkar"
                  className="shrink-0 text-[11px] text-ink-muted underline decoration-dotted transition hover:text-ink disabled:opacity-40"
                >
                  {busy === a.id ? '…' : 'çıkar'}
                </button>
              )}
            </li>
          ))}
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                <span className="text-ink-muted">
                  {p.profileType === 'instagram_business' ? 'IG' : 'FB'} ·{' '}
                </span>
                <span className="font-medium text-ink">{p.name}</span>
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() =>
                    void assign(
                      { id: p.id, name: p.name, externalId: '', kind: 'social_profile' },
                      null,
                    )
                  }
                  disabled={busy !== null || isPending}
                  title="Havuza geri koy — bu müşteriden çıkar"
                  className="shrink-0 text-[11px] text-ink-muted underline decoration-dotted transition hover:text-ink disabled:opacity-40"
                >
                  {busy === p.id ? '…' : 'çıkar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-2">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs font-medium text-brand transition hover:underline"
            >
              + Havuzdan ata{pool.length > 0 ? ` (${pool.length} atanmamış)` : ''}
            </button>
          ) : (
            <>
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`${clientName} için havuzda ara — ad ya da kimlik`}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-brand"
              />
              {search.trim() !== '' && results.length === 0 && (
                <p className="mt-1.5 text-[11px] text-ink-muted">Havuzda eşleşen yok.</p>
              )}
              {results.length > 0 && (
                <ul className="mt-1.5 divide-y divide-line rounded-lg border border-line">
                  {results.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-ink-muted">
                          {item.kind === 'social_profile' ? 'sayfa' : 'hesap'} ·{' '}
                        </span>
                        <span className="font-medium text-ink">{item.name}</span>
                        {item.isManager && (
                          <span className="ml-1 text-ink-muted">(yönetici hesabı)</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => void assign(item, clientId)}
                        disabled={busy !== null || isPending || item.isManager}
                        title={
                          item.isManager ? 'Yönetici hesapları reklam yayınlamaz' : undefined
                        }
                        className="shrink-0 rounded-lg bg-brand px-2 py-0.5 text-[11px] font-semibold text-white transition disabled:opacity-40"
                      >
                        {busy === item.id ? '…' : 'Ata'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
