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
  /** Organik gönderi senkronizasyonu. Kapalıyken Akıllı Boost gönderi görmüyor. */
  syncEnabled: boolean;
  /**
   * Boost'un faturalanacağı reklam hesabı. NULL ise gönderi öne çıkarılamıyor.
   *
   * Bu alan uçtan gönderilmezse ekran hangi hesabın eşleştiğini gösteremez ve
   * kullanıcı aynı hesabı tekrar tekrar seçer — `syncEnabled` ile aynı hata.
   */
  linkedAdAccountId: string | null;
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

  /**
   * SAYFANIN GÖNDERİ İZLEMESİ.
   *
   * Bu düğme olmadan `sync_enabled` alanını değiştirmenin hiçbir yolu yoktu:
   * üretimde 199 sayfanın hepsi kapalıydı, atanan sayfalar bile gönderi
   * çekmiyordu ve sebebi hiçbir ekranda yazmıyordu.
   */
  async function toggleProfileSync(p: ClientProfile): Promise<void> {
    setBusy(p.id);
    setError(null);
    try {
      await apiFetch(`/connections/social-profiles/${p.id}/sync`, {
        method: 'PATCH',
        body: JSON.stringify({ syncEnabled: !p.syncEnabled }),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * BOOST FATURALANDIRMA HESABI.
   *
   * Bu seçici olmadan `linked_ad_account_id` alanını değiştirmenin hiçbir yolu
   * yoktu: kolon sekiz yerde okunuyor ama hiçbir yerde yazılmıyordu ve elle
   * boost ekranı her gönderide "bu sayfaya bağlı bir reklam hesabı yok"
   * diyordu.
   */
  async function linkAccount(p: ClientProfile, adAccountId: string | null): Promise<void> {
    setBusy(p.id);
    setError(null);
    try {
      await apiFetch(`/connections/social-profiles/${p.id}/ad-account`, {
        method: 'PATCH',
        body: JSON.stringify({ adAccountId }),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Boost yalnızca Meta'da var; Google hesabı seçeneklere hiç girmiyor.
   * Sunucu da reddediyor ama seçilebilir göstermek, reddedilecek bir işi
   * teklif etmek olurdu.
   */
  const metaAccounts = useMemo(
    () => adAccounts.filter((a) => a.platform === 'meta'),
    [adAccounts],
  );

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
        /*
          SATIRLAR TEK BİÇİMLİ. Önceki düzende reklam hesabı TEK satır,
          sosyal profil ise İKİ blok basıyordu: ad satırı, altında tam
          genişlikte bir "Boost hesabı:" açılır kutusu. Kart içinde bazı
          satırlar 20px, bazıları 60px yükseliyordu ve liste kırık görünüyordu.

          Artık her varlık AYNI ızgarada: sabit genişlikte platform etiketi,
          esneyen ad, sağda eylemler. Boost seçici ADIN YANINDA ve dar —
          sağdaki eylem sütununun soluna yerleşiyor, altına değil.
        */
        <ul className="mt-2 divide-y divide-line/60">
          {adAccounts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="w-12 shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                {PLATFORM_LABEL[a.platform] ?? a.platform}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{a.name}</span>
              {/* İZLENMİYOR OLMAK SESSİZ KALMAMALI: atanmış ama kapalı bir
                  hesap, hiç atanmamış bir hesapla panelde birebir aynı
                  görünür — ikisi de "veri yok". */}
              {!a.syncEnabled && (
                <span className="shrink-0 text-[10px] text-amber-700">izlenmiyor</span>
              )}
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
                  className="shrink-0 text-[11px] text-ink-muted transition hover:text-danger disabled:opacity-40"
                >
                  {busy === a.id ? '…' : 'çıkar'}
                </button>
              )}
            </li>
          ))}

          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="w-12 shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                {p.profileType === 'instagram_business'
                  ? 'IG'
                  : p.profileType === 'youtube_channel'
                    ? 'YT'
                    : 'FB'}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>

              {/*
                BOOST FATURALANDIRMA HESABI — gönderi öne çıkarmanın ön koşulu.
                Eşleşme yoksa Akıllı Boost her gönderide "bağlı reklam hesabı
                yok" diyor ve sebebi burada çözülüyor.

                DAR VE SATIR İÇİNDE: tam genişlikte ve satırın altında
                dururken listeyi kırıyordu.
              */}
              {canManage &&
                p.profileType !== 'youtube_channel' &&
                (metaAccounts.length === 0 ? (
                  <span
                    title="Bu müşteriye atanmış Meta reklam hesabı yok"
                    className="shrink-0 text-[10px] text-amber-700"
                  >
                    boost hesabı yok
                  </span>
                ) : (
                  <select
                    value={p.linkedAdAccountId ?? ''}
                    onChange={(e) => void linkAccount(p, e.target.value || null)}
                    disabled={busy !== null || isPending}
                    title="Boost faturalandırma hesabı"
                    className={`w-24 shrink-0 rounded border border-line bg-surface px-1 py-0.5 text-[10px] outline-none focus:border-brand disabled:opacity-40 ${
                      p.linkedAdAccountId ? 'text-ink' : 'text-amber-700'
                    }`}
                  >
                    <option value="">boost yok</option>
                    {metaAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ))}

              {!p.syncEnabled && (
                <span className="shrink-0 text-[10px] text-amber-700">çekilmiyor</span>
              )}

              {canManage && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void toggleProfileSync(p)}
                    disabled={busy !== null || isPending}
                    title={
                      p.syncEnabled
                        ? 'Gönderi çekmeyi durdur'
                        : 'Organik gönderileri çek — Akıllı Boost bunları kullanıyor'
                    }
                    className="text-[11px] text-ink-muted transition hover:text-ink disabled:opacity-40"
                  >
                    {busy === p.id ? '…' : p.syncEnabled ? 'durdur' : 'izle'}
                  </button>
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
                    className="text-[11px] text-ink-muted transition hover:text-danger disabled:opacity-40"
                  >
                    çıkar
                  </button>
                </span>
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
