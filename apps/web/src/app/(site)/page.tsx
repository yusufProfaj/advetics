import type { Metadata } from 'next';
import Link from 'next/link';

import { FiyatPaketleri } from '@/components/landing/fiyat-paketleri';
import { sec } from '@advetics/shared';
import { ozellikAdresi, siteIcerigi } from '@/components/landing/site-icerik';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { yerelYol } from '@/lib/site-yollari';
import {
  AdimListesi,
  BIRINCIL,
  IKINCIL,
  KapanisBandi,
  SikSorulanlar,
  TanitimBasligi,
  UstBaslik,
} from '@/components/landing/site-parcalari';
import { HeroSahnesi, OZELLIK_SAHNELERI } from '@/components/landing/simulasyon';

/**
 * Tanıtım sitesinin ana sayfası.
 *
 * Buradan önce kök `/` doğrudan `/dashboard`'a yönleniyordu ve middleware
 * oturumsuz isteği `/login`'e atıyordu: advetics.com adresine gelen herkes
 * login ekranı görüyordu.
 *
 * 2026-10-14: onaylı taslak (`docs/site/taslak.html`). Kaydırmayla ilerleyen
 * hero filmi KALKTI (5,3 MB video ve rakam yazamayan bir model); yerine her
 * modülün paneli taklit eden küçük bir sahnesi var. Sıra: hero (Genel Bakış
 * sahnesi), bağlandığı yerler, sekiz modül (sağ/sol ve gri/beyaz
 * dönüşümlü), nasıl çalışır, güvenlik, fiyat özeti, sık sorulanlar,
 * kapanış. Her modül kendi özellik sayfasına bağlanıyor; menü yine ayrı
 * sayfalara gidiyor.
 *
 * Sayfa SUNUCUDA render ediliyor. İstemciye inen parçalar yalnız sahneler,
 * fiyat kartları ve "nasıl çalışır" çizgisi; başlıklar, metin ve
 * bağlantılar statik HTML.
 *
 * MÜŞTERİ HİKÂYESİ BÖLÜMÜ BİLEREK YOK: gerçek bir müşteri yorumu ya da
 * logo elimizde değil ve uydurulmuş bir güven işareti ilk görüşmede çürür.
 * Sahnelerdeki adlar ve rakamlar ÖRNEK ve sayfada bu yazıyor.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dil = await dilAl();
  const d = sec(siteArayuzSozlugu, dil).ana;
  return { title: d.metaBaslik, description: d.metaAciklama, alternates: dilBaglantilari('/', dil) };
}

export default async function HomePage() {
  const dil = await dilAl();
  const d = sec(siteArayuzSozlugu, dil);
  const a = d.ana;
  const { BAGLANDIGI_YERLER, DEMO_MAILTO, GUVENLIK_OZETI, MODUL_BOLUMLERI, NASIL_CALISIR } = siteIcerigi(dil);
  return (
    <>
      <section className="hero">
        <div className="kap modul">
          <div className="yazi">
            <UstBaslik>{a.ust}</UstBaslik>
            <TanitimBasligi>
              {a.baslik1}
              <br />
              <em>{a.baslik2}</em>
            </TanitimBasligi>
            <p className="alt">
              {a.alt}
            </p>
            <div className="dgler">
              <a className={BIRINCIL} href={DEMO_MAILTO}>
                {d.ortak.demoTalep}
              </a>
              <a className={IKINCIL} href="#tek-panel">
                {a.nasilGor}
              </a>
            </div>
            <p className="not">{d.ortak.rakamlarOrnek}</p>
          </div>
          <HeroSahnesi />
        </div>
      </section>

      <div className="kap" id="entegrasyon">
        <ul className="platformlar" aria-label={a.baglandigiYerler}>
          <li>
            <small>{a.baglandigiYerler}</small>
          </li>
          {BAGLANDIGI_YERLER.map((ad) => (
            <li key={ad}>{ad}</li>
          ))}
        </ul>
      </div>

      {MODUL_BOLUMLERI.map((m, i) => {
        const Sahne = OZELLIK_SAHNELERI[m.slug];
        // Taslak: ilk bölüm metin SAĞDA ("ters"), sonra dönüşümlü; zemin beyaz/gri dönüşümlü.
        const ters = i % 2 === 0;
        return (
          <section key={m.slug} id={m.slug} className={`bolum${i % 2 === 1 ? ' gri' : ''}`}>
            <div className={`kap modul${ters ? ' ters' : ''}`}>
              <div className="yazi">
                <UstBaslik>{m.ust}</UstBaslik>
                <h2 className="t-h2">{m.baslik}</h2>
                <p className="alt">{m.metin}</p>
                <ul className="maddeler">
                  {m.maddeler.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <Link className="bag" href={ozellikAdresi(m.slug, dil)}>
                  {d.ortak.ayrintilar}
                </Link>
              </div>
              {Sahne && <Sahne />}
            </div>
          </section>
        );
      })}

      <section className="bolum" id="nasil-calisir">
        <div className="kap">
          <UstBaslik>{a.nasilCalisir}</UstBaslik>
          <h2 className="t-h2">{a.dortAdim}</h2>
          <AdimListesi adimlar={NASIL_CALISIR} />
        </div>
      </section>

      <section className="bolum gri" id="guvenlik">
        <div className="kap modul">
          <div className="yazi">
            <UstBaslik>{a.guvenlik}</UstBaslik>
            <h2 className="t-h2">{a.guvenlikBaslik}</h2>
            <p className="alt">{a.guvenlikMetin}</p>
            <Link className="bag" href={yerelYol('/guvenlik', dil)}>
              {d.ortak.ayrintilar}
            </Link>
          </div>
          <ul className="guvenlik-kartlari">
            {GUVENLIK_OZETI.map((g) => (
              <li key={g.baslik} className="kart">
                <b className="mont">{g.baslik}</b>
                <p>{g.metin}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bolum" id="fiyat">
        <div className="kap ortali">
          <UstBaslik>{a.fiyat}</UstBaslik>
          <h2 className="t-h2">{a.ucPaket}</h2>
          <p className="alt">{a.fiyatAlt}</p>
        </div>
        <div className="kap">
          <FiyatPaketleri />
          <p className="fiyat-notu">
            <Link className="bag" href={yerelYol('/fiyatlandirma', dil)}>
              {a.karsilastir}
            </Link>
          </p>
        </div>
      </section>

      <section className="bolum gri">
        <div className="kap sss">
          <UstBaslik>{a.sss}</UstBaslik>
          <h2 className="t-h2">{a.merakEdilenler}</h2>
          <SikSorulanlar />
        </div>
      </section>

      <KapanisBandi
        baslik={a.kapanisBaslik}
        metin={a.kapanisMetin}
        giris={false}
      />
    </>
  );
}
