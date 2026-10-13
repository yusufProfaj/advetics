import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * ═══ TEK DÜĞME ═══
 *
 * Bu bileşen yazılmadan önce panelde 67 FARKLI birincil düğme sınıf dizesi
 * vardı: `px-3`/`px-3.5`/`px-4`, `opacity-40`/`opacity-50`, bazısında hover
 * var bazısında yok, yalnızca birkaçında klavye odak halkası. Kullanıcı aynı
 * işi yapan iki düğmeyi iki ekranda farklı görüyor ve hangisinin "asıl"
 * olduğunu çıkaramıyordu.
 *
 * BİÇİM REFERANSTAN (2026-10-14, `docs/marka/tasarim-sistemi.html` "02 ·
 * Düğmeler"): beş ton, iki boy, HEPSİ HAP. Birincil DÜZ KIRMIZI: degrade ve
 * marka tonunda parıltı kullanıcı kararıyla kalktı. Ekranda en çok BİR
 * birincil düğme olur; yeri sayfa başlığının sağı ya da sihirbazın alt
 * çubuğunun sağı (`docs/marka/BILESENLER.md`).
 *
 * SINIF ÜRETİCİSİ AYRI (`dugmeSinifi`): aynı görünüm `<Link>` üzerinde de
 * lazım ("Bağlantılara git" bir gezinme, düğme değil). İkisi ayrı yazılırsa
 * bağlantı ile düğme bir gün ayrışır.
 *
 * ODAK HALKASI BURADA DA VAR, `globals.css` YETMEZ: oradaki kural
 * `:where()` ile yazıldığı için sıfır özgüllük taşıyor ve bir bileşenin
 * `outline-none`ı onu siliyor. Düğme kendi halkasını taşıyınca kimse onu
 * kazara kapatamıyor.
 */
export type DugmeTonu = 'birincil' | 'ikincil' | 'koyu' | 'hayalet' | 'tehlike' | 'sade';
export type DugmeBoyutu = 'kucuk' | 'orta';

/*
 * `sade` ESKİ AD, `hayalet`le aynı. Çağıranlar kırılmasın diye duruyor;
 * yeni kodda `hayalet` yazılır.
 *
 * `tehlike` DOLU DEĞİL: referansta kırmızı yazı + kırmızı çizgi. Dolu
 * kırmızı yalnız birincil eylemde; ikinci bir dolu kırmızı (eski
 * `bg-danger` #dc2626) "hangisi asıl eylem" sorusunu geri getiriyordu.
 */
const TON: Record<DugmeTonu, string> = {
  birincil: 'border border-brand bg-brand text-white hover:brightness-[.94]',
  ikincil: 'border border-line-strong bg-surface text-ink hover:bg-surface-sunken',
  koyu: 'border border-ink bg-ink text-surface hover:brightness-[.94]',
  hayalet: 'border border-transparent bg-transparent text-ink hover:bg-surface-sunken',
  sade: 'border border-transparent bg-transparent text-ink hover:bg-surface-sunken',
  tehlike:
    'border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-surface text-danger-strong hover:bg-danger-soft',
};

/*
 * İKİ BOY: 40 varsayılan, 32 tablo ve kart içinde. Küçük boyun yazısı bile
 * 12,5 piksel: panelde 10 ve 9 piksellik düğme metni vardı ve dokunmatik
 * ekranda hedef 28 pikselin altına iniyordu.
 */
const BOY: Record<DugmeBoyutu, string> = {
  kucuk: 'h-8 px-3.5 text-[12.5px]',
  orta: 'h-10 px-[18px] text-[13.5px]',
};

export function dugmeSinifi(ton: DugmeTonu = 'birincil', boyut: DugmeBoyutu = 'orta'): string {
  return [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold leading-none',
    // `transition: all` DEĞİL: yalnızca değişen özellikler.
    'transition-[background-color,color,filter,border-color] duration-150',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100',
    TON[ton],
    BOY[boyut],
  ].join(' ');
}

export function Dugme({
  ton = 'birincil',
  boyut = 'orta',
  bekliyor = false,
  ikon,
  className,
  children,
  disabled,
  type = 'button',
  ...kalan
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  ton?: DugmeTonu;
  boyut?: DugmeBoyutu;
  /**
   * İstek sürerken düğme KİLİTLİ ama ETİKETİ DURUYOR. Panelde bekleyen
   * düğmenin metni tek başına "…" oluyordu; ekran okuyucu düğmenin adını
   * kaybediyor ve kullanıcı hangi işin sürdüğünü göremiyordu.
   */
  bekliyor?: boolean;
  /** Metnin SOLUNDA duran simge (referans: "simge varsa metnin solunda"). */
  ikon?: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || bekliyor}
      aria-busy={bekliyor || undefined}
      className={className ? `${dugmeSinifi(ton, boyut)} ${className}` : dugmeSinifi(ton, boyut)}
      {...kalan}
    >
      {bekliyor ? (
        <span
          aria-hidden="true"
          className="advetics-donus h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        ikon && (
          <span aria-hidden="true" className="-ml-0.5 inline-flex text-base leading-none">
            {ikon}
          </span>
        )
      )}
      {children}
    </button>
  );
}
