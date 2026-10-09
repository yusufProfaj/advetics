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
    expect(TERIMLER.cpm.iyiYon).toBe('dusuk');
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

/*
 * 2026-10-09: sözlük anahtarı isteyen eski kartlar (`metric-card`,
 * `metric-strip`) onaylanan taslakla kalktı; yeni kutular düz ad alıyor.
 * Kısaltma yasağı artık iki sayfanın kendi etiketlerinde kilitli, iyi/kötü
 * kararı `lib/degisim.spec.ts`te.
 */
describe('kartlar iş dilinde', () => {
  // Genel Bakış kutularının etiketleri sayfada (onaylanan taslak, 2026-10-09).
  const SAYFA = yorumsuz('app/(dashboard)/dashboard/page.tsx');

  it('KRİTİK: Genel Bakış kartlarında kısaltma etiketi kalmadı', () => {
    // Hedef kullanıcı reklamcılık bilmiyor: kısaltma değil iş dilinde ad.
    expect(SAYFA).not.toMatch(/ad: '(CPA|ROAS|CTR|CPC|CPM|TO)'/);
    for (const t of ["ad: 'Dönüşüm başı maliyet'", "ad: 'Reklam getirisi'", "ad: 'Tıklama oranı'", "ad: 'Tıklama başı maliyet'", "ad: 'Bin gösterim maliyeti'"]) {
      expect(SAYFA).toContain(t);
    }
  });

  it('KRİTİK: Reklam Yöneticisi kutularında da kısaltma yok', () => {
    const YM = yorumsuz('app/(dashboard)/ads-explorer/page.tsx');
    const m = YM.slice(YM.indexOf('function ymMetrikleri'), YM.indexOf('function duzeySekmeleri'));
    expect(m.length, 'ymMetrikleri bulunamadı').toBeGreaterThan(100);
    expect(m).not.toMatch(/ad: '(CPA|ROAS|CTR|CPC|CPM|TO)'/);
    expect(m).toContain("ad: 'Dönüşüm başı maliyet'");
  });

  it('KRİTİK: çok günlü erişimde "günlük ortalama" ipucu mükerrer uyarısına ezilmiyor', () => {
    /*
     * Çok hesaplı + çok günlü aralıkta ipucu yalnızca "mükerrer olabilir"
     * diyordu ve kart bir günün ortalamasını dönemin tekil kişi sayısı gibi
     * gösteriyordu.
     */
    expect(SAYFA).toContain("'günlük ortalama, hesaplar arası mükerrer olabilir'");
    const i = SAYFA.indexOf("anahtar: 'erisim'");
    expect(i).toBeGreaterThan(-1);
    const dilim = SAYFA.slice(i, SAYFA.indexOf('}\n      : {', i));
    expect(dilim.indexOf("reachKind === 'daily_average'")).toBeLessThan(dilim.indexOf('summary.reachAcrossAccounts'));
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
