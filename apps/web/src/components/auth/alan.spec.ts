import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ ŞİFREYİ GÖSTER — OTURUM EKRANLARININ ALANI ═══
 *
 * Panelde bileşen render eden bir test altyapısı yok (`vitest.config.ts`
 * bunu bilinçli reddediyor), yani bu kararlar yalnızca kaynak taramasıyla
 * kilitlenebiliyor. Taranan şey davranış değil KARAR: düğmenin formu
 * göndermemesi, varsayılanın gizli olması ve durumun alan başına tutulması.
 */
const DIZIN = __dirname;
const kaynak = (ad: string): string => readFileSync(join(DIZIN, ad), 'utf8');
const ALAN = kaynak('alan.tsx');

describe('tarama boşa düşmüyor', () => {
  it('kaynak okundu', () => {
    expect(ALAN).toContain('export function Alan');
    expect(ALAN.length).toBeGreaterThan(1000);
  });
});

describe('şifre alanı', () => {
  it('KRİTİK: düğme `type="button"` — yoksa forma basınca GÖNDERİRDİ', () => {
    /*
     * HTML'de bir `<button>`ın varsayılanı `submit` ve bu düğme giriş
     * formunun İÇİNDE duruyor: "Göster"e basmak formu gönderir ve kullanıcı
     * yarım yazdığı şifreyle "şifre yanlış" alırdı.
     */
    const bas = ALAN.indexOf('setGorunur((g) => !g)');
    expect(bas, 'düğme bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    // Dilim düğmenin KENDİSİNDEN başlıyor: sabit uzunluklu bir pencere
    // komşu `<input>`un özniteliklerini yakalayabilirdi.
    const dugme = ALAN.lastIndexOf('<button', bas);
    expect(ALAN.slice(dugme, bas)).toContain('type="button"');
  });

  it('KRİTİK: varsayılan GİZLİ — açmak kullanıcının kararı', () => {
    // Varsayılanı açık yapmak, omuz üstünden okunabilen bir şifre alanı
    // demekti ve kullanıcı bunu fark etmeden yazardı.
    expect(ALAN).toContain('useState(false)');
    expect(ALAN).toContain("const etkinTip = sifreAlani && gorunur ? 'text' : type;");
  });

  it('KRİTİK: durum ALANIN İÇİNDE — iki şifre alanı birbirini açmıyor', () => {
    /*
     * Şifre belirleme ekranında iki alan var (yeni şifre + tekrar). Ortak
     * bir bayrak, birini açınca diğerini de açardı.
     */
    const bas = ALAN.indexOf('export function Alan');
    const durum = ALAN.indexOf('const [gorunur, setGorunur]');
    expect(durum).toBeGreaterThan(bas);
  });

  it('KRİTİK: yalnızca şifre alanında — e-posta alanında "Göster" yok', () => {
    expect(ALAN).toContain("const sifreAlani = type === 'password';");
    expect(ALAN).toContain('{sifreAlani && (');
  });

  it('düğme METİN, ikon değil — hangi hâlde olduğu okunabiliyor', () => {
    /*
     * Göz ikonunun "şu an gizli" mi "tıklayınca gizlenir" mi anlattığı
     * kullanıcıya göre değişiyor; bu ekranda yanlış tahmin, şifreyi
     * okunur bırakıyor.
     */
    expect(ALAN).toContain("{gorunur ? 'Gizle' : 'Göster'}");
    expect(ALAN).toContain('aria-pressed={gorunur}');
  });

  it('erişilebilirlik bağları KORUNDU — hata/ipucu metni hâlâ bağlı', () => {
    // Düğme eklerken `<input>` bir sarmalayıcıya taşındı; `aria-describedby`
    // bağının orada kopması yalnızca ekran okuyucu kullanan birini etkilerdi.
    expect(ALAN).toContain('aria-describedby={yardimId}');
    expect(ALAN).toContain('aria-invalid={error');
  });
});

describe('KRİTİK: bütün oturum ekranları AYNI alanı kullanıyor', () => {
  const FORMLAR = readdirSync(DIZIN)
    .filter((f) => f.endsWith('.tsx') && f !== 'alan.tsx')
    .concat(['../login-form.tsx']);

  it('tarama boşa düşmüyor — formlar bulundu', () => {
    expect(FORMLAR.length).toBeGreaterThan(1);
  });

  it('hiçbir oturum formu KENDİ ham şifre input’unu kurmuyor', () => {
    /*
     * Özellik `Alan`a konuldu ki üç ekranda birden çalışsın — en çok
     * gereken yer giriş değil ŞİFRE BELİRLEME: orada yazdığını
     * doğrulayamayan kullanıcı, kaydettiği şifreyi bir sonraki girişte
     * öğreniyor. Bir ekran kendi `<input>`unu kurarsa özellik ORADA
     * sessizce yok olur.
     *
     * İDDİA `type="password"` DİZGESİNE BAKAMAZ: `<Alan type="password" />`
     * DOĞRU kullanım ve aynı dizgeyi taşıyor. Bakılan şey HAM `<input>`
     * etiketinin kendisi.
     */
    for (const f of FORMLAR) {
      const kod = kaynak(f).replace(/\/\*[\s\S]*?\*\//g, '');
      const etiketler = kod.split('<input').slice(1).map((p) => p.split('>')[0] ?? '');
      for (const e of etiketler) {
        expect(e, `${f} ham bir şifre input’u kuruyor`).not.toContain('password');
      }
    }
  });

  it('giriş formu şifreyi `Alan` üzerinden veriyor', () => {
    const giris = kaynak('../login-form.tsx');
    expect(giris).toContain('<Alan');
    expect(giris).toContain('id="password"');
  });
});
