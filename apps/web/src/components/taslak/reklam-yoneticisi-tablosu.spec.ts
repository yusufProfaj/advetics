import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Reklam Yöneticisi'nin tek tablosu — onaylanan taslak (2026-10-09). */
const yorumsuz = (yol: string) =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const TABLO = yorumsuz(join(__dirname, 'reklam-yoneticisi-tablosu.tsx'));
const SAYFA = yorumsuz(join(__dirname, '..', '..', 'app', '(dashboard)', 'ads-explorer', 'page.tsx'));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(TABLO).toContain('export function ReklamYoneticisiTablosu');
    expect(SAYFA).toContain('<ReklamYoneticisiTablosu');
  });
});

describe('önizlemeler', () => {
  it('KRİTİK: anahtar yalnız reklam düzeyinde çalışıyor, başka düzeyde nedenini söylüyor', () => {
    expect(TABLO).toContain('if (!reklamda) return;');
    expect(TABLO).toContain("'Reklam düzeyinde açılır'");
  });

  it('KRİTİK: karar ortak fonksiyondan (tek önizleme / hepsi)', () => {
    expect(TABLO).toContain('onizlemeAcikMi({ hepsiAcik, tekAcik, kapatilan }, id)');
    expect(TABLO).toContain('kurVeAc([id], () => setTekAcik(id));');
  });

  it("KRİTİK: animasyon hatasız — açılmış önizleme DOM'da, kapalıyken inert", () => {
    expect(TABLO).toContain('(acilmis.has(r.id) || acik) && (');
    expect(TABLO).toContain('<div inert={!acik}>');
    expect(TABLO).toContain('requestAnimationFrame(() => requestAnimationFrame(ac));');
  });
});

describe('düzeyler ve satırlar', () => {
  it('KRİTİK: gidilemeyen düzey soluk ve NEDENİNİ söylüyor', () => {
    expect(SAYFA).toContain("neden: 'Bu düzey için bir workspace seç'");
    expect(TABLO).toContain('aria-disabled={kapali || undefined}');
  });

  it('KRİTİK: izlenmeyen hesap bağlantı DEĞİL — boş listeye götürürdü', () => {
    const h = SAYFA.slice(SAYFA.indexOf('function hesapSatiri'), SAYFA.indexOf('const DURUM_ADI'));
    expect(h).toContain('eylem: a.syncEnabled');
    expect(h).toContain(': null,');
  });

  it('KRİTİK: sessiz kesme yok — sayaç ve sunucu sınırı yazılı', () => {
    expect(TABLO).toContain('`1 - ${satirlar.length} / ${satirlar.length} ${BIRIM[duzey]}`');
    expect(SAYFA).toContain('`harcamaya göre ilk ${KIRILIM_LIMITI} satır`');
  });

  it('KRİTİK: değeri olmayan satır sıralamada SONDA — "en ucuz" sanılmıyor', () => {
    expect(TABLO).toContain('if (x === null) return 1;');
    expect(TABLO).toContain('if (y === null) return -1;');
  });

  it('KRİTİK: tıklama oranı yüzde ölçeğinde (formatPercent yüzde bekliyor)', () => {
    expect(TABLO).toContain('formatPercent((r.clicks / r.impressions) * 100)');
  });

  it('karışık para biriminde toplam uydurulmuyor', () => {
    expect(TABLO).toContain("(b ? formatMoney(m, b) : 'karışık')");
  });
});
