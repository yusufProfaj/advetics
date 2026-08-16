'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  FORMAT_TEXT_SPEC,
  packTextsFor,
  type AssetRecord,
  type CreativeFormat,
  type CreativeRecord,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { CreativeEditor } from './creative-editor';

/**
 * Kreatif kütüphanesi listesi.
 *
 * HER SATIRDA PLATFORM HAZIRLIĞI YAZIYOR. Kreatifin "iyi" olup olmadığı tek
 * başına bir soru değil: aynı kreatif Meta'ya hazır, Google'a hazır
 * olmayabilir ve fark yalnızca metin sayısından geliyor. Listede tek bir
 * "tamam" rozeti göstermek, uzmanın Google kampanyası kurarken neden
 * reddedildiğini anlamaması demek olurdu.
 */
export function CreativeLibrary({
  clientId,
  creatives,
  libraryAssets,
}: {
  clientId: string;
  creatives: CreativeRecord[];
  libraryAssets: AssetRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CreativeRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function kopyala(id: string): Promise<void> {
    setBusy(id);
    setError(null);
    try {
      const kopya = await apiFetch<CreativeRecord>(`/creatives/${id}/duplicate`, {
        method: 'POST',
      });
      router.refresh();
      // KOPYA HEMEN DÜZENLEMEYE AÇILIYOR: kullanıcı kopyalamayı düzenlemek
      // için istedi, listede bulup tıklamak fazladan bir adım.
      setEditing(kopya);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kopyalanamadı');
    } finally {
      setBusy(null);
    }
  }

  async function sil(id: string): Promise<void> {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/creatives/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Silinemedi');
    } finally {
      setBusy(null);
    }
  }

  if (creating || editing) {
    return (
      <CreativeEditor
        clientId={clientId}
        creative={editing}
        libraryAssets={libraryAssets}
        onDone={() => {
          setCreating(false);
          setEditing(null);
        }}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white"
      >
        Yeni kreatif
      </button>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      {creatives.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          Bu müşteride henüz kreatif yok.
        </p>
      ) : (
        <ul className="space-y-2">
          {creatives.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-sunken">
                    {c.assets[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${API_URL}${c.assets[0].previewUrl}`}
                        alt=""
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                    <p className="text-[11px] text-ink-muted">
                      {c.assets.length} görsel · {c.texts.headlines.length} başlık ·{' '}
                      {c.texts.descriptions.length} açıklama
                    </p>

                    {/* PLATFORM HAZIRLIĞI SATIR SATIR. Aynı kreatif Meta'ya
                        hazır, Google'a hazır olmayabilir. */}
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(['meta_single_image', 'google_rsa'] as CreativeFormat[]).map((f) => {
                        const p = packTextsFor(f, c.texts);
                        const hazir = p.blockers.length === 0;
                        return (
                          <span
                            key={f}
                            title={hazir ? 'Hazır' : p.blockers.join(' ')}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              hazir
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {FORMAT_TEXT_SPEC[f].label.split(' — ')[0]}: {hazir ? 'hazır' : 'eksik'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Düzenle
                  </button>
                  {/* KOPYALA HER ZAMAN AÇIK: yayınlanmış kreatifi düzenlemenin
                      tek yolu bu ve düzenle düğmesi o durumda sunucudan hata
                      alıyor — mesaj da kopyalamayı söylüyor. */}
                  <button
                    type="button"
                    onClick={() => void kopyala(c.id)}
                    disabled={busy !== null}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                  >
                    Kopyala
                  </button>
                  <button
                    type="button"
                    onClick={() => void sil(c.id)}
                    disabled={busy !== null}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
