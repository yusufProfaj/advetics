'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { aktifMi } from '@/components/nav';

/**
 * Ayarlar ekranlarının sekme çubuğu. Seçili sekme `aktifMi` ile bulunuyor,
 * menüdekiyle aynı tanım: iki ayrı "bu yolda mı" kuralı yazmak, menüde
 * "Ayarlar" seçili görünürken hiçbir sekmenin seçili olmaması demekti.
 *
 * DAR EKRANDA YATAY KAYIYOR, ALT SATIRA KIRILMIYOR: altı sekme telefonda iki
 * satıra bölününce seçili sekmenin altındaki çizgi yanlış satırda kalıyordu.
 */
export function AyarSekmeleri({
  sekmeler,
}: {
  sekmeler: Array<{ href: string; ekYollar: readonly string[]; ad: string }>;
}) {
  const pathname = usePathname();
  /*
   * ALT ÇİZGİ `after:` İLE, NEGATİF KENAR BOŞLUĞUYLA DEĞİL. İlk sürüm
   * bağlantılara `-mb-px` veriyordu: yatay kaydırılan kap bu bir pikseli
   * dikey taşma sayıyor ve sağ uçta boş bir dikey kaydırma çubuğu
   * çiziyordu. `after:` kutunun içinde kalıyor, kap hiç taşmıyor.
   */
  return (
    <nav aria-label="Ayarlar" className="border-b border-line">
      <ul className="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
        {sekmeler.map((s) => {
          const aktif = aktifMi(s, pathname);
          return (
            <li key={s.href} className="shrink-0">
              <Link
                href={s.href}
                aria-current={aktif ? 'page' : undefined}
                className={`relative block whitespace-nowrap px-3 py-2.5 text-sm transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors ${
                  aktif
                    ? 'font-semibold text-ink after:bg-brand'
                    : 'text-ink-muted after:bg-transparent hover:text-ink hover:after:bg-line'
                }`}
              >
                {s.ad}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
