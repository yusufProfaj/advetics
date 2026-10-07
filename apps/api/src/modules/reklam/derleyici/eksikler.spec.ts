import { describe, expect, it } from 'vitest';
import { kanonikJson, taslakEksikleri, taslakKanonikIcerik, type TaslakAlanlari } from '@advetics/shared';

const z = '2026-10-07T10:00:00.000Z';
const k = <T,>(deger: T, kaynak: 'kullanici' | 'ai_onerisi' | 'marka_merkezi' = 'kullanici') => ({ deger, kaynak, kim: null, zaman: z });

const dolu: TaslakAlanlari = {
  niyet: k('SITE' as const),
  reklamHesabiId: k('44444444-0000-4000-8000-000000000001'),
  sayfaId: k('55555555-0000-4000-8000-000000000001'),
  konumlar: k([{ tur: 'region' as const, key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi'),
  kavramlar: k([{ varlikId: '66666666-0000-4000-8000-000000000001', baslik: 'B', metin: 'M' }]),
  hedefAdres: k('https://ornek.com.tr'),
  butce: k({ tip: 'gunluk' as const, micros: '500000000' }),
  takvim: k({ baslangic: '2026-10-08', bitis: null }),
};

describe('taslakEksikleri', () => {
  it('dolu taslakta eksik yok; konum Marka Merkezi’nden gelebilir', () => {
    expect(taslakEksikleri(dolu)).toEqual([]);
  });

  it('KRİTİK: AI’ın önerdiği bütçe “dolu” sayılmaz — kullanıcı onaylamalı', () => {
    const e = taslakEksikleri({ ...dolu, butce: k({ tip: 'gunluk' as const, micros: '500000000' }, 'ai_onerisi') });
    expect(e).toEqual([expect.objectContaining({ alan: 'butce', kod: 'KAYNAK', adim: 3 })]);
  });

  it('niyet yalnız kullanıcıdan: Marka Merkezi’nin ana amacı seçim değil', () => {
    expect(taslakEksikleri({ ...dolu, niyet: k('SITE' as const, 'marka_merkezi') }).map((x) => x.kod)).toEqual(['KAYNAK']);
  });

  it('toplam bütçede bitiş zorunlu; bitiş başlangıçtan önce olamaz', () => {
    expect(taslakEksikleri({ ...dolu, butce: k({ tip: 'toplam' as const, micros: '5000000000' }) }).map((x) => x.kod)).toEqual(['BTC-02']);
    expect(taslakEksikleri({ ...dolu, takvim: k({ baslangic: '2026-10-08', bitis: '2026-10-01' }) }).map((x) => x.kod)).toEqual(['TKV']);
  });

  it('niyete özel: SITE adres, FORM form ister', () => {
    expect(taslakEksikleri({ ...dolu, hedefAdres: k('http://x.com') }).map((x) => x.kod)).toEqual(['SITE-ADRES']);
    expect(taslakEksikleri({ ...dolu, niyet: k('FORM' as const) }).map((x) => x.kod)).toEqual(['FORM-YOK']);
  });
});

describe('içerik özeti girdisi', () => {
  it('kim ve zaman özete girmez; anahtar sırası özeti değiştirmez', () => {
    const a = taslakKanonikIcerik({ niyet: { deger: 'SITE', kaynak: 'kullanici', kim: 'x', zaman: z } });
    const b = taslakKanonikIcerik({ niyet: { zaman: '2030-01-01T00:00:00Z', kim: null, kaynak: 'kullanici', deger: 'SITE' } });
    expect(a).toBe(b);
    expect(kanonikJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('kaynak değişince özet değişir (kaynak kilidi derlemeyi değiştiriyor)', () => {
    expect(taslakKanonikIcerik({ niyet: k('SITE' as const) })).not.toBe(
      taslakKanonikIcerik({ niyet: k('SITE' as const, 'ai_onerisi') }),
    );
  });
});
