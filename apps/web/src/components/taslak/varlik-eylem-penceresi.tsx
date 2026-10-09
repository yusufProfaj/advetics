'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { VarlikEylemSonucu } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { varlikEylemMetni, type VarlikEylemHedefi } from '@/lib/varlik-eylemi';
import i from './iyilestir.module.css';

/**
 * ═══ REKLAM YÖNETİCİSİ: DURDUR / BAŞLAT ONAYI (2026-10-10) ═══
 *
 * İyileştir'in onay penceresiyle AYNI görünüş ve aynı üç adım (platforma
 * gönder → platformdan geri oku → kaydet). Sunucu üç adımı tek istekte
 * yapıyor; istek sürerken yalnız ilk adım dönüyor, cevapla üçü kesinleşiyor
 * (zamanlayıcıyla "ilerliyormuş gibi" göstermek yalan olurdu).
 *
 * Pencere DOM'dan çıkmıyor (görünürlük geçişi); hedef `null` iken kapalı.
 * Sonuç `dogrulandi` ise kısa süre sonra kendiliğinden kapanıp sayfayı
 * yeniliyor; `uyusmadi`da açık kalıyor ki platformun söylediği okunabilsin.
 */
export function VarlikEylemPenceresi({
  hedef,
  onKapat,
}: {
  hedef: VarlikEylemHedefi | null;
  onKapat: () => void;
}) {
  const router = useRouter();
  const [asama, setAsama] = useState<'bekliyor' | 'suruyor' | 'bitti' | 'hata'>('bekliyor');
  const [sonuc, setSonuc] = useState<VarlikEylemSonucu | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const onaylaRef = useRef<HTMLButtonElement>(null);
  const acik = hedef !== null;
  const metin = hedef ? varlikEylemMetni(hedef) : null;

  useEffect(() => {
    if (!acik) return;
    setAsama('bekliyor');
    setSonuc(null);
    setMesaj(null);
    onaylaRef.current?.focus();
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && onKapat();
    document.addEventListener('keydown', tus);
    return () => document.removeEventListener('keydown', tus);
  }, [acik, hedef, onKapat]);

  function kapat() {
    if (asama === 'suruyor') return;
    const yenile = asama === 'bitti';
    onKapat();
    if (yenile) router.refresh();
  }

  async function onayla() {
    if (!hedef) return;
    setAsama('suruyor');
    setMesaj(null);
    try {
      const r = await apiFetch<VarlikEylemSonucu>(`/campaigns/varliklar/${hedef.seviye}/${hedef.id}/eylem`, {
        method: 'POST',
        body: JSON.stringify({ type: hedef.yayinda ? 'pause' : 'resume' }),
      });
      setSonuc(r);
      setAsama('bitti');
      if (r.dogrulama === 'dogrulandi') {
        setTimeout(() => {
          onKapat();
          router.refresh();
        }, 1200);
      }
    } catch (e) {
      // Sunucunun kendi cümlesi: ajans şalteri, kota, izin, platform hatası
      // AYRI cümleler; "beklenmeyen hata"ya çevirmek teşhisi imkânsız yapar.
      setMesaj(e instanceof ApiRequestError ? e.message : 'İstek gönderilemedi.');
      setAsama('hata');
    }
  }

  const platform = hedef ? PLATFORM_KISA_ADLARI[hedef.platform] : '';
  const adimHali = (n: number): string | undefined => {
    if (asama === 'suruyor') return n === 0 ? 'suruyor' : undefined;
    if (asama === 'bitti') return n === 1 && sonuc?.dogrulama === 'uyusmadi' ? 'uyari' : 'bitti';
    if (asama === 'hata') return n === 0 ? 'hata' : undefined;
    return undefined;
  };

  return (
    <div
      className={`${i.perde} ${acik ? i.perdeAcik : ''}`}
      aria-hidden={!acik}
      onClick={(e) => e.target === e.currentTarget && kapat()}
    >
      <div className={i.pencere} role="dialog" aria-modal="true" aria-labelledby="varlik-eylem-baslik">
        <h3 id="varlik-eylem-baslik">{metin?.baslik ?? 'Onay'}</h3>
        <p>{metin?.aciklama ?? ''}</p>
        <div className={i.degisim}>
          <div>
            <small>Şimdi</small>
            <b>{metin?.once ?? '—'}</b>
          </div>
          <span className={i.ok}>→</span>
          <div>
            <small>Sonra</small>
            <b>{metin?.sonra ?? '—'}</b>
          </div>
        </div>
        <ul className={i.adimlar} aria-live="polite">
          {[`${platform}'a gönder`, `${platform}'dan geri oku ve karşılaştır`, 'Kaydet (kim, ne zaman, eski → yeni)'].map(
            (a, n) => (
              <li key={n} data-hal={adimHali(n)}>
                <i />
                {a}
              </li>
            ),
          )}
        </ul>
        {sonuc && (
          <div className={`${i.sonuc} ${sonuc.dogrulama === 'dogrulandi' ? i.sonucOk : i.sonucUyari}`} role="status">
            {sonuc.dogrulama === 'dogrulandi'
              ? `${platform}'da doğrulandı: ${sonuc.platformDegeri}.`
              : `${platform} isteği kabul etti ama okunan durum farklı: ${sonuc.platformDegeri}.`}
          </div>
        )}
        {mesaj && (
          <div className={`${i.sonuc} ${i.sonucHata}`} role="alert">
            <strong>Uygulanamadı. </strong>
            {mesaj}
          </div>
        )}
        <div className={i.pencereAlt}>
          {asama === 'bitti' ? (
            <button type="button" className={i.ikincil} onClick={kapat}>
              Kapat
            </button>
          ) : (
            <>
              <button type="button" className={i.ikincil} onClick={kapat} disabled={asama === 'suruyor'}>
                Vazgeç
              </button>
              <button
                ref={onaylaRef}
                type="button"
                className={i.birincil}
                onClick={() => void onayla()}
                disabled={asama === 'suruyor' || !hedef}
              >
                {asama === 'hata' ? 'Tekrar dene' : 'Onayla ve uygula'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
