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
const SECICI = kod('components/sirket-secici.tsx');
const SAYFA = kod('app/(dashboard)/ayarlar/ust-hesap/page.tsx');

describe('şirket seçici üst barda', () => {
  it('BOŞA DÜŞME BEKÇİSİ: dosyalar gerçekten okundu', () => {
    expect(LAYOUT).toContain('ClientSwitcher');
    expect(SECICI).toContain('switch-org');
    expect(SAYFA).toContain('manager-account');
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
    expect(LAYOUT).toContain(
      'managerAccountName={session.managerAccount?.name ?? session.organization.name}',
    );
    expect(LAYOUT).toContain(
      'organizations={session.managerAccount?.organizations ?? [session.organization]}',
    );
  });

  it('KRİTİK: seçici AKTİF şirketi okuyor, ev şirketini DEĞİL', () => {
    /*
     * `session.organization.id` EV şirketi; geçiş yapıldığında değişmiyor.
     * Onu vermek, seçicinin her zaman ev şirketini seçili göstermesi demekti
     * — kullanıcı başka bir şirketin verisine bakarken üst barda kendi
     * şirketini görürdü. Sızıntı değil ama sızıntıdan ayırt edilemez.
     */
    expect(LAYOUT).toContain('activeOrganizationId={session.activeOrganizationId}');
    expect(LAYOUT).not.toContain('activeOrganizationId={session.organization.id}');
  });

  it('şirket seçici workspace seçicinin SOLUNDA — hiyerarşi soldan sağa', () => {
    const sirket = LAYOUT.indexOf('<SirketSecici');
    const workspace = LAYOUT.indexOf('<ClientSwitcher');
    expect(sirket).toBeGreaterThan(-1);
    expect(workspace).toBeGreaterThan(-1);
    expect(sirket).toBeLessThan(workspace);
  });
});

describe('ŞİRKET GENELİ GÖRÜNÜM seçicide', () => {
  const WS_SECICI = kod('components/client-switcher.tsx');

  it('BOŞA DÜŞME BEKÇİSİ: workspace seçici kaynağı okundu', () => {
    expect(WS_SECICI).toContain('switch-client');
  });

  it('KRİTİK: "Tüm workspace’ler" satırı workspace seçiciden KALKTI', () => {
    /*
     * Hiyerarşi Şirket › Workspace: "hepsi" şirketin tamamı demek ve o
     * karar bir üst seviyeye ait. İki seçicide birden durması, aynı eylemin
     * iki yeri olması ve birinin bir gün ötekini tutmaması demekti.
     */
    expect(WS_SECICI).not.toContain('Organizasyon geneli görünüm');
    expect(WS_SECICI).not.toContain("label=\"Tüm workspace’ler\"");
  });

  it('KRİTİK: eylem ŞİRKET seçicide ve `clientId: null` gönderiyor', () => {
    expect(SECICI).toContain('async function sirketGeneli()');
    expect(SECICI).toContain("JSON.stringify({ clientId: null })");
  });

  it('KRİTİK: AKTİF şirkete tıklamak artık no-op DEĞİL', () => {
    /*
     * Eskiden hiçbir şey yapmıyordu; org geneli görünüme dönmenin yolu
     * workspace seçicisindeydi. O satır kalkınca burası tek yol oldu —
     * no-op bırakmak, özelliği ulaşılamaz yapardı.
     */
    const secBlogu = blok(SECICI, 'async function sec(');
    expect(secBlogu).toContain('await sirketGeneli();');
  });

  it('şirket geneline dönerken TAM SAYFA yüklemesi YOK', () => {
    // Şirket değişmiyor, yalnızca daraltma kalkıyor; açık süzgeçler aynı
    // şirkete ait olduğu için anlamlarını koruyor.
    const blogu = blok(SECICI, 'async function sirketGeneli()');
    expect(blogu).toContain('router.refresh()');
    expect(blogu).not.toContain('window.location.assign');
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

  it('aynı şirkete tıklamak istek ATMIYOR', () => {
    // Gereksiz bir tur ve tam sayfa yüklemesi; kullanıcı hiçbir şey
    // değiştirmediği hâlde ekranın sıfırlandığını görürdü.
    expect(SECICI).toContain('if (organizationId === activeOrganizationId)');
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

function etiketler(rol: keyof typeof ROLE_PERMISSIONS): string[] {
  return visibleSections([...ROLE_PERMISSIONS[rol]]).flatMap((s) => s.items.map((i) => i.label));
}
