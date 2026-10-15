import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ETKISIZ_GUN, erisimYasi } from './erisim-yasi';

const SIMDI = Date.parse('2026-10-15T12:00:00Z');
const once = (gun: number) => new Date(SIMDI - gun * 86_400_000).toISOString();

describe('erişim yaşı', () => {
  it('KRİTİK: 90 günü geçen işaretli, öncesi değil', () => {
    expect(erisimYasi(once(ETKISIZ_GUN - 1), SIMDI)).toBeNull();
    expect(erisimYasi(once(ETKISIZ_GUN), SIMDI)).toEqual({ tur: 'uzun', metin: '90 gündür giriş yok; ayrıldıysa erişimini kaldır' });
  });

  it('KRİTİK: hiç giriş yapmamış ayrı söyleniyor', () => {
    expect(erisimYasi(null, SIMDI)).toEqual({ tur: 'hic', metin: 'Hiç giriş yapmadı' });
  });

  it('workspace erişim listesi ortak fonksiyonu kullanıyor', () => {
    const k = readFileSync(join(__dirname, '../components/tenancy/team-manager.tsx'), 'utf8');
    expect(k).toContain('const y = erisimYasi(member.lastLoginAt);');
  });

  it('KRİTİK: asıl Ekip ekranında Son giriş sütunu ve işaret var', () => {
    const k = readFileSync(join(__dirname, '../components/tenancy/team-screen.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toContain("anahtar: 'giris',");
    expect(k).toContain('const y = erisimYasi(k.lastLoginAt);');
  });
});
