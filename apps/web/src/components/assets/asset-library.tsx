'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  ASSET_KINDS,
  ASSET_KIND_META,
  type AssetKind,
  type AssetListResult,
  type AssetRecord,
  type AssetUploadResult,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Varlık arşivi — ızgara, yükleme, silme.
 *
 * MÜKERRER YÜKLEME SESSİZ DEĞİL. Aynı dosya ikinci kez bırakıldığında yeni
 * kayıt açılmıyor ve kullanıcıya bu söyleniyor. Sessizce mevcut kaydı seçmek,
 * kullanıcının "yüklendi mi yüklenmedi mi" diye tekrar denemesine yol açardı.
 *
 * KULLANIM SAYISI HER KARTTA. Silme kararının tek dayanağı bu: kullanımdaki
 * bir görseli silmek, Meta'da çalışan bir reklamın kaydını koparmak demek ve
 * sunucu da bunu reddediyor.
 */
export function AssetLibrary({
  initial,
  clientId,
  activeKind,
  canWrite,
}: {
  initial: AssetListResult;
  clientId: string;
  activeKind: AssetKind | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<AssetRecord[]>(initial.rows);
  const [kind, setKind] = useState<AssetKind>('image');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function upload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    let added = 0;
    let duplicates = 0;

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      try {
        // `apiFetch` JSON gövdesi kuruyor; multipart için doğrudan fetch.
        // Content-Type ELLE VERİLMİYOR: tarayıcı boundary'yi kendisi ekliyor.
        const res = await fetch(
          `${API_URL}/assets?clientId=${clientId}&kind=${kind}`,
          { method: 'POST', credentials: 'include', body: form },
        );
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(b?.message ?? `${file.name} yüklenemedi`);
        }
        const result = (await res.json()) as AssetUploadResult;
        if (result.duplicate) duplicates++;
        else {
          added++;
          setRows((cur) => [result.asset, ...cur]);
        }
      } catch (err) {
        // TEK DOSYA PATLASA DA DİĞERLERİ DEVAM EDİYOR. Yirmi dosyalık bir
        // seçimde biri bozuk diye hepsini kaybetmek kabul edilemez.
        setError(err instanceof Error ? err.message : 'Yükleme başarısız');
      }
    }

    if (duplicates > 0) {
      setNotice(
        added > 0
          ? `${added} görsel eklendi, ${duplicates} tanesi zaten arşivde vardı.`
          : `${duplicates} görsel zaten arşivde vardı — tekrar eklenmedi.`,
      );
    }
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function remove(asset: AssetRecord): Promise<void> {
    setError(null);
    try {
      await apiFetch(`/assets/${asset.id}`, { method: 'DELETE' });
      setRows((cur) => cur.filter((r) => r.id !== asset.id));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Silinemedi.');
    }
  }

  function navigate(next: AssetKind | null): void {
    const params = new URLSearchParams({ musteri: clientId });
    if (next) params.set('tur', next);
    startTransition(() => router.push(`/kutuphane/gorseller?${params.toString()}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => navigate(null)} className={chip(activeKind === null)}>
          Tümü{' '}
          <span className="opacity-60">
            {Object.values(initial.byKind).reduce((a, b) => a + b, 0)}
          </span>
        </button>
        {ASSET_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => navigate(k)} className={chip(activeKind === k)}>
            {ASSET_KIND_META[k].label} <span className="opacity-60">{initial.byKind[k]}</span>
          </button>
        ))}
      </div>

      {canWrite && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Ne yüklüyorsun
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AssetKind)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_META[k].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Dosyalar
              </span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png"
                disabled={busy || isPending}
                onChange={(e) => void upload(e.target.files)}
                className="w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
            </label>
          </div>

          {/* TÜR SEÇİMİNİN NE DEĞİŞTİRDİĞİ YAZIYOR — logo alt sınırı farklı. */}
          <p className="mt-2 text-[11px] text-ink-muted">{ASSET_KIND_META[kind].hint}</p>
          {busy && <p className="mt-1 text-[11px] text-ink-muted">Yükleniyor…</p>}
        </div>
      )}

      {notice && (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink">{notice}</p>
      )}
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <h2 className="text-sm font-semibold text-ink">Arşiv boş</h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-ink-muted">
            Buraya yüklediğin görselleri her kampanyada yeniden kullanabilirsin — bir daha
            yüklemen gerekmez.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((a) => (
            <li key={a.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="aspect-square bg-surface-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_URL}${a.previewUrl}`}
                  alt={a.name}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-medium text-ink">{a.name}</p>
                <p className="text-[10px] text-ink-muted">
                  {a.width}×{a.height} · {Math.round(a.byteSize / 1024)} KB
                  {a.kind === 'logo' && ' · logo'}
                </p>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {/* KULLANIM SAYISI — silme kararının dayanağı. */}
                  <span className="text-[10px] text-ink-muted">
                    {a.usageCount > 0 ? `${a.usageCount} reklamda` : 'kullanılmıyor'}
                  </span>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => void remove(a)}
                      disabled={a.usageCount > 0}
                      title={
                        a.usageCount > 0
                          ? 'Kullanımdaki görsel silinemez — yayındaki reklamların kaydı kopar'
                          : undefined
                      }
                      className="text-[10px] text-ink-muted underline disabled:no-underline disabled:opacity-40"
                    >
                      Sil
                    </button>
                  )}
                </div>

                {/* PLATFORM YÜKLEMELERİ. Aynı görselin hesap başına ayrı bir
                    Meta kimliği var; bu satır onu görünür kılıyor. */}
                {a.platformRefs.length > 0 && (
                  <p className="mt-1 text-[10px] text-ink-muted">
                    {a.platformRefs.length} hesaba yüklendi
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-ink-muted">
        {rows.length} görsel gösteriliyor
        {initial.total > rows.length && ` · toplam ${initial.total}.`}
      </p>
    </div>
  );
}

function chip(active: boolean): string {
  return `rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
    active ? 'border-brand bg-brand-soft text-ink' : 'border-line text-ink-muted hover:bg-surface-sunken'
  }`;
}
