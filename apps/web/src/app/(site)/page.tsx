import type { Metadata } from 'next';
import Link from 'next/link';

import { KaydirmaFilmi } from '@/components/landing/kaydirma-filmi';
import {
  COZUMLER,
  DEMO_MAILTO,
  ENTEGRASYON_GRUPLARI,
  GUVENLIK,
  SENARYOLAR,
  cozumAdresi,
  ozellikAdresi,
  ozellikBul,
} from '@/components/landing/site-icerik';
import {
  AdimListesi,
  BIRINCIL,
  Bolum,
  IKINCIL,
  KapanisBandi,
  OzellikKartlari,
  UstBaslik,
} from '@/components/landing/site-parcalari';

/**
 * Tanıtım sitesinin ana sayfası.
 *
 * Buradan önce kök `/` doğrudan `/dashboard`'a yönleniyordu ve middleware
 * oturumsuz isteği `/login`'e atıyordu: advetics.com adresine gelen herkes
 * login ekranı görüyordu.
 *
 * 2026-10-12: tek sayfalık tanıtım, birden çok sayfalı bir ürün sitesine
 * dönüştü (kullanıcı isteği: "gerçek bir uygulama websitesi ... reklamdan
 * anlamayan insanların anlayabileceği dilden"). Ana sayfa artık ÖZET:
 * her bölüm ilgili sayfaya bağlanıyor. Metinler `site-icerik.ts`te.
 *
 * Sunucuda render ediliyor. Tek istemci parçası kahraman filmi ve onun
 * sınırı `kaydirma-filmi.tsx` içinde anlatılıyor: başlık ve düğmeler
 * `children` olarak sunucudan geliyor.
 *
 * MÜŞTERİ HİKÂYESİ BÖLÜMÜ BİLEREK YOK. Yerine açıkça "örnek" yazan
 * senaryolar duruyor: gerçek bir müşteri yorumu ya da logo elimizde değil
 * ve uydurulmuş bir güven işareti ilk görüşmede çürür.
 */
export const metadata: Metadata = {
  title: 'Advetics | Meta, Google ve LinkedIn reklamlarınız tek panelde',
  description:
    'Reklamcılık bilmeden reklam verin. Advetics reklamınızı kurar, bütçenizi izler, ' +
    'neyin iyi gittiğini sade bir dille anlatır ve önerilerini onayınızla uygular.',
  alternates: { canonical: '/' },
};

const ADIMLAR = [
  {
    baslik: 'Bağlayın',
    metin: 'Meta, Google ya da LinkedIn hesabınızla izin verin. Parolanızı paylaşmazsınız.',
  },
  {
    baslik: 'Anlatın',
    metin: 'Ne satmak istediğinizi yazın. Teknik ayarları Advetics seçer, siz önizlemeye bakarsınız.',
  },
  {
    baslik: 'Onaylayın',
    metin: 'Reklam, öneri ya da plan: hiçbiri sizin onayınız olmadan yayına çıkmaz.',
  },
  {
    baslik: 'İzleyin',
    metin: 'Ne kadar harcandığını ve ne geldiğini tek ekranda görün. Rapor kendiliğinden hazırlanır.',
  },
];

/** Platform şeridi: logo değil ad. Başka markaların logosunu kullanmak izin işi. */
const PLATFORMLAR = ENTEGRASYON_GRUPLARI.flatMap((g) => g.ogeler.map((o) => o.ad));

export default function HomePage() {
  return (
    <>
      <KaydirmaFilmi>
        <UstBaslik>Meta, Google ve LinkedIn reklamları için tek panel</UstBaslik>

        <h1
          id="hero-baslik"
          className="mt-5 font-baslik text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[clamp(2.25rem,3vw,3.25rem)]"
        >
          Ne yapılacağını söyler.
          <br />
          <span className="text-brand-strong">Onaylarsanız yapar.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
          {'Advetics reklamlarınızı tek yerde toplar. Reklamı kurar, bütçeyi izler, neyin ' +
            'iyi gittiğini sade bir dille anlatır. Reklamcılık bilmeniz gerekmez; siz ' +
            'yalnızca onaylarsınız.'}
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a href={DEMO_MAILTO} className={BIRINCIL}>
            Demo Talep Et
          </a>
          <Link href="/ozellikler" className={IKINCIL}>
            Neler Yapar?
          </Link>
        </div>
      </KaydirmaFilmi>

      {/* Bağlandığı yerler şeridi */}
      <section className="border-y border-line bg-surface-muted">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:gap-10">
          <p className="shrink-0 text-sm font-semibold text-ink">Bağlandığı yerler</p>
          <ul className="flex flex-wrap gap-2.5">
            {PLATFORMLAR.map((ad) => (
              <li
                key={ad}
                className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink"
              >
                {ad}
              </li>
            ))}
          </ul>
          <Link
            href="/entegrasyonlar"
            className="shrink-0 text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4 md:ml-auto"
          >
            Tümü
          </Link>
        </div>
      </section>

      <Bolum
        id="ozellikler"
        baslik="Reklamın her adımı için bir ekran"
        aciklama="Planlamaktan rapora kadar. Her biri reklam bilmeyen biri düşünülerek tasarlandı."
      >
        <OzellikKartlari />
      </Bolum>

      <Bolum id="nasil-calisir" baslik="Nasıl çalışır" koyu>
        <AdimListesi adimlar={ADIMLAR} />
      </Bolum>

      <Bolum baslik="Kimler için">
        <ul className="grid gap-5 md:grid-cols-2">
          {COZUMLER.map((c) => (
            <li key={c.slug}>
              <Link
                href={cozumAdresi(c.slug)}
                className="flex h-full flex-col rounded-xl border border-line bg-surface p-7 motion-safe:transition-[border-color,transform] motion-safe:duration-200 hover:border-ink motion-safe:hover:-translate-y-0.5"
              >
                <UstBaslik>{c.ad}</UstBaslik>
                <h3 className="mt-3 font-baslik text-xl font-bold text-ink">{c.baslik}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">{c.ozet}</p>
                <span className="mt-6 text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4">
                  Devamı
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Bolum>

      <Bolum
        baslik="Gerçek hayatta nasıl görünür"
        aciklama="Aşağıdakiler örnek senaryolardır, gerçek müşteri hikâyesi değildir."
        koyu
      >
        <ul className="grid gap-5 md:grid-cols-3">
          {SENARYOLAR.map((s) => {
            const ozellik = ozellikBul(s.ozellik);
            return (
              <li key={s.kim} className="flex flex-col rounded-xl border border-line bg-surface p-6">
                <p className="text-xs font-semibold text-ink-muted">Örnek senaryo</p>
                <h3 className="mt-2 font-baslik text-lg font-bold text-ink">{s.kim}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">Derdi: </span>
                  {s.dert}
                </p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">Advetics ile: </span>
                  {s.cozum}
                </p>
                {ozellik && (
                  <Link
                    href={ozellikAdresi(ozellik.slug)}
                    className="mt-5 text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4"
                  >
                    {ozellik.ad}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </Bolum>

      <Bolum baslik="Verileriniz sizde, ayrı ve korunuyor">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GUVENLIK.slice(0, 3).map((g) => (
            <li key={g.baslik} className="rounded-xl border border-line bg-surface p-6">
              <h3 className="font-baslik text-base font-bold text-ink">{g.baslik}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{g.metin}</p>
            </li>
          ))}
        </ul>
        <Link
          href="/guvenlik"
          className="mt-8 inline-block text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4"
        >
          Güvenlik
        </Link>
      </Bolum>

      <KapanisBandi />
    </>
  );
}
