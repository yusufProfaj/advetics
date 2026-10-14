'use client';

import { useState } from 'react';

import {
  AJANS,
  PAKETLER,
  YILLIK_INDIRIM_YUZDE,
  ajansKademeMetni,
  ajansKirilimi,
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

  return (
    <>
      <div className="ortali">
        {/* İki düğmeli anahtar: `aria-pressed` hangisinin seçili olduğunu ekran okuyucuya da söylüyor. */}
        <div className="donem" role="group" aria-label="Ödeme dönemi">
          <button type="button" aria-pressed={donem === 'ay'} onClick={() => setDonem('ay')}>
            Aylık
          </button>
          <button type="button" aria-pressed={donem === 'yil'} onClick={() => setDonem('yil')}>
            Yıllık <small>−%{YILLIK_INDIRIM_YUZDE}</small>
          </button>
        </div>
      </div>
      <div className="paketler">
        {PAKETLER.map((p) => {
          const ajans = p.kod === 'ajans';
          const fiyat = ajans ? kirilim.toplamSent : donemFiyatiSent(p.aylikSent, donem);
          return (
            <div key={p.kod} className={`paket${p.one ? ' one' : ''}`}>
              {p.one && <span className="rozet k one-rozet">En çok seçilen</span>}
              <h3>{p.ad}</h3>
              <p className="kim">{p.kim}</p>
              <div className="fiyat">
                {/* Canlı bölge: kaydırıcı ya da dönem değişince yeni fiyat okunuyor. */}
                <b aria-live="polite">{usd(fiyat)}</b>
                <span>{ajans ? "/ ay'dan" : '/ ay'}</span>
              </div>
              <div className="vergi">{donem === 'yil' ? 'Yıllık faturalanır · KDV hariç' : 'KDV hariç'}</div>
              <div className="sinir">{sinirMetni(p)}</div>
              {ajans && (
                <div className="hesap">
                  <label htmlFor="ajans-workspace">
                    {"Müşteri workspace'i"} <span>{workspace}</span>
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
                      <span>Taban ({AJANS.dahilWorkspace} dahil)</span>
                      <span>{usd(kirilim.tabanSent)}</span>
                    </div>
                    <div>
                      <span>{ajansKademeMetni(donem)}</span>
                      <span>{usd(kirilim.kademeBir.tutarSent + kirilim.kademeIki.tutarSent)}</span>
                    </div>
                  </div>
                </div>
              )}
              <a
                className={`dg ${p.one ? 'b' : 'i'}`}
                href={paketTalepAdresi(p, { donem, workspace: ajans ? workspace : undefined })}
              >
                {eylemMetni(p)}
              </a>
              <ul>
                {p.ozellikler.map((o) => (
                  <li key={o}>{o}</li>
                ))}
                {p.yok.map((o) => (
                  <li key={o} className="yok">
                    <span className="sr-only">Yok: </span>
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
