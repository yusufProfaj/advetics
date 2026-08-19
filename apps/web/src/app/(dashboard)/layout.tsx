import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { ClientSwitcher } from '@/components/client-switcher';
import { LogoutButton } from '@/components/logout-button';
import { NavSection } from '@/components/nav';
import { visibleSections } from '@/lib/nav-sections';

interface Branding {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  hidePoweredBy: boolean;
  footerText: string | null;
}


export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Marka bilgisi sunucuda çözülüp CSS değişkenlerine basılır — böylece sayfa
  // ilk boyamada doğru renkte gelir. Müşteriye ajansın varsayılan rengini bir
  // kare bile göstermek istemiyoruz.
  const branding = await serverApiFetch<Branding>('/branding').catch(() => null);

  const themeStyle = branding
    ? ({
        '--brand-primary': branding.primaryColor,
        '--brand-accent': branding.accentColor,
        '--brand-font': `'${branding.fontFamily}', ui-sans-serif, system-ui, sans-serif`,
      } as React.CSSProperties)
    : undefined;

  const initials = session.organization.name.slice(0, 2).toUpperCase();

  return (
    <div style={themeStyle} className="flex min-h-screen">
      {/* Kenar çubuğu */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-4">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-8 max-w-[150px] object-contain" />
          ) : (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
                {initials}
              </span>
              <span className="truncate text-[15px] font-semibold tracking-tight">
                {session.organization.name}
              </span>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {/*
            MENÜ YETKİYE GÖRE SÜZÜLÜYOR — bölüm boş kalırsa BAŞLIĞI DA
            basılmıyor.

            Buradaki liste bir süre filtresiz basılıyordu: "Çalışma Alanı"
            kategorisi (Müşteriler, Platform Bağlantıları, Ekip & Yetkiler)
            client_viewer rolüne de görünüyordu. Arka uç zaten reddediyordu
            (`@RequirePermissions`), yani veri sızmıyordu — ama kullanıcıya
            tıklayabildiği ve 403 alacağı bağlantılar gösteriliyordu ve
            ajansın iç ekranlarının VARLIĞI müşteriye sızıyordu.

            CLAUDE.md'nin ve roles.ts'in baştan beri söylediği kural bu:
            backend guard'ları ile arayüz gizleme AYNI matristen beslenir.
            Yetki anahtarı yazılmamış öğe eskisi gibi herkese görünüyor —
            süzme opt-in, böylece bir anahtarı atlamak ajans çalışanından
            çalışan bir ekranı sessizce gizlemiyor.
          */}
          {visibleSections(session.permissions).map((section) => (
            <NavSection key={section.title} title={section.title} items={section.items} />
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold uppercase">
              {session.user.fullName.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">
                {session.user.fullName}
              </span>
              <span className="block truncate text-[11px] leading-tight text-ink-muted">
                {session.isOrgAdmin ? 'Yönetici' : 'Müşteri erişimi'}
              </span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* İçerik */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-surface/90 px-5 backdrop-blur">
          <ClientSwitcher
            availableClients={session.availableClients}
            activeClientId={session.activeClientId}
            isOrgAdmin={session.isOrgAdmin}
          />
          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium leading-tight">{session.user.email}</p>
            <p className="text-[11px] leading-tight text-ink-muted">
              {session.organization.name} · {session.organization.plan}
            </p>
          </div>
        </header>

        <main className="flex-1 px-5 py-6">{children}</main>

        {!branding?.hidePoweredBy && (
          <footer className="border-t border-line px-5 py-3 text-center text-xs text-ink-muted">
            {branding?.footerText ?? 'Advetics ile güçlendirilmiştir'}
          </footer>
        )}
      </div>
    </div>
  );
}
