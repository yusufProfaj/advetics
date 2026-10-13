import { formatMoney } from '@/lib/format';

/**
 * TUTAR TEK BİLEŞENDEN. Para metni `tutar` sınıfıyla (Montserrat) çiziliyor:
 * Open Sans `₺` taşımıyor ve işaret yedek yazı tipine düşüyordu (globals.css
 * `@utility tutar`). AdvStrategy v2'de `formatMoney` başka hiçbir dosyada
 * çağrılmıyor; `hesap.spec.ts` bunu kaynak taramasıyla kilitliyor.
 */
export function Tutar({ micros, para, className }: { micros: string | bigint; para: string; className?: string }) {
  const m = typeof micros === 'bigint' ? micros.toString() : micros;
  return <span className={className ? `tutar ${className}` : 'tutar'}>{formatMoney(m, para)}</span>;
}
