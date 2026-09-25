import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * YOUTUBE HEDEF KİTLESİ — iki varsayılan da ekranda yazılı ve arama dört hâlli.
 * Tarama yorumsuz kaynakta: kuralları anlatan yorum aynı ifadeleri taşıyor.
 */
const KOD = readFileSync(join(__dirname, 'google-hedefleme.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('GoogleHedefleme', () => {
  it('tarama boşa düşmüyor', () => {
    expect(KOD).toContain('export function GoogleHedefleme(');
  });

  it('KRİTİK: konum seçilmezse TÜRKİYE yazıyor — "bütün ülkeler" değil', () => {
    expect(KOD).toContain('Seçilmedi: reklam');
    expect(KOD).toContain('Türkiye');
  });

  it('yaş seçilmezse bütün yaşlar; seçilirse bilinmeyenlerin dışarıda kaldığı yazılı', () => {
    expect(KOD).toContain('Seçilmedi: bütün yaşlar hedeflenir.');
    expect(KOD).toContain('yaşı bilinmeyen izleyiciler dahil değil');
  });

  it('KRİTİK: arama hatası YUTULMUYOR ve "sonuç yok"tan ayrı', () => {
    expect(KOD).toContain('setHata(err instanceof ApiRequestError ? err.message');
    expect(KOD).toContain("durum === 'bitti' && !hata && sonuc.length === 0");
  });

  it('reklam hesabı yoksa arama kutusu yerine SEBEP', () => {
    expect(KOD).toContain('Konum aramak için YouTube kanalına bir Google reklam hesabı bağlı olmalı.');
  });

  it('konum ETİKETİYLE saklanıyor — kimlikle değil', () => {
    expect(KOD).toContain('{ key: o.key, label: o.label }');
  });
});
