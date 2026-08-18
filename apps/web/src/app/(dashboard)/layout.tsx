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
      { href: '/saglik', label: 'Sağlık Skoru', icon: 'health', module: 3, ready: false },
    ],
  },
  {
    // 4 CREATE
    title: 'Oluştur',
    items: [
      /**
       * TEK GİRİŞ — üç ayrı menü maddesi yerine (tasarım belgesi K6).
       *
       * Kullanıcı "reklam vereceğim" diye geliyor; biz ona "elle mi, kuraldan
       * mı, tablodan mı" diye soruyorduk ve bu üç ayrı zihinsel model demekti.
       * `/reklam-olustur` artık bir giriş kapısı: dört başlangıç noktası ve
       * kampanya listesi. Toplu oluşturma oradan açılıyor, menüde ayrı
       * madde değil.
       */
      { href: '/reklam-olustur', label: 'Reklamlar', icon: 'create', module: 4, ready: true },
      /**
       * AKILLI BOOST MENÜDE KALIYOR çünkü orada yapılan iş reklam oluşturmak
       * değil OTOMASYON AYARI: kural kurmak ve onay kuyruğunu yönetmek.
       * Kuralın ürettiği kampanyalar zaten "Reklamlar" listesinde görünüyor.
       */
      { href: '/auto-boost', label: 'Akıllı Boost', icon: 'boost', module: 7, ready: true },
    ],
  },
  {
    // 5 MANAGE
    title: 'Yönet',
    items: [
      {
        href: '/potansiyel-musteriler',
        label: 'Potansiyel Müşteriler',
        icon: 'leads',
        module: 4,
        ready: true,
      },
      { href: '/butce', label: 'Aylık Bütçe', icon: 'budget', module: 5, ready: true },
      { href: '/kurallar', label: 'Kurallar', icon: 'rules', module: 5, ready: true },
    ],
  },
  {
    // 6 OPTIMISE
    title: 'İyileştir',
    items: [
      // Modül 6 hazır sayılıyor (Raporlar bitti) ama bu ikisinin sayfası YOK.
      // `ready` verilmezse modül numarasına düşülüyor ve ikisi de tıklanabilir
      // görünüp 404 veriyordu.
      { href: '/yorgunluk', label: 'Reklam Yorgunluğu', icon: 'fatigue', module: 6, ready: false },
      { href: '/ab-test', label: 'A/B Test', icon: 'abtest', module: 6, ready: false },
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
      {
        href: '/kutuphane/bilgi-bankasi',
        label: 'Bilgi Bankası',
        icon: 'assets',
        module: 7,
        ready: true,
      },
      {
        href: '/kutuphane/gorseller',
        label: 'Görsel Arşivi',
        icon: 'assets',
        module: 2,
        ready: true,
      },
      /**
       * Kreatif kütüphaneye ait, "Oluştur" altına değil: bir kampanyaya değil
       * MÜŞTERİYE ait ve aynı metin/görsel on kampanyada kullanılabiliyor.
       *
       * Bu, "Oluştur" bölümünün menüde nasıl yeniden kurulacağı kararını
       * (tasarım belgesi K6) vermiyor — Formlar ve Görsel Arşivi'nin yanına
       * üçüncü bir kütüphane girişi eklemek o karardan bağımsız.
       */
      { href: '/kutuphane/kreatifler', label: 'Kreatifler', icon: 'assets', module: 4, ready: true },
      { href: '/kutuphane/kitleler', label: 'Kitleler', icon: 'audience', module: 2, ready: false },
      { href: '/kutuphane/bilgi', label: 'Bilgi Bankası', icon: 'knowledge', module: 2, ready: false },
    ],
  },
  {
    // 1 WORKSPACE — en altta çünkü en seyrek açılıyor.
    //
    // SIRA KURULUM SIRASI. Yeni bir müşteriyi devralan kişi yukarıdan aşağı
    // ilerleyerek işi bitiriyor:
    //
    //   1. Müşteri aç            (şirket)
    //   2. Reklam hesabını bağla (o müşterinin yönetilecek hesapları)
    //   3. Ekibi yetkilendir     (kim hangi müşteriyi görecek)
    //
    // Önceki sıra Platform Bağlantıları'nı en üste koyuyordu ve akışı tersine
    // çeviriyordu: bağlantı ekranı müşteri seçilmeden iş görmüyor ("Önce bir
    // müşteri seç" diyor), yani ilk tıklanan yer çıkmaz sokaktı.
    //
    // Marka ve Denetim Kaydı `ready` DEĞİL: arka uçları hazır (branding,
    // audit-logs uç noktaları çalışıyor) ama ekranları yazılmadı. Modül
    // numaralarına bakılsaydı ikisi de açık görünüp 404 verirdi.
    title: 'Çalışma Alanı',
    items: [
      { href: '/ayarlar/musteriler', label: 'Müşteriler', icon: 'clients', module: 1, ready: true },
      {
        href: '/ayarlar/baglantilar',
        label: 'Platform Bağlantıları',
        icon: 'plug',
        module: 2,
        ready: true,
      },
      { href: '/ayarlar/ekip', label: 'Ekip & Yetkiler', icon: 'team', module: 1, ready: true },
      { href: '/ayarlar/marka', label: 'Marka', icon: 'brand', module: 1, ready: false },
      { href: '/ayarlar/denetim', label: 'Denetim Kaydı', icon: 'audit', module: 1, ready: false },
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
