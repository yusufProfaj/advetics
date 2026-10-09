import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ DÖNÜŞÜM DETAYI — PANEL, RAPOR VE PDF ═══
 *
 * Kullanıcının isteği: "google adsteki dönüşümleri ne dönüşümler olduğunu
 * bilmiyorum... 'whatsapp tıklaması' 'site içi telefon araması' gibi gibi
 * dönüşümleri raporda düzgün bir şekilde görebilmem lazım".
 *
 * ÜÇ YÜZEY AYNI ŞEYİ SÖYLEMEK ZORUNDA. Bu depoda ekran ile müşteriye giden
 * belge bir kez ayrıştı ve farkı yalnızca ALICI gördü.
 *
 * 2026-10-09: panel kutusu `donusum-detay.tsx`ten Genel Bakış'ın
 * `DonusumKarti`na (onaylanan taslak) geçti; kurallar buraya taşındı.
 */
const WEB_SRC = join(__dirname, '..', '..');
const API_SRC = join(WEB_SRC, '..', '..', 'api', 'src');

function kod(yol: string): string {
  return readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const KARTLAR = kod(join(__dirname, 'genel-bakis-kartlari.tsx'));
const PANEL = KARTLAR.slice(KARTLAR.indexOf('export function DonusumKarti'), KARTLAR.indexOf('export function KapsamOzeti'));
const SAYFA = kod(join(WEB_SRC, 'app', '(dashboard)', 'dashboard', 'page.tsx'));
const RAPOR = kod(join(WEB_SRC, 'components', 'report', 'report-document.tsx'));
const PDF = kod(join(API_SRC, 'modules', 'reports', 'rapor-pdf.service.ts'));

describe('tarama boşa düşmüyor', () => {
  it('dört kaynak da okundu', () => {
    expect(PANEL.length).toBeGreaterThan(500);
    expect(SAYFA).toContain('<DonusumKarti');
    expect(RAPOR).toContain('DonusumDetayi');
    expect(PDF).toContain('donusumDetayi');
  });
});

describe('genel bakışta', () => {
  it('KRİTİK: panel ODAĞA uyuyor — diğer metriklerle aynı sorgu', () => {
    // Ayrı bir sorgu kurmak, kartlar bir kapsamı gösterirken dönüşüm
    // listesinin başka bir kapsamı göstermesi demekti.
    expect(SAYFA).toContain('`/metrics/donusum-detay?${base}`');
  });

  it('KRİTİK: üst katmanlarda ÇEKİLMİYOR', () => {
    // Ajans/şirket kapsamında dönüşüm eylemleri anlamsız ve sorgu ham JSONB
    // gövdelerini tarıyor. İddia UÇLA BİRLİKTE: bayrağın hemen ardından bu çağrı.
    expect(SAYFA).toContain('const workspaceGorunumu = !ajansGorunumu && !mcc;');
    expect(SAYFA).toMatch(
      /workspaceGorunumu\s*\n\s*\? serverApiFetch<MetricsConversionDetail>\(`\/metrics\/donusum-detay\?\$\{base\}`\)/,
    );
  });

  it('KRİTİK: BOŞ LİSTENİN SEBEBİ ORTAK ÜRETİCİDEN', () => {
    /*
     * Üç hâl var ve üçünün yapılacak işi farklı: platform detayı vermedi /
     * dönüşüm var ama detay kayıtlı değil / gerçekten dönüşüm yok. Cümleyi
     * elle yazmak üretimde görülen hatanın kapısıydı: kutu "kayıtlı dönüşüm
     * yok" derken kampanya tablosu 49 dönüşüm gösteriyordu.
     */
    expect(PANEL).toContain('Dönüşüm detayı alınamadı:');
    expect(PANEL).toContain('donusumBosSebebi({');
    expect(PANEL).toContain('toplamDonusum: detay.toplamDonusum');
  });

  it('KRİTİK: SAYAÇ adlandırılmış ile TOPLAMI ayrıştığında ikisini de yazıyor', () => {
    // Yalnızca birini yazmak, kampanya tablosuyla çelişen bir sayı demekti.
    expect(PANEL).toContain('toplam === detay.toplamDonusum');
    expect(PANEL).toContain('`Adlandırılmış ${formatNumber(toplam)} / toplam ${formatNumber(detay.toplamDonusum)} dönüşüm`');
  });

  it('KRİTİK: META SATIRLARININ neden gruplanmış olduğu yazılı', () => {
    // Kullanıcı Google'da kendi adlarını görüp Meta'da "Form/Mesaj" görünce
    // "benim adlarım nerede" diye arar; cevap ekranın kendisinde olmalı.
    expect(PANEL).toContain("detay.satirlar.some((r) => r.platform === 'meta') && (");
    expect(PANEL).toContain('Meta satırları gruplanmış olarak gelir');
  });
});

describe('rapor ile PDF AYNI kararları veriyor', () => {
  it('KRİTİK: para sütunu ikisinde de AYNI koşulla', () => {
    // Lead ve mesaj dönüşümlerinin parasal karşılığı yok; koşul ayrışırsa
    // ekranda olmayan bir sütun belgede görünür ve farkı yalnızca alıcı görür.
    expect(RAPOR).toContain("rows.some((r) => r.valueMicros !== '0')");
    expect(PDF).toContain("rows.some((r) => r.valueMicros !== '0')");
  });

  it('KRİTİK: açıklama cümlesi ikisinde de var', () => {
    expect(RAPOR).toContain('Meta satırları gruplanmış gelir');
    expect(PDF).toContain('Meta satırları gruplanmış gelir');
  });

  it('KRİTİK: boş liste sebebi ÜÇ YÜZEYDE de ORTAK ÜRETİCİDEN', () => {
    for (const kaynak of [PANEL, RAPOR, PDF]) {
      expect(kaynak).toContain('donusumBosSebebi(');
    }
    // Elle yazılmış kopyalar GERİ GELMESİN.
    for (const kaynak of [RAPOR, PDF]) {
      expect(kaynak).not.toContain("'Bu dönemde kayıtlı dönüşüm yok.'");
    }
  });
});
