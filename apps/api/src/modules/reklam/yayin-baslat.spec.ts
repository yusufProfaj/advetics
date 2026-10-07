import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { taslakKanonikIcerik, type TaslakAlanlari, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { SahteMeta } from '../../../test/reklam-sahte-meta';
import { yayinBaslat, zamanDamgasi } from './yayin-baslat';
import { reklamIsiniIsle, yayinIsiniIsle, type IsleyiciBagimliliklari } from './yayin-isleyici';
import { MetaKesinHata } from './yayin-motoru';
import { DERLEYICI_SURUMU, derleMeta, provaGovdeleri } from '@advetics/shared';
import type { TxRunner } from './yayin-motoru';

/**
 * YAYINLA → KUYRUK İŞİ → MOTOR, gerçek şemayla. Kuyruğun kendisi yok
 * (BullMQ), işleyici doğrudan çağrılıyor; Meta sahte.
 */
let h: Harness;
let tx: TxRunner;
const HESAP = '44444444-0000-4000-8000-000000000001';
const SAYFA = '55555555-0000-4000-8000-000000000001';
const VARLIK = '66666666-0000-4000-8000-000000000001';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true } as TenantContext;
const SIMDI = new Date('2026-10-07T09:00:00Z');
const kok = mkdtempSync(join(tmpdir(), 'yayin-'));
writeFileSync(join(kok, 'g.png'), 'PNG');

beforeAll(async () => {
  h = await createHarness();
  tx = (fn) => fn(h.db as never);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q('DELETE FROM ad_accounts');
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'act_77', 'H', 'TRY', 'Europe/Istanbul', now())`,
    [HESAP, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', '111', 'Sayfa', now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'image', 'g', 'g.png', 'image/png', 3, 1080, 1080, 'g.png', $4, now())`,
    [VARLIK, IDS.org, IDS.client, '1'.repeat(64)],
  );
  await h.q(`INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secim_at) VALUES ($1, 'tik7_gor1', now())`, [IDS.org]);
});

const z = '2026-10-07T08:00:00.000Z';
const k = <T,>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: IDS.user, zaman: z });
const DOLU: TaslakAlanlari = {
  niyet: k('SITE' as const),
  reklamHesabiId: k(HESAP),
  sayfaId: k(SAYFA),
  konumlar: k([{ tur: 'region' as const, key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }]),
  kavramlar: k([{ varlikId: VARLIK, baslik: 'Başlık', metin: 'Metin' }]),
  hedefAdres: k('https://ornek.com.tr'),
  butce: k({ tip: 'gunluk' as const, micros: '500000000' }),
  takvim: k({ baslangic: '2026-10-08', bitis: '2026-10-21' }),
  ekKategoriler: k([]),
};

async function taslak(alanlar: TaslakAlanlari = DOLU) {
  const ozet = createHash('sha256').update(taslakKanonikIcerik(alanlar)).digest('hex');
  const [t] = await h.q<{ id: string }>(
    `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no, ad_account_id)
     VALUES ($1, $2, 'meta', 'acemi', $3, 1, $4) RETURNING id::text`,
    [IDS.org, IDS.client, IDS.user, HESAP],
  );
  await h.q(
    `INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, olusturan_id)
     VALUES ($1, $2, $3, 1, $4::jsonb, $5, $6)`,
    [t!.id, IDS.org, IDS.client, JSON.stringify(alanlar), ozet, IDS.user],
  );
  return { taslakId: t!.id, ozet };
}
const baslat = async (o: Partial<{ testKipi: boolean; surumNo: number; ozet: string; ctx: TenantContext }> & { taslakId: string; ozet0: string }) =>
  yayinBaslat(tx, o.ctx ?? CTX, { taslakId: o.taslakId, surumNo: o.surumNo ?? 1, icerikOzeti: o.ozet ?? o.ozet0, testKipi: o.testKipi ?? true }, { apiSurumu: 'v25.0', simdi: SIMDI });
const kodlar = (r: Awaited<ReturnType<typeof yayinBaslat>>) => (r.tur === 'ret' ? r.retler.map((x) => x.kod) : []);

function bagimlilik(meta: SahteMeta, kilitDolu = false): IsleyiciBagimliliklari {
  return {
    tx,
    crypto: { decrypt: () => 'TOKEN' },
    apiSurumu: 'v25.0',
    yuklemeKoku: kok,
    kilit: { al: async () => !kilitDolu, birak: async () => undefined },
    kilitOneki: 'advetics',
    portKur: () => meta,
  };
}

describe('ön kontrol (sıfır çağrı)', () => {
  it('KRİTİK: prova olmadan GERÇEK yayın yok; yalnız test kipi', async () => {
    const t = await taslak();
    expect(kodlar(await baslat({ ...t, ozet0: t.ozet, testKipi: false }))).toEqual(['OK-17', 'UYUM']);
  });

  it('sürüm ya da özet değiştiyse yayın başlamaz', async () => {
    const t = await taslak();
    expect(kodlar(await baslat({ ...t, ozet0: t.ozet, surumNo: 2 }))).toEqual(['SURUM']);
    expect(kodlar(await baslat({ ...t, ozet0: t.ozet, ozet: 'f'.repeat(64) }))).toEqual(['SURUM']);
  });

  it('atıf standardı yoksa, anahtar kapalıysa, eksik varsa reddedilir — hepsi birlikte söylenir', async () => {
    await h.q(`UPDATE ajans_ayari SET atif_standardi = NULL, atif_secim_at = NULL, meta_yazma_durduruldu = true, durdurma_at = now(), durdurma_sebebi = 'olay'`);
    const { konumlar: _, ...eksik } = DOLU;
    const t = await taslak(eksik);
    expect(kodlar(await baslat({ ...t, ozet0: t.ozet })).sort()).toEqual(['KNM-01', 'OK-15', 'OK-16'].sort());
  });

  it('test kipini yönetici olmayan kullanamaz', async () => {
    const t = await taslak();
    expect(kodlar(await baslat({ ...t, ozet0: t.ozet, ctx: { ...CTX, isOrgAdmin: false } }))).toEqual(['TEST-KIPI']);
  });

  it('başarılı başlangıç: yayın + zincir sırasıyla nesneler, taslak "yayında"; çift tıklama reddedilir', async () => {
    const t = await taslak();
    const r = await baslat({ ...t, ozet0: t.ozet });
    expect(r.tur).toBe('basladi');
    const n = await h.q<{ ad: string }>(`SELECT ad FROM yayin_nesnesi ORDER BY sira`);
    expect(n.map((x) => x.ad)).toEqual([`medya:${VARLIK}`, 'kampanya', 'reklam_seti', 'kreatif:1', 'reklam:1']);
    const [d] = await h.q<{ durum: string }>(`SELECT durum FROM reklam_taslagi WHERE id = $1`, [t.taslakId]);
    expect(d!.durum).toBe('yayinda');
    expect(kodlar(await baslat({ ...t, ozet0: t.ozet }))).toEqual(['DURUM']);
  });

  it('takvim hesabın saat diliminde ve ofsetli: Europe/Istanbul +0300, yaz saatinde Berlin +0200 / kışın +0100', () => {
    expect(zamanDamgasi('2026-10-08', '00:00:00', 'Europe/Istanbul')).toBe('2026-10-08T00:00:00+0300');
    expect(zamanDamgasi('2026-10-08', '00:00:00', 'Europe/Berlin')).toBe('2026-10-08T00:00:00+0200');
    expect(zamanDamgasi('2026-11-08', '23:59:00', 'Europe/Berlin')).toBe('2026-11-08T23:59:00+0100');
    expect(zamanDamgasi('2026-11-08', '00:00:00', 'America/Los_Angeles')).toBe('2026-11-08T00:00:00-0800');
  });
});

describe('uçtan uca: yayınla → işleyici → test kipi', () => {
  it('KRİTİK: kurar, geri okur, AÇMADAN arşivler; yayın sonlanır, taslak düzenlemeye döner', async () => {
    const t = await taslak();
    const r = await baslat({ ...t, ozet0: t.ozet });
    if (r.tur !== 'basladi') throw new Error(JSON.stringify(r));
    const meta = new SahteMeta();
    const s = await yayinIsiniIsle(bagimlilik(meta), { yayinId: r.yayinId, adim: 'kur' }, 'is-1');
    expect(s).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect([...meta.kayitlar.values()].filter((x) => x.status === 'ACTIVE')).toHaveLength(0);
    const kampanya = [...meta.kayitlar.values()].find((x) => x.uc === 'campaigns')!;
    expect(kampanya.status).toBe('ARCHIVED');
    // Derleyicinin gövdesi Meta'ya gerçekten bu hâliyle gitti.
    expect(kampanya.alanlar).toMatchObject({ objective: 'OUTCOME_TRAFFIC', daily_budget: '50000', special_ad_categories: [] });
    const adset = [...meta.kayitlar.values()].find((x) => x.uc === 'adsets')!;
    expect(adset.alanlar).toMatchObject({ start_time: '2026-10-08T00:00:00+0300', end_time: '2026-10-21T23:59:00+0300' });
    const [d] = await h.q<{ durum: string }>(`SELECT durum FROM reklam_taslagi WHERE id = $1`, [t.taslakId]);
    expect(d!.durum).toBe('taslak');
  });

  it('kilit doluysa ERTELENİR, Meta’ya hiçbir şey gitmez', async () => {
    const t = await taslak();
    const r = await baslat({ ...t, ozet0: t.ozet });
    if (r.tur !== 'basladi') throw new Error();
    const meta = new SahteMeta();
    expect((await yayinIsiniIsle(bagimlilik(meta, true), { yayinId: r.yayinId, adim: 'kur' }, 'is-1')).tur).toBe('ertele');
    expect(meta.postSayisi).toBe(0);
  });

  it('bağlantı yeniden yetkilendirilmeliyse ön kontrolde sebebiyle kapanır', async () => {
    const t = await taslak();
    const r = await baslat({ ...t, ozet0: t.ozet });
    if (r.tur !== 'basladi') throw new Error();
    await h.q(`UPDATE platform_connections SET status = 'needs_reauth'`);
    const meta = new SahteMeta();
    expect(await yayinIsiniIsle(bagimlilik(meta), { yayinId: r.yayinId, adim: 'kur' }, 'is-1')).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    const [y] = await h.q<{ sebep: string; sonlanma_sebebi: string }>(`SELECT sebep, sonlanma_sebebi FROM yayin`);
    expect(y).toEqual({ sebep: 'Meta bağlantısı yeniden yetkilendirilmeli', sonlanma_sebebi: 'on_kontrol_reddi' });
    expect(meta.postSayisi).toBe(0);
  });
});

describe('Meta provası', () => {
  async function prova(taslakId: string, ozet: string, o: { durum?: string; bitti?: string } = {}) {
    const [p] = await h.q<{ id: string }>(
      `INSERT INTO prova (org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, ad_account_id, api_surumu, derleyici_surumu, durum, bitti_at)
       VALUES ($1, $2, $3, 1, $4, $5, 'v25.0', $6, $7, ${o.bitti ?? 'NULL'}) RETURNING id::text`,
      [IDS.org, IDS.client, taslakId, ozet, HESAP, DERLEYICI_SURUMU, o.durum ?? 'bekliyor'],
    );
    return p!.id;
  }

  it('KRİTİK: prova NESNE AÇMAZ; her gövde validate_only ile soruluyor; geçince taslak hazır', async () => {
    const t = await taslak();
    const id = await prova(t.taslakId, t.ozet);
    const meta = new SahteMeta();
    expect(await reklamIsiniIsle(bagimlilik(meta), { provaId: id, adim: 'prova' }, 'p1')).toEqual({ tur: 'bitti', durum: 'gecti' });
    expect(meta.postSayisi).toBe(0);
    expect(meta.kayitlar.size).toBe(0);
    expect(meta.provalar).toEqual(['campaigns', 'adsets', 'adcreatives', 'ads']);
    const [d] = await h.q<{ durum: string }>(`SELECT durum FROM reklam_taslagi WHERE id = $1`, [t.taslakId]);
    expect(d!.durum).toBe('hazir');
  });

  it('her gövde denenir, retler birlikte söylenir', async () => {
    const t = await taslak();
    const id = await prova(t.taslakId, t.ozet);
    const meta = new SahteMeta();
    meta.provaHatasi = (uc) => (uc === 'adsets' || uc === 'ads' ? new MetaKesinHata(`${uc} reddedildi`, 100) : null);
    expect(await reklamIsiniIsle(bagimlilik(meta), { provaId: id, adim: 'prova' }, 'p1')).toEqual({ tur: 'bitti', durum: 'reddedildi' });
    expect(meta.provalar).toHaveLength(4);
    const [p] = await h.q<{ sebep: string }>(`SELECT sebep FROM prova WHERE id = $1`, [id]);
    expect(p!.sebep).toBe('Meta 2 parçayı kabul etmedi: adsets reddedildi · ads reddedildi');
  });

  it('hesap başına 5 dk’da en çok 2 prova; aşınca ertelenir, Meta’ya gidilmez', async () => {
    const t = await taslak();
    await prova(t.taslakId, 'a'.repeat(64), { durum: 'gecti', bitti: "now() - interval '1 minute'" });
    await prova(t.taslakId, 'b'.repeat(64), { durum: 'reddedildi', bitti: "now() - interval '2 minutes'" });
    const id = await prova(t.taslakId, t.ozet);
    const meta = new SahteMeta();
    expect((await reklamIsiniIsle(bagimlilik(meta), { provaId: id, adim: 'prova' }, 'p1')).tur).toBe('ertele');
    expect(meta.provalar).toHaveLength(0);
  });

  it('KRİTİK: geçen ve TAZE prova gerçek yayının OK-17 engelini kaldırır; bayat prova kaldırmaz', async () => {
    const t = await taslak();
    await prova(t.taslakId, t.ozet, { durum: 'gecti', bitti: "'2026-10-07T08:50:00Z'" });
    expect(kodlar(await baslat({ ...t, ozet0: t.ozet, testKipi: false }))).toEqual(['UYUM']);
    const t2 = await taslak();
    await prova(t2.taslakId, t2.ozet, { durum: 'gecti', bitti: "'2026-10-07T08:00:00Z'" });
    expect(kodlar(await baslat({ ...t2, ozet0: t2.ozet, testKipi: false }))).toEqual(['OK-17', 'UYUM']);
  });

  it('sonuçlanmış prova değişmez; aynı sürüm için ikinci bekleyen prova açılmaz', async () => {
    const t = await taslak();
    const id = await prova(t.taslakId, t.ozet, { durum: 'gecti', bitti: 'now()' });
    await expect(h.q(`UPDATE prova SET durum = 'reddedildi' WHERE id = $1`, [id])).rejects.toThrow(/degismez/);
    await prova(t.taslakId, t.ozet);
    await expect(prova(t.taslakId, t.ozet)).rejects.toThrow(/prova_bekleyen_key|unique/);
  });

  it('prova gövdeleri: satır içi kampanya ve reklam seti, gerçek hash, her gövdede validate_only', () => {
    const r = derleMeta({
      apiSurumu: 'v25.0', yayinKimligi: 'p-1234', tarih: '2026-10-07', workspaceKisaAdi: 'Ö', niyet: 'SITE',
      hesap: { platformId: 'act_1', paraBirimi: 'TRY' }, sayfaPlatformId: '111', instagramPlatformId: null,
      hedefleme: { konumlar: [{ tur: 'country', key: 'TR', etiket: 'TR', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
      kategoriler: { taban: [], ek: [] }, butce: { tip: 'gunluk', micros: 100_000_000n, seviye: 'kampanya' },
      takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null }, atif: 'tik7',
      kavramlar: [{ gorselHash: `{medya:${VARLIK}}`, baslik: 'B', metin: 'M' }], hedefAdres: 'https://ornek.com.tr', formId: null, urlEtiketleri: null,
    });
    if (r.tur !== 'govde') throw new Error();
    const p = provaGovdeleri(r.govdeler, new Map([[VARLIK, 'HASH']]));
    const set = p.find((x) => x.nesne === 'reklam_seti')!.alanlar;
    expect(set).not.toHaveProperty('campaign_id');
    expect(set.campaign_spec).toMatchObject({ objective: 'OUTCOME_TRAFFIC', daily_budget: '10000' });
    const reklam = p.find((x) => x.nesne === 'reklam')!.alanlar;
    expect(reklam).not.toHaveProperty('adset_id');
    expect(reklam.execution_options).toEqual(['validate_only', 'synchronous_ad_review']);
    expect(JSON.stringify(p)).toContain('HASH');
    expect(JSON.stringify(p)).not.toMatch(/\{(kampanya|reklam_seti|kreatif|medya)/);
    for (const g of p) expect(g.alanlar.execution_options).toContain('validate_only');
  });
});
