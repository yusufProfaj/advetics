import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { KapsamSecici, type KapsamSirketi } from '@/components/kapsam-secici';
import { UyariBandi } from '@/components/uyari-bandi';
import { BildirimSaglayici } from '@/components/bildirim/bildirim-verisi';
import { BildirimZili } from '@/components/bildirim/bildirim-zili';
import { OturumTazeleyici } from '@/components/oturum-tazeleyici';
import { visibleSections } from '@/lib/nav-sections';
import { ayarlarYolu, kapi } from '@/lib/panel-adresleri';
import { ayarSekmesiAcik } from '@/lib/ayar-kapilari';
import { KenarIcerigi } from '@/components/kenar-cubugu';
import { MobilMenu } from '@/components/mobil-menu';
import { Kirinti } from '@/components/kirinti';
import { YenileIkonu } from '@/components/kabuk-menuleri';
import { olusturSecenekleri } from '@/lib/olustur-menusu';

import { ROL_ETIKETI, SAHIP_ETIKETI, type ManagerAccountTree } from '@advetics/shared';

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
        /*
         * YÜKLENEN GÖVDE YAZI TİPİ (Open Sans) YEDEKTE. Markanın yazı tipi kullanıcının makinesinde
         * yoksa sistem yazı tipine değil, panelin yüklediği yazı tipine
         * düşülüyor; 'Inter' seçili markada da o dosya kullanılıyor.
         */
        '--brand-font': `'${branding.fontFamily}', var(--font-govde), ui-sans-serif, system-ui, sans-serif`,
      } as React.CSSProperties)
    : undefined;

  const kenarVerisi = {
    /*
     * "Üst Hesaplar" üyelikle açılıyor, yetkiyle değil: müşteri şirketinin
     * admini `org.write` taşıyor ama üst hesaba üye değil.
     */
    bolumler: visibleSections(session.permissions, {
      ustHesapGorunur: session.platformAdmin || session.managerAccount !== null,
      platformSahibi: session.platformAdmin,
    }),
    sirketAdi: session.organization.name,
    logoUrl: branding?.logoUrl ?? null,
    kullaniciAdi: session.user.fullName,
    /* ROZET ETKİN ROLDEN, Sahip bayrağı önce. */
    rolEtiketi: session.platformAdmin ? SAHIP_ETIKETI : ROL_ETIKETI[session.rol],
    /* "+ Oluştur": yetkiye göre süzülür, müşteri hesabına hiç çıkmaz. */
    olustur: olusturSecenekleri(session),
  };

  /*
   * KIRINTININ KAPSAM PARÇALARI: ajans (varsa) › şirket › workspace. Sayfa
   * adı istemcide, menü etiketinden ekleniyor (`Kirinti`).
   */
  const kirintiSirketi = sirketler.find((s) => s.id === session.activeOrganizationId) ?? null;
  const aktifWorkspaceAdi =
    kirintiSirketi?.workspaces.find((w) => w.id === session.activeClientId)?.name ?? null;
  const kirintiKapsami = session.tumSirketler
    ? [session.managerAccount?.name ?? 'Tüm şirketler']
    : [session.organization.name, ...(aktifWorkspaceAdi ? [aktifWorkspaceAdi] : [])];
  /*
   * HESABIM KIRINTIDA DA. Hesabım menü satırı değil (kapısı kullanıcı kartı)
   * ve kırıntı sayfa adını menüden buluyordu: Hesabım'da üst yol yalnız
   * "Şirket ›" yazıp sayfa adını göstermiyordu (canlı denetim). Menüde
   * zaten varsa ikinci kez eklenmiyor.
   */
  const menudenSayfalar = kenarVerisi.bolumler.flatMap((b) =>
    b.items.map((i) => ({ href: i.href, label: i.label, ekYollar: i.ekYollar })),
  );
  const hesabimYolu = ayarlarYolu('hesabim');
  const kirintiSayfalari = menudenSayfalar.some((x) => x.href === hesabimYolu)
    ? menudenSayfalar
    : [...menudenSayfalar, { href: hesabimYolu, label: 'Hesabım', ekYollar: [] as string[] }];

  /* Seçici iki yerde çiziliyor (masaüstü menü, telefonda üst bar); tek kaynak. */
  const kapsam = {
    ajans: session.managerAccount?.name ?? null,
    sirketler,
    yonetimGorunur: ayarSekmesiAcik(session, 'sirketler'),
    ustHesaplarGorunur: kapi(session, 'ustHesap.yonet'),
    aktifSirketId: session.activeOrganizationId,
    aktifWorkspaceId: session.activeClientId,
    tumSirketler: session.tumSirketler,
    ustHesaplar: session.secilebilirUstHesaplar,
    aktifUstHesapId: session.managerAccount?.id ?? null,
  };

  return (
    /*
      BİLDİRİM SAĞLAYICISI KENAR ÇUBUĞUNU DA SARIYOR (2026-10-14): menüdeki
      bekleyen iş sayacı zilin okuduğu AYNI kuyruğu okuyor. Ayrı bir istek,
      menü ile zilin farklı sayı göstermesi demekti.
    */
    <BildirimSaglayici
      aktifWorkspaceId={session.activeClientId}
      boostGorunur={hasPermission(session, 'boost.read')}
    >
    <div style={themeStyle} className="panel flex min-h-screen">
      {/* Kenar çubuğu */}
      {/*
        KENAR ÇUBUĞU İÇERİĞİ TEK BİLEŞENDE: aynı menü mobilde çekmece olarak
        da çiziliyor (`MobilMenu`). İki kopya, birinin güncellenmemesi ve
        telefondaki menünün masaüstünden farklı kalması demekti.
      */}
      {/*
        MASAÜSTÜ: GENİŞ MENÜ, SEÇİCİ BAŞINDA (kullanıcı kararı 2026-10-11).
        2026-10-09'da dar bir ikon rayına geçilmişti; kullanıcı geniş menüye
        geri döndürdü ve workspace seçiciyi üst bardan menünün en üstüne,
        logonun altına aldı. Telefonda da aynı yer: çekmecenin başı.
        `z-30`: z verilmezse seçicinin açılır listesi (menüden geniş)
        içeriğin yapışkan üst barının ALTINDA kalırdı. Zemin düz yüzey
        (2026-10-14): buzlu cam kılavuzda yok ve menü referansta düz.
      */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <KenarIcerigi veri={kenarVerisi} ust={<KapsamSecici {...kapsam} tamGenislik />} />
      </aside>

      {/* İçerik */}
      {/*
        BİLDİRİM SAĞLAYICISI HEADER İLE BANDI BİRLİKTE SARIYOR.
        İkisi de `/alerts`i kullanıyor ve DOM'da ayrı yerlerde duruyorlar;
        ayrı ayrı çağırsalardı ajansın 481 hesaplı havuzu aynı sayfa
        yüklemesinde iki kez taranırdı. Ayrıca iki tüketicinin farklı sayı
        göstermesi, ikisinin de yanlış sanılması demek.
      */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-5 backdrop-blur-[10px] lg:px-7">
          {/*
            ═══ ÜST BARDA TEK SEÇİCİ ═══

            Burada İKİ seçici vardı (solda üst hesap, sağda şirket/workspace)
            ve gerekçesi "iki ayrı katman"dı. Katman ayrı ama SORU aynı:
            neredeyim. Yan yana iki açılır kutu ikinci bir arama kutusu
            demekti ve kullanıcının tarifi *"üst hesap ikinci bir search
            barda görünüyor, bu da kafa karıştırıcı"* oldu.

            Bugün tek kutu, tek arama ve ağaç olarak inen seviyeler —
            Google Ads'in hesap seçicisiyle aynı model. Üst hesap seviyesi
            ağacın en altında, ayrı başlık altında; tek hesabı olan kullanıcı
            o bölümü hiç görmüyor.
          */}
          {/* MENÜ DÜĞMESİ YALNIZCA MOBİLDE: masaüstünde kenar çubuğu zaten açık. */}
          {/*
            TELEFONDA SEÇİCİ MENÜNÜN BAŞINDA (çekmece). Üst barda dururken
            asgari genişliği (15rem) zili örtüyordu; "neredeyim" kırıntıda.
          */}
          <MobilMenu veri={kenarVerisi} stil={themeStyle} ust={<KapsamSecici {...kapsam} tamGenislik />} />
          <Kirinti kapsam={kirintiKapsami} sayfalar={kirintiSayfalari} />
          {/*
            SAĞDA YALNIZ İKON (menü kararı 2026-10-14). Kullanıcı ve tema
            menüsü sol altta, kullanıcı kartında. Taslaktaki "Ara" ve
            "Yardım" ikonları YOK: panelde genel arama ve yardım sayfası
            yazılmadı ve hiçbir şey yapmayan bir ikon, çalışmayan bir
            özelliği vaat ederdi. Hedefleri yazılınca buraya eklenir.

            ZİL ÜST BARDA, HER EKRANDA. Onay bekleyen boostlar bir süre
            yalnızca /auto-boost sayfasındaydı ve kullanıcı o sayfaya bir
            onay beklediğini ZATEN bildiğinde giriyordu.
          */}
          <YenileIkonu />
          <BildirimZili />
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

        {/*
          ═══ GENİŞLİK SINIRI TEK YERDE ═══
          Sayfaların yalnızca altısı kendi içinde `max-w-*` koyuyordu:
          Genel Bakış geniş ekranda kenardan kenara yayılıyor, Şirketler'e
          geçince içerik aniden ortalanıyordu. Gezinirken panel "oynuyor".
          Sınır burada; sayfalar yalnızca DAHA DAR bir okuma genişliği
          istiyorsa kendi `max-w`ini koyuyor ve yatay dolguyu TEKRARLAMIYOR
          (iki kat dolgu, o sayfaları diğerlerinden farklı hizalıyordu).
        */}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-7 lg:px-8">{children}</main>

        {!branding?.hidePoweredBy && (
          <footer className="border-t border-line px-5 py-3 text-center text-xs text-ink-muted">
            {branding?.footerText ?? 'Advetics ile güçlendirilmiştir'}
          </footer>
        )}
      </div>
    </div>
    </BildirimSaglayici>
  );
}
