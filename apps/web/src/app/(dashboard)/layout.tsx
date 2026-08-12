import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { ClientSwitcher } from '@/components/client-switcher';
import { LogoutButton } from '@/components/logout-button';
import { NavSection, type NavEntry } from '@/components/nav';

interface Branding {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  hidePoweredBy: boolean;
  footerText: string | null;
}

/**
 * Kenar çubuğu — mimari dokümandaki 7 bölüm.
 *
 * BÖLÜM ADLARI TÜRKÇE ve İŞ DİLİNDE. "CENTRAL" ya da "OPTIMISE" bir yazılım
 * mimarisi terimi; panelde oturan kişi reklam uzmanı bile olsa bunlar ona bir
 * şey söylemiyor. Bölüm adı "orada ne yapacağımı" anlatmalı.
 *
 * SIRA DA BİR ANLAM TAŞIYOR: yukarıdan aşağı bir iş akışı — önce bakarsın
 * (Merkez), sonra yaparsın (Oluştur), sonra kontrol edersin (Yönet),
 * iyileştirirsin, en son raporlarsın.
 */
const SECTIONS: Array<{ title: string; items: NavEntry[] }> = [
  {
    // 3 CENTRAL — en sık açılan ekran en üstte.
    title: 'Merkez',
    items: [
      { href: '/dashboard', label: 'Genel Bakış', icon: 'overview', module: 1 },
      { href: '/ads-explorer', label: 'Reklam Keşfi', icon: 'explorer', module: 4 },
      { href: '/saglik', label: 'Sağlık Skoru', icon: 'health', module: 3 },
    ],
  },
  {
    // 4 CREATE
    title: 'Oluştur',
    items: [
      {
        href: '/reklam-olustur',
        label: 'Reklam Oluştur',
        icon: 'create',
        module: 4,
        ready: true,
      },
      { href: '/auto-boost', label: 'Akıllı Boost', icon: 'boost', module: 7, ready: true },
      { href: '/toplu-olustur', label: 'Toplu Oluşturucu', icon: 'bulk', module: 8, ready: true },
    ],
  },
  {
    // 5 MANAGE
    title: 'Yönet',
    items: [
      { href: '/butce', label: 'Aylık Bütçe', icon: 'budget', module: 5, ready: true },
      { href: '/kurallar', label: 'Kurallar', icon: 'rules', module: 5, ready: true },
    ],
  },
  {
    // 6 OPTIMISE
    title: 'İyileştir',
    items: [
      { href: '/yorgunluk', label: 'Reklam Yorgunluğu', icon: 'fatigue', module: 6 },
      { href: '/ab-test', label: 'A/B Test', icon: 'abtest', module: 6 },
    ],
  },
  {
    // 7 REPORT
    title: 'Raporla',
    items: [{ href: '/raporlar', label: 'Raporlar', icon: 'reports', module: 6 }],
  },
  {
    // 2 BASE — henüz tamamen boş, ama yol haritası görünür olsun.
    title: 'Kütüphane',
    items: [
      { href: '/kutuphane/formlar', label: 'Formlar', icon: 'forms', module: 4, ready: true },
      { href: '/kutuphane/gorseller', label: 'Görsel Arşivi', icon: 'assets', module: 2 },
      { href: '/kutuphane/kitleler', label: 'Kitleler', icon: 'audience', module: 2 },
      { href: '/kutuphane/bilgi', label: 'Bilgi Bankası', icon: 'knowledge', module: 2 },
    ],
  },
  {
    // 1 WORKSPACE — en altta çünkü en seyrek açılıyor.
    title: 'Çalışma Alanı',
    items: [
      { href: '/ayarlar/baglantilar', label: 'Platform Bağlantıları', icon: 'plug', module: 2 },
      { href: '/ayarlar/musteriler', label: 'Müşteriler', icon: 'clients', module: 1 },
      { href: '/ayarlar/ekip', label: 'Ekip & Yetkiler', icon: 'team', module: 1 },
      { href: '/ayarlar/marka', label: 'Marka', icon: 'brand', module: 1 },
      { href: '/ayarlar/denetim', label: 'Denetim Kaydı', icon: 'audit', module: 1 },
    ],
  },
];

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
          {SECTIONS.map((section) => (
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
