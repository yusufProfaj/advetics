import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ İKİ ADIMLI DOĞRULAMA — PANEL KAYNAK TARAMALARI ═══
 *
 * Panelde bileşen render eden test altyapısı yok (`vitest.config.ts`), yani
 * kurallar kaynaktan sınanıyor. Taramalar YORUMSUZ kaynakta: kuralı anlatan
 * yorum aynı dosyada duruyor ve `toContain` ikisini ayırt etmiyor (CLAUDE.md).
 */
const SRC = join(__dirname, '..', '..');
const oku = (yol: string) => readFileSync(join(SRC, yol), 'utf8');
const yorumsuz = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const DOSYALAR = [
  'components/hesap/iki-adim-parcalari.tsx',
  'components/hesap/iki-adim-paneli.tsx',
  'components/auth/iki-adim-giris.tsx',
  'components/tenancy/iki-adim-sirket-ayari.tsx',
  'app/(dashboard)/hesabim/page.tsx',
];

describe('giriş formu ikinci adımı tanıyor', () => {
  const form = yorumsuz(oku('components/login-form.tsx'));

  it('KRİTİK: ara yanıt oturum sanılmıyor — yönlendirmeden ÖNCE ayrılıyor', () => {
    const dal = form.indexOf('if (ikiAdimBekleniyor(yanit))');
    const yonlendir = form.indexOf('router.replace(nextPath)');
    expect(dal).toBeGreaterThan(-1);
    expect(yonlendir).toBeGreaterThan(-1);
    expect(dal).toBeLessThan(yonlendir);
    // Dal kendi içinde dönüyor; dönmeseydi panele gidip middleware'e takılırdı.
    expect(form.slice(dal, yonlendir)).toContain('return;');
  });

  it('ikinci adım bileşeni çiziliyor', () => {
    expect(form).toMatch(/<IkiAdimGiris[\s\S]*?amac=\{ikiAdim\}/);
  });
});

describe('güvenlik ve sessiz hata', () => {
  it('KRİTİK: QR <img> ile, HTML gömme yok', () => {
    const p = yorumsuz(oku('components/hesap/iki-adim-parcalari.tsx'));
    expect(p).toMatch(/<img[\s\S]*?src=\{bilgi\.qrAdresi\}/);
    for (const d of DOSYALAR) expect(yorumsuz(oku(d))).not.toContain('dangerouslySetInnerHTML');
  });

  it('KRİTİK: hata yutulmuyor (`.catch(() =>` boş liste/sessiz durum yok)', () => {
    for (const d of DOSYALAR) {
      const k = yorumsuz(oku(d));
      expect(k, d).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>/);
      expect(k, d).not.toMatch(/catch\s*\{\s*\}/);
    }
  });

  it('panel metin dili: uzun tire yok', () => {
    for (const d of DOSYALAR) expect(yorumsuz(oku(d)), d).not.toContain('—');
  });
});

describe('Hesabım kapısı', () => {
  it('sayfa başlığı ve menü dışı kapı (ad kartı) aynı adı taşıyor', () => {
    const sayfa = yorumsuz(oku('app/(dashboard)/hesabim/page.tsx'));
    expect(sayfa).toContain("title: 'Hesabım · Advetics'");
    expect(sayfa).toContain('<h1 className="sayfa-baslik">Hesabım</h1>');
    const kenar = yorumsuz(oku('components/kenar-cubugu.tsx'));
    expect(kenar).toContain('href="/hesabim"');
    expect(kenar).toContain('Hesabım');
  });

  it('KRİTİK: /hesabim oturum isteyen yol (public listede değil)', () => {
    const mw = oku('middleware.ts');
    const liste = mw.slice(mw.indexOf('const PUBLIC_PATHS'), mw.indexOf('];', mw.indexOf('const PUBLIC_PATHS')));
    expect(liste).toContain("'/login'"); // boşa düşme bekçisi
    expect(liste).not.toContain('/hesabim');
  });
});

describe('panelin çağırdığı her 2FA ucu API\'de var', () => {
  /*
   * Panel ve API ayrı pakette; bir uç yeniden adlandırılırsa TypeScript
   * hiçbir şey demiyor ve düğme "İstek başarısız (404)" ile düşüyor.
   */
  const API = yorumsuz(
    readFileSync(join(SRC, '..', '..', 'api', 'src', 'modules', 'auth', 'iki-adim', 'iki-adim.controller.ts'), 'utf8'),
  );
  const rotalar = [...API.matchAll(/@(?:Get|Post|Patch)\('([^']+)'\)/g)].map((m) => `/${m[1]}`);

  it('boşa düşme bekçisi: rotalar okundu', () => {
    expect(rotalar.length).toBeGreaterThanOrEqual(9);
  });

  it('KRİTİK: her apiFetch yolu bir rotaya karşılık geliyor', () => {
    const cagrilar: string[] = [];
    for (const d of [...DOSYALAR, 'components/tenancy/team-screen.tsx']) {
      for (const m of yorumsuz(oku(d)).matchAll(/apiFetch(?:<[^>]*>)?\(\s*[`']([^`']+)[`']/g)) {
        const yol = m[1]!.replace(/\$\{[^}]+\}/g, ':userId');
        if (yol.includes('2fa')) cagrilar.push(yol);
      }
    }
    expect(cagrilar.length).toBeGreaterThanOrEqual(8);
    for (const c of cagrilar) expect(rotalar, c).toContain(c);
  });
});
