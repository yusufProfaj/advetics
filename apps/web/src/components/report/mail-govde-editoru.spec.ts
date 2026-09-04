import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imzaTemizle } from '@advetics/shared';
import { domaYazilmali } from './mail-govde-editoru';

/**
 * ═══ MAİL GÖVDESİ: KOD DEĞİL GÖRÜNÜŞ ═══
 *
 * Alan bir `<textarea>` idi ve ham HTML gösteriyordu. Kullanıcının cümlesi:
 * *"html kodunu önizlemeli göstermen lazım kodu değil görünüş açısından güzel
 * gözükmüyor"*.
 */
const EDITOR = readFileSync(join(__dirname, 'mail-govde-editoru.tsx'), 'utf8');
const GONDER = readFileSync(join(__dirname, 'rapor-gonder.tsx'), 'utf8');
const CSS = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8');

/** Yorumsuz kaynak — iddialar açıklamalara değil KODA çapalanmalı. */
function kod(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

describe('rapor gönderme — gövde artık render ediliyor', () => {
  it('KRİTİK: ham HTML gösteren textarea VARSAYILAN DEĞİL', () => {
    /*
     * `textarea` tamamen kaldırılmadı — "HTML" düğmesiyle hâlâ ulaşılabiliyor.
     * Ama varsayılan görünüm render edilmiş hâl olmak zorunda; kullanıcının
     * şikâyeti tam olarak koda bakmak zorunda kalmasıydı.
     */
    expect(kod(GONDER)).toContain('<MailGovdeEditoru');
    expect(kod(GONDER), 'gövde hâlâ doğrudan textarea ile çiziliyor').not.toContain(
      'value={govde}\n                  onChange',
    );
    expect(kod(EDITOR)).toContain('contentEditable');
    // Varsayılan mod önizleme: `kodModu` başlangıçta false.
    expect(kod(EDITOR)).toContain('useState(false)');
  });

  it('KOD MODU duruyor — çözülebilir bir sorun çözülemez yapılmadı', () => {
    // Bir tabloyu elle düzeltmek isteyen kullanıcıdan HTML'i tamamen saklamak
    // yeni bir kısıt olurdu.
    expect(kod(EDITOR)).toContain('<textarea');
    expect(EDITOR).toContain("{kodModu ? 'Önizleme' : 'HTML'}");
  });

  it('KRİTİK: ÖNİZLEME YALAN SÖYLEMİYOR — gönderimdeki temizleyicinin AYNISI', () => {
    /*
     * Gönderim yolunda `imzaTemizle` koşuyor. Panelde İKİNCİ bir temizleyici
     * yazılsaydı doğduğu anda ayrışır ve önizleme sessizce yalan söylemeye
     * başlardı — bu depoda adı konmuş bir hata türü.
     */
    expect(kod(EDITOR)).toContain("from '@advetics/shared'");
    expect(kod(EDITOR)).toContain('imzaTemizle(');
    // Fonksiyon gerçekten ortak pakette; apps/api altında bir kopyası kalmamalı.
    expect(() =>
      readFileSync(join(__dirname, '..', '..', '..', '..', 'api', 'src', 'modules', 'email', 'imza-temizle.ts')),
    ).toThrow();
  });

  it('KRİTİK: YAPIŞTIRMA GİRİŞTE temizleniyor', () => {
    /*
     * Word ve Gmail'den yapıştırılan içerik `<o:p>`, `mso-*` stilleri ve derin
     * `<span>` yuvaları taşıyor. Gönderimde atmak, kullanıcının ekranda
     * gördüğü biçimin maile girmediğini ancak sonradan öğrenmesi demekti.
     * CLAUDE.md: "Doğrulama kullanım anında değil, giriş anında."
     */
    const k = kod(EDITOR);
    expect(k).toContain('onPaste');
    expect(k).toContain('e.preventDefault()');
    expect(k).toContain('imzaTemizle(ham).html');
  });

  it('KRİTİK: gönderimde kırpılacaklar ÖNCEDEN söyleniyor', () => {
    // Sunucu aynı temizliği yapıyor; sessiz kalsaydı fark yalnızca alıcının
    // istemcisinde görünürdü.
    expect(kod(EDITOR)).toContain('rapor.removedTags');
    expect(EDITOR).toContain('Gönderimde şunlar kaldırılacak');
  });

  it('KRİTİK: `deger` BAĞIMLILIKTA — taslak geç gelince kutu dolmalı', () => {
    /*
     * ÜRETİMİ KIRAN İDDİANIN KENDİSİ BURADAYDI. Önce şunu yazmıştım:
     *
     *     expect(govde).toContain('[taslakAnahtari, kodModu]');
     *     expect(govde).not.toContain('deger]');
     *
     * Yani HATALI davranışı test hâline getirmiştim. Editör, taslak sunucudan
     * GELMEDEN monte oluyor (`govde` o an boş dizge); `deger` bağımlılıkta
     * olmayınca effect bir daha koşmuyor ve kutu BOŞ kalıyordu. Kullanıcının
     * gördüğü hâl: "burası boş, html kısmı da boş".
     *
     * Ders: bir bağımlılık listesini "doğru" diye kilitlemeden önce, o listenin
     * hangi SIRAYI varsaydığını sor. Buradaki varsayım "değer monte olurken
     * hazır" idi ve yanlıştı.
     */
    const i = EDITOR.indexOf('useEffect(');
    expect(i, 'useEffect bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);

    /*
     * İDDİA BAĞIMLILIK DİZİSİNİN KENDİSİNE ÇAPALI — effect GÖVDESİNE değil.
     *
     * İlk denemede dilim `indexOf('}, [') + 40` ile alınıyordu ve `deger`
     * kelimesi gövdede de geçtiği için (`hedefHtml: deger`, `el.innerHTML =
     * deger`) iddia, bağımlılık listesinden çıkarılsa BİLE geçiyordu.
     * Mutasyon testinde yakalandı: üretimi kıran değişikliği geri koydum ve
     * 17 testin 17'si de geçti. CLAUDE.md'de adı konmuş tuzak — "sabit
     * uzunluklu dilim komşuyu yakalıyor".
     */
    const dizinBas = EDITOR.indexOf('}, [', i);
    expect(dizinBas, 'bağımlılık dizisi bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const bagimliliklar = EDITOR.slice(dizinBas + 3, EDITOR.indexOf(']', dizinBas) + 1);
    expect(bagimliliklar, 'deger bağımlılıktan çıkarılmış — geç gelen taslak kutuyu doldurmaz')
      .toContain('deger');

    // Kararın kendisi saf fonksiyonda; effect onu ÇAĞIRMAK zorunda.
    expect(EDITOR.slice(i, dizinBas)).toContain('domaYazilmali({');
  });
});

describe('önizlemenin görünüşü', () => {
  it('KRİTİK: mail etiketleri için stil VAR', () => {
    /*
     * Tailwind preflight `h3`, `ul`, `li` gibi etiketleri SIFIRLIYOR. Stil
     * verilmezse başlık gövde metniyle aynı boyutta çıkıyor ve madde
     * işaretleri kayboluyor — kullanıcının "güzel gözükmüyor" dediği hâlin
     * ta kendisi, yalnızca bu kez render edilmiş hâliyle.
     */
    for (const kural of ['.mail-onizleme h3', '.mail-onizleme ul', '.mail-onizleme li']) {
      expect(CSS, `${kural} tanımlı değil`).toContain(kural);
    }
    expect(CSS).toContain('list-style: disc');
  });

  it('KRİTİK: stiller PANELİN geri kalanına SIZMIYOR', () => {
    /*
     * Kapsamsız bir `h3` kuralı, `h3` kullanan her ekranı sessizce
     * değiştirirdi.
     */
    const blok = CSS.slice(CSS.indexOf('.mail-onizleme {'));
    /*
     * SEÇİCİ SATIRI: `}` ve `;` İÇERMEYEN, `{` ile biten satır. İlk yazdığım
     * kalıp `[^{]*` ile satır sonlarını da yutuyor ve kapanış parantezini
     * seçicinin başı sanıyordu — iddia "kapsamsız kural: }" diye düşüyordu.
     */
    const kurallar = [...blok.matchAll(/^([^@\s}][^{};\n]*)\{/gm)].map((m) => m[1]!.trim());
    expect(kurallar.length, 'hiç kural yakalanmadı — tarama boşa düştü').toBeGreaterThan(5);
    for (const k of kurallar) {
      expect(k.startsWith('.mail-onizleme'), `kapsamsız kural: ${k}`).toBe(true);
    }
  });

  it('yapıştırılan konumlandırma kutunun DIŞINA taşmıyor', () => {
    /*
     * Beyaz liste `style` özniteliğini geçiriyor (imzalar renk ve hizayı
     * onunla taşıyor). Yapıştırılan bir `position: fixed` panelin üstünü
     * kaplayabilirdi.
     */
    expect(CSS).toContain('contain: layout paint');
  });
});

/**
 * ═══ TEMİZLEYİCİ TAŞINDI AMA DAVRANIŞI DEĞİŞMEDİ ═══
 *
 * `imza-temizle.ts` `apps/api`den `packages/shared`a taşındı. Taşıma sırasında
 * davranışın kayması, hem imza hem mail gövdesi için sessiz bir gerileme
 * olurdu.
 */
describe('imzaTemizle — taşıma sonrası davranış', () => {
  it('script GÖVDESİYLE atılıyor', () => {
    expect(imzaTemizle('<p>a</p><script>alert(1)</script>').html).toBe('<p>a</p>');
  });

  it('olay öznitelikleri atılıyor', () => {
    expect(imzaTemizle('<p onclick="x">a</p>').html).not.toContain('onclick');
  });

  it('taslağın ürettiği etiketlerin HEPSİ korunuyor', () => {
    /*
     * Beyaz liste taslağın bir etiketini kesseydi, gönderilen mail ekranda
     * görülenden farklı olurdu — sessiz bir ayrışma.
     */
    const taslak =
      '<p>a</p><h3>b</h3><ul><li>c <strong>d</strong></li></ul><p>e<br />f</p>';
    const { html, rapor } = imzaTemizle(taslak);
    expect(rapor.removedTags).toEqual([]);
    for (const etiket of ['<p>', '<h3>', '<ul>', '<li>', '<strong>', '<br']) {
      expect(html, `${etiket} kesilmiş`).toContain(etiket);
    }
  });
});

/**
 * ═══ DOM'A YAZMA KARARI ═══
 *
 * Üretimde kutu boş kaldı ve sebebi bu karardı. Karar effect'in içine gömülü
 * olduğu için hiçbir test onu doğrudan sınayamıyordu — panelde React bileşeni
 * render eden bir altyapı yok (`vitest.config.ts` bunu bilinçli reddediyor).
 * Karar saf bir fonksiyona çıkarıldı ve üç hâl ayrı ayrı kilitlendi.
 */
describe('domaYazilmali', () => {
  it('KRİTİK: taslak GEÇ gelince ve alan boşken YAZILIYOR', () => {
    /*
     * ÜRETİMDEKİ HATA BUYDU. Editör boş monte oluyor, taslak sonra geliyor;
     * yazmazsak kutu kalıcı olarak boş kalıyor.
     */
    expect(domaYazilmali({ mevcutHtml: '', hedefHtml: '<p>taslak</p>', odakta: false })).toBe(
      true,
    );
  });

  it('KRİTİK: kullanıcı YAZARKEN dokunulmuyor — imleç sıçramaz', () => {
    expect(
      domaYazilmali({ mevcutHtml: '<p>yazdım</p>', hedefHtml: '<p>yazdım!</p>', odakta: true }),
    ).toBe(false);
  });

  it('KRİTİK: alan ODAKTA ama BOŞSA yine yazılıyor', () => {
    /*
     * "Kullanıcı taslak gelmeden alana tıkladı" hâli. Odak yüzünden
     * dokunmamak, kutuyu kalıcı olarak boş bırakırdı — hatanın dar bir
     * yarışa dönüşmüş hâli.
     */
    expect(domaYazilmali({ mevcutHtml: '', hedefHtml: '<p>taslak</p>', odakta: true })).toBe(true);
    // Yalnızca boşluk da BOŞ sayılıyor: contentEditable boşken `<br>` ya da
    // boşluk bırakabiliyor.
    expect(domaYazilmali({ mevcutHtml: '  \n ', hedefHtml: '<p>t</p>', odakta: true })).toBe(true);
  });

  it('AYNI içerik yeniden YAZILMIYOR — gereksiz imleç oynaması yok', () => {
    expect(domaYazilmali({ mevcutHtml: '<p>a</p>', hedefHtml: '<p>a</p>', odakta: false })).toBe(
      false,
    );
    expect(domaYazilmali({ mevcutHtml: '', hedefHtml: '', odakta: false })).toBe(false);
  });

  it('kullanıcı içeriği TEMİZLEDİYSE state boşalabiliyor', () => {
    // Odakta değilken hedef boşsa yazılıyor: "hepsini sil" geçerli bir düzenleme.
    expect(domaYazilmali({ mevcutHtml: '<p>a</p>', hedefHtml: '', odakta: false })).toBe(true);
  });
});
