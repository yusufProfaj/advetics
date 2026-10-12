import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ETIKET_SINIRI, kreatifZekaSorgusuSchema, type GoruEtiketleri, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { gunOnce, kreatifTohumla, type KreatifTohumu } from '../../../test/kreatif-tohum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import type { GeminiIstemcisi } from '../../yapay-zeka/gemini';
import type { KreatifAdresiService } from '../reports/kreatif-adresi.service';
import { KreatifZekaService, bigintliJson } from './kreatif-zeka.service';
import { istanbulGunu } from './sayac';

/**
 * ═══ KREATİF ZEKÂSI API — GERÇEK SORGU, SAHTE GEMİNİ ═══
 *
 * Okuma, brief (ret/önbellek/sınır), AdvCampaign aktarımı, görsel ucunun
 * hata hâli ve elle etiketleme. RLS bu dosyada değil
 * (`kreatif-zeka-rls.spec.ts`).
 */

let h: Harness;
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: null, isOrgAdmin: true } as unknown as TenantContext;
const GUNLER = [gunOnce(3), gunOnce(4)];
const TEMEL: GoruEtiketleri = {
  insan: 'yok',
  urun_gorunur: 'var',
  metin_yogunlugu: 'az',
  baskin_renk: 'notr',
  eylem_cagrisi_gorselde: 'yok',
  fiyat_veya_indirim: 'yok',
  logo_gorunur: 'var',
  gorsel_turu: 'fotograf',
};
const GECERLI_BRIEF = JSON.stringify({
  yon: 'Ürünü kullanan bir kişi, sade bir zemin.',
  talimatlar: [{ alan: 'insan', talimat: 'Görselin merkezinde ürünü kullanan bir kişi olsun.' }],
  kacin: ['Kalabalık arka plan'],
});

function gemini(cevaplar: string[]) {
  let i = 0;
  return {
    model: 'gemini-test',
    uret: vi.fn(async () => ({ parcalar: [{ text: cevaplar[Math.min(i++, cevaplar.length - 1)]! }], sebep: 'bitti' as const, aciklama: null, girdiToken: 500, ciktiToken: 80, onbellekToken: 0 })),
  } as unknown as GeminiIstemcisi & { uret: ReturnType<typeof vi.fn> };
}

function servis(o: { gemini?: GeminiIstemcisi | null; adres?: Partial<KreatifAdresiService>; kuyruk?: ReturnType<typeof vi.fn> } = {}) {
  const prisma = { withTenant: vi.fn(async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db)) } as unknown as PrismaService;
  const queue = { enqueue: o.kuyruk ?? vi.fn(async () => ({ enqueued: true })) } as unknown as SyncQueueService;
  return new KreatifZekaService(prisma, (o.adres ?? {}) as KreatifAdresiService, queue, o.gemini === undefined ? gemini([GECERLI_BRIEF]) : o.gemini);
}

/** İşin yazacağı biçimde: içerik satırı + güncel şemanın etiketi. */
async function etiketli(t: KreatifTohumu, e: Partial<GoruEtiketleri>, ozet: string) {
  await h.q(
    `INSERT INTO kreatif_icerikleri (creative_id, org_id, client_id, ad_account_id, platform, icerik_ozeti, bicim, en_boy, durum, deneme, sema_surumu)
     VALUES ($1, $2, $3, $4, 'meta', $5, 'gorsel', 'kare', 'etiketlendi', 1, 1)`,
    [t.creativeId, IDS.org, IDS.client, IDS.adAccount, ozet],
  );
  await h.q(
    `INSERT INTO kreatif_etiketleri (org_id, client_id, icerik_ozeti, sema_surumu, etiketler, model) VALUES ($1, $2, $3, 1, $4::jsonb, 'm')`,
    [IDS.org, IDS.client, ozet, JSON.stringify({ ...TEMEL, ...e })],
  );
}

/** 6 insanlı (~%3 tıklama oranı) + 6 insansız (~%1) kreatif, hepsi etiketli ve eşiğin üstünde. */
async function kume() {
  for (let i = 0; i < 12; i++) {
    const insan = i % 2 === 0;
    const t = await kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER, gosterim: 5000, tiklama: (insan ? 150 : 50) + i, harcamaTl: 800 });
    await etiketli(t, { insan: insan ? 'var' : 'yok' }, i.toString(16).padStart(64, 'a'));
  }
}

const sorgu = (ek: Record<string, unknown> = {}) => kreatifZekaSorgusuSchema.parse({ clientId: IDS.client, ...ek });

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

describe('okuma', () => {
  it('KRİTİK: küme, satırlar (toplamla), kovalar, anlamlı fark ve etiketleme özeti TEK yanıtta', async () => {
    await kume();
    const r = await servis().oku(CTX, sorgu({ gorunum: 'tumu' }));
    expect(r.kumeler).toEqual([expect.objectContaining({ anahtar: 'meta:satis', kreatif: 12, anaMetrik: 'tiklama_orani', metrikDusus: true })]);
    expect(r.kume).toBe('meta:satis');
    expect(r.toplam).toBe(12);
    expect(r.satirlar).toHaveLength(12);
    // Puana göre sıralı (puansızlar sonda).
    const puanlar = r.satirlar.map((s) => s.puan.puan ?? -1);
    expect(puanlar).toEqual([...puanlar].sort((a, b) => b - a));
    expect(r.farklar.find((f) => f.alan === 'insan')).toMatchObject({ deger: 'var', fark: { karar: 'anlamli' } });
    expect(r.etiketleme).toMatchObject({ toplam: 12, sayilar: { etiketlendi: 12, bekliyor: 0, etiketlenemez: 0 }, gunlukSinir: ETIKET_SINIRI.workspaceGunluk });
    expect(r.emptyReason).toBeNull();
    expect(r.brief).toBeNull();
    expect(r.briefBosNedeni).toBeNull();
    // Yanıtta görsel ADRESİ yok: görsel kullanım anında ayrı uçtan.
    expect(bigintliJson(r)).not.toMatch(/https?:\/\//);
  });

  it('yeni görünümünde kova sayıları; kova süzgeci toplamı süzgeçten sonra sayıyor', async () => {
    await kume();
    const r = await servis().oku(CTX, sorgu());
    const toplam = r.kovaSayilari.iyi_gidiyor + r.kovaSayilari.dikkat + r.kovaSayilari.veri_yetersiz;
    expect(toplam).toBe(12);
    const d = await servis().oku(CTX, sorgu({ kova: 'dikkat' }));
    expect(d.toplam).toBe(r.kovaSayilari.dikkat);
    expect(d.satirlar.every((s) => s.kova?.kova === 'dikkat')).toBe(true);
  });

  it('boş liste NEDENİYLE: hesap yok / kreatif yok / yalnız metin', async () => {
    expect((await servis().oku(CTX, sorgu())).emptyReason).toBe('kreatif_yok');
    await h.q(`UPDATE ad_accounts SET platform = 'google'`);
    await kreatifTohumla(h, { objective: 'SEARCH', platform: 'google', creativeType: 'RESPONSIVE_SEARCH_AD', gunler: GUNLER });
    expect((await servis().oku(CTX, sorgu())).emptyReason).toBe('yalniz_metin');
    await h.q(`DELETE FROM ad_accounts`);
    expect((await servis().oku(CTX, sorgu())).emptyReason).toBe('hesap_yok');
  });

  it('erişilemeyen workspace reddediliyor', async () => {
    await expect(servis().oku({ ...CTX, clientIds: [] } as TenantContext, sorgu())).rejects.toThrow(/erişimin yok/);
  });
});

describe('brief', () => {
  it('KRİTİK: rakam içeren brief REDDEDİLİYOR (iki deneme), satır yazılmıyor, hata sayılıyor', async () => {
    await kume();
    const g = gemini([JSON.stringify({ yon: 'Yüzde 30 daha iyi', talimatlar: [{ alan: 'insan', talimat: 'İnsan kullan, 3 kişi olsun' }], kacin: [] })]);
    await expect(servis({ gemini: g }).brief(CTX, { clientId: IDS.client, kume: 'meta:satis' })).rejects.toThrow('Brief üretilemedi: yapay zekâ metninde rakam var');
    expect(g.uret).toHaveBeenCalledTimes(2);
    expect(await h.q(`SELECT 1 FROM kreatif_briefleri`)).toHaveLength(0);
    expect(await h.q(`SELECT brief_istek, hata FROM kreatif_etiket_sayaci`)).toEqual([{ brief_istek: 1, hata: 1 }]);
  });

  it('KRİTİK: geçerli brief yazılıyor; AYNI bulgularla ikinci istek Gemini’ye gitmiyor, sayaçtan düşmüyor', async () => {
    await kume();
    const g = gemini([GECERLI_BRIEF]);
    const s = servis({ gemini: g });
    const b1 = await s.brief(CTX, { clientId: IDS.client, kume: 'meta:satis' });
    expect(b1.bulgular.map((b) => b.alan)).toEqual(['insan']);
    expect(b1.cevap.talimatlar).toHaveLength(1);
    const b2 = await s.brief(CTX, { clientId: IDS.client, kume: 'meta:satis' });
    expect(b2.id).toBe(b1.id);
    expect(g.uret).toHaveBeenCalledTimes(1);
    expect(await h.q(`SELECT brief_istek FROM kreatif_etiket_sayaci`)).toEqual([{ brief_istek: 1 }]);
    // Okuma artık son brief'i döndürüyor.
    expect((await s.oku(CTX, sorgu())).brief?.id).toBe(b1.id);
  });

  it('günlük brief sınırı doluyken Gemini çağrılmıyor (429)', async () => {
    await kume();
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, brief_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      IDS.client,
      istanbulGunu(new Date()),
      ETIKET_SINIRI.briefGunluk,
    ]);
    const g = gemini([GECERLI_BRIEF]);
    await expect(servis({ gemini: g }).brief(CTX, { clientId: IDS.client, kume: 'meta:satis' })).rejects.toThrow(/brief sınırı doldu/);
    expect(g.uret).not.toHaveBeenCalled();
  });

  it('belirgin fark yoksa Gemini’ye istek gitmiyor ve neden söyleniyor', async () => {
    for (let i = 0; i < 12; i++) {
      const t = await kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER, gosterim: 5000, tiklama: 100 + (i % 3), harcamaTl: 800 });
      await etiketli(t, { insan: i % 2 ? 'var' : 'yok' }, i.toString(16).padStart(64, 'b'));
    }
    const g = gemini([GECERLI_BRIEF]);
    await expect(servis({ gemini: g }).brief(CTX, { clientId: IDS.client, kume: 'meta:satis' })).rejects.toThrow(/belirgin biçimde iyi değil/);
    expect(g.uret).not.toHaveBeenCalled();
    expect(await h.q(`SELECT 1 FROM kreatif_etiket_sayaci`)).toHaveLength(0);
  });

  it('brief ile AdvCampaign oturumu: hazır istem sayıları ŞABLONDAN taşıyor', async () => {
    await kume();
    const s = servis();
    const b = await s.brief(CTX, { clientId: IDS.client, kume: 'meta:satis' });
    const { oturumId } = await s.advcampaign(CTX, b.id);
    const [o] = await h.q<{ hazir_istem: string; baslik: string; org_id: string }>(`SELECT hazir_istem, baslik, org_id::text FROM adv_oturum WHERE id = $1`, [oturumId]);
    expect(o!.baslik).toBe('Kreatif brief · Meta · Satış');
    expect(o!.org_id).toBe(IDS.org);
    expect(o!.hazir_istem).toContain(b.bulgular[0]!.cumle);
    expect(o!.hazir_istem).toContain('Yön: Ürünü kullanan bir kişi');
  });
});

describe('görsel ucu', () => {
  it('KRİTİK: adres alınamazsa 200 + boş görsel DEĞİL, 502 ve platformun nedeni', async () => {
    const t = await kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER });
    const adres = { hesapAdresleri: vi.fn(async (..._a: unknown[]) => ({ adresler: new Map([[t.externalId, { hata: 'sunucu 403' }]]), kotaEngeli: null })) };
    await expect(servis({ adres }).gorsel(CTX, t.creativeId)).rejects.toThrow('Görsel alınamadı: sunucu 403');
    // Görsel ucu rapordaki katmanla (anonim tetiklenebilir trafik) soruyor.
    expect(adres.hesapAdresleri.mock.calls[0]![2]).toMatchObject({ katman: 'report_creative' });
  });

  it('başka workspace’in kreatifi bulunamadı (RLS’in yanında servis de bakıyor)', async () => {
    const t = await kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER });
    await expect(servis().gorsel({ ...CTX, clientIds: ['99999999-0000-4000-8000-000000000000'] } as TenantContext, t.creativeId)).rejects.toThrow('Kreatif bulunamadı');
  });
});

describe('elle etiketleme', () => {
  it('izlenen hesaplar kuyruğa, izlenmeyen sayılıyor; bekçi doluysa cümle söylüyor', async () => {
    const kuyruk = vi.fn(async () => ({ enqueued: true }));
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      IDS.client,
      istanbulGunu(new Date()),
      ETIKET_SINIRI.workspaceGunluk,
    ]);
    const r = await servis({ kuyruk }).etiketle(CTX, IDS.client);
    expect(kuyruk).toHaveBeenCalledWith({ clientId: IDS.client, platform: 'meta', jobType: 'creative_tags', adAccountId: IDS.adAccount });
    expect(r).toMatchObject({ kuyruga: 1, izlenmeyen: 0, bekci: 'workspace_gunluk' });
    expect(r.mesaj).toContain('bugünkü sınır doldu');
  });
});
