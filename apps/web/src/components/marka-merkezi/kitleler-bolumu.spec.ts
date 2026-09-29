import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Marka Merkezi → Kitleler. Render altyapısı yok; YORUMSUZ kaynak taranıyor. */
const K = readFileSync(resolve(__dirname, 'kitleler-bolumu.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const SECICI = readFileSync(resolve(__dirname, '../autoboost/hedefleme-secici.tsx'), 'utf8');

describe('Kitleler bölümü', () => {
  it('KRİTİK: kayıt sunucuyla AYNI şemadan geçmeden gönderilmiyor', () => {
    const bas = K.indexOf('async function kaydet(');
    const kontrol = K.indexOf('kitleSablonuInputSchema.safeParse(govde)', bas);
    const istek = K.indexOf("'/audience-templates'", bas);
    expect(kontrol).toBeGreaterThan(bas);
    expect(istek).toBeGreaterThan(kontrol);
  });

  it('dört hâl ayrı: yükleniyor, hata, boş (sebebiyle), liste', () => {
    expect(K).toContain("durum.tur === 'yukleniyor'");
    expect(K).toContain("durum.tur === 'hata'");
    expect(K).toContain('Kitle olmadan Hızlı Reklam');
    expect(K).not.toMatch(/\.catch\(\(\) => set/);
  });

  it('konum araması İKİNCİ KEZ yazılmadı — mevcut seçici kayıtlı kitle olmadan kullanılıyor', () => {
    expect(K).toContain('<HedeflemeSecici');
    expect(K).toContain('kayitliKitle={false}');
    expect(K).not.toContain('/connections/targeting/locations');
    expect(SECICI).toContain('if (!hesap || !kayitliKitle) return;');
  });

  it('silme iki adımlı; ekran "yalnızca Meta" kısıtını söylüyor', () => {
    expect(K).toContain('Silinsin mi?');
    expect(K).toContain('yalnızca Meta reklamlarında');
  });
});
