import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * YOUTUBE KANALINI BUL — panel kaynak kilitleri.
 *
 * Panelde bileşen render eden test altyapısı yok (vitest.config.ts); bu
 * yüzden kararlar kaynakta, YORUMSUZ hâlde taranıyor.
 */
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const BUL = yorumsuz(readFileSync(join(__dirname, 'youtube-kanal-bul.tsx'), 'utf8'));
const KANALLAR = yorumsuz(readFileSync(join(__dirname, '../tenancy/bagli-kanallar.tsx'), 'utf8'));
const BAGLANTILAR = yorumsuz(
  readFileSync(join(__dirname, '../../app/(dashboard)/ayarlar/baglantilar/page.tsx'), 'utf8'),
);

describe('YouTube kanalını bul', () => {
  it('tarama boşa düşmüyor', () => {
    expect(BUL.length).toBeGreaterThan(2000);
  });

  it('KRİTİK: hata yutulmuyor — catch boş liste üretmiyor', () => {
    expect(BUL).not.toMatch(/\.catch\(\s*\(\)\s*=>/);
    expect(BUL).toContain("tur: 'hata'");
  });

  it('KRİTİK: atama MEVCUT uçtan — denetim kaydı ve abonelik orada', () => {
    expect(BUL).toContain('/connections/social-profiles/${profilId}/client');
    expect(BUL).toContain("'/autoboost/youtube/channels'");
  });

  it('KRİTİK: başka workspace’teki kanalın düğmesi kapalı', () => {
    const satir = BUL.slice(BUL.indexOf('function OneriSatiri('));
    expect(satir).toContain("k.mevcut?.durum === 'baska_workspacete'");
    expect(satir).toMatch(/disabled=\{kapali \|\| engel !== null\}/);
  });

  it('onay sorulmadan eklenmiyor', () => {
    const sec = BUL.slice(BUL.indexOf('async function sec('), BUL.indexOf('return (', BUL.indexOf('async function sec(')));
    expect(sec.indexOf('window.confirm')).toBeGreaterThan(0);
    expect(sec.indexOf('window.confirm')).toBeLessThan(sec.indexOf('apiFetch'));
  });

  it('workspace içinde yalnızca YouTube satırında "Kanalı bul"', () => {
    expect(KANALLAR).toContain("const youtube = grup.kind === 'youtube';");
    expect(KANALLAR).toMatch(/\{youtube && \(\s*<Dugme/);
    expect(KANALLAR).toContain('<YouTubeKanalBul clientId={clientId} workspaceAdi={workspaceAdi} />');
  });

  it('havuz ekranında workspace seçilmeden (yalnızca havuza)', () => {
    expect(BAGLANTILAR).toContain('<YouTubeKanalBul clientId={null} workspaceAdi={null} />');
  });
});
