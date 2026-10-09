import { describe, expect, it, vi } from 'vitest';
import type { RehberGuncelle, RehberKaydi } from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import { RehberKaydedici, type Zamanlayici } from './rehber-kaydedici';

/**
 * KAYDEDİCİ — debounce, birleştirme, tek uçuş, 409 ve hata hâli.
 *
 * Zamanlayıcı elle sürülüyor (`saat.ilerle`): gerçek `setTimeout` testte
 * yarış üretir ve "600 ms içinde tek istek" iddiası kararsız olurdu.
 */
function saat() {
  let simdi = 0;
  const bekleyen: Array<{ kimlik: number; zaman: number; fn: () => void }> = [];
  let sayac = 0;
  const z: Zamanlayici = {
    kur: (fn, ms) => {
      bekleyen.push({ kimlik: ++sayac, zaman: simdi + ms, fn });
      return sayac;
    },
    iptal: (k) => {
      const i = bekleyen.findIndex((x) => x.kimlik === k);
      if (i !== -1) bekleyen.splice(i, 1);
    },
  };
  return {
    z,
    ilerle(ms: number) {
      simdi += ms;
      for (const x of [...bekleyen].sort((a, b) => a.zaman - b.zaman)) {
        if (x.zaman <= simdi) {
          bekleyen.splice(bekleyen.indexOf(x), 1);
          x.fn();
        }
      }
    },
    bekleyenSayisi: () => bekleyen.length,
  };
}

const kayit = (surum: number, alanlar: RehberKaydi['alanlar'] = {}): RehberKaydi => ({
  id: 'r1',
  clientId: 'c1',
  durum: 'taslak',
  surum,
  alanlar,
  eksikler: [],
  kararlar: [],
  metaTaslakId: null,
  googleTaslakId: null,
  icerikOzeti: 'x'.repeat(64),
  updatedAt: '2026-10-10T10:00:00Z',
});

/** Promise zincirinin bitmesini bekler (mikro görevler). */
const akit = () => new Promise((r) => setTimeout(r, 0));

function kur(gonder: (g: RehberGuncelle) => Promise<RehberKaydi>) {
  const sa = saat();
  const k = new RehberKaydedici(kayit(3), gonder, { gecikme: 600, zamanlayici: sa.z });
  return { k, sa };
}

describe('debounce ve birleştirme', () => {
  it('KRİTİK: 600 ms dolmadan istek gitmez; aynı alanın ardışık değişikliği TEK satır olarak gider', async () => {
    const gonder = vi.fn(async (g: RehberGuncelle) => kayit(g.surum + 1));
    const { k, sa } = kur(gonder);
    k.degistir([{ alan: 'hedefAdres', deger: 'https://a', kaynak: 'kullanici' }]);
    sa.ilerle(300);
    k.degistir([{ alan: 'hedefAdres', deger: 'https://ab', kaynak: 'kullanici' }]);
    k.degistir([{ alan: 'telefon', deger: '+905551112233', kaynak: 'kullanici' }]);
    sa.ilerle(599);
    expect(gonder).not.toHaveBeenCalled();
    expect(k.durum().hal.tur).toBe('bekliyor');
    sa.ilerle(1);
    await akit();
    expect(gonder).toHaveBeenCalledTimes(1);
    expect(gonder.mock.calls[0]![0]).toEqual({
      surum: 3,
      degisiklikler: [
        { alan: 'hedefAdres', deger: 'https://ab', kaynak: 'kullanici' },
        { alan: 'telefon', deger: '+905551112233', kaynak: 'kullanici' },
      ],
    });
    expect(k.durum().hal.tur).toBe('kaydedildi');
    expect(k.durum().kayit.surum).toBe(4);
    expect(k.durum().bekleyen).toEqual([]);
  });

  it('KRİTİK: uçuş sürerken gelen değişiklik İKİNCİ bir eşzamanlı istek açmaz ve yeni sürümle gider', async () => {
    let coz!: (k: RehberKaydi) => void;
    const gonder = vi.fn((g: RehberGuncelle) =>
      g.surum === 3 ? new Promise<RehberKaydi>((r) => (coz = r)) : Promise.resolve(kayit(g.surum + 1)),
    );
    const { k, sa } = kur(gonder);
    k.degistir([{ alan: 'amac', deger: 'SITE', kaynak: 'kullanici' }]);
    sa.ilerle(600);
    await akit();
    k.degistir([{ alan: 'metaPayiYuzde', deger: 60, kaynak: 'kullanici' }]);
    sa.ilerle(600); // zamanlayıcı doldu ama ilk istek hâlâ uçuşta
    await akit();
    expect(gonder).toHaveBeenCalledTimes(1);
    // Ekran uçuştaki ve sıradaki değişikliği birlikte gösteriyor.
    expect(k.durum().bekleyen.map((d) => d.alan)).toEqual(['amac', 'metaPayiYuzde']);
    coz(kayit(4));
    await akit();
    expect(gonder).toHaveBeenCalledTimes(2);
    expect(gonder.mock.calls[1]![0].surum).toBe(4);
    expect(k.durum().kayit.surum).toBe(5);
    expect(k.durum().hal.tur).toBe('kaydedildi');
  });

  it("30'dan fazla değişiklik sözleşme sınırına göre parçalanıp SIRAYLA gider (tek uçuş)", async () => {
    const gonder = vi.fn(async (g: RehberGuncelle) => kayit(g.surum + 1));
    const { k } = kur(gonder);
    // Sözleşmede 21 alan var; sınırı ölçmek için kaydedicinin bakmadığı
    // sahte adlar kullanılıyor (alan adını sunucu doğruluyor).
    k.degistir(Array.from({ length: 35 }, (_, i) => ({ alan: `a${i}` as never, deger: i, kaynak: 'kullanici' as const })));
    await expect(k.simdi()).resolves.toBe(true);
    expect(gonder).toHaveBeenCalledTimes(2);
    expect(gonder.mock.calls[0]![0].degisiklikler).toHaveLength(30);
    expect(gonder.mock.calls[1]![0]).toMatchObject({ surum: 4 });
    expect(gonder.mock.calls[1]![0].degisiklikler).toHaveLength(5);
  });
});

describe('silme ve null değer', () => {
  it('KRİTİK: `sil: true` sunucuya aynen gider; null DEĞER `sil` taşımaz; silme sonra yazılırsa yazma kazanır', async () => {
    const gonder = vi.fn(async (g: RehberGuncelle) => kayit(g.surum + 1));
    const { k } = kur(gonder);
    k.degistir([{ alan: 'telefon', deger: null, kaynak: 'kullanici', sil: true }]);
    k.degistir([{ alan: 'instagramId', deger: null, kaynak: 'kullanici' }]);
    k.degistir([{ alan: 'hedefAdres', deger: null, kaynak: 'kullanici', sil: true }]);
    k.degistir([{ alan: 'hedefAdres', deger: 'https://a.com', kaynak: 'kullanici' }]);
    await k.simdi();
    expect(gonder.mock.calls[0]![0].degisiklikler).toEqual([
      { alan: 'telefon', deger: null, kaynak: 'kullanici', sil: true },
      { alan: 'instagramId', deger: null, kaynak: 'kullanici' },
      { alan: 'hedefAdres', deger: 'https://a.com', kaynak: 'kullanici' },
    ]);
  });
});

describe('409 ve hata', () => {
  it('KRİTİK: 409 → "catisma"; bekleyenler GÖNDERİLMEZ ve sonraki değişiklikler de gitmez', async () => {
    const gonder = vi.fn(async () => {
      throw new ApiRequestError('Sürüm eski', 409, 'CONFLICT');
    });
    const { k, sa } = kur(gonder);
    k.degistir([{ alan: 'amac', deger: 'SITE', kaynak: 'kullanici' }]);
    sa.ilerle(600);
    await akit();
    expect(k.durum().hal).toEqual({ tur: 'catisma' });
    k.degistir([{ alan: 'telefon', deger: '+905551112233', kaynak: 'kullanici' }]);
    sa.ilerle(5000);
    await akit();
    expect(gonder).toHaveBeenCalledTimes(1);
    expect(sa.bekleyenSayisi()).toBe(0);
    // Kullanıcının yazdığı ekranda kalıyor (yenileyene kadar kayıtsız olduğu yazılı).
    expect(k.durum().bekleyen.map((d) => d.alan)).toEqual(['amac', 'telefon']);
    await expect(k.simdi()).resolves.toBe(false);
  });

  it('KRİTİK: başka bir hata kuyruğu SİLMEZ; düşen değişiklik yenisinin altına girer ve tekrar denemede birlikte gider', async () => {
    let kez = 0;
    const gonder = vi.fn(async (g: RehberGuncelle) => {
      kez++;
      if (kez === 1) throw new ApiRequestError('Sunucu hatası', 500, 'INTERNAL');
      return kayit(g.surum + 1);
    });
    const { k, sa } = kur(gonder);
    k.degistir([
      { alan: 'hedefAdres', deger: 'https://eski', kaynak: 'kullanici' },
      { alan: 'amac', deger: 'SITE', kaynak: 'kullanici' },
    ]);
    sa.ilerle(600);
    await akit();
    expect(k.durum().hal).toEqual({ tur: 'hata', mesaj: 'Sunucu hatası' });
    k.degistir([{ alan: 'hedefAdres', deger: 'https://yeni', kaynak: 'kullanici' }]);
    sa.ilerle(600);
    await akit();
    expect(gonder).toHaveBeenCalledTimes(2);
    expect(gonder.mock.calls[1]![0].degisiklikler).toEqual([
      { alan: 'hedefAdres', deger: 'https://yeni', kaynak: 'kullanici' },
      { alan: 'amac', deger: 'SITE', kaynak: 'kullanici' },
    ]);
    expect(k.durum().hal.tur).toBe('kaydedildi');
  });

  it('simdi(): zamanlayıcıyı beklemeden yazar ve sonucu döndürür (prova öncesi)', async () => {
    const gonder = vi.fn(async (g: RehberGuncelle) => kayit(g.surum + 1));
    const { k, sa } = kur(gonder);
    k.degistir([{ alan: 'amac', deger: 'SITE', kaynak: 'kullanici' }]);
    await expect(k.simdi()).resolves.toBe(true);
    expect(gonder).toHaveBeenCalledTimes(1);
    expect(sa.bekleyenSayisi()).toBe(0);
    // Bekleyen yokken hemen true.
    await expect(k.simdi()).resolves.toBe(true);
    expect(gonder).toHaveBeenCalledTimes(1);
  });

  it('disaridan(): başka uçtan gelen yeni sürüm alınır, eski sürüm reddedilir', async () => {
    const gonder = vi.fn(async (g: RehberGuncelle) => kayit(g.surum + 1));
    const { k } = kur(gonder);
    k.disaridan(kayit(7));
    expect(k.durum().kayit.surum).toBe(7);
    k.disaridan(kayit(5));
    expect(k.durum().kayit.surum).toBe(7);
    k.degistir([{ alan: 'amac', deger: 'SITE', kaynak: 'kullanici' }]);
    await k.simdi();
    expect(gonder.mock.calls[0]![0].surum).toBe(7);
  });

  it('durum() değişiklik yokken AYNI nesne (useSyncExternalStore sonsuz döngüye girmesin)', () => {
    const { k } = kur(async (g) => kayit(g.surum + 1));
    expect(k.durum()).toBe(k.durum());
    const once = k.durum();
    k.degistir([{ alan: 'amac', deger: 'SITE', kaynak: 'kullanici' }]);
    expect(k.durum()).not.toBe(once);
  });
});
