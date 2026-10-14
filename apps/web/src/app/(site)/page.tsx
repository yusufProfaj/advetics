import type { Metadata } from 'next';
import Link from 'next/link';

import { FiyatPaketleri } from '@/components/landing/fiyat-paketleri';
import {
  BAGLANDIGI_YERLER,
  DEMO_MAILTO,
  GUVENLIK_OZETI,
  MODUL_BOLUMLERI,
  NASIL_CALISIR,
  ozellikAdresi,
} from '@/components/landing/site-icerik';
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
export const metadata: Metadata = {
  title: 'Advetics | Meta, Google ve LinkedIn reklamlarınız tek panelde',
  description:
    'Reklamcılık bilmeden reklam verin. Advetics hesaplarınızı izler, kampanyayı kurar, ' +
    'bütçeyi korur ve raporu kendisi gönderir. Siz yalnız onaylarsınız.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="kap modul">
          <div className="yazi">
            <UstBaslik>Meta · Google · LinkedIn için tek panel</UstBaslik>
            <TanitimBasligi>
              Ne yapılacağını söyler.
              <br />
              <em>Onaylarsanız yapar.</em>
            </TanitimBasligi>
            <p className="alt">
              {'Reklamcılık bilmeniz gerekmez. Advetics hesaplarınızı izler, kampanyayı kurar, ' +
                'bütçeyi korur ve raporu müşterinize kendisi gönderir. Siz yalnız onaylarsınız.'}
            </p>
            <div className="dgler">
              <a className={BIRINCIL} href={DEMO_MAILTO}>
                Demo Talep Et
              </a>
              <a className={IKINCIL} href="#tek-panel">
                Nasıl çalıştığını gör ↓
              </a>
            </div>
            <p className="not">Ekrandaki rakamlar örnektir.</p>
          </div>
          <HeroSahnesi />
        </div>
      </section>

      <div className="kap" id="entegrasyon">
        <ul className="platformlar" aria-label="Bağlandığı yerler">
          <li>
            <small>Bağlandığı yerler</small>
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
                <Link className="bag" href={ozellikAdresi(m.slug)}>
                  Ayrıntılar →
                </Link>
              </div>
              {Sahne && <Sahne />}
            </div>
          </section>
        );
      })}

      <section className="bolum" id="nasil-calisir">
        <div className="kap">
          <UstBaslik>Nasıl çalışır</UstBaslik>
          <h2 className="t-h2">Dört adımda yayında.</h2>
          <AdimListesi adimlar={NASIL_CALISIR} />
        </div>
      </section>

      <section className="bolum gri" id="guvenlik">
        <div className="kap modul">
          <div className="yazi">
            <UstBaslik>Güvenlik</UstBaslik>
            <h2 className="t-h2">Verileriniz sizde, ayrı ve korunuyor.</h2>
            <p className="alt">
              Her müşterinin verisi veritabanı düzeyinde ayrılır; bir müşterinin kullanıcısı diğerinin tek satırını
              göremez.
            </p>
            <Link className="bag" href="/guvenlik">
              Ayrıntılar →
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
          <UstBaslik>Fiyatlandırma</UstBaslik>
          <h2 className="t-h2">Üç paket. Taahhüt yok.</h2>
          <p className="alt">{"Reklam bütçeniz platforma doğrudan ödenir; Advetics'e yalnız abonelik ödersiniz."}</p>
        </div>
        <div className="kap">
          <FiyatPaketleri />
          <p className="fiyat-notu">
            <Link className="bag" href="/fiyatlandirma">
              Bütün özellikleri karşılaştır →
            </Link>
          </p>
        </div>
      </section>

      <section className="bolum gri">
        <div className="kap sss">
          <UstBaslik>Sık sorulanlar</UstBaslik>
          <h2 className="t-h2">Merak edilenler</h2>
          <SikSorulanlar />
        </div>
      </section>

      <KapanisBandi
        baslik="İlk raporunuz bu ay gitsin."
        metin="30 dakikalık demoda hesabınızı birlikte bağlayalım."
        giris={false}
      />
    </>
  );
}
