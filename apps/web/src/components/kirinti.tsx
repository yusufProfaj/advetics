'use client';

import { usePathname } from 'next/navigation';
import { aktifMi, type NavEntry } from '@/components/nav';

/**
 * ═══ ÜST ÇUBUKTAKİ KIRINTI (menü kararı 2026-10-14) ═══
 *
 * "Profaj Reklamcılık › Ege Birlik Yapı › Marka Merkezi": hangi kapsamda ve
 * hangi sayfada olduğun, her ekranda aynı yerde. Sayfa adı MENÜ ETİKETİNDEN
 * okunuyor (sayfa başlığıyla aynı ad, `nav-sections.spec.ts`); ayrı bir ad
 * listesi tutmak, menü değişince kırıntının eski adı göstermesi demekti.
 * Telefonda yalnız sayfa adı: kapsam çekmecenin başındaki seçicide yazıyor.
 */
export function Kirinti({
  kapsam,
  sayfalar,
}: {
  /** Ajans/şirket ve (varsa) workspace adları, sırasıyla. */
  kapsam: string[];
  sayfalar: Array<Pick<NavEntry, 'href' | 'ekYollar' | 'label'>>;
}) {
  const pathname = usePathname();
  const sayfa = sayfalar.find((s) => aktifMi(s, pathname))?.label ?? null;
  return (
    <span className="min-w-0 flex-1 truncate text-13 text-ink-muted">
      {kapsam.map((k, i) => (
        <span key={`${k}-${i}`} className="max-sm:hidden">
          {k}
          {(i < kapsam.length - 1 || sayfa) && <span aria-hidden> › </span>}
        </span>
      ))}
      {sayfa && <b className="font-semibold text-ink">{sayfa}</b>}
    </span>
  );
}
