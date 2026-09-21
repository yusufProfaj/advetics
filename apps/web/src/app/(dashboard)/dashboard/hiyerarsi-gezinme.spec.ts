import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ GENEL BAKIŞ HİYERARŞİSİ ═══
 *
 * Kullanıcının isteği birebir: Google Ads'teki kampanya hiyerarşisi —
 * şirket › workspace › kampanya › reklam seti › reklam — ve her basamak
 * tıklanabilir.
 *
 * İnmek zaten mümkündü (şirket tablosu → workspace tablosu → kampanya
 * listesi) ama kampanyanın ALTINA inmek de, geri ÇIKMAK da mümkün değildi:
 * seviye sekmeleri düz bir anahtardı ("Reklam seti" bütün workspace'in
 * setlerini listeliyordu) ve nerede olunduğu hiçbir yerde yazmıyordu.
 *
 * Bileşen render edilmiyor (`vitest.config.ts` bunu bilinçli reddediyor),
 * o yüzden kararlar kaynak taramasıyla sınanıyor.
 */
const WEB_SRC = join(__dirname, '..', '..', '..');

function kod(yol: string): string {
  return readFileSync(join(WEB_SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const SAYFA = kod('app/(dashboard)/dashboard/page.tsx');
const TABLO = kod('components/breakdown-table.tsx');
const SERIT = kod('components/hiyerarsi-yolu.tsx');

describe('tarama boşa düşmüyor', () => {
  it('üç kaynak da okundu', () => {
    expect(SAYFA).toContain('DashboardPage');
    expect(TABLO).toContain('BreakdownTable');
    expect(SERIT).toContain('HiyerarsiYolu');
  });
});

describe('ODAK ÜÇ SORGUYA DA GİDİYOR', () => {
  it('KRİTİK: kampanya ve reklam seti sorgu dizesine yazılıyor', () => {
    /*
     * Yalnızca tabloya uygulamak, üstteki kartların workspace toplamını
     * gösterirken tablonun tek bir kampanyanın satırlarını listelemesi
     * demek olurdu — aynı ekranda iki farklı gerçek. `platform`ta aynı
     * karar aynı gerekçeyle verilmişti.
     */
    expect(SAYFA).toContain("base.set('campaignId', kampanya)");
    expect(SAYFA).toContain("base.set('adGroupId', reklamSeti)");
  });

  it('KRİTİK: odak TAŞINAN süzgeçlerde — tarih değiştiren kullanıcı düşmüyor', () => {
    // `platform` bir zamanlar tam olarak böyle düşüyordu: seviye değiştiren
    // kullanıcı sessizce bütün platformlara dönüyordu.
    const blok = SAYFA.slice(SAYFA.indexOf('const tasinan = {'), SAYFA.indexOf('const base ='));
    expect(blok).toContain('kampanya,');
    expect(blok).toContain('reklamSeti,');
  });

  it('KRİTİK: odaklıyken seviye bir ALT basamağa çekiliyor', () => {
    /*
     * Bir kampanyanın içindeyken "kampanya" seviyesi anlamsız: kartlar tek
     * kampanyayı gösterirken tablo bütün kampanyaları listelerdi. Arayüzde
     * bu hâle düşmenin yolu yok ama adres elle yazılabiliyor.
     */
    expect(SAYFA).toContain("reklamSeti\n    ? 'ad'");
    expect(SAYFA).toContain("? 'ad_group'");
  });
});

describe('SEKMELER ODAĞI YÖNETİYOR', () => {
  it('KRİTİK: her sekme hangi odağı düşüreceğini KENDİSİ taşıyor', () => {
    expect(TABLO).toContain("{ key: 'campaign', label: 'Kampanya', dusen: { kampanya: undefined, reklamSeti: undefined } }");
    expect(TABLO).toContain("{ key: 'ad_group', label: 'Reklam seti', dusen: { reklamSeti: undefined } }");
  });

  it('KRİTİK: sekme bağlantısı düşen odağı UYGULUYOR', () => {
    // Tabloda durup bağlantıya yazılmazsa hiçbir işe yaramaz.
    expect(TABLO).toContain("{ seviye: tab.key, ...tab.dusen }");
  });
});

describe('SATIRDAN BİR ALT BASAMAĞA', () => {
  it('KRİTİK: alt basamak `Record` ile seçiliyor', () => {
    // Koşul zinciri, yeni bir seviye eklendiğinde sessizce yanlış yere
    // giderdi; `Record` derlemeyi kırıyor.
    expect(TABLO).toContain('const ALT_BASAMAK: Record<MetricLevel,');
    expect(TABLO).toContain("campaign: (id) => ({ seviye: 'ad_group', kampanya: id })");
    expect(TABLO).toContain("ad_group: (id) => ({ seviye: 'ad', reklamSeti: id })");
  });

  it('KRİTİK: REKLAM SEVİYESİNDE bağlantı YOK', () => {
    /*
     * Reklam en derin basamak. Tıklanabilir görünüp hiçbir şey yapmayan bir
     * bağlantı, bozuk bir ekrandan ayırt edilemez.
     */
    expect(TABLO).toContain('ad: null,');
    expect(TABLO).toContain('{altBasamak ? (');
  });
});

describe('EKMEK KIRINTISI', () => {
  it('KRİTİK: sayfa şeridi çiziyor', () => {
    expect(SAYFA).toContain('<HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} />');
  });

  it('KRİTİK: workspace basamağı ODAĞI TEMİZLİYOR', () => {
    // Kampanyanın içinden workspace'e dönmenin yolu bu; odak kalsaydı
    // "yukarı çık" hiçbir şey yapmazdı.
    expect(SAYFA).toContain("sorgu: { kampanya: undefined, reklamSeti: undefined, seviye: 'campaign' }");
  });

  it('KRİTİK: kampanya basamağı REKLAM SETİNİ düşürüyor', () => {
    expect(SAYFA).toContain("sorgu: { kampanya: yol.campaign.id, reklamSeti: undefined, seviye: 'ad_group' }");
  });

  it('KRİTİK: SON BASAMAK bağlantı DEĞİL', () => {
    // Bulunduğun yere tıklamak hiçbir şey yapmaz; tıklanabilir görünmesi
    // kullanıcıya bir şey olacağını söyler.
    expect(SERIT).toContain('const sonuncu = i === basamaklar.length - 1;');
    expect(SERIT).toContain("aria-current=\"page\"");
  });

  it('KRİTİK: kapsam değişiminde ADRES TEMİZLENİYOR', () => {
    /*
     * Sayfalar aktif kapsamı `params.* ?? session.*` sırasıyla çözüyor, yani
     * URL parametresi cookie'yi EZİYOR: `?kampanya=` kalırsa üst bar yeni
     * kapsamı yazarken gövde eskisini gösterir.
     */
    expect(SERIT).toContain("router.replace('/dashboard')");
  });

  it('KRİTİK: kapsam hatası YUTULMUYOR', () => {
    expect(SERIT).toContain('ApiRequestError');
    expect(SERIT).toContain('Kapsam değiştirilemedi.');
  });

  it('ad YAPIDAN okunuyor — kırılım satırından değil', () => {
    /*
     * Kırılım listesi boş dönebiliyor (o aralıkta veri yok) ve o hâlde
     * şerit adsız kalırdı: kullanıcı hangi kampanyanın içinde olduğunu her
     * zaman görmeli.
     */
    expect(SAYFA).toContain('/metrics/kirilim-yolu?');
  });
});
