import { describe, expect, it } from 'vitest';
import { BEKLEYEN_IS_TURLERI, type BekleyenIs, type BekleyenIslerYaniti } from '@advetics/shared';
import {
  bekleyenIsAdresi,
  bekleyenIsCumlesi,
  bekleyenIsYasi,
  bekleyenIslerYolu,
  bekleyenKutuHali,
  boostRozeti,
  kaynakHataMetni,
  kesmeMetni,
  type BekleyenIslerSonucu,
} from './bekleyen-isler';
import { butceAdresi } from './butce-adresi';
import { stratejiAdresi } from '@/components/strateji/hesap';

/**
 * GENEL BAKIŞ › BEKLEYEN İŞLER — saf kararlar ÇALIŞTIRILARAK sınanıyor.
 * Kutu bu kararların çizimi; burada yanlışsa ekranda da yanlış.
 */

const WS = '11111111-1111-4111-8111-111111111111';

const is = (tur: BekleyenIs['tur'], ek: Partial<BekleyenIs> = {}): BekleyenIs => ({
  tur,
  clientId: WS,
  clientAdi: 'Ege Birlik',
  sayi: 1,
  enEski: null,
  ...ek,
});

const yanit = (ek: Partial<BekleyenIslerYaniti> = {}): BekleyenIslerYaniti => ({
  isler: [],
  toplam: 0,
  sorulmayan: [],
  hatalar: [],
  uretildi: '2026-10-09T08:00:00.000Z',
  ...ek,
});

const tamam = (y: BekleyenIslerYaniti): BekleyenIslerSonucu => ({ durum: 'tamam', yanit: y });

describe('ucun adresi', () => {
  it('KRİTİK: tek workspace seçiliyse clientId gidiyor', () => {
    expect(bekleyenIslerYolu(WS)).toBe(`/genel-bakis/bekleyenler?clientId=${WS}`);
  });

  it('KRİTİK: "Tüm workspace’ler" kipinde clientId GİTMİYOR', () => {
    // Boş `clientId=` gitseydi şema uuid doğrulamasında 400 verirdi.
    expect(bekleyenIslerYolu(null)).toBe('/genel-bakis/bekleyenler');
  });
});

describe('kutunun hâli', () => {
  it('KRİTİK: çağrı düştüyse "hata", boş değil', () => {
    expect(bekleyenKutuHali({ durum: 'hata', mesaj: 'Sunucu cevap vermedi' })).toBe('hata');
  });

  it('satır yok, hata yok: boş', () => {
    expect(bekleyenKutuHali(tamam(yanit()))).toBe('bos');
  });

  it('KRİTİK: satır yok AMA kaynak düştüyse "Bekleyen iş yok" DENMİYOR', () => {
    const h = bekleyenKutuHali(tamam(yanit({ hatalar: [{ tur: 'boost_onay', mesaj: 'zaman aşımı' }] })));
    expect(h).toBe('yalniz_hata');
  });

  it('satır varsa dolu (kısmi hata satırların altında yazılıyor)', () => {
    const h = bekleyenKutuHali(
      tamam(yanit({ isler: [is('butce_yok')], toplam: 1, hatalar: [{ tur: 'boost_onay', mesaj: 'x' }] })),
    );
    expect(h).toBe('dolu');
  });
});

describe('satır cümleleri', () => {
  it('boost: sayı cümlede', () => {
    expect(bekleyenIsCumlesi(is('boost_onay', { sayi: 15 }), false)).toBe('15 Akıllı Boost kartı onay bekliyor');
  });

  it('KRİTİK: strateji onayı yetkiye göre İKİ TÜRLÜ', () => {
    expect(bekleyenIsCumlesi(is('strateji_onay'), true)).toBe('Medya planı onayını bekliyor');
    expect(bekleyenIsCumlesi(is('strateji_onay'), false)).toBe('Medya planı onayda');
    expect(bekleyenIsCumlesi(is('strateji_onay', { sayi: 3 }), true)).toBe('3 medya planı onayını bekliyor');
  });

  it('aktarım ve bütçe', () => {
    expect(bekleyenIsCumlesi(is('strateji_aktar'), true)).toBe('Onaylanan plan AdvCampaign’e aktarılmadı');
    expect(bekleyenIsCumlesi(is('butce_yok'), true)).toBe('Bu ay harcama var, bütçe tanımlı değil');
  });

  it('her tür için bir cümle var ve uzun tire yok', () => {
    for (const tur of BEKLEYEN_IS_TURLERI) {
      for (const yetki of [true, false]) {
        const c = bekleyenIsCumlesi(is(tur, { sayi: 2 }), yetki);
        expect(c.length).toBeGreaterThan(5);
        expect(c).not.toContain('—');
      }
    }
  });
});

describe('yaş', () => {
  const simdi = new Date('2026-10-09T12:00:00Z');
  it('"23 gündür"', () => {
    expect(bekleyenIsYasi('2026-09-16T10:00:00Z', simdi)).toBe('23 gündür');
  });
  it('bir günden az: "bugün"', () => {
    expect(bekleyenIsYasi('2026-10-09T01:00:00Z', simdi)).toBe('bugün');
  });
  it('başlangıç yoksa yaş uydurulmuyor', () => {
    expect(bekleyenIsYasi(null, simdi)).toBeNull();
    expect(bekleyenIsYasi('bozuk', simdi)).toBeNull();
  });
});

describe('adresler — var olan üreticilerden', () => {
  it('KRİTİK: boost satırı işin workspace’ine gidiyor', () => {
    expect(bekleyenIsAdresi(is('boost_onay'))).toBe(`/auto-boost?musteri=${WS}`);
  });

  it('KRİTİK: strateji ve bütçe adresleri kendi üreticileriyle AYNI', () => {
    expect(bekleyenIsAdresi(is('strateji_onay'))).toBe(stratejiAdresi(WS, { bolum: 'sunum' }));
    expect(bekleyenIsAdresi(is('strateji_aktar'))).toBe(stratejiAdresi(WS, {}));
    expect(bekleyenIsAdresi(is('butce_yok'))).toBe(butceAdresi(WS));
    // Üretici sahte değil: gerçekten workspace’i taşıyor.
    expect(bekleyenIsAdresi(is('butce_yok'))).toContain(`musteri=${WS}`);
    expect(bekleyenIsAdresi(is('strateji_aktar'))).toContain(`musteri=${WS}`);
  });
});

describe('kesme ve kısmi hata', () => {
  it('KRİTİK: kesildiyse "50 / 73 gösteriliyor"', () => {
    const isler = Array.from({ length: 50 }, () => is('butce_yok'));
    expect(kesmeMetni(yanit({ isler, toplam: 73 }))).toBe('50 / 73 gösteriliyor');
  });
  it('kesilmediyse not yok', () => {
    expect(kesmeMetni(yanit({ isler: [is('butce_yok')], toplam: 1 }))).toBeNull();
  });
  it('kaynak hatası sunucunun cümlesiyle', () => {
    // Cümle sunucunun; panel önüne ikinci bir ad eklemiyor (tekrar üretiyordu).
    expect(kaynakHataMetni({ tur: 'boost_onay', mesaj: 'Akıllı Boost kuyruğu okunamadı' })).toBe('Akıllı Boost kuyruğu okunamadı');
  });
});

describe('Akıllı Boost rozeti — kutuyla aynı yanıttan', () => {
  it('workspace’lerin boost sayıları toplanıyor', () => {
    const r = boostRozeti(
      tamam(
        yanit({
          isler: [is('boost_onay', { sayi: 15 }), is('boost_onay', { sayi: 2, clientId: 'b' }), is('butce_yok', { sayi: 1 })],
          toplam: 3,
        }),
      ),
    );
    expect(r?.metin).toBe('17');
  });

  it('bekleyen yoksa rozet yok', () => {
    expect(boostRozeti(tamam(yanit({ isler: [is('butce_yok')], toplam: 1 })))).toBeNull();
  });

  it('KRİTİK: çağrı ya da boost kaynağı düştüyse "?" — rozetsiz düğme "yok" gibi okunurdu', () => {
    expect(boostRozeti({ durum: 'hata', mesaj: 'x' })?.metin).toBe('?');
    expect(boostRozeti(tamam(yanit({ hatalar: [{ tur: 'boost_onay', mesaj: 'x' }] })))?.metin).toBe('?');
  });

  it('KRİTİK: kesme boost satırlarının içinden geçtiyse sayı alt sınır ("+")', () => {
    const isler = Array.from({ length: 50 }, (_, i) => is('boost_onay', { sayi: 1, clientId: String(i) }));
    expect(boostRozeti(tamam(yanit({ isler, toplam: 60 })))?.metin).toBe('50+');
  });

  it('kesme boost’tan sonra geldiyse sayı kesin', () => {
    const isler = [is('boost_onay', { sayi: 4 }), ...Array.from({ length: 49 }, () => is('butce_yok'))];
    expect(boostRozeti(tamam(yanit({ isler, toplam: 70 })))?.metin).toBe('4');
  });
});
