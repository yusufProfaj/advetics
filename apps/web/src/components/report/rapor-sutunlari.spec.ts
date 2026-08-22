import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('ERİŞİM toplanmıyor — tekil kişi sayısı günler arasında toplanamaz', () => {
    const bas = KAYNAK.indexOf('const SUTUNLAR:');
    if (bas === -1) {
      throw new Error('SUTUNLAR defteri bulunamadı — tarama boşa düştü.');
    }
    const defter = KAYNAK.slice(bas, KAYNAK.indexOf('\nconst VARSAYILAN_SUTUNLAR'));
    const reach = defter.slice(defter.indexOf('  reach: {'), defter.indexOf('  ctr: {'));
    expect(reach).toContain('toplam: null');
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
