import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { KapsamSecici, type KapsamSirketi } from '@/components/kapsam-secici';
import { LogoutButton } from '@/components/logout-button';
import { UyariBandi } from '@/components/uyari-bandi';
import { OturumTazeleyici } from '@/components/oturum-tazeleyici';
import { NavSection } from '@/components/nav';
import { visibleSections } from '@/lib/nav-sections';

import type { ManagerAccountTree } from '@advetics/shared';

interface Branding {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  hidePoweredBy: boolean;
  footerText: string | null;
}


export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  /*
   * İKİ ÇAĞRI PARALEL — ardışık DEĞİL.
   *
   * Önceden `await requireSession()` bitmeden `/branding` başlamıyordu ve
   * ikisi birbirine bağlı değil: her gezinmede iki tam gidiş-dönüş SERİ
   * olarak toplanıyordu. Panelin her sayfası bu layout'tan geçtiği için
   * maliyet her tıklamada ödeniyordu.
   *
   * `requireSession()` başarısızlıkta `redirect()` fırlatıyor; `Promise.all`
   * içinde de aynen çalışıyor — `/branding` sonucu o durumda kullanılmıyor.
   *
   * Marka bilgisi sunucuda çözülüp CSS değişkenlerine basılıyor; böylece sayfa
   * ilk boyamada doğru renkte geliyor. Müşteriye ajansın varsayılan rengini
   * bir kare bile göstermek istemiyoruz.
   */
  const [session, branding] = await Promise.all([
    requireSession(),
    serverApiFetch<Branding>('/branding').catch(() => null),
  ]);

  /*
   * ÜST HESAP AĞACI — tek seçicinin üç seviyesi için.
   *
   * `session.availableClients` YETMİYOR: o yalnızca AKTİF kapsamın
   * workspace'lerini taşıyor ve hangi şirkete ait olduklarını söylemiyor.
   * Ağaç, her şirketin workspace'lerini birlikte veriyor — seçici üç
   * seviyeyi tek pencerede gösterebilsin diye.
   *
   * `?? null` ZORUNLU: uç `null` döndüğünde NestJS gövdeyi BOŞ bırakıyor ve
   * `serverApiFetch` `undefined` dönüyor; tip `| null` yazsa da eline
   * `undefined` geliyor (`bos-govde-normalize.spec.ts`).
   *
   * HATA YUTULMUYOR ama ekranı da kilitlemiyor: ağaç okunamazsa seçici
   * tek şirketli hâline düşüyor ve panel çalışmaya devam ediyor. Üst
   * hesabı olmayan kullanıcı için ağaç zaten `null` ve o YOL NORMAL.
   */
  const agac = session.managerAccount
    ? ((await serverApiFetch<ManagerAccountTree | null>('/manager-account').catch(() => null)) ??
      null)
    : null;

  /*
   * AĞAÇ YOKSA TEK ŞİRKETLİ AĞAÇ KURULUYOR — seçici tek bir şekil biliyor.
   * İki ayrı yol (ağaçlı / ağaçsız) yazmak, birinin bir gün diğerini
   * tutmaması demekti.
   */
  /*
   * AĞAÇ YOKSA OTURUMUN ERİŞİLEBİLİR ŞİRKET LİSTESİ KULLANILIYOR.
   *
   * Burada tek elemanlı bir liste kuruluyordu ("aktif şirket") ve DANIŞMANI
   * KİLİTLİYORDU: üst hesabı olmayan bir danışman birden çok şirkete
   * yetkili olabiliyor (şirket seviyesi yetki üyelik satırını O ŞİRKETTE
   * açıyor), ama seçicide yalnızca bulunduğu şirket görünüyordu — yetkisi
   * olan yere GEÇEMİYORDU.
   *
   * WORKSPACE'LER YALNIZCA AKTİF ŞİRKETTE DOLU ve bu doğru: `/clients` RLS
   * ile aktif şirkete çivili, diğer şirketlerin workspace listesi ancak
   * oraya geçtikten sonra okunabiliyor. Boş liste "workspace yok" demiyor —
   * seçici o satırı yine tıklanabilir bir ŞİRKET satırı olarak çiziyor ve
   * tıklayınca şirket değişiyor.
   */
  const sirketler: KapsamSirketi[] = agac
    ? agac.organizations.map((o) => ({
        id: o.id,
        name: o.name,
        workspaces: o.workspaces.map((w) => ({ id: w.id, name: w.name })),
      }))
    : /*
       * WORKSPACE LİSTESİ ARTIK OTURUMDAN GELİYOR — "0 workspace" YALANI
       * KALKTI.
       *
       * Burada yalnızca AKTİF şirketin workspace'leri doldurulup diğerleri
       * boş bırakılıyordu ve seçici onları "Bu şirkette workspace yok" diye
       * çiziyordu. Workspace vardı; ekran yok diyordu. Bilgi eksikliğini
       * bir olgu gibi göstermek, bu depodaki en pahalı hata türü.
       *
       * `erisilebilirSirketler` her şirketin KULLANICININ ERİŞEBİLDİĞİ
       * workspace'lerini taşıyor (bkz. `tenant-context.service.ts`).
       */
      session.erisilebilirSirketler.map((o) => ({
        id: o.id,
        name: o.name,
        workspaces: o.workspaces,
      }));

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
                {session.isOrgAdmin ? 'Yönetici' : 'Workspace erişimi'}
              </span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* İçerik */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-surface/90 px-5 backdrop-blur">
          {/*
            İKİ SEÇİCİ SOLDAN SAĞA HİYERARŞİ: Şirket › Workspace.
            Şirket seçici YALNIZCA üst hesabı olanlara basılıyor — bağımsız
            bir şirkette geçilecek yer yok ve boş bir seçici, kullanıcının
            olmayan bir özelliği aramasına yol açardı.
          */}
          <KapsamSecici
            ajans={session.managerAccount?.name ?? null}
            sirketler={sirketler}
            yonetimGorunur={hasPermission(session, 'org.write')}
            aktifSirketId={session.activeOrganizationId}
            aktifWorkspaceId={session.activeClientId}
            tumSirketler={session.tumSirketler}
          />
          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium leading-tight">{session.user.email}</p>
            <p className="text-[11px] leading-tight text-ink-muted">
              {session.organization.name} · {session.organization.plan}
            </p>
          </div>
        </header>

        {/* OTURUMU AYAKTA TUTAR. Access token 15 dakikada ölüyor ve panelde
            onu yenileyen hiçbir çağrı yoktu: kullanıcı tam 15 dakika sonra
            atılıyordu. Ayrıntılı gerekçe bileşenin kendisinde. */}
        <OturumTazeleyici />

        {/*
          UYARI BANDI LAYOUT'TA, SAYFA GÖVDESİNDE DEĞİL.
          "Hesap platformda kapalı" ya da "veri gelmiyor" hangi ekranda
          olunursa olunsun görünmeli; sayfa sayfa eklemek, bir gün eklenmeyen
          sayfada uyarının sessizce kaybolması demekti.

          MCC bayrağı görünümü belirliyor: "Tüm müşteriler" seçiliyken uyarılar
          koda göre TOPLANIYOR (12 müşterinin uyarısını tek tek basmak bandı
          okunmaz yapardı), tek müşteri seçiliyken tek tek ve sayfalı.
        */}
        <UyariBandi
          mcc={session.activeClientId === null && session.availableClients.length > 1}
        />

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
