'use client';

import { useEffect, useId, useState } from 'react';
import { OZEL_KATEGORI_ETIKETLERI, type GeoLocationOption, type RehberKonumu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { AltCubuk, Soru, Uyari, type AdimBaglami } from './adim-ortak';
import {
  KATEGORI_SECENEKLERI,
  YAS_SECENEKLERI,
  kategoriDegeri,
  seciliKategori,
  yasKilitliMi,
  yasSecenegi,
  type Degisiklik,
  type EkranNo,
  type KategoriKodu,
} from './rehber-mantik';
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
  const konumlar = b.a.konumlar?.deger ?? [];
  const [aramaAcik, setAramaAcik] = useState(false);
  const [ozelYas, setOzelYas] = useState(false);
  const ek = b.a.ekKategoriler?.deger;
  const taban = b.h.ozelKategoriTabani;
  const kilitli = yasKilitliMi(ek, taban);
  const aralik = b.a.yasAraligi?.deger ?? null;
  const yas = kilitli ? 'genis' : yasSecenegi(aralik, ozelYas);
  const kategori = seciliKategori(ek);
  const eslenemeyen = b.acik.google ? konumlar.filter((k) => !k.google) : [];
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
    const secenek = YAS_SECENEKLERI.find((x) => x.kod === kod)!;
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
      <Soru baslik="Kimler görsün?">
        {b.a.konumlar?.kaynak === 'marka_merkezi' ? "Konum Marka Merkezi'ndeki kitleden geldi. " : ''}Gerisini platformların kendi sistemi
        bulur; ilgi alanı seçmen gerekmiyor.
      </Soru>
      <div className={s.kart}>
        <div className={s.blok}>
          <div className={s.blokBaslik}>
            Konum {b.a.konumlar?.kaynak === 'marka_merkezi' && <span className={s.onerilen}>Marka Merkezi&apos;nden</span>}
          </div>
          <div className={s.cipler}>
            {konumlar.map((k) => (
              <span key={`${k.tur}:${k.key}`} className={s.cip} aria-pressed="true">
                {k.etiket}
                {k.yaricapKm ? <small>+ {k.yaricapKm} km</small> : null}
                {b.acik.google && !k.google && <small>Google&apos;da eşlenmedi</small>}
                <button
                  type="button"
                  className={s.x}
                  aria-label={`${k.etiket} konumunu kaldır`}
                  onClick={() => konumlariYaz(konumlar.filter((x) => !(x.tur === k.tur && x.key === k.key)))}
                >
                  ✕
                </button>
              </span>
            ))}
            <button type="button" className={s.cip} aria-expanded={aramaAcik} onClick={() => setAramaAcik((v) => !v)}>
              + Konum ekle
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
            Yalnız bu bölgelerde <b>bulunan</b> kişilere gösterilir. Google&apos;ın &quot;bu bölgeyle ilgilenenler&quot; seçeneğini kapalı
            tutuyoruz: o seçenek reklamı yurt dışına da taşıyabiliyor.
          </p>
          {eslenemeyen.length > 0 && (
            <p className={esleme.tur === 'hata' ? s.hataMetni : s.ipucu} role="status">
              {esleme.tur === 'esleniyor'
                ? "Konumların Google'daki karşılığı aranıyor…"
                : esleme.tur === 'hata'
                  ? `Google karşılığı alınamadı: ${esleme.mesaj} `
                  : `${eslenemeyen.map((k) => k.etiket).join(', ')} için Google'da birebir karşılık bulunamadı; en yakını tahmin etmiyoruz, reklam başka bir şehre gidebilirdi. Konumu il ya da şehir adıyla yeniden ekle. `}
              {esleme.tur !== 'esleniyor' && (
                <button type="button" className={s.metinDugme} onClick={yenidenEsle}>
                  Yeniden dene
                </button>
              )}
            </p>
          )}
        </div>
        <div className={s.blok}>
          <div className={s.blokBaslik}>
            Yaş <span className={s.ops}>İsteğe bağlı</span>
          </div>
          <div className={s.secim}>
            {YAS_SECENEKLERI.map((x) => (
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
                <YasGirdisi etiket="En küçük yaş" deger={aralik?.min ?? 18} degisti={(v) => b.degistir([{ alan: 'yasAraligi', deger: { min: v, max: aralik?.max ?? 65 }, kaynak: 'kullanici' }])} />
                <YasGirdisi etiket="En büyük yaş (65 = 65 ve üzeri)" deger={aralik?.max ?? 65} degisti={(v) => b.degistir([{ alan: 'yasAraligi', deger: { min: aralik?.min ?? 18, max: v }, kaynak: 'kullanici' }])} />
              </div>
            </div>
          </div>
          <div className={s.gizlenir} data-acik={kilitli}>
            <div>
              <Uyari className={s.ustBosluk}>
                Konut, iş ilanı ve kredi reklamında iki platform da yaşı daraltmaya izin vermiyor. Yaşı 18 ve üzerine çektik; bu reklamda
                değiştirilemez.
              </Uyari>
            </div>
          </div>
        </div>
        <div className={s.blok}>
          <div className={s.blokBaslik}>
            Reklam şunlardan biriyle ilgili mi? <span className={s.ops}>Zorunlu · yasal kural</span>
          </div>
          <div className={`${s.secim} ${s.secimKategori}`}>
            {KATEGORI_SECENEKLERI.map((x) => (
              <button key={x.kod} type="button" aria-pressed={kategori === x.kod} onClick={() => kategoriSec(x.kod)}>
                {x.ad}
                {x.alt && <small>{x.alt}</small>}
              </button>
            ))}
          </div>
          {taban.length > 0 && (
            <p className={s.ipucu}>
              Workspace kaydında: <b>{taban.map((k) => OZEL_KATEGORI_ETIKETLERI[k]).join(', ')}</b>. Bu kategori bu workspace&apos;in her
              reklamına eklenir.
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
        .catch((e: unknown) => !iptal && setHal({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Konum araması düştü.' }));
    }, 350);
    return () => {
      iptal = true;
      clearTimeout(z);
    };
  }, [q, acik, hesap]);

  if (!hesap) {
    return (
      <p className={s.ipucu}>
        Konum araması Meta reklam hesabı üzerinden yapılıyor ve bu workspace&apos;e Meta hesabı atanmamış. Marka Merkezi &gt; Kitleler&apos;de
        kayıtlı konumlar buraya gelir.
      </p>
    );
  }
  return (
    <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className={s.girdi}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İl, ilçe ya da ülke ara" aria-label="Konum ara" tabIndex={acik ? 0 : -1} />
      </div>
      {hal.tur === 'kisa' && <p className={s.ipucu}>En az 2 harf yaz.</p>}
      {hal.tur === 'araniyor' && <p className={s.ipucu}>Aranıyor…</p>}
      {hal.tur === 'hata' && (
        <p className={s.hataMetni} role="alert">
          Konum araması düştü: {hal.mesaj}
        </p>
      )}
      {hal.tur === 'bitti' && hal.sonuc.length === 0 && <p className={s.ipucu}>&quot;{q.trim()}&quot; için eşleşen yer yok.</p>}
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
