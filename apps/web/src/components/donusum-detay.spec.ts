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

  it('KRİTİK: BOŞ LİSTENİN SEBEBİ yazılı', () => {
    /*
     * "Bu dönemde dönüşüm yok" ile "platform detayı vermedi" farklı işler;
     * ikisini aynı boş kutuya çevirmek bu depoda adı konmuş yasak.
     */
    expect(PANEL).toContain('Dönüşüm detayı alınamadı:');
    expect(PANEL).toContain('Bu aralıkta kayıtlı dönüşüm yok.');
    expect(PANEL).toContain('Detay gelmediği için liste boş.');
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

  it('KRİTİK: boş liste sebebi ikisinde de AYRIŞTIRILMIŞ', () => {
    for (const kaynak of [RAPOR, PDF]) {
      expect(kaynak).toContain('Detay gelmediği için liste boş.');
      expect(kaynak).toContain('kayıtlı dönüşüm yok');
    }
  });
});
