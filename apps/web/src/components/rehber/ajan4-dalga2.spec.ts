import { describe, expect, it } from 'vitest';
import { rehberAlanlariSchema, type GorselOrani } from '@advetics/shared';
import { setGorunumu, yuklemeHedefi, yuvayaEkle, type MedyaOgesi } from './rehber-mantik';

/**
 * AJAN 4 (Dalga 2) B3 — "Yeni set"e ÇOK DOSYA bırakmak.
 *
 * `adim-reklam.tsx#yukle` hedef seti dosya BAŞINA hesaplıyordu: ilk dosya
 * yeni seti açınca ikincisi bir sonraki sete gidiyor, dört set varken
 * `setNo: 6` alıp kaydı şemada düşürüyordu. Hedef artık yükleme başına bir
 * kez (`yuklemeHedefi`) ve `yuvayaEkle` sınırın ötesine numara vermiyor.
 * Döngü bileşenin içinde (render testi yok); burada bileşenin satırları
 * birebir taklit ediliyor.
 */
function yukleTaklidi(medya: MedyaOgesi[], oranlar: Map<string, GorselOrani | null>, dosyalar: Array<[string, GorselOrani]>, hedef: number | null) {
  let simdiki = [...medya];
  const yerel = new Map(oranlar);
  // adim-reklam.tsx: const sira = yuklemeHedefi(medya, oranlar, hedef);
  const sira = yuklemeHedefi(medya, oranlar, hedef);
  for (const [id, oran] of dosyalar) {
    yerel.set(id, oran);
    simdiki = sira === undefined ? [...simdiki, { varlikId: id }] : yuvayaEkle(simdiki, yerel, { varlikId: id }, sira);
  }
  return { simdiki, yerel };
}
// GERÇEK UUID: şema kimliği denetliyor. Bu testin ilk sürümü 'k1' gibi
// kimliklerle "6 numara kaydı düşürüyor" diyordu; kayıt aslında kimlik
// yüzünden düşüyordu ve iddia sebebe çapalı değildi.
const U = (ad: string) => `00000000-0000-4000-8000-${Buffer.from(ad).toString('hex').padStart(12, '0')}`;
const kayitGecerli = (medya: MedyaOgesi[]) =>
  rehberAlanlariSchema.safeParse({ medya: { deger: medya, kaynak: 'kullanici', kim: '00000000-0000-4000-8000-000000000000', zaman: new Date().toISOString() } }).success;

describe('B3: Yeni set hedefine çok dosya', () => {
  const dortSet: MedyaOgesi[] = [1, 2, 3, 4].map((n) => ({ varlikId: U(`k${n}`), setNo: n }));
  const oranlar = new Map<string, GorselOrani | null>(dortSet.map((m) => [m.varlikId, 'kare']));

  it('KRİTİK: dört set varken iki boyut bırakılınca TEK yeni set olur ve kayıt şemadan geçer', () => {
    const { simdiki, yerel } = yukleTaklidi(dortSet, oranlar, [[U('d'), 'dikey'], [U('y'), 'yatay']], null);
    expect(kayitGecerli(simdiki)).toBe(true);
    expect(setGorunumu(simdiki, yerel).setler).toHaveLength(5);
  });

  it('KRİTİK: aynı tasarımın iki boyutu Yeni set’e bırakılınca İKİSİ AYNI sette', () => {
    const { simdiki, yerel } = yukleTaklidi([{ varlikId: U('k1'), setNo: 1 }], new Map<string, GorselOrani | null>([[U('k1'), 'kare']]), [[U('d'), 'dikey'], [U('y'), 'yatay']], null);
    expect(setGorunumu(simdiki, yerel).setler).toHaveLength(2);
  });

  it('sınırda (beş set) Yeni set numara vermez; yuvayaEkle 6 yazmaz', () => {
    const bes = [...dortSet, { varlikId: U('k5'), setNo: 5 }];
    const o = new Map(oranlar).set(U('k5'), 'kare');
    expect(yuklemeHedefi(bes, o, null)).toBeUndefined();
    const r = yuvayaEkle(bes, new Map(o).set(U('z'), 'dikey'), { varlikId: U('z') }, 5);
    expect(r.find((m) => m.varlikId === U('z'))?.setNo).toBeUndefined();
    expect(kayitGecerli([...bes, { varlikId: U('z'), setNo: 6 }])).toBe(false);
    expect(kayitGecerli(r)).toBe(true);
  });
});
