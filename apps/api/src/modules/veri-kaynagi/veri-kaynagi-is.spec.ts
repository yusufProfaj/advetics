import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KAYNAK_TANIMI, kaynakGecmisParcalari } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { PlatformApiError } from '../connections/provider.types';
import type { Ga4MulkKotasi, Ga4RaporSonucu } from '../connections/providers/ga4';
import {
  KaynakEksikVeri,
  KaynakKotaReddi,
  ON_KOSUL_NOTU,
  kaynakBugun,
  kaynakGecmis,
  kaynakGunluk,
  kaynakYapi,
  type Ga4Okuyucu,
  type KaynakIsBagimliliklari,
} from './veri-kaynagi-is';
import { VeriKaynagiIsService } from './veri-kaynagi-is.service';

/**
 * ═══ VERİ KAYNAĞI İŞLERİ — GERÇEK VERİTABANI, FIXTURE'LI GA4 ═══
 *
 * Canlı GA4 çağrısı YOK. Okuyucu (`Ga4Okuyucu`) fixture'la değişiyor ve
 * ÇAĞRI SAYILIYOR: ön koşulun "çağrıdan önce" olduğu, çağrının hiç
 * yapılmamasıyla kanıtlanıyor (CLAUDE.md "ÖNCE KONTROL, SONRA ÇAĞRI").
 */
let h: Harness;
const KAYNAK = 'abababab-abab-4bab-8bab-abababababab';
const GA4 = KAYNAK_TANIMI.ga4.scope!;
const SIMDI = new Date('2026-10-14T09:00:00Z');
const BUGUN = kaynakBugun('Europe/Istanbul', SIMDI);

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h, { platform: 'google', externalId: '1234567890' });
  await h.q(`UPDATE platform_connections SET granted_scopes = $1`, [['https://www.googleapis.com/auth/adwords', GA4]]);
  await h.q(
    `INSERT INTO veri_kaynaklari (id, org_id, client_id, tur, dis_kimlik, ad, connection_id, durum)
     VALUES ($1, $2, $3, 'ga4', '312845771', 'Site', $4, 'etkin')`,
    [KAYNAK, IDS.org, IDS.client, IDS.connection],
  );
});

const satir = (boyutlar: string[], metrikler: string[]) => ({ boyutlar, metrikler });

function sonuc(satirlar: ReturnType<typeof satir>[], kota: Ga4MulkKotasi | null = null, ek: Partial<Ga4RaporSonucu> = {}): Ga4RaporSonucu {
  return {
    satirlar,
    satirSayisi: satirlar.length,
    kalite: { digerSatiri: false, esiklendi: false, ornekleme: null },
    kota,
    istek: 1,
    durdu: null,
    eksik: false,
    ...ek,
  };
}

/** Okuyucu taklidi: rapor koduna göre yanıt; her çağrı sayılıyor. */
function okuyucu(p: {
  trafik?: (aralik: { from: string; to: string }) => Ga4RaporSonucu;
  etkinlik?: (aralik: { from: string; to: string }) => Ga4RaporSonucu;
  etkinlikler?: string[];
  hata?: unknown;
}) {
  const cagri = { rapor: 0, yapi: 0 };
  const o: Ga4Okuyucu = {
    mulkAyari: vi.fn(async () => {
      cagri.yapi++;
      if (p.hata) throw p.hata;
      return { ad: 'Site', saatDilimi: 'Europe/Istanbul', paraBirimi: 'TRY' };
    }),
    anahtarEtkinlikler: vi.fn(async () => p.etkinlikler ?? ['generate_lead']),
    raporTamami: vi.fn(async (_m: string, rapor: string, aralik: { from: string; to: string }) => {
      cagri.rapor++;
      if (p.hata) throw p.hata;
      if (rapor === 'trafik') return (p.trafik ?? (() => sonuc([])))(aralik);
      return (p.etkinlik ?? (() => sonuc([])))(aralik);
    }) as unknown as Ga4Okuyucu['raporTamami'],
  };
  return { o, cagri };
}

function bagimlilik(o: Ga4Okuyucu, ek: Partial<KaynakIsBagimliliklari> = {}) {
  const kuyruk = vi.fn(async () => ({ enqueued: true }));
  const kaydet = vi.fn(async () => undefined);
  const b: KaynakIsBagimliliklari = {
    db: h.db as unknown as KaynakIsBagimliliklari['db'],
    ga4: async () => o,
    kota: { izin: async () => ({ allowed: true }), kaydet },
    kuyruk: { enqueue: kuyruk },
    simdi: SIMDI,
    ...ek,
  };
  return { b, kuyruk, kaydet };
}

/**
 * `zaman` VARSAYILANI SIMDI (sabit). Servisin worker girişi (`isle`) sabit
 * saati değil GERÇEK saati kullanıyor (`simdi: new Date()`); o yoldan geçen
 * test yapıyı gerçek saatle damgalamalı. Sabit saatle damgalanınca test
 * 36 saatlik tazelik penceresi kapanana kadar geçti, 2026-10-16'da kendi
 * kendine kırmızıya döndü (kod değişmeden).
 */
const yapiTaze = (zaman: Date = SIMDI) =>
  h.q(`UPDATE veri_kaynaklari SET yapi_zamani = $1, saat_dilimi = 'Europe/Istanbul', para_birimi = 'TRY'`, [zaman.toISOString()]);
const gun = (g: string) => g.replace(/-/g, '');

describe('kaynak_yapi', () => {
  it('KRİTİK: anahtar etkinlikleri ve mülk ayarını yazar, geçmiş bitmediyse geçmişi ZİNCİRLE kuyruğa alır', async () => {
    const { o } = okuyucu({ etkinlikler: ['generate_lead', 'purchase'] });
    const { b, kuyruk } = bagimlilik(o);
    const r = await kaynakYapi(b, KAYNAK);
    expect(r.rows).toBe(1);
    const [k] = await h.q<{ yapi: { anahtarEtkinlikler: string[] }; saat_dilimi: string; para_birimi: string; durum: string; yapi_zamani: unknown }>(
      `SELECT yapi, saat_dilimi, para_birimi, durum, yapi_zamani FROM veri_kaynaklari`,
    );
    expect(k!.yapi.anahtarEtkinlikler).toEqual(['generate_lead', 'purchase']);
    expect(k!.saat_dilimi).toBe('Europe/Istanbul');
    expect(k!.yapi_zamani).not.toBeNull();
    expect(kuyruk).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'kaynak_gecmis', veriKaynagiId: KAYNAK }));
  });

  it('KRİTİK: geçmiş bitmişse ve son günlük iş ön koşul yüzünden REDDEDİLDİYSE günlük yeniden kuyruğa girer', async () => {
    await h.q(`UPDATE veri_kaynaklari SET yapi = '{"gecmisBitti": true}'`);
    await h.q(
      `INSERT INTO sync_jobs (client_id, veri_kaynagi_id, job_type, status, note) VALUES ($1, $2, 'kaynak_gunluk', 'succeeded', $3)`,
      [IDS.client, KAYNAK, `${ON_KOSUL_NOTU} yapı taraması henüz koşmadı`],
    );
    const { o } = okuyucu({});
    const { b, kuyruk } = bagimlilik(o);
    await kaynakYapi(b, KAYNAK);
    expect(kuyruk).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'kaynak_gunluk', veriKaynagiId: KAYNAK }));
  });

  it('geçmiş bitmiş ve son günlük başarılıysa zincir HİÇBİR ŞEY açmaz (kota iki kez yanmasın)', async () => {
    await h.q(`UPDATE veri_kaynaklari SET yapi = '{"gecmisBitti": true}'`);
    await h.q(`INSERT INTO sync_jobs (client_id, veri_kaynagi_id, job_type, status, note) VALUES ($1, $2, 'kaynak_gunluk', 'succeeded', '3 gün yazıldı')`, [
      IDS.client,
      KAYNAK,
    ]);
    const { o } = okuyucu({});
    const { b, kuyruk } = bagimlilik(o);
    await kaynakYapi(b, KAYNAK);
    expect(kuyruk).not.toHaveBeenCalled();
  });

  it('KRİTİK: izin yoksa platforma GİTMEZ, durum izin_eksik ve neden yazılır', async () => {
    await h.q(`UPDATE platform_connections SET granted_scopes = $1`, [['https://www.googleapis.com/auth/adwords']]);
    const { o, cagri } = okuyucu({});
    const { b } = bagimlilik(o);
    const r = await kaynakYapi(b, KAYNAK);
    expect(cagri.yapi).toBe(0);
    expect(r.note.startsWith(ON_KOSUL_NOTU)).toBe(true);
    const [k] = await h.q<{ durum: string; son_hata: string }>(`SELECT durum, son_hata FROM veri_kaynaklari`);
    expect(k!.durum).toBe('izin_eksik');
    expect(k!.son_hata).toMatch(/Analytics okuma izni/);
  });

  it('erişim reddi tekrar denenmez: iş başarılı biter, durum erisim_yok ve GOOGLE\'IN CÜMLESİ aynen', async () => {
    const { o } = okuyucu({ hata: new PlatformApiError('google', 'permission_denied', 'User does not have sufficient permissions for this property.') });
    const { b } = bagimlilik(o);
    const r = await kaynakYapi(b, KAYNAK);
    expect(r.rows).toBe(0);
    const [k] = await h.q<{ durum: string; son_hata: string }>(`SELECT durum, son_hata FROM veri_kaynaklari`);
    expect(k!.durum).toBe('erisim_yok');
    expect(k!.son_hata).toBe('User does not have sufficient permissions for this property.');
  });

  it('kullanıcının duraklatma kararı işin sonucuyla EZİLMEZ', async () => {
    await h.q(`UPDATE veri_kaynaklari SET durum = 'duraklatildi'`);
    const { o, cagri } = okuyucu({});
    const { b } = bagimlilik(o);
    await kaynakYapi(b, KAYNAK);
    expect(cagri.yapi).toBe(0);
    expect((await h.q<{ durum: string }>(`SELECT durum FROM veri_kaynaklari`))[0]!.durum).toBe('duraklatildi');
  });
});

describe('kaynak_gunluk', () => {
  const aralik = { from: '2026-10-11', to: '2026-10-13' };

  it('KRİTİK (mutasyon M1): yapı son 36 saatte koşmadıysa PLATFORMA GİTMEDEN biter, not "hesaplanmadı:"', async () => {
    const { o, cagri } = okuyucu({});
    const { b } = bagimlilik(o);
    const r = await kaynakGunluk(b, KAYNAK, aralik, false);
    expect(cagri.rapor).toBe(0);
    expect(r.rows).toBe(0);
    expect(r.note.startsWith(ON_KOSUL_NOTU)).toBe(true);
    expect(r.note).toMatch(/yapı taraması henüz koşmadı/);
  });

  it('iki raporu iki tabloya yazar; para micros, tarih YYYY-MM-DD, kullanıcı ayrı kolonda', async () => {
    await yapiTaze();
    const { o } = okuyucu({
      trafik: () => sonuc([satir([gun('2026-10-12'), 'google / cpc', 'Konut Arama', '(not set)', '24337936076'], ['120', '80', '100', '6', '1500.50', '2'])]),
      etkinlik: () =>
        sonuc([
          satir([gun('2026-10-12'), 'google / cpc', 'Konut Arama', '(not set)', '24337936076', 'generate_lead'], ['5']),
          satir([gun('2026-10-12'), 'google / cpc', 'Konut Arama', '(not set)', '24337936076', 'click_to_call'], ['1']),
        ]),
    });
    const { b, kaydet } = bagimlilik(o);
    const r = await kaynakGunluk(b, KAYNAK, aralik, false);
    expect(r.rows).toBe(3);
    const t = await h.q<{ gun: string; oturum: number; kullanici: number; gelir_mikro: string; kampanya_kimligi: string; ads_kampanya_kimligi: string }>(
      `SELECT gun::text AS gun, oturum, kullanici, gelir_mikro::text AS gelir_mikro, kampanya_kimligi, ads_kampanya_kimligi FROM ga4_gunluk`,
    );
    expect(t).toEqual([{ gun: '2026-10-12', oturum: 120, kullanici: 100, gelir_mikro: '1500500000', kampanya_kimligi: '(not set)', ads_kampanya_kimligi: '24337936076' }]);
    expect((await h.q(`SELECT etkinlik FROM ga4_anahtar_etkinlik_gunluk ORDER BY etkinlik`)).map((x) => x.etkinlik)).toEqual(['click_to_call', 'generate_lead']);
    expect(kaydet).toHaveBeenCalled();
    const [k] = await h.q<{ son_basarili_cekim: unknown }>(`SELECT son_basarili_cekim FROM veri_kaynaklari`);
    expect(k!.son_basarili_cekim).not.toBeNull();
  });

  it('KRİTİK (mutasyon M2): pencere SİLİNİP yeniden yazılır; ertesi gün "(other)"a geçen kampanya satırı yetim kalmaz', async () => {
    await yapiTaze();
    const ilk = okuyucu({ trafik: () => sonuc([satir([gun('2026-10-12'), 'facebook / paid_social', 'Bornova', '1201', '(not set)'], ['50', '30', '40', '3', '0', '0'])]) });
    await kaynakGunluk(bagimlilik(ilk.o).b, KAYNAK, aralik, false);
    const ikinci = okuyucu({
      trafik: () => sonuc([satir([gun('2026-10-12'), 'facebook / paid_social', '(other)', '(other)', '(not set)'], ['50', '30', '40', '3', '0', '0'])]),
    });
    await kaynakGunluk(bagimlilik(ikinci.o).b, KAYNAK, aralik, false);
    const t = await h.q<{ kampanya_adi: string; oturum: number }>(`SELECT kampanya_adi, oturum FROM ga4_gunluk`);
    // Upsert olsaydı iki satır (Bornova + (other)) ve 100 oturum: çift sayım.
    expect(t).toEqual([{ kampanya_adi: '(other)', oturum: 50 }]);
  });

  it('pencere DIŞINDAKİ günlere dokunmaz', async () => {
    await yapiTaze();
    await h.q(
      `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, oturum) VALUES ('2026-10-01', $1, repeat('a', 64), $2, $3, 'x / y', 7)`,
      [KAYNAK, IDS.client, IDS.org],
    );
    const { o } = okuyucu({});
    await kaynakGunluk(bagimlilik(o).b, KAYNAK, aralik, false);
    expect(await h.q(`SELECT oturum FROM ga4_gunluk`)).toEqual([{ oturum: 7 }]);
  });

  it('KRİTİK: rapor kota yüzünden YARIDA kaldıysa pencere YAZILMAZ (yarım veri tam veriyi silmesin)', async () => {
    await yapiTaze();
    await h.q(
      `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, oturum) VALUES ('2026-10-12', $1, repeat('b', 64), $2, $3, 'x / y', 9)`,
      [KAYNAK, IDS.client, IDS.org],
    );
    const { o } = okuyucu({ trafik: () => sonuc([], null, { durdu: 'Analytics günlük kotasının %10\'i kaldı' }) });
    const r = await kaynakGunluk(bagimlilik(o).b, KAYNAK, aralik, false);
    expect(r.rows).toBe(0);
    expect(r.note).toMatch(/YAZILMADI/);
    expect(await h.q(`SELECT oturum FROM ga4_gunluk`)).toEqual([{ oturum: 9 }]);
  });

  it('KRİTİK (Ö-4): okunan satır Google\'ın bildirdiğinden azsa pencere YAZILMAZ ve iş TEKRAR DENENEBİLİR hata fırlatır', async () => {
    await yapiTaze();
    await h.q(
      `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, oturum) VALUES ('2026-10-12', $1, repeat('c', 64), $2, $3, 'x / y', 9)`,
      [KAYNAK, IDS.client, IDS.org],
    );
    const { o } = okuyucu({
      trafik: () => ({ ...sonuc([satir([gun('2026-10-12'), 'a / b', 'k', 'k', '(not set)'], ['1', '1', '1', '0', '0', '0'])]), satirSayisi: 5 }),
    });
    await expect(kaynakGunluk(bagimlilik(o).b, KAYNAK, aralik, false)).rejects.toBeInstanceOf(KaynakEksikVeri);
    expect(await h.q(`SELECT oturum FROM ga4_gunluk`)).toEqual([{ oturum: 9 }]);
  });

  it('Ö-4: raporTamami eksik dediyse (durdu + eksik) de aynı: yazılmaz, tekrar denenir', async () => {
    await yapiTaze();
    const { o } = okuyucu({ trafik: () => sonuc([], null, { durdu: 'Analytics eksik satır döndürdü (2/5)', eksik: true, satirSayisi: 5 }) });
    await expect(kaynakGunluk(bagimlilik(o).b, KAYNAK, aralik, false)).rejects.toThrow(/kısmi/);
  });

  it('kota bekçisi reddederse platforma gitmeden kota reddi fırlatılır (deneme yakmadan geciktirilir)', async () => {
    await yapiTaze();
    const { o, cagri } = okuyucu({});
    const { b } = bagimlilik(o, { kota: { izin: async () => ({ allowed: false, retryAfterMs: 1000, reason: 'kaynak_usage_85pct' }), kaydet: async () => undefined } });
    await expect(kaynakGunluk(b, KAYNAK, aralik, false)).rejects.toBeInstanceOf(KaynakKotaReddi);
    expect(cagri.rapor).toBe(0);
  });
});

describe('kaynak_gecmis', () => {
  it('parçaları yeniden eskiye yazar ve bitince gecmisBitti işaretler', async () => {
    await yapiTaze();
    const istenen: string[] = [];
    const { o } = okuyucu({
      trafik: (a) => {
        istenen.push(a.from);
        return sonuc([satir([gun(a.to), 'google / cpc', 'K', 'K', '1'], ['1', '1', '1', '0', '0', '0'])], { gunKalan: 190_000, gunToplam: 200_000 });
      },
    });
    const r = await kaynakGecmis(bagimlilik(o).b, KAYNAK);
    const parcalar = kaynakGecmisParcalari('ga4', BUGUN);
    expect(istenen).toEqual(parcalar.map((p) => p.from));
    expect(r.note).toMatch(/tamamlandı/);
    const [k] = await h.q<{ yapi: { gecmisBitti?: boolean } }>(`SELECT yapi FROM veri_kaynaklari`);
    expect(k!.yapi.gecmisBitti).toBe(true);
  });

  it('KRİTİK (mutasyon M3): kota eşiğin altına inince kalan parçalar BIRAKILIR, ilerleme yazılır, bitmiş sayılmaz', async () => {
    await yapiTaze();
    let n = 0;
    const { o } = okuyucu({
      trafik: () => {
        n++;
        return sonuc([], { gunKalan: 150_000, gunToplam: 200_000 });
      },
      // İlk parçanın SON raporundan sonra günlük kotanın %40'ı kaldı: geçmiş
      // için en az %50 gerekiyor, ikinci parça istenmemeli.
      etkinlik: () => sonuc([], { gunKalan: 80_000, gunToplam: 200_000 }),
    });
    const r = await kaynakGecmis(bagimlilik(o).b, KAYNAK);
    expect(n).toBe(1);
    expect(r.note).toMatch(/yarına kaldı/);
    const [k] = await h.q<{ yapi: { gecmisBitti?: boolean; gecmisEnEski?: string } }>(`SELECT yapi FROM veri_kaynaklari`);
    expect(k!.yapi.gecmisBitti).toBeUndefined();
    expect(k!.yapi.gecmisEnEski).toBe(kaynakGecmisParcalari('ga4', BUGUN)[0]!.from);
  });

  it('kaldığı yerden sürer: yazılmış parçalar yeniden istenmez', async () => {
    await yapiTaze();
    const parcalar = kaynakGecmisParcalari('ga4', BUGUN);
    await h.q(`UPDATE veri_kaynaklari SET yapi = yapi || $1::jsonb`, [JSON.stringify({ gecmisEnEski: parcalar[0]!.from })]);
    const istenen: string[] = [];
    const { o } = okuyucu({ trafik: (a) => (istenen.push(a.from), sonuc([])) });
    await kaynakGecmis(bagimlilik(o).b, KAYNAK);
    expect(istenen).toEqual(parcalar.slice(1).map((p) => p.from));
  });

  it('ön koşul: yapı yoksa geçmiş de çağrısız biter', async () => {
    const { o, cagri } = okuyucu({});
    const r = await kaynakGecmis(bagimlilik(o).b, KAYNAK);
    expect(cagri.rapor).toBe(0);
    expect(r.note.startsWith(ON_KOSUL_NOTU)).toBe(true);
  });
});

describe('worker girişi: GA4 429 Google Ads platform kesicisini AÇMAZ', () => {
  it('KRİTİK (mutasyon M5): rate_limited yalnız kaynağın kesicisini açar, satır throttled', async () => {
    await yapiTaze(new Date());
    const [job] = await h.q<{ id: string }>(
      `INSERT INTO sync_jobs (client_id, veri_kaynagi_id, job_type, status, date_from, date_to) VALUES ($1, $2, 'kaynak_gunluk', 'queued', '2026-10-11', '2026-10-13') RETURNING id::text`,
      [IDS.client, KAYNAK],
    );
    const guncellemeler: Array<Record<string, unknown>> = [];
    const db = Object.assign(Object.create(null), h.db, {
      syncJob: { update: async ({ data }: { data: Record<string, unknown> }) => (guncellemeler.push(data), {}) },
    });
    const quota = {
      kaynakIzni: vi.fn(async () => ({ allowed: true })),
      kaynakKotaKaydet: vi.fn(),
      kaynakKesici: vi.fn(async () => undefined),
      tripPlatformBreaker: vi.fn(),
    };
    const svc = new VeriKaynagiIsService(
      db as never,
      { getAccessToken: vi.fn(async () => 'tok') } as never,
      { get: vi.fn(() => ({})) } as never,
      quota as never,
      { enqueue: vi.fn(async () => ({ enqueued: true })) } as never,
    );
    const fetchSahte = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Exhausted property tokens per day.' } }), { status: 429 }),
    );
    try {
      await expect(
        svc.isle({ syncJobId: job!.id, clientId: IDS.client, platform: 'google', jobType: 'kaynak_gunluk', veriKaynagiId: KAYNAK, dateFrom: '2026-10-11', dateTo: '2026-10-13' }),
      ).rejects.toThrow(/Exhausted property tokens/);
    } finally {
      fetchSahte.mockRestore();
    }
    expect(quota.kaynakKesici).toHaveBeenCalledWith('kaynak:ga4:312845771', expect.any(Number));
    expect(quota.tripPlatformBreaker).not.toHaveBeenCalled();
    expect(guncellemeler.at(-1)!.status).toBe('throttled');
  });

  it('başarılı işin notu her zaman dolu (succeeded + rows=0 notsuz kalmaz)', async () => {
    const [job] = await h.q<{ id: string }>(`INSERT INTO sync_jobs (client_id, veri_kaynagi_id, job_type, status) VALUES ($1, $2, 'kaynak_gecmis', 'queued') RETURNING id::text`, [
      IDS.client,
      KAYNAK,
    ]);
    const guncellemeler: Array<Record<string, unknown>> = [];
    const db = Object.assign(Object.create(null), h.db, { syncJob: { update: async ({ data }: { data: Record<string, unknown> }) => (guncellemeler.push(data), {}) } });
    const svc = new VeriKaynagiIsService(db as never, {} as never, {} as never, {} as never, {} as never);
    const r = await svc.isle({ syncJobId: job!.id, clientId: IDS.client, platform: 'google', jobType: 'kaynak_gecmis', veriKaynagiId: KAYNAK });
    expect(r.rows).toBe(0);
    const son = guncellemeler.at(-1)!;
    expect(son.status).toBe('succeeded');
    expect(String(son.note)).toMatch(/^hesaplanmadı:/);
  });
});
