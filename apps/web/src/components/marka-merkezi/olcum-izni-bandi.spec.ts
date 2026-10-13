import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ "ÖLÇÜM İZİNLERİNİ VER" DÖNÜŞÜ KURULUMDA SONUCU SÖYLÜYOR ═══
 *
 * Google'dan dönüş Kurulum bölümüne iniyor (`izinDonusu`) ve orada bant
 * yoktu: izin verildi mi, iptal mi edildi, yanlış hesapla mı girildi —
 * kullanıcı aynı düğmeyi görüp tekrar basıyordu (2026-10-13 üretim, üç
 * deneme). Panelde bileşen render eden test altyapısı yok; tarama yorumsuz
 * kaynakta ve koda çapalı.
 */
const yorumsuz = (yol: string) =>
  readFileSync(join(__dirname, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('KRİTİK: ölçüm izni dönüş bandı', () => {
  it('kurulum listesi bandı çiziyor', () => {
    const k = yorumsuz('kurulum-listesi.tsx');
    expect(k).toMatch(/import \{ CallbackBanner \} from '@\/components\/callback-banner'/);
    expect(k).toContain('<CallbackBanner />');
  });

  it('bant `izin=olcum` için dört sonucu ayrı cümleyle söylüyor', () => {
    const b = yorumsuz('../callback-banner.tsx');
    expect(b).toContain("params.get('izin') === 'olcum'");
    const bas = b.indexOf('const olcumVaryantlari');
    if (bas < 0) throw new Error('ölçüm varyantları bulunamadı');
    const govde = b.slice(bas, b.indexOf('};', b.indexOf("hata: {", bas)));
    for (const k of ['basarili:', 'eksik_izin:', 'iptal:', 'hata:']) expect(govde).toContain(k);
    expect(govde).toContain('Ölçüm izinleri verildi');
    // Yanlış hesap / ret: sunucunun cümlesi ekranda (sessiz hata yasağı).
    expect(govde).toMatch(/body: message \?\?/);
  });
});
