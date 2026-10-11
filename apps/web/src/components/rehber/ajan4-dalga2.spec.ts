import { describe, expect, it } from 'vitest';
import { rehberAlanlariSchema, type GorselOrani } from '@advetics/shared';
import { setGorunumu, yuvayaEkle, type MedyaOgesi } from './rehber-mantik';

/**
 * AJAN 4 (Dalga 2) BULGUSU — "Yeni set"e ÇOK DOSYA bırakmak.
 *
 * `adim-reklam.tsx#yukle` hedef `null` (Yeni set) iken HER DOSYA için
 * `sira = setGorunumu(simdiki).setler.length` hesaplıyor. İlk dosya yeni
 * seti açtıktan sonra sayı bir artıyor, yani ikinci dosya BİR SONRAKİ yeni
 * sete gidiyor: aynı tasarımın iki boyutu iki ayrı reklam oluyor. Dört set
 * varken iki dosya bırakılırsa ikincisi `setNo: 6` alıyor ve şema (en çok 5)
 * kaydı REDDEDİYOR.
 *
 * Döngü bileşenin içinde (render testi yok); burada bileşenin satırları
 * birebir taklit ediliyor. `it.fails`: düzeltme gelince bu test KIRMIZIYA
 * döner ve `.fails` kaldırılmalı.
 */
function yukleTaklidi(medya: MedyaOgesi[], oranlar: Map<string, GorselOrani | null>, dosyalar: Array<[string, GorselOrani]>, hedef: number | null) {
  let simdiki = [...medya];
  const yerel = new Map(oranlar);
  for (const [id, oran] of dosyalar) {
    yerel.set(id, oran);
    // adim-reklam.tsx: const sira = hedef === null ? setGorunumu(simdiki, yerelOran).setler.length : hedef;
    const sira = hedef === null ? setGorunumu(simdiki, yerel).setler.length : hedef;
    simdiki = yuvayaEkle(simdiki, yerel, { varlikId: id }, sira);
  }
  return { simdiki, yerel };
}

describe('BULGU: Yeni set hedefine çok dosya', () => {
  const dortSet: MedyaOgesi[] = [1, 2, 3, 4].map((n) => ({ varlikId: `k${n}`, setNo: n }));
  const oranlar = new Map<string, GorselOrani | null>(dortSet.map((m) => [m.varlikId, 'kare']));

  it('BUGÜNKÜ DAVRANIŞ (kanıt): ikinci dosya setNo 6 alıyor ve şema kaydı reddediyor', () => {
    const { simdiki } = yukleTaklidi(dortSet, oranlar, [['d', 'dikey'], ['y', 'yatay']], null);
    expect(simdiki.find((m) => m.varlikId === 'y')?.setNo).toBe(6);
    const zaman = new Date().toISOString();
    const r = rehberAlanlariSchema.safeParse({ medya: { deger: simdiki, kaynak: 'kullanici', kim: '00000000-0000-4000-8000-000000000000', zaman } });
    expect(r.success).toBe(false);
  });

  it.fails('dört set varken iki boyut bırakılınca TEK yeni set olmalı ve kayıt şemadan geçmeli', () => {
    const { simdiki, yerel } = yukleTaklidi(dortSet, oranlar, [['d', 'dikey'], ['y', 'yatay']], null);
    const zaman = new Date().toISOString();
    const r = rehberAlanlariSchema.safeParse({ medya: { deger: simdiki, kaynak: 'kullanici', kim: '00000000-0000-4000-8000-000000000000', zaman } });
    expect(r.success).toBe(true);
    expect(setGorunumu(simdiki, yerel).setler).toHaveLength(5);
  });

  it.fails('tek set varken aynı tasarımın iki boyutu Yeni set’e bırakılınca İKİSİ AYNI sette olmalı', () => {
    const { simdiki, yerel } = yukleTaklidi([{ varlikId: 'k1', setNo: 1 }], new Map<string, GorselOrani | null>([['k1', 'kare']]), [['d', 'dikey'], ['y', 'yatay']], null);
    expect(setGorunumu(simdiki, yerel).setler).toHaveLength(2);
  });
});
