import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rehberAlanlariSchema, type GorselOrani, type MetinOnerisi } from '@advetics/shared';
import {
  fikirMetinDurumu,
  fikirMetniYaz,
  metinKutusu,
  oneridenFikirMetni,
  ortakMetinBos,
  otomatikMetinHedefleri,
  setGorunumu,
  setOgeleri,
  tekrarEtmeListesi,
  type MedyaOgesi,
} from './rehber-mantik';

/**
 * GÖRSELE ÖZEL METİN (Dalga 2) — panel mantığı ve kaynak bekçileri.
 * Bileşen render testi yok (`vitest.config.ts`); karar fonksiyonları
 * çalıştırılarak, bağlantıları kaynak taramasıyla sınanıyor.
 */
const U = (ad: string) => `00000000-0000-4000-8000-${Buffer.from(ad).toString('hex').padStart(12, '0')}`;
const oneri = (ek: Partial<MetinOnerisi> = {}): MetinOnerisi => ({
  anaMetin: 'Yazlık koleksiyon mağazada.',
  basliklar: Array.from({ length: 12 }, (_, i) => `Başlık ${i + 1}`),
  aciklamalar: ['A1', 'A2', 'A3', 'A4'],
  gorunenYol: [],
  aciklamaMetinleri: [],
  notlar: [],
  onbellekten: false,
  gorselSayisi: 1,
  ...ek,
});
const kural = { baslikEnCok: 5, aciklamaEnCok: 1 };

describe('fikir metni', () => {
  const oranlar = new Map<string, GorselOrani | null>([
    [U('k'), 'kare'],
    [U('d'), 'dikey'],
    [U('u'), 'dik45'],
  ]);

  it('KRİTİK: sahip kullanıcının yüklediği görsel; üretilen kare sahip olmaz', () => {
    const medya: MedyaOgesi[] = [{ varlikId: U('d') }, { varlikId: U('k'), uretildi: true, kaynakVarlikId: U('d') }];
    const g = setGorunumu(medya, oranlar, 'SITE');
    const d = fikirMetinDurumu(setOgeleri(g.setler[0]!));
    expect(d.sahipId).toBe(U('d'));
    expect(d.metin).toBeNull();
  });

  it('KRİTİK: yazım TEK kopya bırakır; öbür görseldeki eski metin silinir', () => {
    const medya: MedyaOgesi[] = [
      { varlikId: U('d'), metin: { anaMetin: 'eski', kaynak: 'kullanici' } },
      { varlikId: U('k'), metin: { anaMetin: 'başka', kaynak: 'derleyici' } },
    ];
    const yeni = fikirMetniYaz(medya, [U('d'), U('k')], U('d'), { anaMetin: 'yeni', kaynak: 'kullanici' });
    expect(yeni.find((x) => x.varlikId === U('d'))!.metin!.anaMetin).toBe('yeni');
    expect(yeni.find((x) => x.varlikId === U('k'))!.metin).toBeUndefined();
    // "Ortak metni kullan" alanı tamamen siler (null DEĞİL: şema null kabul etmiyor).
    const geri = fikirMetniYaz(yeni, [U('d'), U('k')], U('d'), null);
    expect(geri.every((x) => !('metin' in x))).toBe(true);
    expect(rehberAlanlariSchema.safeParse({ medya: { deger: geri, kaynak: 'kullanici', kim: null, zaman: '2026-10-12T10:00:00Z' } }).success).toBe(true);
  });

  it('KRİTİK: otomatik istek yeni görselin fikrine TEK; metni olan fikre hiç', () => {
    const medya: MedyaOgesi[] = [
      { varlikId: U('d') },
      { varlikId: U('k'), uretildi: true, kaynakVarlikId: U('d') },
      { varlikId: U('u'), setNo: 2, metin: { anaMetin: 'var', kaynak: 'kullanici' } },
    ];
    const g = setGorunumu(medya, oranlar, 'SITE');
    const fikirler = g.setler.map(setOgeleri);
    // İki görsel (asıl + üretilen) aynı sette: tek istek.
    expect(otomatikMetinHedefleri(fikirler, new Set([U('d'), U('k')]))).toEqual([U('d')]);
    // Metni olan fikir yeni boyut eklendi diye ezilmez.
    expect(otomatikMetinHedefleri(fikirler, new Set([U('u')]))).toEqual([]);
  });

  it('öneri → fikir metni: derleyici kaynağı ve sınıra sığdırma', () => {
    const f = oneridenFikirMetni(oneri(), kural);
    expect(f.kaynak).toBe('derleyici');
    expect(f.basliklar).toHaveLength(5);
    expect(f.aciklamalar).toEqual(['A1']);
  });

  it('tekrar etme listesi ve ortak metin boşluğu', () => {
    expect(tekrarEtmeListesi(null)).toEqual([]);
    expect(tekrarEtmeListesi(oneri({ basliklar: ['X', ' '] }))).toEqual(['Yazlık koleksiyon mağazada.', 'X']);
    expect(ortakMetinBos(undefined)).toBe(true);
    expect(ortakMetinBos({ anaMetin: ' ', basliklar: [''], aciklamalar: [] })).toBe(true);
    expect(ortakMetinBos({ anaMetin: '', basliklar: ['Var'], aciklamalar: [] })).toBe(false);
  });

  it('KRİTİK: metin kutusu görünen yolu düşürmez (her başlık yazımı ondan geçiyor)', () => {
    expect(metinKutusu({ anaMetin: '', basliklar: [], aciklamalar: [], gorunenYol: ['kahve'] }, { baslikKutu: 3, aciklamaKutu: 2 }).gorunenYol).toEqual(['kahve']);
  });
});

const yorumsuz = (f: string) =>
  readFileSync(join(__dirname, f), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Fonksiyon gövdesi süslü parantez sayılarak (sabit dilim komşuyu yakalar). */
function govde(kaynak: string, bas: string): string {
  const i = kaynak.indexOf(bas);
  if (i < 0) throw new Error(`gövde bulunamadı: ${bas}`);
  const a = kaynak.indexOf('{', kaynak.indexOf(')', i));
  let d = 0;
  for (let j = a; j < kaynak.length; j++) {
    if (kaynak[j] === '{') d++;
    else if (kaynak[j] === '}' && --d === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error(`gövde kapanmadı: ${bas}`);
}

describe('kaynak: görsel bırakılınca metin', () => {
  const r = yorumsuz('adim-reklam.tsx');

  it('KRİTİK: yükleme bitince otomatik metin isteniyor (Dalga 2 tetiği)', () => {
    expect(govde(r, 'async function yukle(')).toContain('await otomatikMetin(u.medya, yerelOran, eklenen)');
    expect(govde(r, 'function varlikDegistir(')).toContain('otomatikMetin(u.medya');
  });

  it('KRİTİK: görsel isteği varlık kimliğiyle gidiyor, yazım SON listeye', () => {
    const g = govde(r, 'async function gorseleMetinYaz(');
    expect(g).toContain('{ varlikId: sahipId, mod }');
    expect(g).toContain('fikirMetniYaz(sonMedya.current, idler, sahipId, fm)');
    // Ortak metin yalnız BOŞSA ve `derleyici` kaynağıyla.
    expect(g).toMatch(/if \(ortakMetinBos\(sonMetin\.current\)\)[\s\S]*kaynak: 'derleyici'/);
    expect(g).toContain("await kaydet()");
  });

  it('KRİTİK: ortak öneri gövdesi boş değil; mod ve tekrar listesi taşıyor', () => {
    const g = govde(r, 'async function oner(mod');
    expect(g).not.toContain("body: '{}'");
    expect(g).toContain('tekrarEtme: tekrarEtmeListesi(sonOneri.current)');
    expect(g).toContain('sonOneri.current = r');
  });

  it('kart kaynağı söylüyor ve "Buna göre yeniden yaz" ayrı düğme', () => {
    const k = govde(r, 'function FikirMetni(');
    expect(k).toContain("m.kaynak === 'derleyici'");
    expect(k).toContain("iste('buna_gore')");
    expect(k).toContain("kaynak: 'kullanici'");
    expect(yorumsuz('set-kartlari.tsx')).toContain('setAlti?.(st, i)');
  });

  it('kullanıcıya görünen yeni metinlerde uzun tire yok', () => {
    const k = govde(r, 'function FikirMetni(');
    expect(k).not.toContain('—');
  });
});
