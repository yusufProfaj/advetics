import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { REHBER_ACILIS, REHBER_DURUMLARI, type RehberGuncelle, type TenantContext } from '@advetics/shared';
import { AJANS_UST_HESAP, createHarness, seedAjans, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AppConfig } from '../../../config/configuration';
import { ReklamHazirlikService } from '../hazirlik.service';
import { ReklamTaslakService } from '../taslak.service';
import { ReklamYayinService } from '../yayin.service';
import type { ReklamKuyrugu } from '../reklam-kuyrugu';
import { RehberService, platformaGiderken } from './rehber.service';

/**
 * REHBER SERVİSİ — gerçek şema (PGlite), sahte Google ve sahte kuyruk.
 *
 * En kritik iddialar: (1) yayın kapıları geçmeden platforma TEK çağrı
 * gitmiyor, (2) iki sekme aynı rehberi yazarsa ikincisi 409, (3) org_id
 * HEDEF workspace'ten, (4) RLS gerçekten sınanıyor (SET ROLE + RETURNING).
 */
let h: Harness;
let svc: RehberService;
let cagrilar: string[];
let kuyrukIsleri: string[];
let yz: { uret: (g: unknown) => Promise<unknown>; model: string } | null;

const KARDES_ORG = 'cccccccc-0000-4000-8000-00000000000c';
const KARDES_WS = 'cccccccc-0000-4000-8000-0000000000c1';
const OTEKI = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GHESAP = '44444444-0000-4000-8000-0000000000a1';
const HAVUZ = '44444444-0000-4000-8000-0000000000a2';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, KARDES_WS],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  managerAccountId: AJANS_UST_HESAP,
} as TenantContext;

const sahteGoogle = {
  rehberMutate: async (_c: unknown, g: { validateOnly: boolean }) => {
    cagrilar.push(`mutate:${g.validateOnly}`);
    return [];
  },
  rehberAra: async () => {
    cagrilar.push('ara');
    return [];
  },
  searchGeoLocations: async (_c: unknown, q: string) => {
    cagrilar.push(`geo:${q}`);
    return [{ key: 'geoTargetConstants/1012782', type: 'city', name: 'İzmir', label: 'İzmir, Turkey', countryCode: 'TR' }];
  },
  kelimeFikirleri: async () => {
    cagrilar.push('kelime');
    return [
      { kelime: 'türk kahve makinesi', aylikArama: '74000', rekabet: 'LOW', teklifAltMicros: '1', teklifUstMicros: '2' },
      { kelime: 'turk kahve makinesi', aylikArama: '74000', rekabet: 'LOW', teklifAltMicros: '1', teklifUstMicros: '2' },
    ];
  },
};

let whatsappCevabi: { number: string | null; hata: string | null };
const sahteMeta = {
  fetchPageWhatsapp: async (p: { pageExternalId: string }) => {
    cagrilar.push(`wa:${p.pageExternalId}`);
    return whatsappCevabi;
  },
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
    ekle: async (id: string, a: string) => void kuyrukIsleri.push(`${a}:${id}`),
    ekleProva: async (id: string) => void kuyrukIsleri.push(`prova:${id}`),
    ekleGoogle: async (id: string) => void kuyrukIsleri.push(`google_kur:${id}`),
  } as unknown as ReklamKuyrugu;
  svc = new RehberService(
    prisma,
    new ReklamHazirlikService(prisma),
    new ReklamTaslakService(prisma),
    new ReklamYayinService(prisma, kuyruk, config),
    kuyruk,
    { getAccessToken: async () => (cagrilar.push('token'), 'TOKEN') } as never,
    { get: (p: string) => (p === 'meta' ? sahteMeta : sahteGoogle) } as never,
    { isEnabled: false } as never,
    { decrypt: () => 'T' } as never,
    config,
    null,
    {
      listRecentVideos: async (kanal: string) => {
        cagrilar.push(`youtube:${kanal}`);
        return { durum: 'bulundu', videolar: [{ id: 'vid1', channelId: kanal, title: 'Tanıtım', publishedAt: new Date('2026-10-01T00:00:00Z'), thumbnailUrl: 'https://i.ytimg.com/x.jpg' }] };
      },
    } as never,
  );
});
afterAll(async () => h.close());
beforeEach(async () => {
  cagrilar = [];
  kuyrukIsleri = [];
  yz = null;
  whatsappCevabi = { number: null, hata: null };
  // Süreç içi önbellek servis örneğinde yaşıyor: test sızıntısı olmasın.
  (svc as unknown as { onbellek: Map<string, unknown>; sayfaOnbellek: Map<string, unknown> }).onbellek.clear();
  (svc as unknown as { sayfaOnbellek: Map<string, unknown> }).sayfaOnbellek.clear();
  // Yapay zekâ istemcisi testten testlere değişiyor (yok / sahte).
  (svc as unknown as { yz: unknown }).yz = null;
  await h.reset();
  await seedTenant(h);
  await seedAjans(h);
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Kardeş', 'kardes', now())`, [KARDES_ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Kardeş WS', 'kardes-ws', now())`, [KARDES_WS, KARDES_ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $3, $4, $5, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', now()),
            ($2, $3, NULL, $5, 'google', '9999999999', 'Havuz', 'TRY', 'Europe/Istanbul', now())`,
    [GHESAP, HAVUZ, IDS.org, IDS.client, IDS.connection],
  );
});

const g = (alan: string, deger: unknown, kaynak: RehberGuncelle['degisiklikler'][number]['kaynak'] = 'kullanici') => ({ alan, deger, kaynak });

/** Google Arama "Siteme gelsinler" — eksiksiz (yalnız Google; Meta provası kuyrukta, burada gerekmiyor). */
const TAM = [
  g('amac', 'SITE'),
  g('platformlar', { meta: false, google: true }),
  g('googleHesabiId', GHESAP, 'workspace_profili'),
  // Google karşılığı İSTEMCİDEN yazılamaz (BULGU-4); `konumlariEsle` yazar.
  g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi'),
  g('ekKategoriler', []),
  g('hedefAdres', 'https://ornek.com.tr/'),
  g('metin', { anaMetin: 'Villa', basliklar: ['Bir Başlık', 'İki Başlık', 'Üç Başlık'], aciklamalar: ['Birinci açıklama.', 'İkinci açıklama.'] }),
  g('anahtarKelimeler', [{ metin: 'kuşadası villa', aylikArama: 100 }]),
  g('butce', { tip: 'gunluk', micros: '250000000' }),
  g('takvim', { baslangic: '2030-01-01', bitis: null }),
];

async function tamRehber() {
  const r = await svc.olustur(CTX, IDS.client);
  await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: TAM });
  return svc.konumlariEsle(CTX, r.id);
}

describe('oluştur / oku / güncelle', () => {
  it('boş rehber: sürüm 0, eksik listesi DOLU (AMAC), özet var', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    expect(r).toMatchObject({ durum: 'taslak', surum: 0, metaTaslakId: null, googleTaslakId: null });
    expect(r.eksikler.map((e) => e.kod)).toEqual(['AMAC']);
    expect(r.icerikOzeti).toMatch(/^[0-9a-f]{64}$/);
  });

  it('KRİTİK: org_id HEDEF workspace’ten ("tüm şirketler" modunda ctx.orgId ev şirketi)', async () => {
    const r = await svc.olustur(CTX, KARDES_WS);
    const [s] = await h.q<{ org_id: string }>('SELECT org_id::text FROM reklam_rehberi WHERE id = $1', [r.id]);
    expect(s!.org_id).toBe(KARDES_ORG);
  });

  it('erişilmeyen workspace’te rehber açılmaz', async () => {
    await expect(svc.olustur(CTX, OTEKI)).rejects.toThrow(/erişimin yok/);
  });

  it('KRİTİK: iki sekme — eski sürümle yazan 409 alır, ilk yazan kaybolmaz', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const a = await svc.guncelle(CTX, r.id, { surum: 0, degisiklikler: [g('amac', 'SITE')] });
    expect(a.surum).toBe(1);
    await expect(svc.guncelle(CTX, r.id, { surum: 0, degisiklikler: [g('amac', 'FORM')] })).rejects.toMatchObject({ status: 409 });
    expect((await svc.oku(CTX, r.id)).alanlar.amac?.deger).toBe('SITE');
  });

  it('KRİTİK: havuzdaki ya da başka platformun hesabı seçilemez; platform okuması kaynağı istemciden yazılamaz', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    await expect(svc.guncelle(CTX, r.id, { surum: 0, degisiklikler: [g('googleHesabiId', HAVUZ)] })).rejects.toThrow(/atanmış değil/);
    await expect(svc.guncelle(CTX, r.id, { surum: 0, degisiklikler: [g('metaHesabiId', GHESAP)] })).rejects.toThrow(/atanmış değil/);
    await expect(svc.guncelle(CTX, r.id, { surum: 0, degisiklikler: [g('amac', 'SITE', 'meta_okumasi')] })).rejects.toThrow(/istemciden yazılamaz/);
  });

  it('eksiksiz Google rehberi: engel yok, karar tablosu dolu (teklif ölçüm bilinmiyor → tıklama)', async () => {
    const r = await tamRehber();
    expect(r.eksikler.filter((e) => e.seviye === 'engel')).toEqual([]);
    expect(r.kararlar.find((k) => k.kod === 'TEKLIF')?.google?.deger).toBe('En çok tıklama');
    expect(r.kararlar.find((k) => k.kod === 'TUR')?.meta).toBeNull();
  });

  it('liste: arşiv hariç HEPSİ, engel sayısıyla', async () => {
    await tamRehber();
    const bos = await svc.olustur(CTX, IDS.client);
    const ars = await svc.olustur(CTX, IDS.client);
    await svc.arsivle(CTX, ars.id);
    const l = await svc.listele(CTX, IDS.client);
    expect(l.toplam).toBe(2);
    expect(l.satirlar).toHaveLength(2);
    expect(l.satirlar.find((x) => x.id === bos.id)!.eksikSayisi).toBe(1);
  });
});

describe('prova ve yayın', () => {
  it('KRİTİK: eksik engel varsa prova YOK ve platforma çağrı gitmez', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    await expect(svc.prova(CTX, r.id)).rejects.toMatchObject({ status: 400 });
    expect(cagrilar).toEqual([]);
  });

  it('KRİTİK: Google provası AYNI gövdeyi validateOnly ile gönderir, prova kaydı ve rehber özeti bağlanır', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    expect(p.google).toMatchObject({ tur: 'gecti' });
    expect(p.meta).toBeNull();
    expect(cagrilar.filter((c) => c.startsWith('mutate'))).toEqual(['mutate:true']);
    const [pr] = await h.q<{ durum: string; derleyici_surumu: string }>('SELECT durum, derleyici_surumu FROM prova');
    expect(pr).toEqual({ durum: 'gecti', derleyici_surumu: 'g-1.0.0' });
    const [rr] = await h.q<{ prova_ozeti: string }>('SELECT prova_ozeti FROM reklam_rehberi');
    expect(rr!.prova_ozeti).toBe(p.icerikOzeti);
    // Google çocuk taslağı platform=google; Meta'nın strict şeması uygulanmadı.
    const [t] = await h.q<{ platform: string; durum: string }>('SELECT platform::text, durum FROM reklam_taslagi');
    expect(t).toEqual({ platform: 'google', durum: 'taslak' });
  });

  it('KRİTİK: yayın kapıları SIFIR platform çağrısı; geçince yayın kaydı + kuyruk, rehber "yayında"', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    cagrilar = [];
    // Özet uyuşmuyorsa 409, hiçbir şey kurulmaz.
    await expect(svc.yayinla(CTX, r.id, 'f'.repeat(64))).rejects.toMatchObject({ status: 409 });
    expect(await h.q('SELECT id FROM yayin')).toHaveLength(0);
    const d = await svc.yayinla(CTX, r.id, p.icerikOzeti);
    expect(cagrilar).toEqual([]);
    expect(kuyrukIsleri).toHaveLength(1);
    expect(kuyrukIsleri[0]).toMatch(/^google_kur:/);
    expect(d.platformlar).toEqual([expect.objectContaining({ platform: 'google', durum: 'on_kontrol', duraklatilmisKalacak: true })]);
    expect(d.uyum).toEqual({ tur: 'gecti' });
    const [y] = await h.q<{ atif_standardi: string; kapali_kalacak: boolean; derlenmis_govde: { govde: { validateOnly: boolean } } }>(
      'SELECT atif_standardi, kapali_kalacak, derlenmis_govde FROM yayin',
    );
    expect(y).toMatchObject({ atif_standardi: 'platform', kapali_kalacak: true });
    expect(y!.derlenmis_govde.govde.validateOnly).toBe(false);
    expect((await svc.oku(CTX, r.id)).durum).toBe('yayinda');
    await expect(svc.guncelle(CTX, r.id, { surum: 1, degisiklikler: [g('amac', 'FORM')] })).rejects.toMatchObject({ status: 409 });
  });

  it('KRİTİK: prova sonrası alan değişti → yayın PROVA kapısında durur (özet bağı)', async () => {
    const r = await tamRehber();
    await svc.prova(CTX, r.id);
    const r2 = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: [g('hedefAdres', 'https://baska.com.tr/')] });
    cagrilar = [];
    await expect(svc.yayinla(CTX, r.id, r2.icerikOzeti)).rejects.toMatchObject({ status: 400, response: { kapi: 'PROVA' } });
    expect(cagrilar).toEqual([]);
    expect(kuyrukIsleri).toEqual([]);
  });

  it('KRİTİK: Google yazma kesicisi kapalıysa YAZMA kapısı; kuyruğa iş girmez', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    await h.q(`INSERT INTO ajans_ayari (org_id, google_yazma_durduruldu, google_durdurma_at, google_durdurma_sebebi) VALUES ($1, true, now(), 'olay')`, [IDS.org]);
    await expect(svc.yayinla(CTX, r.id, p.icerikOzeti)).rejects.toMatchObject({ response: { kapi: 'YAZMA' } });
    expect(kuyrukIsleri).toEqual([]);
  });
});

describe('hazırlık, son prova, YouTube videoları', () => {
  it('hazırlık: Google hesabı hesap numarasıyla, havuz hesabı YOK; form listesi hazırlıkta değil, seçili form bilinmiyor', async () => {
    const hz = await svc.hazirlik(CTX, IDS.client);
    expect(hz.googleHesaplari).toEqual([expect.objectContaining({ id: GHESAP, musteriNo: '123-456-7890' })]);
    expect(hz).not.toHaveProperty('formSablonlari');
    expect(hz.asgariGunluk.googleTalepYaratma).toBe('250000000');
    expect(hz.onKosullar.seciliForm).toBeNull();
    expect(hz.ajansYoneticisi).toBe(true);
  });

  it('son prova: hiç yapılmadıysa null; yapıldıysa provanın özetiyle', async () => {
    const r = await tamRehber();
    expect(await svc.provaOku(CTX, r.id)).toBeNull();
    const p = await svc.prova(CTX, r.id);
    expect(await svc.provaOku(CTX, r.id)).toMatchObject({ icerikOzeti: p.icerikOzeti, google: { tur: 'gecti' }, meta: null });
  });

  it('YouTube: başka workspace’in kanalı platforma gitmeden NEDENLE; kendi kanalı listelenir', async () => {
    const KANAL = '66666666-0000-4000-8000-0000000000e1';
    expect(await svc.youtubeVideolari(CTX, IDS.client, KANAL)).toMatchObject({ satirlar: [], bosNeden: expect.stringMatching(/bağlı değil/) });
    expect(cagrilar).toEqual([]);
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
       VALUES ($1, $2, $3, $4, 'youtube_channel', 'UCx', 'Kanal', now())`,
      [KANAL.replace('e1', 'a1'), IDS.org, IDS.client, IDS.connection],
    );
    const l = await svc.youtubeVideolari(CTX, IDS.client, KANAL.replace('e1', 'a1'));
    expect(l).toEqual({ satirlar: [{ videoId: 'vid1', baslik: 'Tanıtım', kucukResim: 'https://i.ytimg.com/x.jpg', yayinTarihi: '2026-10-01T00:00:00.000Z' }], toplam: 1, dahaFazlaVar: false, bosNeden: null });
  });
});

describe('düğme arkasındaki öneriler', () => {
  it('anahtar kelime: hesap yoksa platforma gitmeden NEDEN; varsa yakın varyant tekilleşir', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    expect(await svc.anahtarKelimeOner(CTX, r.id, ['kahve'])).toMatchObject({ satirlar: [], toplam: 0, bosNeden: expect.stringMatching(/Google Ads hesabı seç/) });
    expect(cagrilar).toEqual([]);
    const t = await tamRehber();
    const o = await svc.anahtarKelimeOner(CTX, t.id, ['kahve makinesi']);
    expect(o.satirlar.map((s) => s.metin)).toEqual(['türk kahve makinesi']);
    expect(o.toplam).toBe(1);
  });

  it('konum eşleme: tam eşleşme yazılır, kaynak korunur, sürüm artar', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const a = await svc.guncelle(CTX, r.id, {
      surum: 0,
      degisiklikler: [g('googleHesabiId', GHESAP, 'workspace_profili'), g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi')],
    });
    const b = await svc.konumlariEsle(CTX, a.id);
    expect(b.surum).toBe(a.surum + 1);
    expect(b.alanlar.konumlar).toMatchObject({ kaynak: 'marka_merkezi', deger: [{ google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }] });
  });

  it('metin önerisi: yapay zekâ yoksa 503; varsa uydurma sayı atılır', async () => {
    const r = await tamRehber();
    await expect(svc.metinOner(CTX, r.id)).rejects.toMatchObject({ status: 503 });
    yz = {
      model: 'test',
      uret: async () => ({
        parcalar: [{ text: JSON.stringify({ anaMetin: 'Villa', basliklar: ['%50 indirim', 'Güzel Villa'], aciklamalar: ['Ornek açıklama.'], notlar: [] }) }],
        sebep: 'bitti',
        aciklama: null,
        girdiToken: 1,
        ciktiToken: 1,
        onbellekToken: 0,
      }),
    };
    (svc as unknown as { yz: unknown }).yz = yz;
    const m = await svc.metinOner(CTX, r.id);
    expect(m.basliklar).toEqual(['Güzel Villa']);
    expect(m.notlar.join(' ')).toMatch(/50/);
  });
});

describe('şema', () => {
  it('KRİTİK: durum CHECK’i REHBER_DURUMLARI ile aynı küme', () => {
    const sql = readFileSync(join(__dirname, '../../../../prisma/migrations/20261010120000_reklam_rehberi/migration.sql'), 'utf8');
    const blok = /reklam_rehberi_durum_chk" CHECK \("durum" IN \(([^)]*)\)\)/.exec(sql)?.[1];
    if (!blok) throw new Error('CHECK bulunamadı');
    expect([...blok.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...REHBER_DURUMLARI]);
  });
});

/** RLS — gerçek politikalar, sahibi olmayan rolle; "patlamadı" yetmez, ETKİLENEN SATIR sayılır. */
describe('RLS', () => {
  const ROL = 'advetics_rehber_test';
  beforeAll(async () => {
    await h.q(`DO $$ BEGIN CREATE ROLE ${ROL} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
    await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
    await h.q(`ALTER TABLE reklam_rehberi ENABLE ROW LEVEL SECURITY`);
  });

  async function kullanici<T = Record<string, unknown>>(sql: string, clientIds: string[]): Promise<T[]> {
    await h.q(`
      SELECT set_config('app.current_org_id', '${IDS.org}', false),
             set_config('app.current_user_id', '${IDS.user}', false),
             set_config('app.current_client_ids', '${clientIds.join(',')}', false),
             set_config('app.is_org_admin', 'off', false),
             set_config('app.current_active_client_id', '', false)`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      return await h.q<T>(sql);
    } finally {
      await h.q('RESET ROLE');
    }
  }

  it('KRİTİK: başka workspace’in rehberi görünmez ve UPDATE SIFIR satır etkiler (RETURNING ile sayıldı)', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    expect(await kullanici(`SELECT id FROM reklam_rehberi`, [IDS.client])).toHaveLength(1);
    expect(await kullanici(`SELECT id FROM reklam_rehberi`, [OTEKI])).toHaveLength(0);
    expect(await kullanici(`UPDATE reklam_rehberi SET surum = surum + 1 WHERE id = '${r.id}' RETURNING id`, [OTEKI])).toHaveLength(0);
    expect(await kullanici(`UPDATE reklam_rehberi SET surum = surum + 1 WHERE id = '${r.id}' RETURNING id`, [IDS.client])).toHaveLength(1);
  });

  it('KRİTİK: rehber erişilmeyen workspace’e TAŞINAMAZ (WITH CHECK) ve oraya açılamaz', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    await expect(kullanici(`UPDATE reklam_rehberi SET client_id = '${OTEKI}' WHERE id = '${r.id}' RETURNING id`, [IDS.client])).rejects.toThrow(/row-level security/);
    await expect(
      kullanici(`INSERT INTO reklam_rehberi (org_id, client_id, olusturan_id) VALUES ('${IDS.org}', '${OTEKI}', '${IDS.user}') RETURNING id`, [IDS.client]),
    ).rejects.toThrow(/row-level security/);
  });

  it('DELETE politikası YOK: silme sıfır satır (rehber arşivlenir)', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    expect(await kullanici(`DELETE FROM reklam_rehberi WHERE id = '${r.id}' RETURNING id`, [IDS.client])).toHaveLength(0);
  });
});

describe('ajans yöneticisi kuralı (deneme açılışlarının görünürlüğü)', () => {
  it('KRİTİK: üst hesabın admin üyesi KARDEŞ şirkete geçmişken de görür; üst hesap üyeliği olmayan şirket admini görmez', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const k = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: TAM });
    // Ajans çalışanı: amaç SITE görünür, Google açık sayılır → G- eksikleri değil, temiz.
    expect(k.eksikler.some((e) => e.kod === 'PLT-YOK')).toBe(false);
    // Aynı şirketin admini ama üst hesap üyesi DEĞİL (müşteri şirketinin kendi yöneticisi).
    const yabanci = { ...CTX, userId: '00000000-0000-4000-8000-0000000000e1' } as TenantContext;
    // Kural yalnız üst hesap ÜYELİĞİNE bakıyor; bu kullanıcının üyeliği yok.
    const y = await svc.oku(yabanci, r.id);
    expect(y.eksikler.map((e) => e.kod)).toContain('PLT-YOK');
    // Üst hesabı olmayan bağlam: ajans bilinmiyor → kapalı.
    const ustsuz = await svc.oku({ ...CTX, managerAccountId: null } as TenantContext, r.id);
    expect(ustsuz.eksikler.map((e) => e.kod)).toContain('PLT-YOK');
  });
});

/**
 * DALGA 2 — Meta form listesi, seçili formun hâli ve WhatsApp hattı.
 *
 * Bu dosyanın fixture'larında ön koşullar hiç doluydu; üretimdeki iki sabit
 * (`gizlilikAdresi: false`, `metaWhatsapp: null`) bu yüzden görülmedi. Buradaki
 * testler değerleri servisin KENDİ bağlamından okuyor.
 */
describe('Meta form listesi ve sayfa ön koşulları (Dalga 2)', () => {
  const S1 = '55555555-0000-4000-8000-0000000000b1';
  const S2 = '55555555-0000-4000-8000-0000000000b2';
  const MHESAP = '44444444-0000-4000-8000-0000000000b3';
  let istekler: string[];
  let formCevabi: () => Response;

  beforeEach(async () => {
    istekler = [];
    formCevabi = () =>
      new Response(
        JSON.stringify({
          data: [
            { id: '111', name: 'Teklif Formu', status: 'ACTIVE', privacy_policy_url: 'https://ornek.com.tr/kvkk' },
            { id: '222', name: 'Adressiz', status: 'ACTIVE' },
            { id: '333', name: 'Arşiv', status: 'ARCHIVED', privacy_policy_url: 'https://ornek.com.tr/kvkk' },
            { id: '444', name: 'Taslak', status: 'DRAFT', privacy_policy_url: 'https://ornek.com.tr/kvkk' },
            { id: '555', name: 'Bizde', status: 'ACTIVE', privacy_policy_url: 'https://ornek.com.tr/kvkk' },
          ],
        }),
        { status: 200 },
      );
    vi.stubGlobal('fetch', async (adres: string) => {
      istekler.push(String(adres));
      if (String(adres).includes('/leadgen_forms')) return formCevabi();
      if (String(adres).includes('leadgen_tos_accepted')) return new Response(JSON.stringify({ leadgen_tos_accepted: true }), { status: 200 });
      return new Response('{}', { status: 404 });
    });
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
       VALUES ($1, $3, $4, $5, 'facebook_page', '9001', 'Birinci', '\\x00', now()),
              ($2, $3, $4, $5, 'facebook_page', '9002', 'İkinci', '\\x00', now())`,
      [S1, S2, IDS.org, IDS.client, IDS.connection],
    );
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'act_77', 'M', 'TRY', 'Europe/Istanbul', now())`,
      [MHESAP, IDS.org, IDS.client, IDS.connection],
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Rehberin bağlamı (eksik listesinin girdisi) — servisin kendi yolu, platform çağrısı yok. */
  const baglam = (r: { alanlar: unknown }) =>
    (svc as unknown as { baglam: (c: TenantContext, id: string, a: unknown) => Promise<{ onKosullar: Record<string, unknown> }> }).baglam(CTX, IDS.client, r.alanlar);

  async function formRehberi(form: string, sayfa = S2) {
    const r = await svc.olustur(CTX, IDS.client);
    return svc.guncelle(CTX, r.id, {
      surum: r.surum,
      degisiklikler: [g('amac', 'FORM'), g('platformlar', { meta: true, google: false }), g('metaHesabiId', MHESAP, 'workspace_profili'), g('sayfaId', sayfa, 'workspace_profili'), g('formSablonuId', form)],
    });
  }

  it('KRİTİK: liste SEÇİLİ sayfanın Meta formlarından, yalnız ACTIVE; Advetics adı öncelikli; sayfa token’ıyla', async () => {
    await h.q(
      `INSERT INTO lead_forms (id, org_id, client_id, social_profile_id, name, prefill_questions, privacy_policy_url, root_id, status, external_form_id, published_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Panelde kurulan', '["EMAIL"]', 'https://o.com/kvkk', $1, 'published', '555', now(), now())`,
      ['77777777-0000-4000-8000-0000000000c5', IDS.org, IDS.client, S2],
    );
    const l = await svc.formSablonlari(CTX, IDS.client, S2);
    expect(istekler).toHaveLength(1);
    expect(istekler[0]).toContain('/9002/leadgen_forms');
    expect(istekler[0]).toContain('privacy_policy_url');
    expect(l).toEqual({
      satirlar: [
        { id: '111', ad: 'Teklif Formu', gizlilikAdresi: 'https://ornek.com.tr/kvkk' },
        { id: '222', ad: 'Adressiz', gizlilikAdresi: null },
        { id: '555', ad: 'Panelde kurulan', gizlilikAdresi: 'https://ornek.com.tr/kvkk' },
      ],
      toplam: 3,
      kesildi: false,
      bosNeden: null,
    });
  });

  it('boş liste NEDENİYLE; okunamayan liste 503 + Meta’nın mesajı (boş listeye çevrilmiyor)', async () => {
    formCevabi = () => new Response(JSON.stringify({ data: [{ id: '9', name: 'x', status: 'ARCHIVED' }] }), { status: 200 });
    expect(await svc.formSablonlari(CTX, IDS.client, S1)).toMatchObject({ satirlar: [], toplam: 0, bosNeden: expect.stringMatching(/yayında anlık form yok/) });
    formCevabi = () => new Response(JSON.stringify({ error: { message: '(#200) Requires pages_manage_ads', code: 200 } }), { status: 403 });
    await expect(svc.formSablonlari(CTX, IDS.client, S1)).rejects.toMatchObject({ status: 503 });
  });

  it('başka workspace’in sayfası platforma gitmeden reddedilir', async () => {
    await expect(svc.formSablonlari(CTX, IDS.client, '55555555-0000-4000-8000-0000000000ff')).rejects.toMatchObject({ status: 400 });
    expect(istekler).toEqual([]);
  });

  it('KRİTİK: seçili form — liste okunmadan BİLİNMİYOR; adresli form temiz; adressiz form adıyla; listede olmayan "yayında değil"', async () => {
    const r = await formRehberi('111');
    expect((await baglam(r)).onKosullar.seciliForm).toBeNull();
    await svc.formSablonlari(CTX, IDS.client, S2);
    // Üretimde burada sabit `gizlilikAdresi: false` vardı ve Form amacı HER ZAMAN engeldeydi.
    expect((await baglam(r)).onKosullar.seciliForm).toEqual({ ad: 'Teklif Formu', sayfadaYayinda: true, gizlilikAdresi: true });
    expect((await baglam(await formRehberi('222'))).onKosullar.seciliForm).toEqual({ ad: 'Adressiz', sayfadaYayinda: true, gizlilikAdresi: false });
    expect((await baglam(await formRehberi('333'))).onKosullar.seciliForm).toEqual({ ad: null, sayfadaYayinda: false, gizlilikAdresi: false });
    // Liste S2'nin: S1 seçili rehberde aynı form bilinmiyor (başka sayfanın listesi kullanılmaz).
    expect((await baglam(await formRehberi('111', S1))).onKosullar.seciliForm).toBeNull();
  });

  it('KRİTİK: eksik listesi (FORM açılışı geçici açık) — adresli formda FORM- engeli YOK', async () => {
    const eski = REHBER_ACILIS.FORM.meta;
    (REHBER_ACILIS.FORM as Record<string, string>).meta = 'deneme';
    try {
      await svc.formSablonlari(CTX, IDS.client, S2);
      const iyi = await svc.oku(CTX, (await formRehberi('111')).id);
      expect(iyi.eksikler.filter((e) => e.kod.startsWith('FORM-'))).toEqual([]);
      const kotu = await svc.oku(CTX, (await formRehberi('222')).id);
      expect(kotu.eksikler.find((e) => e.kod === 'FORM-GIZLILIK')?.metin).toContain('"Adressiz"');
    } finally {
      (REHBER_ACILIS.FORM as Record<string, string>).meta = eski;
    }
  });

  it('eski kayıt: UUID form yalnız SEÇİLİ sayfada YAYINLANMIŞSA Meta kimliğine çevrilir', async () => {
    const F_YAYIN = '77777777-0000-4000-8000-0000000000d1';
    const F_TASLAK = '77777777-0000-4000-8000-0000000000d2';
    await h.q(
      `INSERT INTO lead_forms (id, org_id, client_id, social_profile_id, name, prefill_questions, privacy_policy_url, root_id, status, external_form_id, published_at, updated_at)
       VALUES ($1, $3, $4, $5, 'Yayında', '["EMAIL"]', 'https://o.com/kvkk', $1, 'published', '111', now(), now()),
              ($2, $3, $4, $5, 'Taslak', '["EMAIL"]', 'https://o.com/kvkk', $2, 'draft', NULL, NULL, now())`,
      [F_YAYIN, F_TASLAK, IDS.org, IDS.client, S2],
    );
    await svc.formSablonlari(CTX, IDS.client, S2);
    expect((await baglam(await formRehberi(F_YAYIN))).onKosullar.seciliForm).toMatchObject({ sayfadaYayinda: true, gizlilikAdresi: true });
    expect((await baglam(await formRehberi(F_TASLAK))).onKosullar.seciliForm).toMatchObject({ sayfadaYayinda: false });
  });

  it('KRİTİK: WhatsApp hattı — numara okununca true; boş/okunamayan NULL (asla false); SEÇİLİ sayfa', async () => {
    whatsappCevabi = { number: '+90 555 000 00 00', hata: null };
    const hz = await svc.hazirlik(CTX, IDS.client);
    // Hazırlık ilk sayfayı okur (ad sırasıyla "Birinci").
    expect(hz.onKosullar.metaWhatsapp).toBe(true);
    expect(cagrilar).toContain('wa:9001');
    whatsappCevabi = { number: null, hata: null };
    const r = await svc.olustur(CTX, IDS.client);
    const k = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: [g('amac', 'WHATSAPP'), g('platformlar', { meta: true, google: false }), g('sayfaId', S2, 'workspace_profili')] });
    // İkinci sayfa okunmadı: ilk sayfanın `true`su ona TAŞINMIYOR.
    expect((await baglam(k)).onKosullar.metaWhatsapp).toBeNull();
    // Prova seçili sayfayı tazeler (engeller yüzünden 400 dönse de okuma yapılır).
    await svc.prova(CTX, r.id).catch(() => undefined);
    expect(cagrilar).toContain('wa:9002');
    expect((await baglam(k)).onKosullar.metaWhatsapp).toBeNull();
    whatsappCevabi = { number: '+905550000000', hata: null };
    await svc.prova(CTX, r.id).catch(() => undefined);
    expect((await baglam(k)).onKosullar.metaWhatsapp).toBe(true);
    whatsappCevabi = { number: null, hata: '(#100) bir hata' };
    await svc.prova(CTX, r.id).catch(() => undefined);
    expect((await baglam(k)).onKosullar.metaWhatsapp).toBeNull();
  });

  /*
   * AJAN 4 (Dalga 2) B2 — OKUMA DÜŞÜNCE FORM KONTROLÜ KAPALI KALIR.
   * Prova öncesi tazeleme listeyi okuyamazsa seçili form BİLİNMİYOR olur.
   * Düzenlemede bu uyarı; prova ve yayında ENGEL (`platformaGiderken`):
   * yoksa sayfa aidiyeti (FORM-SAYFA) ve gizlilik adresi (FORM-GIZLILIK)
   * denetlenmeden geçerdi.
   */
  it('KRİTİK: liste okunamazsa prova FORM-BILINMIYOR ENGELİYLE durur (düzenlemede uyarı kalır)', async () => {
    const eski = REHBER_ACILIS.FORM.meta;
    (REHBER_ACILIS.FORM as Record<string, string>).meta = 'deneme';
    try {
      // Okunabilen liste: başka sayfanın form kimliği (999) ENGEL.
      const r = await formRehberi('999');
      await svc.prova(CTX, r.id).catch(() => undefined);
      expect((await svc.oku(CTX, r.id)).eksikler.find((e) => e.kod === 'FORM-SAYFA')?.seviye).toBe('engel');
      // Okunamayan liste (izin, alan reddi, ağ): aynı kimlik yalnız uyarı.
      (svc as unknown as { sayfaOnbellek: Map<string, unknown> }).sayfaOnbellek.clear();
      formCevabi = () => new Response(JSON.stringify({ error: { message: '(#100) Tried accessing nonexisting field (privacy_policy_url)', code: 100 } }), { status: 400 });
      const hata = await svc.prova(CTX, r.id).then(
        () => null,
        (e: unknown) => e as { getResponse(): { eksikler: Array<{ kod: string; seviye: string }> } },
      );
      expect(hata?.getResponse().eksikler.map((e) => [e.kod, e.seviye])).toContainEqual(['FORM-BILINMIYOR', 'engel']);
      const form = (await svc.oku(CTX, r.id)).eksikler.filter((e) => e.kod.startsWith('FORM-'));
      expect(form.map((e) => [e.kod, e.seviye])).toEqual([['FORM-BILINMIYOR', 'uyari']]);
      // Yayın kapısı da aynı: önce taze okur, bilinmeyen hâlde engel.
      expect(platformaGiderken(form as never).map((e) => e.seviye)).toEqual(['engel']);
    } finally {
      (REHBER_ACILIS.FORM as Record<string, string>).meta = eski;
    }
  });
});
