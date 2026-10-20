import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ HEDEF KİTLELER GÖRÜNÜMÜ WORKSPACE'SİZ DÜŞMÜYOR (canlı, 2026-10-20) ═══
 *
 * Şirket düzeyinde ("Tüm workspace'ler") `activeClientId` boş. Görünüm
 * onu şart koşunca sekme SEÇİLİ görünüp altında hesap tablosu çiziliyordu:
 * hata yok, yanlış tablo. Yorumsuz kaynak taranıyor.
 */
const yorumsuz = (p: string) =>
  readFileSync(resolve(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SAYFA = yorumsuz('../../app/(dashboard)/ads-explorer/page.tsx');
const H = yorumsuz('hedef-kitleler.tsx');

describe('Reklam Yöneticisi › Hedef kitleler', () => {
  it('KRİTİK: kitle görünümü seçili workspace ŞARTI olmadan çiziliyor', () => {
    const i = SAYFA.indexOf('const tabloYerine =');
    expect(i).toBeGreaterThan(-1);
    expect(SAYFA.slice(i, i + 80)).toMatch(/const tabloYerine =\s*kitleGorunumu \? \(/);
  });

  it('KRİTİK: workspace yokken varsayılan alt sekme performans; kayıtlı kitleler NEDENİYLE boş', () => {
    expect(SAYFA).toContain("(kitleAltParam !== 'kayitli' && !session.activeClientId) ? 'performans' : 'kayitli'");
    expect(H).toContain("alt === 'kayitli' && clientId === null ? (");
    expect(H).toContain('<BosDurum baslik={d.workspaceYokBaslik} neden={d.workspaceYokNeden} />');
  });
});
