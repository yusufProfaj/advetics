import { describe, expect, it } from 'vitest';
import {
  CREATIVE_TEXT_CAPS,
  creativeTextsSchema,
  emptyCreativeTexts,
  packTextsFor,
  type CreativeTexts,
} from '@advetics/shared';

/**
 * Metin havuzundan platform paketi — META İLE GOOGLE'IN BİRLEŞTİĞİ NOKTA.
 *
 * `goal-mapping.spec.ts` ile aynı sınıfta bir test: bir paketleme hatası
 * SESSİZ. Reklam yayınlanır, başlığı eksik ya da yanlış çıkar, hiçbir hata
 * mesajı görünmez ve fark ancak Ads Manager'a bakan biri varsa edilir.
 */

function texts(patch: Partial<CreativeTexts> = {}): CreativeTexts {
  return { ...emptyCreativeTexts(), ...patch };
}

describe('metin havuzu şeması', () => {
  it('boş havuz geçerli — kreatif metinsiz oluşturulabiliyor', () => {
    // Kullanıcı önce görsel seçip metni sonra yazabilmeli. Zorunlu kılmak,
    // `ad_drafts`'ta yaşanan hatanın aynısı olurdu: görsel eklemek taslak
    // istiyordu, taslak metin istiyordu ve kullanıcı hiçbirini yapamıyordu.
    expect(creativeTextsSchema.parse({})).toEqual({
      headlines: [],
      longHeadlines: [],
      descriptions: [],
    });
  });

  it('havuz sınırı Google RSA tavanı kadar', () => {
    const ok = creativeTextsSchema.safeParse({
      headlines: Array.from({ length: CREATIVE_TEXT_CAPS.maxHeadlines }, (_, i) => `Başlık ${i}`),
    });
    expect(ok.success).toBe(true);

    const fazla = creativeTextsSchema.safeParse({
      headlines: Array.from({ length: 16 }, (_, i) => `Başlık ${i}`),
    });
    expect(fazla.success).toBe(false);
  });

  it('boş dizge başlık kabul edilmiyor', () => {
    // Boş bir başlık platforma gidince Meta onu kabul edip boş gösteriyor.
    expect(creativeTextsSchema.safeParse({ headlines: ['  '] }).success).toBe(false);
  });
});

describe('Meta paketi', () => {
  it('TEK başlık alıyor ve İLKİNİ alıyor', () => {
    // SIRA ANLAMLI. Kullanıcının Google için yazdığı beşinci alternatif,
    // Meta reklamının ana başlığı olarak çıkmamalı.
    const p = packTextsFor('meta_single_image', {
      ...texts(),
      primaryText: 'Ana metin',
      headlines: ['Birinci', 'İkinci', 'Üçüncü'],
      descriptions: ['Açıklama A', 'Açıklama B'],
    });

    expect(p.headlines).toEqual(['Birinci']);
    expect(p.descriptions).toEqual(['Açıklama A']);
    expect(p.primaryText).toBe('Ana metin');
    expect(p.blockers).toEqual([]);
  });

  it('kullanılmayan metin SESSİZCE düşmüyor, sayısı yazılıyor', () => {
    const p = packTextsFor('meta_single_image', texts({ headlines: ['A', 'B', 'C'] }));
    expect(p.warnings.join(' ')).toContain('3 başlık var, ilk 1 tanesi kullanıldı');
  });

  it('başlıksız reklam ENGELLENMİYOR', () => {
    // Meta başlıksız reklamı kabul ediyor ve yalnızca birincil metinle
    // yayınlıyor. Engellemek, bugün çalışan bir akışı bozardı.
    const p = packTextsFor('meta_single_image', texts({ primaryText: 'Sadece ana metin' }));
    expect(p.blockers).toEqual([]);
  });
});

describe('Google RSA paketi', () => {
  it('30 karakteri aşan başlık KIRPILMIYOR, eleniyor', () => {
    /**
     * KIRPMAK CAZİP AMA YANLIŞ: cümlenin ortasından kesilmiş bir başlık
     * reklamda kullanıcının yazmadığı bir şey söyler. Elemek, "bunu kısalt"
     * deme şansı bırakıyor.
     */
    const uzun = 'Bu başlık otuz karakterden kesinlikle daha uzun';
    expect(uzun.length).toBeGreaterThan(30);

    const p = packTextsFor('google_rsa', {
      ...texts(),
      headlines: ['Kısa bir', 'Yine kısa', 'Üçüncü kısa', uzun],
      descriptions: ['Açıklama bir', 'Açıklama iki'],
    });

    expect(p.headlines).not.toContain(uzun);
    expect(p.headlines).toHaveLength(3);
    expect(p.warnings.join(' ')).toContain('30 karakteri aştığı için kullanılmadı');
  });

  it('KRİTİK: üç başlığın altında paket ENGELLİ', () => {
    // Google bu sayının altındaki bir RSA'yı oluşturmuyor. Engellemezsek
    // yayın çağrısı platformda düşer ve kullanıcı sebebini göremez.
    const p = packTextsFor('google_rsa', {
      ...texts(),
      headlines: ['Bir', 'İki'],
      descriptions: ['Açıklama bir', 'Açıklama iki'],
    });

    expect(p.blockers).toHaveLength(1);
    expect(p.blockers[0]).toContain('en az 3 başlık');
  });

  it('iki açıklamanın altında paket ENGELLİ', () => {
    const p = packTextsFor('google_rsa', {
      ...texts(),
      headlines: ['Bir', 'İki', 'Üç'],
      descriptions: ['Tek açıklama'],
    });

    expect(p.blockers.join(' ')).toContain('en az 2 açıklama');
  });

  it('ana metin GÖNDERİLMİYOR ve bu söyleniyor', () => {
    /**
     * Kullanıcı Meta için yazdığı ana metnin Google'da hiçbir yerde
     * görünmeyeceğini bilmeli. Sessizce atmak, "yazdığım metin nerede"
     * sorusunu cevapsız bırakır.
     */
    const p = packTextsFor('google_rsa', {
      ...texts(),
      primaryText: 'Meta için yazılmış uzun ana metin',
      headlines: ['Bir', 'İki', 'Üç'],
      descriptions: ['Açıklama bir', 'Açıklama iki'],
    });

    expect(p.primaryText).toBeUndefined();
    expect(p.warnings.join(' ')).toContain('ana metin bu biçimde kullanılmıyor');
  });
});

describe('tek havuz, iki platform', () => {
  it('AYNI havuz her iki platformda da çalışıyor', () => {
    /**
     * Tasarımın bütün iddiası bu tek testte: kullanıcı bir kez yazıyor,
     * Meta bir başlık alıyor, Google üçünü birden.
     *
     * Havuz Google'ın dar sınırına göre doldurulduğunda Meta tarafı
     * kendiliğinden geçiyor — ters yön geçmiyor ve arayüzün kullanıcıyı
     * uyarması gereken yer orası.
     */
    const havuz: CreativeTexts = {
      primaryText: 'Yaz indirimi başladı, kaçırma.',
      headlines: ['Yaz indirimi', 'Şimdi keşfet', '%50 indirim'],
      longHeadlines: [],
      descriptions: ['Sınırlı süre geçerli', 'Ücretsiz kargo fırsatı'],
    };

    const meta = packTextsFor('meta_single_image', havuz);
    const google = packTextsFor('google_rsa', havuz);

    expect(meta.blockers).toEqual([]);
    expect(google.blockers).toEqual([]);
    expect(meta.headlines).toEqual(['Yaz indirimi']);
    expect(google.headlines).toHaveLength(3);
  });

  it('Meta için yeterli havuz Google için YETMEYEBİLİR — ve bunu söylüyor', () => {
    const havuz = texts({
      primaryText: 'Ana metin',
      headlines: ['Tek başlık'],
      descriptions: ['Tek açıklama'],
    });

    expect(packTextsFor('meta_single_image', havuz).blockers).toEqual([]);
    expect(packTextsFor('google_rsa', havuz).blockers).toHaveLength(2);
  });
});
