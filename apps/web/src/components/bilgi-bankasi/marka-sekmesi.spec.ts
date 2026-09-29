import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ MARKA SEKMESİ ═══
 *
 * Panelde bileşen render eden altyapı yok (`vitest.config.ts`); kurallar
 * YORUMSUZ kaynakta taranıyor.
 */
const K = readFileSync(resolve(__dirname, 'marka-sekmesi.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function govde(ad: string): string {
  const bas = K.indexOf(`async function ${ad}(`);
  if (bas < 0) throw new Error(`${ad} bulunamadı — tarama boşa düştü.`);
  let d = 0;
  for (let i = K.indexOf('{', bas); i < K.length; i++) {
    if (K[i] === '{') d++;
    else if (K[i] === '}' && --d === 0) return K.slice(bas, i + 1);
  }
  throw new Error(`${ad} gövdesi kapanmadı.`);
}

describe('Marka sekmesi', () => {
  it('KRİTİK: kayıt sunucuyla AYNI şemadan geçmeden gönderilmiyor', () => {
    const g = govde('kaydet');
    const kontrol = g.indexOf('upsertClientProfileSchema.safeParse(govde)');
    const istek = g.indexOf("apiFetch('/client-profile'");
    expect(kontrol).toBeGreaterThan(0);
    expect(istek).toBeGreaterThan(kontrol);
    expect(g.slice(kontrol, istek)).toContain('return;');
  });

  it('KRİTİK: yükleme hatası BOŞ FORMA çevrilmiyor — kaydedilip dolu profil silinmesin', () => {
    expect(K).toContain("setDurum({\n            tur: 'hata',");
    expect(K).toContain("if (durum.tur === 'hata') {");
    expect(K).not.toMatch(/\.catch\(\(\) => setForm\(/);
  });

  it('sayfa adresi kutudan çıkınca denetleniyor (giriş anında doğrulama)', () => {
    expect(K).toMatch(/onBlur=\{\(\) => \{\s*if \(url\.trim\(\)\) denetle\(\);/);
    expect(K).toContain('sikSayfaSchema.safeParse({ ad, url })');
  });

  it('amaç seçenekleri ve sınırlar paylaşılan sabitlerden — elle yazılmış liste yok', () => {
    expect(K).toContain('CAMPAIGN_GOALS.map(');
    expect(K).toContain('GOAL_META[g].label');
    expect(K).toContain('maxLength={MARKA_SINIRLARI.markaAdi}');
    expect(K).not.toMatch(/'(form|whatsapp|website)'/);
  });

  it('eski "Marka Bilgileri" metni "Ek notlar" olarak aynı alana yazılıyor', () => {
    expect(K).toContain('etiket="Ek notlar"');
    expect(govde('kaydet')).toContain('markaBilgileri: form.markaBilgileri.trim() || null');
  });

  it('metin şablonları ve yasal uyarı kaydediliyor, sınırlar paylaşılan sabitten', () => {
    const g = govde('kaydet');
    expect(g).toContain('metinSablonlari: form.metinSablonlari,');
    expect(g).toContain('yasalUyari: form.yasalUyari.trim() || null,');
    expect(K).toContain('sinir={MARKA_SINIRLARI.sablon}');
    expect(K).toContain('maxLength={MARKA_SINIRLARI.yasalUyari}');
  });
});
