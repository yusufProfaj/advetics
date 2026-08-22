import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { veriFazlaHatasi } from './meta.provider';
import { PlatformApiError } from '../provider.types';

/**
 * META "İSTEDİĞİN VERİ FAZLA" DİYOR — SAYFA BOYUTU KÜÇÜLMELİ.
 *
 * Canlıda görülen tablo: bir reklam hesabında yapı taraması HİÇ
 * tamamlanamadı. Her denemede aynı hatayla düşüyor, beş denemeden sonra
 * kalıcı `failed` oluyor, kampanya satırları hiç yazılmadığı için o hesabın
 * METRİKLERİ de hiç yazılamıyor. Panelde görünen tek şey "Yapı: hiç".
 *
 *     [transient] Please reduce the amount of data you're asking for,
 *                 then retry your request
 *
 * Kabul edilen sayfa boyutunun sabit bir eşiği yok: hesabın büyüklüğüne,
 * istenen alan setine ve o anki yüke göre değişiyor. Aynı istek bir hesapta
 * çalışıp diğerinde düşüyor — bu yüzden sabit bir limit değil, hatayı görünce
 * küçülen bir limit gerekiyor.
 */
describe('veriFazlaHatasi', () => {
  it('Meta’nın kendi cümlesini tanıyor', () => {
    const err = new PlatformApiError(
      'meta',
      'transient',
      "Please reduce the amount of data you're asking for, then retry your request",
    );
    expect(veriFazlaHatasi(err)).toBe(true);
  });

  it('büyük/küçük harf farkını yutuyor — mesaj sürümle değişebiliyor', () => {
    expect(veriFazlaHatasi(new Error('PLEASE REDUCE THE AMOUNT OF DATA you are asking for'))).toBe(
      true,
    );
  });

  it('BAŞKA hataları küçültme sebebi SAYMIYOR — sessizce yarı veri çekmek olurdu', () => {
    // Yanlış pozitif burada pahalı: izin hatasında ya da geçersiz alanda
    // sayfa boyutunu küçültmek hatayı gizler ve iş yarı veriyle "başarılı"
    // görünebilir.
    expect(veriFazlaHatasi(new Error('(#10) requires pages_read_engagement'))).toBe(false);
    expect(veriFazlaHatasi(new Error('(#100) Invalid parameter'))).toBe(false);
    expect(veriFazlaHatasi(new Error('rate limit reached'))).toBe(false);
    expect(veriFazlaHatasi(undefined)).toBe(false);
  });
});

describe('kaynak taraması — küçültme döngüsü', () => {
  const SOURCE = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');

  function pagedEdgeGovdesi(): string {
    const bas = SOURCE.indexOf('private async pagedEdge(');
    if (bas === -1) {
      throw new Error('pagedEdge bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    const govde = SOURCE.slice(bas, SOURCE.indexOf('\n  private ', bas + 10));
    if (!govde.includes('platformFetch')) {
      throw new Error('pagedEdge dilimi istek atmıyor — tarama boşa düştü.');
    }
    return govde;
  }

  it('hata yakalanıp limit YARILANIYOR', () => {
    const g = pagedEdgeGovdesi();
    expect(g).toContain('veriFazlaHatasi(err)');
    expect(g).toContain('Math.floor(limit / 2)');
  });

  it('küçültme SONSUZ DÖNGÜ olamıyor — hem taban hem sayaç var', () => {
    const g = pagedEdgeGovdesi();
    expect(g).toContain('EN_KUCUK_SAYFA');
    expect(g).toContain('MAX_KUCULTME');
  });

  it('küçültme SAYFA İLERLETMİYOR — aynı sayfa tekrar isteniyor', () => {
    // `pages++` küçültme dalında olsaydı 40 sayfalık sınır küçültmelerle
    // tükenir ve tarama sessizce KISMİ dönerdi.
    const g = pagedEdgeGovdesi();
    const dal = g.slice(g.indexOf('veriFazlaHatasi(err)'), g.indexOf('calls.n++'));
    expect(dal).not.toContain('pages++');
  });

  it('küçültülen limit SONRAKİ sayfalarda da korunuyor', () => {
    /*
     * Meta'nın verdiği `next` kendi limitini taşıyor; korunmazsa ikinci sayfa
     * yine 500'lük gider ve aynı hatayla düşer.
     *
     * İDDİA SAYFA İLERLETME DİLİMİNE ÇAPALI. İlk yazımda gövdenin tamamında
     * `set('limit', ...)` aranıyordu ve o dizge KÜÇÜLTME dalında da geçtiği
     * için iddia her zaman doğruydu: sonraki-sayfa korumasını tamamen
     * silmek testi düşürmüyordu. Mutasyonla yakalandı.
     */
    const g = pagedEdgeGovdesi();
    const bas = g.indexOf('rows.push(');
    if (bas === -1) {
      throw new Error('sayfa ilerletme dilimi bulunamadı — tarama boşa düştü.');
    }
    const dal = g.slice(bas);
    expect(dal).toContain('limit !== ILK_SAYFA_BOYUTU');
    expect(dal).toContain("u.searchParams.set('limit', String(limit))");
  });
});
