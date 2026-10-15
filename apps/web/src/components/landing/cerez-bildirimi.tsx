'use client';

import { useEffect, useState } from 'react';

import { useDil, useSozluk } from '@/dil/saglayici';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { yerelYol } from '@/lib/site-yollari';
import { CEREZ_ANAHTARI, CEREZ_SURUMU, bildirimGorunsunMu } from './cerez';

/**
 * Sol altta küçük çerez kartı. Tanıtım sitesinin ve yasal sayfaların
 * düzeninde; PANELDE YOK (panel oturum açmış kullanıcının ekranı ve politika
 * orada da aynı, ama her ekranın köşesinde bir kart iş görmeyi engeller).
 *
 * AYRI, KÜÇÜK BİR İSTEMCİ BİLEŞENİ: sayfaların geri kalanı sunucuda statik
 * üretiliyor ve bu kart yüzünden bütün düzen istemciye taşınmamalı (ilk
 * boyama hızı = arama sıralaması).
 *
 * Kart DOM'dan hiç çıkmıyor; görünürlüğü sınıfla değişiyor (CLAUDE.md,
 * "Tasarım"). Sunucu kartı GİZLİ basıyor: kararı tarayıcının deposu veriyor
 * ve sunucu onu bilemez; açık basıp sonra gizlemek, her açılışta kapatılmış
 * kartın bir an görünmesi demekti.
 *
 * DEPO HER ZAMAN try/catch İÇİNDE: gizli pencere ya da engellenmiş site
 * verisinde `localStorage` erişimi FIRLATIYOR ve sayfayı düşürüyordu
 * (toplu tazelemede görüldü). Depo yoksa kart her ziyarette görünür; bu
 * kabul edilebilir kayıp, çökme değil.
 *
 * "Çerez tercihleri" (alt bilgi) `data-cerez-ac` taşıyan bir bağlantı:
 * JavaScript yoksa politika sayfasına gidiyor, varsa kartı yeniden açıyor.
 */
export function CerezBildirimi() {
  const [gor, setGor] = useState(false);
  const { dil } = useDil();
  const d = useSozluk(siteArayuzSozlugu).cerez;

  useEffect(() => {
    let kayit: string | null = null;
    try {
      kayit = window.localStorage.getItem(CEREZ_ANAHTARI);
    } catch {
      kayit = null;
    }
    // Taslaktaki gibi kısa bir gecikmeyle: sayfa açılırken ilk göze çarpan şey kart olmasın.
    const z = bildirimGorunsunMu(kayit) ? window.setTimeout(() => setGor(true), 1200) : undefined;

    const ac = (e: MouseEvent) => {
      const hedef = e.target instanceof Element ? e.target.closest('[data-cerez-ac]') : null;
      if (!hedef) return;
      e.preventDefault();
      setGor(true);
    };
    document.addEventListener('click', ac);
    return () => {
      if (z) window.clearTimeout(z);
      document.removeEventListener('click', ac);
    };
  }, []);

  function kapat() {
    setGor(false);
    try {
      window.localStorage.setItem(CEREZ_ANAHTARI, CEREZ_SURUMU);
    } catch {
      /* Depo yoksa yalnız bu ziyaret için kapanır (yukarıdaki yorum). */
    }
  }

  return (
    <div
      className={`cerez${gor ? ' gor' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cerez-baslik"
      aria-hidden={!gor}
      inert={!gor}
    >
      <h2 id="cerez-baslik" className="cerez-baslik">
        {d.baslik}
      </h2>
      <p>
        {d.metin} <a href={yerelYol('/cerez-politikasi', dil)}>{d.politika}</a>
      </p>
      <div className="cerez-secenekler">
        <label>
          <span>
            {d.zorunlu}
            <small>{d.zorunluAlt}</small>
          </span>
          <input type="checkbox" className="anahtar" checked disabled readOnly />
        </label>
        <label>
          <span>
            {d.analitik}
            <small>{d.analitikAlt}</small>
          </span>
          <input type="checkbox" className="anahtar" checked={false} disabled readOnly />
        </label>
      </div>
      <div className="cerez-dugmeler">
        <button type="button" className="dg i" onClick={kapat}>
          {d.anladim}
        </button>
      </div>
    </div>
  );
}
