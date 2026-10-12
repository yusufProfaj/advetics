'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Etki, EtkiAyrintisi, EtkiListesi } from '@advetics/shared';
import { ETKI_SAYFA_BOYUTU } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import {
  ETKI_GRAFIK,
  GORUNUM_ETIKETI,
  ayrintiVar,
  bosMetni,
  dipnot,
  ekCumleler,
  etkiAyrintiYolu,
  etkiGrafikYollari,
  etkiKutuHali,
  etkiListeYolu,
  etkiOzeti,
  gunKisa,
  kanitKutulari,
  satirBasligi,
  satirYolu,
  sonucRozeti,
  type EtkiGorunumu,
  type EtkiSonucu,
  type Nokta,
} from '@/lib/etki';
import i from '@/components/taslak/iyilestir.module.css';
import s from '@/components/taslak/taslak.module.css';

export const NOKTA_SINIFI: Record<Nokta, string> = {
  yesil: i.sNoktaYesil,
  kirmizi: i.sNoktaKirmizi,
  gri: i.sNoktaGri,
  bos: i.eNoktaBos,
};

type AyrintiHali = { durum: 'yukleniyor' } | { durum: 'tamam'; ayrinti: EtkiAyrintisi } | { durum: 'hata'; mesaj: string };

/**
 * ═══ İYİLEŞTİR › ETKİSİ (Paket C, taslak `docs/etki/taslak.html`) ═══
 *
 * "Uyguladık, işe yaradı mı?" listesi: özet şeridi, süzgeç (Hepsi /
 * Ölçülüyor / Sonuçlanan), satırlar, ayrıntı (kanıt + mini grafik) ve
 * "Ölçülmeyen değişiklikler". Kararlar `lib/etki.ts`te ve çalıştırılarak
 * sınanıyor; burada yalnız çizim ve istek.
 *
 * DÖRT HÂL AYRI (`etkiKutuHali`): yükleniyor, hata (sunucunun cümlesi),
 * boş (NEDENİYLE), dolu. `.catch(() => setX([]))` YOK.
 *
 * SÜZGEÇ SUNUCUDA: `toplam` ve sayfalama süzgeçten sonra sayılıyor.
 * İlk veri sunucu bileşeninden; süzgeç değişince istemci yeniden istiyor ve
 * sıra numarası eski yanıtın yenisini ezmesini engelliyor.
 *
 * AYRINTI AÇILINCA SERİ İSTENİYOR, bir kez. Kanıt kutuları satırın kendi
 * verisinden (sunucu zaten gönderdi); yalnız grafik ayrı istek. Grafik
 * okunamazsa kanıt yine görünür ve grafik yerinde sunucunun cümlesi yazar.
 */
export function EtkiSekmesi({ clientId, ilk }: { clientId: string; ilk: EtkiSonucu }) {
  const [gorunum, setGorunum] = useState<EtkiGorunumu>('hepsi');
  const [sayfa, setSayfa] = useState(1);
  const [sonuc, setSonuc] = useState<EtkiSonucu | null>(ilk);
  // Özet SON GELEN listeden: süzgeç isteği sürerken ya da düşünce şerit
  // boşalıp "0 sonuçlanan" demesin.
  const [sonListe, setSonListe] = useState<EtkiListesi | null>(ilk.durum === 'tamam' ? ilk.liste : null);
  const [acik, setAcik] = useState<ReadonlySet<string>>(new Set());
  const [ayrintilar, setAyrintilar] = useState<Record<string, AyrintiHali>>({});
  const sira = useRef(0);
  const sorgu = useRef({ gorunum, sayfa });

  useEffect(() => {
    setSonuc(ilk);
    setSonListe(ilk.durum === 'tamam' ? ilk.liste : null);
    setGorunum('hepsi');
    setSayfa(1);
    setAcik(new Set());
    sorgu.current = { gorunum: 'hepsi', sayfa: 1 };
  }, [ilk]);

  const yukle = useCallback(
    async (q: typeof sorgu.current) => {
      sorgu.current = q;
      const benim = ++sira.current;
      setSonuc(null);
      try {
        const liste = await apiFetch<EtkiListesi>(etkiListeYolu({ clientId, durum: q.gorunum, sayfa: q.sayfa }));
        if (benim !== sira.current) return;
        setSonuc({ durum: 'tamam', liste });
        setSonListe(liste);
      } catch (e) {
        if (benim !== sira.current) return;
        setSonuc({ durum: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' });
      }
    },
    [clientId],
  );

  function suz(degisim: Partial<typeof sorgu.current>) {
    const q = { ...sorgu.current, sayfa: 1, ...degisim };
    setGorunum(q.gorunum);
    setSayfa(q.sayfa);
    void yukle(q);
  }

  async function ayrintiAc(e: Etki) {
    const yeni = new Set(acik);
    if (yeni.has(e.id)) {
      yeni.delete(e.id);
      setAcik(yeni);
      return;
    }
    yeni.add(e.id);
    setAcik(yeni);
    const var_ = ayrintilar[e.id];
    if (var_ && var_.durum !== 'hata') return;
    setAyrintilar((a) => ({ ...a, [e.id]: { durum: 'yukleniyor' } }));
    try {
      const ayrinti = await apiFetch<EtkiAyrintisi>(etkiAyrintiYolu(e.id));
      setAyrintilar((a) => ({ ...a, [e.id]: { durum: 'tamam', ayrinti } }));
    } catch (err) {
      setAyrintilar((a) => ({
        ...a,
        [e.id]: { durum: 'hata', mesaj: err instanceof ApiRequestError ? err.message : 'Sunucuya ulaşılamadı.' },
      }));
    }
  }

  const hal = etkiKutuHali(sonuc);

  return (
    <>
      {sonuc?.durum === 'tamam' && sonuc.liste.hatalar.length > 0 && (
        <div className={`${s.bildirim} ${s.tehlike}`} role="alert">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>Bazı kaynaklar okunamadı; liste eksik olabilir.</strong>{' '}
            {sonuc.liste.hatalar.map((h) => `${h.kaynak}: ${h.mesaj}`).join(' · ')}
          </span>
        </div>
      )}

      <div className={s.kart}>
        {sonListe && <OzetSeridi liste={sonListe} gorunum={gorunum} />}

        <div className={i.sArac} role="group" aria-label="Süzgeç">
          {(['hepsi', 'acik', 'kapali'] as const).map((g) => (
            <button key={g} type="button" className={i.cip} aria-pressed={gorunum === g} onClick={() => suz({ gorunum: g })}>
              {GORUNUM_ETIKETI[g]}
            </button>
          ))}
          {sonuc?.durum === 'tamam' && (
            <span className={i.zaman} style={{ marginLeft: 'auto' }}>
              Son hesaplama {formatRelative(sonuc.liste.sonHesaplama)} · {sonuc.liste.toplam} değişiklikten{' '}
              {sonuc.liste.etkiler.length} tanesi gösteriliyor
            </span>
          )}
        </div>

        {hal === 'yukleniyor' && (
          <div className={i.sYukleniyor} aria-busy="true" aria-label="Etkiler yükleniyor">
            <i style={{ width: '35%' }} />
            <i style={{ width: '85%' }} />
            <i style={{ width: '70%' }} />
          </div>
        )}

        {sonuc?.durum === 'hata' && (
          <div className={i.sHataKutu} role="alert">
            <b>Etkiler okunamadı.</b> Sunucunun cevabı: {sonuc.mesaj}{' '}
            <button type="button" className={i.metin} onClick={() => void yukle(sorgu.current)}>
              Yeniden dene
            </button>
          </div>
        )}

        {hal === 'bos' && sonuc?.durum === 'tamam' && (
          <BosKutu neden={sonuc.liste.emptyReason} onHepsi={() => suz({ gorunum: 'hepsi' })} />
        )}

        {hal === 'dolu' &&
          sonuc?.durum === 'tamam' &&
          sonuc.liste.etkiler.map((e) => (
            <EtkiSatiri key={e.id} etki={e} acik={acik.has(e.id)} ayrinti={ayrintilar[e.id] ?? null} onAc={() => void ayrintiAc(e)} />
          ))}

        {sonuc?.durum === 'tamam' && <Sayfalama liste={sonuc.liste} sayfa={sayfa} onSayfa={(n) => suz({ sayfa: n })} />}

        {sonListe && (
          <details className={i.sDisarida}>
            <summary>Ölçülmeyen değişiklikler</summary>
            <ul>
              {sonListe.olculmeyen.map((o) => (
                <li key={o.kod}>
                  <b>{o.ad}.</b> {o.neden}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}

function OzetSeridi({ liste, gorunum }: { liste: EtkiListesi; gorunum: EtkiGorunumu }) {
  const o = etkiOzeti(liste, gorunum);
  return (
    <div className={i.ozet} style={{ borderBottom: '1px solid var(--t-line)' }}>
      <div>
        <small>Sonuçlanan</small>
        <b className={s.num}>{o.sonuclanan}</b>
        <em>{o.olculemedi > 0 ? `${o.olculemedi} tanesi ölçülemedi` : 'son 60 gün'}</em>
      </div>
      <div>
        <small>İyileşen</small>
        <b className={s.num}>{o.iyilesen ?? '-'}</b>
        <em>{o.iyilesen === null ? 'listenin tamamı görünmüyor' : 'değişmeyenlere göre'}</em>
      </div>
      <div>
        <small>Kötüleşen</small>
        <b className={s.num}>{o.kotulesen ?? '-'}</b>
        <em>{o.kotulesen === null ? 'listenin tamamı görünmüyor' : 'hepsi gösteriliyor'}</em>
      </div>
      <div>
        <small>Ölçülüyor</small>
        <b className={s.num}>{o.olculuyor}</b>
        <em>{o.siradaki ? `sıradaki ${gunKisa(o.siradaki)}` : 'bekleyen ölçüm yok'}</em>
      </div>
    </div>
  );
}

function BosKutu({ neden, onHepsi }: { neden: EtkiListesi['emptyReason']; onHepsi: () => void }) {
  const b = bosMetni(neden);
  return (
    <div className={i.sBos}>
      <b>{b.baslik}</b>
      <p>{b.metin}</p>
      {b.suzgec && (
        <button type="button" className={i.ikincil} onClick={onHepsi}>
          Hepsine bak
        </button>
      )}
    </div>
  );
}

function EtkiSatiri({
  etki,
  acik,
  ayrinti,
  onAc,
}: {
  etki: Etki;
  acik: boolean;
  ayrinti: AyrintiHali | null;
  onAc: () => void;
}) {
  const r = sonucRozeti(etki);
  const ekler = ekCumleler(etki);
  const ayrintiId = `etki-ayrinti-${etki.id}`;
  return (
    <div className={i.eSatir}>
      <div className={i.eUst}>
        <div>
          <div className={i.eNe}>{satirBasligi(etki)}</div>
          <div className={i.sYol}>{satirYolu(etki)}</div>
          <div className={i.eCumle}>
            {etki.cumle}
            {ekler.length > 0 && ` ${ekler.join(' ')}`}
          </div>
        </div>
        <span className={i.eSonuc}>
          <span className={`${i.sNokta} ${NOKTA_SINIFI[r.nokta]}`} aria-hidden="true" />
          {r.metin}
        </span>
        {ayrintiVar(etki) ? (
          <button type="button" className={i.metin} aria-expanded={acik} aria-controls={ayrintiId} onClick={onAc}>
            {acik ? 'Kapat' : 'Ayrıntı'}
          </button>
        ) : (
          <span />
        )}
      </div>
      {ayrintiVar(etki) && (
        <div className={i.eAyrinti} id={ayrintiId} data-acik={acik} aria-hidden={!acik}>
          <div>
            <div className={i.eAyrintiIc}>
              <div>
                <div className={`${i.eKanit} ${s.num}`}>
                  {kanitKutulari(etki).map((k) => (
                    <div key={k.baslik}>
                      <small>{k.baslik}</small>
                      <b>{k.deger}</b>
                      <em>{k.alt}</em>
                    </div>
                  ))}
                </div>
                <div className={i.eDipnot}>{dipnot(etki)}</div>
              </div>
              <Grafik etki={etki} ayrinti={ayrinti} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Grafik({ etki, ayrinti }: { etki: Etki; ayrinti: AyrintiHali | null }) {
  if (!ayrinti || ayrinti.durum === 'yukleniyor') {
    return <div className={i.eGrafikNot}>Grafik yükleniyor.</div>;
  }
  if (ayrinti.durum === 'hata') {
    return <div className={i.eGrafikNot} role="alert">Grafik alınamadı: {ayrinti.mesaj}</div>;
  }
  const seri = ayrinti.ayrinti.seri;
  const yollar = seri ? etkiGrafikYollari(seri) : null;
  if (!seri || !yollar) {
    return <div className={i.eGrafikNot}>Bu ölçümün günlük grafiği yok (günlük metrik hesaplanamadı).</div>;
  }
  const { W, H, ALT } = ETKI_GRAFIK;
  const metrik = etki.metrik === 'tiklama_basi_maliyet' ? 'tıklama başı maliyet' : 'dönüşüm başı maliyet';
  return (
    <figure style={{ margin: 0 }}>
      <svg className={i.eGrafik} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Günlük ${metrik}: ${etki.kapsam.ad} ve değişmeyenler`}>
        <line x1={0} y1={ALT} x2={W} y2={ALT} stroke="var(--t-line)" />
        {yollar.degisiklikX !== null && (
          <>
            <line x1={yollar.degisiklikX} y1={6} x2={yollar.degisiklikX} y2={ALT} stroke="var(--t-ink)" strokeDasharray="3 3" />
            <text x={yollar.degisiklikX + 4} y={14} fontSize={9} fill="var(--t-ink-muted)">
              değişiklik
            </text>
          </>
        )}
        {yollar.kontrol && <path d={yollar.kontrol} fill="none" stroke="var(--t-ink-muted)" strokeWidth={2} />}
        <path d={yollar.deney} fill="none" stroke="var(--t-ink)" strokeWidth={2} />
      </svg>
      <figcaption className={i.sLejant}>
        <span>
          <i style={{ background: 'var(--t-ink)', height: 2 }} />
          {etki.kapsam.ad}
        </span>
        {yollar.kontrol && etki.kontrolMetni && (
          <span>
            <i style={{ background: 'var(--t-ink-muted)', height: 2 }} />
            {etki.kontrolMetni}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** "N / M gösteriliyor": sessiz kesme yok. Sayfa sınırı sözleşmeden (`ETKI_SAYFA_BOYUTU`). */
function Sayfalama({ liste, sayfa, onSayfa }: { liste: EtkiListesi; sayfa: number; onSayfa: (n: number) => void }) {
  const sayfaSayisi = Math.max(1, Math.ceil(liste.toplam / ETKI_SAYFA_BOYUTU));
  if (sayfaSayisi <= 1) return null;
  return (
    <div className={i.sSayfalama}>
      <span>
        Gösterilen <b className={s.num}>{liste.etkiler.length}</b> / <b className={s.num}>{liste.toplam}</b> · sayfa {sayfa} / {sayfaSayisi}
      </span>
      <button type="button" className={i.metin} disabled={sayfa <= 1} onClick={() => onSayfa(sayfa - 1)}>
        Önceki
      </button>
      <button type="button" className={i.metin} disabled={sayfa >= sayfaSayisi} onClick={() => onSayfa(sayfa + 1)}>
        Sonraki
      </button>
    </div>
  );
}
