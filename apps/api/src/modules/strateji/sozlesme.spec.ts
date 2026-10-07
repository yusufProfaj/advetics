import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dagilimKaydetSchema,
  dagilimToplamDenetimi,
  duzenlenebilirMi,
  gecisMumkunMu,
  matrisButceDenetimi,
  matrisSatiriGirdiSchema,
  planEylemSchema,
  planOlusturSchema,
  PLAN_DURUMLARI,
  PLAN_EYLEMLERI,
  PLAN_GECISLERI,
  PLAN_SON_DURUMLARI,
  resolvePermissions,
  STRATEJI_PLATFORMLARI,
  STRATEJI_SAYFA_IZNI,
  STRATEJI_UCLARI,
} from '@advetics/shared';

/**
 * ═══ ADVSTRATEGY SÖZLEŞMESİ (Ajan 1) ═══
 *
 * Ajan 2 ve 3 bu sözleşmeden okuyor; burada kilitlenen her kural iki tarafta
 * aynı davranışı garanti ediyor. Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor.
 */
describe('durum makinesi', () => {
  it('KRİTİK: son olmayan her durumun bir çıkışı var (kalıcı kilit yok)', () => {
    /*
     * "Açık plan" tekil indeksi taslak/onayda/onaylandi'yi kapsayacak. Bu
     * durumlardan birinin çıkışı olmazsa o ay için BİR DAHA plan
     * açılamaz (boost `active` dersi).
     */
    for (const d of PLAN_DURUMLARI) {
      const cikislar = PLAN_EYLEMLERI.filter((e) => gecisMumkunMu(d, e));
      if (PLAN_SON_DURUMLARI.includes(d)) expect(cikislar, d).toEqual([]);
      else expect(cikislar.length, d).toBeGreaterThan(0);
    }
  });

  it('KRİTİK: her son olmayan durum iptal edilebilir; aktarılmış plan iptal edilemez', () => {
    for (const d of PLAN_DURUMLARI.filter((x) => !PLAN_SON_DURUMLARI.includes(x))) {
      expect(gecisMumkunMu(d, 'iptal'), d).toBe(true);
    }
    expect(gecisMumkunMu('aktarildi', 'iptal')).toBe(false);
  });

  it('KRİTİK: onaydaki plan düzenlenemez; onaylanan belge değişmez', () => {
    expect(duzenlenebilirMi('taslak')).toBe(true);
    for (const d of PLAN_DURUMLARI.filter((x) => x !== 'taslak')) expect(duzenlenebilirMi(d), d).toBe(false);
  });

  it('aktarım yalnız onaylı plandan; onaysız plan AdvCampaign\'e gitmez', () => {
    expect(PLAN_GECISLERI.aktar.kaynak).toEqual(['onaylandi']);
    expect(gecisMumkunMu('onayda', 'aktar')).toBe(false);
  });
});

describe('bütçe denetimleri', () => {
  it('dağılım toplamı plan toplamını aşamaz; az olursa kalan söylenir', () => {
    expect(dagilimToplamDenetimi([100n, 50n], 200n)).toEqual({ tamam: true, kalanMicros: 50n });
    expect(dagilimToplamDenetimi([150n, 60n], 200n)).toEqual({ tamam: false, asimMicros: 10n });
  });

  it('KRİTİK: matris, dağılımdaki hücreyi aşınca o hücreyi bildirir', () => {
    const asim = matrisButceDenetimi(
      [{ platform: 'meta', katman: 'soguk', tutarMicros: 100n }],
      [
        { platform: 'meta', katman: 'soguk', tutarMicros: 60n },
        { platform: 'meta', katman: 'soguk', tutarMicros: 50n },
      ],
    );
    expect(asim).toEqual([
      { platform: 'meta', katman: 'soguk', dagilimMicros: 100n, matrisMicros: 110n, asimMicros: 10n },
    ]);
  });

  it('KRİTİK: dağılımda olmayan hücre SIFIR bütçe sayılır, serbest değil', () => {
    const asim = matrisButceDenetimi([], [{ platform: 'google', katman: 'soguk', tutarMicros: 1n }]);
    expect(asim).toHaveLength(1);
    expect(asim[0]!.dagilimMicros).toBe(0n);
  });
});

describe('şemalar', () => {
  const satir = {
    platform: 'meta' as const,
    katman: 'soguk' as const,
    niyet: 'FORM' as const,
    kitleSablonuId: null,
    kelimeGrubu: null,
    varlikIdleri: [],
    tutar: '100',
  };

  it('Meta satırı kitle istiyor; Google arama satırı kitlesiz olabilir', () => {
    expect(matrisSatiriGirdiSchema.safeParse(satir).success).toBe(false);
    expect(matrisSatiriGirdiSchema.safeParse({ ...satir, platform: 'google' }).success).toBe(true);
  });

  it('aynı (platform, katman) dağılımda iki kez yazılamaz', () => {
    const tek = [{ platform: 'meta', katman: 'soguk', tutar: '1' }];
    // Önce GEÇERLİ hâl geçiyor: ret başka bir sebepten (ör. eksik sürüm)
    // gelseydi aşağıdaki iddia boşa düşerdi.
    expect(dagilimKaydetSchema.safeParse({ surum: 1, satirlar: tek }).success).toBe(true);
    const r = dagilimKaydetSchema.safeParse({ surum: 1, satirlar: [...tek, { ...tek[0], tutar: '2' }] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('iki kez');
  });

  it('düzenleme gövdesi sürüm taşımak zorunda (eşzamanlı düzenleme ezilmesin)', () => {
    expect(dagilimKaydetSchema.safeParse({ satirlar: [] }).success).toBe(false);
    expect(planEylemSchema.safeParse({ eylem: 'onaya_gonder' }).success).toBe(false);
    expect(planEylemSchema.safeParse({ eylem: 'onaya_gonder', surum: 3 }).success).toBe(true);
  });

  it('tutar girdisi girişte uzunlukla sınırlı (asıl üst sınır sunucuda)', () => {
    expect(planOlusturSchema.safeParse({ clientId: '00000000-0000-4000-8000-000000000000', donem: '2026-11', toplamButce: '200.000' }).success).toBe(true);
    expect(planOlusturSchema.safeParse({ clientId: '00000000-0000-4000-8000-000000000000', donem: '2026-11', toplamButce: '9'.repeat(25) }).success).toBe(false);
  });

  it('KRİTİK: onay eylem ucundan yapılamaz', () => {
    expect(planEylemSchema.safeParse({ eylem: 'onayla', surum: 1 }).success).toBe(false);
  });

  it('KRİTİK: platform listesi kasıtlı olarak dar, LinkedIn yok', () => {
    // PLATFORMS'tan türetilseydi LinkedIn plana girer ve AdvCampaign'e
    // aktarılamayan satır üretirdi.
    expect([...STRATEJI_PLATFORMLARI]).toEqual(['meta', 'google']);
  });
});

describe('uçlar ve yetkiler', () => {
  it('her (yöntem, yol) tekil', () => {
    const anahtarlar = STRATEJI_UCLARI.map((u) => `${u.yontem} ${u.yol}`);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
  });

  it('KRİTİK: onay kendi ucunda ve kendi izninde; yazma izni onaylatmıyor', () => {
    const onay = STRATEJI_UCLARI.filter((u) => u.izin === 'strategy.approve');
    expect(onay.map((u) => u.yol)).toEqual(['/strateji/planlar/:id/onayla']);
  });

  it('KRİTİK: müşteri hesabı planı görür ve onaylar, YAZAMAZ', () => {
    const m = resolvePermissions('client_viewer');
    expect(m.has('strategy.read')).toBe(true);
    expect(m.has('strategy.approve')).toBe(true);
    expect(m.has('strategy.write')).toBe(false);
  });

  it('reklam yöneticisi üçüne de sahip; sayfa izni okuma izni', () => {
    const r = resolvePermissions('ad_manager');
    for (const i of ['strategy.read', 'strategy.write', 'strategy.approve'] as const) expect(r.has(i), i).toBe(true);
    expect(STRATEJI_SAYFA_IZNI).toBe('strategy.read');
  });
});

describe('Google kelime fikirleri isteği', () => {
  const KAYNAK = readFileSync(
    join(__dirname, '../connections/providers/google.provider.ts'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const bas = KAYNAK.indexOf('async kelimeFikirleri(');
  const govde = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }\n', bas));

  it('gövde gerçekten yakalandı', () => {
    expect(bas).toBeGreaterThan(-1);
    expect(govde).toContain(':generateKeywordIdeas');
  });

  it('KRİTİK: dil, konum ve ağ AÇIKÇA gönderiliyor', () => {
    // Boş = "her yer, her dil": Türk müşterinin planına dünya hacmi girer.
    expect(govde).toContain('language: girdi.dilKaynagi');
    expect(govde).toContain('geoTargetConstants: girdi.konumKaynaklari');
    expect(govde).toContain("keywordPlanNetwork: 'GOOGLE_SEARCH'");
  });

  it('KRİTİK: hacim yoksa null, sıfır değil', () => {
    expect(govde).toContain('avgMonthlySearches ?? null');
  });
});
