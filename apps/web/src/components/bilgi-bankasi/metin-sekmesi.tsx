'use client';

import { useEffect, useState } from 'react';
import type { ClientProfileRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';

/**
 * Bilgi Bankası / Hedef Kitle / Marka Bilgileri sekmeleri — ÜÇÜ DE
 * `ClientProfile`in SERBEST METİN alanları, TEK bileşenden üretiliyor.
 *
 * İKİNCİ BİR NEREDEYSE-AYNI FORM YAZMAK yerine tek bileşen `alan` prop'una
 * göre hangi kolonu okuyup yazacağını seçiyor — CLAUDE.md'nin defalarca
 * yakaladığı "aynı şeyi üreten ikinci fonksiyon doğduğu anda ayrışır" dersi.
 * Üçüncü kullanım (`bilgiBankasi`) tam da bu yüzden yeni bir dosya değil:
 * `clients.notes` için yazılmış ayrı form silindi.
 */
export function MetinSekmesi({
  clientId,
  canWrite,
  alan,
  baslik,
  aciklama,
  placeholder,
}: {
  clientId: string;
  canWrite: boolean;
  /*
   * `ClientProfileRecord`in SERBEST METİN alanları. Birlik elle yazılı ama
   * `alan` prop'u aşağıda hem okuma (`profil[alan]`) hem yazma gövdesinde
   * kullanıldığı için şemada olmayan bir ad derlemede düşüyor.
   */
  alan: 'bilgiBankasi' | 'hedefKitle' | 'markaBilgileri';
  baslik: string;
  aciklama: string;
  placeholder: string;
}) {
  const [deger, setDeger] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setError(null);
    apiFetch<ClientProfileRecord>(`/client-profile?clientId=${clientId}`)
      .then((profil) => {
        if (!iptal) setDeger(profil[alan] ?? '');
      })
      .catch((err) => {
        if (!iptal) setError(err instanceof ApiRequestError ? err.message : 'Profil yüklenemedi');
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
    // `alan` DEĞİŞTİĞİNDE (sekme geçişinde bileşen yeniden monte oluyor
    // ama emin olmak için) yeniden çekiliyor.
  }, [clientId, alan]);

  async function kaydet(): Promise<void> {
    setBusy(true);
    setError(null);
    setKaydedildi(false);
    try {
      await apiFetch('/client-profile', {
        method: 'POST',
        body: JSON.stringify({ clientId, [alan]: deger.trim() || null }),
      });
      setKaydedildi(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
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
        <h2 className="text-sm font-semibold text-ink">{baslik}</h2>
        <p className="mt-0.5 text-xs text-ink-muted">{aciklama}</p>
      </div>

      <textarea
        value={deger}
        onChange={(e) => {
          setDeger(e.target.value);
          setKaydedildi(false);
        }}
        disabled={!canWrite}
        placeholder={placeholder}
        rows={6}
        maxLength={2000}
        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60"
      />
      <p className="text-right text-[11px] text-ink-muted">{deger.length}/2000</p>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={kaydet}
            disabled={busy}
            className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          {kaydedildi && <span className="text-xs text-emerald-700">Kaydedildi</span>}
        </div>
      )}
    </div>
  );
}
