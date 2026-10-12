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
import { GeminiIstemcisi } from '../../../yapay-zeka/gemini';

/*
 * TABLODAN BAĞIMSIZ: bu dosyanın testleri "Siteme gelsinler"i DENEME açılışı
 * örneği olarak kullanıyor. SITE 2026-10-12'de `acik` oldu; testler süresince
 * deneme yapılıp geri alınıyor (açılış tablosu kodda DEĞİŞMİYOR).
 */
const SITE_ACILIS = { ...REHBER_ACILIS.SITE };
beforeEach(() => {
  REHBER_ACILIS.SITE.meta = 'deneme';
  REHBER_ACILIS.SITE.google = 'deneme';
});
afterEach(() => {
  Object.assign(REHBER_ACILIS.SITE, SITE_ACILIS);
});

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
/** Disk deposunun sahtesi: metin önerisi görseli buradan okuyor (Dalga 2). */
const depoDosyalari = new Map<string, Buffer>();
const depo = {
  read: async (k: string) => {
    const b = depoDosyalari.get(k);
    if (!b) throw new Error(`dosya yok: ${k}`);
    return b;
  },
};
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
    depo as never,
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

  it('liste: ARŞİV DAHİL hepsi, arşiv EN SONDA, engel sayısıyla (giriş ekranının Arşiv sekmesi)', async () => {
    const tam = await tamRehber();
    const ars = await svc.olustur(CTX, IDS.client);
    await svc.arsivle(CTX, ars.id);
    const bos = await svc.olustur(CTX, IDS.client);
    const l = await svc.listele(CTX, IDS.client);
    expect(l.toplam).toBe(3);
    // Arşiv en yeni değişiklik olsa bile sonda: sınır keserse önce onu keser.
    expect(l.satirlar.map((x) => x.id)).toEqual([bos.id, tam.id, ars.id]);
    expect(l.satirlar.find((x) => x.id === ars.id)!.durum).toBe('arsivlendi');
    expect(l.satirlar.find((x) => x.id === bos.id)!.eksikSayisi).toBe(1);
    expect(l.satirlar.find((x) => x.id === tam.id)!.eksikSayisi).toBe(0);
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
    // Dalga 3: liste platformun GERÇEK hâlini taşıyor; arşivlenen yayın
    // "Yayında" diye okunmasın (rehberin kendi durumu yayinda kalıyor).
    const satir = async () => (await svc.listele(CTX, IDS.client)).satirlar.find((x) => x.id === r.id)!;
    expect((await satir()).yayinlar).toEqual([{ platform: 'google', durum: 'on_kontrol', sebep: null }]);
    await h.q(`UPDATE yayin SET durum = 'arsivlendi'`);
    expect((await satir()).yayinlar).toEqual([{ platform: 'google', durum: 'arsivlendi', sebep: null }]);
    const taslak = await svc.olustur(CTX, IDS.client);
    expect((await svc.listele(CTX, IDS.client)).satirlar.find((x) => x.id === taslak.id)!.yayinlar).toEqual([]);
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

/**
 * GİRİŞ EKRANI LİSTESİ (2026-10-12). Kullanıcının şikâyeti: "görüntü
 * kirliliği, hiçbir şey anlaşılmıyor ve silinmiyor". Satırı ayırt eden
 * alanlar (görsel, bütçe, yayın adı), arşiv/geri getir ve sabit sorgu sayısı.
 */
describe('giriş listesi: satır alanları, arşiv ve geri getir', () => {
  const GORSEL = '55555555-0000-4000-8000-0000000000b1';
  const VIDEO = '55555555-0000-4000-8000-0000000000b2';
  const KAPAK = '55555555-0000-4000-8000-0000000000b3';
  const YABANCI = '55555555-0000-4000-8000-0000000000b4';

  async function varliklar() {
    for (const [id, kind, client] of [
      [GORSEL, 'image', IDS.client],
      [VIDEO, 'video', IDS.client],
      [KAPAK, 'image', IDS.client],
      [YABANCI, 'image', OTEKI],
    ] as const) {
      await h.q(
        `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
         VALUES ($1, $2, $3, $4, 'v', 'v.bin', $5, 1000, 1080, 1080, 'yok', $6, now())`,
        [id, IDS.org, client, kind, kind === 'image' ? 'image/png' : 'video/mp4', id],
      );
    }
  }
  const satiri = async (id: string) => (await svc.listele(CTX, IDS.client)).satirlar.find((x) => x.id === id)!;

  it('küçük görsel: ilk görsel; video ise KAPAĞI; başka workspace’in varlığı ASLA', async () => {
    await varliklar();
    const a = await svc.olustur(CTX, IDS.client);
    await svc.guncelle(CTX, a.id, { surum: 0, degisiklikler: [g('medya', [{ varlikId: GORSEL }])] });
    const v = await svc.olustur(CTX, IDS.client);
    await svc.guncelle(CTX, v.id, { surum: 0, degisiklikler: [g('medya', [{ varlikId: VIDEO, kapakVarlikId: KAPAK }, { varlikId: GORSEL }])] });
    const kapaksiz = await svc.olustur(CTX, IDS.client);
    await svc.guncelle(CTX, kapaksiz.id, { surum: 0, degisiklikler: [g('medya', [{ varlikId: VIDEO }])] });
    // Aitlik kapısı yabancı varlığı yazdırmıyor; eski/bozuk kayıt ELLE yazılıyor.
    const yabanci = await svc.olustur(CTX, IDS.client);
    await h.q(`UPDATE reklam_rehberi SET alanlar = $2::jsonb WHERE id = $1`, [
      yabanci.id,
      JSON.stringify({ medya: { deger: [{ varlikId: YABANCI }], kaynak: 'kullanici', kim: IDS.user, zaman: '2026-10-12T00:00:00.000Z' } }),
    ]);
    expect((await satiri(a.id)).gorselVarlikId).toBe(GORSEL);
    expect((await satiri(v.id)).gorselVarlikId).toBe(KAPAK);
    // Video kendisi <img> olamaz: kapak yoksa null (panel amaç simgesine düşer).
    expect((await satiri(kapaksiz.id)).gorselVarlikId).toBeNull();
    expect((await satiri(yabanci.id)).gorselVarlikId).toBeNull();
  });

  it('bütçe ve para birimi seçili hesaptan; taslakta yayın adı yok', async () => {
    const r = await tamRehber();
    const s = await satiri(r.id);
    expect(s.butce).toEqual({ tip: 'gunluk', micros: '250000000', paraBirimi: 'TRY' });
    expect(s.yayinAdi).toBeNull();
    expect(s.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await satiri((await svc.olustur(CTX, IDS.client)).id)).butce).toBeNull();
  });

  it('yayın adı platformdakiyle AYNI biçim ve kod yayın kimliğinden', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    await svc.yayinla(CTX, r.id, p.icerikOzeti);
    const [y] = await h.q<{ id: string }>('SELECT id::text FROM yayin');
    const kod = y!.id.replace(/-/g, '').slice(0, 4).toUpperCase();
    expect((await satiri(r.id)).yayinAdi).toMatch(new RegExp(`^ADV · \\d{2}\\.\\d{2}\\.\\d{4} · Siteme gelsinler · ${kod}$`));
  });

  it('KRİTİK: sorgu sayısı satır sayısından BAĞIMSIZ (N+1 yok)', async () => {
    const db = h.db as unknown as { $queryRaw: (...a: unknown[]) => unknown };
    const say = async () => {
      const casus = vi.spyOn(db, '$queryRaw');
      await svc.listele(CTX, IDS.client);
      const n = casus.mock.calls.length;
      casus.mockRestore();
      return n;
    };
    await tamRehber();
    await svc.olustur(CTX, IDS.client);
    const iki = await say();
    for (let i = 0; i < 6; i++) await tamRehber();
    expect(await say()).toBe(iki);
  });

  it('arşivle YALNIZ listeden kaldırır: platform çağrısı ve kuyruk işi yok, yayın kaydı değişmez', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    await svc.yayinla(CTX, r.id, p.icerikOzeti);
    const once = await h.q('SELECT id, durum, sonlandi_at FROM yayin');
    cagrilar = [];
    kuyrukIsleri = [];
    expect((await svc.arsivle(CTX, r.id)).durum).toBe('arsivlendi');
    expect(cagrilar).toEqual([]);
    expect(kuyrukIsleri).toEqual([]);
    expect(await h.q('SELECT id, durum, sonlandi_at FROM yayin')).toEqual(once);
    // Arşivdeki satır platformun hâlini göstermeye devam ediyor: kampanya orada duruyor.
    expect((await satiri(r.id)).yayinlar).toEqual([{ platform: 'google', durum: 'on_kontrol', sebep: null }]);
  });

  it('KRİTİK: geri getir ÖNCEKİ duruma: yayına gitmiş olan "yayinda", gitmemiş "taslak"', async () => {
    const yayinda = await tamRehber();
    const p = await svc.prova(CTX, yayinda.id);
    await svc.yayinla(CTX, yayinda.id, p.icerikOzeti);
    // Provası yapılmış (çocuk taslağı var) ama yayına gitmemiş: taslak dönmeli.
    const provali = await tamRehber();
    await svc.prova(CTX, provali.id);
    const bos = await svc.olustur(CTX, IDS.client);
    for (const r of [yayinda, provali, bos]) await svc.arsivle(CTX, r.id);
    expect((await svc.geriGetir(CTX, yayinda.id)).durum).toBe('yayinda');
    expect((await svc.geriGetir(CTX, provali.id)).durum).toBe('taslak');
    expect((await svc.geriGetir(CTX, bos.id)).durum).toBe('taslak');
    const [k] = await h.q<{ arsivlendi_at: Date | null }>('SELECT arsivlendi_at FROM reklam_rehberi WHERE id = $1', [bos.id]);
    expect(k!.arsivlendi_at).toBeNull();
    // Arşivde olmayanı geri getirmek 409; geri gelen taslak yeniden düzenlenebilir.
    await expect(svc.geriGetir(CTX, bos.id)).rejects.toMatchObject({ status: 409 });
    expect((await svc.guncelle(CTX, bos.id, { surum: 0, degisiklikler: [g('amac', 'FORM')] })).alanlar.amac?.deger).toBe('FORM');
    // Yayına gitmiş olan düzenlenemez kalıyor (ikinci kampanya açılmasın).
    await expect(svc.yayinla(CTX, yayinda.id, p.icerikOzeti)).rejects.toMatchObject({ status: 409 });
  });

  /*
   * AJAN 4: KISMEN BAŞLAMIŞ — yayın kaydı YALNIZ META çocuğunda. Mevcut
   * test yalnız Google çocuğuyla koşuyor; EXISTS'teki IN listesinden
   * `meta_taslak_id` düşse yine geçerdi ve Meta'da yayında olan reklam
   * taslağa dönüp İKİNCİ kampanyayı açtırırdı.
   */
  it('KRİTİK: yalnız META çocuğunun yayın kaydı var, Google çocuğu hiç başlamamış → "yayinda"', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    await svc.yayinla(CTX, r.id, p.icerikOzeti);
    // Yayın kaydı olan çocuk Meta sütununa taşınıyor, Google sütununa
    // kaydı OLMAYAN yeni bir taslak konuyor: "bir platform yayında, öbürü
    // başlamamış" hâli.
    const yeni = await svc.olustur(CTX, IDS.client);
    await svc.guncelle(CTX, yeni.id, { surum: 0, degisiklikler: TAM });
    await svc.konumlariEsle(CTX, yeni.id);
    const p2 = await svc.prova(CTX, yeni.id);
    expect(p2.google).toMatchObject({ tur: 'gecti' });
    await h.q(
      `UPDATE reklam_rehberi SET meta_taslak_id = google_taslak_id, google_taslak_id = (SELECT google_taslak_id FROM reklam_rehberi WHERE id = $2) WHERE id = $1`,
      [r.id, yeni.id],
    );
    const [k] = await h.q<{ var: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM yayin y JOIN reklam_rehberi r ON y.taslak_id = r.google_taslak_id WHERE r.id = $1) AS var`,
      [r.id],
    );
    expect(k!.var).toBe(false);
    await svc.arsivle(CTX, r.id);
    expect((await svc.geriGetir(CTX, r.id)).durum).toBe('yayinda');
  });

  /*
   * AJAN 4: ARŞİVDEKİ REHBER "Gör" ile açılabiliyor (panel bağlantısı
   * duruyor). Arşivden çıkmadan hiçbir yazma ve platforma giden hiçbir uç
   * çalışmamalı — çalışırsa "listeden kaldırılmış" bir taslak sessizce
   * yayına gidebilir.
   */
  it('KRİTİK: arşivdeki taslak düzenlenmez, prova/yayın/konum eşleme reddedilir ve platforma çağrı gitmez', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    const ars = await svc.arsivle(CTX, r.id);
    cagrilar = [];
    kuyrukIsleri = [];
    await expect(svc.guncelle(CTX, r.id, { surum: ars.surum, degisiklikler: [g('amac', 'FORM')] })).rejects.toMatchObject({ status: 409 });
    await expect(svc.prova(CTX, r.id)).rejects.toMatchObject({ status: 409 });
    await expect(svc.yayinla(CTX, r.id, p.icerikOzeti)).rejects.toMatchObject({ status: 409 });
    await expect(svc.konumlariEsle(CTX, r.id)).rejects.toMatchObject({ status: 409 });
    expect(cagrilar).toEqual([]);
    expect(kuyrukIsleri).toEqual([]);
    expect(await h.q('SELECT id FROM yayin')).toHaveLength(0);
  });

  /*
   * AJAN 4: arşivlenin erişim denetimi hiç sınanmıyordu — `erisim` satırı
   * silinince rehber klasörünün 145 testi de yeşil kaldı (mutasyon M5).
   * Panel bu ucu 2026-10-12'den beri satır menüsünden çağırıyor.
   */
  it('KRİTİK: arşivle erişilmeyen workspace’in rehberine dokunmaz (403, durum değişmez)', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const dar = { ...CTX, clientIds: [KARDES_WS], activeClientId: KARDES_WS } as TenantContext;
    await expect(svc.arsivle(dar, r.id)).rejects.toMatchObject({ status: 403 });
    expect((await satiri(r.id)).durum).toBe('taslak');
  });

  it('geri getir: erişilmeyen workspace’in rehberine dokunmaz', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    await svc.arsivle(CTX, r.id);
    const dar = { ...CTX, clientIds: [KARDES_WS], activeClientId: KARDES_WS } as TenantContext;
    await expect(svc.geriGetir(dar, r.id)).rejects.toMatchObject({ status: 403 });
    expect((await satiri(r.id)).durum).toBe('arsivlendi');
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

  /** Servisin GERÇEK sorgularını rol altında koşturur (kopya sorgu düzeltilmiş hâli taşır). */
  async function rolIle<T>(clientIds: string[], fn: () => Promise<T>): Promise<T> {
    await h.q(`
      SELECT set_config('app.current_org_id', '${IDS.org}', false),
             set_config('app.current_user_id', '${IDS.user}', false),
             set_config('app.current_client_ids', '${clientIds.join(',')}', false),
             set_config('app.is_org_admin', 'off', false),
             set_config('app.current_active_client_id', '', false)`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      return await fn();
    } finally {
      await h.q('RESET ROLE');
    }
  }

  it('KRİTİK: liste, arşivle ve geri getir politikalardan GEÇİYOR (servisin kendi sorguları, rol altında)', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const ctx = { ...CTX, clientIds: [IDS.client] } as TenantContext;
    expect((await rolIle([IDS.client], () => svc.arsivle(ctx, r.id))).durum).toBe('arsivlendi');
    const l = await rolIle([IDS.client], () => svc.listele(ctx, IDS.client));
    expect(l.satirlar.map((x) => [x.id, x.durum])).toEqual([[r.id, 'arsivlendi']]);
    expect((await rolIle([IDS.client], () => svc.geriGetir(ctx, r.id))).durum).toBe('taslak');
    // Başka workspace'in kapsamında satır GÖRÜNMÜYOR: UPDATE'e hiç ulaşılmıyor.
    await svc.arsivle(CTX, r.id);
    await expect(rolIle([OTEKI], () => svc.geriGetir({ ...CTX, clientIds: [OTEKI, IDS.client] } as TenantContext, r.id))).rejects.toMatchObject({ status: 404 });
    const [k] = await h.q<{ durum: string }>('SELECT durum FROM reklam_rehberi WHERE id = $1', [r.id]);
    expect(k!.durum).toBe('arsivlendi');
  });

  /*
   * AJAN 4 (2026-10-12, giriş ekranı kapısı): geri getirin "yayın kaydı var
   * mı" sorusu `yayin` tablosuna RLS ALTINDA soruluyor. Yukarıdaki test
   * `yayin`ın politikasını hiç açmadan ve yayına gitmemiş bir rehberle
   * koşuyordu, yani EXISTS'in rol altında YANLIŞ cevap vermesi (satır var
   * ama görünmüyor → `taslak` → ikinci kampanya) hiç sınanmamıştı.
   */
  it('KRİTİK: yayına gitmiş rehber rol altında da "yayinda" döner (yayin politikası AÇIK, EXISTS görünürlüğe tabi)', async () => {
    await h.q(`ALTER TABLE yayin ENABLE ROW LEVEL SECURITY`);
    try {
      const r = await tamRehber();
      const p = await svc.prova(CTX, r.id);
      await svc.yayinla(CTX, r.id, p.icerikOzeti);
      await svc.arsivle(CTX, r.id);
      const ctx = { ...CTX, clientIds: [IDS.client] } as TenantContext;
      // Kayıt rol altında GÖRÜNÜYOR olmalı; görünmeseydi aşağıdaki iddia anlamsız kalırdı.
      expect(await kullanici(`SELECT id FROM yayin`, [IDS.client])).toHaveLength(1);
      expect((await rolIle([IDS.client], () => svc.geriGetir(ctx, r.id))).durum).toBe('yayinda');
      await expect(rolIle([IDS.client], () => svc.yayinla(ctx, r.id, p.icerikOzeti))).rejects.toMatchObject({ status: 409 });
    } finally {
      await h.q(`ALTER TABLE yayin DISABLE ROW LEVEL SECURITY`);
    }
  });

  it('KRİTİK: görsel metni önbelleği — upsert İKİ KEZ de bir satır etkiler (UPDATE politikası), başka workspace göremez/yazamaz', async () => {
    await h.q(`ALTER TABLE rehber_gorsel_metni ENABLE ROW LEVEL SECURITY`);
    const yaz = `INSERT INTO rehber_gorsel_metni (org_id, client_id, icerik_ozeti, amac, sonuc, model)
      VALUES ('${IDS.org}', '${IDS.client}', '${'a'.repeat(64)}', 'SITE', '{}'::jsonb, 'm')
      ON CONFLICT (client_id, icerik_ozeti, amac) DO UPDATE SET sonuc = EXCLUDED.sonuc, updated_at = now() RETURNING client_id`;
    expect(await kullanici(yaz, [IDS.client])).toHaveLength(1);
    // İkinci yazım UPDATE dalı: politikası olmasaydı sıfır satır dönerdi.
    expect(await kullanici(yaz, [IDS.client])).toHaveLength(1);
    expect(await kullanici(`SELECT 1 FROM rehber_gorsel_metni`, [IDS.client])).toHaveLength(1);
    expect(await kullanici(`SELECT 1 FROM rehber_gorsel_metni`, [OTEKI])).toHaveLength(0);
    await expect(kullanici(yaz, [OTEKI])).rejects.toThrow(/row-level security/);
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

  it('KRİTİK: rehberle açılan hazırlık SEÇİLİ sayfayı okur (ilkini değil); başka workspace’in rehberi reddedilir', async () => {
    // Dalga 3: hazırlık hep ilk sayfayı okuyordu; ikinci sayfayı seçen
    // kullanıcının WhatsApp/form koşulu prova anına kadar "bilinmiyor"du.
    whatsappCevabi = { number: '+905550000000', hata: null };
    const r = await svc.olustur(CTX, IDS.client);
    const k = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: [g('amac', 'WHATSAPP'), g('platformlar', { meta: true, google: false }), g('sayfaId', S2, 'workspace_profili')] });
    cagrilar.length = 0;
    const hz = await svc.hazirlik(CTX, IDS.client, r.id);
    expect(cagrilar).toContain('wa:9002');
    expect(cagrilar).not.toContain('wa:9001');
    expect(hz.onKosullar.metaWhatsapp).toBe(true);
    expect((await baglam(k)).onKosullar.metaWhatsapp).toBe(true);
    await expect(svc.hazirlik(CTX, '33333333-0000-4000-8000-0000000000ff', r.id)).rejects.toThrow();
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

/**
 * GÖRSELE ÖZEL METİN (Dalga 2) — GERÇEK Gemini istemcisi, sahte `fetch`:
 * iddialar modele GİDEN GÖVDEYE çapalı (görsel parçası, sıcaklık, çözünürlük,
 * çapa satırı). Sahte bir `uret` bu alanları hiç görmezdi.
 */
describe('metin önerisi: görsel, önbellek, çapa (Dalga 2)', () => {
  const V1 = '66666666-0000-4000-8000-000000000001';
  const V2 = '66666666-0000-4000-8000-000000000002';
  const V3 = '66666666-0000-4000-8000-000000000003';
  const V4 = '66666666-0000-4000-8000-000000000004';
  const KV = '66666666-0000-4000-8000-0000000000c1';
  const BAYT = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  let govdeler: Array<{
    contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
    generationConfig: { temperature?: number; mediaResolution?: string };
    systemInstruction: { parts: Array<{ text: string }> };
  }>;
  let cevap: Record<string, unknown>;

  async function varlik(id: string, ws: string = IDS.client, org: string = IDS.org, boyut = BAYT.length, ek: { hash?: string } = {}) {
    await h.q(
      `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
       VALUES ($1, $2, $3, 'image', $4, $4, 'image/png', $5, 1080, 1080, $4, $6, now())`,
      [id, org, ws, `g-${id.slice(-2)}.png`, boyut, ek.hash ?? id.replace(/-/g, '').padEnd(64, 'a').slice(0, 64)],
    );
    depoDosyalari.set(`g-${id.slice(-2)}.png`, BAYT);
  }

  beforeEach(async () => {
    depoDosyalari.clear();
    govdeler = [];
    cevap = { anaMetin: 'Villa', basliklar: ['Güzel Villa', 'Bahçeli Villa'], aciklamalar: ['Bahçeli açıklama.'], gorunenYol: [], gorseldekiYazilar: [], notlar: [] };
    (svc as unknown as { yz: unknown }).yz = new GeminiIstemcisi({
      apiKey: 'k',
      model: 'gemini-test',
      fetchFn: (async (_u: string, init: { body: string }) => {
        govdeler.push(JSON.parse(init.body));
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(cevap) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 50 } }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
    });
  });

  async function medyaliRehber(medya: unknown[], ws: string = IDS.client) {
    const r = await svc.olustur(CTX, ws);
    const ek = ws === IDS.client ? TAM : [g('amac', 'SITE'), g('hedefAdres', 'https://ornek.com.tr/')];
    return svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: [...ek, g('medya', medya)] });
  }

  it('KRİTİK: görsel METİNDEN ÖNCE gidiyor; sıcaklık ve orta çözünürlük açıkça; çapa satırı YOK', async () => {
    await varlik(V1);
    const r = await medyaliRehber([{ varlikId: V1 }]);
    const m = await svc.metinOner(CTX, r.id, { varlikId: V1 });
    expect(govdeler).toHaveLength(1);
    const parcalar = govdeler[0]!.contents[0]!.parts;
    expect(parcalar[0]!.inlineData).toEqual({ mimeType: 'image/png', data: BAYT.toString('base64') });
    expect(parcalar.at(-1)!.text).toMatch(/^Amaç:/);
    expect(govdeler[0]!.generationConfig.temperature).toBe(0.9);
    expect(govdeler[0]!.generationConfig.mediaResolution).toBe('MEDIA_RESOLUTION_MEDIUM');
    // Rehberde metin VAR ("Villa"); normal öneride isteme girmez.
    expect(parcalar.at(-1)!.text).not.toContain('Kullanıcının yazdığı');
    expect(govdeler[0]!.systemInstruction.parts[0]!.text).toContain('Görselde yazan fiyat');
    expect(m).toMatchObject({ basliklar: ['Güzel Villa', 'Bahçeli Villa'], onbellekten: false, gorselSayisi: 1 });
  });

  it('KRİTİK: aynı görsel aynı amaçla ikinci kez → yapay zekâya GİDİLMEZ; "yeniden yaz" gider ve öncekini tekrar etme der', async () => {
    await varlik(V1);
    const r = await medyaliRehber([{ varlikId: V1 }]);
    await svc.metinOner(CTX, r.id, { varlikId: V1 });
    const ikinci = await svc.metinOner(CTX, r.id, { varlikId: V1, mod: 'yeni' });
    expect(govdeler).toHaveLength(1);
    expect(ikinci).toMatchObject({ onbellekten: true, basliklar: ['Güzel Villa', 'Bahçeli Villa'] });
    cevap = { ...cevap, basliklar: ['Yeni Başlık'] };
    const ucuncu = await svc.metinOner(CTX, r.id, { varlikId: V1, mod: 'yeniden_yaz' });
    expect(govdeler).toHaveLength(2);
    expect(govdeler[1]!.contents[0]!.parts.at(-1)!.text).toMatch(/Tekrar etme \(önceki öneri\):[\s\S]*- Güzel Villa/);
    expect(ucuncu.basliklar).toEqual(['Yeni Başlık']);
    // Önbellek SON sonucu tutuyor (tek satır, güncellendi).
    const satirlar = await h.q<{ sonuc: { basliklar: string[] }; amac: string; org_id: string }>('SELECT sonuc, amac, org_id::text FROM rehber_gorsel_metni');
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toMatchObject({ amac: 'SITE', org_id: IDS.org, sonuc: { basliklar: ['Yeni Başlık'] } });
  });

  it('KRİTİK: "buna göre yeniden yaz" kullanıcının metnini isteme koyar (çapa YALNIZ burada)', async () => {
    await varlik(V1);
    const r = await medyaliRehber([{ varlikId: V1 }]);
    await svc.metinOner(CTX, r.id, { mod: 'buna_gore' });
    expect(govdeler[0]!.contents[0]!.parts.at(-1)!.text).toContain('Kullanıcının yazdığı metin: Villa');
    await svc.metinOner(CTX, r.id, { mod: 'yeniden_yaz', tekrarEtme: ['Eski Başlık'] });
    expect(govdeler[1]!.contents[0]!.parts.at(-1)!.text).not.toContain('Kullanıcının yazdığı');
    expect(govdeler[1]!.contents[0]!.parts.at(-1)!.text).toContain('- Eski Başlık');
  });

  it('KRİTİK: 4 MB üstü görsel gönderilmez ve SESSİZ KALMAZ; önbelleğe de yazılmaz', async () => {
    await varlik(V1, IDS.client, IDS.org, 5 * 1024 * 1024);
    const r = await medyaliRehber([{ varlikId: V1 }]);
    const m = await svc.metinOner(CTX, r.id, { varlikId: V1 });
    expect(govdeler[0]!.contents[0]!.parts.some((p) => p.inlineData)).toBe(false);
    expect(govdeler[0]!.generationConfig).not.toHaveProperty('mediaResolution');
    expect(m.notlar.join(' ')).toMatch(/4 MB’tan büyük olduğu için yapay zekâya gönderilmedi/);
    expect(m.gorselSayisi).toBe(0);
    expect(await h.q('SELECT 1 FROM rehber_gorsel_metni')).toHaveLength(0);
  });

  it('KRİTİK: görseldeki fiyat kaynakta yoksa ATILIR ve not "görselde yazıyor" der', async () => {
    await varlik(V1);
    const r = await medyaliRehber([{ varlikId: V1 }]);
    cevap = { ...cevap, basliklar: ['%50 indirim', 'Güzel Villa'], gorseldekiYazilar: ['%50 İNDİRİM'] };
    const m = await svc.metinOner(CTX, r.id, { varlikId: V1 });
    expect(m.basliklar).toEqual(['Güzel Villa']);
    expect(m.notlar.join(' ')).toContain('görselde "50" yazıyor, doğrulanamadığı için eklenmedi');
  });

  it('ortak öneri: en çok 3 görsel, üretilen boyut gönderilmez, fazlası söylenir', async () => {
    const V5 = '66666666-0000-4000-8000-000000000005';
    for (const v of [V1, V2, V3, V4, V5]) await varlik(v);
    const r = await medyaliRehber([{ varlikId: V1 }, { varlikId: V2, uretildi: true, kaynakVarlikId: V1 }, { varlikId: V3 }, { varlikId: V4 }, { varlikId: V5 }]);
    const m = await svc.metinOner(CTX, r.id);
    expect(govdeler[0]!.contents[0]!.parts.filter((p) => p.inlineData)).toHaveLength(3);
    expect(m.notlar.join(' ')).toContain('İlk 3 görsel yapay zekâya gönderildi; 1 görsel gönderilmedi.');
  });

  it('KRİTİK: "tüm şirketler" modunda kardeş şirketin görseli de okunur (client_id süzgeci, ctx.orgId DEĞİL)', async () => {
    await varlik(KV, KARDES_WS, KARDES_ORG);
    const r = await medyaliRehber([{ varlikId: KV }], KARDES_WS);
    const m = await svc.metinOner(CTX, r.id, { varlikId: KV });
    expect(m.gorselSayisi).toBe(1);
    expect(govdeler[0]!.contents[0]!.parts[0]!.inlineData).toBeDefined();
    const [o] = await h.q<{ org_id: string }>('SELECT org_id::text FROM rehber_gorsel_metni');
    expect(o!.org_id).toBe(KARDES_ORG);
  });

  it('reklamda olmayan görsel için metin istenmez (400)', async () => {
    await varlik(V1);
    const r = await medyaliRehber([{ varlikId: V1 }]);
    await expect(svc.metinOner(CTX, r.id, { varlikId: V2 })).rejects.toMatchObject({ status: 400 });
    expect(govdeler).toHaveLength(0);
  });

  it('KRİTİK: görünen yol adreste ya da kelimede geçmiyorsa atılır, geçiyorsa kalır', async () => {
    await varlik(V1);
    const r = await medyaliRehber([{ varlikId: V1 }]);
    cevap = { ...cevap, gorunenYol: ['villa', 'kampanya'] };
    const m = await svc.metinOner(CTX, r.id);
    expect(m.gorunenYol).toEqual(['villa']);
    expect(m.notlar.join(' ')).toContain('Görünen yol "kampanya" site adresinde ya da anahtar kelimelerde geçmediği için atıldı.');
  });
});

describe('başlamayan platformun sebebi kalıcı (sessiz hata)', () => {
  it('KRİTİK: gerçek sebep yeniden okumada da görünür, denetim kaydına yazılır; başlayınca silinir', async () => {
    const r = await tamRehber();
    const p = await svc.prova(CTX, r.id);
    // Google çocuk taslağının hesabı provadan sonra değişti: kurulum başlamaz.
    await h.q(`UPDATE reklam_taslagi SET ad_account_id = $1 WHERE platform = 'google'`, [HAVUZ]);
    const d = await svc.yayinla(CTX, r.id, p.icerikOzeti);
    const SEBEP = 'Google hesabı provadan sonra değişti; yeniden prova et.';
    expect(d.platformlar).toEqual([expect.objectContaining({ platform: 'google', yayinId: null, sebep: SEBEP })]);
    // Rehber taslakta kaldı; eskiden yeniden okumada sebep null'dı.
    const oku = await svc.yayinDurumu(CTX, r.id);
    expect(oku.platformlar).toEqual([expect.objectContaining({ platform: 'google', yayinId: null, sebep: SEBEP })]);
    const [a] = await h.q<{ action: string; org_id: string; after: { google: { sebep: string } } }>(
      `SELECT action, org_id::text, after FROM audit_logs WHERE action = 'reklam.rehber.baslamadi'`,
    );
    expect(a).toMatchObject({ org_id: IDS.org, after: { google: { sebep: SEBEP } } });
    // Düzeltilip başlayınca eski sebep SİLİNİR.
    await h.q(`UPDATE reklam_taslagi SET ad_account_id = $1 WHERE platform = 'google'`, [GHESAP]);
    await svc.yayinla(CTX, r.id, p.icerikOzeti);
    const [s] = await h.q<{ platform_sebepleri: Record<string, unknown> }>('SELECT platform_sebepleri FROM reklam_rehberi WHERE id = $1', [r.id]);
    expect(s!.platform_sebepleri).toEqual({});
  });
});
