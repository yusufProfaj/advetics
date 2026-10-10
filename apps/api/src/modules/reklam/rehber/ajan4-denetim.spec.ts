import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TANINAN_OZELLIK_ANAHTARLARI,
  acikPlatformlar,
  butceBol,
  kararTablosu,
  rehberdenGoogle,
  type RehberAlanlari,
  type RehberGuncelle,
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
 * AJAN 4 · TEST & GÜVENLİK — AdvCampaign rehberi denetimi (2026-10-10).
 *
 * İki tür test var ve adlarından ayrılıyor:
 *
 * - "SÖZ": karar tablosunun META satırlarının GERÇEK yayın yolundan
 *   (`rehber.prova` → `rehber.yayinla` → `yayinBaslat` → `derleMeta`) çıkan
 *   gövdeyle eşlenmesi. Google tarafı `derle-google.spec.ts`te vardı, Meta
 *   tarafı yoktu (MIMARI-REHBER § 4 son satırı Ajan 4'e bırakmıştı).
 *
 * - "BULGU-n": denetimde bulunan bir kusurun BUGÜNKÜ davranışını kilitliyor.
 *   Bunlar doğru davranışı DEĞİL kusuru gösteriyor; kusuru düzelten ajan
 *   testi TERS ÇEVİRMEK zorunda (düzeltme bu testi kırmızıya çevirir — bu
 *   kasıtlı, düzeltmenin gerçekten bir şey değiştirdiğinin kanıtı). `it.fails`
 *   KULLANILMADI: kurulum adımı düşse de "geçti" sayardı ve bulgu sessizce
 *   kaybolurdu. Ayrıntı `docs/advcampaign/devir/ajan4.md`.
 */
let h: Harness;
let svc: RehberService;
let taslakSvc: ReklamTaslakService;
let yayinSvc: ReklamYayinService;
let kuyrukIsleri: string[];

const SAYFA = '55555555-0000-4000-8000-0000000000f1';
const SAYFA_EXT = '1112223334';
const VARLIK = '66666666-0000-4000-8000-0000000000f1';
const GHESAP = '44444444-0000-4000-8000-0000000000b1';

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
  taslakSvc = new ReklamTaslakService(prisma);
  yayinSvc = new ReklamYayinService(prisma, kuyruk, config);
  // Bu dosyadaki yollar Google'a HİÇ gitmemeli: sahte sağlayıcı çağrılırsa patlar.
  const google = new Proxy({}, { get: (_t, ad) => () => Promise.reject(new Error(`Google çağrıldı: ${String(ad)}`)) });
  svc = new RehberService(
    prisma,
    new ReklamHazirlikService(prisma),
    taslakSvc,
    yayinSvc,
    kuyruk,
    { getAccessToken: async () => 'TOKEN' } as never,
    { get: () => google } as never,
    { isEnabled: false } as never,
    { decrypt: () => 'T' } as never,
    config,
    null,
    {} as never,
  );
});
afterAll(async () => h.close());
beforeEach(async () => {
  kuyrukIsleri = [];
  await h.reset();
  await seedTenant(h);
  await seedAjans(h);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', $5, 'Sayfa', now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection, SAYFA_EXT],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'image', 'g', 'g.png', 'image/png', 3, 1080, 1080, 'g.png', $4, now())`,
    [VARLIK, IDS.org, IDS.client, '1'.repeat(64)],
  );
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', now())`,
    [GHESAP, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(`INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secim_at) VALUES ($1, 'tik7_gor1', now())`, [IDS.org]);
});

const g = (alan: string, deger: unknown, kaynak: RehberGuncelle['degisiklikler'][number]['kaynak'] = 'kullanici') => ({ alan, deger, kaynak });
const SITE_A = 'https://ornek.com.tr/';

/** Meta "Siteme gelsinler" — eksiksiz; Instagram BİLEREK yok ("Instagram olmadan"). */
const META_TAM = [
  g('amac', 'SITE'),
  g('platformlar', { meta: true, google: false }),
  g('metaHesabiId', IDS.adAccount, 'workspace_profili'),
  g('sayfaId', SAYFA, 'workspace_profili'),
  g('instagramId', null),
  g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi'),
  g('ekKategoriler', []),
  g('hedefAdres', SITE_A),
  g('medya', [{ varlikId: VARLIK }]),
  g('metin', { anaMetin: 'Denize 5 dakika villalar.', basliklar: ['Özel Havuzlu Villalar'], aciklamalar: ['Bahçeli villalar.'] }),
  g('butce', { tip: 'gunluk', micros: '500000000' }),
  g('takvim', { baslangic: '2030-01-01', bitis: null }),
];

/** Kuyruktaki Meta provasını "geçti" yap (worker'ın işi; burada Meta'ya gidilmiyor). */
async function provalariGecir(): Promise<void> {
  await h.q(`UPDATE prova SET durum = 'gecti', bitti_at = now() WHERE durum = 'bekliyor'`);
}

/** Rehber → prova → (Meta provası geçti) ; döner: rehber kimliği, özet, Meta çocuk taslağı. */
async function provaliMetaRehberi(): Promise<{ id: string; ozet: string; metaTaslakId: string }> {
  const r = await svc.olustur(CTX, IDS.client);
  const r2 = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: META_TAM });
  expect(r2.eksikler.filter((e) => e.seviye === 'engel')).toEqual([]);
  const p = await svc.prova(CTX, r.id);
  // Meta provası kuyrukta: "bekliyor" hâli dönüyor (yapılmadı DEĞİL).
  expect(p.meta).toMatchObject({ tur: 'bekliyor' });
  await provalariGecir();
  const k = await svc.oku(CTX, r.id);
  expect(k.metaTaslakId).not.toBeNull();
  return { id: r.id, ozet: p.icerikOzeti, metaTaslakId: k.metaTaslakId! };
}

type Govde = { nesne: string; ad: string; alanlar: Record<string, unknown> };
async function metaGovdeleri(taslakId: string): Promise<Govde[]> {
  const [y] = await h.q<{ derlenmis_govde: Govde[] }>('SELECT derlenmis_govde FROM yayin WHERE taslak_id = $1', [taslakId]);
  if (!y) throw new Error('Meta yayın kaydı yok');
  return y.derlenmis_govde;
}
const nesne = (gv: Govde[], n: string) => {
  const x = gv.find((v) => v.nesne === n);
  if (!x) throw new Error(`gövdede ${n} yok`);
  return x.alanlar;
};

// =============================================================================
// SÖZ — karar tablosunun META satırları ↔ gerçek yayın yolunun gövdesi
// =============================================================================
describe('SÖZ: karar tablosu META satırları ↔ yayinla() ile kurulan gövde', () => {
  let gv: Govde[];
  let meta: Record<string, string | undefined>;

  beforeEach(async () => {
    const { id, ozet, metaTaslakId } = await provaliMetaRehberi();
    const d = await svc.yayinla(CTX, id, ozet);
    expect(d.uyum).toEqual({ tur: 'gecti' });
    expect(kuyrukIsleri.some((k) => k.startsWith('kur:'))).toBe(true);
    gv = await metaGovdeleri(metaTaslakId);
    const kayit = await svc.oku(CTX, id);
    meta = Object.fromEntries(kayit.kararlar.map((s) => [s.kod, s.meta ? `${s.meta.deger}${s.meta.not ? ` · ${s.meta.not}` : ''}` : undefined]));
  });

  it('TUR: "Trafik kampanyası · sayfa görüntüleme" ↔ OUTCOME_TRAFFIC + LANDING_PAGE_VIEWS, kampanya ve set DURAKLATILMIŞ', () => {
    expect(meta.TUR).toBe('Trafik kampanyası · sayfa görüntüleme');
    expect(nesne(gv, 'kampanya')).toMatchObject({ objective: 'OUTCOME_TRAFFIC', status: 'PAUSED' });
    expect(nesne(gv, 'reklam_seti')).toMatchObject({ optimization_goal: 'LANDING_PAGE_VIEWS', status: 'PAUSED' });
  });

  it('TEKLIF: "En çok sonuç · hedef yok" ↔ LOWEST_COST_WITHOUT_CAP açıkça, teklif/maliyet tavanı YOK', () => {
    expect(meta.TEKLIF).toBe('En çok sonuç · Sonuç başına ücret hedefi yok');
    const k = nesne(gv, 'kampanya');
    const s = nesne(gv, 'reklam_seti');
    expect(k.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
    for (const alan of ['bid_amount', 'bid_constraints', 'cost_cap']) {
      expect(k[alan]).toBeUndefined();
      expect(s[alan]).toBeUndefined();
    }
  });

  it('NEREDE: "Çok reklamverenli birim kapalı" ↔ HER kreatifte contextual_multi_ads OPT_OUT; yerleşim otomatik (publisher_platforms yok)', () => {
    expect(meta.NEREDE).toContain('Çok reklamverenli birim kapalı');
    const kreatifler = gv.filter((v) => v.nesne === 'kreatif');
    expect(kreatifler.length).toBeGreaterThan(0);
    for (const kr of kreatifler) expect(kr.alanlar.contextual_multi_ads).toEqual({ enroll_status: 'OPT_OUT' });
    const t = nesne(gv, 'reklam_seti').targeting as Record<string, unknown>;
    expect(t.publisher_platforms).toBeUndefined();
  });

  it('KONUM: "Yalnız bu bölgede" ↔ geo_locations yalnız seçilen şehir; ülke kovası YOK (kovalar birleşim)', () => {
    expect(meta.KONUM).toBe('Yalnız bu bölgede bulunanlar');
    const t = nesne(gv, 'reklam_seti').targeting as { geo_locations: Record<string, unknown> };
    expect(t.geo_locations).toEqual({ cities: [{ key: '2347574' }] });
  });

  it('OTOMATIK_METIN: "kapatılabilen özellikler kapalı" ↔ tanınan BÜTÜN anahtarlar OPT_OUT', () => {
    expect(meta.OTOMATIK_METIN).toContain('kapatılabilen kreatif özellikleri kapalı');
    const ozellik = (nesne(gv, 'kreatif').degrees_of_freedom_spec as { creative_features_spec: Record<string, unknown> }).creative_features_spec;
    expect(Object.keys(ozellik).sort()).toEqual([...TANINAN_OZELLIK_ANAHTARLARI].sort());
    for (const v of Object.values(ozellik)) expect(v).toEqual({ enroll_status: 'OPT_OUT' });
  });

  it('SAYFA: "Seçtiğin Facebook sayfası, açıkça" ↔ promoted_object.page_id VE object_story_spec.page_id seçilen sayfa', () => {
    expect(meta.SAYFA).toBe('Seçtiğin Facebook sayfası, açıkça');
    expect((nesne(gv, 'reklam_seti').promoted_object as { page_id: string }).page_id).toBe(SAYFA_EXT);
    expect((nesne(gv, 'kreatif').object_story_spec as { page_id: string }).page_id).toBe(SAYFA_EXT);
  });

  it('SITE niyeti: destination_type AÇIKÇA WEBSITE (verilmezse Meta tahmin ediyor)', () => {
    expect(nesne(gv, 'reklam_seti').destination_type).toBe('WEBSITE');
  });

  it('OLCUM: "Meta’nın saydığı" ↔ atıf penceresi AÇIKÇA yazıldı (hesap varsayılanına kalmıyor)', () => {
    expect(meta.OLCUM).toBe('Meta’nın saydığı'.replace('’', "'"));
    expect(Array.isArray(nesne(gv, 'reklam_seti').attribution_spec)).toBe(true);
  });

  it('karar tablosunun BÜTÜN Meta satırları bu blokta eşlendi (yeni satır gelirse düşer)', () => {
    const eslenen = ['TUR', 'TEKLIF', 'NEREDE', 'KONUM', 'OTOMATIK_METIN', 'SAYFA', 'OLCUM'];
    expect(kararTablosu('SITE', { meta: true, google: false }, 'MAKS_TIKLAMA', true).filter((s) => s.meta).map((s) => s.kod)).toEqual(eslenen);
  });

  // ---------------------------------------------------------------------------
  // BULGU-3 — "Instagram ve Facebook" sözü Instagram'sız rehberde de basılıyor
  // ---------------------------------------------------------------------------
  it('BULGU-3 (DÜZELDİ): Instagram seçilmediyse tablo "Yalnız Facebook" diyor; gövdede instagram_user_id YOK', () => {
    // Derleyicinin kendi yorumu (packages/shared/src/reklam/meta/derle.ts,
    // instagram_user_id satırı): "IG seçiliyse daima: yoksa Instagram'da HİÇ
    // yayın olmaz, hata da yok." Tablo artık instagramId'yi okuyor.
    expect(meta.NEREDE).toMatch(/^Yalnız Facebook/);
    const oss = nesne(gv, 'kreatif').object_story_spec as Record<string, unknown>;
    expect(oss.instagram_user_id).toBeUndefined();
  });
});

// =============================================================================
// BULGU-2 — rehber yayını, Meta çocuk taslağının rehberden TÜREMİŞ olduğunu
// doğrulamıyor: eski uçla değiştirilmiş içerik "uyum geçti" damgasıyla kuruluyor
// =============================================================================
describe('BULGU-2 (DÜZELDİ): Meta çocuk taslağı rehberden bağımsız değiştirilirse rehber yayını onu KURMAZ', () => {
  it('çocuğun içeriği servis yoluyla değişmişse yayın Meta için başlamaz ve sebebi yazar; denetlenmemiş gövde kuyruğa girmez', async () => {
    const { id, ozet, metaTaslakId } = await provaliMetaRehberi();

    // ReklamController'ın HÂLÂ AÇIK olan iki ucu aynı servisleri çağırıyor
    // (reklam.controller.ts: @Put('taslaklar/:id/surum'), @Post('taslaklar/:id/prova')).
    await taslakSvc.surumYaz(CTX, metaTaslakId, { hedefAdres: { deger: 'https://baska-site.example.com/', kaynak: 'kullanici' } });
    await yayinSvc.provaIste(CTX, metaTaslakId);
    await provalariGecir();

    // Rehberin kendisi DEĞİŞMEDİ: özet aynı, rehber hâlâ ornek.com.tr diyor.
    const once = await svc.oku(CTX, id);
    expect(once.icerikOzeti).toBe(ozet);
    expect(once.alanlar.hedefAdres?.deger).toBe(SITE_A);

    const d = await svc.yayinla(CTX, id, ozet);
    const m = d.platformlar.find((p) => p.platform === 'meta');
    expect(m?.yayinId).toBeNull();
    expect(m?.sebep).toMatch(/rehberden sonra değişmiş/);
    const y = await h.q<{ id: string }>('SELECT id FROM yayin WHERE taslak_id = $1', [metaTaslakId]);
    expect(y).toHaveLength(0);
    expect(kuyrukIsleri.some((k) => k.startsWith('kur:'))).toBe(false);
  });
});

// =============================================================================
// BULGU-1 — bütçe bölmesi: eksik listesi/ekran AÇIK platformla, türetme HAM seçimle
// =============================================================================
describe('BULGU-1 (DÜZELDİ): türetilmiş bütçe AÇIK platform kümesine göre bölünüyor', () => {
  const Z = '2026-10-10T09:00:00.000Z';
  const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' = 'kullanici') => ({ deger, kaynak, kim: IDS.user, zaman: Z });
  // VIDEO: Meta "kapali", Google "deneme" (REHBER_ACILIS). Kullanıcı seçimi iki platform.
  const a: RehberAlanlari = {
    amac: al('VIDEO' as const),
    platformlar: al({ meta: true, google: true }),
    googleHesabiId: al(GHESAP, 'workspace_profili'),
    youtubeKanaliId: al(null),
    konumlar: al([{ tur: 'city' as const, key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }]),
    ekKategoriler: al([]),
    hedefAdres: al('https://ornek.com.tr/'),
    youtubeVideo: al({ videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım' }),
    metin: al({ anaMetin: '', basliklar: ['Bir'], aciklamalar: ['Bir açıklama.'] }),
    butce: al({ tip: 'gunluk' as const, micros: '500000000' }),
    takvim: al({ baslangic: '2030-01-01', bitis: null }),
  };

  it('ekran/eksik listesi Google’a 500 ₺ diyor ve Google’a türetilen bütçe de 500 ₺ (Meta kurulmuyor)', () => {
    const acik = acikPlatformlar(a, true);
    expect(acik).toEqual({ meta: false, google: true });
    // Pay çubuğu (adim-butce.tsx) ve asgari kontrolü (eksikler.ts) bunu okuyor:
    expect(butceBol(500_000_000n, acik, 50, 'TRY').google).toBe(500_000_000n);
    // Yayına giden Google girdisi de AÇIK kümeyi bölüyor (ham seçimde meta: true kalsa da):
    const t = rehberdenGoogle(a, acik, {
      musteriId: '1234567890',
      paraBirimi: 'TRY',
      saatDilimi: 'Europe/Istanbul',
      donusumEtkin: false,
      isletmeAdi: 'X',
      logoVarlikId: null,
      kategoriTabani: [],
    });
    if (t.tur !== 'tamam') throw new Error(`türetme reddetti: ${t.kodlar.join(',')}`);
    expect(t.deger.butce.micros).toBe(500_000_000n);
  });

  it('kapalı platformun ham seçimi kayıtta kalsa da (kullanıcı tercihi) açık küme onu saymıyor', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const k = await svc.guncelle(CTX, r.id, {
      surum: r.surum,
      degisiklikler: [g('amac', 'VIDEO'), g('platformlar', { meta: true, google: true })],
    });
    expect(k.alanlar.platformlar?.deger).toEqual({ meta: true, google: true });
    // Ham seçim tercih olarak saklanır (amaç değişip Meta açılınca geri gelir);
    // türetme ve eksik listesi yalnız AÇIK kümeyi okur.
    expect(acikPlatformlar(k.alanlar, true)).toEqual({ meta: false, google: true });
    expect(k.eksikler.some((e) => e.platform === 'meta')).toBe(false);
  });
});

// =============================================================================
// BULGU-4 — konumun Google karşılığı istemciden yazılabiliyor
// =============================================================================
describe('BULGU-4 (DÜZELDİ): konumun Google eşlemesini istemci yazamaz', () => {
  it('istemcinin gönderdiği google.kaynak atılır; G-KONUM eksiği AÇIK kalır', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const k = await svc.guncelle(CTX, r.id, {
      surum: r.surum,
      degisiklikler: [
        g('amac', 'SITE'),
        g('platformlar', { meta: false, google: true }),
        g('googleHesabiId', GHESAP, 'workspace_profili'),
        // 2840 = ABD. Sunucunun "YALNIZ tam ad eşleşmesi" kuralı (konumEsle) hiç koşmadı.
        g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/2840', ad: 'İzmir' } }]),
      ],
    });
    expect(k.alanlar.konumlar?.deger[0]?.google).toBeUndefined();
    expect(k.eksikler.some((e) => e.kod === 'G-KONUM')).toBe(true);
  });
});

// =============================================================================
// Temiz çıkan maddelerin kanıt testleri
// =============================================================================
describe('KAPI: eski yayın ucu rehberin uyum kararını TAŞIYAMAZ', () => {
  const KAYNAK = readFileSync(join(__dirname, '..', 'reklam.controller.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('BOŞA DÜŞME BEKÇİSİ: şema ve uç kaynakta bulundu', () => {
    expect(KAYNAK).toMatch(/const yayinlaSchema = z\.object\(\{[\s\S]*?\}\);/);
    expect(KAYNAK).toMatch(/@Post\('taslaklar\/:id\/yayinla'\)/);
  });

  it('KRİTİK: yayinlaSchema yalnız surumNo/icerikOzeti/testKipi; passthrough YOK, `rehber` YOK — UYUM reti eski yolda kalkamaz', () => {
    const govde = KAYNAK.match(/const yayinlaSchema = z\.object\(\{([\s\S]*?)\}\)([^;]*);/)!;
    const anahtarlar = [...govde[1]!.matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]);
    expect(anahtarlar).toEqual(['surumNo', 'icerikOzeti', 'testKipi']);
    expect(govde[2]).not.toMatch(/passthrough|catchall/);
    // Uç, ham gövdeyi değil şemadan geçmiş dto'yu yayıyor.
    const uc = KAYNAK.slice(KAYNAK.indexOf("@Post('taslaklar/:id/yayinla')"), KAYNAK.indexOf("@Get('taslaklar/:id/yayin')"));
    expect(uc).toContain('@Body(zodBody(yayinlaSchema)) dto');
    expect(uc).toContain('this.yayin.baslat(ctx, { taslakId: id, ...dto })');
  });
});

// =============================================================================
// BULGU-2 ikinci önlem: eski taslak uçları rehbere bağlı taslakta REDDEDER
// =============================================================================
describe('BULGU-2 (DÜZELDİ): eski taslak uçları rehbere bağlı taslağı değiştiremez', () => {
  it('rehberin Meta çocuğu için ret; bağımsız taslak için ret YOK', async () => {
    const { metaTaslakId } = await provaliMetaRehberi();
    await expect(taslakSvc.rehbereBagliysaReddet(CTX, metaTaslakId)).rejects.toThrow(/rehberine bağlı/);
    const bagimsiz = await taslakSvc.olustur(CTX, IDS.client, 'acemi', null);
    await expect(taslakSvc.rehbereBagliysaReddet(CTX, bagimsiz.id)).resolves.toBeUndefined();
  });

  it('KRİTİK: değiştiren beş uç da kontrolü çağırıyor (kaynak taraması, yorumsuz)', () => {
    const kaynak = readFileSync(join(__dirname, '../reklam.controller.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const yol of ["'taslaklar/:id/surum'", "'taslaklar/:id/arsivle'", "'taslaklar/:id/yayinla'", "@Post('taslaklar/:id/prova')", "'taslaklar/:id/oneriyi-onayla'"]) {
      const i = kaynak.indexOf(yol);
      if (i < 0) throw new Error(`uç bulunamadı: ${yol}`);
      // Dilim bir SONRAKİ UÇ dekoratöründe biter (izin dekoratöründe değil).
      const m = /\n {2}@(Get|Post|Put|Patch|Delete)\(/.exec(kaynak.slice(i + yol.length));
      const govde = kaynak.slice(i, m ? i + yol.length + m.index : undefined);
      expect(govde, yol).toContain('rehbereBagliysaReddet(ctx, id)');
    }
  });
});
