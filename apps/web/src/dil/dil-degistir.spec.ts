import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DİL DEĞİŞİMİ ARA DURUM BIRAKMIYOR (canlı bulgu, 2026-10-16). `degistir`
 * önce istemci durumunu çeviriyordu: istemci parçaları yeni dilde, sunucu
 * parçaları eski dilde kalıyor ve `DilEsitle` eski profili görüp dili GERİ
 * çeviriyordu. Panelde bileşen çizen test altyapısı yok; kural fonksiyon
 * gövdesinden, yorumsuz kaynakta okunuyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'saglayici.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function govde(): string {
  const i = KAYNAK.indexOf("const degistir = useCallback");
  if (i === -1) throw new Error('degistir bulunamadı — tarama boşa düştü');
  const bas = KAYNAK.indexOf('{', KAYNAK.indexOf('=>', i));
  let d = 0;
  for (let j = bas; j < KAYNAK.length; j++) {
    if (KAYNAK[j] === '{') d++;
    if (KAYNAK[j] === '}' && --d === 0) return KAYNAK.slice(bas, j + 1);
  }
  throw new Error('degistir kapanmadı');
}

describe('dil değişimi', () => {
  it('BOŞA DÜŞME BEKÇİSİ: gövde bulundu', () => {
    expect(govde()).toContain('dilCereziYaz(yeni)');
  });

  it('KRİTİK: istemci durumu ara adımda çevrilmiyor (setDil yok)', () => {
    expect(govde()).not.toContain('setDil(');
  });

  it('KRİTİK: profil ÇEREZDEN ÖNCE yazılıyor (yazılamazsa hiçbir şey değişmesin)', () => {
    const g = govde();
    expect(g.indexOf("apiFetch('/auth/locale'")).toBeGreaterThan(-1);
    expect(g.indexOf("apiFetch('/auth/locale'")).toBeLessThan(g.indexOf('dilCereziYaz(yeni)'));
  });

  it('KRİTİK: her iki dalda tam sayfa yüklemesi (router.refresh değil)', () => {
    const g = govde();
    expect(g).toContain('location.reload()');
    expect(g).toContain('location.assign(');
    expect(g).not.toContain('router.');
  });
});
