'use client';

import { useState } from 'react';

import { useDil, useSozluk } from '@/dil/saglayici';
import { fiyatSozlugu } from '@/dil/sozlukler/fiyat';

import {
  AJANS,
  YILLIK_INDIRIM_YUZDE,
  ajansKademeMetni,
  ajansKirilimi,
  paketler,
  donemFiyatiSent,
  eylemMetni,
  paketTalepAdresi,
  sinirMetni,
  usd,
  type Donem,
} from './fiyat';

/**
 * ═══ PAKET KARTLARI (ana sayfa ve fiyatlandırma) ═══
 *
 * İstemci bileşeni, çünkü iki şey etkileşimli: aylık/yıllık anahtarı ve
 * ajans kartındaki workspace kaydırıcısı. Sunucu AYLIK hâli basıyor; arama
 * motoru ve JavaScript'siz ziyaretçi bütün fiyatları görüyor.
 *
 * Rakamların HİÇBİRİ burada yazılı değil: hepsi `fiyat.ts`ten. Kırılımda
 * görünen birim fiyat, karttaki toplam ve e-postaya giden workspace sayısı
 * aynı fonksiyondan geliyor; biri değişip öteki eski kalamaz.
 */
export function FiyatPaketleri() {
  const [donem, setDonem] = useState<Donem>('ay');
  const [workspace, setWorkspace] = useState<number>(AJANS.dahilWorkspace);
  const kirilim = ajansKirilimi(workspace, donem);
  const { dil } = useDil();
  const k = useSozluk(fiyatSozlugu).kart;

  return (
    <>
      <div className="ortali">
        {/* İki düğmeli anahtar: `aria-pressed` hangisinin seçili olduğunu ekran okuyucuya da söylüyor. */}
        <div className="donem" role="group" aria-label={k.odemeDonemi}>
          <button type="button" aria-pressed={donem === 'ay'} onClick={() => setDonem('ay')}>
            {k.aylik}
          </button>
          <button type="button" aria-pressed={donem === 'yil'} onClick={() => setDonem('yil')}>
            {k.yillik} <small>−%{YILLIK_INDIRIM_YUZDE}</small>
          </button>
        </div>
      </div>
      <div className="paketler">
        {paketler(dil).map((p) => {
          const ajans = p.kod === 'ajans';
          const fiyat = ajans ? kirilim.toplamSent : donemFiyatiSent(p.aylikSent, donem);
          return (
            <div key={p.kod} className={`paket${p.one ? ' one' : ''}`}>
              {p.one && <span className="rozet k one-rozet">{k.enCok}</span>}
              <h3>{p.ad}</h3>
              <p className="kim">{p.kim}</p>
              <div className="fiyat">
                {/* Canlı bölge: kaydırıcı ya da dönem değişince yeni fiyat okunuyor. */}
                <b aria-live="polite">{usd(fiyat)}</b>
                <span>{ajans ? k.aydan : k.ay}</span>
              </div>
              <div className="vergi">{donem === 'yil' ? k.yillikFatura : k.kdvHaric}</div>
              <div className="sinir">{sinirMetni(p, dil)}</div>
              {ajans && (
                <div className="hesap">
                  <label htmlFor="ajans-workspace">
                    {k.musteriWorkspace} <span>{workspace}</span>
                  </label>
                  <input
                    id="ajans-workspace"
                    type="range"
                    min={1}
                    max={AJANS.enCokWorkspace}
                    value={workspace}
                    onChange={(e) => setWorkspace(Number(e.target.value))}
                  />
                  <div className="kirilim">
                    <div>
                      <span>{k.taban(AJANS.dahilWorkspace)}</span>
                      <span>{usd(kirilim.tabanSent)}</span>
                    </div>
                    <div>
                      <span>{ajansKademeMetni(donem, dil)}</span>
                      <span>{usd(kirilim.kademeBir.tutarSent + kirilim.kademeIki.tutarSent)}</span>
                    </div>
                  </div>
                </div>
              )}
              <a
                className={`dg ${p.one ? 'b' : 'i'}`}
                href={paketTalepAdresi(p, { donem, workspace: ajans ? workspace : undefined }, dil)}
              >
                {eylemMetni(p, dil)}
              </a>
              <ul>
                {p.ozellikler.map((o) => (
                  <li key={o}>{o}</li>
                ))}
                {p.yok.map((o) => (
                  <li key={o} className="yok">
                    <span className="sr-only">{k.yokOn}</span>
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
