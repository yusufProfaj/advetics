import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ PANEL METNİ ESKİ EKRANI ANLATMIYOR (MIMARI § 11, Ajan 4, 2026-10-13) ═══
 *
 * Açılış sihirbazının sonuç ekranı sadeleştirmeden sonra da "Eksikleri
 * Şirketler ekranındaki workspace kartından tamamlayabilirsin" diyordu; o
 * pencere kaldırılmıştı ve eksiklerin evi Marka Merkezi › Kurulum. Hata
 * yok, kullanıcı olmayan bir kartı arıyor. API tarafının kardeşi
 * `apps/api/src/eski-ekran-adlari.spec.ts`.
 *
 * "Hedef kitle" ve "Açılış" bilerek listede DEĞİL: Akıllı Boost'ta hedefleme
 * kutusunun ve kampanya açılış durumunun adı, eski ekran değil.
 */

const KOK = join(__dirname, '..');

const ESKI_ADLAR: ReadonlyArray<RegExp> = [
  /Platform Bağlantıları/,
  /Workspace ayarlar/,
  /E-posta Ayarları/,
  /Kütüphane/,
  /Marka Merkezi › (Bağlantılar|Kitleler|Varlıklar|Ölçüm)/,
  /Senkronizasyon Durumu/,
  /Ekip & Yetkiler/,
  /Bilgi [Bb]ankası/,
  /workspace kartı/,
  /(?<!› Platform b)Bağlantılar[’']d[ae]n?\b/,
];

/** Yorumu atar — `{/* … *\/}` JSX yorumu da blok yorum olarak gidiyor. */
function yorumsuz(kaynak: string): string {
  return kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function dosyalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return dosyalar(yol);
    return /\.(ts|tsx)$/.test(ad) && !ad.endsWith('.spec.ts') ? [yol] : [];
  });
}

function ihlaller(ad: string, kaynak: string): string[] {
  const temiz = yorumsuz(kaynak);
  return ESKI_ADLAR.flatMap((d) => {
    const m = temiz.match(d);
    return m ? [`${ad}: ${m[0]}`] : [];
  });
}

describe('KRİTİK: panel metninde eski ekran adı yok', () => {
  const liste = dosyalar(KOK);

  it('tarama boşa düşmüyor — sonuç ekranı taranıyor ve yeni yeri yazıyor', () => {
    expect(liste.length).toBeGreaterThan(200);
    const sonuc = liste.find((f) => f.endsWith('components/kurulum/kurulum-sonucu.tsx'));
    expect(sonuc, 'kurulum-sonucu.tsx taranmıyor').toBeDefined();
    const govde = yorumsuz(readFileSync(sonuc!, 'utf8'));
    expect(govde).toContain("markaMerkeziAdresi('kurulum', clientId, capa)");
    expect(govde).toContain('PANEL_YERLERI.kurulum');
  });

  it('dedektör eski metni yakalıyor, yorumdakini yakalamıyor', () => {
    expect(ihlaller('x', '<p>Şirketler ekranındaki workspace kartından tamamla.</p>')).toHaveLength(1);
    expect(ihlaller('x', '{/* Şirketler ekranındaki workspace kartı */}<p>Tamam</p>')).toEqual([]);
    expect(ihlaller('x', "const a = 'Ayarlar › Platform bağlantıları’ndan bağla';")).toEqual([]);
  });

  it('hiçbir dosyada eski ad yok', () => {
    const bulunan = liste.flatMap((f) => ihlaller(relative(KOK, f), readFileSync(f, 'utf8')));
    expect(bulunan).toEqual([]);
  });
});
