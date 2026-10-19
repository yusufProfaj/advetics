import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MCP_ONAY_DURUMLARI, okumaAnahtariOlusturSchema } from '@advetics/shared';
import { ONAY_DURUM_HALI, ozetSatirlari, sureSecenekleri, sureyiUyarla } from './mcp-mantik';
import { YAZMA_YER_TUTUCU, baglantiOrnekleri } from './baglanti-ornekleri';

/**
 * Yapay zekâ bağlantısı paneli (`docs/okuma-api/MCP-YAZMA-MIMARI.md`):
 * panelin gösterdiği süreler SUNUCUNUN kabul ettikleriyle aynı olmalı;
 * yoksa kullanıcı ancak "Oluştur"a basınca reddedileceği bir seçeneği görür.
 */
describe('KRİTİK: süre seçenekleri sunucunun kuralıyla aynı', () => {
  for (const yetki of ['okuma', 'yazma'] as const) {
    it(`${yetki}: gösterilen her süre kabul ediliyor`, () => {
      for (const g of sureSecenekleri(yetki)) {
        const gecerlilikGun = g === 'suresiz' ? null : g;
        expect(okumaAnahtariOlusturSchema.safeParse({ ad: 'a', yetki, gecerlilikGun }).success, `${yetki} ${g}`).toBe(true);
      }
    });
  }
  it('yazmada süresiz ve 365 YOK; yazmaya geçince 90\'a iniyor, okumaya dönünce seçim kalıyor', () => {
    expect(sureSecenekleri('yazma')).not.toContain('suresiz');
    expect(sureSecenekleri('yazma')).not.toContain(365);
    expect(sureyiUyarla('yazma', 'suresiz')).toBe('90');
    expect(sureyiUyarla('yazma', '365')).toBe('90');
    expect(sureyiUyarla('yazma', '30')).toBe('30');
    expect(sureyiUyarla('okuma', '30')).toBe('30');
  });
});

describe('işlem tablosu', () => {
  it('her onay durumunun rozeti var; yeşil yalnız uygulanan, kırmızı yalnız başarısız', () => {
    for (const d of [...MCP_ONAY_DURUMLARI, 'suresi_doldu'] as const) expect(ONAY_DURUM_HALI[d], d).toBeDefined();
    const yesil = Object.entries(ONAY_DURUM_HALI).filter(([, h]) => h === 'ok').map(([d]) => d);
    expect(yesil).toEqual(['uygulandi']);
    expect(Object.entries(ONAY_DURUM_HALI).filter(([, h]) => h === 'hata').map(([d]) => d)).toEqual(['basarisiz']);
  });
  it('özet: iş satırı başta, workspace ve değişiklik altta; hiçbir satır kaybolmuyor', () => {
    const o = ['Workspace: Ege', 'Kampanya: Kış (Meta)', 'Bütçe: 300 → 450', 'Değişim: +50%'];
    const z = ozetSatirlari(o);
    expect(z.ana).toBe('Kampanya: Kış (Meta)');
    expect(z.alt).toBe('Workspace: Ege · Bütçe: 300 → 450');
    expect(z.tam.split('\n')).toEqual(o);
    expect(ozetSatirlari(['Workspace: Ege']).ana).toBe('Workspace: Ege');
  });
});

describe('bağlantı örnekleri', () => {
  it('yazma seçiliyken yer tutucu adv_rw_ (yanlış önekli örnek kopyalanmasın)', () => {
    const o = baglantiOrnekleri('https://advetics.com/api/mcp', null, 'tr', 'yazma');
    expect(o[0]!.metin).toContain(YAZMA_YER_TUTUCU);
    expect(baglantiOrnekleri('https://advetics.com/api/mcp', null, 'tr')[0]!.metin).toContain('adv_ro_');
  });
});

describe('KRİTİK: panel yetkiyi sunucuya gönderiyor ve varsayılan okuma (kaynak taraması)', () => {
  const KOD = readFileSync(join(__dirname, 'okuma-api-paneli.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('gövde yakalandı', () => expect(KOD.length).toBeGreaterThan(2000));
  it('POST gövdesinde yetki, varsayılan okuma', () => {
    expect(KOD).toContain("gecerlilikGun: sure === 'suresiz' ? null : Number(sure), yetki })");
    expect(KOD).toContain("useState<AnahtarYetkisi>('okuma')");
  });
});
