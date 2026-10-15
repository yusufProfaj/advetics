import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';
import { kapsamSozlugu } from '@/dil/sozlukler/kapsam';

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
    // Metin sözlükte (D2): seçici anahtarı kullanıyor, sıra sözlük değerinde.
    expect(SECICI).toContain('d.sirketGeneliSayi(aktifSirket?.workspaces.length ?? 0)');
    expect(kapsamSozlugu.tr.sirketGeneliSayi(3)).toBe('Şirket geneli · 3 workspace');
    expect(kapsamSozlugu.en.sirketGeneliSayi(3)).toBe('Company-wide · 3 workspaces');
    expect(SECICI).not.toContain('workspace · şirket geneli`');
    expect(JSON.stringify(kapsamSozlugu.tr)).not.toContain('workspace · şirket geneli');
  });

  it('kesilen alt başlığın tamamı üzerine gelince', () => {
    expect(SECICI).toContain('title={altBaslik}>{altBaslik}</span>');
  });

  it('Marka Merkezi uyarısı seçiciyle aynı kelimeyi kullanıyor', () => {
    // Metin sözlükte (D2); bileşen o anahtarı kullanıyor.
    expect(genelBakisSozlugu.tr.workspace.secimYokMetin('X')).toContain('Üstte şirket geneli seçili, tek bir workspace değil.');
    expect(GEC).toContain('{d.secimYokMetin(hedef)}');
    expect(JSON.stringify(genelBakisSozlugu.tr.workspace)).not.toContain('Üstte bir workspace seçili değil.');
  });
});
