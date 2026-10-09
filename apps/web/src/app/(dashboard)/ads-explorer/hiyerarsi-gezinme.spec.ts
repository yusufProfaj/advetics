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

const SAYFA = kod('app/(dashboard)/ads-explorer/page.tsx');
/*
 * 2026-10-09: eski kırılım tablosu (`breakdown-table.tsx`) ve hesap tablosu
 * (`hesap-kirilimi.tsx`) kalktı. Sekme ve satır hedefleri artık SAYFADA
 * (`duzeySekmeleri`, `hesapSatiri`, `varlikSatiri`), tablo yalnızca çiziyor.
 */
const TABLO = kod('components/taslak/reklam-yoneticisi-tablosu.tsx');

/** `function ad(` ile bir sonraki üst düzey `function` arası; bulunamazsa FIRLATIR. */
function fonksiyon(ad: string): string {
  const i = SAYFA.indexOf(`function ${ad}(`);
  if (i < 0) throw new Error(`fonksiyon bulunamadı: ${ad}`);
  const j = SAYFA.indexOf('\nfunction ', i + 1);
  return SAYFA.slice(i, j < 0 ? undefined : j);
}
const SERIT = kod('components/hiyerarsi-yolu.tsx');

describe('tarama boşa düşmüyor', () => {
  it('üç kaynak da okundu', () => {
    expect(SAYFA).toContain('DashboardPage');
    expect(TABLO).toContain('ReklamYoneticisiTablosu');
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

  it('KRİTİK: seviye TEK karardan — odak kuralı `panelSeviyesiCoz`da', () => {
    /*
     * Bir kampanyanın içindeyken "kampanya" seviyesi anlamsız. Kural saf
     * fonksiyona taşındı ve orada ÇALIŞTIRILARAK sınanıyor
     * (`lib/genel-bakis-seviyesi.spec.ts`); burada sayfanın onu kullandığı
     * ve kendi koşul zincirini yeniden yazmadığı kilitleniyor.
     */
    expect(SAYFA).toContain('const level = panelSeviyesiCoz({');
    expect(SAYFA).not.toContain("reklamSeti\n    ? 'ad'");
  });

  it('KRİTİK: hesap süzgeci sorgulara ve taşınan süzgeçlere giriyor', () => {
    expect(SAYFA).toContain("if (hesap) base.set('adAccountId', hesap);");
    const blok = SAYFA.slice(SAYFA.indexOf('const tasinan = {'), SAYFA.indexOf('const base ='));
    expect(blok).toContain('hesap,');
  });
});

describe('SEKMELER ODAĞI YÖNETİYOR', () => {
  const SEKME = () => fonksiyon('duzeySekmeleri');

  it('KRİTİK: her alt düzey hangi odağı düşüreceğini KENDİSİ taşıyor', () => {
    const s = SEKME();
    expect(s).toContain('hesap: { hesap: undefined, kampanya: undefined, reklamSeti: undefined },');
    expect(s).toContain('campaign: { kampanya: undefined, reklamSeti: undefined },');
    expect(s).toContain('ad_group: { reklamSeti: undefined },');
  });

  it('KRİTİK: sekme bağlantısı düşen odağı UYGULUYOR', () => {
    // Listede durup bağlantıya yazılmazsa hiçbir işe yaramaz.
    expect(SEKME()).toContain('baglanti(REKLAM_YONETICISI, v.tasinan, { seviye: d, ...dusen[d] })');
  });

  it('ayrı mecra basamağı YOK (kullanıcı kararı)', () => {
    expect(SEKME()).toContain("const sira: YmDuzey[] = ['sirket', 'workspace', 'hesap', 'campaign', 'ad_group', 'ad'];");
  });
});

describe('SATIRDAN BİR ALT BASAMAĞA', () => {
  it('KRİTİK: kampanya → reklam seti, reklam seti → reklam', () => {
    const v = fonksiyon('varlikSatiri');
    expect(v).toContain("baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad_group', kampanya: b.entityId })");
    expect(v).toContain("baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad', reklamSeti: b.entityId })");
  });

  it('KRİTİK: REKLAM SEVİYESİNDE bağlantı YOK — satır önizleme açıyor', () => {
    /*
     * Reklam en derin basamak. Tıklanabilir görünüp hiçbir şey yapmayan bir
     * bağlantı, bozuk bir ekrandan ayırt edilemez.
     */
    const v = fonksiyon('varlikSatiri');
    expect(v).toContain(": null;");
    expect(v).toContain("eylem: href ? { tur: 'link', href } : { tur: 'onizle' },");
  });
});

describe('EKMEK KIRINTISI', () => {
  it('KRİTİK: sayfa şeridi çiziyor', () => {
    expect(SAYFA).toContain('<HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} gorunum="hap" />');
  });

  it('KRİTİK: workspace basamağı ODAĞI, HESABI ve MECRAYI TEMİZLİYOR', () => {
    // Kampanyanın ya da hesabın içinden workspace'in reklam hesaplarına
    // dönmenin yolu bu; süzgeç kalsaydı "yukarı çık" hiçbir şey yapmazdı.
    const i = SAYFA.indexOf('ad: activeClient.name,');
    const dilim = SAYFA.slice(i, SAYFA.indexOf('},\n    });', i));
    expect(dilim.length, 'workspace basamağı bulunamadı').toBeGreaterThan(50);
    for (const k of ['platform: undefined', 'hesap: undefined', 'kampanya: undefined', 'reklamSeti: undefined', "seviye: 'hesap'"]) {
      expect(dilim).toContain(k);
    }
  });

  it('KRİTİK: hesap basamağı kampanya odağını düşürüp hesabın kampanyalarına dönüyor', () => {
    const i = SAYFA.indexOf('ad: `${PLATFORM_KISA_ADLARI[yol.adAccount.platform]} · ${yol.adAccount.name}`,');
    const dilim = SAYFA.slice(i, SAYFA.indexOf('},\n      });', i));
    expect(dilim.length, 'hesap basamağı bulunamadı').toBeGreaterThan(50);
    expect(dilim).toContain('hesap: yol.adAccount.id');
    expect(dilim).toContain('kampanya: undefined');
    expect(dilim).toContain("seviye: 'campaign'");
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
    // Kullanıcı bulunduğu sayfada kalıyor; sorgu yine temizleniyor.
    expect(SERIT).toContain("const yol = usePathname() ?? '/dashboard';");
    expect(SERIT).toContain('router.replace(yol);');
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

describe('HESAP SATIRI', () => {
  it('KRİTİK: hesap satırı hesabın KAMPANYALARINA iniyor', () => {
    const h = fonksiyon('hesapSatiri');
    const i = h.indexOf('hesap: a.adAccountId,');
    expect(i, 'hesap satırının hedefi bulunamadı').toBeGreaterThan(0);
    const dilim = h.slice(h.lastIndexOf('baglanti(', i), h.indexOf('})', i));
    expect(dilim).toContain('platform: a.platform');
    expect(dilim).toContain("seviye: 'campaign'");
    expect(dilim).toContain('kampanya: undefined');
  });

  it('KRİTİK: satırda workspace adı ve mecra var', () => {
    // Onaylanan taslakta ana etiket hesap adı; workspace adı alt satırda.
    const h = fonksiyon('hesapSatiri');
    expect(h).toContain('`${a.clientName} · ${a.externalId}`');
    expect(h).toContain('mecralar: [a.platform],');
  });

  it('sayfa hesap basamağında hesap kırılımını çekiyor', () => {
    expect(SAYFA).toMatch(/varlik === null\s*\n?\s*\? serverApiFetch<MetricsAccountBreakdown>\(`\/metrics\/hesaplar\?\$\{hesapQs\}`\)/);
  });
});
