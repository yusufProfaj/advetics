import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@advetics/shared';
import { SECTIONS, visibleSections } from '@/lib/nav-sections';

/**
 * ═══ ÜST HESAP (MCC) — PANEL TARAFI ═══
 *
 * Bu ekran ve seçici, kullanıcının ERİŞEBİLDİĞİ ŞİRKET KÜMESİNİ
 * değiştiriyor — yani bütün izolasyonun sınırını. Panelde bir React test
 * altyapısı YOK (`vitest.config.ts` bunu bilinçli reddediyor), o yüzden
 * kararlar kaynak taramasıyla kilitleniyor.
 *
 * TARAMA YORUMSUZ KAYNAKTA (CLAUDE.md): bir kuralı ANLATAN yorum aynı
 * dosyada duruyor ve `toContain` ikisini ayırt etmiyor.
 */
const WEB_SRC = join(__dirname, '..', '..');

function kod(yol: string): string {
  return readFileSync(join(WEB_SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const LAYOUT = kod('app/(dashboard)/layout.tsx');
const SECICI = kod('components/kapsam-secici.tsx');
const SAYFA = kod('app/(dashboard)/ayarlar/ust-hesap/page.tsx');

describe('TEK SEÇİCİ — ajans › şirket › workspace', () => {
  it('BOŞA DÜŞME BEKÇİSİ: dosyalar gerçekten okundu', () => {
    expect(LAYOUT).toContain('KapsamSecici');
    expect(SECICI).toContain('switch-org');
    expect(SAYFA).toContain('manager-account');
  });

  it('KRİTİK: İKİ AYRI SEÇİCİ KALMADI', () => {
    /*
     * Önce şirket ve workspace ayrı kutulardaydı, aralarında bir `›`.
     * İkisi aynı ağacın seviyeleri: ayrı kutulara koymak, kullanıcının
     * "hangisi hangisini kapsıyor" sorusunu ekrandan değil kafasından
     * cevaplaması demekti ve bir seviye atlamak iki tıklama istiyordu.
     */
    expect(LAYOUT).not.toContain('<ClientSwitcher');
    expect(LAYOUT).not.toContain('<SirketSecici');
  });

  it('KRİTİK: üç seviye de TIKLANABİLİR', () => {
    // Ajans satırı olmadan "tüm şirketler" ulaşılamaz; workspace satırı
    // olmadan seçici bir seviye eksik kalırdı.
    expect(SECICI).toContain('const ajansaGec =');
    expect(SECICI).toContain('const sirketeGec =');
    expect(SECICI).toContain('const workspaceeGec =');
  });

  it('KRİTİK: workspace seçmek TEK istekle — istemcide zincir YOK', () => {
    /*
     * Başka şirketin workspace'ini seçmek şirketi de değiştiriyor, ama o
     * kararı SUNUCU veriyor (`switch-client` cookie'leri kendisi ayarlıyor).
     * İstemcide iki çağrıyı zincirlemek, birincisi başarılı ikincisi
     * başarısız olduğunda yarım bir duruma düşmek demekti.
     */
    const blogu = atama(SECICI, 'workspaceeGec');
    expect(blogu).toContain("'/auth/switch-client'");
    expect(blogu).not.toContain("'/auth/switch-org'");
  });

  it('KRİTİK: KOŞULSUZ basılıyor — üst hesabı olmayan da şirket geneline dönebilsin', () => {
    /*
     * KARAR TERSİNE ÇEVRİLDİ ve sebebi kayda geçiyor.
     *
     * Önce yalnızca üst hesabı olanlara basılıyordu; gerekçe "bağımsız
     * şirkette geçilecek yer yok" idi ve o zaman DOĞRUYDU. Sonra
     * "Tüm workspace'ler" eylemi workspace seçicisinden buraya taşındı ve
     * aynı koşul, üst hesabı olmayan kullanıcının ŞİRKET GENELİ GÖRÜNÜMÜ
     * TAMAMEN KAYBETMESİ anlamına gelmeye başladı — hiçbir ekranda
     * görünmeyecek bir gerileme.
     *
     * Tek şirketli kullanıcıda seçici hâlâ iş yapıyor: nerede olunduğunu
     * gösteriyor ve daraltmayı kaldırma düğmesi oluyor.
     */
    expect(LAYOUT).not.toContain('{session.managerAccount && (');
    // Ajans adı YOKSA `null` — seçici o durumda ajans satırını hiç basmıyor
    // ama kendisi basılıyor ve şirket geneline dönmeyi sağlıyor.
    expect(LAYOUT).toContain('ajans={session.managerAccount?.name ?? null}');
    expect(LAYOUT).toContain('sirketler={sirketler}');
  });

  it('KRİTİK: seçici AKTİF şirketi okuyor, ev şirketini DEĞİL', () => {
    /*
     * `session.organization.id` EV şirketi; geçiş yapıldığında değişmiyor.
     * Onu vermek, seçicinin her zaman ev şirketini seçili göstermesi demekti
     * — kullanıcı başka bir şirketin verisine bakarken üst barda kendi
     * şirketini görürdü. Sızıntı değil ama sızıntıdan ayırt edilemez.
     */
    expect(LAYOUT).toContain('aktifSirketId={session.activeOrganizationId}');
    expect(LAYOUT).not.toContain('aktifSirketId={session.organization.id}');
  });

  it('KRİTİK: ağaç okunamazsa panel ÇALIŞMAYA DEVAM ediyor', () => {
    /*
     * `/manager-account` düşerse seçici tek şirketli hâline düşüyor ve
     * panel açılıyor. Ağacı zorunlu kılmak, tek bir uç yüzünden bütün
     * paneli kilitlemek olurdu.
     *
     * `?? null` da ŞART: uç `null` döndüğünde NestJS gövdeyi boş bırakıyor
     * ve `serverApiFetch` `undefined` dönüyor (`bos-govde-normalize.spec.ts`).
     */
    expect(LAYOUT).toContain(".catch(() => null)) ??");
    expect(LAYOUT).toContain('const sirketler: KapsamSirketi[] = agac');
  });
});

describe('SEÇİCİ — üst hesabı OLMAYAN kullanıcı', () => {
  it('KRİTİK: şirket listesi OTURUMDAN, tek elemanlı yedekten DEĞİL', () => {
    /*
     * Ağaç yokken burada tek elemanlı bir liste kuruluyordu ("aktif
     * şirket") ve danışmanı KİLİTLİYORDU: şirket seviyesi yetki üyelik
     * satırını o şirkette açıyor, ama seçicide yalnızca bulunduğu şirket
     * görünüyordu.
     */
    expect(LAYOUT).toContain('session.erisilebilirSirketler.map((o) => ({');
    expect(LAYOUT).toContain('workspaces: o.workspaces,');
  });

  it('KRİTİK: "0 workspace" YALANI KALKTI', () => {
    /*
     * Yalnızca AKTİF şirketin workspace'leri doldurulup diğerleri boş
     * bırakılıyordu ve seçici onları "Bu şirkette workspace yok" diye
     * çiziyordu. Workspace vardı; ekran yok diyordu.
     *
     * METİN DEĞİŞTİ, KURAL DEĞİŞMEDİ: kırk dokuz şirkette her satırın
     * altında duran iki satırlık gri paragraf okunmaz bir duvar
     * üretiyordu; cümle şirketin yanındaki rozete taşındı. Taşınırken
     * KAYBOLMAMASI gereken şey "yok" ile "erişimin yok" ayrımı — liste
     * kullanıcının ERİŞTİĞİ workspace'leri taşıyor ve şirkette başkaları
     * olabilir.
     */
    expect(LAYOUT).not.toContain('o.id === session.activeOrganizationId');
    expect(SECICI).toContain("'erişimin yok'");
    expect(SECICI).not.toContain("'workspace yok'");
  });

  it('KRİTİK: "Yönetim paneli" YETKİSİ OLMAYANA basılmıyor', () => {
    /*
     * Sayfa `org.write` istiyor ve yetkisiz kullanıcıyı `/dashboard`a
     * yönlendiriyor. Bağlantıyı herkese göstermek, tıklayınca sebepsizce
     * başka bir ekrana atılan bir düğme demekti.
     */
    expect(SECICI).toContain('{yonetimGorunur && (');
    expect(LAYOUT).toContain("yonetimGorunur={hasPermission(session, 'org.write')}");
  });
});

describe('ŞİRKET GENELİ GÖRÜNÜM', () => {
  it('KRİTİK: AKTİF şirkete tıklamak DARALTMAYI KALDIRIYOR — no-op değil', () => {
    /*
     * "Tüm workspace'ler" satırı workspace seçicisinden kalktı; hiyerarşi
     * Şirket › Workspace ve "hepsi" şirketin tamamı demek. Aktif şirkete
     * tıklamak no-op bırakılsaydı, şirket geneline dönmenin yolu KALMAZDI.
     */
    const blogu = atama(SECICI, 'sirketeGec');
    expect(blogu).toContain("{ clientId: null }");
  });

  it('şirket geneline dönerken TAM SAYFA yüklemesi YOK', () => {
    // Şirket değişmiyor, yalnızca daraltma kalkıyor; açık süzgeçler aynı
    // şirkete ait olduğu için anlamlarını koruyor. Son parametre `false`.
    const blogu = atama(SECICI, 'sirketeGec');
    expect(blogu).toContain('false)');
  });
});

describe('geçişin kendisi', () => {
  it('KRİTİK: geçiş TAM SAYFA yüklemesi yapıyor — `router.refresh` yetmiyor', () => {
    /*
     * Şirket değişince kenar çubuğu, workspace listesi ve marka renkleri
     * değişiyor. `refresh` sunucu bileşenlerini tazeliyor ama İSTEMCİ
     * bileşenlerinin state'i (açık filtreler, seçili sekmeler) önceki
     * şirketten kalıyor ve o state yeni şirkette anlamsız kimlikler
     * taşıyor — sessizce boş listeler olarak görünürdü.
     */
    expect(SECICI).toContain('window.location.assign(hedef)');
    /*
     * HEDEF ARTIK SABİT DEĞİL. `/dashboard` yazılıyken kurallar ekranında
     * şirket değiştiren kişi genel bakışa düşüyordu: *"herhangi bir
     * şirkete geçiş yaptığımda genel bakışa atmaması lazım."* Tam sayfa
     * yüklemesi korunuyor, düşülen yer değişti.
     */
    expect(SECICI).toContain('const hedef = gecisHedefi(pathname,');
    expect(SECICI).not.toContain("window.location.assign('/dashboard')");
  });

  it('KRİTİK: hata YUTULMUYOR, ekranda gösteriliyor', () => {
    /*
     * Sessizce eski şirkette kalmak "tıkladım ama değişmedi" hâli demek.
     *
     * DİLİM SÜSLÜ PARANTEZ SAYARAK ÇIKARILIYOR. İlk yazımda `catch`ten ilk
     * `return (`e kadar dilimliyordum ve dilim BOŞ çıktı: `useEffect`in
     * temizleyicisi `return () => ...` yazıyor ve o desen daha önce
     * eşleşiyor. Boş bir dilimde `toContain` her zaman düşer — burada
     * şansımıza kırmızı verdi, ters yönde bir iddia olsaydı sessizce
     * geçerdi. (CLAUDE.md: dilim, sınırlanmak istenen şeyin GERÇEK
     * sınırıyla çıkarılmalı.)
     */
    const catchBlogu = blok(SECICI, '} catch');
    expect(catchBlogu).toContain('setHata(');
    expect(catchBlogu).toContain('ApiRequestError');
  });

  it('ZATEN şirket genelindeyken tıklamak istek ATMIYOR', () => {
    /*
     * KARAR DEĞİŞTİ AMA RUHU AYNI. Eskiden aktif şirkete tıklamak her
     * durumda no-op'tu; "tüm workspace'ler" satırı workspace seçiciden
     * kalkınca o tıklama DARALTMAYI KALDIRMA eylemine dönüştü.
     *
     * Gereksiz tur yasağı duruyor: zaten şirket genelindeysek hiçbir şey
     * değiştirmeyen bir istek, kullanıcıya bir bekleme örtüsü ve sonunda
     * aynı ekranı göstermek demek.
     */
    const blogu = atama(SECICI, 'sirketeGec');
    expect(blogu).toContain('if (buradayiz && !aktifWorkspaceId)');
    expect(blogu).toContain('setOpen(false);');
  });
});

describe('ŞİRKET RAYI — kırk şirkette de kullanılabilir', () => {
  const EKRAN = kod('components/ust-hesap/ust-hesap-ekrani.tsx');

  it('BOŞA DÜŞME BEKÇİSİ: ekran kaynağı okundu', () => {
    expect(EKRAN).toContain('SirketRayi');
    expect(EKRAN).toContain('SirketSatiri');
  });

  it('KRİTİK: KART IZGARASI KALMADI — ray satırları', () => {
    /*
     * Her şirket ~200 piksellik bir karttı, iki kolonda: kırk şirket yirmi
     * satır ve dört bin piksel kaydırma. Asıl iş (seçili şirketi düzenlemek)
     * o kaydırmanın ALTINDA kalıyordu — kullanıcının cümlesiyle "hiç
     * kullanışlı değil".
     */
    expect(EKRAN).not.toContain('SirketKarti');
    expect(EKRAN).toContain('lg:grid-cols-[19rem_minmax(0,1fr)]');
  });

  it('KRİTİK: üst hesap DÜŞSE DE workspace bölümü çiziliyor', () => {
    /*
     * `children` içinde şirket formu VE workspace bölümü var. Hata ya da
     * "üst hesap yok" hâlinde erken `return`la geçmek, `/manager-account`
     * ucu düştüğünde kullanıcının workspace'lerini TAMAMEN kaybetmesi
     * demekti. Üst hesap bir ÜST katman, workspace yönetiminin ön koşulu
     * değil.
     */
    const govde = blok(EKRAN, 'export function UstHesapEkrani');
    const erken = govde.slice(govde.indexOf('if (yuklemeHatasi || !agac)'), govde.indexOf('const aktifSirket'));
    expect(erken.length, 'erken dönüş dilimi boş — tarama boşa düştü').toBeGreaterThan(200);
    expect(erken).toContain('{children}');
  });

  it('KRİTİK: ARAMA VAR ve workspace adlarını da tarıyor', () => {
    /*
     * Bu ekranda iki soru soruluyor: "şu şirket nerede" ve "şu müşteri
     * hangi şirkette". İkincisi eskiden kırk kartı tek tek açmakla
     * cevaplanıyordu.
     */
    const ray = blok(EKRAN, 'function SirketRayi');
    expect(ray).toContain('type="search"');
    expect(ray).toContain('kucult(x.sirket.name).includes(q)');
    expect(ray).toContain('kucult(w.name).includes(q)');
  });

  it('KRİTİK: Türkçe küçültme kullanılıyor — "İkon" araması "ikon" ile eşleşsin', () => {
    // Varsayılan `toLowerCase()` "İ"yi "i̇" (i + birleşen nokta) yapıyor ve
    // eşleşme sessizce kaçıyor.
    expect(EKRAN).toContain("toLocaleLowerCase('tr')");
  });

  it('KRİTİK: SÜZÜLEN LİSTE kaç şirketten kaçı olduğunu SÖYLÜYOR', () => {
    // CLAUDE.md: "Sessiz kesme yok."
    const ray = blok(EKRAN, 'function SirketRayi');
    expect(ray).toContain('şirketten {suzulmus.length} tanesi gösteriliyor');
  });

  it('KRİTİK: liste KENDİ KABINDA kayıyor — detay ekrandan çıkmasın', () => {
    const ray = blok(EKRAN, 'function SirketRayi');
    expect(ray).toContain('overflow-y-auto');
    expect(ray).toContain('max-h-[60vh]');
  });

  it('KRİTİK: workspace ADLARI hâlâ ulaşılabilir — sayı tek başına yetmiyor', () => {
    /*
     * Yalnızca "3 workspace" yazıp içini hiç göstermemek, "hangi müşteri
     * nerede" sorusunu ekrandan cevaplanamaz yapardı. Adlar artık kapalı
     * başlıyor (kırk şirketin adlarını birden basmak aramanın çözdüğü
     * sorunu geri getirirdi) ama bir tıklama uzakta.
     */
    const satir = blok(EKRAN, 'function SirketSatiri');
    expect(satir).toContain('sirket.workspaces.length');
    expect(satir).toContain('sirket.workspaces.map');
    expect(satir).toContain('aria-expanded={acik}');
  });

  it('KRİTİK: arama eşleşmesi AÇMADAN görünüyor', () => {
    // Cevabı bir tıklama daha arkasına koymak, aramayı yarım yapmak olurdu.
    const satir = blok(EKRAN, 'function SirketSatiri');
    expect(satir).toContain('{!acik && eslesen.length > 0 && (');
  });

  it('KRİTİK: ZATEN SEÇİLİ şirkette geçiş düğmesi YOK', () => {
    /*
     * Basılsaydı hiçbir şey değişmeyen bir TAM SAYFA yüklemesi olurdu ve
     * kullanıcı ekranın boşuna sıfırlandığını görürdü. Yerine düzenlemenin
     * SAĞDA olduğu yazılı — yoksa kullanıcı seçili şirketi düzenlemenin
     * yolunu arar.
     */
    const satir = blok(EKRAN, 'function SirketSatiri');
    expect(satir).toContain('aktif ? (');
    expect(satir).toContain('şu an buradasın — sağdan düzenle');
    expect(satir).not.toContain('Yönet');
  });

  it('KRİTİK: aktiflik AKTİF şirkete göre, ev şirketine göre DEĞİL', () => {
    // `isHome` ayrı bir bilgi (üyeliğin nerede olduğu); "şu an neredeyim"
    // sorusuna cevap vermiyor ve ikisini karıştırmak, ev şirketinde
    // olmayan kullanıcıya yanlış satırı işaretlerdi.
    expect(EKRAN).toContain('aktif={sirket.id === aktifOrgId}');
  });

  it('boş workspace listesi SEBEBİNİ söylüyor', () => {
    // "Henüz yok" ile "yüklenemedi" aynı boş alana çevrilmemeli (CLAUDE.md).
    expect(EKRAN).toContain('Bu şirkette henüz workspace yok');
  });

  it('KRİTİK: AÇILIŞTA seçili satır görüş alanına alınıyor', () => {
    /*
     * Şirket değiştirmek TAM SAYFA yüklemesi yapıyor ve dönüşte arama
     * kutusu boşalıyor; kırk şirketlik alfabetik listede yeni seçilen
     * şirket kaydırma kabının DIŞINDA kalabiliyor. Kullanıcı tıklıyor,
     * sayfa yenileniyor ve seçtiği şirketi ekranda göremiyor.
     */
    const ray = blok(EKRAN, 'function SirketRayi');
    expect(ray).toContain("querySelector('[data-aktif=\"true\"]')");
    expect(ray).toContain("scrollIntoView({ block: 'nearest' })");
    // İşaret satırda gerçekten basılıyor mu — yoksa seçici hiçbir zaman
    // eşleşmez ve effect sessizce hiçbir şey yapmaz.
    expect(blok(EKRAN, 'function SirketSatiri')).toContain(
      "data-aktif={aktif ? 'true' : undefined}",
    );
  });

  it('KRİTİK: ŞİRKET EKLEME FORMU kapalı başlıyor', () => {
    // Açık dururken ray'in altında kalıcı bir blok kaplıyordu; şirket açmak
    // seyrek bir iş, her gün yapılan şey listede gezmek.
    const ray = blok(EKRAN, 'function SirketRayi');
    expect(ray).toContain('const [ekleAcik, setEkleAcik] = useState(false)');
    expect(ray).toContain('+ Şirket ekle');
  });
});

describe('WORKSPACE TAŞIMA — kırk bin option düğümü kalmadı', () => {
  const EKRAN = kod('components/ust-hesap/ust-hesap-ekrani.tsx');

  it('KRİTİK: seçici RAY SATIRINDA DEĞİL, detayda TEK tane', () => {
    /*
     * Her şirket kartında bir tane vardı ve her biri DİĞER bütün şirketlerin
     * workspace'lerini listeliyordu: kırk şirkette kırk bin `option` düğümü.
     * Ekranın yavaşlığının ölçülebilir kısmı buydu ve hiçbir yerde
     * görünmüyordu.
     */
    const satir = blok(EKRAN, 'function SirketSatiri');
    expect(satir).not.toContain('<select');
    expect(blok(EKRAN, 'function WorkspaceTasi')).toContain('<select');
  });

  it('KRİTİK: adaylar YALNIZCA başka şirketlerden', () => {
    // Kendi workspace'lerini listelemek, "buraya taşı" deyip hiçbir şey
    // yapmayan bir seçenek göstermek olurdu.
    expect(blok(EKRAN, 'function WorkspaceTasi')).toContain('.filter((d) => d.id !== hedef.id)');
  });

  it('KRİTİK: aday yoksa kutu HİÇ çizilmiyor', () => {
    // Boş bir seçici, yapılabilir bir iş varmış gibi görünüp hiçbir şey
    // yapmıyor.
    expect(blok(EKRAN, 'function WorkspaceTasi')).toContain(
      'if (adaylar.length === 0) return null',
    );
  });

  it('KRİTİK: hedef AKTİF şirket — istemciden gelen bir kimlik değil', () => {
    // Taşıma 30 tabloda `org_id` güncelliyor ve RLS DIŞINDA koşuyor; hedefi
    // ekranda seçili olandan başka bir yerden almak, o yazmanın kapsamını
    // belirsiz yapardı.
    expect(EKRAN).toContain('organizationId: aktifSirket.id');
  });
});

describe('WORKSPACE’LER ŞİRKETİN İÇİNDE', () => {
  const EKRAN = kod('components/ust-hesap/ust-hesap-ekrani.tsx');
  const BOLUM = kod('components/tenancy/workspace-bolumu.tsx');
  const NAV = kod('lib/nav-sections.ts');
  const ESKI_SAYFA = kod('app/(dashboard)/ayarlar/musteriler/page.tsx');

  it('BOŞA DÜŞME BEKÇİSİ: dosyalar okundu', () => {
    // Dilimler boşalırsa aşağıdaki "içeriyor" iddiaları hep yanlış,
    // "içermiyor" iddiaları hep DOĞRU olurdu — ikincisi sessiz.
    expect(BOLUM).toContain('WorkspaceBolumu');
    expect(NAV).toContain("href: '/ayarlar/ust-hesap'");
  });

  it('KRİTİK: workspace bölümü Şirketler sayfasında render ediliyor', () => {
    /*
     * İsteğin kendisi bu: "workspaceler kısmını şirketlerin içerisine
     * taşıyacağız". Bölümün var olması yetmiyor — ÇAĞRILDIĞI da
     * doğrulanmalı; bu depoda bir fonksiyon test edilip çağrıldığı test
     * edilmediği için bir mutasyon kaçmıştı.
     */
    expect(SAYFA).toContain('<WorkspaceBolumu session={session} />');
  });

  it('KRİTİK: menüde AYRI BİR "Workspace’ler" satırı KALMADI', () => {
    // İki satır yan yana dururken menünün kendisi hiyerarşiyi yanlış
    // anlatıyordu: workspace şirketin İÇİNDE, kardeşi değil.
    expect(NAV).not.toContain("label: 'Workspace’ler'");
    expect(NAV).not.toContain("href: '/ayarlar/musteriler'");
  });

  it('KRİTİK: eski adres SİLİNMEDİ, yönlendiriyor', () => {
    /*
     * Bu adres panelin dört ayrı yerinden bağlanıyordu ve kullanıcıların
     * yer imlerinde de duruyor; silmek onları 404'e düşürürdü.
     */
    expect(ESKI_SAYFA).toContain("redirect('/ayarlar/ust-hesap')");
  });

  it('KRİTİK: şirket satırına TIKLAMAK o şirkete geçiriyor', () => {
    // "Şirkete tıkladığımda şirketi düzenleyebileceğim" — düzenleme aktif
    // şirkete çivili olduğu için tıklamanın işi önce oraya GEÇMEK.
    const satir = blok(EKRAN, 'function SirketSatiri');
    expect(satir).toContain('function gec(): void');
    expect(satir).toContain("apiFetch('/auth/switch-org'");

    /*
     * İDDİA SATIR DÜĞMESİNE ÇAPALI, `gec`in VARLIĞINA değil.
     *
     * Bir önceki düzende iddia kartın TAMAMINDA `onClick={gec}` arıyordu ve
     * kartta İKİ çağıran vardı: başlığın tıklanabilirliğini silmek testi
     * DÜŞÜRMÜYORDU. Bugün tek çağıran var ve dilim onun etrafında.
     */
    const dugme = satir.slice(satir.indexOf('<button'), satir.indexOf('</button>'));
    expect(dugme.length, 'satır düğmesi bulunamadı — tarama boşa düştü').toBeGreaterThan(100);
    expect(dugme).toContain('onClick={gec}');
  });

  it('KRİTİK: geçiş AYNI SAYFAYA dönüyor — Genel Bakış’a değil', () => {
    /*
     * Kullanıcı şirketi DÜZENLEMEK için tıkladı. `/dashboard`a atmak,
     * aradığı ekranı yeniden bulmasını istemek olurdu.
     */
    const satir = blok(EKRAN, 'function SirketSatiri');
    expect(satir).toContain("window.location.assign('/ayarlar/ust-hesap')");
  });

  it('KRİTİK: "Tüm şirketler" modunda workspace bölümü ÇİZİLMİYOR', () => {
    /*
     * O modda `/clients` ajansın BÜTÜN workspace'lerini döndürüyor (RLS
     * `app.org_kapsaminda` hepsini açıyor) ve hangisinin hangi şirkete ait
     * olduğu satırda yazmıyor — Genel Bakış'ta yeni düzeltilen düz listenin
     * aynısı. `/organization` de EV şirketini düzenlerdi, yani ekranın
     * söylediğinden BAŞKA bir şirketi.
     */
    expect(SAYFA).toContain('const sirketKapsami = !session.tumSirketler');
    expect(SAYFA).toContain('{!sirketKapsami ? (');
  });

  it('KRİTİK: workspace bölümü hatayı YUTMUYOR', () => {
    // `.catch(() => [])` bu depoda adı konmuş bir yasak: "henüz yok",
    // "yüklenemedi" ve "yetkin yok" aynı boş ekrana çevriliyor.
    expect(BOLUM).not.toContain('.catch(() => [])');
    expect(BOLUM).toContain('Promise.allSettled');
    expect(BOLUM).toContain('yuklemeHatalari');
  });
});

describe('şirket düzenleme', () => {
  const FORM = kod('components/ust-hesap/sirket-duzenle.tsx');
  const EKRAN = kod('components/ust-hesap/ust-hesap-ekrani.tsx');

  it('BOŞA DÜŞME BEKÇİSİ: form kaynağı okundu', () => {
    expect(FORM).toContain('SirketDuzenle');
  });

  it('KRİTİK: form ekranda render ediliyor', () => {
    /*
     * `PATCH /organization` ucu aylardır duruyordu ama panelde HİÇBİR
     * ÇAĞIRANI YOKTU — şirket adı bir kez yazılıp bir daha
     * düzeltilemiyordu. Kural aynı; form SAYFADAN EKRANA taşındı çünkü
     * artık katlanıyor ve açık/kapalı durumu istemci bileşeninde.
     */
    expect(EKRAN).toContain('<SirketDuzenle sirketAdi=');
    // Sayfa da onu BESLEMEK zorunda: prop gelmezse panel boş açılır.
    expect(SAYFA).toContain('sirket={sirketKapsami ? sirket : null}');
  });

  it('KRİTİK: paneller VARSAYILAN KAPALI', () => {
    /*
     * Taşıma kutusu ve şirket bilgileri ekranın üstünde SÜREKLİ AÇIK
     * duruyordu ve workspace listesini aşağı itiyordu. Kullanıcının tarifi:
     * *"gereksiz ve karışık duruyor … bu kadar açıkta durmasın."*
     */
    expect(EKRAN).toContain("useState<'yok' | 'duzenle' | 'tasi' | 'sil'>('yok')");
    expect(EKRAN).toContain("{panel === 'duzenle' && (");
    expect(EKRAN).toContain("{panel === 'tasi' && aktifSirket && (");
  });

  it('KRİTİK: kısa ad GİZLİ — teknik bilgi istiyor', () => {
    /*
     * Kullanıcının tarifi: *"slug yazmak teknik bilgi ister."* Tamamen
     * kaldırmak da çözüm değil (adreslerde kullanılıyor, bir gün
     * düzeltilebilmeli); varsayılan kapalı.
     */
    expect(FORM).toContain('const [gelismis, setGelismis] = useState(false);');
    expect(FORM).toContain('{gelismis && (');
  });

  it('KRİTİK: kaydedilen değer YANITTAN okunuyor', () => {
    /*
     * Sunucu kısa adı normalleştiriyor (`slugify`). Gönderdiğimizi
     * kaydedilmiş saymak, ekranın kaydedilenden FARKLI bir metin göstermesi
     * demekti — önizlemenin yalan söylemesi.
     */
    expect(FORM).toContain('setKayitli({ name: sonuc.name, slug: sonuc.slug })');
  });

  it('KRİTİK: "değişti mi" sorusu PROP’A değil son KAYITLI değere bakıyor', () => {
    /*
     * Prop ile karşılaştırmak iki hâlde yanılıyor: `router.refresh()`
     * inene kadar prop ESKİ (kaydettiği hâlde "kaydedilmedi" görünür), ve
     * sunucu değeri normalleştirirse prop hiçbir zaman yazdığına eşitlenmez
     * — düğme sonsuza kadar açık kalır.
     */
    expect(FORM).toContain('const degisti = ad !== kayitli.name || slug !== kayitli.slug');
  });

  it('KRİTİK: sunucu bileşenleri tazeleniyor', () => {
    // Şirket adı üst bardaki seçicide, kenar çubuğunda ve bu sayfanın
    // kartlarında basılıyor; tazelenmezse form yeni adı, ekranın geri
    // kalanı eskisini gösterir.
    expect(FORM).toContain('router.refresh()');
  });
});

describe('ekranın yetkisi', () => {
  it('KRİTİK: sayfa `org.write` istiyor — menü süzgeci tek başına yetmiyor', () => {
    /*
     * Menü bağlantıyı gizliyor ama adresi bilen biri yine girebilir. Asıl
     * kapı API'de (`assertOrgAdmin`); buradaki kontrol yetkisiz kullanıcının
     * boş ekrana bakıp "bozuk" sanmasını engelliyor.
     */
    expect(SAYFA).toContain("hasPermission(session, 'org.write')");
    expect(SAYFA).toContain("redirect('/dashboard')");
  });

  it('KRİTİK: menüde `org.write` ile kapalı', () => {
    const girdi = SECTIONS.flatMap((s) => s.items).find((i) => i.label === 'Şirketler');
    expect(girdi).toBeDefined();
    expect(girdi?.perm).toBe('org.write');
  });

  it('KRİTİK: `ad_manager` GÖRMÜYOR — workspace açabiliyor ama şirket açamamalı', () => {
    /*
     * `client.write` ile kapatmak yetmezdi: reklam yöneticisi onu taşıyor.
     * Şirket açmak, erişilebilen organizasyon kümesini büyütüyor.
     */
    expect(ROLE_PERMISSIONS.ad_manager).not.toContain('org.write');
    const gorunen = etiketler('ad_manager');
    expect(gorunen).not.toContain('Şirketler');
  });

  it('owner ve admin görüyor', () => {
    expect(etiketler('owner')).toContain('Şirketler');
    expect(etiketler('admin')).toContain('Şirketler');
  });

  it('KRİTİK: müşteri hesabı (client_viewer) GÖRMÜYOR', () => {
    expect(etiketler('client_viewer')).not.toContain('Şirketler');
  });
});

/**
 * `desen`den başlayan bloğu, SÜSLÜ PARANTEZ SAYARAK çıkarır.
 *
 * Sabit uzunluklu ya da "bir sonraki şu dizeye kadar" dilimler komşu kodu
 * yakalıyor ya da boş çıkıyor; ikisi de iddiayı sessizce anlamsız yapıyor.
 */
function blok(kaynak: string, desen: string): string {
  const bas = kaynak.indexOf(desen);
  if (bas === -1) throw new Error(`Blok bulunamadı: ${desen}`);

  /*
   * PARAMETRE LİSTESİ ATLANIYOR.
   *
   * `desen`den sonraki İLK `{`i almak yetmiyor: `function SirketKarti({
   * sirket, aktif })` yazan bir imzada o `{` GÖVDE değil, yıkılan
   * parametre nesnesi. İlk yazımda tam olarak öyleydi ve dilim
   * `{ sirket, aktif }` çıktı — iddia gövdeye hiç bakmadan düştü.
   * (Şansımıza düştü; ters yönde bir iddia sessizce geçerdi.)
   */
  let ara = bas + desen.length;
  const parantez = kaynak.indexOf('(', ara);
  const ilkSusluk = kaynak.indexOf('{', ara);
  if (parantez !== -1 && (ilkSusluk === -1 || parantez < ilkSusluk)) {
    let d = 0;
    for (let i = parantez; i < kaynak.length; i++) {
      if (kaynak[i] === '(') d++;
      else if (kaynak[i] === ')') {
        d--;
        if (d === 0) {
          ara = i + 1;
          break;
        }
      }
    }
  }

  const acilis = kaynak.indexOf('{', ara);
  if (acilis === -1) throw new Error(`Blok açılışı bulunamadı: ${desen}`);
  let derinlik = 0;
  for (let i = acilis; i < kaynak.length; i++) {
    if (kaynak[i] === '{') derinlik++;
    else if (kaynak[i] === '}') {
      derinlik--;
      if (derinlik === 0) return kaynak.slice(acilis, i + 1);
    }
  }
  throw new Error(`Blok kapanmıyor: ${desen}`);
}

/**
 * `const <ad> = ...` atamasının GÖVDESİNİ çıkarır — bir sonraki üst
 * seviye `const`a kadar.
 *
 * `blok()` KULLANILAMIYOR: bu handler'lar `function` değil arrow-const ve
 * gövdeleri süslü parantezle başlamıyor; `blok` ilk `{`i alıyor ve o
 * ARGÜMAN NESNESİ oluyordu (`{ clientId: w.id }`). Dilim yine sayarak
 * değil ama sınırı GERÇEK: bir sonraki bildirim.
 */
function atama(kaynak: string, ad: string): string {
  const bas = kaynak.indexOf(`const ${ad} =`);
  if (bas === -1) throw new Error(`Atama bulunamadı: ${ad}`);
  const sonraki = kaynak.indexOf('\n  const ', bas + 1);
  return kaynak.slice(bas, sonraki === -1 ? undefined : sonraki);
}

function etiketler(rol: keyof typeof ROLE_PERMISSIONS): string[] {
  return visibleSections([...ROLE_PERMISSIONS[rol]]).flatMap((s) => s.items.map((i) => i.label));
}
