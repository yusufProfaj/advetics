'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import {
  ERISIM_YARICAP,
  OZEL_KATEGORI_ETIKETLERI,
  adresCevresiMi,
  isletmeAdresiKonumu,
  type GeoLocationOption,
  type RehberKonumu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { useDil, useSozluk } from '@/dil/saglayici';
import { reklamKimeSozlugu } from '@/dil/sozlukler/reklam-kime';
import { AltCubuk, Soru, Uyari, type AdimBaglami } from './adim-ortak';
import {
  YAS_SECENEKLERI,
  kategoriDegeri,
  kategoriSecenekleri,
  yasSecenekleri,
  seciliKategori,
  yasKilitliMi,
  yasSecenegi,
  type Degisiklik,
  type EkranNo,
  type KategoriKodu,
} from './rehber-mantik';
import { kaynakRozeti } from './kaynak-rozeti';
import s from './rehber.module.css';

export type KonumEslemeHali = { tur: 'yok' } | { tur: 'esleniyor' } | { tur: 'hata'; mesaj: string };

export function AdimKime({
  b,
  git,
  esleme,
  yenidenEsle,
}: {
  b: AdimBaglami;
  git: (n: EkranNo) => void;
  esleme: KonumEslemeHali;
  yenidenEsle: () => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(reklamKimeSozlugu);
  // Marka Merkezi'nden gelen konum o adla, stratejiden gelen "Stratejiden" (`kaynakRozeti`).
  const konumRozeti = kaynakRozeti(b.a.konumlar?.kaynak, b.a.konumlar?.kaynak === 'marka_merkezi' ? d.markaMerkezindenRozet : null, dil);
  const konumlar = b.a.konumlar?.deger ?? [];
  const [aramaAcik, setAramaAcik] = useState(false);
  const [ozelYas, setOzelYas] = useState(false);
  const ek = b.a.ekKategoriler?.deger;
  const taban = b.h.ozelKategoriTabani;
  const kilitli = yasKilitliMi(ek, taban);
  const aralik = b.a.yasAraligi?.deger ?? null;
  const yas = kilitli ? 'genis' : yasSecenegi(aralik, ozelYas);
  const kategori = seciliKategori(ek);
  // Adres çevresi Google'a yarıçap olarak gider; eşleme beklemiyor.
  const eslenemeyen = b.acik.google ? konumlar.filter((k) => !k.google && !adresCevresiMi(k)) : [];
  /*
   * ERİŞİM (K4): "işletme adresinin çevresi" İLK seçenek. Konum Marka
   * Merkezi'ndeki harita konumundan; yoksa seçenek KAPALI ve sebebi yazıyor
   * (adres metninden nokta tahmin edilmiyor). İl/ilçe seçimi aynen duruyor.
   */
  const erisim = b.a.amac?.deger === 'ERISIM';
  const adresKonumu = b.h.iletisim.adresKonumu ?? null;
  const cevre = konumlar.find(adresCevresiMi) ?? null;
  const konumEksikleri = b.kayit.eksikler.filter((e) => e.adim === 3 && e.alan === 'konumlar' && e.kod !== 'G-KONUM');
  const kategoriUyarilari = b.kayit.eksikler.filter((e) => e.adim === 3 && e.alan === 'ekKategoriler' && e.kod !== 'OZK-SORU');

  function konumlariYaz(yeni: RehberKonumu[]) {
    b.degistir([{ alan: 'konumlar', deger: yeni, kaynak: 'kullanici' }]);
  }

  function yasSec(kod: (typeof YAS_SECENEKLERI)[number]['kod']) {
    if (kod === 'ozel') {
      setOzelYas(true);
      if (!aralik) b.degistir([{ alan: 'yasAraligi', deger: { min: 18, max: 65 }, kaynak: 'kullanici' }]);
      return;
    }
    setOzelYas(false);
    const secenek = yasSecenekleri(dil).find((x) => x.kod === kod)!;
    b.degistir([{ alan: 'yasAraligi', deger: secenek.aralik, kaynak: 'kullanici' }]);
  }

  /*
   * KISITLI KATEGORİ YAŞI ZORLA GENİŞLETİR. Uyum denetçisi daraltılmış yaşı
   * yayında zaten durduruyor (`uyumDenetle` 3. kural); burada aynı anda
   * düzeltilip sebebi yazılıyor ki kullanıcı Yayınla'da değil burada öğrensin.
   */
  function kategoriSec(kod: KategoriKodu) {
    const d: Degisiklik[] = [{ alan: 'ekKategoriler', deger: kategoriDegeri(kod), kaynak: 'kullanici' }];
    if (yasKilitliMi(kategoriDegeri(kod), taban)) {
      setOzelYas(false);
      if (b.a.yasAraligi) d.push({ alan: 'yasAraligi', deger: null, kaynak: 'derleyici' });
      if (b.a.enDusukYas && b.a.enDusukYas.deger !== 18) d.push({ alan: 'enDusukYas', deger: 18, kaynak: 'derleyici' });
    }
    b.degistir(d);
  }

  return (
    <>
      <Soru adim={3} baslik={d.soru}>
        {b.a.konumlar?.kaynak === 'marka_merkezi' ? d.markaKitle : ''}{d.aciklama}
      </Soru>
      <div className={s.kart}>
        {erisim && (
          <div className={s.blok}>
            <div className={s.blokBaslik}>{d.bolge}</div>
            <div className={s.secim}>
              <button
                type="button"
                aria-pressed={!!cevre}
                disabled={!adresKonumu}
                onClick={() => adresKonumu && konumlariYaz([isletmeAdresiKonumu(adresKonumu, ERISIM_YARICAP.varsayilan, b.h.iletisim.adres ?? null)])}
              >
                {d.isletmeCevresi}
                <small>{adresKonumu ? (b.h.iletisim.adres ?? d.markaKonumu) : d.haritaYok}</small>
              </button>
              <button type="button" aria-pressed={!cevre} onClick={() => cevre && konumlariYaz([])}>
                {d.ilIlce}
                <small>{d.ilIlceAlt}</small>
              </button>
            </div>
            {!adresKonumu && (
              <p className={s.ipucu}>
                {d.haritaIpucu}{' '}
                <Link href={markaMerkeziAdresi('workspace', b.clientId, 'firma')} className={s.metinDugme}>
                  {d.markaMerkezineGit}
                </Link>
              </p>
            )}
            <div className={s.gizlenir} data-acik={!!cevre}>
              <div>{cevre && <YaricapGirdisi deger={cevre.yaricapKm ?? ERISIM_YARICAP.varsayilan} degisti={(km) => konumlariYaz([{ ...cevre, yaricapKm: km }])} />}</div>
            </div>
            {konumEksikleri.map((e) => (
              <Uyari key={e.kod} className={s.ustBosluk}>
                {e.metin}
              </Uyari>
            ))}
          </div>
        )}
        {/* Adres çevresi seçiliyken il/ilçe listesi GİZLENİR ama DOM'dan çıkmaz (geçişle). */}
        <div className={s.gizlenir} data-acik={!cevre}>
          <div>
            <div className={s.blok}>
              <div className={s.blokBaslik}>
                {d.konum}{' '}
                {konumRozeti && <span className={s.onerilen}>{konumRozeti}</span>}
              </div>
              <div className={s.cipler}>
                {konumlar.map((k) => (
                  <span key={`${k.tur}:${k.key}`} className={s.cip} aria-pressed="true">
                    {k.etiket}
                    {k.yaricapKm ? <small>+ {k.yaricapKm} km</small> : null}
                    {b.acik.google && !k.google && <small>{d.googleEslenmedi}</small>}
                    <button
                      type="button"
                      className={s.x}
                      aria-label={d.konumuKaldir(k.etiket)}
                      onClick={() => konumlariYaz(konumlar.filter((x) => !(x.tur === k.tur && x.key === k.key)))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <button type="button" className={s.cip} aria-expanded={aramaAcik} onClick={() => setAramaAcik((v) => !v)}>
                  {d.konumEkle}
                </button>
              </div>
              <div className={s.gizlenir} data-acik={aramaAcik}>
                <div>
                  <KonumArama
                    b={b}
                    acik={aramaAcik}
                    ekle={(k) => {
                      if (!konumlar.some((x) => x.tur === k.tur && x.key === k.key)) konumlariYaz([...konumlar, k]);
                    }}
                  />
                </div>
              </div>
              <p className={s.ipucu}>
                {d.bolgeOn}<b>{d.bolgeKalin}</b>{d.bolgeSon}
              </p>
              {eslenemeyen.length > 0 && (
                <p className={esleme.tur === 'hata' ? s.hataMetni : s.ipucu} role="status">
                  {esleme.tur === 'esleniyor'
                    ? d.esleniyor
                    : esleme.tur === 'hata'
                      ? d.esleHata(esleme.mesaj)
                      : d.eslenemedi(eslenemeyen.map((k) => k.etiket).join(', '))}
                  {esleme.tur !== 'esleniyor' && (
                    <button type="button" className={s.metinDugme} onClick={yenidenEsle}>
                      {d.yenidenDene}
                    </button>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className={s.blok}>
          <div className={s.blokBaslik}>
            {d.yas} <span className={s.ops}>{d.istege}</span>
          </div>
          <div className={s.secim}>
            {yasSecenekleri(dil).map((x) => (
              <button
                key={x.kod}
                type="button"
                aria-pressed={yas === x.kod}
                disabled={kilitli && x.kod !== 'genis'}
                onClick={() => yasSec(x.kod)}
              >
                {x.ad}
                {x.alt && <small>{x.alt}</small>}
              </button>
            ))}
          </div>
          <div className={s.gizlenir} data-acik={yas === 'ozel' && !kilitli}>
            <div>
              <div className={s.alanlar} style={{ paddingTop: 10 }}>
                <YasGirdisi etiket={d.enKucuk} deger={aralik?.min ?? 18} degisti={(v) => b.degistir([{ alan: 'yasAraligi', deger: { min: v, max: aralik?.max ?? 65 }, kaynak: 'kullanici' }])} />
                <YasGirdisi etiket={d.enBuyuk} deger={aralik?.max ?? 65} degisti={(v) => b.degistir([{ alan: 'yasAraligi', deger: { min: aralik?.min ?? 18, max: v }, kaynak: 'kullanici' }])} />
              </div>
            </div>
          </div>
          <div className={s.gizlenir} data-acik={kilitli}>
            <div>
              <Uyari className={s.ustBosluk}>
                {d.yasKilitli}
              </Uyari>
            </div>
          </div>
        </div>
        <div className={s.blok}>
          <div className={s.blokBaslik}>
            {d.kategoriBaslik} <span className={s.ops}>{d.zorunlu}</span>
          </div>
          <div className={`${s.secim} ${s.secimKategori}`}>
            {kategoriSecenekleri(dil).map((x) => (
              <button key={x.kod} type="button" aria-pressed={kategori === x.kod} onClick={() => kategoriSec(x.kod)}>
                {x.ad}
                {x.alt && <small>{x.alt}</small>}
              </button>
            ))}
          </div>
          {taban.length > 0 && (
            <p className={s.ipucu}>
              {d.tabanda} <b>{taban.map((k) => OZEL_KATEGORI_ETIKETLERI[k]).join(', ')}</b>.{d.tabanSon}
            </p>
          )}
          {kategoriUyarilari.map((e) => (
            <Uyari key={e.kod} className={s.ustBosluk}>
              {e.metin}
            </Uyari>
          ))}
        </div>
      </div>
      <AltCubuk git={git} adim={3} />
    </>
  );
}

/**
 * Yarıçap, km. GİRİŞ ANINDA doğrulanıyor: aralık dışı ya da kesirli değer
 * YAZILMIYOR ve alanın altında söyleniyor. Yazılsaydı rehber engelle dolar,
 * kullanıcı sebebi Kontrol'de öğrenirdi.
 */
function YaricapGirdisi({ deger, degisti }: { deger: number; degisti: (v: number) => void }) {
  const d = useSozluk(reklamKimeSozlugu);
  const id = useId();
  const [metin, setMetin] = useState(String(deger));
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => setMetin(String(deger)), [deger]);
  return (
    <div className={s.alanlar} style={{ paddingTop: 10 }}>
      <div className={s.alan}>
        <label htmlFor={id}>{d.yaricap}</label>
        <div className={s.girdi}>
          <input
            id={id}
            type="number"
            min={ERISIM_YARICAP.enAz}
            max={ERISIM_YARICAP.enCok}
            step={1}
            className={s.num}
            value={metin}
            aria-invalid={hata ? true : undefined}
            onChange={(e) => {
              setMetin(e.target.value);
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= ERISIM_YARICAP.enAz && v <= ERISIM_YARICAP.enCok) {
                setHata(null);
                if (v !== deger) degisti(v);
              } else setHata(d.yaricapHata(ERISIM_YARICAP.enAz, ERISIM_YARICAP.enCok));
            }}
          />
        </div>
        {hata ? (
          <p className={s.hataMetni} role="alert">
            {hata}
          </p>
        ) : (
          <p className={s.ipucu}>{d.yaricapIpucu}</p>
        )}
      </div>
    </div>
  );
}

function YasGirdisi({ etiket, deger, degisti }: { etiket: string; deger: number; degisti: (v: number) => void }) {
  const id = useId();
  return (
    <div className={s.alan}>
      <label htmlFor={id}>{etiket}</label>
      <div className={s.girdi}>
          <input
            id={id}
            type="number"
            min={18}
            max={65}
            className={s.num}
            value={deger}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v)) degisti(v);
            }}
          />
      </div>
    </div>
  );
}

/** Meta'nın konum araması bir reklam hesabı üzerinden yapılıyor. */
type AramaHali =
  | { tur: 'bos' }
  | { tur: 'kisa' }
  | { tur: 'araniyor' }
  | { tur: 'bitti'; sonuc: GeoLocationOption[] }
  | { tur: 'hata'; mesaj: string };

const KONUM_TURLERI = new Set(['country', 'region', 'city']);

function KonumArama({ b, acik, ekle }: { b: AdimBaglami; acik: boolean; ekle: (k: RehberKonumu) => void }) {
  const d = useSozluk(reklamKimeSozlugu);
  const [q, setQ] = useState('');
  const [hal, setHal] = useState<AramaHali>({ tur: 'bos' });
  const hesap = b.a.metaHesabiId?.deger ?? b.h.hesaplar[0]?.id ?? null;

  useEffect(() => {
    const t = q.trim();
    if (!acik || !hesap) return;
    if (t.length === 0) return setHal({ tur: 'bos' });
    if (t.length < 2) return setHal({ tur: 'kisa' });
    setHal({ tur: 'araniyor' });
    let iptal = false;
    const z = setTimeout(() => {
      apiFetch<GeoLocationOption[]>(`/connections/targeting/locations?adAccountId=${encodeURIComponent(hesap)}&q=${encodeURIComponent(t)}`)
        .then((r) => !iptal && setHal({ tur: 'bitti', sonuc: r.filter((x) => KONUM_TURLERI.has(x.type)) }))
        .catch((e: unknown) => !iptal && setHal({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : d.aramaDustu }));
    }, 350);
    return () => {
      iptal = true;
      clearTimeout(z);
    };
  }, [q, acik, hesap]);

  if (!hesap) {
    return (
      <p className={s.ipucu}>
        {d.aramaHesapYok}
      </p>
    );
  }
  return (
    <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className={s.girdi}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.aramaYer} aria-label={d.aramaEtiket} tabIndex={acik ? 0 : -1} />
      </div>
      {hal.tur === 'kisa' && <p className={s.ipucu}>{d.kisa}</p>}
      {hal.tur === 'araniyor' && <p className={s.ipucu}>{d.araniyor}</p>}
      {hal.tur === 'hata' && (
        <p className={s.hataMetni} role="alert">
          {d.aramaDustuMesaj(hal.mesaj)}
        </p>
      )}
      {hal.tur === 'bitti' && hal.sonuc.length === 0 && <p className={s.ipucu}>{d.eslesmeYok(q.trim())}</p>}
      {hal.tur === 'bitti' && hal.sonuc.length > 0 && (
        <div className={s.cipler}>
          {hal.sonuc.map((x) => (
            <button
              key={`${x.type}:${x.key}`}
              type="button"
              className={s.cip}
              onClick={() =>
                ekle({ tur: x.type as RehberKonumu['tur'], key: x.key, etiket: x.label, ulkeKodu: x.countryCode })
              }
            >
              + {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
