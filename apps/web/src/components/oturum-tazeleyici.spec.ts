import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * OTURUM TAZELEME — kararlar.
 *
 * Bu bileşen bir zamanlayıcı ve tarayıcı kilidi etrafında kurulu; depoda DOM
 * test altyapısı yok. Sınanan şey, kaldırılması hâlinde arızayı geri
 * getirecek ya da DAHA KÖTÜSÜNÜ üretecek kararlar.
 */
const KAYNAK = readFileSync(join(__dirname, 'oturum-tazeleyici.tsx'), 'utf8');
const LAYOUT = readFileSync(
  join(__dirname, '..', 'app', '(dashboard)', 'layout.tsx'),
  'utf8',
);

const yorumsuz = (m: string): string =>
  m
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('kaynak okunuyor ve bileşen panele bağlı', () => {
    expect(KAYNAK.length).toBeGreaterThan(1500);
    expect(yorumsuz(KAYNAK)).toContain('OturumTazeleyici');
    expect(yorumsuz(LAYOUT)).toContain('<OturumTazeleyici />');
  });
});

describe('yenileme', () => {
  it('KRİTİK: /auth/refresh çağrılıyor', () => {
    // Uç API'de vardı ve çalışıyordu; panelde onu çağıran tek satır yoktu.
    expect(yorumsuz(KAYNAK)).toContain('/auth/refresh');
  });

  it('KRİTİK: cookie gönderiliyor', () => {
    // Refresh cookie `path=/api/auth` ile sınırlı; `credentials` olmadan
    // istek cookie'siz gider ve sunucu "Oturum bulunamadı" der.
    expect(yorumsuz(KAYNAK)).toContain("credentials: 'include'");
  });

  it('KRİTİK: aralık access TTL’den KISA', () => {
    /*
     * Access token 15 dakika. Aralık ondan uzun ya da eşit olursa token
     * yenilenmeden önce ölür ve arıza aynen geri gelir.
     */
    const kod = yorumsuz(KAYNAK);
    const m = /const ARALIK_MS = (\d+) \* 60 \* 1000/.exec(kod);
    if (!m) throw new Error('ARALIK_MS bulunamadı — tarama boşa düştü.');
    expect(Number(m[1])).toBeLessThan(15);
  });
});

describe('SEKMELER ARASI KİLİT — düzeltmenin daha kötüsünü üretmemesi', () => {
  it('KRİTİK: navigator.locks ile kilitleniyor', () => {
    /*
     * `token.service.ts` rotasyon + YENİDEN KULLANIM TESPİTİ uyguluyor:
     * iptal edilmiş token ikinci kez sunulursa BÜTÜN AİLE iptal ediliyor.
     * İki sekme aynı anda yenilerse kullanıcı HER YERDEN atılır — yani
     * kilitsiz bir düzeltme, düzelttiği hatanın daha kötüsünü üretir.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain("'locks' in navigator");
    expect(kod).toContain('navigator.locks.request');
  });

  it('KRİTİK: zaman damgası kilidin İÇİNDE kontrol ediliyor', () => {
    // Kilide sırayla giren ikinci sekmenin tekrar yenilemesi gereksiz ve
    // rotasyonu boşuna ilerletirdi.
    const kod = yorumsuz(KAYNAK);
    const i = kod.indexOf('const govde');
    const j = kod.indexOf('locks' , i);
    expect(i).toBeGreaterThan(-1);
    expect(kod.slice(i, j)).toContain('ESIK_MS');
  });

  it('başarısız denemede zaman damgası GÜNCELLENMİYOR', () => {
    // Başarısızı başarılı saymak, gerçekten yenilenebilecek bir anı
    // atlamak demek.
    const kod = yorumsuz(KAYNAK);
    const i = kod.indexOf('if (!res.ok)');
    const j = kod.indexOf('localStorage.setItem', i);
    expect(i).toBeGreaterThan(-1);
    // `return` setItem'dan ÖNCE gelmeli.
    expect(kod.slice(i, j)).toContain('return;');
  });
});

describe('arka plan sekmesi', () => {
  it('KRİTİK: sekmeye dönünce de yenileniyor', () => {
    /*
     * Tarayıcılar arka plandaki sekmelerde zamanlayıcıları kısıyor; yalnızca
     * setInterval'a güvenmek, bir saat sonra sekmeye dönen kullanıcının yine
     * atılması demekti.
     */
    expect(yorumsuz(KAYNAK)).toContain('visibilitychange');
  });

  it('açılışta hemen bir deneme yapılıyor', () => {
    const kod = yorumsuz(KAYNAK);
    const i = kod.indexOf('useEffect(() => {');
    const j = kod.indexOf('setInterval', i);
    expect(kod.slice(i, j)).toContain('yenilemeyiDene()');
  });
});
