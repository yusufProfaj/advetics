import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ═══ UYARININ DÜĞMESİ DAR EKRANDA ALTA İNİYOR ═══
 * Metin `flex-1` (taban 0) ile düğmenin yanında sıfıra kadar daralabiliyordu;
 * kap `flex-wrap` olsa da sarma hiç tetiklenmiyordu ve telefonda "bu
 * workspace'e geç" uyarısı 12 satır oldu (canlı denetim).
 */
const K = readFileSync(join(__dirname, 'uyari.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('Uyari düzeni', () => {
  it('KRİTİK: metin tabanlı (16 rem), kap sarılıyor, düğme küçülmüyor', () => {
    expect(K).toContain('<div className="min-w-0 flex-[1_1_16rem] space-y-0.5">');
    expect(K).not.toContain('<div className="min-w-0 flex-1 space-y-0.5">');
    expect(K).toContain('flex flex-wrap items-start');
    expect(K).toContain('{eylem && <div className="shrink-0">{eylem}</div>}');
  });
});

describe('Serit düzeni', () => {
  const S = readFileSync(join(__dirname, 'hal.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  it('KRİTİK: şerit metni de 16 rem tabanlı (telefonda eylemin yanında sıkışmasın)', () => {
    const bas = S.indexOf('export function Serit(');
    expect(bas, 'Serit bulunamadı, tarama boşa düştü').toBeGreaterThan(0);
    const govde = S.slice(bas);
    expect(govde).toContain('<div className="min-w-0 flex-[1_1_16rem]">');
    expect(govde).toContain('flex flex-wrap items-center');
  });
});
