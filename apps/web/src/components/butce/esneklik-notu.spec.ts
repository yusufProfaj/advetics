import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_ESNEKLIK_NOTU } from '@advetics/shared';

/*
 * ═══ "HIZLI" ROZETİ PLATFORM ESNEKLİĞİNİ SÖYLÜYOR (docs/pazar/butce.md) ═══
 * Google günde 2 katına, Meta %75 fazlasına çıkabiliyor (belgeli). Not
 * yoksa kullanıcı tek günlük sıçramayı arıza sanıp bütçeyi kısıyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'butce-icerik.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('platform esnekliği notu', () => {
  it('iki platformun sınırını da söylüyor ve panel metin dilinde uzun tire yok', () => {
    expect(PLATFORM_ESNEKLIK_NOTU).toContain('%75');
    expect(PLATFORM_ESNEKLIK_NOTU).toContain('2 katını');
    expect(PLATFORM_ESNEKLIK_NOTU).not.toContain('—');
  });

  it('KRİTİK: genel kart "Hızlı" iken notu gösteriyor, ay sonu şeridi aynı metni kullanıyor', () => {
    expect(KAYNAK).toContain("{pacing.status === 'over' && <p className=\"m-0 text-12 text-ink-muted\" data-esneklik-notu>{PLATFORM_ESNEKLIK_NOTU}</p>}");
    expect(KAYNAK.split('{PLATFORM_ESNEKLIK_NOTU}').length - 1).toBe(2);
    // İkinci bir elle yazılmış cümle doğmasın.
    expect(KAYNAK).not.toMatch(/%75&apos;e/);
  });
});
