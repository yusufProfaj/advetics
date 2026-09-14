import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ `public/` ALTINDAKİ HER DOSYA MIDDLEWARE'DEN MUAF OLMALI ═══
 *
 * Middleware oturumu olmayan isteği `/login`'e yönlendiriyor ve eleği DOSYA
 * UZANTISINA bakıyor. Listede olmayan bir uzantı sessizce ölüyor: istek 307
 * alıyor, tarayıcı HTML'i medya sanıyor ve `<video>`
 * `MEDIA_ERR_SRC_NOT_SUPPORTED` ile duruyor. Sayfada hata görünmüyor —
 * yalnızca video hiç oynamıyor.
 *
 * Bu tam olarak yaşandı: hero filmi `public/hero/hero.mp4` olarak eklendi,
 * `mp4` listede yoktu ve poster (`.jpg`) listede olduğu için ÇALIŞTI. Yani
 * belirti "görsel yok" bile değildi; sayfa doğru görünüyor, film donuyordu.
 *
 * Test iki listeyi karşılaştırıyor, sayıyı elle sabitlemiyor: `public/`
 * altına yeni bir tür dosya konduğunda kapsam kendiliğinden genişliyor ve
 * matcher güncellenmemişse test düşüyor.
 */
const KOK = resolve(__dirname, '..');
const PUBLIC = join(KOK, 'public');

/** Middleware kaynağındaki matcher deseni — elle kopyalanmıyor, okunuyor. */
const MIDDLEWARE = readFileSync(join(KOK, 'src', 'middleware.ts'), 'utf8');

function matcherDeseni(): RegExp {
  /*
   * Desen kaynaktan ÇEKİLİYOR. Elle kopyalansaydı iki desen ayrışır ve test
   * gerçekte çalışan middleware'i değil kendi kopyasını sınardı — yani
   * yeşil kalıp hiçbir şey tutmazdı.
   */
  const m = MIDDLEWARE.match(/matcher:\s*\[\s*'([^']+)'/);
  if (!m?.[1]) throw new Error('matcher deseni bulunamadı — tarama boşa düştü');
  // Kaynakta TypeScript dizesi olarak duruyor: `\\.` gerçekte `\.` demek.
  return new RegExp('^' + m[1].replace(/\\\\/g, '\\') + '$');
}

/** `public/` altındaki bütün dosyaların site köküne göre yolları. */
function varliklar(dizin: string): string[] {
  const cikti: string[] = [];
  for (const giris of readdirSync(dizin, { withFileTypes: true })) {
    const tam = join(dizin, giris.name);
    if (giris.isDirectory()) cikti.push(...varliklar(tam));
    // macOS `.DS_Store` gibi gizli dosyalar depoya girmiyor; yine de eleniyor.
    else if (!giris.name.startsWith('.')) cikti.push('/' + relative(PUBLIC, tam));
  }
  return cikti;
}

const DOSYALAR = varliklar(PUBLIC);
const DESEN = matcherDeseni();

describe('tarama boşa düşmüyor', () => {
  it('public altında dosya var ve desen okundu', () => {
    expect(DOSYALAR.length).toBeGreaterThan(0);
    expect(DESEN.source.length).toBeGreaterThan(50);
  });

  it('desen GERÇEKTEN eliyor — sıradan bir sayfa yolu middleware’e giriyor', () => {
    /*
     * Deseni ters yönde de sınamak şart: her şeyi dışlayan bozuk bir desen
     * aşağıdaki bütün iddiaları geçirirdi ve middleware hiç çalışmazdı.
     */
    expect(DESEN.test('/dashboard')).toBe(true);
    expect(DESEN.test('/raporlar')).toBe(true);
    expect(DESEN.test('/')).toBe(true);
  });
});

describe('KRİTİK: statik varlıklar middleware’e girmiyor', () => {
  for (const dosya of DOSYALAR) {
    it(`${dosya} muaf`, () => {
      expect(
        DESEN.test(dosya),
        `${dosya} middleware’e giriyor → oturumsuz istek /login’e 307 alır ve ` +
          `dosya SESSİZCE ölür. ${extname(dosya) || '(uzantısız)'} uzantısını ` +
          `middleware.ts içindeki matcher listesine ekleyin.`,
      ).toBe(false);
    });
  }
});

describe('KRİTİK: hero filmi ve posteri yerinde', () => {
  /*
   * Bileşen bu iki yolu sabit yazıyor. Dosya adı değişirse video sessizce
   * yüklenmiyor; poster de yoksa kutu bomboş kalıyor ve hiçbir hata düşmüyor.
   */
  const BILESEN = readFileSync(
    join(KOK, 'src', 'components', 'landing', 'kaydirma-filmi.tsx'),
    'utf8',
  );

  it('bileşendeki yollar public altında gerçekten var', () => {
    const yollar = [...BILESEN.matchAll(/'(\/hero\/[^']+)'|"(\/hero\/[^"]+)"/g)]
      .map((m) => m[1] ?? m[2])
      .filter((y): y is string => Boolean(y));
    expect(yollar.length, 'bileşende /hero/ yolu bulunamadı — tarama boşa düştü').toBeGreaterThan(1);
    for (const y of new Set(yollar)) expect(DOSYALAR).toContain(y);
  });
});
