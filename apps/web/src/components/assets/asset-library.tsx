'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  ASSET_KIND_META,
  type AssetListResult,
  type AssetRecord,
  type AssetUploadResult,
} from '@advetics/shared';
import { varliklarAdresi } from '@/lib/panel-adresleri';
import { GORSEL_TURLERI, type GorselTuru } from './gorsel-turleri';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Varlık arşivi — ızgara, yükleme, silme.
 *
 * MÜKERRER YÜKLEME SESSİZ DEĞİL. Aynı dosya ikinci kez bırakıldığında yeni
 * kayıt açılmıyor ve kullanıcıya bu söyleniyor. Sessizce mevcut kaydı seçmek,
 * kullanıcının "yüklendi mi yüklenmedi mi" diye tekrar denemesine yol açardı.
 *
 * LOGO BURADA YOK (docs/panel-sadelestirme/MIMARI.md Ç-11). Logonun evi
 * Marka Merkezi › Marka › Logo; burada hem süzgeçte hem yükleme türünde
 * olunca aynı dosya iki ekrandan yükleniyor ve "hangi logo kullanılıyor"
 * sorusu iki yerde cevaplanıyordu. Kayıtlar SİLİNMEDİ: sayıları bu ekranda
 * "N logo Marka'da" diye yazıyor (sessiz kesme yok) ve bağlantı oraya.
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
  logoAdresi,
}: {
  initial: AssetListResult;
  clientId: string;
  activeKind: GorselTuru | null;
  canWrite: boolean;
  /** Marka › Logo — logo kayıtlarının evi. */
  logoAdresi: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Sunucu süzgeçsiz istekte logoları da döndürüyor; burada listelenmez.
  const [rows, setRows] = useState<AssetRecord[]>(initial.rows.filter((r) => r.kind !== 'logo'));
  const [kind, setKind] = useState<GorselTuru>('image');
  const logoSayisi = initial.byKind.logo;
  const gorselToplami = GORSEL_TURLERI.reduce((t, k) => t + initial.byKind[k], 0);
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

  function navigate(next: GorselTuru | null): void {
    // Varlıklar › Görseller: eski `/kutuphane/gorseller` adresine gitmek her
    // süzgeç tıklamasında bir yönlendirme turu demekti.
    startTransition(() => router.push(varliklarAdresi('gorseller', clientId, { tur: next })));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => navigate(null)} className={chip(activeKind === null)}>
          Tümü{' '}
          <span className="opacity-60">{gorselToplami}</span>
        </button>
        {GORSEL_TURLERI.map((k) => (
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
                onChange={(e) => setKind(e.target.value as GorselTuru)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              >
                {GORSEL_TURLERI.map((k) => (
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

          {/* TÜR SEÇİMİNİN NE DEĞİŞTİRDİĞİ YAZIYOR. */}
          <p className="mt-2 text-[11px] text-ink-muted">{ASSET_KIND_META[kind].hint}</p>
          {busy && <p className="mt-1 text-[11px] text-ink-muted">Yükleniyor…</p>}
        </div>
      )}

      {notice && (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink">{notice}</p>
      )}
      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong ring-1 ring-inset ring-danger/30">
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
        {(activeKind ? initial.byKind[activeKind] : gorselToplami) > rows.length &&
          ` · toplam ${activeKind ? initial.byKind[activeKind] : gorselToplami}.`}
        {logoSayisi > 0 && (
          <>
            {' '}
            <Link href={logoAdresi} className="font-medium text-ink underline-offset-2 hover:underline">
              {logoSayisi} logo Marka’da
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function chip(active: boolean): string {
  return `rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
    active ? 'border-brand bg-brand-soft text-ink' : 'border-line text-ink-muted hover:bg-surface-sunken'
  }`;
}
