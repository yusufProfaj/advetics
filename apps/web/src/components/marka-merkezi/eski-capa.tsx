'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { eskiCapaYonu, type MarkaMerkeziBolumKodu } from '@/lib/panel-adresleri';

/**
 * ═══ ESKİ ÇAPALAR İSTEMCİDE ÇEVRİLİYOR (docs/panel-sadelestirme/MIMARI.md § 3) ═══
 *
 * Parça (`#…`) sunucuya hiç gitmiyor: `?bolum=ayarlar#kategori` sunucuda
 * `?bolum=workspace`e yönleniyor ve tarayıcı eski parçayı koruyor. Kart artık
 * başka bir bölümde olabiliyor (özel kategori → Kurulum › Reklam
 * varsayılanları), yani bu bir kaydırma değil yeni bir ADRES. Eşleme tek
 * yerde (`eskiCapaYonu`); burada yalnız uygulanıyor.
 *
 * `replace`, `push` değil: geri tuşu kullanıcıyı eski adrese ve oradan yine
 * buraya atmasın.
 */
export function EskiCapaYonlendirici({ bolum, musteri }: { bolum: MarkaMerkeziBolumKodu; musteri: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!window.location.hash) return;
    const hedef = eskiCapaYonu(bolum, window.location.hash, musteri);
    if (hedef) router.replace(hedef);
  }, [bolum, musteri, router]);
  return null;
}
