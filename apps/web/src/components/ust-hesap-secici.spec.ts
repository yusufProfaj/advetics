import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ ÜST HESAP SEÇİCİ — PANEL KARARLARI ═══
 *
 * Üst barda artık İKİ seçici var ve ikisi ayrı katman: solda hangi
 * DANIŞMANLIĞIN ağacına bakıldığı, sağda o ağacın içinde hangi
 * şirket/workspace. Karışması, kullanıcının yanlış ağaçta iş yapması demek.
 */
function kod(yol: string): string {
  return readFileSync(join(__dirname, '..', yol), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const SECICI = kod('components/ust-hesap-secici.tsx');
const LAYOUT = kod('app/(dashboard)/layout.tsx');

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SECICI).toContain('export function UstHesapSecici');
    expect(SECICI.length).toBeGreaterThan(1500);
  });
});

describe('KRİTİK: tek hesapta seçici ÇİZİLMİYOR', () => {
  it('iki hesaptan azsa `null` dönüyor', () => {
    /*
     * Geçilecek bir yer yokken açılır kutu, kullanıcıyı olmayan bir
     * özelliği aramaya gönderir. Kendi ajansını yöneten bir müşteri bu
     * seçiciyi hiç görmüyor — ekranı bugünküyle birebir aynı.
     */
    expect(SECICI).toContain('if (hesaplar.length < 2) return null;');
  });
});

describe('KRİTİK: geçiş', () => {
  it('doğru uca gidiyor', () => {
    expect(SECICI).toContain("apiFetch('/auth/switch-manager'");
  });

  it('KRİTİK: aynı hesaba tıklamak istek ATMIYOR', () => {
    // Hiçbir şey değiştirmeyen bir tur, kullanıcıya bir bekleme örtüsü ve
    // sonunda aynı ekranı göstermek demek.
    expect(SECICI).toContain('if (hesap.id === aktifId) {');
  });

  it('KRİTİK: TAM SAYFA — ama aynı sayfada kalıyor', () => {
    /*
     * Üst hesap değişince şirket ve workspace seçimi de sıfırlanıyor;
     * istemci state'i önceki ağaçtan kalırsa sessizce boş listeler üretir.
     * `/dashboard` sabiti yazmak ise kullanıcıyı her geçişte genel bakışa
     * atardı — bu depoda bir kez düzeltilmiş bir hâl.
     */
    expect(SECICI).toContain('window.location.assign(hedef)');
    expect(SECICI).toContain('gecisHedefi(pathname,');
    expect(SECICI).not.toContain("assign('/dashboard')");
  });

  it('KRİTİK: hata YUTULMUYOR', () => {
    expect(SECICI).toContain('Üst hesap değiştirilemedi.');
  });
});

describe('KRİTİK: alttaki sabit sekme', () => {
  it('ayarlara götürüyor ve yetkisize basılmıyor', () => {
    /*
     * Kullanıcının isteği: *"Üst Hesap seçme yerinin en altında da yönetim
     * paneli gibi sabit bir sekme olucak oraya tıklayınca üst hesap
     * ayarlarına götürecek."*
     *
     * Sayfa `org.write` istiyor ve yetkisizi `/dashboard`a yönlendiriyor;
     * bağlantıyı herkese basmak, tıklayınca sebepsizce başka bir ekrana
     * atılan bir düğme demekti.
     */
    expect(SECICI).toContain('href="/ayarlar/ust-hesap"');
    expect(SECICI).toContain('Üst hesap ayarları');
    expect(SECICI).toContain('{yonetimGorunur && (');
  });
});

describe('KRİTİK: PAKET ve ŞİRKET SAYISI satırda', () => {
  it('hangi hesabın ağır olduğu ekrandan okunuyor', () => {
    // Kırk dokuz şirketli bir ajansla tek şirketli bir müşteriyi aynı
    // satırda göstermek, yanlış hesaba girip fark etmemek demekti.
    expect(SECICI).toContain('PAKET_SINIRLARI[h.paket].etiket');
    expect(SECICI).toContain('{h.sirketSayisi} şirket');
  });
});

describe('KRİTİK: layout iki seçiciyi de besliyor', () => {
  it('üst hesap seçici oturumdan geliyor', () => {
    expect(LAYOUT).toContain('<UstHesapSecici');
    expect(LAYOUT).toContain('hesaplar={session.secilebilirUstHesaplar}');
    expect(LAYOUT).toContain('aktifId={session.managerAccount?.id ?? null}');
  });

  it('KRİTİK: kapsam seçici DURUYOR — ikisi ayrı katman', () => {
    /*
     * Üst hesap seçici kapsam seçicinin YERİNE geçmiyor: biri hangi
     * danışmanlığa, diğeri o danışmanlığın içinde hangi şirkete
     * bakıldığını söylüyor.
     */
    expect(LAYOUT).toContain('<KapsamSecici');
    const ust = LAYOUT.indexOf('<UstHesapSecici');
    const kapsam = LAYOUT.indexOf('<KapsamSecici');
    expect(ust).toBeLessThan(kapsam);
  });
});
