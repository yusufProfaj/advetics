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
    expect(SECICI).toContain("window.location.assign('/dashboard')");
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

describe('şirket kartı', () => {
  const EKRAN = kod('components/ust-hesap/ust-hesap-ekrani.tsx');

  it('BOŞA DÜŞME BEKÇİSİ: ekran kaynağı okundu', () => {
    expect(EKRAN).toContain('SirketKarti');
  });

  it('KRİTİK: workspace listesi kartın İÇİNDE — sayı değil AD', () => {
    /*
     * Yalnızca "3 workspace" yazıp içini göstermemek, kullanıcının hangi
     * müşterinin hangi şirkette olduğunu bulmak için her şirkete tek tek
     * geçmesi demekti. Sayı listeden türetiliyor; iki alan ayrı gelseydi
     * biri diğerini tutmadığında hangisinin doğru olduğu belirsiz olurdu.
     */
    expect(EKRAN).toContain('sirket.workspaces.length');
    expect(EKRAN).toContain('sirket.workspaces.map');
  });

  it('KRİTİK: ZATEN SEÇİLİ şirkette "Yönet" düğmesi YOK', () => {
    /*
     * Basılsaydı hiçbir şey değişmeyen bir TAM SAYFA yüklemesi olurdu ve
     * kullanıcı ekranın boşuna sıfırlandığını görürdü.
     */
    const kart = blok(EKRAN, 'function SirketKarti');
    expect(kart).toContain('aktif ? (');
    expect(kart).toContain('Şu an bu şirkettesin');
  });

  it('KRİTİK: aktiflik AKTİF şirkete göre, ev şirketine göre DEĞİL', () => {
    // `isHome` ayrı bir bilgi (üyeliğin nerede olduğu); "şu an neredeyim"
    // sorusuna cevap vermiyor ve ikisini karıştırmak, ev şirketinde
    // olmayan kullanıcıya yanlış kartı işaretlerdi.
    expect(EKRAN).toContain('aktif={o.id === aktifOrgId}');
  });

  it('boş workspace listesi SEBEBİNİ söylüyor', () => {
    // "Henüz yok" ile "yüklenemedi" aynı boş alana çevrilmemeli (CLAUDE.md).
    expect(EKRAN).toContain('Bu şirkette henüz workspace yok');
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
