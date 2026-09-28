import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERIMLER, yonCumlesi } from './terimler';

/**
 * ═══ METRİK SÖZLÜĞÜ VE KARTLAR ═══
 *
 * Genel Bakış'ın kart başlıkları "CPA", "ROAS", "CTR", "CPC" idi ve
 * açıklamaları yoktu. Kartlar artık düz etiket kabul etmiyor, sözlükten bir
 * anahtar istiyor; bu dosya sözlüğün dolu olduğunu ve kartların onu
 * atlamadığını kilitliyor.
 */
const SRC = join(__dirname, '..');
const yorumsuz = (yol: string): string =>
  readFileSync(join(SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

describe('sözlük', () => {
  it('her terimin iş dilinde bir adı ve anlaşılır bir açıklaması var', () => {
    for (const [k, t] of Object.entries(TERIMLER)) {
      expect(t.ad.length, k).toBeGreaterThan(2);
      expect(t.aciklama.length, k).toBeGreaterThan(20);
      // Açıklama kısaltmayla açıklanmıyor: "CPA, CPA demektir" işe yaramaz.
      if (t.kisaltma) expect(t.aciklama, k).not.toContain(t.kisaltma);
    }
  });

  it('KRİTİK: maliyet metriklerinde düşük olan iyi', () => {
    // Maliyetin artışını gösteren kırmızı ok, bu cümle olmadan anlaşılmıyor.
    expect(TERIMLER.cpa.iyiYon).toBe('dusuk');
    expect(TERIMLER.cpc.iyiYon).toBe('dusuk');
    expect(yonCumlesi(TERIMLER.cpa)).toBe('Düşük olması iyi.');
    expect(yonCumlesi(TERIMLER.harcama)).toBeNull();
  });

  it('panel metin kuralı: uzun tire yok', () => {
    for (const t of Object.values(TERIMLER)) {
      expect(t.aciklama).not.toContain('—');
      expect(t.ad).not.toContain('—');
    }
  });
});

describe('kartlar sözlüğü kullanıyor', () => {
  const KART = yorumsuz('components/metric-card.tsx');
  const SERIT = yorumsuz('components/metric-strip.tsx');
  const SAYFA = yorumsuz('app/(dashboard)/dashboard/page.tsx');

  it('KRİTİK: kart ve şerit düz etiket kabul etmiyor', () => {
    // Düz `label` kabul edilseydi yeni bir kart sözlüğü atlayıp iki harfle eklenirdi.
    expect(KART).toContain('terim: TerimAnahtari;');
    expect(KART).not.toMatch(/\blabel: string/);
    expect(SERIT).toContain('terim: TerimAnahtari;');
    expect(SERIT).not.toMatch(/\blabel: string/);
  });

  it('KRİTİK: Genel Bakış kartlarında kısaltma etiketi kalmadı', () => {
    expect(SAYFA).not.toMatch(/label=["{]\s*['"]?(CPA|ROAS|CTR|CPC)/);
    for (const t of ['"cpa"', '"roas"', "'ctr'", "'cpc'"]) expect(SAYFA).toContain(t);
  });

  it('KRİTİK: şerit iyi/kötü kuralını kendisi yazmıyor, ortak rozeti kullanıyor', () => {
    /*
     * Şerit bu kuralı ikinci kez yazıyordu ve yönü yalnızca renkle
     * söylüyordu. `delta-rozeti.spec.ts` kart ve tabloyu tarıyordu, şeridi
     * değil.
     */
    expect(SERIT).toContain('<DeltaRozeti');
    expect(SERIT).not.toMatch(/inverse\s*\?\s*item\.change/);
  });

  it('terim açıklaması title içinde değil, erişilebilir bir düğmede', () => {
    const TERIM = yorumsuz('components/ui/terim.tsx');
    expect(TERIM).toContain('aria-describedby={id}');
    expect(TERIM).toContain('aria-expanded={acik}');
    expect(TERIM).not.toContain('title=');
  });
});

describe('platform listesi', () => {
  it('KRİTİK: giriş ekranı platformları sabitten türetiyor, elle yazmıyor', async () => {
    const { platformListesi } = await import('./platform-listesi');
    expect(platformListesi()).toBe('Meta Ads, Google Ads ve LinkedIn Ads');
    for (const yol of ['app/(auth)/login/page.tsx', 'components/auth/auth-kabuk.tsx']) {
      const kod = yorumsuz(yol);
      expect(kod, yol).toContain('platformListesi()');
      expect(kod, yol).not.toContain('Meta ve Google');
    }
  });
});
