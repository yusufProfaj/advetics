import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boostSozlugu } from '@/dil/sozlukler/boost';

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
    expect(KOD).toContain('d.secilmediBas');
    expect(KOD).toContain('d.secilmediVurgu');
    expect(boostSozlugu.tr.google.secilmediBas).toContain('Seçilmedi: reklam');
    expect(boostSozlugu.tr.google.secilmediVurgu).toBe('Türkiye');
    expect(boostSozlugu.en.google.secilmediVurgu).toBe('Turkey');
  });

  it('yaş seçilmezse bütün yaşlar; seçilirse bilinmeyenlerin dışarıda kaldığı yazılı', () => {
    expect(KOD).toContain('d.yasSecilmedi');
    expect(KOD).toContain('d.yasSecili');
    expect(boostSozlugu.tr.google.yasSecilmedi).toBe('Seçilmedi: bütün yaşlar hedeflenir.');
    expect(boostSozlugu.tr.google.yasSecili).toContain('yaşı bilinmeyen izleyiciler dahil değil');
  });

  it('KRİTİK: arama hatası YUTULMUYOR ve "sonuç yok"tan ayrı', () => {
    expect(KOD).toContain('setHata(err instanceof ApiRequestError ? err.message');
    expect(KOD).toContain("durum === 'bitti' && !hata && sonuc.length === 0");
  });

  it('reklam hesabı yoksa arama kutusu yerine SEBEP', () => {
    expect(KOD).toContain('{d.hesapYok}');
    expect(boostSozlugu.tr.google.hesapYok).toBe('Konum aramak için YouTube kanalına bir Google reklam hesabı bağlı olmalı.');
  });

  it('konum ETİKETİYLE saklanıyor — kimlikle değil', () => {
    expect(KOD).toContain('{ key: o.key, label: o.label }');
  });
});
