import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * YOUTUBE KARTINDA REKLAM METNİ — kartta düzeltilen metin gerçekten gidiyor,
 * yükleme hatası yutulmuyor, sınır girişte uygulanıyor. Yorumsuz kaynakta.
 */
const KOD = readFileSync(join(__dirname, 'kart-duzenle.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const ALAN = KOD.slice(KOD.indexOf('export function YoutubeMetinAlanlari('));

describe('YouTube kart metni', () => {
  it('tarama boşa düşmüyor', () => {
    expect(KOD).toContain('export function YoutubeMetinAlanlari(');
    expect(ALAN.length).toBeGreaterThan(500);
  });

  it('KRİTİK: metin override’a giriyor — yalnızca YouTube kartında ve yüklendiyse', () => {
    expect(KOD).toContain("...(kayit.platform === 'google' && ytMetin ? { texts: ytMetin } : {}),");
  });

  it('KRİTİK: YouTube kartında hedefleme yerine metin alanları açılıyor', () => {
    expect(KOD).toContain('if (d.youtube) return <YoutubeMetinAlanlari d={d} />;');
  });

  it('alanlar yayınla AYNI uçtan dolduruluyor', () => {
    expect(ALAN).toContain('/autoboost/queue/${kayitId}/youtube-metinleri');
  });

  it('KRİTİK: yükleme hatası YUTULMUYOR', () => {
    expect(ALAN).toContain("setHata(err instanceof ApiRequestError ? err.message : 'Reklam metni yüklenemedi.')");
    expect(ALAN).toContain('yayınlarsan metin videodan üretilir');
  });

  it('Google sınırları girişte — sayaç ve maxLength', () => {
    expect(KOD).toContain('const SINIR = { baslik: 30, uzunBaslik: 90, aciklama: 90 } as const;');
    expect(ALAN).toContain('maxLength={sinir}');
    expect(ALAN).toContain('{deger.length}/{sinir}');
  });

  it('açıklama yedekten geldiyse söyleniyor', () => {
    expect(ALAN).toContain("kaynak === 'yedek'");
  });
});
