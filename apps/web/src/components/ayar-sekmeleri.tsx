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
  return (
    <nav aria-label="Ayarlar" className="-mb-2 overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1">
        {sekmeler.map((s) => {
          const aktif = aktifMi(s, pathname);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={aktif ? 'page' : undefined}
                className={`relative -mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  aktif
                    ? 'border-brand font-semibold text-ink'
                    : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
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
