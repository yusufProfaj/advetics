import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RehberPikselListesi } from '@advetics/shared';
import { medyaKabulu, pikselDurumu, pikselListesiHali, satissizOnayGorunur, tekPikselOnerisi, whatsappOnerisi } from './meta-dalga3-mantik';

const p = (id: string, ek: Partial<RehberPikselListesi['satirlar'][number]> = {}) => ({
  id, ad: `P${id}`, sonCalisma: '2026-10-10T09:00:00.000Z', kullanilamaz: false, satinAlma7Gun: true as boolean | null, ...ek,
});
const liste = (...satirlar: ReturnType<typeof p>[]): RehberPikselListesi => ({ satirlar, toplam: satirlar.length, kesildi: false, bosNeden: satirlar.length ? null : 'Hesapta piksel yok.' });

describe('piksel seçici kararları', () => {
  it('boş liste sunucunun nedeniyle; dolu liste geldi', () => {
    expect(pikselListesiHali(liste())).toEqual({ tur: 'bos', neden: 'Hesapta piksel yok.' });
    expect(pikselListesiHali(liste(p('1'))).tur).toBe('geldi');
  });

  it('KRİTİK: yalnız TEK piksel ve seçim yokken öneri; birden çoksa kullanıcı seçer', () => {
    expect(tekPikselOnerisi(null, liste(p('1')))).toBe('1');
    expect(tekPikselOnerisi('1', liste(p('1')))).toBeNull();
    expect(tekPikselOnerisi(null, liste(p('1'), p('2')))).toBeNull();
    expect(tekPikselOnerisi(null, liste(p('1', { kullanilamaz: true })))).toBeNull();
  });

  it('durum metni üç hâli ayırıyor', () => {
    expect(pikselDurumu(p('1'))).toBe('Son 7 günde satın alma saydı');
    expect(pikselDurumu(p('1', { satinAlma7GunSayisi: 12 }))).toBe('Son 7 günde 12 satın alma');
    expect(pikselDurumu(p('1', { satinAlma7Gun: false }))).toBe('Son 7 günde satın alma yok');
    expect(pikselDurumu(p('1', { satinAlma7Gun: null }))).toBe('Satın alma kontrol edilemedi');
    expect(pikselDurumu(p('1', { sonCalisma: null }))).toBe('Hiç çalışmamış');
  });
});

describe('WhatsApp önerisi ve medya kabulü', () => {
  it('KRİTİK: Marka Merkezi telefonu E.164’e çevrilir; çözülemeyen biçim önerilmez', () => {
    expect(whatsappOnerisi('0532 123 45 67')).toBe('+905321234567');
    expect(whatsappOnerisi('+90 532 123 45 67')).toBe('+905321234567');
    expect(whatsappOnerisi('5321234567')).toBe('+905321234567');
    expect(whatsappOnerisi('+44 20 7123 4567')).toBeNull();
    expect(whatsappOnerisi(null)).toBeNull();
  });

  it('KRİTİK: Meta video amacında dosya seçici yalnız video kabul ediyor', () => {
    expect(medyaKabulu(true)).not.toContain('image/');
    expect(medyaKabulu(false)).toContain('image/jpeg');
    const k = readFileSync(join(__dirname, 'adim-reklam.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toContain('accept={medyaKabulu(video)}');
  });

  it('KRİTİK: piksel seçici satış amacında Nerede adımına bağlı', () => {
    const k = readFileSync(join(__dirname, 'adim-amac-nerede.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toContain("{b.acik.meta && amac === 'SATIS' && <PikselSecici b={b} />}");
    const r = readFileSync(join(__dirname, 'meta-dalga3.tsx'), 'utf8');
    expect(r).toContain('/reklam/rehber/pikseller?clientId=');
    // Hata yutulmuyor: dört hâl (CLAUDE.md `.catch(() => setX([]))` yasağı).
    expect(r).toContain('.catch((e: unknown) => !iptal && setHal(oneriHatasi(e)))');
  });
});

describe('satışsız piksel onayı', () => {
  it('KRİTİK: kutu onay engelinde ve verilmiş onayda görünür, başka eksikte görünmez', () => {
    expect(satissizOnayGorunur([{ kod: 'M-PIKSEL' }])).toBe(true);
    expect(satissizOnayGorunur([{ kod: 'M-PIKSEL-ONAYLI' }])).toBe(true);
    expect(satissizOnayGorunur([{ kod: 'M-PIKSEL-SATIS-BILINMIYOR' }, { kod: 'M-PIKSEL-SESSIZ' }])).toBe(false);
  });

  it('kutu onayı SEÇİLİ piksele yazıyor ve kaldırınca SİLİYOR (kaynak taraması)', () => {
    const k = readFileSync(join(__dirname, 'meta-dalga3.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toMatch(/yaz\(b, 'satissizPikselOnayi', \{ pikselId: secili \}\)/);
    expect(k).toMatch(/sil\(b, 'satissizPikselOnayi'\)/);
    expect(k).toContain('{SATISSIZ_PIKSEL_ONAY_METNI}');
  });
});
