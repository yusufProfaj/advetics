import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SohbetOlayi, Soru } from '@advetics/shared';
import { aracIzleri, bekleyenSoru, hazirIcerik, hazirKonacakMi, olayUygula, olaylariAyikla, sureMetni, yanitGuncelMi, type EkranMesaji } from './akis';

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
    const soru: Soru = { alan: 'butce', metin: 'Ne kadar?', secenekler: [], serbest: true, sira: 1 };
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

describe('AdvStrategy\'den gelen hazır içerik', () => {
  const gorsel = { id: 'g1', ad: 'kare.jpg', onizlemeAdresi: '/assets/g1/preview', genislik: 1080, yukseklik: 1080 };

  it('KRİTİK: mesajı olmayan oturumda metin ve görseller hazır', () => {
    expect(hazirIcerik({ hazirIstem: ' 2026-11 medya planından ', hazirMedyalar: ['g1'] }, 0, [gorsel])).toEqual({
      metin: '2026-11 medya planından',
      medyalar: [{ id: 'g1', ad: 'kare.jpg', onizlemeAdresi: '/assets/g1/preview', oran: '1080×1080', uyari: null }],
    });
  });

  it('KRİTİK: mesajı olan oturumda HİÇBİR ŞEY doldurulmuyor', () => {
    // Hazır metin gönderilmiş ya da kullanıcı bilerek değiştirmiş; yeniden
    // doldurmak aynı isteği ikinci kez gönderttirirdi.
    expect(hazirIcerik({ hazirIstem: 'x', hazirMedyalar: ['g1'] }, 1, [gorsel])).toBeNull();
  });

  it('aktarımla açılmamış oturum (alan yok ya da boş) dokunulmadan kalıyor', () => {
    expect(hazirIcerik({}, 0, [gorsel])).toBeNull();
    expect(hazirIcerik({ hazirIstem: '   ', hazirMedyalar: [] }, 0, [gorsel])).toBeNull();
    expect(hazirIcerik({ hazirIstem: null, hazirMedyalar: null }, 0, [])).toBeNull();
  });

  it('KRİTİK: listede olmayan görsel DÜŞMÜYOR, API\'nin önizleme adresiyle ekleniyor', () => {
    const r = hazirIcerik({ hazirIstem: 'x', hazirMedyalar: ['g1', 'g9', 'g9'] }, 0, [gorsel]);
    expect(r?.medyalar.map((m) => m.id)).toEqual(['g1', 'g9']);
    expect(r?.medyalar[1]).toMatchObject({ onizlemeAdresi: '/assets/g9/preview' });
  });
});

describe('sohbet ekranı hazır içeriği kullanıyor', () => {
  const kod = readFileSync(join(__dirname, 'sohbet-ekrani.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('KRİTİK: mesajlar okununca hazır içerik hesaplanıyor ve kullanıcının yazdığı EZİLMİYOR', () => {
    expect(kod).toContain('const hazir = hazirKonacakMi({');
    expect(kod).toContain("setMetin((m) => (m === '' ? hazir.metin : m))");
    expect(kod).toContain('setMedyalar((x) => (x.length === 0 ? hazir.medyalar : x))');
  });

  it('hazır içerik MESAJ OLARAK gönderilmiyor; üstte kaynağı yazıyor', () => {
    // `gonder(` yalnız kullanıcı eylemlerinde: form, Enter, soru seçeneği.
    expect(kod).not.toMatch(/gonder\(hazir/);
    expect(kod).toContain('baslik="AdvStrategy planından geldi"');
  });
});

describe('Ajan 4 bulgusu: hazır içerik bir kez ve yalnız seçili oturuma', () => {
  const gorsel = { id: 'g1', ad: 'kare.jpg', onizlemeAdresi: '/assets/g1/preview', genislik: 1080, yukseklik: 1080 };
  const oturum = { hazirIstem: 'plandan metin', hazirMedyalar: ['g1'] };
  const temel = { oturum, mesajSayisi: 0, gorseller: [gorsel] };

  it('KRİTİK (a): kullanıcı hazır metni silip kutuyu boş bıraksa da sonraki okuma GERİ KOYMUYOR', () => {
    const konanlar = new Set<string>();
    // İlk okuma: konuyor.
    const ilk = hazirKonacakMi({ ...temel, istenenOturumId: 'A', seciliOturumId: 'A', konanlar });
    expect(ilk?.metin).toBe('plandan metin');
    konanlar.add('A'); // ekran koyduğunda işaretliyor
    // Kullanıcı sildi; "Yeniden dene" / akış yoklaması / görsel listesi değişimi yeniden okuyor.
    for (let i = 0; i < 3; i++) {
      expect(hazirKonacakMi({ ...temel, istenenOturumId: 'A', seciliOturumId: 'A', konanlar })).toBeNull();
    }
  });

  it('KRİTİK (b): A\'nın yanıtı B seçiliyken gelirse hiçbir şey yazılmıyor', () => {
    expect(yanitGuncelMi('A', 'B')).toBe(false);
    expect(yanitGuncelMi('A', null)).toBe(false);
    expect(yanitGuncelMi('A', 'A')).toBe(true);
    expect(hazirKonacakMi({ ...temel, istenenOturumId: 'A', seciliOturumId: 'B', konanlar: new Set() })).toBeNull();
    // B'nin kendi yanıtı (B'de hazır içerik yoksa) da A'nınkini koymuyor.
    expect(hazirKonacakMi({ ...temel, oturum: {}, istenenOturumId: 'B', seciliOturumId: 'B', konanlar: new Set() })).toBeNull();
  });

  it('başka bir oturumun "konuldu" işareti bu oturumu engellemiyor', () => {
    expect(hazirKonacakMi({ ...temel, istenenOturumId: 'B', seciliOturumId: 'B', konanlar: new Set(['A']) })).not.toBeNull();
  });

  const kod = readFileSync(join(__dirname, 'sohbet-ekrani.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('KRİTİK: ekran bayat yanıtı yazmadan ÖNCE kesiyor ve konduğunu işaretliyor', () => {
    const i = kod.indexOf('const mesajlariOku = useCallback(');
    expect(i).toBeGreaterThan(-1);
    const govde = kod.slice(i, kod.indexOf('[taslakOku, hazirlik.gorseller.satirlar]', i));
    const kesme = govde.indexOf('if (!yanitGuncelMi(id, seciliRef.current)) return null;');
    expect(kesme).toBeGreaterThan(-1);
    expect(kesme).toBeLessThan(govde.indexOf('setMesajlar(r.mesajlar)'));
    expect(govde).toContain('konanlar: hazirKonanlar.current');
    expect(govde).toContain('seciliOturumId: seciliRef.current');
    expect(govde).toContain('hazirKonanlar.current.add(id)');
    // Hata da yalnız seçili oturumdaysa yazılıyor.
    expect(govde).toContain('if (yanitGuncelMi(id, seciliRef.current)) {');
  });

  it('KRİTİK: oturum seçimi yalnız ref ile birlikte güncelleniyor', () => {
    // `setOturumId` tek yerde (ref'i de güncelleyen yardımcının içinde).
    expect(kod.match(/setOturumId\(/g)?.length).toBe(1);
    expect(kod).toContain('seciliRef.current = id;\n    setOturumId(id);');
  });
});
