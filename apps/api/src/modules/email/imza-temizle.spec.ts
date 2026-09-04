import { describe, expect, it } from 'vitest';
import { imzaTemizle } from '@advetics/shared';

/**
 * İMZA TEMİZLİĞİ.
 *
 * İmza kullanıcıdan geliyor, panelde ÖNİZLENİYOR ve müşteriye giden maile
 * gömülüyor. Üçü de saldırı yüzeyi: panelde saklanmış XSS başka bir
 * danışmanın oturumunu, mailde ise alıcının istemcisini hedefler.
 */
describe('imzaTemizle', () => {
  it('KRİTİK: script GÖVDESİYLE atılıyor — yalnızca etiketi atmak yetmez', () => {
    // Yalnızca etiketi atmak gövdeyi düz metin olarak bırakırdı.
    const r = imzaTemizle('<p>Merhaba</p><script>alert(1)</script>');
    expect(r.html).not.toContain('alert(1)');
    expect(r.html).toContain('Merhaba');
    expect(r.rapor.removedTags).toContain('script');
  });

  it('KRİTİK: olay öznitelikleri atılıyor', () => {
    const r = imzaTemizle('<img src="https://a/b.png" onerror="alert(1)" />');
    expect(r.html).not.toContain('onerror');
    expect(r.rapor.removedAttributes).toContain('onerror');
  });

  it('KRİTİK: javascript: ve data: şemaları atılıyor', () => {
    const a = imzaTemizle('<a href="javascript:alert(1)">tık</a>');
    expect(a.html).not.toContain('javascript:');
    const b = imzaTemizle('<img src="data:text/html;base64,PHN2Zz4=" />');
    expect(b.html).not.toContain('data:');
  });

  it('iframe/style/link atılıyor', () => {
    const r = imzaTemizle('<style>body{}</style><iframe src="x"></iframe><p>a</p>');
    expect(r.html).toBe('<p>a</p>');
    expect(r.rapor.removedTags).toEqual(expect.arrayContaining(['iframe', 'style']));
  });

  it('yorumlar atılıyor — koşullu yorumlar kod taşıyabiliyor', () => {
    expect(imzaTemizle('<!--[if IE]><script>x</script><![endif]--><p>a</p>').html).toBe('<p>a</p>');
  });

  it('imzanın GERÇEK yapısı korunuyor — tablo, görsel, bağlantı, stil', () => {
    const giris =
      '<table border="0" width="530"><tbody><tr><td width="160">' +
      '<img src="https://profaj.com/sign/logo.jpg" width="135" height="36" alt="" />' +
      '</td><td><span style="color: #302e2d;">e:&nbsp;</span>' +
      '<a href="mailto:yusuf@profaj.com" target="_blank">yusuf@profaj.com</a>' +
      '</td></tr></tbody></table>';
    const r = imzaTemizle(giris);
    expect(r.html).toContain('<table');
    expect(r.html).toContain('width="530"');
    expect(r.html).toContain('style="color: #302e2d;"');
    expect(r.html).toContain('mailto:yusuf@profaj.com');
    expect(r.html).toContain('https://profaj.com/sign/logo.jpg');
  });

  it('KRİTİK: Gmail proxy adresi GERÇEK kaynağına çevriliyor', () => {
    /*
     * Gmail imza HTML'ini kopyaladığında görselleri kendi önbelleğine
     * yönlendiriyor. O adres Gmail dışında güvenilir çalışmıyor: bizim
     * gönderdiğimiz mailde görsel KIRIK çıkar ve bu ancak alıcının
     * ekranında görülür.
     */
    const giris =
      '<img src="https://ci3.googleusercontent.com/meips/ADKq_NZg=s0-d-e1-ft#https://profaj.com/sign/profaj-logo.jpg" />';
    const r = imzaTemizle(giris);
    expect(r.html).toContain('src="https://profaj.com/sign/profaj-logo.jpg"');
    expect(r.html).not.toContain('googleusercontent');
    expect(r.rapor.rewrittenImages).toBe(1);
  });

  it('proxy OLMAYAN adres olduğu gibi kalıyor', () => {
    const r = imzaTemizle('<img src="https://profaj.com/a.png" />');
    expect(r.html).toContain('https://profaj.com/a.png');
    expect(r.rapor.rewrittenImages).toBe(0);
  });

  it('target="_blank" bağlantıya rel EKLENİYOR', () => {
    // `noopener` olmadan hedef sayfa `window.opener` üzerinden panele
    // erişebiliyor.
    const r = imzaTemizle('<a href="https://profaj.com" target="_blank">x</a>');
    expect(r.html).toContain('rel="noopener noreferrer"');
  });

  it('ATILANLAR RAPORLANIYOR — kullanıcı ne gittiğini görmeli', () => {
    // Sessizce temizlemek, imzasının bir kısmının neden kaybolduğunu
    // anlamayan bir kullanıcı bırakırdı.
    const etiket = imzaTemizle('<marquee>a</marquee>');
    expect(etiket.rapor.removedTags).toContain('marquee');

    // Öznitelik raporu İZİNLİ etiketler üzerinden: atılan bir etiketin
    // özniteliklerini ayrıca listelemek gürültü olurdu, etiketin tamamı
    // zaten gitti.
    const oznitelik = imzaTemizle('<p onclick="x" data-aii="y">a</p>');
    expect(oznitelik.rapor.removedAttributes).toEqual(
      expect.arrayContaining(['onclick', 'data-aii']),
    );
    expect(oznitelik.html).toBe('<p>a</p>');
  });

  it('KRİTİK: EKRANDA ÇALIŞAN ama MAİLDE ÖLÜ şemalar atılıyor', () => {
    /*
     * `blob:`, `file:` ve `cid:` çalıştırma yüzeyi DEĞİL — başka bir sorun:
     * hepsi tarayıcıda çözülüyor, mailde çözülmüyor. Mail gövdesi artık
     * panelde render edildiği ve kullanıcı oraya görsel yapıştırabildiği için
     * bu, ÖNİZLEMENİN YALAN SÖYLEMESİ demek: panelde görsel görünür,
     * müşteriye kırık gider ve farkı yalnızca alıcı görür.
     */
    for (const sema of ['blob:https://x/abc', 'file:///Users/a/b.png', 'cid:image001.png']) {
      const r = imzaTemizle(`<img src="${sema}" />`);
      expect(r.html, `${sema} geçti`).not.toContain(sema);
    }
  });

  it('normal adresler ETKİLENMİYOR', () => {
    // Kara listeyi genişletirken çalışan yolu kesmek en kolay hata.
    const r = imzaTemizle('<img src="https://profaj.com/a.png" /><a href="https://a.com">x</a>');
    expect(r.html).toContain('https://profaj.com/a.png');
    expect(r.html).toContain('https://a.com');
  });
});
