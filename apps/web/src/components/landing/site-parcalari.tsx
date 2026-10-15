import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

import { yerelYol } from '@/lib/site-yollari';
import { Gorunurlukte } from './gorunurlukte';
import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { siteIcerigi, ozellikAdresi, type Madde } from './site-icerik';

/** Sunucu parçalarının dili ve metni tek çağrıda. */
async function dilVeMetin() {
  const dil = await dilAl();
  return { dil, d: sec(siteArayuzSozlugu, dil), icerik: siteIcerigi(dil) };
}

/**
 * ═══ TANITIM SİTESİNİN ORTAK PARÇALARI ═══
 *
 * Bütün sayfalar bu parçalardan kuruluyor. Her sayfa kendi başlığını, kart
 * gölgesini ve düğmesini yazsaydı on beş sayfada on beş ayrı görünüş
 * doğardı; panelde aynı şey "PANEL TASARIM KATMANI" ile çözüldü.
 *
 * Görünüş onaylı taslaktan (`docs/site/taslak.html`), sınıflar
 * `tanitim.css`te. Hepsi SUNUCU bileşeni; istemci parçaları (sahneler,
 * fiyat kartları, çerez kartı) ayrı küçük dosyalarda.
 *
 * SAYFA BAŞLIĞI (`h1`) YALNIZ BU DOSYADA, `TanitimBasligi` içinde. Panelin
 * `SayfaBasligi` bileşeni panelin ölçüsüyle (`.panel` katmanı) çiziliyor;
 * tanıtım başlığı 68 piksele kadar büyüyen bir vitrin başlığı. Tek bir
 * bileşen olması, tasarım sistemi bekçisinde tek bir gerekçeli kalıcı
 * istisna demek (`tasarim-sistemi.istisnalar.ts`).
 */

/** Birincil ve ikincil düğme sınıfları. Tek tanım: iki sayfada iki ayrı kırmızı düğme olmasın. */
export const BIRINCIL = 'dg b';
export const IKINCIL = 'dg i';

/**
 * Latin marka adları. Üst başlık büyük harfe çevriliyor ve sayfa `lang="tr"`:
 * tarayıcı Türkçe kuralıyla "i"yi "İ" yapıyor ve "LinkedIn" ekranda
 * "LİNKEDİN", "AdvCampaign" "ADVCAMPAİGN" oluyordu. Bu adlar `lang="en"`
 * içinde büyütülüyor; Türkçe kelimeler ("için") doğru "İÇİN" kalıyor.
 */
const LATIN_ADLAR = /(LinkedIn|AdvCampaign|AdvStrategy)/;

/** Küçük üst başlık: kırmızı çizgi + büyük harf. Renk okunabilir kırmızı tonda (`tanitim.css`). */
export function UstBaslik({ children }: { children: ReactNode }) {
  const icerik =
    typeof children === 'string'
      ? children.split(LATIN_ADLAR).map((p, i) =>
          i % 2 === 1 ? (
            <span key={i} lang="en">
              {p}
            </span>
          ) : (
            p
          ),
        )
      : children;
  // İç sarmalayıcı şart: kutu `inline-flex` ve `gap` taşıyor; parçalar doğrudan
  // çocuk olsa her `lang` parçasının iki yanına 8 piksel boşluk giriyordu.
  return (
    <span className="ust-baslik">
      <span>{icerik}</span>
    </span>
  );
}

/** Sayfanın tek `h1`i. `boy`: ana sayfa büyük, fiyat ve yasal sayfalar daha küçük. */
export function TanitimBasligi({
  children,
  boy = 'buyuk',
  id,
}: {
  children: ReactNode;
  boy?: 'buyuk' | 'orta' | 'yasal';
  id?: string;
}) {
  const sinif = boy === 'orta' ? 't-h1 orta-boy' : boy === 'yasal' ? 't-h1 yasal-boy' : 't-h1';
  return (
    <h1 id={id} className={sinif}>
      {children}
    </h1>
  );
}

/** "Yakında" rozeti. Yapılmamış işi yapılmış gibi göstermemenin tek yolu. */
export async function YakindaRozeti() {
  const { d } = await dilVeMetin();
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
      {d.ortak.yakinda}
    </span>
  );
}

/**
 * Sayfa girişi: üst başlık, ana başlık, özet ve iki düğme. `Sahne`
 * verilirse yanında sahnesi (özellik sayfası): ana sayfadaki bölümle AYNI
 * canlandırma, ziyaretçi menüden geldiğinde de aynı şeyi görüyor.
 */
export async function SayfaGirisi({
  ust,
  baslik,
  ozet,
  ikincil,
  Sahne,
}: {
  ust: string;
  baslik: string;
  ozet: string;
  ikincil?: { href: string; etiket: string };
  Sahne?: ComponentType;
}) {
  const { dil, d, icerik } = await dilVeMetin();
  const yazi = (
    <div className="yazi">
      <UstBaslik>{ust}</UstBaslik>
      <TanitimBasligi boy="orta">{baslik}</TanitimBasligi>
      <p className="alt">{ozet}</p>
      <div className="dgler">
        <a href={icerik.DEMO_MAILTO} className={BIRINCIL}>
          {d.ortak.demoTalep}
        </a>
        {ikincil && (
          <Link href={yerelYol(ikincil.href, dil)} className={IKINCIL}>
            {ikincil.etiket}
          </Link>
        )}
      </div>
      {Sahne && <p className="hero-notu">{d.ortak.rakamlarOrnek}</p>}
    </div>
  );
  return (
    <section className={`giris${Sahne ? '' : ' tek'}`}>
      {Sahne ? (
        <div className="kap modul">
          {yazi}
          <Sahne />
        </div>
      ) : (
        <div className="kap">{yazi}</div>
      )}
    </section>
  );
}

/** Başlıklı bölüm. Zemin sırayla değişiyor ki bölümler birbirine karışmasın. */
export function Bolum({
  id,
  baslik,
  aciklama,
  koyu = false,
  children,
}: {
  id?: string;
  baslik: string;
  aciklama?: string;
  koyu?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`bolum${koyu ? ' gri' : ''}`}>
      <div className="kap">
        <div className="max-w-2xl">
          <h2 className="t-h2">{baslik}</h2>
          {aciklama && <p className="alt">{aciklama}</p>}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Başlık + metin kartları. */
export function MaddeIzgarasi({ maddeler, yakinda = false }: { maddeler: Madde[]; yakinda?: boolean }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {maddeler.map((m) => (
        <li key={m.baslik} className="kart p-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="mont text-base font-bold">{m.baslik}</h3>
            {yakinda && <YakindaRozeti />}
          </div>
          <p className="soluk mt-2.5 text-sm leading-relaxed">{m.metin}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Numaralı adımlar (taslaktaki "Nasıl çalışır" kartları). Kartların
 * altındaki kırmızı çizgi ekrana girince sırayla doluyor; o davranış
 * `Gorunurlukte` istemci parçasında, kartların kendisi sunucuda.
 */
export function AdimListesi({ adimlar }: { adimlar: Madde[] }) {
  return (
    <Gorunurlukte className="adimlar">
      {adimlar.map((a, i) => (
        <li key={a.baslik}>
          <span className="no">{i + 1}</span>
          <h3>{a.baslik}</h3>
          <p>{a.metin}</p>
        </li>
      ))}
    </Gorunurlukte>
  );
}

/**
 * Özellik kartları. `sluglar` verilmezse hepsi. Kart bütünüyle bağlantı:
 * küçük bir "Devamı" yazısına nişan almak telefonda zor.
 */
export async function OzellikKartlari({ sluglar }: { sluglar?: string[] }) {
  const { dil, d, icerik } = await dilVeMetin();
  const tumu = icerik.OZELLIKLER;
  const liste = sluglar ? tumu.filter((o) => sluglar.includes(o.slug)) : tumu;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {liste.map((o) => (
        <li key={o.slug}>
          <Link
            href={ozellikAdresi(o.slug, dil)}
            className="kart flex h-full flex-col p-6 motion-safe:transition-[border-color,transform] motion-safe:duration-200 hover:border-ink motion-safe:hover:-translate-y-0.5"
          >
            <span className="soluk text-xs font-semibold">{o.panelAdi}</span>
            <h3 className="mont mt-2 text-lg font-bold">{o.ad}</h3>
            <p className="soluk mt-2 flex-1 text-sm leading-relaxed">{o.kisa}</p>
            <span className="bag self-start">{d.ortak.nasilCalisirOk}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Bilmeniz gerekenler": ürünün yapmadığı şeyler. Gizlenen sınır, ilk denemede çıkan hayal kırıklığı. */
export async function SinirKutusu({ sinirlar }: { sinirlar: string[] }) {
  const { d } = await dilVeMetin();
  return (
    <div className="ozet-kutu">
      <h3 className="mont text-base font-bold">{d.ortak.bilmenizGerekenler}</h3>
      <ul className="mt-3 space-y-2">
        {sinirlar.map((s) => (
          <li key={s} className="flex gap-3 text-sm leading-relaxed">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sık sorulanlar. `<details>`: istemci JavaScript'i yok, klavyeyle ve ekran
 * okuyucuyla kendiliğinden çalışıyor, cevap DOM'dan çıkmadığı için arama
 * motoru da okuyor.
 */
export async function SikSorulanlar({ sorular }: { sorular?: Madde[] }) {
  const { icerik } = await dilVeMetin();
  return (
    <div className="sss mt-6">
      {(sorular ?? icerik.FIYAT_SORULARI).map((s) => (
        <details key={s.baslik}>
          <summary>{s.baslik}</summary>
          <p>{s.metin}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * Kapanış bandı. Zemin SİYAH (taslak); karanlık temada sayfa da siyah
 * olduğu için bant kılavuzun grisine dönüyor (`tanitim.css`). Bu bir marka
 * öğesi, tema yüzeyi değil.
 */
export async function KapanisBandi({
  baslik,
  metin,
  giris = true,
}: {
  baslik?: string;
  metin?: string;
  giris?: boolean;
}) {
  const { d, icerik } = await dilVeMetin();
  return (
    <div className="kap kapanis-kap">
      <div className="kapanis">
        <div>
          <h2 className="t-h2">{baslik ?? d.ortak.kapanisBaslik}</h2>
          <p>{metin ?? d.ortak.kapanisMetin}</p>
        </div>
        <div className="dgler">
          <a href={icerik.DEMO_MAILTO} className={BIRINCIL}>
            {d.ortak.demoTalep}
          </a>
          {giris && (
            <Link href="/login" className="dg i beyaz-cerceve">
              {d.ortak.girisYap}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
