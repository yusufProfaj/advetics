import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ PAYLAŞ MENÜSÜ — TEK GİRİŞ, İKİ YOL ═══
 *
 * Müşteriye ulaştırmanın iki yolu ekranın İKİ AYRI yerindeydi: üstte
 * "Müşteriye gönder" düğmesi, altta paylaşım panelinde "Bağlantı oluştur".
 * Aynı iş için iki giriş noktası, her seferinde "hangisi neydi" sorusunu
 * sorduruyordu.
 *
 * Bileşenler sunucuda render edilmiyor ve DOM sınayacak bir kurulum yok; bu
 * yüzden iddialar kaynağa çapalı — ama her biri tek bir karara ve o kararın
 * koddaki tek satırına.
 */
const MENU = readFileSync(join(__dirname, 'share-controls.tsx'), 'utf8');
const GONDER = readFileSync(join(__dirname, 'rapor-gonder.tsx'), 'utf8');

/**
 * Yorum satırlarını atar.
 *
 * İki dosya da KALDIRILAN düğmeden tarihçe olarak bahsediyor ve `toContain`
 * yorumla kodu ayırt etmiyor: "düğme kalktı" iddiam, kalkışı ANLATAN yorumun
 * kendisine takılıp düşüyordu.
 */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('paylaş menüsü', () => {
  it('KRİTİK: "Müşteriye gönder" düğmesi KALKTI', () => {
    // İki giriş noktasından biri buydu; menüye taşındı.
    expect(kod(GONDER)).not.toContain('Müşteriye gönder');
    expect(kod(MENU)).not.toContain('Müşteriye gönder');
  });

  it('KRİTİK: tek "Paylaş" düğmesi ve İKİ seçenek var', () => {
    expect(MENU).toContain(">\n            {busy ? 'Oluşturuluyor…' : 'Paylaş'}\n          </button>");
    expect(MENU).toContain('Bağlantıyı kopyala');
    expect(MENU).toContain('Mail yoluyla ilet');
  });

  it('KRİTİK: "Bağlantıyı kopyala" GERÇEKTEN panoya yazıyor', () => {
    /*
     * Seçenek "kopyala" diyor; kullanıcıyı ikinci bir düğmeye göndermek
     * verdiği sözü tutmamak olurdu. Üretim ve kopyalama aynı eylemde.
     */
    const i = MENU.indexOf('async function createLink');
    expect(i, 'link üretici bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const govde = MENU.slice(i, MENU.indexOf('\n  }', i));
    expect(govde).toContain('navigator.clipboard.writeText(adres)');
  });

  it('KRİTİK: kopyalama düşerse bağlantı EKRANDA kalıyor', () => {
    /*
     * Panoya yazma izin ya da güvensiz bağlam yüzünden düşebiliyor. Sessizce
     * yutulursa kullanıcı "kopyaladım" sanıp boş yapıştırıyor; bağlantı
     * kutusu açık kaldığı için elle kopyalanabiliyor.
     */
    const i = MENU.indexOf('await navigator.clipboard.writeText(adres);');
    expect(i).toBeGreaterThan(-1);
    // `setLink` kopyalamadan ÖNCE çağrılıyor: kopyalama patlasa da kutu açılıyor.
    expect(MENU.indexOf('setLink(adres);')).toBeLessThan(i);
  });

  it('KRİTİK: menü dışarı tıklama ve ESC ile kapanıyor', () => {
    // Yalnızca düğmeyle kapanan bir menü, başka yere tıklandığında ekranda
    // asılı kalıp altındaki içeriği örtüyor.
    expect(MENU).toContain("document.addEventListener('mousedown', disari)");
    expect(MENU).toContain("if (e.key === 'Escape') setMenuAcik(false)");
  });

  it('KRİTİK: mail modalı KONTROLLÜ — kendi düğmesi yok', () => {
    // Modal kendi düğmesini taşısaydı ikinci giriş noktası geri gelirdi.
    expect(GONDER).toContain('export function MailGonderModal({');
    expect(GONDER).toContain('acik: boolean;');
    expect(MENU).toContain('<MailGonderModal');
  });

  it('SÜRE seçeneği menünün İÇİNDE — panelin sağında değil', () => {
    // Panelde ayrı dururken, bağlantı üretmeyecek kullanıcıya da soruluyordu.
    const i = MENU.indexOf('role="menu"');
    expect(i, 'menü bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(MENU.indexOf('Bağlantı süresi')).toBeGreaterThan(i);
  });

  it('KRİTİK: PDF indir PAYLAŞ ile YAN YANA ama menünün İÇİNDE DEĞİL', () => {
    /*
     * Yan yana, çünkü raporla ilgili bir şey yapmak için kullanıcı tek yere
     * baksın. Menünün içinde değil, çünkü indirmek belgeyi KENDİNE almak;
     * "Bağlantıyı kopyala" ve "Mail yoluyla ilet" ise müşteriye ULAŞTIRMAK.
     * İkisini aynı başlık altında toplamak farklı iki işi karıştırırdı.
     */
    expect(GONDER).toContain('PDF indir');
    // ÇAPA SADECE ELEMAN ADI: bileşene prop eklenince (şablon seçimi) satır
    // çok satıra bölündü ve "prop'larıyla birlikte" arayan iddia düştü.
    // Kilitlenen şey elemanın YERİ, prop'larının yazımı değil.
    expect(MENU).toContain('<RaporGonder');

    const menuBasi = MENU.indexOf('role="menu"');
    expect(menuBasi, 'menü bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    // İndir düğmesi menü bloğundan ÖNCE: kardeş, çocuk değil.
    expect(MENU.indexOf('<RaporGonder')).toBeLessThan(menuBasi);
  });

  it('KRİTİK: sayfa PDF düğmesini AYRICA render etmiyor', () => {
    /*
     * Panelin içine taşındı; sayfada da kalsaydı ekranda İKİ indirme düğmesi
     * olurdu — kaldırılan "iki giriş noktası" sorununun aynısı, bu kez
     * indirme tarafında.
     */
    const sayfa = readFileSync(
      join(__dirname, '..', '..', 'app', '(dashboard)', 'raporlar', 'page.tsx'),
      'utf8',
    );
    expect(kod(sayfa)).not.toContain('<RaporGonder');
  });
});
