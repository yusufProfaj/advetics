'use client';

import { useEffect, useState } from 'react';
import type { ClientProfileRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Alan, MetinAlani } from '@/components/ui/alan';
import { Serit, Yukleniyor } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { markaMerkeziSozlugu } from '@/dil/sozlukler/marka-merkezi';

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
  const d = useSozluk(markaMerkeziSozlugu).metin;
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
        if (!iptal) setError(err instanceof ApiRequestError ? err.message : d.profilYuklenemedi);
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
    // `alan` DEĞİŞTİĞİNDE (sekme geçişinde bileşen yeniden monte oluyor
    // ama emin olmak için) yeniden çekiliyor.
  }, [clientId, alan, d.profilYuklenemedi]);

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
      setError(err instanceof ApiRequestError ? err.message : d.kaydedilemedi);
    } finally {
      setBusy(false);
    }
  }

  /*
   * KART KALIBI (taslak `#marka`): başlık kartın başlık satırında, Kaydet
   * kartın SAĞ ALTINDA koyu küçük düğme. Kart içinde kırmızı dolu düğme yok;
   * sayfanın tek birincil eylemi başlığın sağında.
   */
  if (yukleniyor) {
    return (
      <Kart baslik={baslik}>
        <Yukleniyor satir={3} etiket={d.yukleniyor(baslik)} />
      </Kart>
    );
  }

  return (
    <Kart
      baslik={baslik}
      altEylem={
        canWrite ? (
          <div className="flex items-center gap-3">
            {kaydedildi && (
              <span role="status" className="text-12 text-ink-muted">
                {d.kaydedildi}
              </span>
            )}
            <Dugme ton="koyu" boyut="kucuk" onClick={kaydet} bekliyor={busy}>
              {d.kaydet}
            </Dugme>
          </div>
        ) : undefined
      }
    >
      <div className="grid max-w-2xl gap-3">
        <Alan etiket={aciklama} ipucu={`${deger.length}/2000`}>
          {(id, aciklamaId) => (
            <MetinAlani
              id={id}
              aria-describedby={aciklamaId}
              value={deger}
              onChange={(e) => {
                setDeger(e.target.value);
                setKaydedildi(false);
              }}
              disabled={!canWrite}
              placeholder={placeholder}
              rows={6}
              maxLength={2000}
            />
          )}
        </Alan>
        {error && (
          <Serit ton="hata" baslik={d.seritBaslik}>
            {error}
          </Serit>
        )}
      </div>
    </Kart>
  );
}
