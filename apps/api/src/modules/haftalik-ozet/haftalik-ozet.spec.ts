import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gunEkle,
  isoHaftaAraligi,
  oncekiHafta,
  ozetHaftasi,
  type HaftalikOzet,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { AppConfig } from '../../config/configuration';
import { CryptoService } from '../../crypto/crypto.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { YapayZekaHatasi, type MetinUretici } from '../../yapay-zeka/gemini';
import type { GenelBakisService } from '../genel-bakis/genel-bakis.service';
import type { RaporGonderService } from '../reports/rapor-gonder.service';
import { RaporPlaniService } from '../reports/rapor-plani.service';
import { BildirimTeslimService, type MailGonderici, type WebhookGonderici } from '../sinyal/bildirim-teslim.service';
import { HaftalikOzetService } from './haftalik-ozet.service';
import { ozetEpostasi } from './ozet-mail';
import { OzetService } from './ozet.service';

/**
 * ═══ HAFTALIK ÖZET — GERÇEK Postgres'e karşı (Paket B, Ajan 2) ═══
 *
 * Sınanan: üretim + saklama (değişmez), müşteri görünümüne ajans bilgisi
 * SIZMIYOR (gövde ve yanıt taranıyor), yapay zekâ fixture'ları (geçerli,
 * rakamlı → ret, kota → yorumsuz ve not), düşük hacim, boş hafta, iki
 * workspace iki mail, kısmi ret, Paket A kanal satırı, plan kaydı.
 * Canlı mail ve canlı Gemini YOK: gönderici ve üretici taklit.
 */
let h: Harness;

const SIMDI = new Date('2026-10-12T07:00:00Z'); // Pazartesi 10:00 İstanbul
const HAFTA = '2026-W41'; // 5-11 Ekim
const GIZLI = 'GİZLİ-SİNYAL-KAMPANYASI';
const K1 = '66666666-0000-0000-0000-000000000001';
const K2 = '66666666-0000-0000-0000-000000000002';
const C2 = '22222222-2222-2222-2222-22222222222b';
const ACC2 = '44444444-4444-4444-4444-44444444444b';

function config(): AppConfig {
  return {
    encryption: { keys: { 1: randomBytes(32).toString('base64') }, activeVersion: 1 },
    mail: { appUrl: 'https://panel.test', smtp: null, eksikSmtpDegiskenleri: [] },
    sinyal: { sessizKosum: false },
  } as unknown as AppConfig;
}

/** Sahte Gemini: verilen metni döndürür ya da fırlatır; çağrı sayılır. */
function yz(cevap: string | Error): MetinUretici & { cagri: number } {
  const u = {
    model: 'gemini-test',
    cagri: 0,
    uret: async () => {
      u.cagri++;
      if (cevap instanceof Error) throw cevap;
      return { parcalar: [{ text: cevap }], sebep: 'bitti' as const, aciklama: null, girdiToken: 0, ciktiToken: 0, onbellekToken: 0 };
    },
  };
  return u;
}

const genelBakis = {
  bekleyenler: async (_c: TenantContext, s: { clientId?: string }) => ({
    isler: [{ tur: 'boost_onay', clientId: s.clientId, clientAdi: 'W', sayi: 2, enEski: null }],
    toplam: 1,
    sorulmayan: [],
    hatalar: [],
    uretildi: SIMDI.toISOString(),
  }),
} as unknown as GenelBakisService;

function ozetSvc(u: MetinUretici | null): OzetService {
  const s = new OzetService(h.db as unknown as PrismaAdminService, config(), u, genelBakis, null);
  s.iyilestir = { liste: async () => ({ oneriler: [{ durum: 'acik' }, { durum: 'acik' }, { durum: 'uygulandi' }], toplam: 3 }) };
  return s;
}

const prisma = { withTenant: async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db) } as unknown as PrismaService;

/** Bir kampanyanın iki haftası, gün gün. */
async function kampanya(
  id: string,
  ad: string,
  gunluk: { onceki: { harcama: number; gosterim: number; donusum: number }; bu: { harcama: number; gosterim: number; donusum: number } },
  hafta = HAFTA,
  client: string = IDS.client,
  hesap: string = IDS.adAccount,
): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, updated_at)
     VALUES ($1, $2, $3, 'meta', $4, $5, now()) ON CONFLICT DO NOTHING`,
    [id, hesap, client, `c-${id.slice(-4)}`, ad],
  );
  for (const [h0, g] of [
    [isoHaftaAraligi(oncekiHafta(hafta)!)!.bas, gunluk.onceki],
    [isoHaftaAraligi(hafta)!.bas, gunluk.bu],
  ] as const) {
    for (let i = 0; i < 7; i++) {
      await h.q(
        `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date,
           breakdown_key, impressions, clicks, spend_micros, conversions, conversion_value_micros, currency)
         VALUES ($1, $2, 'meta', 'campaign', $3, $4, $5, '', $6, 50, $7, $8, 0, 'TRY')`,
        [client, hesap, id, `c-${id.slice(-4)}`, gunEkle(h0, i), g.gosterim, String(g.harcama * 1_000_000), g.donusum],
      );
    }
  }
}

async function sinyalEkle(client: string = IDS.client, hesap: string = IDS.adAccount): Promise<void> {
  await h.q(
    `INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, yon, seviye, varlik_id, varlik_adi,
       gun, gozlenen, beklenen_orta, onem, para_birimi)
     SELECT c.org_id, c.id, $2::uuid, 'meta', 'anomali:harcama:artis:campaign:' || $3::text, 'anomali', 'harcama', 'artis', 'campaign',
            $3::uuid, $4, '2026-10-10', 300, 100, 'yuksek', 'TRY'
       FROM clients c WHERE c.id = $1`,
    [client, hesap, K1, GIZLI],
  );
}

async function normalHafta(): Promise<void> {
  await kampanya(K1, 'Kış <Koleksiyonu>', { onceki: { harcama: 100, gosterim: 1000, donusum: 5 }, bu: { harcama: 150, gosterim: 1000, donusum: 5 } });
  await kampanya(K2, 'Marka', { onceki: { harcama: 20, gosterim: 500, donusum: 1 }, bu: { harcama: 20, gosterim: 500, donusum: 1 } });
  await sinyalEkle();
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

describe('üretim ve saklama', () => {
  it('KRİTİK: üretilen özet saklanıyor ve İKİNCİ çağrı aynı satırı okuyor (yapay zekâ bir daha çağrılmıyor)', async () => {
    await normalHafta();
    const u = yz('Maliyet {{harcama_degisim}} arttı.');
    const s = ozetSvc(u);
    const a = await s.getir(IDS.client, HAFTA, SIMDI);
    expect(a.kaynak).toBe('yeni');
    const b = await s.getir(IDS.client, HAFTA, SIMDI);
    expect(b.kaynak).toBe('kayitli');
    expect(b.ozet).toEqual(a.ozet);
    expect(u.cagri).toBe(1);
    const [r] = await h.q<{ n: number; yd: string; m: string }>(`SELECT count(*)::int AS n, max(yorum_durumu) AS yd, max(model) AS m FROM haftalik_ozetler`);
    expect(r).toEqual({ n: 1, yd: 'yazildi', m: 'gemini-test' });
  });

  it('sayılar sorgudan: harcama %50 arttı, dönüşüm kıyası OLGUN günlerden (Pzt-Per), "kesinleşmedi" işaretli', async () => {
    await normalHafta();
    const { ozet } = await ozetSvc(null).getir(IDS.client, HAFTA, SIMDI);
    const m = Object.fromEntries(ozet.metrikler.map((x) => [x.metrik, x]));
    expect(m.harcama!.bu!.sayi).toBe(170 * 7);
    expect(m.harcama!.degisim).toBeCloseTo((170 - 120) / 120);
    expect(ozet.donusumKiyasi).toEqual({ bu: { bas: '2026-10-05', son: '2026-10-08' }, onceki: { bas: '2026-09-28', son: '2026-10-01' }, tamHafta: false });
    expect(m.donusum!.kesinlesmedi).toBe(true);
    expect(m.donusum!.degisim).toBe(0);
    expect(ozet.degisenler.kalemler[0]).toMatchObject({ varlikId: K1, metrik: 'harcama' });
    expect(ozet.sinyaller?.toplam).toBe(1);
    expect(ozet.bekleyenIsler?.acikOneri).toBe(2);
    expect(ozet.oneri?.tur).toBe('sinyal_uygula');
  });

  it('KRİTİK: tamamlanmamış hafta REDDEDİLİYOR (yarım haftayı tam haftayla kıyaslamak her seferinde "düştü" der)', async () => {
    await expect(ozetSvc(null).getir(IDS.client, '2026-W42', SIMDI)).rejects.toThrow(/henüz bitmedi/);
  });
});

describe('müşteri görünümüne ajans bilgisi SIZMIYOR', () => {
  it('KRİTİK: müşteriye giden mailde sinyal, öneri ve bekleyen iş YOK; ajans mailinde VAR; kampanya adı kaçışlı', async () => {
    await normalHafta();
    const { ozet } = await ozetSvc(yz('Maliyet {{harcama_degisim}} arttı.')).getir(IDS.client, HAFTA, SIMDI);
    const musteri = ozetEpostasi(ozet, 'musteri', 'https://panel.test/x').html;
    const ajans = ozetEpostasi(ozet, 'ajans', 'https://panel.test/x').html;
    for (const yasak of [GIZLI, 'YALNIZ AJANS', 'Sinyaller ekranından', 'Akıllı Boost', 'İyileştir', 'Yorum yok']) {
      expect(musteri, yasak).not.toContain(yasak);
    }
    expect(ajans).toContain(GIZLI);
    expect(ajans).toContain('YALNIZ AJANS');
    expect(ajans).toContain('2 Akıllı Boost kartı');
    expect(musteri).toContain('Kış &lt;Koleksiyonu&gt;');
    expect(musteri).not.toContain('Kış <Koleksiyonu>');
  });

  it('KRİTİK: önizleme ucu kitle=musteri yanıtının TAMAMINDA ajans bilgisi yok; client_viewer kitle=ajans → 403', async () => {
    await normalHafta();
    const svc = new HaftalikOzetService(prisma, ozetSvc(null), {} as RaporGonderService, config());
    const musteriCtx = { userId: IDS.user, orgId: IDS.org, clientIds: [IDS.client], permissions: ['report.read'] } as unknown as TenantContext;
    const y = await svc.onizleme(musteriCtx, { clientId: IDS.client, kitle: 'musteri', hafta: HAFTA }, SIMDI);
    const json = JSON.stringify(y);
    expect(json).not.toContain(GIZLI);
    expect(json).not.toContain('boost_onay');
    expect(y.ozet.sinyaller).toBeNull();
    expect(y.ozet.oneri).toBeNull();
    expect(y.kisa).toBeNull();
    expect(y.gonderim.kanallar).toEqual([]);
    await expect(svc.onizleme(musteriCtx, { clientId: IDS.client, kitle: 'ajans', hafta: HAFTA }, SIMDI)).rejects.toThrow(/Ajans görünümü/);
    // Başka workspace: 403, boş cevap değil.
    await expect(svc.onizleme({ ...musteriCtx, clientIds: [] } as TenantContext, { clientId: IDS.client, kitle: 'musteri', hafta: HAFTA }, SIMDI)).rejects.toThrow(/erişimin yok/);
  });
});

describe('yapay zekâ yorumu', () => {
  it('geçerli cevap: yer tutucu SORGUDAN dolduruluyor', async () => {
    await normalHafta();
    const { ozet } = await ozetSvc(yz('Maliyet geçen haftaya göre {{harcama_degisim}} arttı.')).getir(IDS.client, HAFTA, SIMDI);
    expect(ozet.yorum).toEqual({ durum: 'yazildi', metin: 'Maliyet geçen haftaya göre %42 arttı.', not: null });
  });

  it('KRİTİK: rakamlı cevap REDDEDİLİYOR, mail yorumsuz gidiyor, neden notta', async () => {
    await normalHafta();
    const { ozet } = await ozetSvc(yz('Maliyet %12 arttı, harika.')).getir(IDS.client, HAFTA, SIMDI);
    expect(ozet.yorum.durum).toBe('reddedildi');
    expect(ozet.yorum.metin).toBeNull();
    expect(ozet.yorum.not).toMatch(/^rakam/);
    const html = ozetEpostasi(ozet, 'musteri', 'https://panel.test').html;
    expect(html).not.toContain('harika');
    expect(html).not.toContain('Yapay zekâ yorumu');
    // Yorumun neden olmadığı YALNIZ ajansa (müşteri "yapay zekâ bozuk" cümlesini görmesin).
    expect(html).not.toContain('Yorum yok');
    // Ajans önizlemesi nedeni söylüyor.
    expect(ozetEpostasi(ozet, 'ajans', 'https://panel.test').html).toContain('Yorum sayı içerdiği için kullanılmadı');
  });

  it('KRİTİK: kota hatası özeti DÜŞÜRMÜYOR: özet yorumsuz saklanıyor ve platformun cümlesi notta', async () => {
    await normalHafta();
    const { ozet } = await ozetSvc(yz(new YapayZekaHatasi(429, 'Gemini 429 RESOURCE_EXHAUSTED: quota'))).getir(IDS.client, HAFTA, SIMDI);
    expect(ozet.yorum.durum).toBe('hata');
    expect(ozet.yorum.not).toContain('RESOURCE_EXHAUSTED');
    expect(ozet.metrikler.length).toBe(4);
    const [r] = await h.q<{ yd: string }>(`SELECT yorum_durumu AS yd FROM haftalik_ozetler`);
    expect(r!.yd).toBe('hata');
  });

  it('anahtar yoksa `kapali`, sessiz değil', async () => {
    await normalHafta();
    const { ozet } = await ozetSvc(null).getir(IDS.client, HAFTA, SIMDI);
    expect(ozet.yorum.durum).toBe('kapali');
  });
});

describe('hacim', () => {
  it('KRİTİK: düşük hacim: kalem ÜRETİLMİYOR, nedeni dusuk_hacim, yorum atlanıyor (model çağrılmıyor)', async () => {
    await kampanya(K1, 'Küçük', { onceki: { harcama: 5, gosterim: 50, donusum: 0 }, bu: { harcama: 30, gosterim: 100, donusum: 0 } });
    const u = yz('Maliyet {{harcama_degisim}} arttı.');
    const { ozet } = await ozetSvc(u).getir(IDS.client, HAFTA, SIMDI);
    expect(ozet.hacim).toBe('dusuk_hacim');
    expect(ozet.degisenler).toMatchObject({ kalemler: [], bosNedeni: 'dusuk_hacim' });
    expect(ozet.yorum.durum).toBe('atlandi');
    expect(u.cagri).toBe(0);
  });

  it('harcama yoksa `bos`', async () => {
    const { ozet } = await ozetSvc(null).getir(IDS.client, HAFTA, SIMDI);
    expect(ozet.hacim).toBe('bos');
  });

  it('çevrilemeyen para birimi toplama GİRMİYOR ve hesabın adıyla söyleniyor', async () => {
    await normalHafta();
    await h.q(`UPDATE insights_daily SET currency = 'USD' WHERE entity_id = $1`, [K2]);
    const { ozet } = await ozetSvc(null).getir(IDS.client, HAFTA, SIMDI);
    expect(ozet.metrikler[0]!.bu!.sayi).toBe(150 * 7);
    expect(ozet.hatalar).toEqual([{ kaynak: 'sonuc', mesaj: 'Hesap (USD) TRY birimine çevrilemedi ve toplama girmedi.' }]);
  });
});

// ─── Müşteri planı (report_schedules süpürmesi) ──────────────────────────────

type OzetGonderSonucu = Awaited<ReturnType<RaporGonderService['ozetGonder']>>;

async function ozetPlaniEkle(client: string = IDS.client, nextRunAt = new Date(Date.now() - 3_600_000).toISOString()): Promise<void> {
  await h.q(
    `INSERT INTO report_schedules (id, org_id, client_id, created_by_user_id, tur, frequency, day_of_week, hour, range_key,
       to_emails, attach_pdf, enabled, next_run_at, updated_at)
     SELECT gen_random_uuid(), c.org_id, c.id, $2, 'haftalik_ozet', 'weekly', 1, 9, 'onceki_iso_hafta', '{}', false, true, $3, now()
       FROM clients c WHERE c.id = $1`,
    [client, IDS.user, nextRunAt],
  );
}

function planSvc(ozet: OzetService, ozetGonder: (ctx: unknown, p: { clientId: string; html: string }) => Promise<OzetGonderSonucu>): RaporPlaniService {
  const gonderici = {
    zamanlanmisGonder: async () => {
      throw new Error('özet planı rapor dalına düştü');
    },
    ozetGonder,
  } as unknown as RaporGonderService;
  return new RaporPlaniService(prisma, h.db as unknown as PrismaAdminService, gonderici, ozet, config());
}

/** Planın haftası testin koştuğu ana göre (calistir gerçek saati kullanıyor). */
function planHaftasi(): string {
  return ozetHaftasi(new Date(Date.now() - 3_600_000));
}

describe('müşteri özet planı', () => {
  it('KRİTİK: iki workspace, iki ayrı mail; müşteriye giden gövdede ajans bilgisi yok; ikinci tur mükerrer göndermiyor', async () => {
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'İkinci', 'ikinci', now())`, [C2, IDS.org]);
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'act_2', 'Hesap 2', 'TRY', 'Europe/Istanbul', true, now())`,
      [ACC2, IDS.org, C2, IDS.connection],
    );
    const hafta = planHaftasi();
    await kampanya(K1, 'Bir', { onceki: { harcama: 100, gosterim: 1000, donusum: 5 }, bu: { harcama: 150, gosterim: 1000, donusum: 5 } }, hafta);
    await kampanya(K2, 'İki', { onceki: { harcama: 100, gosterim: 1000, donusum: 5 }, bu: { harcama: 50, gosterim: 1000, donusum: 5 } }, hafta, C2, ACC2);
    await sinyalEkle();
    await ozetPlaniEkle(IDS.client);
    await ozetPlaniEkle(C2);
    const gonderilen: Array<{ clientId: string; html: string }> = [];
    const svc = planSvc(ozetSvc(null), async (_c, p) => {
      gonderilen.push({ clientId: p.clientId, html: p.html });
      return { to: ['m@x.com'], reddedilen: [] };
    });
    const r = await svc.calistir();
    expect(r.rows).toBe(2);
    expect(gonderilen.map((g) => g.clientId).sort()).toEqual([IDS.client, C2].sort());
    for (const g of gonderilen) expect(g.html).not.toContain(GIZLI);
    // İkinci tur: next_run_at ileri atıldı, ikinci mail yok.
    await svc.calistir();
    expect(gonderilen).toHaveLength(2);
    expect(await h.q(`SELECT 1 FROM haftalik_ozetler WHERE hafta = $1`, [hafta])).toHaveLength(2);
  });

  it('KRİTİK: iki worker AYNI ANDA koşarsa tek mail (koşullu claim)', async () => {
    await kampanya(K1, 'Bir', { onceki: { harcama: 100, gosterim: 1000, donusum: 5 }, bu: { harcama: 150, gosterim: 1000, donusum: 5 } }, planHaftasi());
    await ozetPlaniEkle();
    let n = 0;
    const svc = planSvc(ozetSvc(null), async () => {
      n++;
      return { to: ['m@x.com'], reddedilen: [] };
    });
    await Promise.all([svc.calistir(), svc.calistir()]);
    expect(n).toBe(1);
  });

  it('KRİTİK: boş hafta GÖNDERİLMİYOR, plan `skipped` ve nedeni yazılı', async () => {
    await ozetPlaniEkle();
    const gonder = vi.fn();
    const r = await planSvc(ozetSvc(null), gonder).calistir();
    expect(gonder).not.toHaveBeenCalled();
    expect(r.rows).toBe(0);
    const [p] = await h.q<{ s: string; e: string }>(`SELECT last_status AS s, last_error AS e FROM report_schedules`);
    expect(p!.s).toBe('skipped');
    expect(p!.e).toMatch(/harcama yok; boş özet gönderilmedi/);
  });

  it('KRİTİK: kısmi ret RAPORLANIYOR: durum sent ama reddedilen adres plan satırında', async () => {
    await kampanya(K1, 'Bir', { onceki: { harcama: 100, gosterim: 1000, donusum: 5 }, bu: { harcama: 150, gosterim: 1000, donusum: 5 } }, planHaftasi());
    await ozetPlaniEkle();
    const r = await planSvc(ozetSvc(null), async () => ({ to: ['a@x.com'], reddedilen: [{ adres: 'eski@x.com', sebep: '550 yok' }] })).calistir();
    expect(r.note).toContain('REDDEDİLEN: eski@x.com');
    const [p] = await h.q<{ s: string; e: string; t: string }>(`SELECT last_status AS s, last_error AS e, last_sent_to AS t FROM report_schedules`);
    expect(p).toEqual({ s: 'sent', e: 'Reddedilen: eski@x.com (550 yok)', t: 'a@x.com' });
  });

  it('gönderim düşerse `failed` ve SMTP cümlesi; otomatik tekrar yok', async () => {
    await kampanya(K1, 'Bir', { onceki: { harcama: 100, gosterim: 1000, donusum: 5 }, bu: { harcama: 150, gosterim: 1000, donusum: 5 } }, planHaftasi());
    await ozetPlaniEkle();
    await planSvc(ozetSvc(null), async () => {
      throw new Error('535 kimlik doğrulanamadı');
    }).calistir();
    const [p] = await h.q<{ s: string; e: string }>(`SELECT last_status AS s, last_error AS e FROM report_schedules`);
    expect(p).toEqual({ s: 'failed', e: '535 kimlik doğrulanamadı' });
  });

  it('KRİTİK: rapor planı listesi özet planını GÖSTERMİYOR; rapor güncelleme/silme ona dokunamıyor', async () => {
    await ozetPlaniEkle();
    const svc = planSvc(ozetSvc(null), vi.fn());
    const ctx = { userId: IDS.user, orgId: IDS.org, clientIds: [IDS.client] } as unknown as TenantContext;
    expect(await svc.listele(ctx, IDS.client)).toEqual([]);
    const [p] = await h.q<{ id: string }>(`SELECT id::text AS id FROM report_schedules`);
    await expect(svc.sil(ctx, p!.id, IDS.client)).rejects.toThrow(/bulunamadı/);
  });
});

describe('özet planı kaydı', () => {
  const ctx = { userId: IDS.user, orgId: IDS.org, clientIds: [IDS.client], permissions: ['report.share'] } as unknown as TenantContext;

  it('KRİTİK: SMTP kimliği yoksa AÇILMIYOR (giriş anında doğrulama); kapatmak ön koşulsuz', async () => {
    const svc = planSvc(ozetSvc(null), vi.fn());
    await expect(svc.ozetPlaniKaydet(ctx, { clientId: IDS.client, etkin: true, saat: 9, toEmails: [] })).rejects.toThrow(/e-posta ayarlarını/);
    const p = await svc.ozetPlaniKaydet(ctx, { clientId: IDS.client, etkin: false, saat: 9, toEmails: [] });
    expect(p).toMatchObject({ kurulu: true, etkin: false });
  });

  it('KRİTİK: workspace başına TEK satır (upsert), varsayılan KAPALI, açınca sıradaki pazartesi', async () => {
    await h.q(
      `INSERT INTO user_email_accounts (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port, smtp_secure,
         smtp_user, smtp_pass_enc, key_version, verified_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'D', 'd@ajans.com', 'smtp.x', 465, true, 'd', '\\x00', 1, now(), now(), now())`,
      [IDS.org, IDS.user],
    );
    await h.q(`UPDATE clients SET contact_emails = ARRAY['m@musteri.com'] WHERE id = $1`, [IDS.client]);
    const svc = planSvc(ozetSvc(null), vi.fn());
    const once = await svc.ozetPlani(ctx, IDS.client);
    expect(once).toMatchObject({ kurulu: false, etkin: false, saat: 9, cozulenAliciListesi: ['m@musteri.com'], senderReady: true });
    await svc.ozetPlaniKaydet(ctx, { clientId: IDS.client, etkin: true, saat: 8, toEmails: [] });
    const p = await svc.ozetPlaniKaydet(ctx, { clientId: IDS.client, etkin: true, saat: 10, toEmails: ['b@musteri.com'] });
    expect(p).toMatchObject({ kurulu: true, etkin: true, saat: 10, cozulenAliciListesi: ['b@musteri.com'] });
    expect(new Date(p.siradaki!).getUTCDay()).toBe(1);
    expect(await h.q(`SELECT 1 FROM report_schedules WHERE tur = 'haftalik_ozet'`)).toHaveLength(1);
  });
});

// ─── Ajans kanalı (Paket A süpürmesi) ────────────────────────────────────────

describe('ajans kanalı', () => {
  async function kanal(client: string, olaylar: string[], tur: 'slack' | 'eposta' = 'slack'): Promise<string> {
    const [k] = await h.q<{ id: string }>(
      tur === 'slack'
        ? `INSERT INTO bildirim_kanallari (org_id, client_id, tur, ad, hedef_ipucu, hedef_enc, olaylar, created_at)
           SELECT c.org_id, c.id, 'slack', 'S', 'ipucu', '\\x00', $2::text[], '2026-10-01' FROM clients c WHERE c.id = $1 RETURNING id::text AS id`
        : `INSERT INTO bildirim_kanallari (org_id, client_id, tur, ad, hedef_ipucu, alicilar, olaylar, created_at)
           SELECT c.org_id, c.id, 'eposta', 'E', '1 alıcı', ARRAY['a@ajans.com'], $2::text[], '2026-10-01' FROM clients c WHERE c.id = $1 RETURNING id::text AS id`,
      [client, olaylar],
    );
    return k!.id;
  }

  function teslim(ozet?: OzetService) {
    const cfg = config();
    const t = new BildirimTeslimService(h.db as unknown as PrismaAdminService, new CryptoService(cfg), cfg, ozet);
    const mail = vi.fn(async () => ({ kabul: ['a@ajans.com'], ret: [] }));
    t.mail = mail as unknown as MailGonderici;
    t.webhook = vi.fn(async () => ({ httpDurum: 200, reddedildi: false, hata: null })) as unknown as WebhookGonderici;
    return { t, mail };
  }

  it('KRİTİK: yalnız olayı seçmiş kanala, kanal başına TEK satır; ikinci süpürme ikinci satır açmıyor; boş workspace sayılıyor', async () => {
    await normalHafta();
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Boş', 'bos', now())`, [C2, IDS.org]);
    const k1 = await kanal(IDS.client, ['haftalik_ozet']);
    await kanal(IDS.client, ['sinyal']);
    await kanal(C2, ['haftalik_ozet']);
    const { t } = teslim(ozetSvc(null));
    const r = await t.haftalikOzetleriUret(SIMDI);
    expect(r.uretilen).toBe(1);
    expect(r.not).toContain("1 kanalın workspace'inde harcama yok");
    expect(await h.q(`SELECT kanal_id::text AS k, olay, anahtar FROM bildirim_gonderimleri`)).toEqual([
      { k: k1, olay: 'haftalik_ozet', anahtar: `haftalik:${HAFTA}` },
    ]);
    expect((await t.haftalikOzetleriUret(SIMDI)).uretilen).toBe(0);
    expect(await h.q(`SELECT 1 FROM bildirim_gonderimleri`)).toHaveLength(1);
  });

  it('pazartesi 09:00 öncesi üretmiyor; hafta içinde AÇILAN kanal geçen haftanın özetini almıyor', async () => {
    await normalHafta();
    await kanal(IDS.client, ['haftalik_ozet']);
    const { t } = teslim(ozetSvc(null));
    expect((await t.haftalikOzetleriUret(new Date('2026-10-12T05:30:00Z'))).not).toBe('haftalık özet: saati gelmedi');
    await h.q(`UPDATE bildirim_kanallari SET created_at = '2026-10-14T10:00:00Z'`);
    expect((await t.haftalikOzetleriUret(new Date('2026-10-15T07:00:00Z'))).uretilen).toBe(0);
  });

  it('KRİTİK: e-posta kanalı AJANS görünümünün TAM mailini alıyor (aynı oluşturucu), Slack kısa sürümü', async () => {
    await normalHafta();
    await h.q(
      `INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, NULL, 'admin', now(), now())`,
      [IDS.user, IDS.org],
    );
    const ozet = ozetSvc(null);
    const { t, mail } = teslim(ozet);
    const cfg = config();
    await h.q(
      `INSERT INTO user_email_accounts (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port, smtp_secure,
         smtp_user, smtp_pass_enc, key_version, verified_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'D', 'd@ajans.com', 'smtp.x', 465, true, 'd', $3, 1, now(), now(), now())`,
      [IDS.org, IDS.user, new CryptoService(cfg).encrypt('x')],
    );
    // Teslim kendi CryptoService'iyle çözüyor: aynı anahtarla kuruluyor.
    (t as unknown as { crypto: CryptoService }).crypto = new CryptoService(cfg);
    await kanal(IDS.client, ['haftalik_ozet'], 'eposta');
    await t.haftalikOzetleriUret(SIMDI);
    const [g] = await h.q<{ id: string }>(`SELECT id::text AS id FROM bildirim_gonderimleri`);
    const sonuc = await t.gonder(g!.id, SIMDI);
    expect(sonuc?.durum).toBe('gonderildi');
    const giden = (mail.mock.calls[0] as unknown as [unknown, { html: string; subject: string }])[1];
    expect(giden.subject).toBe('Haftalık özet · Workspace · 5-11 Ekim');
    expect(giden.html).toContain(GIZLI);
    expect(giden.html).toContain('YALNIZ AJANS');
    expect(giden.html).toContain('https://panel.test/raporlar?musteri=');
  });
});

describe('saf: dönüşüm kıyası olgun günlerden', () => {
  it('KRİTİK: son günlerde dönüşüm "düşmüş" görünen hafta, olgun günlerde düşmediyse değişim 0', async () => {
    // Bu haftanın Cuma-Pazar dönüşümleri 0 (henüz oturmadı), Pzt-Per aynı.
    await kampanya(K1, 'Bir', { onceki: { harcama: 100, gosterim: 1000, donusum: 5 }, bu: { harcama: 100, gosterim: 1000, donusum: 5 } });
    await h.q(`UPDATE insights_daily SET conversions = 0 WHERE date BETWEEN '2026-10-09' AND '2026-10-11'`);
    const { ozet } = await ozetSvc(null).getir(IDS.client, HAFTA, SIMDI);
    const d = ozet.metrikler.find((m) => m.metrik === 'donusum')!;
    expect(d.bu!.sayi).toBe(20);
    expect(d.degisim).toBe(0);
    expect(d.kesinlesmedi).toBe(true);
  });

  it('ajans özetinin bölüm şekli sözleşmeyle aynı (JSON gidiş-dönüşte alan kaybı yok)', async () => {
    await normalHafta();
    const { ozet } = await ozetSvc(null).getir(IDS.client, HAFTA, SIMDI);
    const anahtarlar: Array<keyof HaftalikOzet> = [
      'clientId', 'clientAdi', 'hafta', 'aralik', 'oncekiAralik', 'paraBirimi', 'hacim', 'metrikler', 'donusumKiyasi',
      'degisenler', 'yaptiklarimiz', 'etkiler', 'sinyaller', 'bekleyenIsler', 'oneri', 'yorum', 'hatalar', 'uretildi',
    ];
    expect(Object.keys(ozet).sort()).toEqual([...anahtarlar].sort());
  });
});
