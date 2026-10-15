'use client';

import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import type { WorkspaceUyumu } from '@/lib/sayfa-workspace';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';

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
  const hedef = workspaceAdi ? `“${workspaceAdi}”` : 'Bu workspace';

  async function gec(): Promise<void> {
    setBekliyor(true);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', { method: 'POST', body: JSON.stringify({ clientId }) });
      window.location.reload();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Workspace’e geçilemedi.');
      setBekliyor(false);
    }
  }

  const dugme = (
    <Dugme bekliyor={bekliyor} onClick={() => void gec()}>
      Bu workspace’e geç
    </Dugme>
  );

  return (
    <div className="space-y-2">
      {uyum === 'secimYok' ? (
        <Uyari ton="uyari" baslik="Değişiklik yapmak için bu workspace’e geç." eylem={dugme}>
          {/* SEÇİCİYLE AYNI DİL: üstte "Şirket geneli" yazıyor; "workspace seçili
              değil" demek, seçicide şirket adını gören kullanıcıya çelişki
              gibi okunuyordu (canlı denetim). */}
          Üstte şirket geneli seçili, tek bir workspace değil. {hedef} bilgileri görünüyor; kaydetmek için bu workspace’e geç.
        </Uyari>
      ) : (
        <Uyari ton="uyari" baslik={`${ekran} ${workspaceAdi ? `“${workspaceAdi}”` : 'başka bir workspace'} için açıldı.`} eylem={dugme}>
          {aktifAdi ? `Üstte “${aktifAdi}” seçili.` : 'Bu workspace şu anki şirketin listesinde değil.'} Bilgiler seçili
          workspace’e göre okunuyor; doğru veriyi görmek ve değiştirmek için geç.
        </Uyari>
      )}
      {hata && (
        <Uyari ton="tehlike" baslik="Workspace’e geçilemedi.">
          {hata}
        </Uyari>
      )}
    </div>
  );
}
