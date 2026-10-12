import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ETKI_SAYFA_BOYUTU, OLCULMEYEN_DEGISIKLIKLER, etkiListeSorgusuSchema, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { etkiIsi, type TxLike } from './etki-hesap';
import { ETKI_SECIMI, gunMetni, type EtkiSatiri } from './etki-metni';
import { EtkiService, bosNeden } from './etki.service';

/**
 * ═══ ETKİ OKUMA SERVİSİ — GERÇEK SORGU, GERÇEK SATIR ═══
 *
 * Satırları işin KENDİSİ üretiyor (`etkiIsi`), elle yazılmış bir etki
 * satırı değil: ekranın okuduğu kanıt (`olcum`) ile işin yazdığı biçim
 * ayrışırsa bu test düşmeli. RLS bu dosyada değil (`etki-rls.spec.ts`).
 */

let h: Harness;
const K1 = 'c1000000-0000-4000-8000-000000000001';
const K2 = 'c2000000-0000-4000-8000-000000000002';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: null, isOrgAdmin: true } as unknown as TenantContext;

function servis(dusen?: number) {
  let cagri = 0;
  const prisma = {
    withTenant: vi.fn(async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => {
      cagri++;
      if (dusen === cagri) throw new Error('bağlantı koptu');
      return fn(h.db);
    }),
  } as unknown as PrismaService;
  return new EtkiService(prisma);
}

const sorgu = (ek: Record<string, unknown> = {}) => etkiListeSorgusuSchema.parse({ clientId: IDS.client, ...ek });

async function metrik(id: string, bas: string, son: string, harcamaTl: number, donusum: number) {
  for (let d = new Date(`${bas}T00:00:00Z`); d.toISOString().slice(0, 10) <= son; d.setUTCDate(d.getUTCDate() + 1)) {
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
         impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
       VALUES ($1, $2, 'meta', 'campaign', $3, 'x', $4, '', 1000, 300, 0, $5, $6, 0, 'TRY')`,
      [IDS.client, IDS.adAccount, id, d.toISOString().slice(0, 10), String(harcamaTl * 1_000_000), donusum],
    );
  }
}

async function butceDegisikligi() {
  await h.q(
    `INSERT INTO audit_logs (org_id, client_id, actor_type, actor_id, action, target_type, target_id, before, after, created_at)
     VALUES ($1, $2, 'user', $3, 'campaign.set_budget', 'campaign', $4,
             '{"status":"active","budgetMode":"daily","budgetAmountMicros":"1000000000"}'::jsonb,
             '{"istenen":{"amountMicros":"1200000000","budgetMode":"daily"},"dogrulama":"dogrulandi","iz":{"yol":"iyilestir","ref":"butce:k1"}}'::jsonb,
             '2026-09-01T09:00:00Z')`,
    [IDS.org, IDS.client, IDS.user, K1],
  );
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
  for (const [id, ad] of [
    [K1, 'Kış Koleksiyonu'],
    [K2, 'Marka'],
  ] as const) {
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, budget_amount_micros, updated_at)
       VALUES ($1, $2, $3, 'meta', $4, $5, 'active', 'daily', 1000000000, now())`,
      [id, IDS.adAccount, IDS.client, `c-${id.slice(0, 2)}`, ad],
    );
  }
});

describe('boş liste NEDENİYLE', () => {
  it('KRİTİK: keşif hiç koşmadıysa "kesif_kosmadi"; koştuysa "degisiklik_yok"; süzgeç eldiyse "suzgec_bos"', async () => {
    const svc = servis();
    expect((await svc.liste(CTX, sorgu())).emptyReason).toBe('kesif_kosmadi');

    await h.q(
      `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, started_at, finished_at)
       VALUES ($1, $2, 'impact_evaluate', 'succeeded', '2026-09-02T04:20:00Z', '2026-09-02T04:21:00Z')`,
      [IDS.client, IDS.adAccount],
    );
    const l = await svc.liste(CTX, sorgu());
    expect(l.emptyReason).toBe('degisiklik_yok');
    expect(l.sonHesaplama).toBe('2026-09-02T04:21:00.000Z');
    expect(l.olculmeyen).toEqual(OLCULMEYEN_DEGISIKLIKLER);

    await butceDegisikligi();
    await etkiIsi(h.db as unknown as TxLike, IDS.adAccount, '2026-09-02', new Date('2026-09-02T05:00:00Z'));
    const s = await svc.liste(CTX, sorgu({ durum: 'kapali' }));
    expect(s).toMatchObject({ etkiler: [], toplam: 0, emptyReason: 'suzgec_bos' });
    expect(s.sayilar).toEqual({ bekliyor: 1, olcumde: 0, sonuclandi: 0, olculemedi: 0 });
  });

  it('son hesaplama okunamazsa neden BİLİNMİYOR: emptyReason null ve hatalar dolu ("değişiklik yok" yalanı yok)', async () => {
    const l = await servis(2).liste(CTX, sorgu());
    expect(l.emptyReason).toBeNull();
    expect(l.hatalar).toEqual([{ kaynak: 'son_hesaplama', mesaj: expect.any(String) }]);
  });

  it('liste sorgusu düşerse boş liste değil hata: hatalar dolu, emptyReason null', async () => {
    const l = await servis(1).liste(CTX, sorgu());
    expect(l).toMatchObject({ etkiler: [], emptyReason: null });
    expect(l.hatalar[0]?.kaynak).toBe('etkiler');
  });

  it('atanmış hesabı olmayan workspace "keşif koşmadı" demiyor (koşmayacak)', () => {
    expect(bosNeden({ workspaceToplami: 0, sonHesaplama: null, hesaplamaOkunamadi: false, hesapSayisi: 0 })).toBe('degisiklik_yok');
    expect(bosNeden({ workspaceToplami: 0, sonHesaplama: null, hesaplamaOkunamadi: false, hesapSayisi: 1 })).toBe('kesif_kosmadi');
  });

  it('erişimi olmayan workspace reddediliyor', async () => {
    await expect(servis().liste(CTX, etkiListeSorgusuSchema.parse({ clientId: 'bbbbbbbb-0000-4000-8000-00000000000b' }))).rejects.toThrow(/erişimin yok/);
  });
});

describe('dolu liste ve ayrıntı', () => {
  async function olculmus() {
    await metrik(K1, '2026-08-04', '2026-08-31', 1000, 10);
    await metrik(K1, '2026-09-01', '2026-09-30', 1000, 14);
    await metrik(K2, '2026-08-04', '2026-09-30', 2000, 20);
    await butceDegisikligi();
    await etkiIsi(h.db as unknown as TxLike, IDS.adAccount, '2026-09-12', new Date('2026-09-12T05:00:00Z'));
  }

  it('KRİTİK: SELECT her alanı getiriyor ($queryRaw<T> tip yalanı yok)', async () => {
    await olculmus();
    const [r] = await h.q<Record<string, unknown>>(`${ETKI_SECIMI.sql}`);
    const beklenen: Array<keyof EtkiSatiri> = [
      'id', 'client_id', 'platform', 'ad_account_id', 'hesap_adi', 'hesap_para', 'kaynak', 'yol', 'yol_ref', 'kim', 'tur',
      'seviye', 'varlik_id', 'varlik_adi', 'ust_adi', 'kapsam_seviye', 'kapsam_id', 'kapsam_adi', 'once_deger', 'sonra_deger',
      'degisiklik_zamani', 'gun', 'birlikte_olculen', 'durum', 'sonuc', 'neden', 'metrik', 'etki_orani', 'nokta_gun',
      'sonraki_olcum', 'olcum', 'gozlem',
    ];
    expect(Object.keys(r!).sort()).toEqual([...beklenen].sort());
  });

  it('KRİTİK: ekran tipi işin kanıtından kuruluyor (metin, pencereler, kontrol, cümle)', async () => {
    await olculmus();
    const l = await servis().liste(CTX, sorgu());
    expect(l.toplam).toBe(1);
    const e = l.etkiler[0]!;
    expect(e).toMatchObject({
      yol: 'iyilestir',
      yolRef: 'butce:k1',
      kim: 'Test Kullanıcı',
      adAccountAdi: 'Hesap',
      degisiklikMetni: 'Bütçe 1.000 ₺ → 1.200 ₺',
      durum: 'sonuclandi',
      sonuc: 'iyilesti',
      metrik: 'donusum_basi_maliyet',
      kontrolMetni: 'Aynı hesaptaki 1 kampanya',
      gun: '2026-09-01',
      varlik: { seviye: 'campaign', id: K1, ad: 'Kış Koleksiyonu', ustAd: 'Hesap' },
      kapsam: { seviye: 'campaign', id: K1, ad: 'Kış Koleksiyonu' },
    });
    expect(e.once).toEqual({ aralik: { bas: '2026-08-18', son: '2026-08-31' }, deger: '100,00 ₺', tiklama: 4200, donusum: 140 });
    expect(e.sonra?.deger).toBe('71,42 ₺');
    expect(e.kontrolDegisimi).toBeCloseTo(0, 6);
    expect(e.cumle).toBe('Değişiklikten sonra dönüşüm başı maliyet, aynı hesapta değişmeyenlere göre %29 düştü.');
  });

  it('bekleyen satırın cümlesi okunur tarih taşıyor ("2026-09-12" değil "12 Eylül")', async () => {
    await butceDegisikligi();
    await etkiIsi(h.db as unknown as TxLike, IDS.adAccount, '2026-09-02', new Date('2026-09-02T05:00:00Z'));
    const [e] = (await servis().liste(CTX, sorgu({ varlikId: K1 }))).etkiler;
    expect(e).toMatchObject({ durum: 'bekliyor', sonrakiOlcum: '2026-09-12', cumle: 'Etki 12 Eylül tarihinde ölçülecek.' });
    expect(gunMetni('2026-01-05')).toBe('5 Ocak');
  });

  it('süzgeç: varlık ve yol', async () => {
    await butceDegisikligi();
    await etkiIsi(h.db as unknown as TxLike, IDS.adAccount, '2026-09-02', new Date('2026-09-02T05:00:00Z'));
    const svc = servis();
    expect((await svc.liste(CTX, sorgu({ varlikId: K2 }))).etkiler).toHaveLength(0);
    expect((await svc.liste(CTX, sorgu({ yol: 'kural' }))).etkiler).toHaveLength(0);
    expect((await svc.liste(CTX, sorgu({ yol: 'iyilestir', varlikId: K1 }))).etkiler).toHaveLength(1);
    expect(ETKI_SAYFA_BOYUTU).toBe(50);
  });

  it('ayrıntı: günlük seri öncesi + sonrası, deney ve kontrol, değişiklik günü işaretli', async () => {
    await olculmus();
    const [e] = (await servis().liste(CTX, sorgu())).etkiler;
    const a = await servis().tek(CTX, e!.id);
    expect(a.seri?.gunler[0]).toBe('2026-08-18');
    expect(a.seri?.gunler.at(-1)).toBe('2026-09-08');
    expect(a.seri?.degisiklikGunu).toBe('2026-09-01');
    expect(a.seri?.deney[0]).toBe(100);
    expect(a.seri?.deney.at(-1)).toBeCloseTo(71.43, 2);
    expect(a.seri?.kontrol[0]).toBe(100);
  });

  it('başka workspace’in satırı "bulunamadı" (varlığı sızmıyor)', async () => {
    await olculmus();
    const [e] = (await servis().liste(CTX, sorgu())).etkiler;
    await expect(servis().tek({ ...CTX, clientIds: [] } as TenantContext, e!.id)).rejects.toThrow(/bulunamadı/);
  });
});
