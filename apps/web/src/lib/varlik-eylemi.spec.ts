import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eylemHedefiCoz, varlikEylemMetni } from './varlik-eylemi';

const taban = { seviye: 'ad' as const, id: 'x', ad: 'Reklam X' };

describe('Reklam Yöneticisi satır içi durdur/başlat (2026-10-10)', () => {
  it('KRİTİK: yalnız Meta ve Google, yalnız yayında/duraklatılmış satır', () => {
    expect(eylemHedefiCoz({ ...taban, platform: 'meta', durum: 'active' })?.yayinda).toBe(true);
    expect(eylemHedefiCoz({ ...taban, platform: 'google', durum: 'paused' })?.yayinda).toBe(false);
    expect(eylemHedefiCoz({ ...taban, platform: 'linkedin', durum: 'active' })).toBeNull();
    for (const d of ['deleted', 'pending_review', 'ended', 'unknown']) {
      expect(eylemHedefiCoz({ ...taban, platform: 'meta', durum: d }), d).toBeNull();
    }
  });

  it('KRİTİK: set/kampanya durdurmanın altındakileri de durdurduğu SÖYLENİYOR', () => {
    const h = (seviye: 'campaign' | 'ad_group' | 'ad') => varlikEylemMetni({ ...taban, seviye, platform: 'meta', yayinda: true });
    expect(h('campaign').aciklama).toContain('bütün reklam setleri ve reklamlar da yayın yapmaz');
    expect(h('ad_group').aciklama).toContain('bütün reklamlar da yayın yapmaz');
    expect(h('ad').aciklama).toContain('Reklam seti ve kampanya çalışmaya devam eder');
    expect(h('ad_group').baslik).toBe('Reklam setini durdur: onay');
  });

  it('KRİTİK: tablo düğmesi yalnız yazabilene; pencere sunucu cevabını yutmuyor', () => {
    const t = readFileSync(join(__dirname, '..', 'components', 'taslak', 'reklam-yoneticisi-tablosu.tsx'), 'utf8');
    expect(t).toContain('const eylemSutunu = yazabilir && satirlar.some((r) => r.eylemHedefi !== null);');
    const p = readFileSync(join(__dirname, '..', 'components', 'taslak', 'varlik-eylem-penceresi.tsx'), 'utf8');
    expect(p).toContain("setMesaj(e instanceof ApiRequestError ? e.message : 'İstek gönderilemedi.');");
    expect(p).toContain("`/campaigns/varliklar/${hedef.seviye}/${hedef.id}/eylem`");
  });
});
