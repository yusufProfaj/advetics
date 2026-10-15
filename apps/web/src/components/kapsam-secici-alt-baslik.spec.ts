import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ═══ KAPSAM KESİLMİYOR, İKİ EKRAN AYNI DİLİ KONUŞUYOR ═══
 * Seçicinin alt başlığı "N workspace · şirket geneli" sırasıyla dar düğmede
 * kesiliyor ve kesilen kısım tam da kapsamın kendisiydi; Marka Merkezi ise
 * "workspace seçili değil" diyordu (canlı denetim).
 */
const yorumsuz = (f: string) =>
  readFileSync(join(__dirname, f), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SECICI = yorumsuz('kapsam-secici.tsx');
const GEC = yorumsuz('workspace-gec.tsx');

describe('kapsam seçici alt başlığı', () => {
  it('KRİTİK: kapsam sayıdan önce (kesilen kapsam olmasın); ajans önekinin kararı ayrı testte', () => {
    expect(SECICI).toContain('`Şirket geneli · ${aktifSirket?.workspaces.length ?? 0} workspace`');
    expect(SECICI).not.toContain('workspace · şirket geneli`');
  });

  it('kesilen alt başlığın tamamı üzerine gelince', () => {
    expect(SECICI).toContain('title={altBaslik}>{altBaslik}</span>');
  });

  it('Marka Merkezi uyarısı seçiciyle aynı kelimeyi kullanıyor', () => {
    expect(GEC).toContain('Üstte şirket geneli seçili, tek bir workspace değil.');
    expect(GEC).not.toContain('Üstte bir workspace seçili değil.');
  });
});
