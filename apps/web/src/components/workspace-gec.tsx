'use client';

import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import type { WorkspaceUyumu } from '@/lib/sayfa-workspace';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { useSozluk } from '@/dil/saglayici';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';

/**
 * ═══ ADRESTEKİ WORKSPACE'E TEK TIKLA GEÇ ═══ (`workspaceUyumu`, lib/sayfa-workspace.ts)
 *
 * Seçim üst barla AYNI uçtan (`/auth/switch-client`); workspace başka
 * şirketteyse uç şirketi de değiştiriyor. Geçişten sonra sayfa AYNI adresle
 * TAM yenileniyor: adres zaten hedefi taşıyor ve kenar çubuğu, marka
 * renkleri, üst bar yeni seçimle çizilmeli (`workspace-gerekli.tsx` ile aynı
 * gerekçe).
 *
 * HATA YUTULMUYOR: erişimi olmayan bir workspace'e geçiş reddedilirse
 * platformun cümlesi kutunun içinde yazıyor; "tıkladım, bir şey olmadı" yok.
 */
export function WorkspaceGec({
  clientId,
  workspaceAdi,
  aktifAdi,
  ekran,
  uyum,
}: {
  clientId: string;
  /** Hedef workspace'in adı; bu şirkette görünmüyorsa `null`. */
  workspaceAdi: string | null;
  /** Üstte seçili olan workspace'in adı; seçim yoksa `null`. */
  aktifAdi: string | null;
  /** Sayfanın adı: "Marka Merkezi", "Varlıklar". */
  ekran: string;
  uyum: Exclude<WorkspaceUyumu, 'ayni'>;
}) {
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const d = useSozluk(genelBakisSozlugu).workspace;
  const hedef = workspaceAdi ? `“${workspaceAdi}”` : d.buWorkspace;

  async function gec(): Promise<void> {
    setBekliyor(true);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', { method: 'POST', body: JSON.stringify({ clientId }) });
      window.location.reload();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : d.gecilemedi);
      setBekliyor(false);
    }
  }

  const dugme = (
    <Dugme bekliyor={bekliyor} onClick={() => void gec()}>
      {d.gec}
    </Dugme>
  );

  return (
    <div className="space-y-2">
      {uyum === 'secimYok' ? (
        <Uyari ton="uyari" baslik={d.secimYokBaslik} eylem={dugme}>
          {/* SEÇİCİYLE AYNI DİL: üstte "Şirket geneli" yazıyor; "workspace seçili
              değil" demek, seçicide şirket adını gören kullanıcıya çelişki
              gibi okunuyordu (canlı denetim). */}
          {d.secimYokMetin(hedef)}
        </Uyari>
      ) : (
        <Uyari ton="uyari" baslik={d.baskaBaslik(ekran, workspaceAdi)} eylem={dugme}>
          {aktifAdi ? d.ustteSecili(aktifAdi) : d.listedeDegil}
          {d.baskaDevam}
        </Uyari>
      )}
      {hata && (
        <Uyari ton="tehlike" baslik={d.gecilemedi}>
          {hata}
        </Uyari>
      )}
    </div>
  );
}
