import { describe, expect, it } from 'vitest';
import {
  ASSET_SLOTS,
  coverageFor,
  fitToSlot,
  matchRatio,
  ratioLabel,
} from '@advetics/shared';

/**
 * Akıllı varlık yönlendirme testleri.
 *
 * NEDEN BU TESTLER: iki platformun oranları çakışmıyor ve fark gözle
 * görülmüyor. Meta Hikâyesi 9:16, Google dikeyi 4:5 — ikisi de "dikey" ama
 * biri diğerinin yerine konursa alanın %70'i kırpılıyor. Platform hata
 * vermiyor, sessizce kesiyor.
 *
 * En kritik iddia: yönlendirme ÖLÇÜLEN BOYUTA göre yapılıyor, `matchRatio`
 * kovasına göre değil. 1920×1080 ile 1200×628 ikisi de "yatay" kovasında ama
 * Google için biri uyuyor diğeri kırpılıyor.
 */

const slot = (key: string) => ASSET_SLOTS.find((s) => s.key === key)!;

function asset(id: string, width: number, height: number) {
  return { id, width, height };
}

describe('kırpma matematiği', () => {
  it('tam oran kırpma sayılmıyor', () => {
    const m = fitToSlot({ width: 1080, height: 1080 }, slot('meta_feed'));
    expect(m.fit).toBe('exact');
    expect(m.retained).toBe(1);
  });

  it('tolerans içindeki sapma tam sayılıyor', () => {
    // Telefondan çekilmiş 1080×1077 bir görseli "kare değil" diye reddetmek,
    // kullanıcıya neyi yanlış yaptığını anlatamamak demek.
    expect(fitToSlot({ width: 1080, height: 1077 }, slot('meta_feed')).fit).toBe('exact');
  });

  it('4:5 → 1:1 hafif kırpma', () => {
    // Alanın %20'si gidiyor; genelde sorun olmuyor.
    const m = fitToSlot({ width: 960, height: 1200 }, slot('meta_feed'));
    expect(m.fit).toBe('crop');
    expect(m.retained).toBeCloseTo(0.8, 2);
  });

  it('9:16 → 1.91:1 KULLANILAMAZ sayılıyor', () => {
    // Alanın %70'i gidiyor: metin uçuyor, ürün yarısı kesiliyor. Korunan
    // alan %50 eşiğinin de altında, yani bu görsel o yuvaya HİÇ atanmıyor —
    // "ağır kırpılmış" diye sunmak, kullanılabilir olduğunu ima ederdi.
    const m = fitToSlot({ width: 1080, height: 1920 }, slot('google_landscape'));
    expect(m.fit).toBe('no');
    expect(m.retained).toBeLessThan(0.35);
  });

  it('1:1 → 1.91:1 ağır kırpma sınırında', () => {
    // %52 korunuyor: kullanılabilir ama iyi değil. Eşiklerin gerçekten
    // ayrıştığını gösteren durum.
    const m = fitToSlot({ width: 1080, height: 1080 }, slot('google_landscape'));
    expect(m.fit).toBe('heavy_crop');
    expect(m.retained).toBeCloseTo(0.524, 2);
  });

  it('korunan alan simetrik', () => {
    // Kırpma tek eksende oluyor; hangi yönde olduğu sonucu değiştirmemeli.
    const a = fitToSlot({ width: 1000, height: 500 }, slot('meta_feed')).retained;
    const b = fitToSlot({ width: 500, height: 1000 }, slot('meta_feed')).retained;
    expect(a).toBeCloseTo(b, 6);
  });

  it('boyut kontrolü KIRPILMIŞ hâle göre', () => {
    /**
     * 1080×1920 bir Hikâye görseli 1.91:1'e kırpılınca 1080×565 kalıyor.
     * Ham yüksekliğe (1920) bakmak, gerçekte platformun görmediği bir sayıya
     * bakmak olurdu.
     */
    const m = fitToSlot({ width: 1080, height: 1920 }, slot('google_landscape'));
    // Kırpılmış hâli sınırın üstünde: boyuttan değil, orandan düşüyor.
    expect(m.fit).not.toBe('too_small');
  });

  it('çok küçük görsel yuvaya girmiyor', () => {
    const m = fitToSlot({ width: 200, height: 200 }, slot('meta_feed'));
    expect(m.fit).toBe('too_small');
  });

  it('sınırı geçen ama önerinin altında kalan işaretleniyor', () => {
    // Reddedilmiyor ama bulanık görünüyor — sessiz kalite kaybı.
    const m = fitToSlot({ width: 700, height: 700 }, slot('meta_feed'));
    expect(m.fit).toBe('exact');
    expect(m.lowResolution).toBe(true);
  });
});

describe('platformlar arası oran tuzağı', () => {
  it('Meta Hikâyesi Google dikeyini DOLDURMUYOR', () => {
    // 9:16 ile 4:5 ikisi de "dikey" ama aynı şey değil.
    const m = fitToSlot({ width: 1080, height: 1920 }, slot('google_portrait'));
    expect(m.fit).not.toBe('exact');
    expect(m.retained).toBeLessThan(0.75);
  });

  it('Google dikeyi Meta Hikâyesini DOLDURMUYOR', () => {
    const m = fitToSlot({ width: 960, height: 1200 }, slot('meta_story'));
    expect(m.fit).not.toBe('exact');
  });

  it('16:9 ile 1.91:1 farkı TOLERANS İÇİNDE — bilerek', () => {
    /**
     * `RATIO_META.horizontal` 16:9 (1.778) diyor, her iki platformun yatay
     * yuvası 1.91:1. Fark %7'lik bir kırpma ve tolerans bunu bilerek yutuyor:
     * daraltmak, 1920×1080 gibi son derece yaygın bir boyutu sebepsiz
     * reddetmek olurdu.
     *
     * Test bunu KİLİTLİYOR: biri toleransı sıkılaştırmaya kalkarsa, hangi
     * gerçek dünya boyutunun kurban gideceğini burada görür.
     */
    expect(matchRatio(1920, 1080)).toBe('horizontal');
    const m = fitToSlot({ width: 1920, height: 1080 }, slot('google_landscape'));
    expect(m.fit).toBe('exact');
    // Ham kırpma oranı yine de %7 — yutulduğu yer tolerans, sıfır olduğu için değil.
    expect(1.778 / 1.91).toBeGreaterThan(0.92);
  });

  it('1200×628 hem Meta hem Google yatayına TAM uyuyor', () => {
    // Tek görselin iki platformu birden doldurabildiği durum — kullanıcıdan
    // aynı şeyi iki kez istememenin gerekçesi.
    expect(fitToSlot({ width: 1200, height: 628 }, slot('meta_link')).fit).toBe('exact');
    expect(fitToSlot({ width: 1200, height: 628 }, slot('google_landscape')).fit).toBe('exact');
  });
});

describe('Meta kapsaması', () => {
  it('yalnızca kare: akış dolu, diğerleri uyarı', () => {
    const c = coverageFor('meta', [asset('a', 1080, 1080)]);
    const feed = c.slots.find((s) => s.slot.key === 'meta_feed')!;
    expect(feed.assetId).toBe('a');
    expect(c.blockers).toEqual([]);
    // Hikâye boş: reklam orada gösterilmeyecek ama YAYINLANACAK.
    expect(c.warnings.join(' ')).toContain('Hikâye');
  });

  it('kare yoksa ENGEL', () => {
    // Meta bir yerleşim için görsel bulamazsa reklamı orada göstermiyor;
    // kare tek evrensel yedek.
    const c = coverageFor('meta', [asset('a', 1080, 1920)]);
    expect(c.blockers.join(' ')).toContain('Akış');
  });

  it('üç görselle tüm yuvalar doluyor', () => {
    const c = coverageFor('meta', [
      asset('kare', 1080, 1080),
      asset('dikey', 1080, 1920),
      asset('yatay', 1200, 628),
    ]);
    expect(c.blockers).toEqual([]);
    expect(c.slots.every((s) => s.assetId !== null)).toBe(true);
    // Her yuva TAM uyan bir görselle dolu — kırpma ya da düşük çözünürlük yok.
    expect(c.slots.every((s) => s.fit === 'exact')).toBe(true);
    expect(c.warnings).toEqual([]);
  });

  it('EN İYİ görsel seçiliyor, ilk uyan değil', () => {
    /**
     * "İlk uyan" almak, aynı üç görselin farklı sırada yüklendiğinde farklı
     * kapsama vermesi demek olurdu — aynı girdiye farklı cevap.
     */
    const c = coverageFor('meta', [
      // Önce gelen: kırpılarak uyuyor.
      asset('kirpik', 1000, 900),
      // Sonra gelen: tam uyuyor.
      asset('tam', 1080, 1080),
    ]);
    expect(c.slots.find((s) => s.slot.key === 'meta_feed')?.assetId).toBe('tam');
  });

  it('sıra değişince sonuç DEĞİŞMİYOR', () => {
    const a = coverageFor('meta', [asset('x', 1080, 1080), asset('y', 1200, 628)]);
    const b = coverageFor('meta', [asset('y', 1200, 628), asset('x', 1080, 1080)]);
    expect(a.slots.map((s) => s.assetId)).toEqual(b.slots.map((s) => s.assetId));
  });
});

describe('Google kapsaması', () => {
  it('LOGO ENGELİ her zaman var — sessizce atlanmıyor', () => {
    /**
     * PMax varlık grubu logosuz OLUŞTURULMUYOR. Logo yükleme akışı henüz yok
     * ve bunu söylememek, Google kampanyasının yayın anında anlaşılmaz bir
     * hatayla düşmesi demek.
     */
    const c = coverageFor('google', [
      asset('kare', 1200, 1200),
      asset('yatay', 1200, 628),
    ]);
    expect(c.blockers.join(' ')).toContain('logo');
  });

  it('yatay yoksa ENGEL — PMax onsuz oluşmuyor', () => {
    const c = coverageFor('google', [asset('kare', 1200, 1200)]);
    expect(c.blockers.some((b) => b.includes('Yatay görsel'))).toBe(true);
  });

  it('kare yoksa ENGEL', () => {
    const c = coverageFor('google', [asset('yatay', 1200, 628)]);
    expect(c.blockers.some((b) => b.includes('Kare görsel'))).toBe(true);
  });

  it('KARE görsel dikey yuvayı dolduruyor — 4:5 ayrıca istenmiyor', () => {
    /**
     * 1:1 → 4:5 kırpması alanın %80'ini koruyor, yani kabul edilebilir.
     * Kullanıcıdan ayrıca 4:5 istemek, elimizde çalışan bir görsel varken
     * gereksiz iş yüklemek olurdu.
     */
    const c = coverageFor('google', [
      asset('kare', 1200, 1200),
      asset('yatay', 1200, 628),
    ]);
    const portrait = c.slots.find((s) => s.slot.key === 'google_portrait')!;
    expect(portrait.assetId).toBe('kare');
    expect(portrait.fit).toBe('crop');
    expect(c.blockers.some((b) => b.includes('Dikey'))).toBe(false);
  });

  it('hiç dikey doldurulamıyorsa UYARI çıkıyor', () => {
    // Yalnızca çok geniş bir görsel varsa 4:5 yuvası boş kalıyor.
    const c = coverageFor('google', [asset('yatay', 1200, 628)]);
    expect(c.warnings.join(' ')).toContain('Dikey');
  });

  it('Meta seti Google dikeyini boş bırakıyor', () => {
    /**
     * Modülün varlık sebebi bu satır: Meta için mükemmel bir set (kare +
     * 9:16 + 1.91:1) Google'ın 4:5 yuvasını dolduramıyor ve kimse fark
     * etmiyor.
     */
    const c = coverageFor('google', [
      asset('kare', 1080, 1080),
      asset('hikaye', 1080, 1920),
      asset('yatay', 1200, 628),
    ]);
    const portrait = c.slots.find((s) => s.slot.key === 'google_portrait')!;
    expect(portrait.fit).not.toBe('exact');
  });

  it('ağır kırpma ZORUNLU yuvada engel', () => {
    const c = coverageFor('google', [
      asset('kare', 1200, 1200),
      asset('hikaye', 1080, 1920),
    ]);
    // Yatay yuvayı yalnızca hikâye görseli dolduruyor ve %70'i kırpılıyor.
    expect(c.blockers.join(' ')).toMatch(/kırpılacak|uygun görsel yok/);
  });
});

describe('oran etiketi', () => {
  it('bilinen oranlar okunabilir yazılıyor', () => {
    expect(ratioLabel(1)).toBe('1:1');
    expect(ratioLabel(1.91)).toBe('1.91:1');
    expect(ratioLabel(9 / 16)).toBe('9:16');
    expect(ratioLabel(4 / 5)).toBe('4:5');
  });
});
