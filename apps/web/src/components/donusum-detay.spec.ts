import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ DÖNÜŞÜM DETAYI — PANEL, RAPOR VE PDF ═══
 *
 * Kullanıcının isteği: "google adsteki dönüşümleri ne dönüşümler olduğunu
 * bilmiyorum... 'whatsapp tıklaması' 'site içi telefon araması' gibi gibi
 * dönüşümleri raporda düzgün bir şekilde görebilmem lazım... eğer genel
 * bakışa da aktarabiliyorsak oradan da detaylarını görebileyim kampanya
 * reklam seti reklam bazında olsun".
 *
 * ÜÇ YÜZEY AYNI ŞEYİ SÖYLEMEK ZORUNDA. Bu depoda ekran ile müşteriye giden
 * belge bir kez ayrıştı ve farkı yalnızca ALICI gördü.
 */
const WEB_SRC = join(__dirname, '..');
const API_SRC = join(WEB_SRC, '..', '..', 'api', 'src');

function kod(yol: string): string {
  return readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const PANEL = kod(join(WEB_SRC, 'components', 'donusum-detay.tsx'));
const SAYFA = kod(join(WEB_SRC, 'app', '(dashboard)', 'dashboard', 'page.tsx'));
const RAPOR = kod(join(WEB_SRC, 'components', 'report', 'report-document.tsx'));
const PDF = kod(join(API_SRC, 'modules', 'reports', 'rapor-pdf.service.ts'));

describe('tarama boşa düşmüyor', () => {
  it('dört kaynak da okundu', () => {
    expect(PANEL).toContain('DonusumDetay');
    expect(SAYFA).toContain('DashboardPage');
    expect(RAPOR).toContain('DonusumDetayi');
    expect(PDF).toContain('donusumDetayi');
  });
});

describe('genel bakışta', () => {
  it('KRİTİK: panel ODAĞA uyuyor — kampanya/reklam seti bazında', () => {
    /*
     * Uç, diğer metrik uçlarıyla AYNI sorgu dizesini (`base`) kullanıyor ve
     * orada `campaignId`/`adGroupId` zaten var. Ayrı bir sorgu kurmak,
     * kartlar kampanyayı gösterirken dönüşüm listesinin workspace genelini
     * göstermesi demekti.
     */
    expect(SAYFA).toContain('`/metrics/donusum-detay?${base}`');
  });

  it('KRİTİK: üst katmanlarda ÇEKİLMİYOR', () => {
    // Ajans/şirket kapsamında ekran workspace listeliyor; dönüşüm eylemleri
    // o katmanda anlamsız ve sorgu ham JSONB gövdelerini tarıyor.
    // İDDİA UÇLA BİRLİKTE OKUNUYOR: koşul tek başına başka bir sorgunun da
    // koşulu olabilir; aranan şey DÖNÜŞÜM ucunun o dalın altında olması.
    const i = SAYFA.indexOf('/metrics/donusum-detay');
    expect(i).toBeGreaterThan(-1);
    const oncesi = SAYFA.slice(Math.max(0, i - 200), i);
    expect(oncesi).toContain('mcc || ajansGorunumu');
    expect(oncesi).toContain('Promise.resolve(null)');
  });

  it('KRİTİK: BOŞ LİSTENİN SEBEBİ ORTAK ÜRETİCİDEN', () => {
    /*
     * Üç hâl var ve üçünün yapılacak işi farklı: platform detayı vermedi /
     * dönüşüm var ama detay kayıtlı değil / gerçekten dönüşüm yok.
     *
     * Cümleyi burada ELLE yazmak, üretimde görülen hatanın kapısıydı:
     * kutu "kayıtlı dönüşüm yok" derken kampanya tablosu 49 dönüşüm
     * gösteriyordu.
     */
    expect(PANEL).toContain('Dönüşüm detayı alınamadı:');
    expect(PANEL).toContain('donusumBosSebebi({');
    expect(PANEL).toContain('toplamDonusum: detay.toplamDonusum');
  });

  it('KRİTİK: SAYAÇ adlandırılmış ile TOPLAMI birlikte yazıyor', () => {
    // Yalnızca adlandırılmışı yazmak, kampanya tablosuyla çelişen bir "0"
    // gösteriyordu.
    expect(PANEL).toContain('adlandırılmış');
    expect(PANEL).toContain('formatNumber(detay.toplamDonusum)');
  });

  it('KRİTİK: META SATIRLARININ neden gruplanmış olduğu yazılı', () => {
    /*
     * Kullanıcı Google'da kendi adlarını görüp Meta'da "Form/Mesaj" görünce
     * "benim adlarım nerede" diye arar; cevap ekranın kendisinde olmalı.
     */
    expect(PANEL).toContain('Meta satırları gruplanmış olarak gelir');
  });
});

describe('rapor ile PDF AYNI kararları veriyor', () => {
  it('KRİTİK: para sütunu ikisinde de AYNI koşulla', () => {
    /*
     * Lead ve mesaj dönüşümlerinin parasal karşılığı yok; koşul ayrışırsa
     * ekranda olmayan bir sütun belgede görünür (ya da tersi) ve farkı
     * yalnızca alıcı görür.
     */
    expect(RAPOR).toContain("rows.some((r) => r.valueMicros !== '0')");
    expect(PDF).toContain("rows.some((r) => r.valueMicros !== '0')");
  });

  it('KRİTİK: açıklama cümlesi ikisinde de var', () => {
    // Google adları müşterinin kendi adları, Meta satırları gruplanmış.
    expect(RAPOR).toContain('Meta satırları gruplanmış gelir');
    expect(PDF).toContain('Meta satırları gruplanmış gelir');
  });

  it('KRİTİK: boş liste sebebi ÜÇ YÜZEYDE de ORTAK ÜRETİCİDEN', () => {
    /*
     * Cümle üç yerde ayrı yazılsaydı, birinde güncellenmeyen bir metin
     * kalırdı — ve bu depoda ekran ile müşteriye giden belge bir kez
     * ayrıştı, farkı yalnızca alıcı gördü.
     */
    for (const kaynak of [PANEL, RAPOR, PDF]) {
      expect(kaynak).toContain('donusumBosSebebi(');
    }
    // Elle yazılmış kopyalar GERİ GELMESİN.
    for (const kaynak of [RAPOR, PDF]) {
      expect(kaynak).not.toContain("'Bu dönemde kayıtlı dönüşüm yok.'");
    }
  });
});
