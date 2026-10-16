'use client';

import { BolumluSecici } from '@/components/ui/sekmeler';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Pencere } from '@/components/ui/pencere';
import Link from 'next/link';
import { useState } from 'react';
import {
  REHBER_AMACLARI,
  VARSAYILAN_META_PAYI,
  butceBol,
  type PlatformYayinOzeti,
  type Dil,
  type RehberPlatformu,
  type RehberProvaSonucu,
  type RehberYayinDurumu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import { useDil, useSozluk } from '@/dil/saglayici';
import { reklamKontrolSozlugu } from '@/dil/sozlukler/reklam-kontrol';
import { reklamSozlugu } from '@/dil/sozlukler/reklam';
import { AltCubuk, Soru, Uyari, type AdimBaglami } from './adim-ortak';
import type { MedyaBilgisi } from './adim-reklam';
import { IKON, Ikon } from './ikonlar';
import {
  alanAdi,
  ctaMetni,
  bugun,
  geriAlinabilirMi,
  yenidenDenenebilirMi,
  yenidenDenemeEtiketi,
  yenidenOkunabilirMi,
  yayinSonucuEtiketi,
  kurulumAdimlari,
  geriAlMetinleri,
  kategoriOzeti,
  paraGoster,
  REHBER_PLATFORM_ADI,
  sonEkranOzeti,
  provaGosterimi,
  sureGoster,
  tarihGoster,
  yayinAdimlari,
  yayinSonucu,
  type EkranNo,
  type ProvaGosterimi,
} from './rehber-mantik';
import s from './rehber.module.css';

export interface ProvaHali {
  sonuc: RehberProvaSonucu | null;
  suruyor: boolean;
  hata: string | null;
}

const PLATFORM_ADI = REHBER_PLATFORM_ADI;

type Sozluk = typeof reklamKontrolSozlugu.tr;

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Kontrol
// ─────────────────────────────────────────────────────────────────────────────

export function AdimKontrol({
  b,
  git,
  prova,
  provaEt,
  yayinlanabilir,
  onayAc,
  medyaBilgisi,
}: {
  b: AdimBaglami;
  git: (n: EkranNo) => void;
  prova: ProvaHali;
  provaEt: () => void;
  yayinlanabilir: boolean;
  onayAc: () => void;
  medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>;
}) {
  const { dil } = useDil();
  const d = useSozluk(reklamKontrolSozlugu);
  const [metaKip, setMetaKip] = useState<'akis' | 'hikaye'>('akis');
  const [googleKip, setGoogleKip] = useState<'arama' | 'mobil'>('arama');
  const amac = b.a.amac?.deger ?? null;
  const m = b.a.metin?.deger;
  const basliklar = (m?.basliklar ?? []).map((x) => x.trim()).filter(Boolean);
  const aciklamalar = (m?.aciklamalar ?? []).map((x) => x.trim()).filter(Boolean);
  const ilkMedya = b.a.medya?.deger[0];
  // Videoda SEÇİLİ kapak (B10); kapak bilgisi yoksa videonun türetilmiş bilgisi.
  const gorsel = ilkMedya ? ((ilkMedya.kapakVarlikId ? medyaBilgisi.get(ilkMedya.kapakVarlikId) : undefined) ?? medyaBilgisi.get(ilkMedya.varlikId)) : undefined;
  const yt = b.a.youtubeVideo?.deger ?? null;
  const hesapAdi =
    b.h.instagramHesaplari.find((x) => x.id === b.a.instagramId?.deger)?.ad ?? b.h.sayfalar.find((x) => x.id === b.a.sayfaId?.deger)?.ad ?? d.sayfaYok;
  const engel = b.kayit.eksikler.filter((e) => e.seviye === 'engel').length;
  const kurgu = amac ? REHBER_AMACLARI[amac].google.kurgu : null;
  const kararSutunlari = (['meta', 'google'] as const).filter((p) => b.kayit.kararlar.some((k) => k[p] !== null));

  return (
    <>
      <Soru adim={6} baslik={d.soru}>
        {d.onizleme(b.acik.meta && b.acik.google)}
      </Soru>
      <div className={s.onizlemeler}>
        {b.acik.meta && (
          <div className={`${s.kart} ${s.onKart}`}>
            <header>
              {d.metaOnizleme}
              <BolumluSecici
                etiket={d.metaBicim}
                secili={metaKip}
                onSec={setMetaKip}
                secenekler={[
                  { deger: 'akis', etiket: d.akis },
                  { deger: 'hikaye', etiket: d.hikaye },
                ]}
              />
            </header>
            <div className={s.telefon}>
              <div className={s.akisUst}>
                <i />
                <div>
                  <b>{hesapAdi}</b>
                  <small>{d.sponsorlu}</small>
                </div>
              </div>
              {metaKip === 'akis' && <div className={s.akisMetin}>{m?.anaMetin || d.anaMetinYok}</div>}
              <div className={s.akisGorsel} data-kip={metaKip}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {gorsel && <img src={gorsel.onizleme} alt="" />}
              </div>
              <div className={s.akisCta}>
                <b>{basliklar[0] ?? d.baslikYok}</b>
                {/* S3: adressiz video düğmesiz kuruluyor; önizleme olmayan düğmeyi çizmesin. */}
                {!(amac === 'VIDEO' && !b.a.hedefAdres?.deger) && <span>{ctaMetni(amac ?? 'SITE', dil)}</span>}
              </div>
            </div>
          </div>
        )}
        {b.acik.google && (
          <div className={`${s.kart} ${s.onKart}`}>
            <header>
              {d.googleOnizleme}
              {kurgu === 'ARAMA' && (
                <BolumluSecici
                  etiket={d.googleBicim}
                  secili={googleKip}
                  onSec={setGoogleKip}
                  secenekler={[
                    { deger: 'arama', etiket: d.arama },
                    { deger: 'mobil', etiket: d.mobil },
                  ]}
                />
              )}
            </header>
            {kurgu === 'ARAMA' ? (
              <>
                <div className={s.arama} data-kip={googleKip}>
                  <div className={s.rk}>
                    <b>{d.sponsorlu}</b> · {alanAdi(b.a.hedefAdres?.deger) || d.siteAdresiYok}
                  </div>
                  <h4>{basliklar.slice(0, 2).join(' | ') || d.baslikYok}</h4>
                  <p>{aciklamalar[0] ?? d.aciklamaYok}</p>
                </div>
                <p className={s.ipucu} style={{ margin: '0 14px 14px' }}>
                  {d.googleDener}
                </p>
              </>
            ) : kurgu === 'TALEP_YARATMA_VIDEO' ? (
              // B15: kimlik değil VİDEONUN KENDİSİ (başlık, küçük resim, süre):
              // kullanıcı yanlış videoyu kimlikten tanıyamazdı.
              <div style={{ margin: 14 }}>
                {yt ? (
                  <div className={s.dosya}>
                    {yt.kucukResim ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={yt.kucukResim} alt="" className={s.kucuk} />
                    ) : (
                      <div className={s.kucuk} />
                    )}
                    <div>
                      <b>{yt.baslik || yt.videoId}</b>
                      <small>{[sureGoster(yt.sureSn), yt.gizlilik === 'unlisted' ? d.listeDisi : null].filter(Boolean).join(' · ') || d.youtubeVideosu}</small>
                    </div>
                    <span />
                  </div>
                ) : (
                  <p className={s.ipucu}>{d.videoYok}</p>
                )}
                <p className={s.ipucu}>{d.youtubeGorunum}</p>
              </div>
            ) : (
              <p className={s.ipucu} style={{ margin: 14 }}>
                {d.googleYerlesim}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={s.kart}>
        <details className={s.ac}>
          <summary>
            {d.kararlar} <span className={s.ops}>{d.kararlarEk}</span>
            <Ikon d={IKON.asagi} className={s.ok} boyut={16} />
          </summary>
          <div className={s.tabloKap}>
            {b.kayit.kararlar.length === 0 ? (
              <p className={s.ipucu} style={{ margin: 16 }}>
                {d.kararlarBos}
              </p>
            ) : (
              <table className={s.kararlar}>
                <thead>
                  <tr>
                    <th>{d.karar}</th>
                    {kararSutunlari.map((p) => (
                      <th key={p}>{PLATFORM_ADI[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.kayit.kararlar.map((k) => (
                    <tr key={k.kod}>
                      <td>{k.konu}</td>
                      {kararSutunlari.map((p) => {
                        const h = k[p];
                        return (
                          <td key={p}>
                            {h ? h.deger : '—'}
                            {h?.not && <small>{h.not}</small>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </div>

      <div className={s.kart}>
        <div className={s.prova}>
          {(['meta', 'google'] as const)
            .filter((p) => b.acik[p])
            .map((p) => (
              <ProvaSatiri key={p} ad={PLATFORM_ADI[p]} d={d} g={provaGosterimi(prova.sonuc, b.kayit.icerikOzeti, p, prova.suruyor)} />
            ))}
        </div>
        {prova.hata && (
          <p className={s.hataMetni} role="alert" style={{ margin: '0 16px 12px' }}>
            {prova.hata}
          </p>
        )}
      </div>

      <AltCubuk git={git} adim={6} not={!yayinlanabilir ? (engel > 0 ? d.eksikVar(engel) : d.onceProva) : undefined}>
        <Dugme
          ton="ikincil"
          bekliyor={prova.suruyor}
          disabled={engel > 0}
          title={engel > 0 ? d.eksikVar(engel) : undefined}
          onClick={provaEt}
        >
          {prova.suruyor ? d.proveEdiliyor : d.proveEt}
        </Dugme>
        <Dugme
          disabled={!yayinlanabilir}
          title={!yayinlanabilir ? (engel > 0 ? d.eksikVar(engel) : d.onceProva) : undefined}
          onClick={onayAc}
        >
          {d.yayinla}
        </Dugme>
      </AltCubuk>
    </>
  );
}

function ProvaSatiri({ ad, g, d }: { ad: string; g: ProvaGosterimi; d: Sozluk }) {
  const nokta = g.tur === 'gecti' ? s.ok : g.tur === 'suruyor' ? s.donuyor : g.tur === 'reddetti' ? s.ret : '';
  const metin =
    g.tur === 'yok'
      ? d.prova.yok
      : g.tur === 'suruyor'
        ? d.prova.suruyor
        : g.tur === 'bayat'
          ? d.prova.bayat
          : g.tur === 'gecti'
            ? d.prova.gecti(g.not ?? null)
            : g.tur === 'reddetti'
              ? d.prova.reddetti(g.mesajlar.join(' · '))
              : d.prova.yapilmadi(g.sebep);
  return (
    <div>
      <span className={`${s.durumNokta} ${nokta}`} />
      <div>
        <b>{d.prova.baslik(ad)}</b>
        <br />
        <small>{metin}</small>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onay penceresi (İyileştir'deki desen): DOM'dan çıkmaz, görünürlük geçişle
// ─────────────────────────────────────────────────────────────────────────────

export function OnayPenceresi({
  acik,
  b,
  yayin,
  gonderiliyor,
  hata,
  denemePlatformlari,
  onayla,
  kapat,
}: {
  acik: boolean;
  b: AdimBaglami;
  yayin: RehberYayinDurumu | null;
  gonderiliyor: boolean;
  hata: string | null;
  /** `deneme` açılışındaki platformlar: kurulur, geri okunur, AÇILMAZ. */
  denemePlatformlari: RehberPlatformu[];
  onayla: () => void;
  kapat: () => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(reklamKontrolSozlugu);
  const suruyor = gonderiliyor || (yayin !== null && yayin.uyum?.tur !== 'durdu' && yayin.platformlar.some((p) => yayinSonucu(p) === 'suruyor'));
  const butce = b.a.butce?.deger;
  const baslangic = b.a.takvim?.deger.baslangic;
  const acikPlatformlar = (['meta', 'google'] as const).filter((p) => b.acik[p]);
  const amacKodu = b.a.amac?.deger ?? null;
  const hepsiDeneme = acikPlatformlar.length > 0 && acikPlatformlar.every((p) => denemePlatformlari.includes(p));

  const ne = butce ? `${butce.tip === 'gunluk' ? d.onay.gunluk : d.onay.toplam} ${paraGoster(butce.micros, b.paraBirimi)}` : '';
  // Geçmiş başlangıç "hemen": Meta onu kurulum anına çekiyor (N-09); geçmiş
  // bir günü yazmak harcamanın ne zaman başladığı konusunda yalan söylerdi.
  const ne_zaman = !baslangic || baslangic <= bugun(b.saatDilimi) ? d.onay.hemen : d.onay.tarihinde(tarihGoster(baslangic, dil));

  return (
    <Pencere
      acik={acik}
      onKapat={() => !suruyor && kapat()}
      baslik={d.onay.baslik}
      altEylemler={
        <>
          <Dugme ton="ikincil" disabled={suruyor} onClick={kapat}>
            {d.onay.vazgec}
          </Dugme>
          <Dugme bekliyor={suruyor} disabled={yayin !== null} onClick={onayla}>
            {suruyor ? d.onay.kuruluyor : d.onay.onayla}
          </Dugme>
        </>
      }
    >
      <div className={s.onayGovde}>
        <p>
          {hepsiDeneme ? (
            <>
              {d.onay.denemeOn}<b>{d.onay.denemeKalin}</b>{d.onay.denemeSon(ne)}
            </>
          ) : (
            <>
              {d.onay.normalOn(ne_zaman)}<b>{ne}</b>{d.onay.normalSon}
              {denemePlatformlari.length > 0 && d.onay.denemePlatform(denemePlatformlari.map((p) => PLATFORM_ADI[p]).join(dil === 'en' ? ' and ' : ' ve '))}
            </>
          )}
        </p>
        {yayin?.uyum?.tur === 'durdu' && (
          <Uyari>
            {d.onay.durduruldu(yayin.uyum.bulgular.map((x) => x.metin).join(' '))}
          </Uyari>
        )}
        <p>
          {d.onay.ozelKategori} <b>{kategoriOzeti(b.a, dil)}</b>
        </p>
        {hata && <Uyari>{hata}</Uyari>}
        {acikPlatformlar.map((p) => {
          const ozet: PlatformYayinOzeti | undefined = yayin?.platformlar.find((x) => x.platform === p);
          const haller = ozet ? yayinAdimlari(ozet.durum) : (['bekliyor', 'bekliyor', 'bekliyor'] as const);
          return (
            <div key={p} className={s.pltAdim}>
              <h4>{PLATFORM_ADI[p]}</h4>
              <ul className={s.adimlar}>
                {kurulumAdimlari(p, amacKodu ? REHBER_AMACLARI[amacKodu].google.kurgu : null, dil).map((t, i) => (
                  <li key={t} data-hal={haller[i]}>
                    <i />
                    {i === 2 && haller[2] === 'atlandi' ? d.onay.birakildi : t}
                  </li>
                ))}
              </ul>
              {ozet?.sebep && yayinSonucu(ozet) === 'hata' && <p className={s.adimSebep}>{ozet.sebep}</p>}
            </div>
          );
        })}
      </div>
    </Pencere>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Son ekran
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "VAZGEÇ VE ARŞİVLE / KALDIR" — duraklatılmış ya da durmuş kurulumu
 * Advetics'ten geri almak: Meta'da arşiv, Google'da kaldırma (metinler
 * `geriAlMetinleri`). Canlı turda (2026-10-10) bu yol yoktu: deneme kurulumu Meta'dan
 * elle arşivlendi ve kayıt "duraklatılmış" kaldı. Onay SATIR İÇİNDE (tek
 * tıkla arşiv yok); sonuç sunucudan yoklanır, "gönderildi" bir sonuç değil.
 * Hata platformun kendi cümlesiyle görünür.
 */
function GeriAl({ rehberId, ozet, guncelle }: { rehberId: string; ozet: PlatformYayinOzeti; guncelle: (y: RehberYayinDurumu) => void }) {
  const { dil } = useDil();
  const d = useSozluk(reklamKontrolSozlugu);
  const dr = useSozluk(reklamSozlugu);
  const [hal, setHal] = useState<'bos' | 'onay' | 'gonderiliyor' | 'hata'>('bos');
  const [hata, setHata] = useState<string | null>(null);
  const m = geriAlMetinleri(ozet.platform, dil);
  async function arsivle() {
    setHal('gonderiliyor');
    setHata(null);
    try {
      await apiFetch(`/reklam/yayinlar/${encodeURIComponent(ozet.yayinId!)}/geri-al`, { method: 'POST' });
      // İş kuyrukta: durum değişene kadar yokla (en çok ~45 sn).
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const y = await apiFetch<RehberYayinDurumu>(`/reklam/rehberler/${encodeURIComponent(rehberId)}/yayin`);
        const p = y.platformlar.find((x) => x.platform === ozet.platform);
        if (p && (p.durum !== ozet.durum || (p.sebep ?? '') !== (ozet.sebep ?? ''))) {
          guncelle(y);
          if (p.durum !== 'arsivlendi') {
            setHata(p.sebep ?? m.basarisiz);
            return setHal('hata');
          }
          return setHal('bos');
        }
      }
      setHata(m.cevapYok);
      setHal('hata');
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : dr.ortak.sunucuYok);
      setHal('hata');
    }
  }
  if (hal === 'onay' || hal === 'gonderiliyor') {
    return (
      <div className={s.geriAlOnay} role="group" aria-label={d.geriAlOnayi}>
        <span>{m.onay}</span>
        <Dugme ton="tehlike" boyut="kucuk" bekliyor={hal === 'gonderiliyor'} onClick={() => void arsivle()}>
          {hal === 'gonderiliyor' ? m.suruyor : m.eylem}
        </Dugme>
        <Dugme ton="ikincil" boyut="kucuk" disabled={hal === 'gonderiliyor'} onClick={() => setHal('bos')}>
          {d.vazgec}
        </Dugme>
      </div>
    );
  }
  return (
    <div className={s.geriAlOnay}>
      <Dugme ton="ikincil" boyut="kucuk" onClick={() => setHal('onay')}>
        {m.dugme}
      </Dugme>
      {hal === 'hata' && hata && (
        <span className={s.hataMetni} role="alert">
          {hata}
        </span>
      )}
    </div>
  );
}

/**
 * "Yeniden kontrol et": Meta'daki kurulumu yeniden okuyup karşılaştırır
 * (`POST /yayinlar/:id/yeniden-oku`). Temiz çıkarsa yayın kaldığı yerden
 * ilerler; sonuç sunucudan yoklanır, düşerse sunucunun sebebi görünür.
 */
function YenidenKontrol({ rehberId, ozet, guncelle }: { rehberId: string; ozet: PlatformYayinOzeti; guncelle: (y: RehberYayinDurumu) => void }) {
  const d = useSozluk(reklamKontrolSozlugu);
  const dr = useSozluk(reklamSozlugu);
  const [hal, setHal] = useState<'bos' | 'suruyor' | 'hata'>('bos');
  const [hata, setHata] = useState<string | null>(null);
  async function kontrol() {
    setHal('suruyor');
    setHata(null);
    try {
      await apiFetch(`/reklam/yayinlar/${encodeURIComponent(ozet.yayinId!)}/yeniden-oku`, { method: 'POST' });
      // Okuma düşerse sunucu 0/3/10 sn yeniden deniyor: en çok ~60 sn yokla.
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const y = await apiFetch<RehberYayinDurumu>(`/reklam/rehberler/${encodeURIComponent(rehberId)}/yayin`);
        const p = y.platformlar.find((x) => x.platform === ozet.platform);
        if (p && p.durum !== 'dogrulanamadi' && p.durum !== 'geri_okuma' && p.durum !== 'tekillik_kapisi') {
          guncelle(y);
          return setHal('bos');
        }
      }
      setHata(d.yenidenKontrol.yine);
      setHal('hata');
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : dr.ortak.sunucuYok);
      setHal('hata');
    }
  }
  return (
    <div className={s.geriAlOnay}>
      <Dugme ton="ikincil" boyut="kucuk" disabled={hal === 'suruyor'} onClick={() => void kontrol()}>
        {hal === 'suruyor' ? d.yenidenKontrol.suruyor : d.yenidenKontrol.etiket}
      </Dugme>
      {hal === 'hata' && hata && (
        <span className={s.hataMetni} role="alert">
          {hata}
        </span>
      )}
    </div>
  );
}

/**
 * "Yeniden dene": sunucunun yeniden kurulabilir dediği platformları
 * (`yenidenKurulabilir`) prova edip kurar; başlamış platforma dokunulmaz.
 * Meta provası kuyrukta: sonuç `GET /prova` ile yoklanır, hepsi geçince aynı
 * içeriğin özetiyle yayınlanır. Prova reddederse platformun cümlesi görünür.
 */
function YenidenDene({ rehberId, platformlar, guncelle }: { rehberId: string; platformlar: PlatformYayinOzeti[]; guncelle: (y: RehberYayinDurumu) => void }) {
  const { dil } = useDil();
  const d = useSozluk(reklamKontrolSozlugu);
  const dr = useSozluk(reklamSozlugu);
  const [hal, setHal] = useState<'bos' | 'suruyor' | 'hata'>('bos');
  const [hata, setHata] = useState<string | null>(null);
  const etiket = yenidenDenemeEtiketi(platformlar, dil);
  const hedefler = platformlar.filter(yenidenDenenebilirMi).map((p) => p.platform);
  const yol = `/reklam/rehberler/${encodeURIComponent(rehberId)}`;
  async function dene() {
    setHal('suruyor');
    setHata(null);
    try {
      let p = await apiFetch<RehberProvaSonucu>(`${yol}/prova`, { method: 'POST', body: '{}' });
      // Meta provası kuyrukta: en çok ~2 dk yokla.
      for (let i = 0; i < 40 && hedefler.some((x) => p[x]?.tur === 'bekliyor'); i++) {
        await new Promise((r) => setTimeout(r, 3000));
        // Boş gövde (prova kaydı yok) = null; o turda son bilineni koru.
        const okunan = (await apiFetch<RehberProvaSonucu | null>(`${yol}/prova`)) ?? null;
        if (okunan) p = okunan;
      }
      const sorunlar = hedefler.flatMap((x) => {
        const r = p[x];
        if (r?.tur === 'gecti') return [];
        const metin = r?.tur === 'reddetti' ? r.mesajlar.join(' ') : r?.tur === 'yapilmadi' ? r.sebep : d.yenidenDene.bitmedi;
        return [`${PLATFORM_ADI[x]}: ${metin}`];
      });
      if (sorunlar.length) {
        setHata(sorunlar.join(' '));
        return setHal('hata');
      }
      guncelle(await apiFetch<RehberYayinDurumu>(`${yol}/yayinla`, { method: 'POST', body: JSON.stringify({ icerikOzeti: p.icerikOzeti }) }));
      setHal('bos');
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : dr.ortak.sunucuYok);
      setHal('hata');
    }
  }
  if (!etiket) return null;
  return (
    <div className={s.geriAlOnay} style={{ padding: '0 16px 12px' }}>
      <Dugme ton="ikincil" boyut="kucuk" disabled={hal === 'suruyor'} onClick={() => void dene()}>
        {hal === 'suruyor' ? d.yenidenDene.suruyor : etiket}
      </Dugme>
      {hal === 'hata' && hata && (
        <span className={s.hataMetni} role="alert">
          {hata}
        </span>
      )}
    </div>
  );
}

export function SonEkran({
  b,
  yayin,
  yeniReklam,
  yenidenKur,
  yeniHata,
  rehberId,
  yayinGuncelle,
}: {
  b: AdimBaglami;
  yayin: RehberYayinDurumu | null;
  yeniReklam: () => void;
  /** Aynı içerikle yeni taslak (takvim hariç, `kopyalanacakAlanlar`). */
  yenidenKur: () => void;
  yeniHata: string | null;
  rehberId: string;
  yayinGuncelle: (y: RehberYayinDurumu) => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(reklamKontrolSozlugu);
  const amac = b.a.amac?.deger ?? null;
  const platformlar = yayin?.platformlar ?? [];
  const sonuclar = platformlar.map((p) => yayinSonucu(p));
  const uyumDurdu = yayin?.uyum?.tur === 'durdu';
  const ozet = sonEkranOzeti(
    platformlar.map((p, i) => ({ platform: p.platform, sonuc: sonuclar[i]! })),
    uyumDurdu,
    dil,
  );
  const hal = ozet.hal;
  const butce = b.a.butce?.deger;
  const pay =
    butce && BigInt(butce.micros) > 0n && (b.acik.meta || b.acik.google)
      ? butceBol(BigInt(butce.micros), b.acik, b.a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI, b.paraBirimi)
      : null;
  const ok = b.h.onKosullar;
  const yonetici = baglanti(REKLAM_YONETICISI, { musteri: b.clientId });

  return (
    <>
      <div className={s.kart}>
        <div className={s.kuruldu}>
          <div className={s.buyuk} data-hal={hal === 'arsiv' ? 'dur' : hal}>
            <Ikon d={hal === 'hata' ? IKON.kapat : IKON.tik} boyut={26} />
          </div>
          <h2>{ozet.baslik}</h2>
          <p>{ozet.metin}</p>
        </div>
        {uyumDurdu && yayin?.uyum?.tur === 'durdu' && (
          <div style={{ padding: '0 16px 12px' }}>
            <Uyari>{yayin.uyum.bulgular.map((x) => x.metin).join(' ')}</Uyari>
          </div>
        )}
        {platformlar.map((p, i) => {
          const sonuc = sonuclar[i]!;
          const tanim = amac ? REHBER_AMACLARI[amac] : null;
          const kurulacak = tanim ? (p.platform === 'meta' ? tanim.meta.kurulacak : tanim.google.kurgu !== null ? tanim.google.kurulacak : '') : '';
          const tutar = pay && butce ? `${butce.tip === 'gunluk' ? d.onay.gunluk : d.onay.toplam} ${paraGoster(pay[p.platform], b.paraBirimi)}` : null;
          return (
            <div key={p.platform} className={s.sonucSatir}>
              <div className={`${s.karo} ${s.gri} ${s.karoKucuk}`}>
                <Ikon d={p.platform === 'meta' ? IKON.meta : IKON.google} />
              </div>
              <div>
                <b>{PLATFORM_ADI[p.platform]}</b>
                {kurulacak && ` · ${kurulacak}`}
                <small>
                  {[p.kampanyaKimligi ? d.son.kampanya(p.kampanyaKimligi) : null, tutar].filter(Boolean).join(' · ') || ' '}
                  {sonuc === 'hata' && p.sebep ? ` · ${p.sebep}` : ''}
                </small>
                {/* Durdurmayan geri okuma notları: karşılama mesajı farkı (uyarı) ve Advantage+ durumu (bilgi). */}
                {(p.geriOkumaNotlari ?? []).map((n) => (
                  <small key={n.metin} className={n.tur === 'uyari' ? s.hataMetni : undefined}>
                    {n.metin}
                  </small>
                ))}
              </div>
              <span className={s.yayinda} data-hal={sonuc === 'yayinda' ? undefined : sonuc === 'hata' ? 'hata' : 'dur'}>
                <i />
                {yayinSonucuEtiketi(p, dil)}
              </span>
              {yenidenOkunabilirMi(p) && <YenidenKontrol rehberId={rehberId} ozet={p} guncelle={yayinGuncelle} />}
              {geriAlinabilirMi(p) && <GeriAl rehberId={rehberId} ozet={p} guncelle={yayinGuncelle} />}
            </div>
          );
        })}
        <YenidenDene rehberId={rehberId} platformlar={platformlar} guncelle={yayinGuncelle} />
        <div className={s.sonDugmeler}>
          <Link href={yonetici} className={dugmeSinifi('koyu')}>
            {d.son.yoneticideGor}
          </Link>
          <Dugme ton="ikincil" onClick={yenidenKur}>
            {d.son.ayniIcerik}
          </Dugme>
          <Dugme ton="ikincil" onClick={yeniReklam}>
            {d.son.yeniReklam}
          </Dugme>
        </div>
        {yeniHata && (
          <p className={s.hataMetni} role="alert" style={{ margin: '0 16px 12px', textAlign: 'center' }}>
            {d.son.yeniAcilamadi(yeniHata)}
          </p>
        )}
      </div>
      <div className={s.kart}>
        <h3 className={s.kartBaslik}>{d.son.iyilestirmek}</h3>
        <ul className={s.yapilacak}>
          {b.acik.meta && ok.metaSatisOlcumu === false && (
            <li>{d.son.pikselYok}</li>
          )}
          {b.acik.google && ok.googleDonusumEtkin === false && <li>{d.son.googleDonusum}</li>}
          <li>
            {d.son.ilkSonuclar}
            <Link href={baglanti('/iyilestir', { musteri: b.clientId })}>{d.son.iyilestir}</Link>
          </li>
        </ul>
      </div>
    </>
  );
}
