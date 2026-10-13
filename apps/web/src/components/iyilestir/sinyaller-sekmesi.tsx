'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Platform, Sinyal, SinyalListesi, SinyalUygulamaSonucu } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI, SINYAL_DURUM_ADI, SINYAL_SAYFA_BOYUTU, SINYAL_TURU_ADI } from '@advetics/shared';
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
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { MetrikKutulari } from '@/components/ui/metrik-kutulari';
import { AracCubugu, Tablo } from '@/components/ui/tablo';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { DurumNoktasi, Rozet, type DurumHali } from '@/components/ui/rozet';
import { BosDurum, HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';
import { AcilirMenu, IKON_TETIK, MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';

/** Satırın çıkış geçişi; taslakta 300 ms. */
const CIKIS_MS = 300;

/** Hesap durumu noktası → ortak durum noktası. Yeşil YALNIZ "hesaplandı" (`hesapDurumu`). */
const NOKTA: Record<Nokta, DurumHali> = { yesil: 'ok', gri: 'taslak', kirmizi: 'hata' };

/** Sinyal durumu → rozet. Açık sinyal kırmızı (bir şey ters gidiyor), kapalılar gri. */
const DURUM_HALI: Record<Sinyal['durum'], DurumHali> = { acik: 'hata', kapatildi: 'dur', kendiliginden_kapandi: 'taslak' };

/**
 * ═══ İYİLEŞTİR › SİNYALLER (Paket A, taslak `docs/sinyal/taslak.html`) ═══
 *
 * "Bir şey ters gidince" listesi: özet kutuları, süzgeçler, tablo, hesap
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
  const platformlar = sonListe ? platformCipleri(sonListe) : [];

  return (
    <>
      {sonListe && <OzetKutulari liste={sonListe} gorunum={gorunum} />}

      {sonuc?.durum === 'tamam' && sonuc.liste.hatalar.length > 0 && (
        <Serit ton="hata" baslik="Bazı kaynaklar okunamadı; liste eksik olabilir.">
          {sonuc.liste.hatalar.map((h) => `${h.kaynak}: ${h.mesaj}`).join(' · ')}
        </Serit>
      )}

      <Kart
        dolgu={false}
        baslik="Bir şey ters gidince"
        eylem={
          <BolumluSecici
            etiket="Açık ya da kapalı"
            secili={gorunum}
            onSec={(g) => suz({ gorunum: g })}
            secenekler={[
              {
                deger: 'acik' as const,
                etiket: (
                  <>
                    Açık
                    {sonListe && <span className="ml-1.5 tabular-nums text-ink-muted">{sonListe.sayilar.acik}</span>}
                  </>
                ),
              },
              {
                deger: 'kapali' as const,
                etiket: (
                  <>
                    Kapalı
                    {sonListe && (
                      <span className="ml-1.5 tabular-nums text-ink-muted">
                        {sonListe.sayilar.kapatildi + sonListe.sayilar.kendiliginden_kapandi}
                      </span>
                    )}
                  </>
                ),
              },
            ]}
          />
        }
      >
        {/*
         * SÜZGEÇLER tablonun üstünde. Tür ve platform küçük, sabit kümeler
         * (2-4 seçenek): uygulanmış süzgeç çipi (`Cip` ✕) yerine bölümlü
         * seçici, çünkü "Tümü" her an bir tıkla geri dönülebilen bir görünüm.
         */}
        <AracCubugu
          sag={
            sonuc?.durum === 'tamam' && (
              <span className="text-12 text-ink-muted">
                {sonuc.liste.toplam} sinyalden {sonuc.liste.sinyaller.length} tanesi gösteriliyor
              </span>
            )
          }
        >
          <BolumluSecici
            etiket="Süzgeç"
            secili={tur ?? 'hepsi'}
            onSec={(t) => suz({ tur: t === 'hepsi' ? null : t })}
            secenekler={[
              { deger: 'hepsi' as const, etiket: 'Tümü' },
              ...(['anomali', 'saglik'] as const).map((t) => ({ deger: t, etiket: SINYAL_TURU_ADI[t] })),
            ]}
          />
          {platformlar.length > 0 && (
            <BolumluSecici
              etiket="Platform"
              secili={platform ?? 'hepsi'}
              onSec={(p) => suz({ platform: p === 'hepsi' ? null : p })}
              secenekler={[
                { deger: 'hepsi' as const, etiket: 'Hepsi' },
                ...platformlar.map((p) => ({ deger: p, etiket: PLATFORM_KISA_ADLARI[p] })),
              ]}
            />
          )}
        </AracCubugu>

        {sonuc?.durum === 'tamam' && sonuc.liste.sessizKosum && hal === 'dolu' && (
          <div className="px-4 pt-4">
            <Serit ton="bilgi" baslik={`${OLCUM_DONEMI_METNI.baslik}.`}>
              {OLCUM_DONEMI_METNI.bant}
            </Serit>
          </div>
        )}

        {hal === 'yukleniyor' && (
          <div className="p-4">
            <Yukleniyor etiket="Sinyaller yükleniyor" />
          </div>
        )}

        {sonuc?.durum === 'hata' && (
          <div className="p-4">
            <HataDurumu
              baslik="Sinyaller alınamadı."
              mesaj={<>Sunucunun cevabı: {sonuc.mesaj}</>}
              onTekrar={() => void yukle(sorgu.current)}
            />
          </div>
        )}

        {hal === 'olcum_donemi' && (
          <div className="p-4">
            <BosDurum baslik={OLCUM_DONEMI_METNI.baslik} neden={OLCUM_DONEMI_METNI.bos} />
          </div>
        )}

        {/* BOŞ ve DOLU aynı tablodan: satır yoksa `bos` (NEDENİYLE), sayfalama her iki hâlde. */}
        {(hal === 'bos' || hal === 'dolu') && sonuc?.durum === 'tamam' && (
          <Tablo<Sinyal>
            etiket="Sinyaller"
            satirlar={hal === 'dolu' ? sonuc.liste.sinyaller : []}
            satirAnahtari={(sg) => sg.id}
            bos={
              hal === 'bos' ? (
                <BosKutu
                  liste={sonuc.liste}
                  gorunum={gorunum}
                  clientId={clientId}
                  onTemizle={() => suz({ tur: null, platform: null })}
                  onKapali={() => suz({ gorunum: 'kapali' })}
                />
              ) : undefined
            }
            sutunlar={[
              {
                anahtar: 'sinyal',
                baslik: 'Sinyal',
                hucre: (sg) => (
                  <Cikis gidiyor={gidenler.has(sg.id)}>
                    <SinyalHucresi sinyal={sg} yetki={yetki} hata={satirHatalari[sg.id] ?? null} />
                  </Cikis>
                ),
              },
              {
                anahtar: 'gecmis',
                baslik: 'Geçmiş',
                ikincil: true,
                hucre: (sg) => (
                  <Cikis gidiyor={gidenler.has(sg.id)}>
                    <MiniGrafik sinyal={sg} />
                  </Cikis>
                ),
              },
              {
                anahtar: 'durum',
                baslik: 'Durum',
                hucre: (sg) => (
                  <Cikis gidiyor={gidenler.has(sg.id)}>
                    <DurumRozeti sinyal={sg} />
                  </Cikis>
                ),
              },
              {
                anahtar: 'eylem',
                baslik: <span className="sr-only">Eylemler</span>,
                sayi: true,
                hucre: (sg) => (
                  <Cikis gidiyor={gidenler.has(sg.id)}>
                    <SatirEylemleri
                      sinyal={sg}
                      yetki={yetki}
                      geriAciliyor={geriAcilan === sg.id}
                      onDurdur={() => setDurdurulacak(sg)}
                      onKapat={() => setKapatilacak(sg)}
                      onGeriAc={() => void geriAc(sg)}
                    />
                  </Cikis>
                ),
              },
            ]}
            sayfalama={sayfalamaBilgisi(sonuc.liste, sayfa, (n) => suz({ sayfa: n }))}
          />
        )}
      </Kart>

      {sonListe && <HesaplarKarti liste={sonListe} />}

      <SinyalDurdurPenceresi sinyal={durdurulacak} onKapat={durdurPencereyi} onSonuc={durduruldu} onYenile={yenile} />
      <SinyalKapatPenceresi sinyal={kapatilacak} onKapat={kapatPencereyi} onKapandi={cikar} onYenile={yenile} />
    </>
  );
}

/**
 * SATIRIN ÇIKIŞ GEÇİŞİ hücre içeriğinde: `Tablo` satıra sınıf vermiyor
 * (ortak bileşen). Kapatılan satır 300 ms'de soluyor, sonra liste sunucudan
 * tazelenip satır düşüyor. Hareket azaltılmışsa geçiş yok.
 */
function Cikis({ gidiyor, children }: { gidiyor: boolean; children: ReactNode }) {
  return (
    <div className={`transition-opacity duration-300 motion-reduce:transition-none ${gidiyor ? 'opacity-0' : ''}`}>{children}</div>
  );
}

function OzetKutulari({ liste, gorunum }: { liste: SinyalListesi; gorunum: SinyalGorunumu }) {
  const o = sinyalOzeti(liste, gorunum);
  return (
    <MetrikKutulari
      kutular={[
        {
          anahtar: 'acik',
          ad: 'Açık sinyal',
          deger: o.acik,
          ipucu: o.yuksek === null ? 'önem dağılımı listede' : o.yuksek > 0 ? `${o.yuksek} yüksek önemli` : 'yüksek önemli yok',
        },
        { anahtar: 'kapatildi', ad: 'Kapatılan', deger: o.kapatildi, ipucu: 'elle ya da durdurularak' },
        { anahtar: 'kendiliginden', ad: 'Kendiliğinden kapanan', deger: o.kendiliginden, ipucu: 'koşul bir daha görülmedi' },
        {
          anahtar: 'son',
          ad: 'Son değerlendirme',
          deger: o.sonHesaplama ? formatRelative(o.sonHesaplama) : 'hiç',
          ipucu: 'dünün verisiyle, hesap başına',
        },
      ]}
    />
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
    <BosDurum
      baslik={b.baslik}
      neden={b.metin}
      eylem={
        <>
          {b.eylem === 'suzgeci_temizle' && (
            <Dugme ton="ikincil" boyut="kucuk" onClick={onTemizle}>
              Süzgeci temizle
            </Dugme>
          )}
          {b.eylem === 'kapaliya_bak' && (
            <Dugme ton="ikincil" boyut="kucuk" onClick={onKapali}>
              Kapalı sinyaller
            </Dugme>
          )}
          {b.eylem === 'hesap_ata' && (
            <Link className={dugmeSinifi('ikincil', 'kucuk')} href={hesaplarAdresi(clientId)}>
              Hesap ata
            </Link>
          )}
        </>
      }
    />
  );
}

/** Önem ikonu: yüksek kırmızı tonlu, orta çerçeveli, sağlık gri. Renk tek başına anlam taşımıyor (etiket). */
function OnemIkonu({ sinyal }: { sinyal: Sinyal }) {
  const taban = 'font-baslik grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-13 font-extrabold';
  if (sinyal.tur === 'saglik') {
    return (
      <span className={`${taban} bg-surface-sunken text-ink`} aria-label="Sağlık">
        +
      </span>
    );
  }
  return sinyal.onem === 'yuksek' ? (
    <span className={`${taban} bg-vurgu text-danger-strong`} aria-label="Yüksek önem">
      !
    </span>
  ) : (
    <span className={`${taban} border-2 border-ink text-ink`} aria-label="Orta önem">
      !
    </span>
  );
}

/**
 * Kapalı sinyalin KAPANIŞ rozeti ("Kapatıldı · Yusuf") Durum sütununda; aynı
 * metin ilk hücrede ikinci kez yazılmasın diye oradan düşülüyor.
 * `sinyalRozetleri` kapanış rozetini her zaman SONA koyuyor.
 */
function rozetleriAyir(sg: Sinyal) {
  const hepsi = sinyalRozetleri(sg);
  const kapanis = sg.durum !== 'acik' ? (hepsi.at(-1) ?? null) : null;
  return { ust: kapanis ? hepsi.slice(0, -1) : hepsi, kapanis };
}

function DurumRozeti({ sinyal }: { sinyal: Sinyal }) {
  const { kapanis } = rozetleriAyir(sinyal);
  return <Rozet hal={DURUM_HALI[sinyal.durum]}>{kapanis?.metin ?? SINYAL_DURUM_ADI[sinyal.durum]}</Rozet>;
}

function SinyalHucresi({
  sinyal,
  yetki,
  hata,
}: {
  sinyal: Sinyal;
  yetki: { butce: boolean; kural: boolean };
  hata: string | null;
}) {
  const e = satirEylemi(sinyal, yetki);
  const kanit = sinyalKaniti(sinyal);
  const yol = sinyalYolu(sinyal);
  const { ust } = rozetleriAyir(sinyal);
  return (
    <div className="flex min-w-0 gap-3">
      <OnemIkonu sinyal={sinyal} />
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <b className="text-14 font-bold text-ink">{sinyal.baslik}</b>
          {ust.map((r) => (
            <span
              key={r.metin}
              className={`inline-flex h-5 items-center rounded-full px-2 text-11 font-bold ${
                r.vurgu ? 'bg-vurgu text-danger-strong' : 'bg-surface-sunken text-ink-muted'
              }`}
            >
              {r.metin}
            </span>
          ))}
        </div>
        <div className="text-12 text-ink-muted">
          {yol.slice(0, -1).join(' › ')} ›{' '}
          <Link className="font-semibold text-ink no-underline hover:text-brand-strong hover:underline" href={sinyalIncelemeAdresi(sinyal)}>
            {yol[yol.length - 1]}
          </Link>
        </div>
        {kanit && (
          <div className="text-13 text-ink">
            {kanit.gun} <b className="font-baslik tabular-nums">{kanit.gozlenen}</b>
            {kanit.beklenen && (
              <>
                {' '}
                · beklenen <b className="font-baslik tabular-nums">{kanit.beklenen.alt}</b> ile{' '}
                <b className="font-baslik tabular-nums">{kanit.beklenen.ust}</b> arası
              </>
            )}
            {kanit.dipnot && ` (${kanit.dipnot})`}
            {sinyal.sapmaMetni && ` · ${sinyal.sapmaMetni}`}
          </div>
        )}
        {sinyal.neden && <p className="m-0 text-13 text-ink-muted">{sinyal.neden}</p>}
        {sinyal.durum !== 'acik' && sinyal.kapatma?.not && <p className="m-0 text-13 text-ink-muted">Not: “{sinyal.kapatma.not}”</p>}
        {e.kisit && <p className="m-0 text-12 text-ink-muted">{e.kisit}</p>}
        {hata && (
          <p className="m-0 text-12 text-danger-strong" role="alert">
            {hata}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Satır sonu: SIK EYLEM dışarıda tek düğme (Durdur ya da platforma bağlantı),
 * kalanlar ⋯ menüsünde (İncele, Kapat, Geri aç). Durdur KOYU: kırmızı dolu
 * düğme sayfada yalnız başlıktaki "Yeni kural".
 */
function SatirEylemleri({
  sinyal,
  yetki,
  geriAciliyor,
  onDurdur,
  onKapat,
  onGeriAc,
}: {
  sinyal: Sinyal;
  yetki: { butce: boolean; kural: boolean };
  geriAciliyor: boolean;
  onDurdur: () => void;
  onKapat: () => void;
  onGeriAc: () => void;
}) {
  const e = satirEylemi(sinyal, yetki);
  const menu = e.incele || e.kapatilabilir || e.geriAcilabilir;
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {e.birincil?.tur === 'durdur' && (
        <Dugme ton="koyu" boyut="kucuk" onClick={onDurdur}>
          Durdur
        </Dugme>
      )}
      {e.birincil?.tur === 'bag' && (
        <Link className={dugmeSinifi('ikincil', 'kucuk')} href={e.birincil.href}>
          {e.birincil.etiket}
        </Link>
      )}
      {menu && (
        <AcilirMenu
          tasma="portal"
          etiket={`${sinyal.baslik} eylemleri`}
          hizala="sag"
          genislik="w-52"
          tetik={({ acik: _acik, ...o }) => (
            <button type="button" {...o} aria-label={`${sinyal.baslik}: diğer eylemler`} className={IKON_TETIK}>
              <Ikon ad="nokta3" />
            </button>
          )}
        >
          {e.incele && <MenuOgesi href={e.incele}>İncele</MenuOgesi>}
          {e.geriAcilabilir && (
            <MenuOgesi onClick={onGeriAc} devreDisi={geriAciliyor}>
              {geriAciliyor ? 'Açılıyor' : 'Geri aç'}
            </MenuOgesi>
          )}
          {e.kapatilabilir && (
            <>
              {(e.incele || e.geriAcilabilir) && <MenuAyraci />}
              <MenuOgesi onClick={onKapat}>
                Kapat
              </MenuOgesi>
            </>
          )}
        </AcilirMenu>
      )}
    </span>
  );
}

/** Mini grafik; çizilemezse BOŞ YER (sütun hizası korunuyor), boş SVG değil. */
function MiniGrafik({ sinyal }: { sinyal: Sinyal }) {
  const m = sinyalMiniYolu(sinyal.seri);
  if (!m) return <figure className="m-0 w-[180px]" aria-hidden="true" />;
  const { W, H } = SINYAL_MINI;
  return (
    <figure className="m-0 grid w-[180px] gap-1">
      <svg className="h-auto w-full" viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label="Geçmiş haftalar, beklenen aralık ve gözlenen gün">
        {m.bant && <rect x={0} y={m.bant.y} width={W} height={Math.max(m.bant.h, 1)} className="fill-surface-sunken" />}
        <path d={m.cizgi} className="fill-none stroke-ink" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        {m.son && <circle cx={m.son.x} cy={m.son.y} r={3.5} className="fill-brand" />}
      </svg>
      <figcaption className="flex gap-3 text-11 text-ink-muted">
        {m.bant && (
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="block h-2 w-2.5 bg-surface-sunken" />
            beklenen
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="block h-1.5 w-1.5 rounded-full bg-brand" />
          gözlenen
        </span>
      </figcaption>
    </figure>
  );
}

/** "1 - 50 / 120": sessiz kesme yok. Sayfa sınırı sözleşmeden (`SINYAL_SAYFA_BOYUTU`). */
function sayfalamaBilgisi(liste: SinyalListesi, sayfa: number, onSayfa: (n: number) => void) {
  const sayfaSayisi = Math.max(1, Math.ceil(liste.toplam / SINYAL_SAYFA_BOYUTU));
  const bas = (sayfa - 1) * SINYAL_SAYFA_BOYUTU;
  return {
    bas: liste.sinyaller.length === 0 ? 0 : bas + 1,
    son: bas + liste.sinyaller.length,
    toplam: liste.toplam,
    onceki: sayfa > 1 ? () => onSayfa(sayfa - 1) : undefined,
    sonraki: sayfa < sayfaSayisi ? () => onSayfa(sayfa + 1) : undefined,
  };
}

function HesaplarKarti({ liste }: { liste: SinyalListesi }) {
  const disarida = kontrolEdilmeyenler(liste.kontrolEdilmeyen);
  return (
    <Kart dolgu={false} baslik="Hesaplar" baslikEki="Sinyaller her gece, hesabın günü kapanınca hesaplanır">
      <Tablo
        etiket="Hesaplar"
        satirlar={liste.hesaplar}
        satirAnahtari={(h) => h.adAccountId}
        bos={<BosDurum baslik="Hesap yok" neden="Bu workspace’e atanmış reklam hesabı yok." />}
        sutunlar={[
          {
            anahtar: 'hesap',
            baslik: 'Hesap',
            hucre: (h) => (
              <b className="font-semibold text-ink">
                {h.adAccountAdi} · {PLATFORM_KISA_ADLARI[h.platform]}
              </b>
            ),
          },
          {
            anahtar: 'durum',
            baslik: 'Durum',
            hucre: (h) => {
              const d = hesapDurumu(h, formatRelative);
              return (
                <span className="inline-flex items-center gap-2 text-13 text-ink">
                  <DurumNoktasi hal={NOKTA[d.nokta]} />
                  {d.metin}
                </span>
              );
            },
          },
        ]}
        sayfalama={{ bas: liste.hesaplar.length === 0 ? 0 : 1, son: liste.hesaplar.length, toplam: liste.hesaplar.length }}
      />
      {disarida.length > 0 && (
        <details className="border-t border-line px-4 py-3 text-13 text-ink-muted">
          <summary className="cursor-pointer font-semibold text-ink">Kontrol edilmeyenler ({disarida.length})</summary>
          <ul className="m-0 mt-2 grid list-disc gap-1 pl-5">
            {disarida.map((d) => (
              <li key={d.kod}>
                <b className="text-ink">{d.ad}:</b> {d.neden}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Kart>
  );
}
