import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  REHBER_ACILIS,
  TASLAK_IZINLI_KAYNAKLAR,
  rehberEksikleri,
  rehberKaynaklariniTasi,
  taslakEksikleri,
  type RehberGuncelle,
  type TaslakAlanlari,
  type TenantContext,
} from '@advetics/shared';
import { AJANS_UST_HESAP, createHarness, seedAjans, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AppConfig } from '../../../config/configuration';
import { ReklamHazirlikService } from '../hazirlik.service';
import { ReklamTaslakService } from '../taslak.service';
import { ReklamYayinService } from '../yayin.service';
import type { ReklamKuyrugu } from '../reklam-kuyrugu';
import { RehberService } from './rehber.service';

/**
 * ═══ CANLI HATA 2026-10-12: "Siteme gelsinler" Meta + Google → Google kuruldu,
 * Meta HİÇ BAŞLAMADI, kalıcı sebep yalnız "Bu alanı kendin seç" ═══
 *
 * Kök sebep: hazır workspace (Dalga 3) rehberin izinli kaynaklarını genişletti
 * (bütçe/kategori `workspace_profili`, başlangıç `derleyici`), Meta taslağının
 * listesi (`TASLAK_IZINLI_KAYNAKLAR`) bu alanlarda yalnız `kullanici` kabul
 * ediyor ve `rehberdenMeta` alanı kaynağıyla AYNEN kopyalıyordu. `provaIste`
 * KAYNAK kilidini bilerek atladığı için prova "geçti" dedi; kilit ancak yayın
 * kapısında (`yayinBaslat` → `taslakEksikleri`) düştü.
 *
 * Bu dosya hatayı GERÇEK servis yolundan yeniden üretiyor (görselli SITE
 * rehberi, iki platform, prova → yayınla), düzeltmeyi ve "yalnız başlamamış
 * platformu yeniden dene" yolunu kilitliyor.
 */
const SITE_ACILIS = { ...REHBER_ACILIS.SITE };
beforeEach(() => {
  REHBER_ACILIS.SITE.meta = 'deneme';
  REHBER_ACILIS.SITE.google = 'deneme';
});
afterEach(() => {
  Object.assign(REHBER_ACILIS.SITE, SITE_ACILIS);
});

let h: Harness;
let svc: RehberService;
let kuyrukIsleri: string[];
let googleMutate: boolean[];

const GHESAP = '44444444-0000-4000-8000-0000000000e1';
const SAYFA = '55555555-0000-4000-8000-0000000000e1';
const VARLIK = '66666666-0000-4000-8000-0000000000e1';
const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  managerAccountId: AJANS_UST_HESAP,
} as TenantContext;

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
  const google = {
    rehberMutate: async (_c: unknown, g: { validateOnly: boolean }) => (googleMutate.push(g.validateOnly), []),
    rehberAra: async () => [],
    searchGeoLocations: async () => [{ key: 'geoTargetConstants/1012782', type: 'city', name: 'İzmir', label: 'İzmir, Turkey', countryCode: 'TR' }],
  };
  // Piksel okunamıyor → "bilinmiyor" → tıklama hedefi; bu dosyanın konusu değil.
  const meta = {};
  svc = new RehberService(
    prisma,
    new ReklamHazirlikService(prisma),
    new ReklamTaslakService(prisma),
    new ReklamYayinService(prisma, kuyruk, config),
    kuyruk,
    { getAccessToken: async () => 'TOKEN' } as never,
    { get: (p: string) => (p === 'meta' ? meta : google) } as never,
    { isEnabled: false } as never,
    { decrypt: () => 'T' } as never,
    config,
    null,
    {} as never,
    {} as never,
  );
});
afterAll(async () => h.close());
beforeEach(async () => {
  kuyrukIsleri = [];
  googleMutate = [];
  svc.siteHtmlOku = async () => ({ ok: false, sebep: 'test: ağ yok' });
  for (const ad of ['uzantiOnbellek', 'sitePikselOnbellek', 'onbellek', 'sayfaOnbellek']) {
    (svc as unknown as Record<string, Map<string, unknown>>)[ad]!.clear();
  }
  await h.reset();
  await seedTenant(h);
  await seedAjans(h);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', now())`,
    [GHESAP, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', '1112223334', 'Sayfa', now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'image', 'g', 'g.png', 'image/png', 3, 1080, 1080, 'g.png', $4, now())`,
    [VARLIK, IDS.org, IDS.client, '1'.repeat(64)],
  );
  await h.q(`INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secim_at) VALUES ($1, 'tik7_gor1', now())`, [IDS.org]);
});

type Kaynak = RehberGuncelle['degisiklikler'][number]['kaynak'];
const g = (alan: string, deger: unknown, kaynak: Kaynak = 'kullanici') => ({ alan, deger, kaynak });

/**
 * Canlıdaki hâl: görselli "Siteme gelsinler", Meta + Google. Kaynaklar HAZIR
 * WORKSPACE'İN yazdığı gibi (`onDoldurma`): bütçe ve kategori
 * `workspace_profili`, başlangıç `derleyici` ("yarın").
 */
function hazirAlanlar(k: { butce?: Kaynak; takvim?: Kaynak; ekKategoriler?: Kaynak } = {}) {
  return [
    g('amac', 'SITE'),
    g('platformlar', { meta: true, google: true }),
    g('metaHesabiId', IDS.adAccount, 'workspace_profili'),
    g('googleHesabiId', GHESAP, 'workspace_profili'),
    g('sayfaId', SAYFA, 'workspace_profili'),
    g('instagramId', null),
    g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi'),
    g('ekKategoriler', [], k.ekKategoriler ?? 'workspace_profili'),
    g('hedefAdres', 'https://ornek.com.tr/', 'marka_merkezi'),
    g('medya', [{ varlikId: VARLIK }]),
    g('metin', { anaMetin: 'Denize 5 dakika villalar.', basliklar: ['Bir Başlık', 'İki Başlık', 'Üç Başlık'], aciklamalar: ['Birinci açıklama.', 'İkinci açıklama.'] }),
    g('anahtarKelimeler', [{ metin: 'kuşadası villa', aylikArama: 100 }]),
    g('butce', { tip: 'gunluk', micros: '500000000' }, k.butce ?? 'workspace_profili'),
    g('takvim', { baslangic: '2030-01-01', bitis: '2030-01-31' }, k.takvim ?? 'derleyici'),
  ];
}

async function rehber(alanlar = hazirAlanlar()) {
  const r = await svc.olustur(CTX, IDS.client);
  const r2 = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: alanlar });
  const r3 = await svc.konumlariEsle(CTX, r2.id);
  // Rehberin KENDİ kapısı bu kaynakları kabul ediyor: kullanıcı "hazır" görüyor.
  expect(r3.eksikler.filter((e) => e.seviye === 'engel')).toEqual([]);
  return r3;
}

const provalariGecir = () => h.q(`UPDATE prova SET durum = 'gecti', bitti_at = now() WHERE durum = 'bekliyor'`);

describe('KANIT: hazır workspace kaynakları Meta taslağının kilidine takılıyordu', () => {
  /*
   * Bugünkü türetmenin YAZDIĞI kaynaklar Meta listesinden geçiyor mu? Eski
   * türetme (kaynağı aynen kopyalayan) burada her alan için tek KAYNAK eksiği
   * üretirdi; canlıdaki tek cümlelik sebep bu üç alandan BİRİYDİ.
   */
  for (const [alan, kaynak, etiket] of [
    ['takvim', 'derleyici', 'Tarih'],
    ['butce', 'workspace_profili', 'Bütçe'],
    ['ekKategoriler', 'workspace_profili', 'Özel reklam kategorisi'],
  ] as const) {
    it(`${alan} (${kaynak}): kopyalanan kaynak Meta'da KAYNAK eksiğiydi ("${etiket}: bu alanı kendin seç"); türetme onu kullanici'ya taşır`, () => {
      const z = '2026-10-12T12:00:00.000Z';
      const eski = { [alan]: { deger: alan === 'butce' ? { tip: 'gunluk', micros: '1' } : alan === 'takvim' ? { baslangic: '2030-01-01', bitis: null } : [], kaynak, kim: IDS.user, zaman: z } } as TaslakAlanlari;
      expect(taslakEksikleri(eski).filter((e) => e.kod === 'KAYNAK')).toEqual([expect.objectContaining({ alan, metin: `${etiket}: bu alanı kendin seç` })]);
      const yeni = rehberKaynaklariniTasi(eski);
      expect(yeni[alan]).toMatchObject({ kaynak: 'kullanici', kim: IDS.user, zaman: z });
      expect(taslakEksikleri(yeni).filter((e) => e.kod === 'KAYNAK')).toEqual([]);
    });
  }

  it('KRİTİK: rehberde izinli OLMAYAN kaynak (onaylanmamış öneri) AYNEN kalır, Meta kilidi onu yine durdurur', () => {
    const z = '2026-10-12T12:00:00.000Z';
    const t = { butce: { deger: { tip: 'gunluk', micros: '1' }, kaynak: 'ai_onerisi', kim: null, zaman: z } } as TaslakAlanlari;
    expect(rehberKaynaklariniTasi(t).butce!.kaynak).toBe('ai_onerisi');
    expect(taslakEksikleri(rehberKaynaklariniTasi(t)).map((e) => e.metin)).toContain('Bütçe: asistanın önerisini onayla');
  });

  it('kaynağı zaten kabul edilen alana dokunulmaz (kayıtlı provaların özeti değişmez)', () => {
    const z = '2026-10-12T12:00:00.000Z';
    const t = { konumlar: { deger: [], kaynak: 'marka_merkezi', kim: IDS.user, zaman: z }, sitePikseli: { deger: 'aktif', kaynak: 'derleyici', kim: null, zaman: z } } as TaslakAlanlari;
    expect(rehberKaynaklariniTasi(t)).toEqual(t);
  });

  it('BEKÇİ: Meta listesinde yalnız kullanici kabul eden bütün alanlar türetme tablosunda (yeni kilitli alan sessizce düşmesin)', () => {
    const kaynak = readFileSync(join(__dirname, '../../../../../../packages/shared/src/reklam/rehber/turet.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const bas = kaynak.indexOf('const REHBERDEKI_KARSILIGI');
    const tablo = kaynak.slice(bas, kaynak.indexOf('};', bas));
    if (bas < 0 || !tablo) throw new Error('türetme tablosu bulunamadı — tarama boşa düşer');
    for (const alan of Object.keys(TASLAK_IZINLI_KAYNAKLAR).filter((a) => a !== 'sitePikseli')) {
      expect(tablo, alan).toMatch(new RegExp(`\\b${alan}:`));
    }
  });
});

describe('SERVİS YOLU: görselli Siteme gelsinler, Meta + Google, hazır workspace kaynakları', () => {
  it('KRİTİK: prova iki platformda geçer ve yayınla İKİ platformu da başlatır (Meta artık KAYNAK ile durmuyor)', async () => {
    const r = await rehber();
    const p = await svc.prova(CTX, r.id);
    expect(p.meta).toMatchObject({ tur: 'bekliyor' });
    expect(p.google).toMatchObject({ tur: 'gecti' });
    await provalariGecir();
    const d = await svc.yayinla(CTX, r.id, p.icerikOzeti);
    const meta = d.platformlar.find((x) => x.platform === 'meta')!;
    expect(meta.sebep).toBeNull();
    expect(meta.yayinId).not.toBeNull();
    expect(d.platformlar.find((x) => x.platform === 'google')!.yayinId).not.toBeNull();
    // Meta çocuğu rehberin kaynağını Meta listesine uyarlanmış taşıyor.
    const [c] = await h.q<{ alanlar: TaslakAlanlari }>(
      `SELECT s.alanlar FROM reklam_taslagi t JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no WHERE t.platform = 'meta'`,
    );
    expect([c!.alanlar.butce!.kaynak, c!.alanlar.takvim!.kaynak, c!.alanlar.ekKategoriler!.kaynak]).toEqual(['kullanici', 'kullanici', 'kullanici']);
    const [s] = await h.q<{ platform_sebepleri: Record<string, unknown> }>('SELECT platform_sebepleri FROM reklam_rehberi WHERE id = $1', [r.id]);
    expect(s!.platform_sebepleri).toEqual({});
  });

  it('KRİTİK: kilit türetmede bozulursa PROVA reddeder ve ALAN ADIYLA söyler (yayında değil)', async () => {
    const r = await rehber();
    // Türetmenin uyarlamadığı bir kaynağı taklit et: çocuğa gidecek takvim
    // rehberde izinli ama Meta'da değil VE uyarlama devre dışı.
    const asil = TASLAK_IZINLI_KAYNAKLAR.takvim;
    const kopya = TASLAK_IZINLI_KAYNAKLAR as Record<string, readonly string[]>;
    kopya.takvim = ['hicbiri'];
    try {
      const p = await svc.prova(CTX, r.id);
      expect(p.meta).toEqual({ tur: 'reddetti', zaman: expect.any(String), mesajlar: ['Tarih: bu alanı kendin seç'] });
      // Meta çocuğu yazılmadı, kuyruğa prova girmedi.
      expect(kuyrukIsleri.filter((x) => x.startsWith('prova:'))).toEqual([]);
    } finally {
      kopya.takvim = asil!;
    }
  });
});

describe('YENİDEN DENEME: yayındaki rehberde yalnız başlamamış platform', () => {
  /** Canlıdaki hâli kur: Google başladı, Meta KAYNAK ile başlamadı, rehber "yayinda". */
  async function takilmisRehber() {
    const r = await rehber();
    const p = await svc.prova(CTX, r.id);
    await provalariGecir();
    // Meta çocuğuna canlıdaki eski türetmenin yazdığı kaynağı geri koy
    // (özetiyle birlikte): yayın kapısı KAYNAK ile durur.
    const [c] = await h.q<{ id: string; alanlar: TaslakAlanlari; surum: number }>(
      `SELECT t.id::text, s.alanlar, t.aktif_surum_no AS surum FROM reklam_taslagi t JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no WHERE t.platform = 'meta'`,
    );
    const eski = { ...c!.alanlar, takvim: { ...c!.alanlar.takvim!, kaynak: 'derleyici' as const } };
    const { createHash } = await import('node:crypto');
    const { taslakKanonikIcerik } = await import('@advetics/shared');
    const ozet = createHash('sha256').update(taslakKanonikIcerik(eski)).digest('hex');
    // Sürümler değişmez: eski hâl YENİ bir sürüm olarak yazılır, provası geçmiş.
    const yeniSurum = c!.surum + 1;
    await h.q(
      `INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, olusturan_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [c!.id, IDS.org, IDS.client, yeniSurum, JSON.stringify(eski), ozet, IDS.user],
    );
    await h.q(`UPDATE reklam_taslagi SET aktif_surum_no = $2 WHERE id = $1`, [c!.id, yeniSurum]);
    await h.q(
      `INSERT INTO prova (org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, ad_account_id, api_surumu, derleyici_surumu, durum, bitti_at)
       SELECT org_id, client_id, taslak_id, $2, $3, ad_account_id, api_surumu, derleyici_surumu, 'gecti', now() FROM prova WHERE taslak_id = $1 LIMIT 1`,
      [c!.id, yeniSurum, ozet],
    );
    // Düzeltmeden SONRA canlıdaki rehberin Meta çocuğu tam bu hâlde: eski
    // kaynak, eski özet. Yayın yolu türetmeyi yeniden kurup özeti
    // karşılaştırıyor, yani sebep artık "yeniden prova et" (KAYNAK değil).
    const d = await svc.yayinla(CTX, r.id, p.icerikOzeti);
    expect(d.platformlar.find((x) => x.platform === 'google')!.yayinId).not.toBeNull();
    const meta = d.platformlar.find((x) => x.platform === 'meta')!;
    expect(meta.yayinId).toBeNull();
    expect(meta.sebep).toBe('Meta taslağı rehberden sonra değişmiş; yeniden prova et.');
    expect((await svc.oku(CTX, r.id)).durum).toBe('yayinda');
    return { id: r.id, ozet: p.icerikOzeti, metaSebebi: meta.sebep };
  }

  it('KRİTİK: yayında rehber → yeniden prova YALNIZ Meta; yayınla YALNIZ Meta’yı kurar, İKİNCİ Google kampanyası YOK', async () => {
    const t = await takilmisRehber();
    expect(t.metaSebebi).toBeTruthy();
    const googleOnce = await h.q(`SELECT y.id FROM yayin y JOIN reklam_taslagi t ON t.id = y.taslak_id WHERE t.platform = 'google'`);
    expect(googleOnce).toHaveLength(1);
    googleMutate = [];
    kuyrukIsleri = [];

    const p = await svc.prova(CTX, t.id);
    expect(p.google).toBeNull(); // başlamış platform prova EDİLMEZ
    expect(p.meta).toMatchObject({ tur: 'bekliyor' });
    expect(googleMutate).toEqual([]);
    await provalariGecir();

    const d = await svc.yayinla(CTX, t.id, p.icerikOzeti);
    const meta = d.platformlar.find((x) => x.platform === 'meta')!;
    expect(meta.sebep).toBeNull();
    expect(meta.yayinId).not.toBeNull();
    // Google'a DOKUNULMADI: satırında yanlış bir sebep de yok (denenmiş olsaydı
    // "Google tarafında süren bir yayın var" çalışan kampanyanın yanında dururdu).
    expect(d.platformlar.find((x) => x.platform === 'google')).toMatchObject({ yayinId: expect.any(String), sebep: null });
    expect(await h.q(`SELECT y.id FROM yayin y JOIN reklam_taslagi t ON t.id = y.taslak_id WHERE t.platform = 'google'`)).toEqual(googleOnce);
    expect(kuyrukIsleri.filter((x) => x.startsWith('google_kur:'))).toEqual([]);
    expect(googleMutate).toEqual([]);
    // Kalıcı sebep silindi.
    const [s] = await h.q<{ platform_sebepleri: Record<string, unknown> }>('SELECT platform_sebepleri FROM reklam_rehberi WHERE id = $1', [t.id]);
    expect(s!.platform_sebepleri).toEqual({});

    // İki platform da başladı: yeniden deneme yok (çift tıklama da buraya düşer).
    await expect(svc.prova(CTX, t.id)).rejects.toMatchObject({ status: 409 });
    await expect(svc.yayinla(CTX, t.id, p.icerikOzeti)).rejects.toMatchObject({ status: 409 });
  });

  it('yeniden denemede Meta bütçe payı DEĞİŞMEZ (türetme hâlâ iki platformla bölüyor)', async () => {
    const t = await takilmisRehber();
    const p = await svc.prova(CTX, t.id);
    await provalariGecir();
    await svc.yayinla(CTX, t.id, p.icerikOzeti);
    const [c] = await h.q<{ alanlar: TaslakAlanlari }>(
      `SELECT s.alanlar FROM reklam_taslagi t JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no WHERE t.platform = 'meta'`,
    );
    expect(c!.alanlar.butce!.deger.micros).toBe('250000000');
  });

  it('arşivdeki rehberde yeniden deneme yok', async () => {
    const t = await takilmisRehber();
    await svc.arsivle(CTX, t.id);
    await expect(svc.prova(CTX, t.id)).rejects.toMatchObject({ status: 409 });
    await expect(svc.yayinla(CTX, t.id, t.ozet)).rejects.toMatchObject({ status: 409 });
  });
});

describe('eksik metni alanı söylüyor', () => {
  it('rehber KAYNAK eksiği alan adıyla', () => {
    const z = '2026-10-12T12:00:00.000Z';
    const e = rehberEksikleri(
      { amac: { deger: 'SITE', kaynak: 'kullanici', kim: null, zaman: z }, butce: { deger: { tip: 'gunluk', micros: '1' }, kaynak: 'marka_merkezi', kim: null, zaman: z } } as never,
      { ajansYoneticisi: true, onKosullar: null, yasalUyari: null, asgariGunluk: { meta: null, googleTalepYaratma: null }, paraBirimi: 'TRY', paraBirimleriAyni: true },
    );
    expect(e.filter((x) => x.kod === 'KAYNAK').map((x) => x.metin)).toEqual(['Bütçe: bu alanı kendin seç']);
  });
});
