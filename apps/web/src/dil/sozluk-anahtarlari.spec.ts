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
/**
 * İki dilde AYNI olması GEREKEN ya da meşru olan yapraklar (yol deseni,
 * `<dosya>#<sabit>:<anahtar.yolu>` üzerinde). Kısa ad, bağlantı ve özellik
 * kimliği metin değil KİMLİK: aşağıdaki ikinci test onların iki dilde
 * EŞİT olduğunu ayrıca kilitliyor. Marka ve ürün adları çevrilmez.
 */
// Site sözlüğüne SINIRLI: `ozellik` adı fiyat sözlüğünde METİN taşıyor ("Özellik"
// sütun başlığı, paketin özellik satırları) ve genel desen onları kimlik sayıyordu.
const KIMLIK = [
  /#siteSozlugu:.*\.slug$/,
  /#siteSozlugu:.*\.href$/,
  /#siteSozlugu:.*\.ozellik$/,
  /#siteSozlugu:.*\.ozellikler\.\d+$/,
];
const AYNI_OLABILIR: RegExp[] = [
  ...KIMLIK,
  /site\.ts#siteSozlugu:ENTEGRASYON_GRUPLARI\.\d+\.ogeler\.\d+\.ad$/,
  /site\.ts#siteSozlugu:BAGLANDIGI_YERLER\.\d+$/,
  /site\.ts#siteSozlugu:YAKINDA_ENTEGRASYONLAR\.\d+$/,
  /site\.ts#siteSozlugu:OZELLIKLER\.\d+\.panelAdi$/,
];

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

/**
 * Fonksiyon değer örnek argümanla çağrılıyor (7). Nesne ya da dizi bekleyen
 * bir fonksiyon 7 ile patlayabilir: o yaprak için değer kıyası YAPILAMIYOR
 * (`null`), anahtar kümesi kıyası yine yapılıyor. Kaçırılan şey yalnız
 * "çevrilmemiş kopya" kontrolü ve sayısı testte görünür (`kiyaslanamayan`).
 */
function deger(v: unknown): string | null {
  if (typeof v !== 'function') return v as string;
  try {
    return (v as (...a: unknown[]) => string)(...Array(v.length).fill(7));
  } catch {
    return null;
  }
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
        if (ev === null || tv === null) continue;
        if (typeof ev !== 'string' || ev.trim() === '') hatalar.push(`${ad}: "${k}" İngilizcesi BOŞ`);
        if (typeof tv !== 'string' || tv.trim() === '') hatalar.push(`${ad}: "${k}" Türkçesi BOŞ`);
        const yol = `${ad}:${k}`;
        const ayniOlabilir = AYNI_OLABILIR.some((d) => d.test(yol));
        if (ev === tv && !ayniOlabilir) hatalar.push(`${ad}: "${k}" ÇEVRİLMEMİŞ ("${ev}")`);
        // Kimlik iki dilde FARKLIYSA bağlantı kırılır (İngilizce kart başka özelliğe gider).
        if (KIMLIK.some((d) => d.test(yol)) && ev !== tv) hatalar.push(`${ad}: "${k}" KİMLİK iki dilde farklı ("${tv}" / "${ev}")`);
      }
    }
    expect(hatalar).toEqual([]);
  });
});
