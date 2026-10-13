import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  ONAY_BAGLANTISI_DENEME_SINIRI,
  rehberAlanlariSchema,
  resolvePermissions,
  type RehberHazirligi,
  type StratejiKalemiGirdisi,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { PrismaAdminService } from '../../../prisma/prisma-admin.service';
import type { AuditService } from '../../audit/audit.service';
import type { OlcumService } from '../../olcum/olcum.service';
import type { RaporGonderService } from '../../reports/rapor-gonder.service';
import type { ReklamHazirlikService } from '../../reklam/hazirlik.service';
import type { RehberService } from '../../reklam/rehber/rehber.service';
import type { StratejiKelimeKuyrugu } from '../kelime-kuyrugu';
import type { AppConfig } from '../../../config/configuration';
import { StratejiV2Service } from './strateji-v2.service';
import { OnayBaglantisiService } from './onay-baglantisi.service';

/**
 * AdvStrategy v2 servisi — gerçek şema (PGlite, üretim migration'ları).
 * RLS burada KAPALI (worker rolü taklidi); politikalar `strateji-v2-rls.spec.ts`.
 *
 * TRANSACTION GERÇEK: harness'in `$transaction`ı geri almıyor; aktarımın
 * "sıfır satır → geri al" kapısı ve tek kullanımlık karar ancak GERÇEK
 * BEGIN/ROLLBACK ile sınanır. `withTenant` ve yönetim `$transaction`ı bu
 * dosyada BEGIN/COMMIT/ROLLBACK sarıyor.
 */
let h: Harness;
let svc: StratejiV2Service;
let onay: OnayBaglantisiService;
const gonder = vi.fn();
const audit = { record: vi.fn(), recordUnauthenticated: vi.fn() };
let olcumYaniti: unknown = null;
const SIMDI = new Date('2026-10-20T09:00:00Z');
const VARLIK = '88888888-0000-4000-8000-000000000001';

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  role: 'admin',
  platformAdmin: true,
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;
const MUSTERI = { ...AJANS, isOrgAdmin: false, platformAdmin: false, role: 'client_viewer', permissions: [...resolvePermissions('client_viewer')] } as unknown as TenantContext;

const HAZIRLIK = {
  hesaplar: [{ id: IDS.adAccount, ad: 'Meta hesap', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }],
  sayfalar: [{ id: 's1', ad: 'Sayfa' }],
  instagramHesaplari: [],
  gorseller: { satirlar: [], toplam: 0 },
  marka: { yasalUyari: null, metinSablonlari: [], profilVar: true },
  varsayilanKitle: null,
  ozelKategoriTabani: [],
  taninmayanKategoriler: [],
  googleHesaplari: [],
  youtubeKanallari: [],
  onKosullar: {},
  asgariGunluk: { meta: '50000000', googleTalepYaratma: null },
  iletisim: { telefon: null, siteAdresi: 'https://ornek.com' },
  ajansYoneticisi: false,
  hazirlama: null,
} as unknown as RehberHazirligi;

async function islem<T>(fn: () => Promise<T>): Promise<T> {
  await h.q('BEGIN');
  try {
    const r = await fn();
    await h.q('COMMIT');
    return r;
  } catch (e) {
    await h.q('ROLLBACK');
    throw e;
  }
}

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => islem(() => fn(h.db)) } as unknown as PrismaService;
  const admin = Object.assign(Object.create(h.db as object), { $transaction: <T>(fn: (tx: unknown) => Promise<T>) => islem(() => fn(h.db)) }) as unknown as PrismaAdminService;
  onay = new OnayBaglantisiService(prisma, admin, audit as unknown as AuditService);
  onay.simdi = () => SIMDI;
  const rehber = {
    hazirlik: async () => HAZIRLIK,
    metinOnerAlanlardan: vi.fn(async () => ({ anaMetin: 'Deniz manzaralı 2+1 daireler', basliklar: ['Gaziemir’de yeni konut'], aciklamalar: [], notlar: [] })),
  } as unknown as RehberService;
  svc = new StratejiV2Service(
    prisma,
    rehber,
    { rehberOku: async () => HAZIRLIK } as unknown as ReklamHazirlikService,
    { durum: async () => olcumYaniti } as unknown as OlcumService,
    { ozetGonder: gonder } as unknown as RaporGonderService,
    audit as unknown as AuditService,
    { ekle: vi.fn() } as unknown as StratejiKelimeKuyrugu,
    onay,
    { mail: { appUrl: 'https://panel.advetics.com/' } } as unknown as AppConfig,
    null,
  );
  svc.simdi = () => SIMDI;
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  vi.clearAllMocks();
  gonder.mockResolvedValue({ to: ['musteri@ornek.com'], reddedilen: [] });
  olcumYaniti = null;
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'Salon', 's.jpg', 'image/jpeg', 1, 1080, 1080, 'k/s', 'aaaaaaaaaaaaaaaa1', now())`,
    [VARLIK, IDS.org, IDS.client],
  );
});

const planAc = () => svc.olustur(AJANS, { clientId: IDS.client, baslangicAyi: '2026-11', sureAy: 1, toplamButce: '50.000' });

const kalem = (o: Partial<StratejiKalemiGirdisi> = {}): StratejiKalemiGirdisi => ({
  amac: 'SITE',
  meta: true,
  google: false,
  metaPayi: null,
  butce: '30.000',
  baslangic: '2026-11-02',
  bitis: '2026-11-30',
  konumlar: [{ tur: 'region', key: '35', etiket: 'İzmir', ulkeKodu: 'TR' }],
  yasMin: null,
  yasMax: null,
  kelimeGrubu: null,
  varlikIdleri: [VARLIK],
  metin: { anaMetin: 'Denize sıfır', basliklar: ['Yeni konut'], aciklamalar: [], kaynak: 'ajans' },
  kreatifYonergesi: { metin: 'Salonun ışığı', kaynak: 'ajans' },
  kitleTarifi: { metin: 'Ev arayan aileler', kaynak: 'ai' },
  ...o,
});

async function onayliPlan() {
  const p = await planAc();
  const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] });
  await svc.eylem(AJANS, p.plan.id, { eylem: 'onaya_gonder', surum: d.plan.surum });
  return svc.onayla(MUSTERI, p.plan.id, d.plan.surum);
}

describe('plan açma (v2)', () => {
  it('KRİTİK: bicim 2, dönem ay başı-sonu; ikinci AÇIK strateji 409', async () => {
    const d = await planAc();
    expect(d.plan).toMatchObject({ bicim: 2, durum: 'taslak', surum: 1, baslangic: '2026-11-01', bitis: '2026-11-30', toplamButceMicros: '50000000000', workspaceAdi: 'Workspace' });
    await expect(planAc()).rejects.toThrow(/açık bir strateji zaten var/);
  });

  it('v1 planı v2 detayında 409; v2 planı listede bicim 2', async () => {
    await h.q(`INSERT INTO strateji_planlari (id, org_id, client_id, donem, toplam_butce_micros, para_birimi) VALUES ('99999999-0000-4000-8000-000000000001', $1, $2, '2026-09', 1000000, 'TRY')`, [IDS.org, IDS.client]);
    await expect(svc.detay(AJANS, '99999999-0000-4000-8000-000000000001')).rejects.toThrow(/eski biçimde/);
    await planAc();
    const l = await svc.listele(AJANS, IDS.client);
    expect(l.planlar.map((p) => p.bicim).sort()).toEqual([1, 2]);
    expect(l.toplam).toBe(2);
  });
});

describe('kalemler', () => {
  it('KRİTİK: sürüm artar; yanlış sürüm 409; tarih dönem dışı ve bütçe aşımı 400', async () => {
    const p = await planAc();
    const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] });
    expect(d.plan.surum).toBe(2);
    expect(d.kalemler).toHaveLength(1);
    await expect(svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] })).rejects.toThrow(/siz bakarken değişti/);
    await expect(svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 2, kalemler: [kalem({ bitis: '2026-12-05' })] })).rejects.toThrow(/dönemi .* dışına/);
    await expect(svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 2, kalemler: [kalem({ butce: '60.000' })] })).rejects.toThrow(/bütçesini .* aşıyor/);
  });

  it('KRİTİK: kalem kimliği KORUNUR; listeden çıkan silinir; tahmin SUNUCUDA (geçmiş yok → tahmin yok)', async () => {
    const p = await planAc();
    const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem(), kalem({ amac: 'ERISIM', varlikIdleri: [], butce: '10.000' })] });
    const ilk = d.kalemler[0]!;
    expect(ilk.tahmin.meta).toEqual({ tur: 'yok', neden: 'gecmis_yok' });
    expect(ilk.tahmin.google).toEqual({ tur: 'yok', neden: 'platform_kapali' });
    const d2 = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: d.plan.surum, kalemler: [kalem({ id: ilk.id, butce: '20.000' })] });
    expect(d2.kalemler.map((k) => k.id)).toEqual([ilk.id]);
    expect(d2.kalemler[0]!.butceMicros).toBe('20000000000');
  });

  it('KRİTİK: müşteri görünümünde ajans notu ve "Kullan" denmemiş yapay zekâ metni YOK', async () => {
    const p = await planAc();
    await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem({ not: 'iç not' })] });
    const ajans = await svc.detay(AJANS, p.plan.id);
    expect(ajans.kalemler[0]!.kitleTarifi?.kaynak).toBe('ai');
    expect(ajans.kalemler[0]!.not).toBe('iç not');
    const musteri = await svc.detay(MUSTERI, p.plan.id);
    expect(musteri.kalemler[0]!.kitleTarifi).toBeNull();
    expect(musteri.kalemler[0]!.not).toBeNull();
    expect(musteri.kalemler[0]!.kreatifYonergesi?.metin).toBe('Salonun ışığı');
  });
});

describe('durum makinesi', () => {
  it('KRİTİK: kalemsiz plan onaya gönderilemez; onaydaki plan yazılamaz', async () => {
    const p = await planAc();
    await expect(svc.eylem(AJANS, p.plan.id, { eylem: 'onaya_gonder', surum: 1 })).rejects.toThrow(/kampanya yok/);
    const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] });
    await svc.eylem(AJANS, p.plan.id, { eylem: 'onaya_gonder', surum: d.plan.surum });
    await expect(svc.kalemleriKaydet(AJANS, p.plan.id, { surum: d.plan.surum, kalemler: [kalem()] })).rejects.toThrow(/onayda/);
  });

  it('KRİTİK: revizyon YORUMLA; ilk kayıt taslağa çeker ve sürüm artar; yorum kaydı kalır', async () => {
    const p = await planAc();
    const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] });
    await svc.eylem(AJANS, p.plan.id, { eylem: 'onaya_gonder', surum: d.plan.surum });
    const r = await svc.revizyon(MUSTERI, p.plan.id, { surum: d.plan.surum, yorum: 'Bütçeyi Google’a kaydırın' });
    expect(r.plan.durum).toBe('revizyon');
    expect(r.plan.revizyonNotu).toBe('Bütçeyi Google’a kaydırın');
    const k = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: r.plan.surum, kalemler: [kalem()] });
    expect(k.plan).toMatchObject({ durum: 'taslak', surum: r.plan.surum + 1 });
    const y = await svc.yorumlar(AJANS, p.plan.id);
    expect(y.yorumlar.map((x) => [x.rol, x.tur])).toEqual([['musteri', 'revizyon']]);
  });

  it('KRİTİK: müşteri hesabının onayı rolüyle kaydedilir; onaylanan sürüm planın sürümü', async () => {
    const d = await onayliPlan();
    expect(d.plan.durum).toBe('onaylandi');
    expect(d.plan.onay).toMatchObject({ rol: 'musteri', kim: 'Test Kullanıcı', surum: d.plan.surum });
    expect(d.plan.onaylananSurum).toBe(d.plan.surum);
  });

  it('müşteri hesabı kalem YAZAMAZ ama yorum yazar (yetki serviste)', async () => {
    const p = await planAc();
    expect(MUSTERI.permissions).not.toContain('strategy.write');
    const y = await svc.yorumYaz(MUSTERI, p.plan.id, { surum: 1, metin: 'Güzel' });
    expect(y.yorumlar[0]).toMatchObject({ rol: 'musteri', tur: 'yorum', metin: 'Güzel' });
    await expect(svc.yorumYaz({ ...MUSTERI, permissions: ['strategy.read'] } as unknown as TenantContext, p.plan.id, { surum: 1, metin: 'x' })).rejects.toThrow(/yetkin yok/);
  });
});

describe('aktarım (kalem → rehber taslağı)', () => {
  it('KRİTİK: onaysız plan AKTARILMAZ', async () => {
    const p = await planAc();
    const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] });
    await expect(svc.aktar(AJANS, p.plan.id, { surum: d.plan.surum })).rejects.toThrow(/onaylanmadı/);
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM reklam_rehberi');
    expect(n!.n).toBe(0);
  });

  it('KRİTİK: onaylı kalem rehber TASLAĞI açar; alanlar `strateji` kaynaklı ve şemadan geçer; kalemde rehber kimliği', async () => {
    const d = await onayliPlan();
    const r = await svc.aktar(AJANS, d.plan.id, { surum: d.plan.surum });
    expect(r.kalemler).toHaveLength(1);
    const a = r.kalemler[0]!;
    expect(a.tur).toBe('acildi');
    const [rh] = await h.q<{ id: string; durum: string; alanlar: unknown }>('SELECT id::text, durum, alanlar FROM reklam_rehberi');
    expect(rh!.durum).toBe('taslak');
    const alanlar = rehberAlanlariSchema.parse(rh!.alanlar);
    expect(alanlar.amac).toMatchObject({ deger: 'SITE', kaynak: 'strateji', kim: IDS.user });
    expect(alanlar.butce).toMatchObject({ deger: { tip: 'toplam', micros: '30000000000' }, kaynak: 'strateji' });
    expect(alanlar.medya?.deger).toEqual([{ varlikId: VARLIK }]);
    expect(alanlar.metaHesabiId).toBeUndefined();
    const [k] = await h.q<{ rehber_id: string }>('SELECT rehber_id::text FROM strateji_kalemleri');
    expect(k!.rehber_id).toBe(rh!.id);
    const kutu = await svc.rehberStratejisi(AJANS, rh!.id);
    expect(kutu).toMatchObject({ planId: d.plan.id, sira: 1, kitleTarifi: null });
    expect(kutu!.kreatifYonergesi?.metin).toBe('Salonun ışığı');
  });

  it('KRİTİK: tekrarlanan aktarım İKİNCİ rehber açmaz (idempotent, zaten_aktarildi + rehber kimliği)', async () => {
    const d = await onayliPlan();
    const ilk = await svc.aktar(AJANS, d.plan.id, { surum: d.plan.surum });
    const ikinci = await svc.aktar(AJANS, d.plan.id, { surum: d.plan.surum });
    expect(ikinci.kalemler[0]).toMatchObject({ tur: 'engel', engel: 'zaten_aktarildi', rehberId: (ilk.kalemler[0] as { rehberId: string }).rehberId });
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM reklam_rehberi');
    expect(n!.n).toBe(1);
  });

  it('KRİTİK: yarış — kapıdan sonra başka istek aktardıysa koşullu UPDATE 0 satır, açılan rehber GERİ ALINIR', async () => {
    const d = await onayliPlan();
    const [k] = await h.q<{ id: string }>('SELECT id::text FROM strateji_kalemleri');
    const orijinal = h.db.$queryRaw.bind(h.db);
    let araya = false;
    (h.db as unknown as { $queryRaw: unknown }).$queryRaw = async (sorgu: Prisma.Sql) => {
      if (!araya && sorgu.sql.includes('UPDATE strateji_kalemleri SET rehber_id')) {
        araya = true;
        // "Öteki istek": kendi rehberini açıp kalemi bağladı.
        await orijinal(Prisma.sql`INSERT INTO reklam_rehberi (id, org_id, client_id, olusturan_id, alanlar)
          VALUES ('77777777-0000-4000-8000-000000000009', ${IDS.org}::uuid, ${IDS.client}::uuid, ${IDS.user}::uuid, '{}'::jsonb) RETURNING id`);
        await orijinal(Prisma.sql`UPDATE strateji_kalemleri SET rehber_id = '77777777-0000-4000-8000-000000000009', aktarim_zamani = now() WHERE id = ${k!.id}::uuid RETURNING id`);
      }
      return orijinal(sorgu);
    };
    try {
      const r = await svc.aktar(AJANS, d.plan.id, { surum: d.plan.surum });
      expect(r.kalemler[0]).toMatchObject({ tur: 'engel', engel: 'zaten_aktarildi' });
    } finally {
      (h.db as unknown as { $queryRaw: unknown }).$queryRaw = orijinal;
    }
    expect(araya).toBe(true);
    // İç transaction geri alındı mı: test "öteki isteği" aynı transaction'da
    // yazdığı için o da geri alınır — kritik olan, aktarımın açtığı İKİNCİ
    // rehberin kalmaması.
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM reklam_rehberi');
    expect(n!.n).toBe(0);
  });

  it('AdvCampaign reklam kurma izni (bulk.write) yoksa 403', async () => {
    const d = await onayliPlan();
    const yetkisiz = { ...AJANS, permissions: AJANS.permissions.filter((x) => x !== 'bulk.write') } as unknown as TenantContext;
    await expect(svc.aktar(yetkisiz, d.plan.id, { surum: d.plan.surum })).rejects.toThrow(/reklam kurma yetkin yok/);
  });

  it('aktarım önizlemesi: tek seçenekli hesap notta, seçilecek alanlar listede', async () => {
    const d = await onayliPlan();
    const o = await svc.aktarimOnizleme(AJANS, d.plan.id);
    expect(o.kalemler[0]!.karar.tur).toBe('aktarilabilir');
    expect(o.kalemler[0]!.rehberdeTamamlanacak).not.toContain('metaHesabiId');
    expect(o.kalemler[0]!.notlar.join(' ')).toMatch(/Meta reklam hesabı rehber açılınca kendiliğinden seçilir/);
  });
});

describe('gerçekleşen — rehberin yayın kampanyalarından, kalem tarihinde, platformlar ayrı', () => {
  it('KRİTİK: yalnız kalemin KENDİ kampanyası ve KALEM aralığı; ölçüt tıklama (site); plan payı ve tahmin taşınır', async () => {
    const d = await onayliPlan();
    const r = await svc.aktar(AJANS, d.plan.id, { surum: d.plan.surum });
    const rehberId = (r.kalemler[0] as { rehberId: string }).rehberId;
    const [t] = await h.q<{ id: string }>(
      `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id) VALUES ($1, $2, 'meta', 'acemi', $3) RETURNING id::text`,
      [IDS.org, IDS.client, IDS.user],
    );
    await h.q(`UPDATE reklam_rehberi SET meta_taslak_id = $1, durum = 'yayinda' WHERE id = $2`, [t!.id, rehberId]);
    const [y] = await h.q<{ id: string }>(
      `INSERT INTO yayin (org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, derlenmis_govde, beklenen_yanki,
                          api_surumu, derleyici_surumu, atif_standardi, kaynak, baslatan_id, durum)
       VALUES ($1, $2, $3, 1, $4, '[]', '[]', 'v25.0', '1', 'tik7', 'panel', $5, 'yayinda') RETURNING id::text`,
      [IDS.org, IDS.client, t!.id, 'b'.repeat(64), IDS.user],
    );
    await h.q(`INSERT INTO yayin_nesnesi (yayin_id, org_id, client_id, tur, ad, sira, durum, meta_id) VALUES ($1, $2, $3, 'kampanya', 'kampanya', 1, 'kuruldu', '120001')`, [y!.id, IDS.org, IDS.client]);
    const kampanya = async (ext: string) =>
      (await h.q<{ id: string }>(
        `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, objective, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'meta', $3, $3, 'OUTCOME_TRAFFIC', now()) RETURNING id::text`,
        [IDS.adAccount, IDS.client, ext],
      ))[0]!.id;
    const bizim = await kampanya('120001');
    const baska = await kampanya('999999');
    const metrik = (kamp: string, gun: string, tl: number, tik: number) =>
      h.q(
        `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, spend_micros, clicks, currency)
         VALUES ($1, $2, 'meta', 'campaign', $3, 'x', $4, $5, $6, 'TRY')`,
        [IDS.client, IDS.adAccount, kamp, gun, String(BigInt(tl) * 1_000_000n), tik],
      );
    await metrik(bizim, '2026-11-05', 100, 40);
    await metrik(bizim, '2026-11-06', 50, 10);
    await metrik(bizim, '2026-11-01', 999, 999); // kalem 2 Kasım'da başlıyor
    await metrik(baska, '2026-11-05', 777, 777); // başka kampanya
    svc.simdi = () => new Date('2026-12-05T09:00:00Z');
    try {
      const g = await svc.gerceklesen(AJANS, d.plan.id);
      const meta = g.kalemler[0]!.platformlar.meta!;
      expect(meta).toMatchObject({ harcananMicros: '150000000', sonuc: 50, planMicros: '30000000000', sonucNedeni: null });
      expect(g.kalemler[0]!.platformlar.google).toBeUndefined();
      expect(meta.tahmin).toEqual({ tur: 'yok', neden: 'gecmis_yok' });
    } finally {
      svc.simdi = () => SIMDI;
    }
  });
});

describe('girişsiz onay bağlantısı', () => {
  async function onaydaPlan() {
    const p = await planAc();
    const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] });
    return svc.eylem(AJANS, p.plan.id, { eylem: 'onaya_gonder', surum: d.plan.surum });
  }
  const tokenAl = (yol: string) => decodeURIComponent(yol.split('/').pop()!);

  it('KRİTİK: ham token yalnız yanıtta; veritabanında SHA-256', async () => {
    const d = await onaydaPlan();
    const b = await onay.olustur(AJANS, d.plan.id, { surum: d.plan.surum });
    const token = tokenAl(b.yol);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [r] = await h.q<{ token_hash: string }>('SELECT token_hash FROM strateji_onay_baglantilari');
    expect(r!.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    const tum = JSON.stringify(await h.q('SELECT * FROM strateji_onay_baglantilari'));
    expect(tum).not.toContain(token);
  });

  it('KRİTİK: bağlantıyla onay — rol baglanti, ad ve e-posta BEYAN olarak; ikinci karar 409 (tek kullanımlık)', async () => {
    const d = await onaydaPlan();
    const token = tokenAl((await onay.olustur(AJANS, d.plan.id, { surum: d.plan.surum })).yol);
    const okuma = await onay.belge(token, '1.1.1.1');
    expect(okuma).toMatchObject({ hal: 'gecerli', okunabilir: true, karar: true });
    expect(okuma.belge!.kalemler[0]!.kitleTarifi).toBeNull();
    const r = await onay.karar(token, { karar: 'onayla', ad: 'Mehmet Kaya', eposta: 'MK@Ornek.com', surum: d.plan.surum }, { ip: '1.1.1.1', userAgent: 'x' });
    expect(r.belge!.plan).toMatchObject({ durum: 'onaylandi', onay: { rol: 'baglanti', ad: 'Mehmet Kaya', eposta: 'mk@ornek.com', kim: null } });
    await expect(onay.karar(token, { karar: 'revizyon_iste', ad: 'Biri Başka', eposta: 'b@b.com', yorum: 'x', surum: d.plan.surum }, { ip: '1.1.1.1', userAgent: 'x' })).rejects.toThrow();
    const [p] = await h.q<{ durum: string }>('SELECT durum FROM strateji_planlari WHERE id = $1', [d.plan.id]);
    expect(p!.durum).toBe('onaylandi');
    expect(audit.recordUnauthenticated).toHaveBeenCalledWith(IDS.org, expect.objectContaining({ ip: '1.1.1.1', action: 'strateji.baglanti_onay' }));
    expect(JSON.stringify(audit.recordUnauthenticated.mock.calls)).not.toContain(token);
  });

  it('KRİTİK: geri çekilen planın bağlantısı karar YAZAMAZ; geçersiz, iptal ve süresi dolmuş AYNI cevap', async () => {
    const d = await onaydaPlan();
    const token = tokenAl((await onay.olustur(AJANS, d.plan.id, { surum: d.plan.surum })).yol);
    await svc.eylem(AJANS, d.plan.id, { eylem: 'geri_cek', surum: d.plan.surum });
    const hata = async (t: string) => onay.belge(t, '2.2.2.2').then(() => 'okundu', (e: Error) => e.message);
    const iptal = await hata(token);
    const yok = await hata('A'.repeat(43));
    const bicimsiz = await hata('kisa');
    expect(iptal).toBe('Bağlantı geçersiz.');
    expect(yok).toBe(iptal);
    expect(bicimsiz).toBe(iptal);
  });

  it('KRİTİK: sürüm değişince (revizyon sonrası yeniden onaya) eski bağlantı karar vermez', async () => {
    const d = await onaydaPlan();
    const token = tokenAl((await onay.olustur(AJANS, d.plan.id, { surum: d.plan.surum })).yol);
    // Eski sekmenin sürümüyle gelen karar: plan değişmedi ama gövde eski sürüm.
    await expect(onay.karar(token, { karar: 'onayla', ad: 'Mehmet Kaya', eposta: 'm@k.com', surum: d.plan.surum + 5 }, { ip: null, userAgent: null })).rejects.toThrow(/değişti/);
    const [p] = await h.q<{ durum: string }>('SELECT durum FROM strateji_planlari WHERE id = $1', [d.plan.id]);
    expect(p!.durum).toBe('onayda');
  });

  it('yeni bağlantı eskisini iptal eder (plan başına tek açık bağlantı)', async () => {
    const d = await onaydaPlan();
    const eski = tokenAl((await onay.olustur(AJANS, d.plan.id, { surum: d.plan.surum })).yol);
    await onay.olustur(AJANS, d.plan.id, { surum: d.plan.surum });
    await expect(onay.belge(eski, '3.3.3.3')).rejects.toThrow('Bağlantı geçersiz.');
    const l = await onay.listele(AJANS, d.plan.id);
    expect(l.baglantilar.filter((b) => b.iptalZamani === null)).toHaveLength(1);
  });

  it('KRİTİK: IP başına deneme sınırı (biçimsiz token da sayılır)', async () => {
    for (let i = 0; i < ONAY_BAGLANTISI_DENEME_SINIRI.istek; i++) await onay.belge('x', '9.9.9.9').catch(() => undefined);
    await expect(onay.belge('x', '9.9.9.9')).rejects.toThrow(/Çok fazla deneme/);
    await expect(onay.belge('x', '8.8.8.8')).rejects.toThrow('Bağlantı geçersiz.');
  });
});

describe('gönderim ve PDF', () => {
  it('KRİTİK: PDF sürüm ZORUNLU (eski sürüm 409); mail PDF eki ve KÖK alan adlı onay bağlantısıyla', async () => {
    const p = await planAc();
    const d = await svc.kalemleriKaydet(AJANS, p.plan.id, { surum: 1, kalemler: [kalem()] });
    await expect(svc.pdf(AJANS, p.plan.id, 1)).rejects.toThrow(/değişti/);
    const pdf = await svc.pdf(AJANS, p.plan.id, d.plan.surum);
    expect(pdf.bayt.subarray(0, 5).toString()).toBe('%PDF-');
    await svc.eylem(AJANS, p.plan.id, { eylem: 'onaya_gonder', surum: d.plan.surum });
    const r = await svc.gonder(AJANS, p.plan.id, { surum: d.plan.surum, alicilar: [] }, { ip: null, userAgent: null });
    expect(r.baglanti).not.toBeNull();
    const arg = gonder.mock.calls[0]![1] as { html: string; ekler: Array<{ contentType: string }> };
    expect(arg.ekler[0]!.contentType).toBe('application/pdf');
    expect(arg.html).toMatch(/https:\/\/panel\.advetics\.com\/strateji-onay\/[A-Za-z0-9_-]{43}/);
  });

  it('onay beklemeyen planda bağlantılı gönderim NEDENİYLE reddedilir; yetkisiz gönderim 403', async () => {
    const p = await planAc();
    await expect(svc.gonder(AJANS, p.plan.id, { surum: 1, alicilar: [] }, { ip: null, userAgent: null })).rejects.toThrow(/yalnız onay bekleyen/);
    const yetkisiz = { ...AJANS, permissions: AJANS.permissions.filter((x) => x !== 'report.share') } as unknown as TenantContext;
    await expect(svc.gonder(yetkisiz, p.plan.id, { surum: 1, alicilar: [] }, { ip: null, userAgent: null })).rejects.toThrow(/yetkin yok/);
    expect(gonder).not.toHaveBeenCalled();
  });
});

describe('öneri', () => {
  it('KRİTİK: yapay zekâ yokken kalemler yine gelir, metin bölümleri NEDENİYLE üretilemedi; YAZMAZ', async () => {
    const p = await planAc();
    const o = await svc.oner(AJANS, p.plan.id);
    expect(o.kalemler.length).toBeGreaterThan(0);
    expect(o.uretilemeyen.find((u) => u.bolum === 'ozet')?.neden).toMatch(/Yapay zekâ bağlı değil/);
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM strateji_kalemleri');
    expect(n!.n).toBe(0);
    const ikinci = await svc.oner(AJANS, p.plan.id);
    expect(ikinci.onbellekten).toBe(true);
  });
});
