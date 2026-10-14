import Link from 'next/link';

import { AdveticsLogo } from '@/components/advetics-logo';

import { COZUMLER, DEMO_MAILTO, OZELLIKLER, UST_MENU, cozumAdresi, ozellikAdresi } from './site-icerik';

/**
 * Tanıtım sitesinin üst çubuğu.
 *
 * "Giriş Yap" HER ZAMAN /login'e gidiyor; oturum çerezine BAKILMIYOR.
 * Bakmak mümkündü ("Panele Git" yazdırırdık) ama `cookies()` okumak sayfayı
 * statik render'dan çıkarıyor ve burası tanıtım sitesi: ilk boyama hızı
 * doğrudan SEO. Oturumu olan kullanıcı yine de kaybolmuyor: middleware
 * oturumlu bir /login isteğini /dashboard'a çeviriyor (middleware.ts).
 *
 * Düğmeler tanıtım sitesinin düğme sınıflarıyla (`dg b` / `dg i`,
 * `tanitim.css`): taslakta "Giriş Yap" çerçeveli, "Demo Talep Et" kırmızı.
 *
 * İSTEMCİ JAVASCRIPT'İ YOK. Açılır menüler CSS ile açılıyor
 * (`group-hover` + `group-focus-within`, klavyeyle de çalışıyor), telefon
 * menüsü yerleşik `<details>` öğesi. Menü DOM'dan hiç çıkmıyor, yalnız
 * görünürlüğü geçişle değişiyor (TASARIM-DILI, "Animasyon").
 *
 * AÇILIR MENÜ İÇİNDEKİ BAĞLANTILAR DÜZ `<a>`, `Link` DEĞİL. Next istemci
 * gezintisinde düzen yeniden kurulmuyor: `<details>` açık kalıyor ve odak
 * açılır menünün içinde kaldığı için `focus-within` menüyü açık tutuyordu.
 * Tam sayfa yüklemesi menüyü kendiliğinden kapatıyor; tanıtım sayfaları
 * statik ve küçük, bedeli hissedilmiyor.
 */

/** Açılır menünün paneli: görünürlük geçişle, `prefers-reduced-motion` altında anında. */
const ACILIR =
  'invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 opacity-0 ' +
  'motion-safe:transition-[opacity,visibility] motion-safe:duration-150 ' +
  'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100';

const UST_BAG = 'text-sm font-semibold text-ink-muted motion-safe:transition-colors hover:text-ink';

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface">
      <nav aria-label="Ana menü" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Advetics ana sayfa">
          <AdveticsLogo />
        </Link>

        <ul className="hidden items-center gap-7 lg:flex">
          <li className="group relative">
            <a href="/ozellikler" className={UST_BAG}>
              Özellikler
            </a>
            <div className={ACILIR}>
              <ul className="grid w-[36rem] grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-3 shadow-acilir">
                {OZELLIKLER.map((o) => (
                  <li key={o.slug}>
                    <a
                      href={ozellikAdresi(o.slug)}
                      className="block rounded-lg px-3 py-2.5 motion-safe:transition-colors hover:bg-surface-muted"
                    >
                      <span className="block text-sm font-bold text-ink">{o.ad}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{o.kisa}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <li className="group relative">
            {/* Çözümlerin kendi özet sayfası yok; düğme odak alsın diye etiket bir düğme. */}
            <button type="button" className={UST_BAG}>
              Çözümler
            </button>
            <div className={ACILIR}>
              <ul className="w-80 rounded-xl border border-line bg-surface p-3 shadow-acilir">
                {COZUMLER.map((c) => (
                  <li key={c.slug}>
                    <a
                      href={cozumAdresi(c.slug)}
                      className="block rounded-lg px-3 py-2.5 motion-safe:transition-colors hover:bg-surface-muted"
                    >
                      <span className="block text-sm font-bold text-ink">{c.ad}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{c.kisa}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          {UST_MENU.map((m) => (
            <li key={m.href}>
              <Link href={m.href} className={UST_BAG}>
                {m.etiket}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="dg i">
            Giriş Yap
          </Link>
          <a href={DEMO_MAILTO} className="dg b">
            Demo Talep Et
          </a>
        </div>

        {/*
          Telefon ve tablet: yerleşik açılır öğe, JavaScript'siz.

          Panel `absolute` DEĞİL `fixed`: Chrome `<details>` içeriğini kendi
          kutusuna göre konumluyor ve `absolute inset-x-0` paneli 64 piksel
          genişliğe, "Menü" düğmesinin altına sıkıştırıyordu (ölçüldü).
          Üst çubuk her zaman en üstte olduğu için `top-16` görünüme göre de
          doğru yer. Çubuğa `transform`/`backdrop-filter` eklenirse `fixed`
          ona göre konumlanır; bilerek eklenmedi.
        */}
        <details className="lg:hidden">
          <summary className="flex cursor-pointer list-none items-center rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Menü
          </summary>
          <div className="fixed inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-surface px-4 pb-6 pt-2 shadow-acilir">
            <p className="mt-3 text-xs font-semibold text-ink-muted">Özellikler</p>
            <ul className="mt-1">
              {OZELLIKLER.map((o) => (
                <li key={o.slug}>
                  <a href={ozellikAdresi(o.slug)} className="block py-2 text-sm font-semibold text-ink">
                    {o.ad}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-semibold text-ink-muted">Çözümler</p>
            <ul className="mt-1">
              {COZUMLER.map((c) => (
                <li key={c.slug}>
                  <a href={cozumAdresi(c.slug)} className="block py-2 text-sm font-semibold text-ink">
                    {c.ad}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="mt-4 border-t border-line pt-3">
              {UST_MENU.map((m) => (
                <li key={m.href}>
                  <a href={m.href} className="block py-2 text-sm font-semibold text-ink">
                    {m.etiket}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-3">
              <a href={DEMO_MAILTO} className="dg b">
                Demo Talep Et
              </a>
              <a href="/login" className="dg i">
                Giriş Yap
              </a>
            </div>
          </div>
        </details>
      </nav>
    </header>
  );
}
