'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Oneri, UygulamaSonucu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import {
  adimHalleri,
  adimMetinleri,
  eylemMetni,
  oneriEylemAdresi,
  sonucMetni,
  uygulaHatasi,
  uygulamaSonucuCoz,
  type UygulamaAsamasi,
} from '@/lib/iyilestir';
import i from '@/components/taslak/iyilestir.module.css';

/**
 * ═══ ONAY PENCERESİ — ÖNERİ KARTI VE ASİSTANIN UYGULA KARTI AYNI YOLDAN ═══
 *
 * İki kapı (Öneriler sekmesi, sohbetteki Uygula kartı) TEK uca gidiyor
 * (`POST /iyilestir/oneriler/:anahtar/uygula`, MIMARI §3) ve TEK pencereden
 * geçiyor: ikinci bir pencere yazılırsa biri "şimdi → sonra"yı, öbürü
 * adımları kaybeder ve kullanıcı aynı işi iki farklı onayla verir.
 *
 * DOM'DAN ÇIKMIYOR (CLAUDE.md tasarım kuralı): kapalıyken `visibility:
 * hidden`, açılırken geçişle görünüyor. Koşullu render, kapanış geçişini
 * keser ve pencere bir karede kaybolur.
 *
 * İSTEK `ozet` TAŞIYOR: sunucu öneriyi yeniden hesaplayıp özet eşleşmezse
 * 409 dönüyor. Bu hâlde aynı düğmeye tekrar basmak yine 409 alır; pencere
 * tek eylem olarak "Yenile" gösteriyor.
 */
export function OnayPenceresi({
  oneri,
  onKapat,
  onSonuc,
}: {
  /** `null` = kapalı. Kapalıyken son öneri içerikte kalıyor (kapanış geçişi boş kutu göstermesin). */
  oneri: Oneri | null;
  onKapat: () => void;
  onSonuc: (anahtar: string, sonuc: UygulamaSonucu) => void;
}) {
  const router = useRouter();
  const [gosterilen, setGosterilen] = useState<Oneri | null>(oneri);
  const [asama, setAsama] = useState<UygulamaAsamasi>('hazir');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<UygulamaSonucu | null>(null);
  const onaylaRef = useRef<HTMLButtonElement>(null);
  const acik = oneri !== null;

  useEffect(() => {
    if (oneri) {
      setGosterilen(oneri);
      setAsama('hazir');
      setMesaj(null);
      setSonuc(null);
      // Klavye kullanıcısı pencerenin içinde başlasın.
      requestAnimationFrame(() => onaylaRef.current?.focus());
    }
  }, [oneri]);

  const suruyor = asama === 'gonderiliyor';

  useEffect(() => {
    if (!acik) return;
    const tus = (e: KeyboardEvent) => {
      // İstek sürerken Esc kapatmıyor: sonucu görmeden pencereyi kapatan
      // kullanıcı değişikliğin olup olmadığını bilemez.
      if (e.key === 'Escape' && !suruyor) onKapat();
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik, suruyor, onKapat]);

  const o = gosterilen;
  const metin = o ? eylemMetni(o) : null;
  const adimlar = o ? adimMetinleri(o.platform) : null;
  const haller = adimHalleri(asama);

  async function onayla() {
    if (!o) return;
    setAsama('gonderiliyor');
    setMesaj(null);
    try {
      const yanit = await apiFetch<unknown>(oneriEylemAdresi(o, 'uygula'), {
        method: 'POST',
        body: JSON.stringify({ ozet: o.ozet }),
      });
      const r = uygulamaSonucuCoz(yanit);
      if (!r) {
        /*
         * İstek başarılı ama sonuç okunamadı: platformda değişiklik OLMUŞ
         * olabilir. "Uygulanamadı" demek yanlış, "doğrulandı" demek yalan;
         * doğrusu kayıtlı hâle bakmak (sayfayı yenilemek).
         */
        setAsama('degisti');
        setMesaj('Sunucu yanıt verdi ama geri okuma sonucu okunamadı. Sayfayı yenileyip kartın durumuna bak.');
        return;
      }
      setSonuc(r);
      setAsama(r.durum);
      onSonuc(o.anahtar, r);
      /*
       * DOĞRULANDIYSA taslaktaki gibi kendiliğinden kapanıyor ve kart
       * "Uygulandı · Meta'da doğrulandı" oluyor. UYUŞMADIYSA AÇIK KALIYOR:
       * platformun bildirdiği değer kullanıcının görmesi gereken bir bilgi
       * ve kendiliğinden kapanan pencere onu bir saniyede yutardı.
       */
      if (r.durum === 'dogrulandi') setTimeout(onKapat, 900);
    } catch (e) {
      const h = uygulaHatasi(e instanceof ApiRequestError ? e : null);
      setAsama(h.asama);
      setMesaj(h.mesaj);
    }
  }

  return (
    <div className={`${i.perde} ${acik ? i.perdeAcik : ''}`} aria-hidden={!acik} onClick={(e) => e.target === e.currentTarget && !suruyor && onKapat()}>
      <div className={i.pencere} role="dialog" aria-modal="true" aria-labelledby="iyilestir-onay-baslik">
        <h3 id="iyilestir-onay-baslik">{metin?.baslik ?? 'Onay'}</h3>
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
          {(adimlar ?? ['', '', '']).map((a, n) => (
            <li key={n} data-hal={haller[n]}>
              <i />
              {a}
            </li>
          ))}
        </ul>

        {sonuc && o && (
          <div className={`${i.sonuc} ${sonuc.durum === 'dogrulandi' ? i.sonucOk : i.sonucUyari}`} role="status">
            {sonucMetni(sonuc, o.platform, metin?.sonra ?? null, 'az önce').metin}
          </div>
        )}
        {mesaj && (
          <div className={`${i.sonuc} ${i.sonucHata}`} role="alert">
            {asama === 'degisti' ? <strong>Öneri değişti, yenile. </strong> : <strong>Uygulanamadı. </strong>}
            {mesaj}
          </div>
        )}

        <div className={i.pencereAlt}>
          {asama === 'degisti' ? (
            <button
              type="button"
              className={i.birincil}
              onClick={() => {
                onKapat();
                router.refresh();
              }}
            >
              Yenile
            </button>
          ) : sonuc ? (
            <button type="button" className={i.ikincil} onClick={onKapat}>
              Kapat
            </button>
          ) : (
            <>
              <button type="button" className={i.ikincil} onClick={onKapat} disabled={suruyor}>
                Vazgeç
              </button>
              <button ref={onaylaRef} type="button" className={i.birincil} onClick={onayla} disabled={suruyor || !metin}>
                {asama === 'hata' ? 'Tekrar dene' : 'Onayla ve uygula'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
