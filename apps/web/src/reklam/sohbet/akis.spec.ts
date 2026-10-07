import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SohbetOlayi } from '@advetics/shared';
import { aracIzleri, bekleyenSoru, olayUygula, olaylariAyikla, sureMetni, type EkranMesaji } from './akis';

/** AdvCampaign akışının saf tarafı (İP-16): ayrıştırma ve ekran durumu. */

const sse = (e: SohbetOlayi) => `event: ${e.tur}\ndata: ${JSON.stringify(e)}\n\n`;

describe('olaylariAyikla', () => {
  it('KRİTİK: parçalanmış olay bir sonraki parçayı bekler, kaybolmaz', () => {
    const tam = sse({ tur: 'metin', parca: 'Merhaba' }) + sse({ tur: 'metin', parca: ' dünya' });
    const bolum = 30;
    const a = olaylariAyikla(tam.slice(0, bolum));
    const b = olaylariAyikla(a.kalan + tam.slice(bolum));
    expect([...a.olaylar, ...b.olaylar]).toEqual([
      { tur: 'metin', parca: 'Merhaba' },
      { tur: 'metin', parca: ' dünya' },
    ]);
    expect(b.kalan).toBe('');
  });

  it('bozuk JSON sessizce atılmaz, SAYILIR', () => {
    expect(olaylariAyikla('data: {bozuk\n\n')).toMatchObject({ olaylar: [], bozuk: 1 });
  });
});

describe('olayUygula', () => {
  const bas: EkranMesaji[] = [{ id: 'k', sira: 1, rol: 'kullanici', metin: 'selam', olaylar: [], durum: 'tamam' }];
  const uygula = (olaylar: SohbetOlayi[]) => olaylar.reduce(olayUygula, bas);

  it('mesaj başlar, metin birikir, bitti durumu kapatır', () => {
    const m = uygula([
      { tur: 'mesaj_basladi', mesajId: 'a', sira: 2 },
      { tur: 'metin', parca: 'Mer' },
      { tur: 'metin', parca: 'haba' },
      { tur: 'bitti', durum: 'tamam', girdiToken: 1, ciktiToken: 1 },
    ]);
    expect(m.at(-1)).toMatchObject({ id: 'a', metin: 'Merhaba', durum: 'tamam' });
    // Metin parçaları olay listesini şişirmez.
    expect(m.at(-1)!.olaylar.map((e) => e.tur)).toEqual(['bitti']);
  });

  it('KRİTİK: "bitti" gelmezse mesaj "akista" kalır (koptu ≠ tamam)', () => {
    const m = uygula([{ tur: 'mesaj_basladi', mesajId: 'a', sira: 2 }, { tur: 'metin', parca: 'yarım' }]);
    expect(m.at(-1)!.durum).toBe('akista');
  });

  it('KRİTİK: tur açılmadan gelen hata (kota) kaybolmaz, ayrı satır olur', () => {
    const m = uygula([{ tur: 'hata', hata: 'kota', mesaj: 'Sınır doldu' }]);
    expect(m.at(-1)).toMatchObject({ rol: 'asistan', durum: 'hata', olaylar: [{ tur: 'hata', hata: 'kota' }] });
  });

  it('araç izi: başlayan ama bitmeyen "sürüyor"; bitince hâl ve süre', () => {
    const z = aracIzleri([
      { tur: 'arac_basladi', arac: 'hazirlik_oku', adim: 1 },
      { tur: 'arac_bitti', arac: 'hazirlik_oku', adim: 1, hal: 'tamam', sureMs: 1200 },
      { tur: 'arac_basladi', arac: 'konum_ara', adim: 2 },
    ]);
    expect(z).toEqual([
      { arac: 'hazirlik_oku', adim: 1, hal: 'tamam', sureMs: 1200 },
      { arac: 'konum_ara', adim: 2, hal: 'suruyor', sureMs: null },
    ]);
    expect(sureMetni(1200)).toBe('1,2 sn');
  });

  it('bekleyen soru yalnız SON ve TAMAMLANMIŞ asistan mesajında', () => {
    const soru = { alan: 'butce', metin: 'Ne kadar?', secenekler: [], serbest: true, sira: 1 } as const;
    const m = uygula([{ tur: 'mesaj_basladi', mesajId: 'a', sira: 2 }, { tur: 'soru', soru }, { tur: 'bitti', durum: 'tamam', girdiToken: 0, ciktiToken: 0 }]);
    expect(bekleyenSoru(m)).toEqual(soru);
    // Akış sürerken soru çipleri gösterilmez: model hâlâ yazıyor olabilir.
    expect(bekleyenSoru(uygula([{ tur: 'mesaj_basladi', mesajId: 'a', sira: 2 }, { tur: 'soru', soru }]))).toBeNull();
    // Kullanıcı cevapladıysa soru kalkar.
    expect(bekleyenSoru([...m, { id: 'k2', sira: 3, rol: 'kullanici', metin: '300', olaylar: [], durum: 'tamam' }])).toBeNull();
  });
});

describe('ekran kaynağı', () => {
  const KAYNAK = readFileSync(join(__dirname, 'sohbet-ekrani.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('tarama gerçekten bileşeni okudu', () => {
    expect(KAYNAK).toContain('export function SohbetEkrani');
  });

  it('KRİTİK: hata boş listeye çevrilmiyor (.catch(() => set…([])) yasak)', () => {
    expect(KAYNAK).not.toMatch(/\.catch\(\(\)\s*=>\s*set\w+\(\[\]\)\)/);
  });

  it('KRİTİK: akış kopunca durum SORULUYOR (koptu hâli sessizce beklemiyor)', () => {
    const i = KAYNAK.indexOf("if (akis !== 'koptu' || !oturumId) return;");
    expect(i).toBeGreaterThan(0);
    expect(KAYNAK.slice(i, KAYNAK.indexOf('}, [akis', i))).toContain('mesajlariOku(oturumId)');
  });

  it('listeler "N / toplam" yazıyor (sessiz kesme yok)', () => {
    expect(KAYNAK).toContain('{oturumlar.satirlar.length} / {oturumlar.toplam}');
    expect(KAYNAK).toContain('{hazirlik.gorseller.satirlar.length} / {hazirlik.gorseller.toplam}');
  });
});
