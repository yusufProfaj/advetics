'use client';

import { useEffect, useState } from 'react';
import type { AssetListResult, AssetRecord, AssetUploadResult, ClientProfileRecord } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { Kart } from '@/components/ui/kart';
import { dugmeSinifi } from '@/components/ui/dugme';
import { BosDurum, Serit, Yukleniyor } from '@/components/ui/hal';
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
      <Kart baslik="Logo">
        <Yukleniyor satir={2} etiket="Logo yükleniyor" />
      </Kart>
    );
  }

  return (
    <Kart
      baslik="Logo"
      altEylem={
        canWrite ? (
          /*
           * YÜKLEME BİR `label`: dosya seçicisini açmanın klavye ve ekran
           * okuyucuyla çalışan tek yolu gerçek `<input type=file>`. Görünüş
           * ortak düğme sınıfından (`dugmeSinifi`), kendi kopyası değil.
           */
          <label className={`${dugmeSinifi('ikincil', 'kucuk')} cursor-pointer ${busy !== null ? 'pointer-events-none opacity-40' : ''}`}>
            {busy === 'yukle' ? 'Yükleniyor…' : 'Yeni logo yükle'}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => void yukle(e.target.files)}
            />
          </label>
        ) : undefined
      }
    >
      <div className="grid max-w-2xl gap-3">
        <p className="m-0 text-13 text-ink-muted">Reklam kreatifinde ve AI üretiminde kullanılacak marka logosu.</p>

        {assets.length === 0 ? (
          <BosDurum
            baslik="Henüz logo yüklenmedi."
            neden={
              canWrite
                ? 'Google Performance Max logosuz kampanya kurmuyor. Sağ alttan yükle.'
                : 'Logo yükleme yetkin yok; yöneticine sor.'
            }
          />
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={!canWrite || busy !== null}
                onClick={() => sec(a.id)}
                aria-pressed={seciliId === a.id}
                aria-label={`${a.name}${seciliId === a.id ? ' (seçili)' : ''}`}
                className={`aspect-square overflow-hidden rounded-alan border-2 transition-colors motion-reduce:transition-none ${
                  seciliId === a.id ? 'border-brand' : 'border-line hover:border-line-strong'
                }`}
              >
                <KreatifGorsel src={onizlemeAdresi(a.previewUrl)} alt={a.name} bosMetin="Görsel yok" />
              </button>
            ))}
          </div>
        )}

        {error && (
          <Serit ton="hata" baslik="Logo kaydedilemedi ya da okunamadı.">
            {error}
          </Serit>
        )}
        {kaydedildi && !error && (
          <p role="status" className="m-0 text-12 text-ink-muted">
            Kaydedildi
          </p>
        )}
      </div>
    </Kart>
  );
}
