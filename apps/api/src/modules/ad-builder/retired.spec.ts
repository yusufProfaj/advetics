import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EMEKLİ AKIŞ GERİ GELMESİN — kaynak taraması.
 *
 * Eski reklam oluşturucu 2026-08-16'da emekliye ayrıldı; yerini kampanya
 * taslağı ağacı aldı. Arayüzden erişilemiyor olması YETMEZ: açık bir uç, bir
 * gün başka bir ekrandan ya da bir betikten sessizce yeniden kullanılır ve o
 * taslak yeni akışın hiçbir kontrolünden geçmez — özel reklam kategorisi
 * beyanı dahil, ki o beyanın unutulması hesap seviyesinde ceza demek.
 *
 * `nav-routes.spec.ts` ile aynı desen: yorumla korunan kural, korunmayan
 * kuraldır.
 */

const KONTROLCU = readFileSync(
  join(__dirname, 'ad-builder.controller.ts'),
  'utf8',
);

describe('eski oluşturucu emekli', () => {
  it('KRİTİK: yazma uçları GoneException fırlatıyor', () => {
    // Yazma yolları: oluştur, güncelle, görsel ekle, arşivden ekle, yayınla.
    const atislar = KONTROLCU.match(/throw new GoneException/g) ?? [];
    expect(atislar.length).toBeGreaterThanOrEqual(5);
  });

  it('KRİTİK: servisin yazma metotları kontrolcüden ÇAĞRILMIYOR', () => {
    /**
     * Bir uç geri açılırsa bu test düşer. Metot adlarını arıyoruz çünkü
     * `GoneException` sayısı doğru kalırken birinin altına eski çağrı geri
     * eklenebilir.
     */
    for (const cagri of [
      'this.drafts.create(',
      'this.drafts.update(',
      'this.drafts.addAsset(',
      'this.drafts.attachFromLibrary(',
      'this.publisher.publish(',
    ]) {
      expect(KONTROLCU, `${cagri} geri eklenmiş — emekli akış yeniden yazıyor`).not.toContain(
        cagri,
      );
    }
  });

  it('okuma uçları DURUYOR — geçmiş kaybolmasın', () => {
    /**
     * Veri silinmedi ve taşınmadı: üretimdeki satır sayısı bilinmiyor ve
     * bilinmeden veri düşürmek sorumsuzluk olurdu. Panel eski taslakları salt
     * okunur gösteriyor ve bunun için liste ucu gerekiyor.
     */
    expect(KONTROLCU).toContain('this.drafts.list(');
    expect(KONTROLCU).toContain('this.drafts.get(');
  });

  it('mesaj YENİ YOLU söylüyor', () => {
    // "Bu uç kaldırıldı" tek başına kullanıcıya yapacak bir şey bırakmıyor.
    expect(KONTROLCU).toContain('Hızlı Reklam');
    expect(KONTROLCU).toContain('silinmedi');
  });
});
