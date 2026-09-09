import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `(auth)` altındaki HER sayfa `middleware.ts`in PUBLIC_PATHS listesinde mi?
 *
 * NEDEN BU TEST VAR: bu grubun sayfalarının ortak özelliği, oraya gelen
 * kişinin OTURUMU OLMAMASI. Listeye eklenmeyen bir oturum sayfası,
 * middleware tarafından `/login`e geri atılıyor — yani "Şifremi unuttum"
 * bağlantısı kullanıcıyı geldiği yere döndürüyor.
 *
 * ARIZA HİÇBİR YERDE GÖRÜNMÜYOR: derleme başarılı, sayfa üretiliyor,
 * `next build` çıktısında adı duruyor. Yalnızca tarayıcıda, oturumsuz bir
 * kullanıcıda ortaya çıkıyor — yani geliştirici oturumu açıkken test
 * ederse HİÇ görmüyor.
 *
 * Ters yön KASITLI OLARAK sınanmıyor: PUBLIC_PATHS `(auth)` dışında da
 * girdiler taşıyor (`/r` paylaşılan rapor, `/gizlilik` ve `/kosullar` Meta
 * App Review crawler'ı için) ve `/davet` gibi kaldırılmış bir akışın kalıntısı
 * zararsız — var olmayan bir yolu public saymak 404'ü 404 bırakıyor.
 */
const AUTH_DIR = join(__dirname, '(auth)');
/*
 * YORUMSUZ KAYNAK (CLAUDE.md). Bu satır bir kez ödendi: listedeki bir girdinin
 * üstündeki yorum `/login'e` yazıyor ve o KESME İŞARETİ, aşağıdaki tırnak
 * eşleştirmesini kaydırıyordu — tarama var olan bir yolu "eksik" sanıp yanlış
 * alarm veriyordu. Yorumda geçen bir dize, kodda geçen dizeden ayırt edilemez.
 */
const MIDDLEWARE = readFileSync(join(__dirname, '../middleware.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
  '',
);

/** PUBLIC_PATHS listesini kaynaktan okur — elle kopyalamıyoruz. */
function publicPaths(): string[] {
  const m = MIDDLEWARE.match(/const PUBLIC_PATHS = \[([\s\S]*?)\];/);
  if (!m) throw new Error('PUBLIC_PATHS bulunamadı — middleware.ts yeniden düzenlenmiş olabilir.');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** `(auth)` grubundaki sayfa rotaları. Grup parantezi URL'ye girmiyor. */
function oturumRotalari(): string[] {
  return readdirSync(AUTH_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(AUTH_DIR, d.name, 'page.tsx')))
    .map((d) => `/${d.name}`);
}

describe('(auth) sayfaları public', () => {
  it('BOŞA DÜŞME BEKÇİSİ: tarama gerçekten sayfa buldu', () => {
    // Klasör adı ya da dosya deseni değişirse liste boşalır ve aşağıdaki
    // iddia HER ZAMAN doğru olurdu.
    const rotalar = oturumRotalari();
    expect(rotalar.length).toBeGreaterThanOrEqual(3);
    expect(rotalar).toContain('/login');
    expect(publicPaths().length).toBeGreaterThanOrEqual(5);
  });

  it('KRİTİK: her oturum sayfası PUBLIC_PATHS içinde', () => {
    const izinli = publicPaths();
    const eksik = oturumRotalari().filter((r) => !izinli.includes(r));
    expect(eksik).toEqual([]);
  });
});
