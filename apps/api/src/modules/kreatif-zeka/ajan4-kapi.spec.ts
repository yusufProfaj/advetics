import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ETIKET_SINIRI,
  briefMetniDenetle,
  farkCumlesi,
  resolvePermissions,
  type EtiketFarki,
  type GoruEtiketleri,
  type TenantContext,
} from '@advetics/shared';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { gunOnce, kreatifTohumla, png } from '../../../test/kreatif-tohum';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import { KreatifZekaController } from './kreatif-zeka.controller';
import { kreatifEtiketIsi, type EtiketIsiBagimliliklari } from './etiket-isi';
import { istanbulGunu } from './sayac';

/**
 * ═══ AJAN 4 KAPI TESTLERİ — PAKET D (kreatif zekâsı) ═══
 *
 * Bu dosyadaki testlerin bir kısmı BİLEREK KIRMIZI: bulguyu kilitliyorlar
 * ve düzeltmeyi bulguyu üreten ajan yapacak (CLAUDE.md beş ajan düzeni).
 * Kırmızı olanlar başlıkta "Ö-n" taşıyor; yeşil olanlar kapının açık
 * kalması için gereken bekçiler.
 */

// ─── Ö-1: maliyet metriğinde fark cümlesi UYDURMA bir üst sınır yazıyor ─────

describe('Ö-1 farkCumlesi: verim aralığının alt ucu -%100 ya da altındaysa', () => {
  /*
   * Verim ölçeğindeki göreli aralık [-1,24 ; -0,26]: üst uç sıfırın altında,
   * yani karar "anlamlı" ve A (örn. "insan var") maliyette daha KÖTÜ.
   * Maliyete çevirme `1/(1+g) - 1`; g ≤ -1 iken bu ifade sonsuz ya da
   * NEGATİF çıkıyor ve sıralama mutlak değere göre yapıldığı için cümle
   * "%35 ile %517 arası daha yüksek" diyor. %517 hiçbir ölçümden gelmiyor:
   * gerçek bilgi "en az %35 daha yüksek" (üst sınırı yok). Brief'in ve
   * ekranın SAYI TAŞIYAN TEK cümlesi bu ve şablon sayı uyduruyor.
   */
  const fark = (alt: number, ust: number): EtiketFarki => ({
    karar: 'anlamli',
    yetersizNedeni: null,
    a: { ortalama: 0.5, kreatif: 8, etkinOrneklem: 6, standartHata: 0.2, harcamaMicros: 1n },
    b: { ortalama: 2, kreatif: 9, etkinOrneklem: 7, standartHata: 0.2, harcamaMicros: 1n },
    goreliFark: -0.75,
    aralik: [alt, ust],
  });

  it('kontrol: alt uç -1’in üstündeyken cümle iki uçlu ve doğru', () => {
    const c = farkCumlesi('insan', 'var', 'donusum_verimi', fark(-0.5, -0.2));
    // verim -%50 → maliyet +%100; verim -%20 → maliyet +%25
    expect(c).toContain('%25 ile %100 arası daha yüksek');
  });

  it('KIRMIZI: alt uç -1,24 → "%517" gibi uydurma bir üst sınır YAZILMAMALI', () => {
    const c = farkCumlesi('insan', 'var', 'donusum_verimi', fark(-1.24, -0.26));
    expect(c).toContain('%35');
    expect(c).not.toMatch(/%517/);
  });

  it('KIRMIZI: alt uç tam -1 → cümlede "Infinity" OLMAMALI', () => {
    const c = farkCumlesi('insan', 'var', 'donusum_verimi', fark(-1, -0.3));
    expect(c).not.toMatch(/Infinity|NaN/);
  });
});

// ─── Ö-2: rakam yasağı yalnız ASCII rakamı görüyor ─────────────────────────

describe('Ö-2 briefMetniDenetle: sayı yazıyla ya da ASCII dışı rakamla gelirse', () => {
  const bulgular = [{ alan: 'insan' as const }];
  const cevap = (talimat: string) => ({ yon: 'İnsanlı ve sade görseller', talimatlar: [{ alan: 'insan', talimat }], kacin: [] });

  it('kontrol: ASCII rakam reddediliyor', () => {
    expect(briefMetniDenetle(cevap('Tıklama %30 artar'), bulgular).ok).toBe(false);
  });

  it('KIRMIZI: "yüzde otuz" yazıyla uydurulmuş oran REDDEDİLMELİ', () => {
    // Model "RAKAM YAZMA" talimatına harfiyen uyup sayıyı yazıyla verebilir;
    // ret yalnız /\d/ ile yapıldığı için uydurma oran brief'e ve AdvCampaign'e gider.
    expect(briefMetniDenetle(cevap('İnsanlı görsel tıklamayı yüzde otuz artırır'), bulgular).ok).toBe(false);
  });

  it('KIRMIZI: tam genişlikli rakam (３０％) REDDEDİLMELİ', () => {
    // JS /\d/ (u bayraksız) yalnız 0-9; U+FF10.. aralığı geçiyor.
    expect(briefMetniDenetle(cevap('Tıklama ３０％ artar'), bulgular).ok).toBe(false);
  });
});

// ─── İzin: GERÇEK bekçi (PermissionsGuard + Reflector) ──────────────────────

describe('izin: müşteri hesabı Gemini harcatamaz (gerçek PermissionsGuard)', () => {
  const guard = new PermissionsGuard(new Reflector());
  const baglam = (metot: keyof KreatifZekaController, rol: 'client_viewer' | 'ad_manager'): ExecutionContext => {
    const tenant = { permissions: [...resolvePermissions(rol)], isOrgAdmin: false } as unknown as TenantContext;
    return {
      getHandler: () => KreatifZekaController.prototype[metot],
      getClass: () => KreatifZekaController,
      switchToHttp: () => ({ getRequest: () => ({ tenant }) }),
    } as unknown as ExecutionContext;
  };

  it('KRİTİK: client_viewer beş uçta da 403 (etiketle ve brief para harcıyor)', () => {
    for (const m of ['oku', 'gorsel', 'etiketle', 'brief', 'advcampaign'] as const) {
      expect(() => guard.canActivate(baglam(m, 'client_viewer')), m).toThrow(ForbiddenException);
    }
  });

  it('ad_manager beş uca da geçiyor (bekçi ölü bir kilit değil)', () => {
    for (const m of ['oku', 'gorsel', 'etiketle', 'brief', 'advcampaign'] as const) {
      expect(guard.canActivate(baglam(m, 'ad_manager')), m).toBe(true);
    }
  });

  it('etiketle ve brief rule.write istiyor; rule.read tek başına yetmiyor', () => {
    const tenant = { permissions: ['rule.read'], isOrgAdmin: false } as unknown as TenantContext;
    const ctx = (m: 'etiketle' | 'brief') =>
      ({
        getHandler: () => KreatifZekaController.prototype[m],
        getClass: () => KreatifZekaController,
        switchToHttp: () => ({ getRequest: () => ({ tenant }) }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx('etiketle'))).toThrow(/rule\.write/);
    expect(() => guard.canActivate(ctx('brief'))).toThrow(/rule\.write/);
  });
});

// ─── Ö-3: hak küresel/aylık sınırdan kısıldığında neden YANLIŞ yazılıyor ────

describe('Ö-3 etiket işi: bu koşunun hakkı workspace günlüğünden DEĞİL başka sınırdan kısılınca', () => {
  let h: Harness;
  const GECERLI: GoruEtiketleri = {
    insan: 'var',
    urun_gorunur: 'yok',
    metin_yogunlugu: 'az',
    baskin_renk: 'sicak',
    eylem_cagrisi_gorselde: 'yok',
    fiyat_veya_indirim: 'yok',
    logo_gorunur: 'var',
    gorsel_turu: 'fotograf',
  };
  const GUNLER = [gunOnce(3), gunOnce(4)];

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
  });

  function bag(): EtiketIsiBagimliliklari {
    let n = 0;
    const gemini: MetinUretici = {
      model: 'gemini-test',
      uret: vi.fn(async () => ({ parcalar: [{ text: JSON.stringify(GECERLI) }], sebep: 'bitti' as const, aciklama: null, girdiToken: 1, ciktiToken: 1, onbellekToken: 0 })),
    };
    return {
      tx: h.db,
      gemini,
      adresTazele: vi.fn(async (_h: unknown, idler: string[]) => ({
        adresler: new Map(idler.map((id) => [id, { url: `https://scontent.fbcdn.net/${id}.jpg` }] as const)),
        kotaEngeli: null,
      })),
      indir: vi.fn(async () => ({ ok: true as const, bytes: png(1080, 1080, ++n), tur: 'png' as const })),
    };
  }
  const meta = (i: number) =>
    kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER, raw: { object_story_spec: { link_data: { image_hash: `ab${i}cd${i}ef` } } } });

  it('KIRMIZI: küresel sınıra 1 kalmışken ertelenenlerin nedeni "kuresel_gunluk" olmalı (workspace_gunluk değil)', async () => {
    for (let i = 0; i < 3; i++) await meta(i);
    const diger = '33333333-0000-4000-8000-0000000000a4';
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Diğer', 'diger-a4', now())`, [diger, IDS.org]);
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      diger,
      istanbulGunu(new Date()),
      ETIKET_SINIRI.kureselGunluk - 1,
    ]);
    const r = await kreatifEtiketIsi(bag(), IDS.adAccount);
    expect(r.sayim).toMatchObject({ etiketlendi: 1, ertelendi: 2 });
    // Ekran bu nedeni "bugünkü sınır doldu (40 kreatif)" diye yazıyor; workspace 1 kullandı.
    expect(r.sayim.bekciNedeni).toBe('kuresel_gunluk');
  });

  it('KIRMIZI: aylık sınıra 1 kalmışken nedeni "workspace_aylik" olmalı', async () => {
    for (let i = 0; i < 3; i++) await meta(i + 10);
    const bugun = istanbulGunu(new Date());
    // Bu ayın başka bir günü: ayın 1'i (bugün 1'iyse test aylık değil günlük sınırı sınar, atla).
    const ayBasi = `${bugun.slice(0, 8)}01`;
    if (ayBasi === bugun) return;
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      IDS.client,
      ayBasi,
      ETIKET_SINIRI.workspaceAylik - 1,
    ]);
    const r = await kreatifEtiketIsi(bag(), IDS.adAccount);
    expect(r.sayim).toMatchObject({ etiketlendi: 1, ertelendi: 2 });
    expect(r.sayim.bekciNedeni).toBe('workspace_aylik');
  });
});

// ─── Tazeleme çekirdeği: KATMAN çağırana göre (mutasyonla boş çıkan nokta) ──

describe('tazeleme çekirdeği: kota katmanı çağırana göre (rapor %50, iş %50, yapı %90 DEĞİL)', () => {
  /*
   * Çekirdek Paket D'de `hesapAdresleri`ne çıkarıldı ve katman artık
   * PARAMETRE. Ajan 4 mutasyonu: raporun katmanını `report_creative`ten
   * başka bir şeye çevirmek mevcut 19 rapor testinin HİÇBİRİNİ düşürmedi —
   * sahte kota `acquire`ın argümanına bakmıyordu. Yanlış katman (örn. %90
   * tavanlı `structure`) anonim paylaşım bağlantısından tetiklenen rapor
   * trafiğinin yapı taramasını kalıcı kilide sokması demek (CLAUDE.md).
   */
  it('KRİTİK: rapor tazelemesi kotayı report_creative katmanıyla soruyor', async () => {
    const { KreatifAdresiService } = await import('../reports/kreatif-adresi.service');
    const acquire = vi.fn(async (_g: { layer: string; adAccountId: string }) => ({ allowed: true, reason: null }));
    const hesap = { id: 'aa-1', clientId: 'c-1', platform: 'meta' as const, externalId: 'act_1', connectionId: 'conn-1', managerExternalId: null };
    const svc = new KreatifAdresiService(
      { withTenant: async (_c: unknown, fn: (tx: unknown) => unknown) => fn({ adAccount: { findMany: async () => [hesap] } }) } as never,
      { get: () => ({ platform: 'meta', fetchCreativeImageUrls: async (_c: unknown, idler: string[]) => new Map(idler.map((i) => [i, { url: `https://scontent.fbcdn.net/${i}.jpg` }])) }) } as never,
      { getAccessToken: async () => 'T' } as never,
      { acquire, record: vi.fn() } as never,
    );
    await svc.tazele({} as TenantContext, { topAds: [{ creativeExternalId: 'cr-1', adAccountId: 'aa-1', imageUrl: null }] } as never);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0]![0]).toMatchObject({ layer: 'report_creative', adAccountId: 'aa-1' });
  });

  it('KRİTİK: etiketleme işi tazelemeyi creative_tag katmanıyla bağlıyor (yorumsuz kaynakta)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const kaynak = readFileSync(join(__dirname, 'kreatif-etiket.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const cagri = kaynak.slice(kaynak.indexOf('this.adres.hesapAdresleri('));
    expect(cagri.length, 'çağrı bulunamadı (tarama boşa düşmesin)').toBeGreaterThan(30);
    expect(cagri.slice(0, cagri.indexOf(')') + 120)).toMatch(/katman:\s*'creative_tag'/);
  });
});
