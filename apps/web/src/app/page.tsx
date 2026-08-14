import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/landing/site-footer';
import { SiteNav } from '@/components/landing/site-nav';

/**
 * Tanıtım sayfası (tek sayfa).
 *
 * Buradan önce kök `/` doğrudan `/dashboard`'a yönleniyordu ve middleware
 * oturumsuz isteği `/login`'e atıyordu — yani advetics.com adresine gelen
 * herkes login ekranı görüyordu. Ürünün ne yaptığını anlatan hiçbir sayfa
 * yoktu.
 *
 * Sayfa BİLEREK istemci JavaScript'i içermiyor: tamamı sunucuda render
 * ediliyor, bölümler arası geçiş çıpa bağlantılarıyla yapılıyor. Tanıtım
 * sayfasında ilk boyama hızı doğrudan dönüşüm ve SEO demek.
 *
 * Metinler JS sabitlerinde tutuluyor, JSX gövdesine gömülmüyor: Türkçe metin
 * kesme işaretiyle dolu (Google'ın, %90'ı) ve bunlar doğrudan JSX metninde
 * `react/no-unescaped-entities` hatası üretiyor.
 */
export const metadata: Metadata = {
  title: 'Advetics — Meta ve Google Ads tek panelde',
  description:
    'Reklamcılık bilmeden reklam verin. Meta ve Google Ads kampanyalarınızı ' +
    'tek panelden kurun, bütçenizi izleyin, kurallarla otomatikleştirin ve ' +
    'müşterilerinize kendi markanızla rapor verin.',
  alternates: { canonical: '/' },
};

/** Demo talebi. Form yerine mailto: ek altyapı istemiyor ve bugün çalışıyor. */
const DEMO_MAILTO = 'mailto:hello@profaj.com?subject=Advetics%20demo%20talebi';

const STEPS = [
  {
    n: '1',
    title: 'Hesaplarınızı bağlayın',
    body:
      "Meta ve Google Ads hesaplarınızı tek tıkla bağlayın. Advetics kampanya, " +
      "reklam seti ve reklam yapınızı olduğu gibi okur; hiçbir şeyi elle " +
      "girmeniz gerekmez.",
  },
  {
    n: '2',
    title: 'Reklamınızı oluşturun',
    body:
      "Ne satmak istediğinizi ve bütçenizi yazın, görselinizi bırakın. Hedef, " +
      "optimizasyon, yerleşim ve teklif stratejisi sizin yerinize seçilir. " +
      "Uzmansanız Gelişmiş moda geçip hepsini kendiniz belirleyin.",
  },
  {
    n: '3',
    title: 'İzleyin ve otomatikleştirin',
    body:
      "Bütçeniz nasıl gidiyor, hangi reklam çalışıyor, hangisi para yakıyor — " +
      "tek ekranda. Kurallar sınır aşıldığında devreye girer, siz uyurken de " +
      "çalışır.",
  },
];

const FEATURES = [
  {
    title: 'Tek panel, iki platform',
    body:
      "Meta ve Google aynı ekranda, aynı metriklerle. Rakamları iki ayrı " +
      "panelden toplayıp Excel'de birleştirme derdi bitiyor.",
  },
  {
    title: 'Reklam oluşturucu',
    body:
      "Adım adım form. Karakter sınırı, görsel ölçüsü, bağlantı ve mükerrer ad " +
      "kontrolü siz yayınlamadan ÖNCE yapılıyor — hata yayında değil formda " +
      "görünüyor.",
  },
  {
    title: 'Kural motoru',
    body:
      "“Frekans 3'ü geçerse duraklat”, “bütçenin %90'ı bitince haber ver”. Her " +
      "kural önce prova modunda ne yapacağını gösteriyor; onaylamadan hiçbir " +
      "şeye dokunmuyor.",
  },
  {
    title: 'Bütçe takibi',
    body:
      "Aylık bütçe, gün gün harcama temposu ve şemsiye bütçe: Meta ile " +
      "Google'ın toplamı tek sınırda izleniyor.",
  },
  {
    title: 'Reklam seviyesinde keşif',
    body:
      "Hangi görsel, hangi metin, hangi kitle çalışıyor — kampanya değil " +
      "reklam seviyesinde karşılaştırın.",
  },
  {
    title: 'Potansiyel müşteriler',
    body:
      "Anlık form kayıtları panele düşer. Webhook'un yanında mutabakat taraması " +
      "da çalışır: bildirim kaçarsa kayıt yine gelir, sessizce kaybolmaz.",
  },
];

const AGENCY = [
  {
    title: 'Çoklu müşteri, çoklu hesap',
    body:
      "Bir şirketin birden çok projesi ve reklam hesabı olabilir. Müşteriler " +
      "birbirini görmez; ayrım veritabanı seviyesinde uygulanıyor, arayüzde " +
      "değil.",
  },
  {
    title: 'Kendi markanız',
    body:
      "Logo, renk ve yazı tipi sizin. Müşteriniz panelde ve raporlarda " +
      "Advetics adını görmez.",
  },
  {
    title: 'Paylaşılabilir canlı rapor',
    body:
      "Müşteriye link verin; giriş yapmadan kendi raporunu canlı görsün. " +
      "Kendi alan adınız üzerinden de yayınlanabilir.",
  },
  {
    title: 'Roller ve denetim kaydı',
    body:
      "Kim neyi ne zaman değiştirdi, hepsi kayıtlı ve silinemiyor. Ekibe " +
      "yetki vermek için hesabınızı paylaşmanız gerekmiyor.",
  },
];

const REPORTING = [
  "Canlı rapor — veriler her senkronizasyonda tazeleniyor, ekran görüntüsü değil.",
  "Reklam hesabı süzgeci her yerde: hangi hesabın rakamına baktığınız hep belli.",
  "Meta ve Google tek raporda, aynı dönem ve aynı metriklerle.",
  "Yazdırmaya hazır düzen — müşteri toplantısına PDF olarak götürün.",
];

export default function HomePage() {
  return (
    <>
      <SiteNav />

      <main>
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-surface">
          <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
            {/* Ham `text-brand` koyu temada 3.80 kontrast veriyor; okunabilir
                ton zemine göre yön değiştiriyor (globals.css). */}
            <p className="text-sm font-semibold text-brand-strong">
              Meta ve Google Ads için tek panel
            </p>

            <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight text-ink sm:text-6xl">
              Reklamcılık bilmeden
              <br />
              reklam verin
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
              {"Hedef, optimizasyon, yerleşim, teklif stratejisi — hepsini Advetics " +
                "karara bağlıyor. Siz ne satmak istediğinizi söyleyin; kampanya " +
                "kurulsun, bütçe izlensin, rapor kendiliğinden hazırlansın."}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={DEMO_MAILTO}
                className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 sm:w-auto"
              >
                Demo Talep Et
              </a>
              <a
                href="#nasil-calisir"
                className="w-full rounded-lg border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted sm:w-auto"
              >
                Nasıl Çalışır?
              </a>
            </div>

            <p className="mt-8 text-sm text-ink-muted">
              {"Yalnızca Meta ve Google Ads. Onlarca platformu yüzeysel desteklemek " +
                "yerine ikisini derinlemesine yapıyoruz."}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Platformlar                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section className="border-y border-line bg-surface-muted">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[auto_1fr] md:items-center md:gap-14">
            <div className="flex flex-wrap gap-3">
              <span className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink">
                Meta · Facebook & Instagram
              </span>
              <span className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink">
                Google Ads
              </span>
            </div>
            <p className="text-base leading-relaxed text-ink-muted">
              {"Bütçenizin gittiği yer bu iki platform. Advetics her ikisinin de " +
                "kampanya yapısını, metriklerini ve yayın kurallarını tek tek " +
                "işliyor — “destekliyoruz” listesine bir satır eklemek için değil, " +
                "gerçekten yönetebilmek için."}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Nasıl çalışır                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section id="nasil-calisir" className="scroll-mt-20 bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">
                Üç adımda yayında
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-muted">
                {"Kurulum için haftalarca beklemeye ya da bir ajansa brief yazmaya " +
                  "gerek yok."}
              </p>
            </div>

            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((step) => (
                <li
                  key={step.n}
                  className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                >
                  {/*
                    `text-brand` DEĞİL `text-brand-strong`. Marka kırmızısı
                    kendi %8'lik tonunun üstünde 4.20 kontrast veriyor ve
                    16 pikselde eşik 4.5 — ölçüldü. Koyulaştırılmış ton 5.05'e
                    çıkıyor. Fark gözle seçilmiyor, denetimde seçiliyor.
                  */}
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-base font-bold text-brand-strong">
                    {step.n}
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-ink">{step.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Avantajlar                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section id="avantajlar" className="scroll-mt-20 bg-surface-muted">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">
                Reklamı kurmak değil, yönetmek de sizin işiniz değil
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-muted">
                {"Advetics kampanyayı kurduktan sonra da izlemeye devam ediyor."}
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-xl border border-line bg-surface p-6 shadow-sm"
                >
                  <h3 className="text-base font-bold text-ink">{feature.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
                    {feature.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Ajanslar                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section id="ajanslar" className="scroll-mt-20 bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-strong">Ajanslar için</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-ink sm:text-4xl">
                Portföyünüzün tamamı tek panelde, kendi markanızla
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-muted">
                {"Advetics beyaz etiketli çalışıyor. Müşterileriniz paneli ve " +
                  "raporları sizin markanızla görür."}
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {AGENCY.map((item) => (
                <article
                  key={item.title}
                  className="rounded-xl border border-line bg-surface-muted p-6"
                >
                  <h3 className="text-base font-bold text-ink">{item.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Raporlama — koyu blok                                            */}
        {/* ---------------------------------------------------------------- */}
        {/*
          Renkler BİLEREK jetondan değil, sabit yazıldı: koyu blok bir MARKA
          ÖĞESİ, tema yüzeyi değil — jeton kullansaydık karanlık modda blok
          diye bir şey kalmazdı.

          `dark:` varyantı şart. Karanlık modda `--surface-muted` zaten
          #0f1116; blok da #0f1116 kalsaydı sayfa zeminiyle KONTRASTI 1.00
          olurdu (ölçüldü) ve blok yalnızca %10 opak çerçevesiyle var olurdu.
          Karanlıkta blok sayfadan AŞAĞI değil YUKARI kaldırılıyor: koyu tema
          zaten dibe oturmuş, daha koyusu yok.
        */}
        <section id="raporlama" className="scroll-mt-20 bg-surface-muted">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f1116] px-6 py-14 sm:px-12 dark:border-white/15 dark:bg-[#20242e]">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-[#ff6b78]">Raporlama</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Müşteriye gösterilecek rapor, sizin markanızla
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-[#9aa1ae]">
                  {"Ay sonunda ekran görüntüsü toplamak ve sunum hazırlamak yerine " +
                    "bir link gönderin."}
                </p>
              </div>

              <ul className="mt-10 grid gap-4 sm:grid-cols-2">
                {REPORTING.map((line) => (
                  <li key={line} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e11d2e]"
                    />
                    <span className="text-sm leading-relaxed text-[#c7cbd4]">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Kapanış                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section id="demo" className="scroll-mt-20 border-t border-line bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">
              Hesabınızı bağlayalım, ilk rapora birlikte bakalım
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
              {"Kısa bir demo ayarlayalım: mevcut kampanyalarınızı panele bağlayıp " +
                "gerçek rakamlarınızla gösterelim."}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={DEMO_MAILTO}
                className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 sm:w-auto"
              >
                Demo Talep Et
              </a>
              <Link
                href="/login"
                className="w-full rounded-lg border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted sm:w-auto"
              >
                Giriş Yap
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
