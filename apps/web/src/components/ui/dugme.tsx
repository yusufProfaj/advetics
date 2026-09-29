import type { ButtonHTMLAttributes } from 'react';

/**
 * ═══ TEK DÜĞME ═══
 *
 * Bu bileşen yazılmadan önce panelde 67 FARKLI birincil düğme sınıf dizesi
 * vardı: `px-3`/`px-3.5`/`px-4`, `opacity-40`/`opacity-50`, bazısında hover
 * var bazısında yok, yalnızca birkaçında klavye odak halkası. Kullanıcı aynı
 * işi yapan iki düğmeyi iki ekranda farklı görüyor ve hangisinin "asıl"
 * olduğunu çıkaramıyordu.
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
export type DugmeTonu = 'birincil' | 'ikincil' | 'tehlike' | 'sade';
export type DugmeBoyutu = 'kucuk' | 'orta';

const TON: Record<DugmeTonu, string> = {
  birincil: 'bg-brand text-white hover:brightness-95 active:brightness-90',
  ikincil:
    'border border-line bg-surface text-ink shadow-[var(--shadow-xs)] hover:border-ink-muted/30 hover:bg-surface-muted active:bg-surface-sunken',
  tehlike: 'bg-danger text-white hover:brightness-95 active:brightness-90',
  sade: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
};

/*
 * KÜÇÜK BOY BİLE 12 PİKSEL. Panelde 10 ve 9 piksellik düğme metni vardı ve
 * dokunmatik ekranda hedef 28 pikselin altına iniyordu.
 */
const BOY: Record<DugmeBoyutu, string> = {
  kucuk: 'h-8 px-3 text-xs',
  orta: 'h-9 px-4 text-sm',
};

export function dugmeSinifi(ton: DugmeTonu = 'birincil', boyut: DugmeBoyutu = 'orta'): string {
  return [
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-semibold',
    // `transition: all` DEĞİL: yalnızca değişen özellikler.
    'transition-[background-color,color,filter,border-color,box-shadow,transform] duration-200',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:cursor-not-allowed disabled:opacity-50',
    TON[ton],
    BOY[boyut],
  ].join(' ');
}

export function Dugme({
  ton = 'birincil',
  boyut = 'orta',
  bekliyor = false,
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
}) {
  return (
    <button
      type={type}
      disabled={disabled || bekliyor}
      aria-busy={bekliyor || undefined}
      className={className ? `${dugmeSinifi(ton, boyut)} ${className}` : dugmeSinifi(ton, boyut)}
      {...kalan}
    >
      {bekliyor && (
        <span
          aria-hidden="true"
          className="advetics-donus h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
}
