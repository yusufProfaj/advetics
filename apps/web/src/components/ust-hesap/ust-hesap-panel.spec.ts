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

  it('KRİTİK: yalnızca ÜST HESABI OLANLARA basılıyor', () => {
    /*
     * Koşulsuz basmak, bağımsız bir şirkette geçilecek yeri olmayan bir
     * seçici göstermek demekti — kullanıcı olmayan bir özelliği arar.
     * `session.managerAccount` null olduğunda blok hiç render edilmiyor.
     */
    expect(LAYOUT).toContain('{session.managerAccount && (');
    expect(LAYOUT).toContain('managerAccountName={session.managerAccount.name}');
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
    const girdi = SECTIONS.flatMap((s) => s.items).find((i) => i.label === 'Üst Hesap');
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
    expect(gorunen).not.toContain('Üst Hesap');
  });

  it('owner ve admin görüyor', () => {
    expect(etiketler('owner')).toContain('Üst Hesap');
    expect(etiketler('admin')).toContain('Üst Hesap');
  });

  it('KRİTİK: müşteri hesabı (client_viewer) GÖRMÜYOR', () => {
    expect(etiketler('client_viewer')).not.toContain('Üst Hesap');
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
  const acilis = kaynak.indexOf('{', bas);
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
