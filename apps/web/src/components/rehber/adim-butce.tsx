'use client';

import { useState } from 'react';
import { VARSAYILAN_META_PAYI, butceBol } from '@advetics/shared';
import { AltCubuk, Soru, Uyari, sil, yaz, type AdimBaglami } from './adim-ortak';
import {
  bitisSecenegi,
  bugun,
  gunEkle,
  gunFarki,
  paraGoster,
  paraSimgesi,
  tutarMetni,
  tutarOku,
  type BitisSecenegi,
  type EkranNo,
} from './rehber-mantik';
import s from './rehber.module.css';

export function AdimButce({ b, git }: { b: AdimBaglami; git: (n: EkranNo) => void }) {
  const butce = b.a.butce?.deger ?? null;
  const takvim = b.a.takvim?.deger ?? null;
  // Tür ve metin YEREL: tutar yazılmadan tür değişebilmeli (şema micros'suz
  // bütçe kabul etmiyor) ve "1.5" gibi yarım yazılmış bir tutar silinmemeli.
  const [tip, setTip] = useState<'gunluk' | 'toplam'>(butce?.tip ?? 'gunluk');
  const [metin, setMetin] = useState(butce ? tutarMetni(butce.micros) : '');
  const [tutarHatasi, setTutarHatasi] = useState<string | null>(null);
  const ikisi = b.acik.meta && b.acik.google;
  const pay = b.a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI;
  const bitis = bitisSecenegi(takvim);
  const gun = takvim?.bitis ? gunFarki(takvim.baslangic, takvim.bitis) : null;
  const birim = tip === 'gunluk' ? ' / gün' : ' toplam';
  const bugunTarih = bugun(b.saatDilimi);

  function tutarDegisti(v: string) {
    setMetin(v);
    if (v.trim() === '') {
      setTutarHatasi(null);
      return sil(b, 'butce');
    }
    const r = tutarOku(v, b.paraBirimi);
    if (r.tur === 'hata') return setTutarHatasi(r.mesaj);
    setTutarHatasi(null);
    yaz(b, 'butce', { tip, micros: r.micros });
  }

  function tipDegisti(t: 'gunluk' | 'toplam') {
    setTip(t);
    if (butce) yaz(b, 'butce', { tip: t, micros: butce.micros });
  }

  function bitisSec(sec: BitisSecenegi) {
    const bas = takvim?.baslangic ?? bugunTarih;
    yaz(b, 'takvim', { baslangic: bas, bitis: sec === 'yok' ? null : gunEkle(bas, sec) });
  }

  function baslangicDegisti(v: string) {
    if (!v) return sil(b, 'takvim');
    // Süre korunur: "30 gün" seçiliyse başlangıç kayınca bitiş de kayar.
    const sure = takvim?.bitis ? gunFarki(takvim.baslangic, takvim.bitis) : null;
    yaz(b, 'takvim', { baslangic: v, bitis: takvim && takvim.bitis === null ? null : sure !== null ? gunEkle(v, sure) : null });
  }

  /*
   * PAY ÇUBUĞU `butceBol`DAN (shared): eksik listesindeki asgari kontrolü ve
   * iki platformun türetilmiş taslağı aynı fonksiyonu okuyor. Burada ikinci
   * bir bölme yazılsaydı ekran "Meta 250 ₺" derken Meta'ya 249,99 ₺ giderdi.
   */
  const bolum = butce && BigInt(butce.micros) > 0n && ikisi ? butceBol(BigInt(butce.micros), b.acik, pay, b.paraBirimi) : null;
  // "Bütçe girilmedi" ve "başlangıç seçilmedi" boş kutunun kendisi zaten
  // söylüyor ve sağdaki listede duruyor; burada kutu dolduktan sonra çıkan
  // sorunlar (asgari, para birimi, bitiş) gösteriliyor.
  const eksikler = b.kayit.eksikler.filter((e) => e.adim === 5 && e.kod !== 'BTC-01' && !(e.kod === 'TKV' && !takvim));

  return (
    <>
      <Soru baslik="Ne kadar harcayalım, ne zamana kadar?">
        {ikisi ? 'Toplam tutarı yaz; iki platform arasında nasıl bölüneceğini öneriyoruz.' : 'Tutarı ve süreyi seç.'}
      </Soru>
      <div className={s.kart}>
        <div className={s.blok}>
          <div className={s.alanlar}>
            <div className={s.alan}>
              <span className={s.alanEtiket}>Bütçe türü</span>
              <div className={`${s.seg} ${s.segBaslangic}`} role="group" aria-label="Bütçe türü">
                <button type="button" aria-pressed={tip === 'gunluk'} onClick={() => tipDegisti('gunluk')}>
                  Günlük
                </button>
                <button type="button" aria-pressed={tip === 'toplam'} onClick={() => tipDegisti('toplam')}>
                  Toplam
                </button>
              </div>
            </div>
            <div className={s.alan}>
              <label htmlFor="rehber-tutar">{tip === 'gunluk' ? 'Günlük tutar' : gun ? `Toplam tutar (${gun} gün)` : 'Toplam tutar'}</label>
              <div className={s.girdi}>
                <input id="rehber-tutar" className={s.num} value={metin} inputMode="decimal" placeholder="500" onChange={(e) => tutarDegisti(e.target.value)} />
                <span className={s.on}>{paraSimgesi(b.paraBirimi)}</span>
              </div>
              {tutarHatasi && (
                <p className={s.hataMetni} role="alert" style={{ margin: 0 }}>
                  {tutarHatasi}
                </p>
              )}
            </div>
            <div className={s.alan}>
              <label htmlFor="rehber-baslangic">Başlangıç</label>
              <div className={s.girdi}>
                <input
                  id="rehber-baslangic"
                  type="date"
                  min={bugunTarih}
                  value={takvim?.baslangic ?? ''}
                  onChange={(e) => baslangicDegisti(e.target.value)}
                />
              </div>
            </div>
            <div className={s.alan}>
              <span className={s.alanEtiket}>Bitiş</span>
              <div className={`${s.secim} ${s.secimUc}`}>
                {([7, 30, 'yok'] as const).map((x) => (
                  <button key={x} type="button" aria-pressed={bitis === x} onClick={() => bitisSec(x)}>
                    {x === 'yok' ? 'Bitiş yok' : `${x} gün`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className={s.ipucu}>
            {tip === 'gunluk'
              ? `${b.acik.google ? "Google bazı günler günlük tutarın iki katına kadar harcayabilir; ay toplamı yine de günlük × 30,4'ü geçmez. " : ''}Bütçe türü kampanya başladıktan sonra değiştirilemiyor.`
              : 'Toplam tutar seçtiğin süreye yayılır. Bütçe türü kampanya başladıktan sonra değiştirilemiyor.'}
          </p>
          {!ikisi && <ButceUyarilari eksikler={eksikler} />}
        </div>
        {ikisi && (
          <div className={s.blok}>
            <div className={s.blokBaslik}>
              İki platforma paylaşım {b.a.metaPayiYuzde?.kaynak !== 'kullanici' && <span className={s.onerilen}>Önerilen</span>}
            </div>
            <div className={s.pay}>
              <div className={s.payCubuk}>
                <div className={s.m} style={{ flexBasis: `${pay}%` }}>
                  Meta %{pay}
                </div>
                <div className={s.g} style={{ flexBasis: `${100 - pay}%` }}>
                  Google %{100 - pay}
                </div>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={pay}
                aria-label="Meta payı"
                onChange={(e) => yaz(b, 'metaPayiYuzde', Number(e.target.value))}
              />
              <div className={`${s.payAlt} ${s.num}`}>
                <span>
                  Meta <b>{bolum ? paraGoster(bolum.meta, b.paraBirimi) : '—'}</b>
                  {birim}
                </span>
                <span>
                  Google <b>{bolum ? paraGoster(bolum.google, b.paraBirimi) : '—'}</b>
                  {birim}
                </span>
              </div>
              <p className={s.ipucu}>
                {b.a.metaPayiYuzde?.kaynak === 'kullanici'
                  ? 'Payı sen ayarladın. Sonuçlar gelince İyileştir, parayı daha ucuza sonuç veren tarafa kaydırmayı önerir.'
                  : 'İlk iki hafta eşit başlıyoruz. Sonuçlar gelince İyileştir, parayı daha ucuza sonuç veren tarafa kaydırmayı önerir.'}
              </p>
              <ButceUyarilari eksikler={eksikler} />
            </div>
          </div>
        )}
      </div>
      <AltCubuk git={git} adim={5} />
    </>
  );
}

/** Asgari bütçe, para birimi, takvim: hepsi SUNUCUNUN eksik listesinden, metniyle. */
function ButceUyarilari({ eksikler }: { eksikler: ReadonlyArray<{ kod: string; metin: string; seviye: 'engel' | 'uyari' }> }) {
  return (
    <>
      {eksikler.map((e, i) =>
        e.seviye === 'engel' ? (
          <Uyari key={`${e.kod}-${i}`} className={s.ustBosluk}>
            {e.metin}
          </Uyari>
        ) : (
          <p key={`${e.kod}-${i}`} className={s.ipucu}>
            {e.metin}
          </p>
        ),
      )}
    </>
  );
}
