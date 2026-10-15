import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ayarlarSozlugu } from '@/dil/sozlukler/ayarlar';

/**
 * ═══ SENKRONİZASYON EKRANI PENCEREYİ SABİTTEN YAZIYOR ═══
 *
 * Sayaçlar tüm zamanlardan son 7 güne geçti (2026-09-29). Etiket elle
 * "son 7 gün" yazsaydı pencere değiştiğinde ekran yanlış süreyi söylerdi;
 * panelde "Üst sınır 10 MB" tam olarak böyle yanlışa düşmüştü (CLAUDE.md).
 */
const KOD = readFileSync(join(__dirname, 'senkron-durumu.tsx'), 'utf8').replace(
  /\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g,
  '',
);

describe('pencere etiketi', () => {
  it('iş kutuları ve liste başlığı sabitten', () => {
    // D2: cümle sözlükte ve gün sayısını PARAMETRE alıyor; bileşen sabiti geçiyor.
    expect(KOD).toContain('baslik={d.dusenIs(SENKRON_SAYAC_GUNU)}');
    expect(KOD).toContain('baslik={d.bosIs(SENKRON_SAYAC_GUNU)}');
    expect(KOD).toContain('baslik={d.isler(SENKRON_SAYAC_GUNU)}');
    const tr = ayarlarSozlugu.tr.senkron;
    expect(tr.dusenIs(7)).toBe('Düşen iş · son 7 gün');
    expect(tr.bosIs(7)).toBe('Başarılı ama boş iş · son 7 gün');
    expect(tr.isler(7)).toBe('Son 7 günün senkronizasyon işleri');
  });

  it('KRİTİK: elle yazılmış gün sayısı yok', () => {
    expect(KOD).not.toMatch(/son 7 gün/i);
  });
});
