import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REHBER_ACILIS, type RehberGuncelle, type TenantContext } from '@advetics/shared';
import { AJANS_UST_HESAP, createHarness, seedAjans, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AppConfig } from '../../../config/configuration';
import { ReklamHazirlikService } from '../hazirlik.service';
import { ReklamTaslakService } from '../taslak.service';
import { ReklamYayinService } from '../yayin.service';
import type { ReklamKuyrugu } from '../reklam-kuyrugu';
import { RehberService } from './rehber.service';

/**
 * DALGA 3 — REHBER SERVİSİ, Google görsel kurguları (gerçek şema, sahte Google).
 *
 * Kritik iddialar: (1) Maks. Performans satın alma ölçümü olmadan Google'a
 * TEK mutate göndermiyor ve ölçüm prova anında TAZE okunuyor; (2) ölçüm
 * varken prova, varlık grubunu, görselleri (önbellekten) ve markayı taşıyan
 * gövdeyi validateOnly ile gönderiyor; (3) Talep Yaratma görselinde 9:16
 * uyarı, yatay/kare yokluğu engel; (4) Google'ın ±%1 kuralı GİRİŞ ANINDA.
 *
 * ERISIM/SATIS Google satırı `REHBER_ACILIS`te `kapali`; test süresince
 * `deneme`ye çekilip geri alınıyor (açılış tablosu kodda DEĞİŞMİYOR).
 */
let h: Harness;
let svc: RehberService;
let cagrilar: string[];
let sorgular: string[];
let mutateGovdeleri: Array<{ mutateOperations: Array<Record<string, unknown>>; validateOnly: boolean }>;
let satisSatiri: boolean | 'hata';

const GHESAP = '44444444-0000-4000-8000-0000000000a1';
const YATAY = '55555555-0000-4000-8000-0000000000b1';
const KARE = '55555555-0000-4000-8000-0000000000b2';
const DIKEY = '55555555-0000-4000-8000-0000000000b3';
const LOGO = '55555555-0000-4000-8000-0000000000b9';
const KOTU = '55555555-0000-4000-8000-0000000000b4';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  managerAccountId: AJANS_UST_HESAP,
} as TenantContext;

const sahteGoogle = {
  rehberMutate: async (_c: unknown, g: { mutateOperations: Array<Record<string, unknown>>; validateOnly: boolean }) => {
    cagrilar.push(`mutate:${g.validateOnly}`);
    mutateGovdeleri.push(g);
    return [];
  },
  rehberAra: async (_c: unknown, q: string) => {
    cagrilar.push('ara');
    sorgular.push(q);
    if (q.includes("category = 'PURCHASE'")) {
      if (satisSatiri === 'hata') throw new Error('PERMISSION_DENIED');
      return satisSatiri ? [{ conversionAction: { id: '1' } }] : [];
    }
    return [];
  },
  searchGeoLocations: async () => [{ key: 'geoTargetConstants/1012782', type: 'city', name: 'İzmir', label: 'İzmir, Turkey', countryCode: 'TR' }],
};

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  const config = {
    platforms: { meta: { apiVersion: 'v25.0' }, google: { apiVersion: 'v25' } },
    uploads: { dir: '/tmp' },
    redis: {},
  } as unknown as AppConfig;
  const kuyruk = {
    ekle: async () => undefined,
    ekleProva: async () => undefined,
    ekleGoogle: async () => undefined,
  } as unknown as ReklamKuyrugu;
  svc = new RehberService(
    prisma,
    new ReklamHazirlikService(prisma),
    new ReklamTaslakService(prisma),
    new ReklamYayinService(prisma, kuyruk, config),
    kuyruk,
    { getAccessToken: async () => 'TOKEN' } as never,
    { get: () => sahteGoogle } as never,
    { isEnabled: false } as never,
    { decrypt: () => 'T' } as never,
    config,
    null,
    {} as never,
    {} as never,
  );
  // Ağa çıkılmaz: site bağlantısı okuması sahte (okunamadı).
  svc.siteHtmlOku = async () => ({ ok: false, sebep: "test: ağ yok" });
});
afterAll(async () => h.close());

const eski = { SATIS: REHBER_ACILIS.SATIS.google, ERISIM: REHBER_ACILIS.ERISIM.google };
beforeEach(async () => {
  cagrilar = [];
  sorgular = [];
  mutateGovdeleri = [];
  satisSatiri = true;
  (svc as unknown as { onbellek: Map<string, unknown> }).onbellek.clear();
  await h.reset();
  await seedTenant(h);
  await seedAjans(h);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', now())`,
    [GHESAP, IDS.org, IDS.client, IDS.connection],
  );
  for (const [id, w, hh] of [
    [YATAY, 1200, 628],
    [KARE, 1200, 1200],
    [DIKEY, 1080, 1920],
    [LOGO, 512, 512],
    [KOTU, 1200, 640],
  ] as const) {
    await h.q(
      `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
       VALUES ($1, $2, $3, 'image', 'g', 'g.png', 'image/png', 1000, $4, $5, 'yok', $6, now())`,
      [id, IDS.org, IDS.client, w, hh, id],
    );
  }
  // Görseller ve logo hesapta ZATEN kayıtlı (önbellek): bayt okunmuyor.
  for (const [id, ref] of [
    [YATAY, 'customers/1234567890/assets/11'],
    [KARE, 'customers/1234567890/assets/12'],
    [LOGO, 'customers/1234567890/assets/19'],
  ] as const) {
    await h.q(
      `INSERT INTO asset_platform_refs (id, org_id, asset_id, platform, ad_account_id, external_ref) VALUES (gen_random_uuid(), $1, $2, 'google', $3, $4)`,
      [IDS.org, id, GHESAP, ref],
    );
  }
  await h.q(`INSERT INTO client_profiles (org_id, client_id, logo_asset_id, marka_adi, updated_at) VALUES ($1, $2, $3, 'Garden Villas', now())`, [IDS.org, IDS.client, LOGO]);
  (REHBER_ACILIS.SATIS as Record<string, string>).google = 'deneme';
  (REHBER_ACILIS.ERISIM as Record<string, string>).google = 'deneme';
});
afterAll(() => {
  (REHBER_ACILIS.SATIS as Record<string, string>).google = eski.SATIS;
  (REHBER_ACILIS.ERISIM as Record<string, string>).google = eski.ERISIM;
});

const g = (alan: string, deger: unknown, kaynak: RehberGuncelle['degisiklikler'][number]['kaynak'] = 'kullanici') => ({ alan, deger, kaynak });

async function rehber(amac: 'SATIS' | 'ERISIM', medya: string[]) {
  const r = await svc.olustur(CTX, IDS.client);
  await svc.guncelle(CTX, r.id, {
    surum: r.surum,
    degisiklikler: [
      g('amac', amac),
      g('platformlar', { meta: false, google: true }),
      g('googleHesabiId', GHESAP, 'workspace_profili'),
      g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi'),
      g('ekKategoriler', []),
      g('hedefAdres', 'https://ornek.com.tr/urun'),
      g('medya', medya.map((varlikId) => ({ varlikId }))),
      g('metin', { anaMetin: 'Denize yakın bahçeli villalar.', basliklar: ['Bir Başlık', 'İki Başlık', 'Üç Başlık'], aciklamalar: ['Kısa açıklama.', 'İkinci açıklama burada.'] }),
      g('butce', { tip: 'gunluk', micros: '500000000' }),
      g('takvim', { baslangic: '2030-01-01', bitis: null }),
    ],
  });
  return svc.konumlariEsle(CTX, r.id);
}

describe('Maks. Performans — satın alma ölçümü kapısı', () => {
  it('KRİTİK: ölçüm yoksa prova G-DONUSUM engeliyle durur, Google’a TEK mutate gitmez; ölçüm TAZE ve doğru sorguyla okundu', async () => {
    satisSatiri = false;
    const r = await rehber('SATIS', [YATAY, KARE]);
    const hata = await svc.prova(CTX, r.id).then(
      () => null,
      (e: { getResponse?: () => { eksikler?: Array<{ kod: string }> } }) => e,
    );
    expect(hata?.getResponse?.().eksikler?.map((e) => e.kod)).toContain('G-DONUSUM');
    expect(cagrilar.filter((c) => c.startsWith('mutate'))).toEqual([]);
    const q = sorgular.find((s) => s.includes("category = 'PURCHASE'"))!;
    expect(q).toMatch(/SELECT[\s\S]*conversion_action\.category[\s\S]*FROM conversion_action/);
    expect(q).toMatch(/primary_for_goal = TRUE/);
  });

  it('KRİTİK: ölçüm OKUNAMAZSA düzenlemede uyarı, prova ENGEL (G-DONUSUM-BILINMIYOR); mutate yok', async () => {
    satisSatiri = 'hata';
    const r = await rehber('SATIS', [YATAY, KARE]);
    const hata = await svc.prova(CTX, r.id).then(
      () => null,
      (e: { getResponse?: () => { eksikler?: Array<{ kod: string; seviye: string }> } }) => e,
    );
    expect(hata?.getResponse?.().eksikler?.find((e) => e.kod === 'G-DONUSUM-BILINMIYOR')?.seviye).toBe('engel');
    expect(cagrilar.filter((c) => c.startsWith('mutate'))).toEqual([]);
    expect((await svc.oku(CTX, r.id)).eksikler.find((e) => e.kod === 'G-DONUSUM-BILINMIYOR')?.seviye).toBe('uyari');
  });

  it('KRİTİK: ölçüm VARSA prova validateOnly ile PERFORMANCE_MAX gövdesini gönderir (önbellekteki görseller, kampanyada marka)', async () => {
    const r = await rehber('SATIS', [YATAY, KARE, DIKEY]);
    const p = await svc.prova(CTX, r.id);
    expect(p.google).toMatchObject({ tur: 'gecti' });
    expect(cagrilar.filter((c) => c.startsWith('mutate'))).toEqual(['mutate:true']);
    const ops = mutateGovdeleri[0]!.mutateOperations;
    const k = (ops.find((o) => o.campaignOperation)!.campaignOperation as { create: Record<string, unknown> }).create;
    expect(k.advertisingChannelType).toBe('PERFORMANCE_MAX');
    expect(k.maximizeConversions).toEqual({});
    const baglar = ops.filter((o) => o.assetGroupAssetOperation).map((o) => (o.assetGroupAssetOperation as { create: { fieldType: string; asset: string } }).create);
    expect(baglar.find((b) => b.fieldType === 'MARKETING_IMAGE')!.asset).toBe('customers/1234567890/assets/11');
    expect(baglar.find((b) => b.fieldType === 'SQUARE_MARKETING_IMAGE')!.asset).toBe('customers/1234567890/assets/12');
    const marka = ops.filter((o) => o.campaignAssetOperation).map((o) => (o.campaignAssetOperation as { create: { fieldType: string; asset: string } }).create);
    expect(marka.find((b) => b.fieldType === 'LOGO')!.asset).toBe('customers/1234567890/assets/19');
    // 9:16 Google'a gitmedi ve bu ekranda söyleniyor.
    expect(p.google && 'not' in p.google ? p.google.not : '').toMatch(/9:16/);
    const kayit = await svc.oku(CTX, r.id);
    expect(kayit.eksikler.find((e) => e.kod === 'G-GORSEL-DIKEY')?.seviye).toBe('uyari');
    expect(kayit.kararlar.find((x) => x.kod === 'TEKLIF')?.google?.deger).toBe('En çok dönüşüm');
  });
});

describe('Talep Yaratma görsel — giriş anında Google kuralları', () => {
  it('KRİTİK: 1200×640 görsel (Meta için "yatay") Google’da ENGEL, yükleme anında; yatay/kare yoksa engel', async () => {
    const r = await rehber('ERISIM', [KOTU]);
    const e = r.eksikler.filter((x) => x.platform === 'google' && x.seviye === 'engel').map((x) => x.kod);
    expect(e).toContain('G-GORSEL-OLCU');
    const r2 = await rehber('ERISIM', [DIKEY]);
    expect(r2.eksikler.filter((x) => x.platform === 'google' && x.seviye === 'engel').map((x) => x.kod)).toContain('G-GORSEL-YOK');
  });

  it('karar tablosu: tıklama teklifi, YouTube akışı/Gmail/Keşfet', async () => {
    const r = await rehber('ERISIM', [YATAY, KARE]);
    expect(r.eksikler.filter((x) => x.seviye === 'engel')).toEqual([]);
    expect(r.kararlar.find((x) => x.kod === 'TEKLIF')?.google?.deger).toBe('En çok tıklama');
    expect(r.kararlar.find((x) => x.kod === 'NEREDE')?.google?.deger).toBe('YouTube akışı ve Shorts, Gmail, Keşfet');
  });
});

describe('başlamayan platform (canlı, rehber 37df523b, 2026-10-10)', () => {
  it('KRİTİK: yayına alınmış rehberde kaydı olmayan platform sebepli döner; taslakta sebep yok', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const [t] = await h.q<{ id: string }>(
      `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no, ad_account_id)
       VALUES ($1, $2, 'google', 'acemi', $3, 1, $4) RETURNING id::text`,
      [IDS.org, IDS.client, IDS.user, GHESAP],
    );
    await h.q(`UPDATE reklam_rehberi SET google_taslak_id = $1 WHERE id = $2`, [t!.id, r.id]);
    const taslakta = await svc.yayinDurumu(CTX, r.id);
    expect(taslakta.platformlar).toEqual([expect.objectContaining({ platform: 'google', durum: null, sebep: null })]);
    await h.q(`UPDATE reklam_rehberi SET durum = 'yayinda' WHERE id = $1`, [r.id]);
    const yayinda = await svc.yayinDurumu(CTX, r.id);
    expect(yayinda.platformlar[0]).toMatchObject({ platform: 'google', yayinId: null, durum: null });
    expect(yayinda.platformlar[0]!.sebep).toMatch(/başlamadı/);
  });
});

describe('aynı içerikle yeniden kur (canlı, 2026-10-11: "Yeni reklam" boş açıyordu)', () => {
  it('KRİTİK: alanlar kopyalanır, takvim kopyalanmaz; başka workspace’in rehberi kopyalanamaz', async () => {
    const kaynak = await rehber('ERISIM', [YATAY, KARE]);
    const kopya = await svc.olustur(CTX, IDS.client, kaynak.id);
    expect(kopya.id).not.toBe(kaynak.id);
    expect(kopya.durum).toBe('taslak');
    expect(kopya.alanlar.amac?.deger).toBe('ERISIM');
    expect(kopya.alanlar.medya?.deger.map((x) => x.varlikId)).toEqual([YATAY, KARE]);
    expect(kopya.alanlar.butce?.deger).toEqual({ tip: 'gunluk', micros: '500000000' });
    expect(kopya.alanlar.takvim).toBeUndefined();
    // Başka workspace'in rehberi: içerik (hesap, görsel) bu taslağa taşınmaz.
    const OTEKI = '22222222-0000-4000-8000-0000000000c2';
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
    const [o] = await h.q<{ id: string }>(`INSERT INTO reklam_rehberi (org_id, client_id, olusturan_id, alanlar) VALUES ($1, $2, $3, '{}'::jsonb) RETURNING id::text`, [IDS.org, OTEKI, IDS.user]);
    await expect(svc.olustur(CTX, IDS.client, o!.id)).rejects.toThrow(/bulunamadı/);
    await expect(svc.olustur(CTX, IDS.client, '99999999-0000-4000-8000-000000000000')).rejects.toThrow(/bulunamadı/);
  });
});
