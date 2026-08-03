import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { ClientSwitcher } from '@/components/client-switcher';
import { LogoutButton } from '@/components/logout-button';

interface Branding {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  hidePoweredBy: boolean;
  footerText: string | null;
}

const NAV = [
  { href: '/dashboard', label: 'Genel Bakış', module: 3 },
  { href: '/kampanyalar', label: 'Ads Explorer', module: 4 },
  { href: '/kurallar', label: 'Kurallar', module: 5 },
  { href: '/raporlar', label: 'Raporlar', module: 6 },
  { href: '/auto-boost', label: 'Auto-Boost', module: 7 },
  { href: '/toplu-olustur', label: 'Toplu Oluşturucu', module: 8 },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Marka bilgisi sunucuda çözülüp CSS değişkenlerine basılır — böylece sayfa
  // ilk boyamada doğru renkte gelir. Müşteriye ajansın varsayılan rengini
  // bir kare bile göstermek istemiyoruz.
  const branding = await serverApiFetch<Branding>('/branding').catch(() => null);

  const themeStyle = branding
    ? ({
        '--brand-primary': branding.primaryColor,
        '--brand-accent': branding.accentColor,
        '--brand-font': `'${branding.fontFamily}', ui-sans-serif, system-ui, sans-serif`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div style={themeStyle} className="min-h-screen">
      <div className="flex min-h-screen">
        {/* Kenar çubuğu */}
        <aside className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block">
          <div className="flex h-16 items-center gap-2.5 border-b border-[var(--border)] px-5">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="" className="h-8 max-w-[140px] object-contain" />
            ) : (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-primary)] text-sm font-semibold text-white">
                  {session.organization.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate text-sm font-semibold">
                  {session.organization.name}
                </span>
              </>
            )}
          </div>

          <nav className="space-y-0.5 p-3">
            {NAV.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </nav>

          <div className="mt-4 border-t border-[var(--border)] p-3">
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Yönetim
            </p>
            <NavItem href="/ayarlar/ekip" label="Ekip & Yetkiler" module={1} />
            <NavItem href="/ayarlar/musteriler" label="Müşteriler" module={1} />
            <NavItem href="/ayarlar/marka" label="Marka (White-Label)" module={1} />
            <NavItem href="/ayarlar/denetim" label="Denetim Kaydı" module={1} />
          </div>
        </aside>

        {/* İçerik */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5">
            <ClientSwitcher
              memberships={session.memberships}
              activeClientId={session.activeClientId}
              isOrgAdmin={session.isOrgAdmin}
            />

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">{session.user.fullName}</p>
                <p className="text-xs text-[var(--text-muted)]">{session.user.email}</p>
              </div>
              <LogoutButton />
            </div>
          </header>

          <main className="flex-1 p-6">{children}</main>

          {!branding?.hidePoweredBy && (
            <footer className="border-t border-[var(--border)] px-5 py-3 text-center text-xs text-[var(--text-muted)]">
              {branding?.footerText ?? 'Advetics ile güçlendirilmiştir'}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}

function NavItem({ href, label, module }: { href: string; label: string; module: number }) {
  // Henüz yazılmamış modüller görünür ama pasif — yol haritası kullanıcıya
  // görünür olsun, tıklanınca 404 almasın.
  const isReady = module === 1;

  if (!isReady) {
    return (
      <span
        title={`Modül ${module} kapsamında gelecek`}
        className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] opacity-50"
      >
        {label}
        <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px]">
          M{module}
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-muted)]"
    >
      {label}
    </Link>
  );
}

