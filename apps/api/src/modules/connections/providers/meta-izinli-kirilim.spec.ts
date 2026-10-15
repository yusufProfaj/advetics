import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ═══ HESAP İZNİ İSTEYEN META KIRILIMLARI (docs/pazar/genel-bakis.md) ═══
 *
 * Meta 8 Mayıs 2026 değişiklik notu: `impression_device` (ve onu içeren
 * her kombinasyon), `hourly_stats_aggregated_by_audience_time_zone` ve
 * `frequency_value`, satış desteği olmayan hesaplarda hesap başına izin
 * istiyor; izin yoksa senkron istek HATA VERMEDEN boş dönüyor (Ağustos
 * 2026'dan beri). Panel bunu "bu dönemde veri yok" diye gösterirdi ve
 * sebep hiçbir yerde yazmazdı.
 *
 * Bu bekçi, biri bu kırılımlardan birini eklerse düşüyor: eklenecekse ÖNCE
 * "boş = izin yok olabilir" durumu ekranda yazılmalı, sonra bu liste
 * daraltılmalı. Bugün saat kırılımı reklamveren saat dilimi varyantında;
 * Meta'nın notu onu saymıyor (canlıda ölçülmedi, PROGRESS.md).
 */
const IZINLI = ['impression_device', 'hourly_stats_aggregated_by_audience_time_zone', 'frequency_value'];
const KOK = join(__dirname, '../../../../../..');

function tsDosyalari(d: string, out: string[] = []): string[] {
  for (const ad of readdirSync(d)) {
    const yol = join(d, ad);
    if (statSync(yol).isDirectory()) tsDosyalari(yol, out);
    else if (/\.ts$/.test(ad) && !/\.spec\.ts$/.test(ad)) out.push(yol);
  }
  return out;
}

describe('izin isteyen Meta kırılımları kullanılmıyor', () => {
  it('KRİTİK: API ve shared kaynağında (yorumsuz) hiçbiri geçmiyor', () => {
    const dosyalar = [...tsDosyalari(join(KOK, 'apps/api/src')), ...tsDosyalari(join(KOK, 'packages/shared/src'))];
    // Tarama boşa düşmesin: kırılım haritasının dosyası listede olmalı.
    expect(dosyalar.some((f) => f.endsWith('providers/meta.provider.ts'))).toBe(true);
    const bulunan = dosyalar.flatMap((f) => {
      const k = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return IZINLI.filter((y) => k.includes(y)).map((y) => `${f.slice(KOK.length)}: ${y}`);
    });
    expect(bulunan).toEqual([]);
  });

  it('saat kırılımı reklamveren saat dilimi varyantında (izin listesinde değil)', () => {
    const k = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');
    expect(k).toContain("hour: 'hourly_stats_aggregated_by_advertiser_time_zone',");
  });
});
