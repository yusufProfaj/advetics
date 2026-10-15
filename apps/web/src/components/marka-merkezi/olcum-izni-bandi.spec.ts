import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baglantilarSozlugu } from '@/dil/sozlukler/ayarlar-baglantilar';

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
    // Cümleler sözlükte (D2); başarı dalı ölçüme özgü anahtarı kullanıyor.
    expect(govde).toContain('title: d.olcumVerildi,');
    for (const k of ['d.olcumEksik,', 'd.olcumIptal,', 'd.olcumHata,']) expect(govde).toContain(`title: ${k}`);
    const tr = baglantilarSozlugu.tr.donus;
    const en = baglantilarSozlugu.en.donus;
    expect(tr.olcumVerildi).toBe('Ölçüm izinleri verildi');
    expect(en.olcumVerildi).toBeTruthy();
    expect(en.olcumVerildi).not.toBe(tr.olcumVerildi);
    // DÖRT AYRI cümle: ikisi aynı olursa iki sonuç ekranda ayırt edilemez.
    expect(new Set([tr.olcumVerildi, tr.olcumEksik, tr.olcumIptal, tr.olcumHata]).size).toBe(4);
    // Yanlış hesap / ret: sunucunun cümlesi ekranda (sessiz hata yasağı).
    expect(govde).toMatch(/body: message \?\?/);
  });
});
