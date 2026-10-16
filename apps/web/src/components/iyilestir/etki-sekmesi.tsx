'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Etki, EtkiAyrintisi, EtkiListesi } from '@advetics/shared';
import { ETKI_SAYFA_BOYUTU } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { useDil, useSozluk } from '@/dil/saglayici';
import { etkiSozlugu } from '@/dil/sozlukler/iyilestir-etki';
import {
  ETKI_GRAFIK,
  gorunumEtiketi,
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
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { MetrikKutulari } from '@/components/ui/metrik-kutulari';
import { AdHucresi, AracCubugu, Tablo } from '@/components/ui/tablo';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { BosDurum, HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';

/**
 * Sonuç noktası → ortak durum rozeti. YEŞİL YALNIZ "iyileşti" (`sonucRozeti`
 * kararı); "ölçüm bekleniyor" gri yuvarlak (taslak), "değişmedi/ölçülemedi"
 * gri kare (durdu). Öneri kartının etki satırı da bunu okuyor: iki ekran
 * aynı sonuca aynı noktayı göstersin.
 */
export const NOKTA_HALI: Record<Nokta, DurumHali> = {
  yesil: 'ok',
  kirmizi: 'hata',
  gri: 'dur',
  bos: 'taslak',
};

type AyrintiHali = { durum: 'yukleniyor' } | { durum: 'tamam'; ayrinti: EtkiAyrintisi } | { durum: 'hata'; mesaj: string };

/*
 * Ayrıntı kabı: DOM'DAN ÇIKMIYOR, yükseklik `grid-template-rows` geçişiyle
 * açılıyor (CLAUDE.md §3 Tasarım). Hareket azaltılmışsa geçiş yok.
 */
const AYRINTI_KAP =
  'grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 motion-reduce:transition-none data-[acik=true]:grid-rows-[1fr]';

/**
 * ═══ İYİLEŞTİR › ETKİSİ (Paket C, taslak `docs/etki/taslak.html`) ═══
 *
 * "Uyguladık, işe yaradı mı?" listesi: özet kutuları, süzgeç (Hepsi /
 * Ölçülüyor / Sonuçlanan), tablo, satır içi ayrıntı (kanıt + mini grafik)
 * ve "Ölçülmeyen değişiklikler". Kararlar `lib/etki.ts`te ve çalıştırılarak
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
  const { dil } = useDil();
  const d = useSozluk(etkiSozlugu).sekme;
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
        setSonuc({ durum: 'hata', mesaj: e instanceof ApiRequestError ? e.message : d.sunucuyaUlasilamadi });
      }
    },
    [clientId, d],
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
        [e.id]: { durum: 'hata', mesaj: err instanceof ApiRequestError ? err.message : d.sunucuyaUlasilamadi },
      }));
    }
  }

  const hal = etkiKutuHali(sonuc);

  return (
    <>
      {sonuc?.durum === 'tamam' && sonuc.liste.hatalar.length > 0 && (
        <Serit ton="hata" baslik={d.kaynakHatasi}>
          {sonuc.liste.hatalar.map((h) => `${h.kaynak}: ${h.mesaj}`).join(' · ')}
        </Serit>
      )}

      {sonListe && <OzetKutulari liste={sonListe} gorunum={gorunum} />}

      <Kart dolgu={false}>
        <AracCubugu
          sag={
            sonuc?.durum === 'tamam' && (
              <span className="text-12 text-ink-muted">
                {d.sonHesaplama(formatRelative(sonuc.liste.sonHesaplama, dil), sonuc.liste.toplam, sonuc.liste.etkiler.length)}
              </span>
            )
          }
        >
          <BolumluSecici
            etiket={d.suzgec}
            secili={gorunum}
            onSec={(g) => suz({ gorunum: g })}
            secenekler={(['hepsi', 'acik', 'kapali'] as const).map((g) => ({ deger: g, etiket: gorunumEtiketi(g, dil) }))}
          />
        </AracCubugu>

        {hal === 'yukleniyor' && (
          <div className="p-4">
            <Yukleniyor etiket={d.yukleniyor} />
          </div>
        )}

        {sonuc?.durum === 'hata' && (
          <div className="p-4">
            <HataDurumu
              baslik={d.okunamadi}
              mesaj={<>{d.sunucuCevabi} {sonuc.mesaj}</>}
              onTekrar={() => void yukle(sorgu.current)}
            />
          </div>
        )}

        {/*
         * BOŞ ve DOLU aynı tablodan: tablo satır yokken `bos`u (NEDENİYLE)
         * çiziyor ve sayfalama "0 / N" ile her iki hâlde de görünüyor.
         */}
        {(hal === 'bos' || hal === 'dolu') && sonuc?.durum === 'tamam' && (
          <Tablo<Etki>
            etiket={d.tabloEtiketi}
            satirlar={hal === 'dolu' ? sonuc.liste.etkiler : []}
            satirAnahtari={(e) => e.id}
            bos={hal === 'bos' ? <BosKutu neden={sonuc.liste.emptyReason} onHepsi={() => suz({ gorunum: 'hepsi' })} /> : undefined}
            sutunlar={[
              {
                anahtar: 'degisiklik',
                baslik: d.sutunDegisiklik,
                hucre: (e) => (
                  <EtkiHucresi etki={e} acik={acik.has(e.id)} ayrinti={ayrintilar[e.id] ?? null} />
                ),
              },
              {
                anahtar: 'sonuc',
                baslik: d.sutunSonuc,
                hucre: (e) => {
                  const r = sonucRozeti(e);
                  return <Rozet hal={NOKTA_HALI[r.nokta]}>{r.metin}</Rozet>;
                },
              },
              {
                anahtar: 'ayrinti',
                baslik: <span className="sr-only">{d.sutunAyrinti}</span>,
                sayi: true,
                hucre: (e) =>
                  ayrintiVar(e) ? (
                    <Dugme
                      ton="hayalet"
                      boyut="kucuk"
                      aria-expanded={acik.has(e.id)}
                      aria-controls={`etki-ayrinti-${e.id}`}
                      onClick={() => void ayrintiAc(e)}
                    >
                      {acik.has(e.id) ? d.kapat : d.sutunAyrinti}
                    </Dugme>
                  ) : null,
              },
            ]}
            sayfalama={sayfalamaBilgisi(sonuc.liste, sayfa, (n) => suz({ sayfa: n }))}
          />
        )}

        {sonListe && (
          <details className="group border-t border-line px-4 py-3 text-13 text-ink-muted">
            <summary className="cursor-pointer font-semibold text-ink">{d.olculmeyenler}</summary>
            <ul className="m-0 mt-2 grid list-disc gap-1 pl-5">
              {sonListe.olculmeyen.map((o) => (
                <li key={o.kod}>
                  <b className="text-ink">{o.ad}.</b> {o.neden}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Kart>
    </>
  );
}

function OzetKutulari({ liste, gorunum }: { liste: EtkiListesi; gorunum: EtkiGorunumu }) {
  const { dil } = useDil();
  const d = useSozluk(etkiSozlugu).sekme.ozet;
  const o = etkiOzeti(liste, gorunum);
  return (
    <MetrikKutulari
      kutular={[
        {
          anahtar: 'sonuclanan',
          ad: d.sonuclanan,
          deger: o.sonuclanan,
          ipucu: o.olculemedi > 0 ? d.olculemedi(o.olculemedi) : d.son60,
        },
        {
          anahtar: 'iyilesen',
          ad: d.iyilesen,
          deger: o.iyilesen ?? '-',
          ipucu: o.iyilesen === null ? d.listeEksik : d.degismeyenlereGore,
        },
        {
          anahtar: 'kotulesen',
          ad: d.kotulesen,
          deger: o.kotulesen ?? '-',
          ipucu: o.kotulesen === null ? d.listeEksik : d.hepsiGosteriliyor,
        },
        {
          anahtar: 'olculuyor',
          ad: d.olculuyor,
          deger: o.olculuyor,
          ipucu: o.siradaki ? d.siradaki(gunKisa(o.siradaki, dil)) : d.bekleyenYok,
        },
      ]}
    />
  );
}

function BosKutu({ neden, onHepsi }: { neden: EtkiListesi['emptyReason']; onHepsi: () => void }) {
  const { dil } = useDil();
  const d = useSozluk(etkiSozlugu).sekme;
  const b = bosMetni(neden, dil);
  return (
    <BosDurum
      baslik={b.baslik}
      neden={b.metin}
      eylem={
        b.suzgec && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={onHepsi}>
            {d.hepsineBak}
          </Dugme>
        )
      }
    />
  );
}

/**
 * Satırın ilk hücresi: başlık, yol, cümle ve AÇILIR AYRINTI. Ayrıntı ayrı
 * bir tablo satırı değil, bu hücrenin altında: `Tablo` satır başına tek
 * `<tr>` çiziyor ve ikinci bir satır eklemek ortak bileşeni değiştirmek
 * olurdu (Grup 3 sapması). İlk sütun tablonun en geniş sütunu.
 */
function EtkiHucresi({ etki, acik, ayrinti }: { etki: Etki; acik: boolean; ayrinti: AyrintiHali | null }) {
  const { dil } = useDil();
  const ekler = ekCumleler(etki, dil);
  const ayrintiId = `etki-ayrinti-${etki.id}`;
  return (
    <div className="min-w-0">
      <AdHucresi ad={satirBasligi(etki)} alt={satirYolu(etki, dil)} />
      <p className="m-0 mt-1 text-13 text-ink">
        {etki.cumle}
        {ekler.length > 0 && ` ${ekler.join(' ')}`}
      </p>
      {ayrintiVar(etki) && (
        <div className={AYRINTI_KAP} id={ayrintiId} data-acik={acik} aria-hidden={!acik} inert={!acik}>
          <div className="min-h-0 overflow-hidden">
            <div className="grid gap-4 pt-3 min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid content-start gap-2">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
                  {kanitKutulari(etki, dil).map((k) => (
                    <div key={k.baslik} className="grid gap-0.5 rounded-alan border border-line px-3 py-2">
                      <small className="text-12 text-ink-muted">{k.baslik}</small>
                      <b className="font-baslik text-14 font-bold tabular-nums text-ink">{k.deger}</b>
                      <small className="text-11 text-ink-muted">{k.alt}</small>
                    </div>
                  ))}
                </div>
                <p className="m-0 text-12 text-ink-muted">{dipnot(etki, dil)}</p>
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
  const d = useSozluk(etkiSozlugu).sekme;
  const t = useSozluk(etkiSozlugu).dipnot;
  const not = 'm-0 self-center text-12 text-ink-muted';
  if (!ayrinti || ayrinti.durum === 'yukleniyor') {
    return <p className={not}>{d.grafikYukleniyor}</p>;
  }
  if (ayrinti.durum === 'hata') {
    return (
      <p className="m-0 self-center text-12 text-danger-strong" role="alert">
        {d.grafikAlinamadi} {ayrinti.mesaj}
      </p>
    );
  }
  const seri = ayrinti.ayrinti.seri;
  const yollar = seri ? etkiGrafikYollari(seri) : null;
  if (!seri || !yollar) {
    return <p className={not}>{d.grafikYok}</p>;
  }
  const { W, H, ALT } = ETKI_GRAFIK;
  const metrik = etki.metrik === 'tiklama_basi_maliyet' ? t.metrikTiklama : t.metrikDonusum;
  return (
    <figure className="m-0 grid gap-1.5">
      <svg className="h-auto w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={d.grafikEtiketi(metrik, etki.kapsam.ad)}>
        <line x1={0} y1={ALT} x2={W} y2={ALT} className="stroke-line" />
        {yollar.degisiklikX !== null && (
          <>
            <line x1={yollar.degisiklikX} y1={6} x2={yollar.degisiklikX} y2={ALT} className="stroke-ink" strokeDasharray="3 3" />
            <text x={yollar.degisiklikX + 4} y={14} fontSize={9} className="fill-ink-muted">
              {d.degisiklik}
            </text>
          </>
        )}
        {yollar.kontrol && <path d={yollar.kontrol} className="fill-none stroke-ink-muted" strokeWidth={2} />}
        <path d={yollar.deney} className="fill-none stroke-ink" strokeWidth={2} />
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-11 text-ink-muted">
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="block h-0.5 w-2.5 bg-ink" />
          {etki.kapsam.ad}
        </span>
        {yollar.kontrol && etki.kontrolMetni && (
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="block h-0.5 w-2.5 bg-ink-muted" />
            {etki.kontrolMetni}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * "1 - 20 / 37": sessiz kesme yok, tek sayfada da yazıyor. Sayfa sınırı
 * sözleşmeden (`ETKI_SAYFA_BOYUTU`); ilk/son sayfada ok kapalı.
 */
function sayfalamaBilgisi(liste: EtkiListesi, sayfa: number, onSayfa: (n: number) => void) {
  const sayfaSayisi = Math.max(1, Math.ceil(liste.toplam / ETKI_SAYFA_BOYUTU));
  const bas = (sayfa - 1) * ETKI_SAYFA_BOYUTU;
  return {
    bas: liste.etkiler.length === 0 ? 0 : bas + 1,
    son: bas + liste.etkiler.length,
    toplam: liste.toplam,
    onceki: sayfa > 1 ? () => onSayfa(sayfa - 1) : undefined,
    sonraki: sayfa < sayfaSayisi ? () => onSayfa(sayfa + 1) : undefined,
  };
}
