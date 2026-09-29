import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    expect(KOD).toContain('baslik={`Düşen iş · son ${SENKRON_SAYAC_GUNU} gün`}');
    expect(KOD).toContain('baslik={`Başarılı ama boş iş · son ${SENKRON_SAYAC_GUNU} gün`}');
    expect(KOD).toContain('Son {SENKRON_SAYAC_GUNU} günün senkronizasyon işleri');
  });

  it('KRİTİK: elle yazılmış gün sayısı yok', () => {
    expect(KOD).not.toMatch(/son 7 gün/i);
  });
});
