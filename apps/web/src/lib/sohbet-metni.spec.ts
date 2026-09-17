import { describe, expect, it } from 'vitest';
import { bloklaraAyir, satirIciAyir } from './sohbet-metni';

/**
 * Kullanıcının bildirdiği hâl: *"metinlerde '*' '**' işaretleri çıkıyor"*.
 * Model markdown yazıyor, ekran düz metin basıyordu.
 */
describe('satır içi', () => {
  it('KRİTİK: çift yıldız KALIN, yıldızlar kayboluyor', () => {
    expect(satirIciAyir('günde **500 TL** bütçe')).toEqual([
      { tip: 'metin', deger: 'günde ' },
      { tip: 'kalin', deger: '500 TL' },
      { tip: 'metin', deger: ' bütçe' },
    ]);
  });

  it('KRİTİK: çift yıldız TEK yıldızdan ÖNCE aranıyor', () => {
    /*
     * Tek yıldızı önce aramak `**kalın**` ifadesini parçalar ve ekranda
     * yıldızlar geri görünürdü — düzeltilmek istenen şeyin ta kendisi.
     */
    const p = satirIciAyir('**tamamen** kalın');
    expect(p[0]).toEqual({ tip: 'kalin', deger: 'tamamen' });
  });

  it('tek yıldız EĞİK, alt çizgi de öyle', () => {
    expect(satirIciAyir('*önemli*')).toEqual([{ tip: 'egik', deger: 'önemli' }]);
    expect(satirIciAyir('_önemli_')).toEqual([{ tip: 'egik', deger: 'önemli' }]);
  });

  it('ters tırnak KOD', () => {
    expect(satirIciAyir('`act_123`')).toEqual([{ tip: 'kod', deger: 'act_123' }]);
  });

  it('KRİTİK: EŞLEŞMEYEN yıldız SİLİNMİYOR', () => {
    /*
     * Model bazen çarpı işareti yerine tek yıldız yazıyor ("3 * 5"). Onu
     * silmek kullanıcının okuduğu cümleyi değiştirmek olurdu.
     */
    expect(satirIciAyir('3 * 5 hesabı')).toEqual([{ tip: 'metin', deger: '3 * 5 hesabı' }]);
  });

  it('düz metin tek parça dönüyor', () => {
    expect(satirIciAyir('merhaba')).toEqual([{ tip: 'metin', deger: 'merhaba' }]);
  });
});

describe('bloklar', () => {
  it('KRİTİK: madde işaretleri LİSTE oluyor', () => {
    const b = bloklaraAyir('- birinci\n- ikinci');
    expect(b).toHaveLength(1);
    expect(b[0]!.tip).toBe('madde');
    expect(b[0]!.tip === 'madde' && b[0]!.ogeler).toHaveLength(2);
  });

  it('KRİTİK: madde arasındaki BOŞ SATIR listeyi bölmüyor', () => {
    /*
     * Model maddeler arasına boş satır koyabiliyor; her maddeyi ayrı listeye
     * bölmek ekranda araları açılmış, kopuk bir liste üretirdi.
     */
    const b = bloklaraAyir('- bir\n\n- iki');
    expect(b).toHaveLength(1);
    expect(b[0]!.tip === 'madde' && b[0]!.ogeler).toHaveLength(2);
  });

  it('üç madde işareti de tanınıyor', () => {
    // Model `-`, `*` ve `·` üçünü de kullanıyor.
    for (const im of ['-', '*', '·']) {
      const b = bloklaraAyir(`${im} madde`);
      expect(b[0]!.tip, `${im} tanınmadı`).toBe('madde');
    }
  });

  it('numaralı liste AYRI blok', () => {
    const b = bloklaraAyir('1. ilk\n2. ikinci');
    expect(b[0]!.tip).toBe('sirali');
    expect(b[0]!.tip === 'sirali' && b[0]!.ogeler).toHaveLength(2);
  });

  it('KRİTİK: başlık işaretleri EKRANDA GÖRÜNMÜYOR', () => {
    const b = bloklaraAyir('## Plan');
    expect(b[0]!.tip).toBe('baslik');
    expect(b[0]!.tip === 'baslik' && b[0]!.parcalar[0]).toEqual({ tip: 'metin', deger: 'Plan' });
  });

  it('boş satır paragrafı bitiriyor', () => {
    const b = bloklaraAyir('ilk paragraf\n\nikinci paragraf');
    expect(b).toHaveLength(2);
    expect(b.every((x) => x.tip === 'paragraf')).toBe(true);
  });

  it('tek satırdaki metin BİRLEŞTİRİLİYOR', () => {
    // Model satırı 80 karakterde kırıyor; her kırığı ayrı paragraf yapmak
    // ekranda kopuk cümleler üretirdi.
    const b = bloklaraAyir('bu cümle\niki satıra bölünmüş');
    expect(b).toHaveLength(1);
    expect(b[0]!.tip === 'paragraf' && b[0]!.parcalar[0]).toEqual({
      tip: 'metin',
      deger: 'bu cümle iki satıra bölünmüş',
    });
  });
});
