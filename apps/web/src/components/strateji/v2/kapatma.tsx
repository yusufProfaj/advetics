'use client';

import { useEffect, useState } from 'react';
import { stratejiGecisMumkunMu, stratejiUcYolu, type StratejiDurumu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiV2Sozlugu } from '@/dil/sozlukler/strateji-v2';
import { Dugme } from '@/components/ui/dugme';
import { Pencere } from '@/components/ui/pencere';
import { Bildirim, yaz } from './ortak';

/**
 * ═══ STRATEJİYİ İPTAL ET / SİL (2026-10-14) ═══
 *
 * Kullanıcı: *"stratejiyi iptal ettiğimde hâlâ oluşturamıyorum"*. Sebep:
 * yeni (v2) stratejiyi panelde iptal etmenin HİÇBİR yolu yoktu (iptal
 * düğmesi yalnız eski medya planı ekranındaydı) ve onay bekleyen strateji
 * "workspace başına tek açık strateji" kuralıyla yenisini kilitliyordu.
 * İptal ve silme rapor ekranında ve listenin ⋯ menüsünde, AYNI pencereden.
 *
 * Silme kullanıcı kararı ("Hepsi"): onaylı strateji dahil. Pencere ne
 * gideceğini ve neyin KALACAĞINI (kurulmuş kampanyalar, denetim kaydı)
 * söylüyor; onaylı stratejide müşterinin onayını ayrıca hatırlatıyor.
 * İptal yalnız sunucunun izin verdiği durumlarda (`stratejiGecisMumkunMu`)
 * ve yalnız yeni biçimde; eski medya planı yalnız silinebilir.
 */
export type KapatmaHedefi = { tur: 'iptal' | 'sil'; id: string; surum: number; ad: string; durum: string; bicim: number };

/** Bu satırda iptal sunulur mu: yeni biçim + sunucunun geçiş tablosu. */
export function iptalEdilebilirMi(p: { bicim: number; durum: string }): boolean {
  return p.bicim === 2 && stratejiGecisMumkunMu(p.durum as StratejiDurumu, 'iptal');
}

export function KapatmaPenceresi({ hedef, onKapat, onBitti }: { hedef: KapatmaHedefi | null; onKapat: () => void; onBitti: (tur: 'iptal' | 'sil') => void }) {
  const d = useSozluk(stratejiV2Sozlugu).kapatma;
  const { dil } = useDil();
  const [suruyor, setSuruyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => setHata(null), [hedef]);

  async function yap() {
    if (!hedef) return;
    setSuruyor(true);
    setHata(null);
    if (hedef.tur === 'iptal') {
      const r = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/eylem', { id: hedef.id }), 'POST', { eylem: 'iptal', surum: hedef.surum }, async () => null, hedef.surum, dil);
      setSuruyor(false);
      if (r.tur !== 'tamam') return setHata(r.mesaj);
    } else {
      try {
        await apiFetch(stratejiUcYolu('/strateji/v2/planlar/:id', { id: hedef.id }), { method: 'DELETE' });
      } catch (e) {
        setSuruyor(false);
        // Sunucunun cümlesi ("Strateji bulunamadı", yetki) ekranda; boş kutu değil.
        return setHata(e instanceof ApiRequestError ? e.message : d.sunucuYok);
      }
      setSuruyor(false);
    }
    onBitti(hedef.tur);
  }

  const sil = hedef?.tur === 'sil';
  return (
    <Pencere
      acik={hedef !== null}
      onKapat={() => !suruyor && onKapat()}
      genislik="dar"
      baslik={hedef ? (sil ? d.silBaslik(hedef.ad) : d.iptalBaslik(hedef.ad)) : ''}
      aciklama={sil ? d.silAciklama : d.iptalAciklama}
      altEylemler={
        <>
          <Dugme ton="ikincil" onClick={onKapat} disabled={suruyor}>
            {d.vazgec}
          </Dugme>
          <Dugme ton="koyu" bekliyor={suruyor} onClick={() => void yap()}>
            {sil ? d.kaliciSil : d.iptalEt}
          </Dugme>
        </>
      }
    >
      {hedef?.durum === 'onaylandi' && (
        <p className="text-13 text-ink">{sil ? d.onayliSil : d.onayliIptal}</p>
      )}
      {hata && (
        <div className="mt-2">
          <Bildirim hata baslik={hata} />
        </div>
      )}
    </Pencere>
  );
}
