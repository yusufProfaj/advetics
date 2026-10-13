'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Platform, Sinyal, SinyalListesi, SinyalUygulamaSonucu } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI, SINYAL_SAYFA_BOYUTU, SINYAL_TURU_ADI } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import {
  OLCUM_DONEMI_METNI,
  SINYAL_MINI,
  bosMetni,
  hesapDurumu,
  kontrolEdilmeyenler,
  platformCipleri,
  satirEylemi,
  sinyalEylemYolu,
  sinyalKaniti,
  sinyalKutuHali,
  sinyalListeYolu,
  sinyalMiniYolu,
  sinyalOzeti,
  sinyalRozetleri,
  sinyalYolu,
  sinyalIncelemeAdresi,
  type Nokta,
  type SinyalGorunumu,
  type SinyalSonucu,
} from '@/lib/sinyal';
import { hesaplarAdresi } from '@/lib/panel-adresleri';
import { SinyalDurdurPenceresi, SinyalKapatPenceresi } from './sinyal-pencereleri';
import i from '@/components/taslak/iyilestir.module.css';
import s from '@/components/taslak/taslak.module.css';

/** Satırın çıkış geçişi; taslakta 300 ms. */
const CIKIS_MS = 300;

const NOKTA: Record<Nokta, string> = { yesil: i.sNoktaYesil, gri: i.sNoktaGri, kirmizi: i.sNoktaKirmizi };

/**
 * ═══ İYİLEŞTİR › SİNYALLER (Paket A, taslak `docs/sinyal/taslak.html`) ═══
 *
 * "Bir şey ters gidince" listesi: özet şeridi, süzgeçler, satırlar, hesap
 * başına durum ve "kontrol edilmeyenler". Kararlar `lib/sinyal.ts`te ve
 * çalıştırılarak sınanıyor; burada yalnız çizim ve istek.
 *
 * BEŞ HÂL AYRI (`sinyalKutuHali`): yükleniyor, hata (sunucunun cümlesi),
 * ölçüm dönemi, boş (NEDENİYLE), dolu. `.catch(() => setX([]))` YOK: düşen
 * çağrı boş liste olsaydı "her şey yolunda" yalanını söylerdi.
 *
 * SÜZGEÇ SUNUCUDA: `toplam` ve sayfalama süzgeçten sonra sayılıyor; süzgeci
 * yalnız ekranda uygulamak "50 / 120" yazan bir listeyi süzüp sessizce
 * eksik sonuç göstermek olurdu (sunucu ilk 50'yi döndürüyor).
 *
 * İLK VERİ SUNUCU BİLEŞENİNDEN: sekme rozeti AYNI yanıttan; iki çağrı aynı
 * ekranda iki farklı sayı söyleyebilirdi. Süzgeç değişince istemci yeniden
 * istiyor; sıra numarası eski yanıtın yenisini ezmesini engelliyor.
 */
export function SinyallerSekmesi({
  clientId,
  ilk,
  yetki,
}: {
  clientId: string;
  ilk: SinyalSonucu;
  yetki: { butce: boolean; kural: boolean };
}) {
  const [gorunum, setGorunum] = useState<SinyalGorunumu>('acik');
  const [tur, setTur] = useState<'anomali' | 'saglik' | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [sonuc, setSonuc] = useState<SinyalSonucu | null>(ilk);
  // Özet ve hesaplar SON GELEN listeden: yükleniyorken ya da düşen bir
  // süzgeç isteğinde şerit boşalıp "0 açık sinyal" demesin.
  const [sonListe, setSonListe] = useState<SinyalListesi | null>(ilk.durum === 'tamam' ? ilk.liste : null);
  const [gidenler, setGidenler] = useState<ReadonlySet<string>>(new Set());
  const [satirHatalari, setSatirHatalari] = useState<Record<string, string>>({});
  const [geriAcilan, setGeriAcilan] = useState<string | null>(null);
  const [durdurulacak, setDurdurulacak] = useState<Sinyal | null>(null);
  const [kapatilacak, setKapatilacak] = useState<Sinyal | null>(null);
  const sira = useRef(0);
  const sorgu = useRef({ gorunum, tur, platform, sayfa });

  /*
   * SUNUCU YENİ İLK VERİ GÖNDERİNCE (router.refresh) yerel hâl sıfırlanıyor;
   * yoksa ekran yenilendiğini söyleyip eski listeyi gösterirdi.
   */
  useEffect(() => {
    setSonuc(ilk);
    setSonListe(ilk.durum === 'tamam' ? ilk.liste : null);
    setGorunum('acik');
    setTur(null);
    setPlatform(null);
    setSayfa(1);
    setGidenler(new Set());
    setSatirHatalari({});
    sorgu.current = { gorunum: 'acik', tur: null, platform: null, sayfa: 1 };
  }, [ilk]);

  /**
   * `sessiz`: kapat/durdur sonrası arka planda tazeleme; liste iskelete
   * dönmüyor (satır zaten çıkış geçişiyle gitti, ekran zıplamasın).
   */
  const yukle = useCallback(
    async (q: typeof sorgu.current, sessiz = false) => {
      sorgu.current = q;
      const benim = ++sira.current;
      if (!sessiz) setSonuc(null);
      try {
        const liste = await apiFetch<SinyalListesi>(sinyalListeYolu({ clientId, ...q }));
        if (benim !== sira.current) return;
        setSonuc({ durum: 'tamam', liste });
        setSonListe(liste);
        setGidenler(new Set());
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
    setTur(q.tur);
    setPlatform(q.platform);
    setSayfa(q.sayfa);
    void yukle(q);
  }

  const yenile = useCallback(() => void yukle(sorgu.current, true), [yukle]);

  /** Satır çıkış geçişiyle gidiyor, sonra liste sunucudan tazeleniyor (sayılar doğru kalsın). */
  const cikar = useCallback(
    (id: string) => {
      setGidenler((x) => new Set(x).add(id));
      setTimeout(() => void yukle(sorgu.current, true), CIKIS_MS);
    },
    [yukle],
  );

  const kapatPencereyi = useCallback(() => setKapatilacak(null), []);
  const durdurPencereyi = useCallback(() => setDurdurulacak(null), []);
  const durduruldu = useCallback(
    (r: SinyalUygulamaSonucu) => {
      if (r.sinyal.durum !== 'acik') cikar(r.sinyal.id);
      else yenile();
    },
    [cikar, yenile],
  );

  async function geriAc(sg: Sinyal) {
    setGeriAcilan(sg.id);
    setSatirHatalari(({ [sg.id]: _, ...kalan }) => kalan);
    try {
      await apiFetch<unknown>(sinyalEylemYolu(sg.id, 'geri-ac'), { method: 'POST', body: '{}' });
      cikar(sg.id);
    } catch (e) {
      setSatirHatalari((h) => ({
        ...h,
        [sg.id]: `Geri açılamadı: ${e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.'}`,
      }));
    } finally {
      setGeriAcilan(null);
    }
  }

  const hal = sinyalKutuHali(sonuc);

  return (
    <>
      {sonListe && <OzetSeridi liste={sonListe} gorunum={gorunum} />}

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
        <div className={s.kartUst}>
          <h2>Bir şey ters gidince</h2>
          <div className={i.cipler} style={{ marginLeft: 'auto' }} role="group" aria-label="Açık ya da kapalı">
            <button type="button" className={i.cip} aria-pressed={gorunum === 'acik'} onClick={() => suz({ gorunum: 'acik' })}>
              Açık
              {sonListe && <span className={i.say}>{sonListe.sayilar.acik}</span>}
            </button>
            <button type="button" className={i.cip} aria-pressed={gorunum === 'kapali'} onClick={() => suz({ gorunum: 'kapali' })}>
              Kapalı
              {sonListe && (
                <span className={i.say}>{sonListe.sayilar.kapatildi + sonListe.sayilar.kendiliginden_kapandi}</span>
              )}
            </button>
          </div>
        </div>

        <div className={i.sArac} role="group" aria-label="Süzgeç">
          <span className={i.sEtk}>Süzgeç</span>
          <button type="button" className={i.cip} aria-pressed={tur === null} onClick={() => suz({ tur: null })}>
            Tümü
          </button>
          {(['anomali', 'saglik'] as const).map((t) => (
            <button key={t} type="button" className={i.cip} aria-pressed={tur === t} onClick={() => suz({ tur: t })}>
              {SINYAL_TURU_ADI[t]}
            </button>
          ))}
          {sonListe && platformCipleri(sonListe).length > 0 && (
            <>
              <span className={i.sAyrac} />
              <span className={i.sEtk}>Platform</span>
              <button type="button" className={i.cip} aria-pressed={platform === null} onClick={() => suz({ platform: null })}>
                Hepsi
              </button>
              {platformCipleri(sonListe).map((p) => (
                <button key={p} type="button" className={i.cip} aria-pressed={platform === p} onClick={() => suz({ platform: p })}>
                  {PLATFORM_KISA_ADLARI[p]}
                </button>
              ))}
            </>
          )}
        </div>

        {sonuc?.durum === 'tamam' && sonuc.liste.sessizKosum && hal === 'dolu' && (
          <div className={i.sBant} role="status">
            <b>{OLCUM_DONEMI_METNI.baslik}.</b> {OLCUM_DONEMI_METNI.bant}
          </div>
        )}

        {hal === 'yukleniyor' && (
          <div className={i.sYukleniyor} aria-busy="true" aria-label="Sinyaller yükleniyor">
            <i style={{ width: '60%' }} />
            <i style={{ width: '80%' }} />
            <i style={{ width: '45%' }} />
          </div>
        )}

        {sonuc?.durum === 'hata' && (
          <div className={i.sHataKutu} role="alert">
            <b>Sinyaller alınamadı.</b> Sunucunun cevabı: {sonuc.mesaj}{' '}
            <button type="button" className={i.metin} onClick={() => void yukle(sorgu.current)}>
              Yeniden dene
            </button>
          </div>
        )}

        {hal === 'olcum_donemi' && (
          <div className={i.sBos}>
            <b>{OLCUM_DONEMI_METNI.baslik}</b>
            <p>{OLCUM_DONEMI_METNI.bos}</p>
          </div>
        )}

        {hal === 'bos' && sonuc?.durum === 'tamam' && (
          <BosKutu
            liste={sonuc.liste}
            gorunum={gorunum}
            clientId={clientId}
            onTemizle={() => suz({ tur: null, platform: null })}
            onKapali={() => suz({ gorunum: 'kapali' })}
          />
        )}

        {hal === 'dolu' &&
          sonuc?.durum === 'tamam' &&
          sonuc.liste.sinyaller.map((sg) => (
            <SinyalSatiri
              key={sg.id}
              sinyal={sg}
              yetki={yetki}
              gidiyor={gidenler.has(sg.id)}
              hata={satirHatalari[sg.id] ?? null}
              geriAciliyor={geriAcilan === sg.id}
              onDurdur={() => setDurdurulacak(sg)}
              onKapat={() => setKapatilacak(sg)}
              onGeriAc={() => void geriAc(sg)}
            />
          ))}

        {sonuc?.durum === 'tamam' && (
          <Sayfalama liste={sonuc.liste} sayfa={sayfa} onSayfa={(n) => suz({ sayfa: n })} />
        )}
      </div>

      {sonListe && <HesaplarKarti liste={sonListe} />}

      <SinyalDurdurPenceresi sinyal={durdurulacak} onKapat={durdurPencereyi} onSonuc={durduruldu} onYenile={yenile} />
      <SinyalKapatPenceresi sinyal={kapatilacak} onKapat={kapatPencereyi} onKapandi={cikar} onYenile={yenile} />
    </>
  );
}

function OzetSeridi({ liste, gorunum }: { liste: SinyalListesi; gorunum: SinyalGorunumu }) {
  const o = sinyalOzeti(liste, gorunum);
  return (
    <div className={s.kart}>
      <div className={i.ozet}>
        <div className={i.vurgu}>
          <small>Açık sinyal</small>
          <b className={s.num}>{o.acik}</b>
          <em>{o.yuksek === null ? 'önem dağılımı listede' : o.yuksek > 0 ? `${o.yuksek} yüksek önemli` : 'yüksek önemli yok'}</em>
        </div>
        <div>
          <small>Kapatılan</small>
          <b className={s.num}>{o.kapatildi}</b>
          <em>elle ya da durdurularak</em>
        </div>
        <div>
          <small>Kendiliğinden kapanan</small>
          <b className={s.num}>{o.kendiliginden}</b>
          <em>koşul bir daha görülmedi</em>
        </div>
        <div>
          <small>Son değerlendirme</small>
          <b className={s.num}>{o.sonHesaplama ? formatRelative(o.sonHesaplama) : 'hiç'}</b>
          <em>dünün verisiyle, hesap başına</em>
        </div>
      </div>
    </div>
  );
}

function BosKutu({
  liste,
  gorunum,
  clientId,
  onTemizle,
  onKapali,
}: {
  liste: SinyalListesi;
  gorunum: SinyalGorunumu;
  clientId: string;
  onTemizle: () => void;
  onKapali: () => void;
}) {
  const b = bosMetni(liste, gorunum);
  return (
    <div className={i.sBos}>
      <b>{b.baslik}</b>
      <p>{b.metin}</p>
      {b.eylem === 'suzgeci_temizle' && (
        <button type="button" className={i.ikincil} onClick={onTemizle}>
          Süzgeci temizle
        </button>
      )}
      {b.eylem === 'kapaliya_bak' && (
        <button type="button" className={i.ikincil} onClick={onKapali}>
          Kapalı sinyaller
        </button>
      )}
      {b.eylem === 'hesap_ata' && (
        <Link className={i.ikincil} href={hesaplarAdresi(clientId)}>
          Hesap ata
        </Link>
      )}
    </div>
  );
}

function SinyalSatiri({
  sinyal,
  yetki,
  gidiyor,
  hata,
  geriAciliyor,
  onDurdur,
  onKapat,
  onGeriAc,
}: {
  sinyal: Sinyal;
  yetki: { butce: boolean; kural: boolean };
  gidiyor: boolean;
  hata: string | null;
  geriAciliyor: boolean;
  onDurdur: () => void;
  onKapat: () => void;
  onGeriAc: () => void;
}) {
  const e = satirEylemi(sinyal, yetki);
  const kanit = sinyalKaniti(sinyal);
  const yol = sinyalYolu(sinyal);
  const ikon =
    sinyal.tur === 'saglik' ? (
      <span className={`${i.sIkon} ${i.sIkonSaglik}`} aria-label="Sağlık">
        +
      </span>
    ) : (
      <span
        className={`${i.sIkon} ${sinyal.onem === 'yuksek' ? i.sIkonYuksek : i.sIkonOrta}`}
        aria-label={sinyal.onem === 'yuksek' ? 'Yüksek önem' : 'Orta önem'}
      >
        !
      </span>
    );
  return (
    <div className={`${i.sSatir} ${gidiyor ? i.sGidiyor : ''}`}>
      {ikon}
      <div>
        <div>
          <span className={i.sBaslik}>{sinyal.baslik}</span>
          <span className={i.sRozetler}>
            {sinyalRozetleri(sinyal).map((r) => (
              <span key={r.metin} className={`${i.sRozet} ${r.vurgu ? i.sRozetVurgu : ''}`}>
                {r.metin}
              </span>
            ))}
          </span>
        </div>
        <div className={i.sYol}>
          {yol.slice(0, -1).join(' › ')} ›{' '}
          <Link href={sinyalIncelemeAdresi(sinyal)}>{yol[yol.length - 1]}</Link>
        </div>
        {kanit && (
          <div className={i.sKanit}>
            {kanit.gun} <b className={s.num}>{kanit.gozlenen}</b>
            {kanit.beklenen && (
              <>
                {' '}
                · beklenen <b className={s.num}>{kanit.beklenen.alt}</b> ile <b className={s.num}>{kanit.beklenen.ust}</b> arası
              </>
            )}
            {kanit.dipnot && ` (${kanit.dipnot})`}
            {sinyal.sapmaMetni && ` · ${sinyal.sapmaMetni}`}
          </div>
        )}
        {sinyal.neden && <div className={i.sNeden}>{sinyal.neden}</div>}
        {sinyal.durum !== 'acik' && sinyal.kapatma?.not && <div className={i.sNeden}>Not: “{sinyal.kapatma.not}”</div>}
        {e.kisit && <div className={i.sKisit}>{e.kisit}</div>}
        {hata && (
          <div className={i.sSatirHata} role="alert">
            {hata}
          </div>
        )}
      </div>
      <MiniGrafik sinyal={sinyal} />
      <div className={i.sEylemler}>
        {e.birincil?.tur === 'durdur' && (
          <button type="button" className={i.birincil} onClick={onDurdur}>
            Durdur
          </button>
        )}
        {e.birincil?.tur === 'bag' && (
          <Link className={i.ikincil} href={e.birincil.href}>
            {e.birincil.etiket}
          </Link>
        )}
        {(e.incele || e.kapatilabilir || e.geriAcilabilir) && (
          <div className={i.sYan}>
            {e.incele && (
              <Link className={i.metin} href={e.incele}>
                İncele
              </Link>
            )}
            {e.kapatilabilir && (
              <button type="button" className={i.metin} onClick={onKapat}>
                Kapat
              </button>
            )}
            {e.geriAcilabilir && (
              <button type="button" className={i.metin} onClick={onGeriAc} disabled={geriAciliyor}>
                {geriAciliyor ? 'Açılıyor…' : 'Geri aç'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Mini grafik; çizilemezse BOŞ YER (sütun hizası korunuyor), boş SVG değil. */
function MiniGrafik({ sinyal }: { sinyal: Sinyal }) {
  const m = sinyalMiniYolu(sinyal.seri);
  if (!m) return <figure className={i.sMiniK} aria-hidden="true" />;
  const { W, H } = SINYAL_MINI;
  return (
    <figure className={i.sMiniK}>
      <svg className={i.sMini} viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label="Geçmiş haftalar, beklenen aralık ve gözlenen gün">
        {m.bant && <rect x={0} y={m.bant.y} width={W} height={Math.max(m.bant.h, 1)} fill="var(--t-sunken)" />}
        <path d={m.cizgi} fill="none" stroke="var(--t-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        {m.son && <circle cx={m.son.x} cy={m.son.y} r={3.5} fill="var(--t-brand)" />}
      </svg>
      <figcaption className={i.sLejant}>
        {m.bant && (
          <span>
            <i style={{ background: 'var(--t-sunken)' }} />
            beklenen
          </span>
        )}
        <span>
          <i style={{ background: 'var(--t-brand)', borderRadius: '50%', width: 6 }} />
          gözlenen
        </span>
      </figcaption>
    </figure>
  );
}

/** "N / M gösteriliyor": sessiz kesme yok. Sayfa sınırı sözleşmeden (`SINYAL_SAYFA_BOYUTU`). */
function Sayfalama({ liste, sayfa, onSayfa }: { liste: SinyalListesi; sayfa: number; onSayfa: (n: number) => void }) {
  const sayfaSayisi = Math.max(1, Math.ceil(liste.toplam / SINYAL_SAYFA_BOYUTU));
  return (
    <div className={i.sSayfalama}>
      <span>
        Gösterilen <b className={s.num}>{liste.sinyaller.length}</b> / <b className={s.num}>{liste.toplam}</b>
        {sayfaSayisi > 1 && ` · sayfa ${sayfa} / ${sayfaSayisi}`}
      </span>
      {sayfaSayisi > 1 && (
        <>
          <button type="button" className={i.metin} disabled={sayfa <= 1} onClick={() => onSayfa(sayfa - 1)}>
            Önceki
          </button>
          <button type="button" className={i.metin} disabled={sayfa >= sayfaSayisi} onClick={() => onSayfa(sayfa + 1)}>
            Sonraki
          </button>
        </>
      )}
    </div>
  );
}

function HesaplarKarti({ liste }: { liste: SinyalListesi }) {
  const disarida = kontrolEdilmeyenler(liste.kontrolEdilmeyen);
  return (
    <div className={s.kart}>
      <div className={s.kartUst}>
        <h2>Hesaplar</h2>
        <span className={i.zaman}>Sinyaller her gece, hesabın günü kapanınca hesaplanır</span>
      </div>
      {liste.hesaplar.length === 0 ? (
        <p className={s.bosMetin}>Bu workspace’e atanmış reklam hesabı yok.</p>
      ) : (
        <div>
          {liste.hesaplar.map((h) => {
            const d = hesapDurumu(h, formatRelative);
            return (
              <div key={h.adAccountId} className={i.sHesap}>
                <span className={`${i.sNokta} ${NOKTA[d.nokta]}`} aria-hidden="true" />
                <b>
                  {h.adAccountAdi} · {PLATFORM_KISA_ADLARI[h.platform]}
                </b>
                <span>{d.metin}</span>
              </div>
            );
          })}
        </div>
      )}
      {disarida.length > 0 && (
        <details className={i.sDisarida}>
          <summary>Kontrol edilmeyenler ({disarida.length})</summary>
          <ul>
            {disarida.map((d) => (
              <li key={d.kod}>
                <b>{d.ad}:</b> {d.neden}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
