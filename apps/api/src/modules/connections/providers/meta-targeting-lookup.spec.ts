import { describe, expect, it } from 'vitest';
import { mapGeoLocation, mapSavedAudience } from './meta.provider';

/**
 * Hedefleme arama sonuçlarının eşlemesi.
 *
 * NEDEN AYRI TEST: iki listenin de hatası SESSİZ ve sonucu para.
 *
 *   · `key` yanlış ya da eksik okunursa kullanıcı "İzmir" seçer, Meta'ya
 *     giden değer başka bir yer olur ve fark ancak raporda görülür.
 *   · `approximate_count` yokken sıfır yazılırsa kullanıcı çalışan bir
 *     kitleyi "boş" sanıp kullanmaktan vazgeçer.
 */

describe('mapGeoLocation', () => {
  const izmir = {
    key: '2420351',
    name: 'İzmir',
    type: 'city',
    country_code: 'TR',
    country_name: 'Türkiye',
    region: 'İzmir',
    supports_region: true,
  };

  it('anahtar ve ad okunuyor', () => {
    const o = mapGeoLocation(izmir)!;
    expect(o.key).toBe('2420351');
    expect(o.name).toBe('İzmir');
    expect(o.type).toBe('city');
    expect(o.countryCode).toBe('TR');
  });

  it('KRİTİK: ANAHTARSIZ satır atılıyor', () => {
    // `key` hedeflemeye giden değerin ta kendisi. Listeye koymak, tıklanınca
    // hiçbir şey olmayan bir seçenek göstermek olurdu.
    expect(mapGeoLocation({ name: 'İzmir', type: 'city' })).toBeNull();
    expect(mapGeoLocation({ key: '1', type: 'city' })).toBeNull();
  });

  it('etiket il ve ülkeyle birlikte kuruluyor', () => {
    // Meta'da aynı adı taşıyan onlarca yer var; yalnızca "Merkez" göstermek
    // kullanıcıyı yanlış seçime götürür ve yanlış ancak fatura geldiğinde
    // fark edilir.
    expect(mapGeoLocation({ ...izmir, name: 'Merkez', region: 'Ankara' })!.label).toBe(
      'Merkez, Ankara, Türkiye',
    );
  });

  it('il adı gönderi adıyla AYNIYSA tekrarlanmıyor', () => {
    // "İzmir, İzmir, Türkiye" yerine "İzmir, Türkiye".
    expect(mapGeoLocation(izmir)!.label).toBe('İzmir, Türkiye');
  });

  it('ülke satırında etiket yalnızca ülke adı', () => {
    const o = mapGeoLocation({ key: 'TR', name: 'Türkiye', type: 'country', country_code: 'TR' })!;
    expect(o.label).toBe('Türkiye');
    expect(o.type).toBe('country');
  });

  it('bilinmeyen tip `unknown` oluyor, satır atılmıyor', () => {
    // Tip yalnızca ekranda etiketleme için; eksikliği satırı kullanılamaz
    // yapmıyor ve atmak kullanıcıdan geçerli bir seçeneği saklamak olurdu.
    expect(mapGeoLocation({ key: '9', name: 'Bir yer' })!.type).toBe('unknown');
  });
});

describe('mapSavedAudience', () => {
  it('kimlik, ad ve tahmini büyüklük okunuyor', () => {
    const o = mapSavedAudience({ id: '123', name: 'Sıcak kitle', approximate_count: 45_000 })!;
    expect(o).toEqual({ id: '123', name: 'Sıcak kitle', approximateCount: 45_000 });
  });

  it('KRİTİK: büyüklük yoksa NULL, sıfır değil', () => {
    // Meta bu alanı küçük ve yeni kitlelerde vermiyor. Sıfır yazmak "bu
    // kitlede kimse yok" demek olurdu ve kullanıcı çalışan bir kitleyi
    // kullanmaktan vazgeçerdi.
    expect(mapSavedAudience({ id: '123', name: 'Yeni kitle' })!.approximateCount).toBeNull();
  });

  it('kimliksiz satır atılıyor', () => {
    expect(mapSavedAudience({ name: 'Adsız' })).toBeNull();
  });

  it('adsız kitle kimliğiyle gösteriliyor', () => {
    // Boş bir satır göstermektense kimliği göstermek: kullanıcı en azından
    // hangi kaydın olduğunu Ads Manager'da bulabiliyor.
    expect(mapSavedAudience({ id: '123' })!.name).toBe('123');
  });
});
