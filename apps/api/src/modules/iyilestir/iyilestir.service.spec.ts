import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ClientPacing, Oneri, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BudgetsService } from '../budgets/budgets.service';
import type { CampaignActionsService, SeviyeliUygulamaSonucu } from '../campaign-actions/campaign-actions.service';
import { IyilestirService } from './iyilestir.service';
import { gunEkle, oneriOzeti, pencereler } from './oneri-hesap';

/**
 * İYİLEŞTİR SERVİSİ — gerçek Postgres (PGlite), sahte platform.
 *
 * KRİTİK İDDİALAR (MIMARI § 8):
 *   · özet uyuşmazsa uygulama YOK (platforma tek çağrı bile gitmiyor),
 *   · geri okuma uyuşmazlığı karar satırına `uyusmadi` olarak yazılıyor,
 *   · kaynak düşerse liste boş değil, `hatalar` dolu,
 *   · bütçe adımı yazma yolunda İKİNCİ kez sınanıyor.
 */

let h: Harness;
const BUGUN = '2026-10-09';
const P = pencereler(BUGUN);
const KAMPANYA = '99999999-9999-9999-9999-999999999999';
const SET = '88888888-8888-8888-8888-888888888888';
const REKLAM = '77777777-7777-7777-7777-777777777777';
const REKLAM2 = '66666666-6666-6666-6666-666666666666';

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: null,
  isOrgAdmin: true,
  permissions: [],
} as unknown as TenantContext;

class SabitGunluServis extends IyilestirService {
  protected override bugun(): string {
    return BUGUN;
  }
}

const BOS_PACING = (): ClientPacing =>
  ({
    clientId: IDS.client,
    month: '2026-10',
    currency: 'TRY',
    overall: { budget: null, spentMicros: '0', projectedMicros: null, daysRemaining: 23 },
    accounts: [],
  }) as unknown as ClientPacing;

function sonuc(ek: Partial<SeviyeliUygulamaSonucu> = {}): SeviyeliUygulamaSonucu {
  return {
    platform: 'meta',
    seviye: 'ad',
    varlikId: REKLAM,
    varlikAdi: 'Reklam',
    once: { status: 'active', budgetMode: 'none', budgetAmountMicros: null },
    prova: false,
    dogrulama: 'dogrulandi',
    okunan: null,
    platformDegeri: 'Duraklatıldı',
    currency: 'TRY',
    ...ek,
  };
}

function kur() {
  const prisma = { withTenant: vi.fn(async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db)) } as unknown as PrismaService;
  const pacing = vi.fn(async () => BOS_PACING());
  const uygula = vi.fn(async () => sonuc());
  const svc = new SabitGunluServis(prisma, { pacing } as unknown as BudgetsService, { uygula } as unknown as CampaignActionsService);
  return { svc, pacing, uygula };
}

async function gunluk(level: string, id: string, ext: string, gun: string, v: { g: number; t: number; e: number; s: bigint; d?: number }) {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
       impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, 'meta', $3, $4, $5, $6, '', $7, $8, $9, $10, $11, 0, 'TRY')`,
    [IDS.client, IDS.adAccount, level, id, ext, gun, v.g, v.t, v.e, v.s.toString(), v.d ?? 0],
  );
}

/** Yorgun reklam: geçen hafta CTR %10 / sıklık 1,25; bu hafta CTR %7 / sıklık 1,43. */
async function yorgunReklam(id: string, ext: string) {
  for (let i = 0; i < 7; i++) {
    await gunluk('ad', id, ext, gunEkle(P.gecenBas, i), { g: 1000, t: 100, e: 800, s: 50_000_000n });
    await gunluk('ad', id, ext, gunEkle(P.buBas, i), { g: 1000, t: 70, e: 700, s: 50_000_000n });
  }
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, 'meta', 'c-1', 'Kampanya', 'active', 'none', now())`,
    [KAMPANYA, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, budget_amount_micros, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'g-1', 'Set', 'active', 'daily', 100000000, now())`,
    [SET, KAMPANYA, IDS.adAccount, IDS.client],
  );
  for (const [id, ext] of [[REKLAM, 'a-1'], [REKLAM2, 'a-2']] as const) {
    await h.q(
      `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', $5, $5, 'active', now())`,
      [id, SET, IDS.adAccount, IDS.client, ext],
    );
  }
  await yorgunReklam(REKLAM, 'a-1');
  // Kampanya seviyesi satır: hesap "bayat" sayılmasın.
  await gunluk('campaign', KAMPANYA, 'c-1', P.buSon, { g: 1, t: 0, e: 1, s: 0n });
});

describe('liste', () => {
  it('KRİTİK: yorgun reklam ÖNERİ olarak geliyor, özetli ve açık', async () => {
    const { svc } = kur();
    const l = await svc.liste(CTX, IDS.client);
    const o = l.oneriler.find((x) => x.tur === 'kreatif_yorgunlugu');
    expect(o?.varlik).toEqual({ seviye: 'ad', id: REKLAM, ad: 'a-1', ustAd: 'Set' });
    expect(o!.durum).toBe('acik');
    expect(o!.ozet).toBe(oneriOzeti({ tur: 'durdur' }, { platform: 'meta', seviye: 'ad', id: REKLAM }));
    expect(o!.harcamaMikros).toBe((350_000_000n).toString());
    expect(l.hatalar).toEqual([]);
    expect(l.buAyUygulanan).toBe(0);
  });

  it('KRİTİK: kaynak DÜŞERSE liste boş değil — `hatalar` dolu, diğer öneriler geliyor', async () => {
    const { svc, pacing } = kur();
    pacing.mockRejectedValue(new Error('bağlantı yok'));
    const l = await svc.liste(CTX, IDS.client);
    expect(l.hatalar.join(' ')).toMatch(/Aylık bütçe okunamadı.*bağlantı yok/);
    expect(l.oneriler.some((x) => x.tur === 'kreatif_yorgunlugu')).toBe(true);
  });

  it('verisi bayat hesap için öneri hesaplanmıyor ve SÖYLENİYOR', async () => {
    await h.q(`DELETE FROM insights_daily WHERE entity_level = 'campaign'`);
    await gunluk('campaign', KAMPANYA, 'c-1', gunEkle(BUGUN, -10), { g: 1, t: 0, e: 1, s: 0n });
    const { svc } = kur();
    const l = await svc.liste(CTX, IDS.client);
    expect(l.oneriler).toEqual([]);
    expect(l.hatalar.join(' ')).toMatch(/güncellenmedi/);
  });

  it('KRİTİK: ABO — bütçe REKLAM SETİNDE, öneri set seviyesini hedefliyor', async () => {
    // Set: 95 TRY/gün harcıyor (kullanım %95), 10 dönüşüm, workspace ortalaması
    // aynı CPA → artırma değil; ortalamayı yükseltmek için ikinci kampanya.
    for (let i = 0; i < 7; i++) {
      await gunluk('ad_group', SET, 'g-1', gunEkle(P.buBas, i), { g: 100, t: 1, e: 90, s: 95_000_000n, d: i === 0 ? 10 : 0 });
    }
    for (let i = 0; i < 14; i++) await gunluk('ad_group', SET, 'g-1', gunEkle(P.gecenBas, i - 7), { g: 1, t: 0, e: 1, s: 0n });
    await gunluk('campaign', KAMPANYA, 'c-1', P.buBas, { g: 1, t: 0, e: 1, s: 5_000_000_000n, d: 10 });
    const { svc } = kur();
    const o = (await svc.liste(CTX, IDS.client)).oneriler.find((x) => x.tur === 'butce_artir');
    expect(o?.varlik.seviye).toBe('ad_group');
    expect(o!.eylem).toMatchObject({ tur: 'butce', butceSeviyesi: 'ad_group', oncekiMikros: '100000000', yeniMikros: '120000000' });
  });
});

describe('uygula', () => {
  async function acikOneri(svc: IyilestirService): Promise<Oneri> {
    return (await svc.liste(CTX, IDS.client)).oneriler.find((x) => x.tur === 'kreatif_yorgunlugu')!;
  }

  it('KRİTİK: özet UYUŞMAZSA uygulama YOK — platforma tek çağrı gitmiyor', async () => {
    const { svc, uygula } = kur();
    const o = await acikOneri(svc);
    await expect(svc.uygula(CTX, 'Test', IDS.client, o.anahtar, 'f'.repeat(64))).rejects.toBeInstanceOf(ConflictException);
    expect(uygula).not.toHaveBeenCalled();
    expect(await h.q(`SELECT 1 FROM iyilestir_oneri_karar`)).toHaveLength(0);
  });

  it('KRİTİK: doğru özetle reklam DURDURULUYOR, karar platform değeriyle yazılıyor', async () => {
    const { svc, uygula } = kur();
    const o = await acikOneri(svc);
    const r = (await svc.uygula(CTX, 'Test Kullanıcı', IDS.client, o.anahtar, o.ozet)) as Oneri;
    expect(uygula).toHaveBeenCalledWith(CTX, { seviye: 'ad', id: REKLAM }, { type: 'pause' }, { validateOnly: false });
    expect(r.durum).toBe('uygulandi');
    expect(r.uygulama).toMatchObject({ durum: 'dogrulandi', platformDegeri: 'Duraklatıldı', uygulayan: 'Test Kullanıcı' });
    const [k] = await h.q<{ durum: string; org_id: string; user_id: string }>(`SELECT durum, org_id::text, user_id::text FROM iyilestir_oneri_karar`);
    expect(k).toEqual({ durum: 'uygulandi', org_id: IDS.org, user_id: IDS.user });

    // Liste artık kararın kopyasını gösteriyor ve sayaç arttı.
    const l = await svc.liste(CTX, IDS.client);
    expect(l.oneriler.find((x) => x.anahtar === o.anahtar)?.durum).toBe('uygulandi');
    expect(l.buAyUygulanan).toBe(1);
    // İkinci tıklama ikinci kez yazmıyor.
    await expect(svc.uygula(CTX, 'Test', IDS.client, o.anahtar, o.ozet)).rejects.toBeInstanceOf(ConflictException);
    expect(uygula).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: geri okuma uyuşmazlığı karara `uyusmadi` olarak yazılıyor', async () => {
    const { svc, uygula } = kur();
    uygula.mockResolvedValue(sonuc({ dogrulama: 'uyusmadi', platformDegeri: 'Yayında' }));
    const o = await acikOneri(svc);
    const r = (await svc.uygula(CTX, 'Test', IDS.client, o.anahtar, o.ozet)) as Oneri;
    expect(r.uygulama?.durum).toBe('uyusmadi');
    const [k] = await h.q<{ sonuc: { durum: string; platformDegeri: string } }>(`SELECT sonuc FROM iyilestir_oneri_karar`);
    expect(k!.sonuc).toMatchObject({ durum: 'uyusmadi', platformDegeri: 'Yayında' });
  });

  it('prova karar YAZMIYOR', async () => {
    const { svc, uygula } = kur();
    uygula.mockResolvedValue(sonuc({ prova: true, dogrulama: null, platformDegeri: 'Prova geçti; hiçbir şey değişmedi.' }));
    const o = await acikOneri(svc);
    expect(await svc.uygula(CTX, 'Test', IDS.client, o.anahtar, o.ozet, { prova: true })).toEqual({ prova: true, platformDegeri: 'Prova geçti; hiçbir şey değişmedi.' });
    expect(uygula).toHaveBeenCalledWith(CTX, expect.anything(), expect.anything(), { validateOnly: true });
    expect(await h.q(`SELECT 1 FROM iyilestir_oneri_karar`)).toHaveLength(0);
  });

  it('artık üretilmeyen öneri uygulanamıyor (409)', async () => {
    const { svc, uygula } = kur();
    const o = await acikOneri(svc);
    await h.q(`UPDATE ads SET status = 'paused' WHERE id = $1`, [REKLAM]);
    await expect(svc.uygula(CTX, 'Test', IDS.client, o.anahtar, o.ozet)).rejects.toThrow(/artık geçerli değil/);
    expect(uygula).not.toHaveBeenCalled();
  });

  it('KRİTİK: bütçe adımı yazma yolunda İKİNCİ KEZ sınanıyor (%20 üstü reddediliyor)', async () => {
    const { svc, uygula } = kur();
    const eylem = { tur: 'butce' as const, butceSeviyesi: 'ad_group' as const, butceTipi: 'daily' as const, oncekiMikros: '100000000', yeniMikros: '121000000' };
    const ozet = oneriOzeti(eylem, { platform: 'meta', seviye: 'ad_group', id: SET });
    const anahtar = `butce_artir:ad_group:${SET}:2026-W41`;
    vi.spyOn(svc, 'hesapla').mockResolvedValue({
      oneriler: [{ adAccountId: IDS.adAccount, oneri: { anahtar, eylem, ozet, varlik: { seviye: 'ad_group', id: SET, ad: 'Set', ustAd: null } } as unknown as Oneri }],
      hatalar: [],
    });
    await expect(svc.uygula(CTX, 'Test', IDS.client, anahtar, ozet)).rejects.toBeInstanceOf(BadRequestException);
    expect(uygula).not.toHaveBeenCalled();
  });

  it('erişilmeyen workspace reddediliyor', async () => {
    const { svc } = kur();
    await expect(svc.liste({ ...CTX, clientIds: [] }, IDS.client)).rejects.toThrow(/erişimin yok/);
  });
});

describe('yoksay', () => {
  it('karar `yoksayildi`, sonuçsuz; tekrar yoksaymak 409', async () => {
    const { svc } = kur();
    const o = (await svc.liste(CTX, IDS.client)).oneriler[0]!;
    const r = await svc.yoksay(CTX, IDS.client, o.anahtar);
    expect(r.durum).toBe('yoksayildi');
    expect(r.uygulama).toBeNull();
    await expect(svc.yoksay(CTX, IDS.client, o.anahtar)).rejects.toBeInstanceOf(ConflictException);
  });

  it('karar satırı DEĞİŞMEZ (trigger)', async () => {
    const { svc } = kur();
    const o = (await svc.liste(CTX, IDS.client)).oneriler[0]!;
    await svc.yoksay(CTX, IDS.client, o.anahtar);
    await expect(h.q(`UPDATE iyilestir_oneri_karar SET durum = 'uygulandi', sonuc = '{}'::jsonb`)).rejects.toThrow(/degismez/);
  });
});
