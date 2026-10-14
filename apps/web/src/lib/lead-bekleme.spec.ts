import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bekleyenKayit } from './lead-bekleme';

const SIMDI = Date.parse('2026-10-15T12:00:00Z');
const once = (dk: number) => new Date(SIMDI - dk * 60_000).toISOString();

describe('yeni kaydın beklemesi', () => {
  it('KRİTİK: bir saati geçen yeni kayıt "gecikti"; öncesi değil', () => {
    expect(bekleyenKayit('new', once(59), SIMDI)).toEqual({ metin: '59 dakikadır aranmadı', gecikti: false });
    expect(bekleyenKayit('new', once(60), SIMDI)).toEqual({ metin: '1 saattir aranmadı', gecikti: true });
    expect(bekleyenKayit('new', once(3 * 1440 + 5), SIMDI)).toEqual({ metin: '3 gündür aranmadı', gecikti: true });
  });

  it('KRİTİK: aranmış ya da sonrası kayıt bekleme sayılmıyor', () => {
    for (const s of ['contacted', 'qualified', 'won', 'lost']) expect(bekleyenKayit(s, once(600), SIMDI)).toBeNull();
  });

  it('saat farkıyla gelecekte görünen kayıt eksi dakika yazmıyor', () => {
    expect(bekleyenKayit('new', new Date(SIMDI + 120_000).toISOString(), SIMDI)?.metin).toBe('0 dakikadır aranmadı');
  });

  it('liste satırı ve sayaç aynı fonksiyondan', () => {
    const k = readFileSync(join(__dirname, '../components/leads/lead-table.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toContain('const b = bekleyenKayit(lead.status, lead.submittedAt);');
    expect(k).toContain('{gecikenSayisi} yeni kayıt 1 saati geçti');
  });
});
