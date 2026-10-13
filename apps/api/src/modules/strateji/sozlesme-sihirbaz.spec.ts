import { describe, expect, it } from 'vitest';
import {
  amacGunlukAsgari,
  oncelikAgirliklari,
  oncelikPaylari,
  sihirbazButceKontrolu,
  sihirbazGirdiImzasi,
  stratejiIncelemeParcasi,
  stratejiSihirbazDurumuSchema,
  stratejiSihirbazKaydetSchema,
  stratejiSihirbazOlusturSchema,
  type RehberAmacKodu,
  type RehberPlatformu,
} from '@advetics/shared';

/**
 * Adım adım akışın SÖZLEŞMESİ (packages/shared/src/strateji/v2/sihirbaz.ts),
 * ÇALIŞTIRILARAK. Bütçe adımının kapısı ve motorun bölmesi aynı fonksiyonlar:
 * ayrışırlarsa adım "yeter" derken plan asgarinin altında kampanya önerir.
 */
const M = 1_000_000n;

describe('öncelik bölmesi', () => {
  it('KRİTİK: ağırlıklar seçim sırasıyla n..1; paylar toplamı TAM ve kalan kuruş ilk hedefte', () => {
    expect(oncelikAgirliklari(3)).toEqual([3, 2, 1]);
    const p = oncelikPaylari(100_000n * M, 3, 'TRY');
    expect(p.reduce((a, b) => a + b, 0n)).toBe(100_000n * M);
    // 100.000 × 3/6 = 50.000; 2/6 = 33.333,33; 1/6 = 16.666,66; kalan 0,01 ilk hedefe.
    expect(p).toEqual([50_000_010_000n, 33_333_330_000n, 16_666_660_000n]);
    expect(p[0]! > p[1]! && p[1]! > p[2]!).toBe(true);
  });
  it('tek hedef bütçenin tamamı; sıfır/boş liste boş', () => {
    expect(oncelikPaylari(5n * M, 1, 'TRY')).toEqual([5n * M]);
    expect(oncelikPaylari(0n, 2, 'TRY')).toEqual([]);
    expect(oncelikPaylari(5n * M, 0, 'TRY')).toEqual([]);
  });
});

describe('platform asgarisi — tek kural', () => {
  const a = { meta: 50n * M, googleTalepYaratma: 250n * M };
  it('Google Arama sınırsız (0), Talep Yaratma okunan, kurgusuz platform bilinmiyor; Meta hesaptan', () => {
    expect(amacGunlukAsgari('SITE', 'google', a)).toBe(0n);
    expect(amacGunlukAsgari('VIDEO', 'google', a)).toBe(250n * M);
    expect(amacGunlukAsgari('WHATSAPP', 'google', a)).toBeNull();
    expect(amacGunlukAsgari('FORM', 'meta', { meta: null, googleTalepYaratma: null })).toBeNull();
  });
});

describe('bütçe adımının kapısı', () => {
  const acik = (m: Partial<Record<RehberAmacKodu, RehberPlatformu[]>>) => (amac: RehberAmacKodu) => m[amac] ?? [];
  const kontrol = (toplam: bigint, amaclar: RehberAmacKodu[], platform: Partial<Record<RehberAmacKodu, RehberPlatformu[]>>, meta: bigint | null = 50n * M) =>
    sihirbazButceKontrolu({ amaclar, toplamMicros: toplam, gun: 30, paraBirimi: 'TRY', acikPlatformlar: acik(platform), asgari: { meta, googleTalepYaratma: 250n * M } });

  it('KRİTİK: yalnız Meta açık ve hedefe düşen günlük asgarinin altındaysa İLERLETMEZ ve nedeni tutarla yazar', () => {
    // 3.000 TL / 30 gün; iki hedef 2:1 → WhatsApp 1.000 TL = 33,33 TL/gün < 50.
    const r = kontrol(3_000n * M, ['FORM', 'WHATSAPP'], { FORM: ['meta'], WHATSAPP: ['meta'] });
    expect(r.ilerler).toBe(false);
    const w = r.satirlar.find((s) => s.amac === 'WHATSAPP')!;
    expect(w.durum).toBe('yetmez');
    expect(w.cumle).toContain('50,00 TL');
    expect(w.cumle).toContain('33,33 TL');
    expect(r.satirlar.find((s) => s.amac === 'FORM')!.durum).toBe('yeter');
  });
  it('KRİTİK: iki platformdan biri yetiyorsa (Google Arama sınırsız) ilerler', () => {
    const r = kontrol(300n * M, ['SITE'], { SITE: ['meta', 'google'] });
    expect(r.satirlar[0]!.durum).toBe('yeter');
    expect(r.ilerler).toBe(true);
  });
  it('KRİTİK: asgari okunamadıysa uydurulmaz: "bilinmiyor" ve ilerler', () => {
    const r = kontrol(300n * M, ['FORM'], { FORM: ['meta'] }, null);
    expect(r.satirlar[0]!.durum).toBe('bilinmiyor');
    expect(r.satirlar[0]!.cumle).toMatch(/kontrol edilemedi/);
    expect(r.ilerler).toBe(true);
  });
  it('hedef yoksa ilerlemez', () => {
    expect(kontrol(1_000n * M, [], {}).ilerler).toBe(false);
  });
});

describe('sihirbaz durumu ve gövdeler', () => {
  const s = { adim: 'butce', amaclar: ['FORM', 'SITE'], konumlar: [], kitle: null, incelenen: null };
  it('KRİTİK: aynı hedef iki kez seçilemez; bilinmeyen adım reddedilir', () => {
    expect(stratejiSihirbazDurumuSchema.safeParse(s).success).toBe(true);
    expect(stratejiSihirbazDurumuSchema.safeParse({ ...s, amaclar: ['FORM', 'FORM'] }).success).toBe(false);
    expect(stratejiSihirbazDurumuSchema.safeParse({ ...s, adim: 'duzenle' }).success).toBe(false);
  });
  it('kaydet sürüm ister; oluşturma v2 şemasının üstüne isteğe bağlı durum alır', () => {
    expect(stratejiSihirbazKaydetSchema.safeParse({ sihirbaz: s }).success).toBe(false);
    expect(stratejiSihirbazKaydetSchema.safeParse({ surum: 2, sihirbaz: s, donem: { baslangicAyi: '2026-11', sureAy: 4 } }).success).toBe(false);
    const g = { clientId: '11111111-1111-4111-8111-111111111111', baslangicAyi: '2026-11', sureAy: 2, toplamButce: '50.000' };
    expect(stratejiSihirbazOlusturSchema.safeParse(g).success).toBe(true);
    expect(stratejiSihirbazOlusturSchema.safeParse({ ...g, sihirbaz: s }).success).toBe(true);
  });
  it('KRİTİK: inceleme imzası girdiyle değişir, onaylanmamış kitle taslağıyla değişmez', () => {
    const plan = { baslangic: '2026-11-01', bitis: '2026-12-31', toplamButceMicros: '1' };
    const temel = { amaclar: ['FORM', 'SITE'] as RehberAmacKodu[], konumlar: [], kitle: null };
    const i = sihirbazGirdiImzasi(temel, plan);
    expect(sihirbazGirdiImzasi(temel, plan)).toBe(i);
    expect(sihirbazGirdiImzasi({ ...temel, amaclar: ['SITE', 'FORM'] }, plan)).not.toBe(i);
    expect(sihirbazGirdiImzasi(temel, { ...plan, toplamButceMicros: '2' })).not.toBe(i);
    expect(sihirbazGirdiImzasi({ ...temel, kitle: { metin: 'x', kaynak: 'ai', onaylandi: false } }, plan)).toBe(i);
    expect(sihirbazGirdiImzasi({ ...temel, kitle: { metin: 'x', kaynak: 'ajans', onaylandi: true } }, plan)).not.toBe(i);
  });
  it('inceleme parçası yalnız listeden', () => {
    expect(stratejiIncelemeParcasi('meta')).toBe('meta');
    expect(stratejiIncelemeParcasi('dagitim')).toBeNull();
  });
});
