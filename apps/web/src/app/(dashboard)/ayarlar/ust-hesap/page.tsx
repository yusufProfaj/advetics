import { redirect } from 'next/navigation';
import type { ManagerAccountTree } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, requireSession } from '@/lib/session';
import { UstHesapEkrani } from '@/components/ust-hesap/ust-hesap-ekrani';
import { WorkspaceBolumu } from '@/components/tenancy/workspace-bolumu';

export const metadata = { title: 'Şirketler — Advetics' };

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
}

/**
 * ŞİRKETLER — ajansın altındaki şirketler VE içlerindeki workspace'ler.
 *
 * Hiyerarşi: Üst Hesap → Şirket → Workspace → Reklam Hesabı → Kampanya.
 *
 * WORKSPACE'LER BURAYA TAŞINDI. Kenar çubuğunda "Şirketler" ve
 * "Workspace'ler" yan yana iki satırdı ve bu hiyerarşiyi gizliyordu:
 * workspace şirketin İÇİNDE, yanında değil. Kullanıcı workspace listesine
 * bakarken hangi şirkette olduğunu ekrandan okuyamıyordu.
 *
 * AŞAĞIDAKİ BÖLÜM AKTİF ŞİRKETİN — ve bu bir tercih değil, sınırın kendisi.
 * `/clients` ve `/organization` uçları RLS ile aktif şirkete çivili; başka
 * bir şirketin workspace'ini buradan düzenlemek RLS'in ifade EDEMEDİĞİ bir
 * yazma olurdu. Şirket kartına tıklamak o yüzden önce O ŞİRKETE GEÇİRİYOR.
 *
 * YETKİ SAYFADA DA KONTROL EDİLİYOR, yalnızca menüde değil: menü süzgeci
 * bağlantıyı gizliyor ama adresi bilen biri yine girebilir. Asıl kapı API
 * tarafında — buradaki kontrol, yetkisiz kullanıcının boş bir ekrana bakıp
 * "bozuk" sanmasını engelliyor.
 */
export default async function SirketlerPage() {
  const session = await requireSession();

  if (!hasPermission(session, 'org.write')) {
    redirect('/dashboard');
  }

  /*
   * HATA YUTULMUYOR (CLAUDE.md: `.catch(() => setX([]))` yasak).
   *
   * `null` ile hata AYNI ŞEY DEĞİL: birincisi "üst hesabın yok, kurabilirsin",
   * ikincisi "okuyamadık". İkisini aynı boş ekrana çevirmek, kullanıcının
   * var olan bir üst hesabın üstüne ikincisini kurmaya çalışması demekti.
   */
  let agac: ManagerAccountTree | null = null;
  let yuklemeHatasi: string | null = null;
  try {
    /*
     * `?? null` ZORUNLU — TİP YALAN SÖYLÜYOR.
     *
     * NestJS bir uç `null` döndürdüğünde gövdeyi BOŞ bırakıyor ve durum kodu
     * 200 kalıyor; `handle()` boş gövdede `undefined` dönüyor (`lib/api.ts`
     * bunu uzun uzun anlatıyor). Yani dönüş tipi `T | null` yazsa da eline
     * `undefined` geliyor ve TypeScript bunu göremiyor: `serverApiFetch<T>`
     * denetimsiz bir dönüşüm.
     *
     * BU CANLIDA PATLADI: `agac === null` kontrolü `undefined` için false
     * kalıyor, ekran ağacı çizmeye çalışıyor ve `agac.name` fırlatıyor —
     * kullanıcı "Bu ekran yüklenemedi" görüyor.
     */
    agac = (await serverApiFetch<ManagerAccountTree | null>('/manager-account')) ?? null;
  } catch (e) {
    yuklemeHatasi = e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
  }

  /*
   * "TÜM ŞİRKETLER" MODUNDA TEK BİR AKTİF ŞİRKET YOK.
   *
   * O modda `/clients` ajansın BÜTÜN workspace'lerini döndürüyor (RLS
   * `app.org_kapsaminda` hepsini açıyor) ve hangisinin hangi şirkete ait
   * olduğu satırda yazmıyor — Genel Bakış'ta yeni düzeltilen düz listenin
   * aynısı. `/organization` de EV şirketini düzenlerdi, yani ekranın
   * söylediğinden başka bir şirketi.
   *
   * Bu yüzden şirket paneli o modda HİÇ ÇİZİLMİYOR ve sebebi yazılıyor.
   */
  const sirketKapsami = !session.tumSirketler;

  let sirket: OrganizationRow | null = null;
  let sirketHatasi: string | null = null;
  if (sirketKapsami) {
    try {
      sirket = (await serverApiFetch<OrganizationRow | null>('/organization')) ?? null;
    } catch (e) {
      sirketHatasi = e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
    }
  }

  return (
    /*
     * GENİŞLİK 5xl'DEN 7xl'E: workspace kartları bu sayfaya taşındı ve
     * 1024px'lik bir şeride sıkışıyorlardı — varlık listeleri ve açılır
     * kutular satır satır kırılıyordu.
     */
    <div className="mx-auto w-full max-w-7xl space-y-8 px-5 py-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Şirketler</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Google&apos;ın Müşteri Merkezi (MCC) karşılığı: bir danışmanlık, altındaki birden çok
          şirketi tek girişle yönetir. Her şirketin kendi workspace&apos;leri, kendi reklam
          hesapları ve kendi ekibi olur. Soldaki listeden bir şirkete tıkladığında o şirkete
          geçilir ve sağda düzenlenir.
        </p>
      </header>

      {/*
        DETAY `children` OLARAK GEÇİYOR — kabuk istemci bileşeni, içerik
        SUNUCU bileşeni. `SirketDuzenle` ve `WorkspaceBolumu` sunucu tarafı
        veri çekiyor; onları istemciye taşımak o çözümleri de taşımak
        olurdu. Next.js sunucu bileşenlerini `children` üzerinden geçirmeye
        izin veriyor ve bu tam olarak o desen.
      */}
      {/*
        ŞİRKET BİLGİSİ ARTIK `children` DEĞİL PROP.
        Düzenleme ve taşıma panelleri KATLANABİLİR olmak zorunda ve açık/kapalı
        durumu istemci bileşeninde duruyor; sunucuda üretilen bir `children`
        oradan kontrol edilemez. Workspace bölümü `children` olarak kalıyor —
        o gerçekten sunucu tarafı veri çekiyor.
      */}
      <UstHesapEkrani
        ilkAgac={agac}
        aktifOrgId={session.activeOrganizationId}
        yuklemeHatasi={yuklemeHatasi}
        sirket={sirketKapsami ? sirket : null}
        sirketHatasi={sirketKapsami ? sirketHatasi : null}
      >
        {!sirketKapsami ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">
            &quot;Tüm şirketler&quot; görünümündesin. Bir şirketin bilgilerini ve
            workspace&apos;lerini düzenlemek için soldan o şirkete geç.
          </p>
        ) : (
          /* WORKSPACE'LER ŞİRKETİN İÇİNDE — ayrı sayfa değil. */
          <WorkspaceBolumu session={session} />
        )}
      </UstHesapEkrani>
    </div>
  );
}
