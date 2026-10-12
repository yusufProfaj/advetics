import Link from 'next/link';
import type { ReactNode } from 'react';

import { DEMO_MAILTO, OZELLIKLER, ozellikAdresi, type Madde } from './site-icerik';

/**
 * ═══ TANITIM SİTESİNİN ORTAK PARÇALARI ═══
 *
 * Bütün sayfalar bu parçalardan kuruluyor. Her sayfa kendi başlığını, kart
 * gölgesini ve düğmesini yazsaydı on dört sayfada on dört ayrı görünüş
 * doğardı; panelde aynı şey "PANEL TASARIM KATMANI" ile çözüldü (globals.css).
 *
 * Hepsi SUNUCU bileşeni. İstemci JavaScript'i yok: tanıtım sitesinde ilk
 * boyama hızı doğrudan arama sıralaması ve dönüşüm.
 *
 * RENK: yalnız kılavuzun dört rengi (`.tanitim` belirteçleri, globals.css).
 * Kırmızı METİN olarak yalnız büyük başlıkta kullanılıyor: #ff2400 beyazda
 * 3,8 kontrast veriyor, küçük yazıda eşik 4,5. Küçük vurgular kırmızı bir
 * işaret + koyu metinle yapılıyor.
 */

/** Birincil ve ikincil düğme sınıfları. Tek tanım: iki sayfada iki ayrı kırmızı düğme olmasın. */
export const BIRINCIL =
  'inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white ' +
  'motion-safe:transition-opacity hover:opacity-90';
export const IKINCIL =
  'inline-flex items-center justify-center rounded-lg border border-line bg-surface px-6 py-3 text-sm ' +
  'font-semibold text-ink motion-safe:transition-colors hover:bg-surface-muted';

/** Küçük üst başlık: kırmızı kare işaret + koyu metin. */
export function UstBaslik({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
      <span aria-hidden className="h-2 w-2 rounded-[2px] bg-brand" />
      {children}
    </p>
  );
}

/** "Yakında" rozeti. Yapılmamış işi yapılmış gibi göstermemenin tek yolu. */
export function YakindaRozeti() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
      Yakında
    </span>
  );
}

/** Sayfa girişi: üst başlık, ana başlık, özet ve iki düğme. */
export function SayfaGirisi({
  ust,
  baslik,
  ozet,
  ikincil,
}: {
  ust: string;
  baslik: string;
  ozet: string;
  ikincil?: { href: string; etiket: string };
}) {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <UstBaslik>{ust}</UstBaslik>
          <h1 className="mt-5 font-baslik text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            {baslik}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">{ozet}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href={DEMO_MAILTO} className={BIRINCIL}>
              Demo Talep Et
            </a>
            {ikincil && (
              <Link href={ikincil.href} className={IKINCIL}>
                {ikincil.etiket}
              </Link>
            )}
          </div>
        </div>
      </div>
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
    <section id={id} className={`scroll-mt-20 ${koyu ? 'bg-surface-muted' : 'bg-surface'}`}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-baslik text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {baslik}
          </h2>
          {aciklama && <p className="mt-3 text-base leading-relaxed text-ink-muted">{aciklama}</p>}
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
        <li key={m.baslik} className="rounded-xl border border-line bg-surface p-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-baslik text-base font-bold text-ink">{m.baslik}</h3>
            {yakinda && <YakindaRozeti />}
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{m.metin}</p>
        </li>
      ))}
    </ul>
  );
}

/** Numaralı adımlar. Numara kırmızı zeminde beyaz: kılavuzun "kırmızı zemin + beyaz" kullanımı. */
export function AdimListesi({ adimlar }: { adimlar: Madde[] }) {
  return (
    <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {adimlar.map((a, i) => (
        <li key={a.baslik} className="rounded-xl border border-line bg-surface p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-baslik text-sm font-extrabold text-white">
            {i + 1}
          </span>
          <h3 className="mt-4 font-baslik text-base font-bold text-ink">{a.baslik}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a.metin}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Özellik kartları. `sluglar` verilmezse hepsi. Kart bütünüyle bağlantı:
 * küçük bir "Devamı" yazısına nişan almak telefonda zor.
 */
export function OzellikKartlari({ sluglar }: { sluglar?: string[] }) {
  const liste = sluglar
    ? OZELLIKLER.filter((o) => sluglar.includes(o.slug))
    : OZELLIKLER;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {liste.map((o) => (
        <li key={o.slug}>
          <Link
            href={ozellikAdresi(o.slug)}
            className="group flex h-full flex-col rounded-xl border border-line bg-surface p-6 motion-safe:transition-[border-color,transform] motion-safe:duration-200 hover:border-ink motion-safe:hover:-translate-y-0.5"
          >
            <span className="text-xs font-semibold text-ink-muted">{o.panelAdi}</span>
            <h3 className="mt-2 font-baslik text-lg font-bold text-ink">{o.ad}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{o.kisa}</p>
            <span className="mt-5 text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4">
              Nasıl çalışır
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Bilmeniz gerekenler": ürünün yapmadığı şeyler. Gizlenen sınır, ilk denemede çıkan hayal kırıklığı. */
export function SinirKutusu({ sinirlar }: { sinirlar: string[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h3 className="font-baslik text-base font-bold text-ink">Bilmeniz gerekenler</h3>
      <ul className="mt-3 space-y-2">
        {sinirlar.map((s) => (
          <li key={s} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Kapanış bandı. Zemin kılavuzun gri zemini (#302e2d) ve yazı beyaz: bu bir
 * MARKA öğesi, tema yüzeyi değil, o yüzden belirteç değil sabit renk.
 * Karanlık temada sayfa siyaha döndüğü için gri bant yine ayrışıyor.
 */
export function KapanisBandi({
  baslik = 'Kendi hesaplarınızla görün',
  metin = 'Kısa bir görüşmede hesaplarınızı bağlayıp kendi rakamlarınızla gösterelim.',
}: {
  baslik?: string;
  metin?: string;
}) {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="rounded-2xl bg-[#302e2d] px-6 py-12 text-center sm:px-12">
          <h2 className="font-baslik text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {baslik}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/80">{metin}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={DEMO_MAILTO} className={BIRINCIL}>
              Demo Talep Et
            </a>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-white/10"
            >
              Giriş Yap
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
