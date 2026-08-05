'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Kenar çubuğu gezinmesi.
 *
 * İstemci bileşeni çünkü aktif öğeyi `usePathname` ile belirliyor. Sunucuda
 * yapmak, her sayfa için ayrı prop geçirmek demek olurdu.
 *
 * Henüz yazılmamış modüller GÖRÜNÜR ama pasif: yol haritası kullanıcıya belli
 * olsun, tıklanınca 404 almasın. Rozet hangi modülde geleceğini söylüyor.
 */

export interface NavEntry {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Bu öğeyi açan modül numarası. */
  module: number;
}

const READY_MODULES = new Set([1, 2]);

export function NavSection({ title, items }: { title?: string; items: NavEntry[] }) {
  const pathname = usePathname();

  return (
    <div>
      {title && (
        <p className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {title}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const ready = READY_MODULES.has(item.module);
          const active = ready && (pathname === item.href || pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              {ready ? (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? 'bg-brand-soft font-semibold text-brand'
                      : 'text-ink hover:bg-surface-muted'
                  }`}
                >
                  <Icon name={item.icon} active={active} />
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  title={`Modül ${item.module} kapsamında gelecek`}
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted opacity-55"
                >
                  <Icon name={item.icon} />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium">
                    M{item.module}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 20×20 stroke ikonlar — dış bağımlılık eklemeden tutarlı bir set. */
const ICONS = {
  overview: 'M3 10.5 10 4l7 6.5M5.5 9v7h9V9',
  explorer: 'M4 15V8m4 7V5m4 10v-4m4 4V9',
  rules: 'M4 6h12M4 10h7M4 14h9M15.5 12.5 17 14l-1.5 1.5',
  reports: 'M5.5 3.5h6l3.5 3.5v9.5h-9.5zM11.5 3.5V7H15',
  boost: 'M10 3.5 4.5 12h4L8 16.5 15.5 8h-4z',
  bulk: 'M4 5.5h5v5H4zM11 5.5h5v5h-5zM4 12.5h5v3H4zM11 12.5h5v3h-5z',
  plug: 'M8 3v4M12 3v4M6.5 7h7v3a3.5 3.5 0 0 1-7 0zM10 13.5V17',
  team: 'M7.5 9a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5M3.5 16c0-2.2 1.8-4 4-4s4 1.8 4 4M13 7.5a2 2 0 1 0 0-4M13.5 12c1.7.4 3 1.9 3 3.7',
  clients: 'M4.5 16V6l4-2.5V16M4.5 16h11V9l-7-3M11 11h2M11 13.5h2',
  brand: 'M10 3.5 12 8l4.5.5-3.3 3.1.8 4.4L10 14l-4 2 .8-4.4L3.5 8.5 8 8z',
  audit: 'M10 4.5v11M4.5 10h11M6.5 6.5l7 7M13.5 6.5l-7 7',
} as const;

function Icon({ name, active }: { name: keyof typeof ICONS; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-brand' : 'text-ink-muted'}`}
    >
      <path
        d={ICONS[name]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
