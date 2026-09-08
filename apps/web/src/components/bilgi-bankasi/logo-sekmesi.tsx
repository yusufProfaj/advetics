'use client';

import { useEffect, useState } from 'react';
import type { AssetListResult, AssetRecord, AssetUploadResult, ClientProfileRecord } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';
import { KreatifGorsel } from '@/components/kreatif-gorsel';

/**
 * Logo sekmesi — müşterinin KENDİ marka logosu.
 *
 * `assets.kind = 'logo'` ile FİLTRELENİYOR (`kind=image` DEĞİL) —
 * `assets` şemasında logo zaten ayrı bir tür ve Google Performance Max
 * onsuz kampanya kurmuyor; aynı ayrımı burada da koruyoruz.
 *
 * `BrandingProfile.logoUrl` İLE KARIŞTIRILMASIN: o ajansın beyaz etiket
 * rapor logosu, panelin/raporun kendi markalaşması için. Bu, müşterinin
 * KENDİ logosu.
 */
export function LogoSekmesi({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [busy, setBusy] = useState<'kaydet' | 'yukle' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setError(null);
    Promise.all([
      apiFetch<AssetListResult>(`/assets?clientId=${clientId}&kind=logo&limit=50`),
      apiFetch<ClientProfileRecord>(`/client-profile?clientId=${clientId}`),
    ])
      .then(([assetler, profil]) => {
        if (iptal) return;
        setAssets(assetler.rows);
        setSeciliId(profil.logoAssetId);
      })
      .catch((err) => {
        if (!iptal) setError(err instanceof ApiRequestError ? err.message : 'Yüklenemedi');
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, [clientId]);

  async function sec(assetId: string): Promise<void> {
    setSeciliId(assetId);
    setBusy('kaydet');
    setError(null);
    setKaydedildi(false);
    try {
      await apiFetch('/client-profile', {
        method: 'POST',
        body: JSON.stringify({ clientId, logoAssetId: assetId }),
      });
      setKaydedildi(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(null);
    }
  }

  async function yukle(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const file = files[0]!;
    setBusy('yukle');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      // `apiFetch` JSON gövdesi kuruyor; multipart için doğrudan fetch —
      // `asset-library.tsx` ile aynı desen. Content-Type ELLE VERİLMİYOR.
      const res = await fetch(`${API_URL}/assets?clientId=${clientId}&kind=logo`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? 'Logo yüklenemedi');
      }
      const result = (await res.json()) as AssetUploadResult;
      setAssets((cur) => (result.duplicate ? cur : [result.asset, ...cur]));
      await sec(result.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo yüklenemedi');
    } finally {
      setBusy(null);
    }
  }

  if (yukleniyor) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-ink-muted">
        <Halka className="h-4 w-4" /> Yükleniyor…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">Logo</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Reklam kreatifinde ve AI üretiminde kullanılacak marka logosu.
        </p>
      </div>

      {assets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">
          Henüz logo yüklenmedi.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={!canWrite || busy !== null}
              onClick={() => sec(a.id)}
              className={`aspect-square overflow-hidden rounded-lg border-2 transition ${
                seciliId === a.id ? 'border-brand' : 'border-line hover:border-brand-soft'
              }`}
            >
              <KreatifGorsel src={a.previewUrl} alt={a.name} bosMetin="Görsel yok" />
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
      {kaydedildi && !error && <p className="text-xs text-emerald-700">Kaydedildi</p>}

      {canWrite && (
        <label className="inline-block cursor-pointer rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
          {busy === 'yukle' ? 'Yükleniyor…' : 'Yeni logo yükle'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy !== null}
            onChange={(e) => void yukle(e.target.files)}
          />
        </label>
      )}
    </div>
  );
}
