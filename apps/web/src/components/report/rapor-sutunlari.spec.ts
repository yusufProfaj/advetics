import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLUMN_KEYS, COLUMN_TOTALS } from '@advetics/shared';

/**
 * RAPOR TABLOSU SÜTUNLARI — TEK KAYIT DEFTERİ.
 *
 * Başlık satırı, gövde hücreleri, TOPLAM satırı ve dipnotlar bir süre ayrı
 * ayrı elle eşleniyordu ve tek bir bayrakla (`showBuckets`) iki sabit sete
 * dallanıyordu. Üç yerde elle eşlenen bir liste, birinin güncellenmemesi
 * hâlinde tablo başlığı ile toplam satırının SESSİZCE ayrışması demek —
 * TypeScript bunu söylemiyor, çünkü hepsi ayrı JSX blokları.
 */
const KAYNAK = readFileSync(join(__dirname, 'report-document.tsx'), 'utf8');

function kampanyaGovdesi(): string {
  const bas = KAYNAK.indexOf('function CampaignPage(');
  if (bas === -1) {
    throw new Error('CampaignPage bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KAYNAK.slice(bas, KAYNAK.indexOf('\nfunction Keywords('));
  if (!g.includes('<tfoot>')) {
    throw new Error('CampaignPage dilimi tablo basmıyor — tarama boşa düştü.');
  }
  return g;
}

describe('kampanya tablosu sütunları', () => {
  it('KRİTİK: başlık, gövde ve TOPLAM aynı listeden türetiliyor', () => {
    const g = kampanyaGovdesi();
    // Üçü de `sutunlar` üzerinde dönüyor; ayrı ayrı yazılsalardı biri
    // güncellenmediğinde tablo kayardı.
    expect(g.match(/sutunlar\.map\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('KRİTİK: `showBuckets` bayrağı KALMADI — iki sabit set yerine seçim var', () => {
    // İDDİA KOD DİLİMİNE ÇAPALI: `showBuckets` dosyanın YORUMUNDA hâlâ
    // geçiyor (neden kaldırıldığını anlatıyor) ve dosya genelinde aramak
    // testi kodla ilgisiz biçimde düşürüyordu.
    const g = kampanyaGovdesi();
    expect(g).not.toContain('showBuckets ?');
    expect(g).not.toContain('showBuckets}');
    expect(g).not.toContain('showBuckets =');
  });

  it('DİPNOTLAR da aynı listeden — tabloda olmayan metriğin notu basılmamalı', () => {
    expect(kampanyaGovdesi()).toContain('keys={sutunlar.filter(');
  });

  it('KRİTİK: ERİŞİM toplanmıyor — tekil kişi sayısı günler arasında toplanamaz', () => {
    /*
     * Aynı kişi iki kampanyayı da görmüş olabilir; toplamak müşteriye iki
     * kat kitle söylemek olur. Karar artık PAYLAŞILAN pakette ve iddia da
     * oraya bakıyor — davranışa, kaynak metnine değil.
     */
    expect(COLUMN_TOTALS.reach).toBeNull();
    expect(COLUMN_TOTALS.spend).not.toBeNull();
  });

  it('KRİTİK: her sütunun toplam kararı VAR — sessiz boşluk yok', () => {
    /*
     * Bir sütun eklenip toplamı eklenmediğinde tablo sessizce kayıyor.
     * `Record<ColumnKey, …>` bunu derlemede yakalıyor; bu test aynı şeyi
     * koşum anında da kilitliyor (biri tipi gevşetirse).
     */
    for (const k of COLUMN_KEYS) {
      expect(Object.hasOwn(COLUMN_TOTALS, k), `${k} için toplam kararı yok`).toBe(true);
    }
  });

  it('KRİTİK: panel toplamın İKİNCİ bir kopyasını tutmuyor', () => {
    /*
     * PDF ile panel aynı toplamı göstermek zorunda. Panelde yerel bir
     * `toplam` defteri varken PDF'te hiç toplam yoktu ve ikisini bağlayan
     * hiçbir şey yoktu; kopya geri gelirse aynı ayrışma da geri gelir.
     */
    expect(KAYNAK).not.toContain('toplam:');
    expect(KAYNAK).toContain('COLUMN_TOTALS[k]');
  });

  it('belge PAYLAŞILAN çözümleyiciyi ve varsayılanları kullanıyor', () => {
    /*
     * Sütun kararı `packages/shared` içinde: aynı rapor hem panelde HTML
     * hem sunucuda PDF olarak render ediliyor ve ikisi AYNI listeye bakmak
     * zorunda. Belgenin kendi kopyasını tutması, iki farklı sütun setiyle
     * çıkan bir rapor demek olurdu.
     */
    const g = kampanyaGovdesi();
    expect(g).toContain('resolveColumns(secim, varsayilan)');
    expect(KAYNAK).toContain('DEFAULT_COLUMNS.meta_campaigns');
    expect(KAYNAK).toContain('DEFAULT_COLUMNS.google_campaigns');
    // Yerel bir kopya GERİ GELMEMELİ.
    expect(KAYNAK).not.toContain('const VARSAYILAN_SUTUNLAR');
  });
});
