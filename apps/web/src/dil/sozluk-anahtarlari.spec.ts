import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ SÖZLÜK BEKÇİSİ: HER ANAHTAR İKİ DİLDE (docs/i18n/MIMARI.md §5) ═══
 *
 * `Sozluk<T>` tipi eksik anahtarı DERLEMEDE yakalıyor; ama vitest tip
 * denetimi yapmıyor ve CLAUDE.md "ZORUNLU ALANI EKSİK BIRAKAN FIXTURE"
 * dersi tam olarak bu boşluktan doğdu. Burada çalışma anında üç şey:
 *  1. iki dilin anahtar kümesi (iç içe) EŞİT,
 *  2. hiçbir değer boş dizge değil (fonksiyonlar örnek argümanla çağrılıyor),
 *  3. İngilizce değer Türkçe ile AYNI değil: kopyalanıp çevrilmemiş satır
 *     İngilizce ekranda Türkçe görünür ve derleme bunu göremez.
 *     Aynı olması meşru olanlar (marka adı, kısaltma) `AYNI_OLABILIR`de.
 */
const DIZIN = join(__dirname, 'sozlukler');
const AYNI_OLABILIR = new Set<string>([]);

type Agac = Record<string, unknown>;

function yapraklar(a: Agac, onek = ''): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(a)) {
    const yol = onek ? `${onek}.${k}` : k;
    if (v !== null && typeof v === 'object') for (const [y, w] of yapraklar(v as Agac, yol)) m.set(y, w);
    else m.set(yol, v);
  }
  return m;
}

function deger(v: unknown): string {
  if (typeof v === 'function') return (v as (...a: unknown[]) => string)(...Array(v.length).fill(7));
  return v as string;
}

async function sozlukler(): Promise<{ ad: string; tr: Agac; en: Agac }[]> {
  const out: { ad: string; tr: Agac; en: Agac }[] = [];
  for (const dosya of readdirSync(DIZIN).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'))) {
    const mod = (await import(join(DIZIN, dosya))) as Record<string, unknown>;
    for (const [ad, x] of Object.entries(mod)) {
      // `ikiDil()` çıktısı: iki DAL da nesne. `DIL_ADLARI` gibi düz `{tr: 'Türkçe'}` eşlemeleri sözlük değil.
      const o = x as { tr?: unknown; en?: unknown } | null;
      if (o && typeof o === 'object' && typeof o.tr === 'object' && typeof o.en === 'object') {
        out.push({ ad: `${dosya}#${ad}`, tr: (x as { tr: Agac }).tr, en: (x as { en: Agac }).en });
      }
    }
  }
  return out;
}

describe('sözlükler: her anahtar iki dilde, dolu ve çevrilmiş', () => {
  it('BOŞA DÜŞME BEKÇİSİ: sözlük dosyaları bulundu', async () => {
    const s = await sozlukler();
    expect(s.map((x) => x.ad)).toEqual(expect.arrayContaining(['giris.ts#girisSozlugu', 'dil-secimi.ts#dilSecimiSozlugu']));
  });

  it('KRİTİK: anahtar kümeleri eşit, değer boş değil, İngilizce Türkçenin kopyası değil', async () => {
    const hatalar: string[] = [];
    for (const { ad, tr, en } of await sozlukler()) {
      const t = yapraklar(tr);
      const e = yapraklar(en);
      for (const k of t.keys()) if (!e.has(k)) hatalar.push(`${ad}: "${k}" İngilizcede YOK`);
      for (const k of e.keys()) if (!t.has(k)) hatalar.push(`${ad}: "${k}" Türkçede YOK`);
      for (const [k, v] of e) {
        if (!t.has(k)) continue;
        const ev = deger(v);
        const tv = deger(t.get(k));
        if (typeof ev !== 'string' || ev.trim() === '') hatalar.push(`${ad}: "${k}" İngilizcesi BOŞ`);
        if (typeof tv !== 'string' || tv.trim() === '') hatalar.push(`${ad}: "${k}" Türkçesi BOŞ`);
        if (ev === tv && !AYNI_OLABILIR.has(`${ad}:${k}`)) hatalar.push(`${ad}: "${k}" ÇEVRİLMEMİŞ ("${ev}")`);
      }
    }
    expect(hatalar).toEqual([]);
  });
});
