import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ReportData, TenantContext } from '@advetics/shared';
import { gecerliGorselAdresi, gorselAdresleri } from '@advetics/shared';
import { KreatifAdresiService } from './kreatif-adresi.service';

/**
 * ═══ KREATİF GÖRSEL ADRESİNİN TAZELENMESİ ═══
 *
 * Canlıda çıkan hata: müşteriye giden rapor PDF'inde on Meta reklamının
 * görseli yoktu ve dipnotta "sunucu 403" yazıyordu. Sebep saklanan Meta CDN
 * adresinin imzasının dolması; yapı taraması delta çalıştığı için adres
 * yazıldıktan sonra aylarca tazelenmiyordu.
 *
 * Bu dosya tazelemenin ÜÇ kritik davranışını kilitliyor. Hepsi kodu bozarak
 * doğrulandı — CLAUDE.md: "kritik bir test, kodu bozarak doğrulanmadan
 * yazılmış sayılmaz."
 */

const CTX: TenantContext = {
  orgId: '00000000-0000-0000-0000-0000000000aa',
  userId: '00000000-0000-0000-0000-0000000000bb',
} as TenantContext;

const HESAP = {
  id: 'aa-1',
  clientId: 'c-1',
  platform: 'meta' as const,
  externalId: 'act_1',
  connectionId: 'conn-1',
  managerExternalId: null,
};

function reklam(over: Partial<ReportData['topAds'][number]> = {}): ReportData['topAds'][number] {
  return {
    id: 'ad-1',
    name: 'Reklam',
    campaignName: 'Kampanya',
    imageUrl: 'https://scontent.xx.fbcdn.net/v/eski.jpg?oe=DEAD',
    imageUrlHatasi: null,
    creativeExternalId: 'cr-1',
    adAccountId: HESAP.id,
    headline: null,
    description: null,
    displayUrl: null,
    spendMicros: '1000000',
    conversions: 1,
    cpa: 1,
    ctr: 1,
    platform: 'meta',
    ...over,
  };
}

function veri(topAds: ReportData['topAds']): ReportData {
  return { topAds } as unknown as ReportData;
}

/**
 * Servisi sahte bağımlılıklarla kurar.
 *
 * `withTenant` çağrı SIRASINI kaydediyor: platform çağrısının transaction
 * KAPANDIKTAN SONRA yapıldığını iddia edebilmek için başka yolu yok.
 */
function kur(opts: {
  fetchCreativeImageUrls?: ReturnType<typeof vi.fn>;
  kotaIzinli?: boolean;
  hesaplar?: Array<typeof HESAP>;
  tokenHatasi?: Error;
}) {
  const iz: string[] = [];

  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      iz.push('tx:basladi');
      const r = await fn({
        adAccount: { findMany: async () => opts.hesaplar ?? [HESAP] },
      });
      iz.push('tx:bitti');
      return r;
    },
  };

  const cagri =
    opts.fetchCreativeImageUrls ??
    vi.fn(async (_ctx: unknown, idler: readonly string[]) => {
      iz.push('platform:cagri');
      return new Map(idler.map((id) => [id, { url: `https://scontent.xx.fbcdn.net/${id}.jpg` }]));
    });

  const providers = { get: () => ({ platform: 'meta', fetchCreativeImageUrls: cagri }) };

  const vault = {
    getAccessToken: async () => {
      if (opts.tokenHatasi) throw opts.tokenHatasi;
      return 'TOKEN';
    },
  };

  const quota = {
    acquire: async () => ({ allowed: opts.kotaIzinli ?? true, reason: 'quota_exhausted' }),
    record: vi.fn(async () => {}),
  };

  const svc = new KreatifAdresiService(
    prisma as never,
    providers as never,
    vault as never,
    quota as never,
  );
  return { svc, iz, cagri, quota };
}

describe('KreatifAdresiService — tazeleme', () => {
  it('taze adres `imageUrl`e yazılıyor, saklanan adres kullanılmıyor', async () => {
    const { svc } = kur({});
    const out = await svc.tazele(CTX, veri([reklam()]));

    expect(out.topAds[0]!.imageUrl).toBe('https://scontent.xx.fbcdn.net/cr-1.jpg');
    expect(out.topAds[0]!.imageUrlHatasi).toBeNull();
  });

  it('KRİTİK: platform çağrısı TRANSACTION KAPANDIKTAN SONRA yapılıyor', async () => {
    /*
     * `withTenant` etkileşimli bir transaction ve Prisma'nın sınırı 5 saniye;
     * Meta çağrısı üretimde 12 saniye sürdü ve transaction ölünce hata bile
     * kaydedilemedi. Bu iddia CLAUDE.md'de yazılı bir kuralı kilitliyor ve
     * sıra bozulursa belirtisi ancak üretimde, yük altında görünür.
     */
    const { svc, iz } = kur({});
    await svc.tazele(CTX, veri([reklam()]));

    expect(iz).toEqual(['tx:basladi', 'tx:bitti', 'platform:cagri']);
  });

  it('KRİTİK: tazeleme düşerse SAKLANAN adres korunuyor ve SEBEP yazılıyor', async () => {
    /*
     * Adresi silmek kesin bir kayıp olurdu; eski adres bazen hâlâ çalışıyor.
     * Sebebi yazmamak ise "denendi mi" sorusunu cevapsız bırakırdı ve PDF
     * "sunucu 403" (belirti) yazmaya devam ederdi, sebebi değil.
     */
    const { svc } = kur({ tokenHatasi: new Error('bağlantı kaldırılmış') });
    const eski = 'https://scontent.xx.fbcdn.net/v/eski.jpg?oe=DEAD';
    const out = await svc.tazele(CTX, veri([reklam({ imageUrl: eski })]));

    expect(out.topAds[0]!.imageUrl).toBe(eski);
    expect(out.topAds[0]!.imageUrlHatasi).toContain('bağlantı kaldırılmış');
  });

  it('KRİTİK: kota engelinde platforma HİÇ çıkılmıyor', async () => {
    /*
     * ÖNCE KONTROL, SONRA ÇAĞRI. Bu yol anonim paylaşım bağlantısından
     * tetiklenebiliyor; kota %90'ı geçerse yapı taraması da reddediliyor ve
     * hesap kalıcı kilide giriyor (CLAUDE.md). Maliyeti sıfır olan bir ret,
     * bağımlı işlere nefes alacak yer bırakıyor.
     */
    const cagri = vi.fn();
    const { svc } = kur({ kotaIzinli: false, fetchCreativeImageUrls: cagri });
    const out = await svc.tazele(CTX, veri([reklam()]));

    expect(cagri).not.toHaveBeenCalled();
    expect(out.topAds[0]!.imageUrlHatasi).toContain('kota');
  });

  it('KRİTİK: ÖNBELLEK ikinci turda platforma çıkmıyor', async () => {
    // Anonim paylaşım sayfasındaki asıl koruma bu: bot ne kadar hızlı
    // yüklerse yüklesin platforma gidilen sıklık sabit kalıyor.
    const { svc, cagri } = kur({});
    await svc.tazele(CTX, veri([reklam()]));
    await svc.tazele(CTX, veri([reklam()]));

    expect(cagri).toHaveBeenCalledTimes(1);
  });

  it('HATA önbelleğe girmiyor — geçici arıza on dakika dondurulmuyor', async () => {
    const cagri = vi
      .fn()
      .mockResolvedValueOnce(new Map([['cr-1', { hata: 'geçici' }]]))
      .mockResolvedValueOnce(new Map([['cr-1', { url: 'https://scontent.xx.fbcdn.net/y.jpg' }]]));
    const { svc } = kur({ fetchCreativeImageUrls: cagri });

    await svc.tazele(CTX, veri([reklam()]));
    const iki = await svc.tazele(CTX, veri([reklam()]));

    expect(cagri).toHaveBeenCalledTimes(2);
    expect(iki.topAds[0]!.imageUrl).toBe('https://scontent.xx.fbcdn.net/y.jpg');
  });

  it('kreatif kimliği olmayan reklam platforma hiç sorulmuyor', async () => {
    // Google arama reklamının görseli yok; onu sormak boşa çağrı olurdu.
    const cagri = vi.fn();
    const { svc } = kur({ fetchCreativeImageUrls: cagri });
    const out = await svc.tazele(CTX, veri([reklam({ creativeExternalId: null })]));

    expect(cagri).not.toHaveBeenCalled();
    expect(out.topAds[0]!.imageUrlHatasi).toBeNull();
  });

  it('kota telemetrisi bağlanmış — bekçi kendi trafiğini görüyor', async () => {
    /*
     * Bağlanmazsa bu çağrıların tükettiği kota `rate_limit_state`e hiç
     * yazılmaz ve bekçi VARMIŞ GİBİ görünüp korumaz — hiç olmamasından kötü.
     */
    let onRateLimit: ((s: unknown) => unknown) | undefined;
    const cagri = vi.fn(async (ctx: { onRateLimit?: (s: unknown) => unknown }) => {
      onRateLimit = ctx.onRateLimit;
      return new Map([['cr-1', { url: 'https://scontent.xx.fbcdn.net/z.jpg' }]]);
    });
    const { svc, quota } = kur({ fetchCreativeImageUrls: cagri });
    await svc.tazele(CTX, veri([reklam()]));

    expect(onRateLimit, 'FetchContext onRateLimit taşımıyor').toBeTypeOf('function');
    await onRateLimit!({ usagePercent: 42 });
    expect(quota.record).toHaveBeenCalled();
  });

  it('veri YERİNDE değiştirilmiyor — çağıranın kopyası bozulmuyor', async () => {
    const { svc } = kur({});
    const girdi = veri([reklam()]);
    const eski = girdi.topAds[0]!.imageUrl;
    await svc.tazele(CTX, girdi);

    expect(girdi.topAds[0]!.imageUrl).toBe(eski);
  });
});

/**
 * ═══ ADRES SÜZGECİ ═══
 *
 * Google sağlayıcısı `asset_urls`'e URL değil Google Ads KAYNAK ADINI yazıyor
 * (`customers/…/assets/…`). O değer bir string olduğu için eski süzgeçten
 * geçiyor, `imageUrl` alanına yazılıyor ve TRUTHY oluyordu. Sonucu üç katlı:
 * `new URL()` düşüyor, PDF metin önizlemesi yerine "görsel alınamadı" dalına
 * giriyor ve dipnottaki sayaç şişip GERÇEK arızayı gizliyordu.
 */
describe('gorselAdresleri — kaynak adı adres değildir', () => {
  it('KRİTİK: Google Ads KAYNAK ADI eleniyor', () => {
    expect(gorselAdresleri(['customers/1234567890/assets/98765'])).toEqual([]);
    expect(gecerliGorselAdresi('customers/1234567890/assets/98765')).toBe(false);
  });

  it('gerçek adres geçiyor', () => {
    const u = 'https://scontent.xx.fbcdn.net/v/a.jpg';
    expect(gorselAdresleri([u])).toEqual([u]);
    expect(gorselAdresleri(['http://ornek.test/a.png'])).toEqual(['http://ornek.test/a.png']);
  });

  it('karışık dizide YALNIZCA adresler kalıyor ve SIRA korunuyor', () => {
    // Sıra önemli: `imageUrl` her zaman ilk elemanı alıyor.
    const u = 'https://scontent.xx.fbcdn.net/v/a.jpg';
    expect(gorselAdresleri(['customers/1/assets/2', u, 42, null])).toEqual([u]);
  });

  it('dizi olmayan değer boş dönüyor — patlamıyor', () => {
    expect(gorselAdresleri(null)).toEqual([]);
    expect(gorselAdresleri(undefined)).toEqual([]);
    expect(gorselAdresleri('https://x.test/a.jpg')).toEqual([]);
  });

  it('protokolsüz ve şema-görece adresler eleniyor', () => {
    // `//cdn/x.jpg` tarayıcıda çalışır ama sunucuda `new URL` için geçersiz.
    expect(gorselAdresleri(['//cdn.test/x.jpg', 'ftp://x.test/a.jpg', ''])).toEqual([]);
  });
});

/**
 * ═══ KAYNAK TARAMASI: SÜZGEÇ İKİ YERDE DE AYNI ═══
 *
 * Süzgeç panel ve rapor yollarında AYRI AYRI yazılmıştı ve ayrışmıştı: panel
 * `https?` kontrolü yapıyor, rapor yapmıyordu. Belirti farkı tam bundan —
 * aynı reklam panelde "görsel yok", PDF'te "alınamadı" diyordu. CLAUDE.md:
 * "AYNI SÜZGECİ İKİ YERDE YAZMA."
 */
describe('kaynak taraması — süzgeç tek kaynaktan', () => {
  const oku = (p: string): string => readFileSync(join(__dirname, p), 'utf8');

  it('rapor yolu paylaşılan süzgeci kullanıyor', () => {
    const s = oku('reports.service.ts');
    expect(s).toContain('gorselAdresleri(r.asset_urls)');
    // Elle yazılmış eski süzgeç geri gelmesin.
    expect(s).not.toContain("(u): u is string => typeof u === 'string'");
  });

  it('panel yolu da AYNI süzgeci kullanıyor', () => {
    const s = oku('../ads/ads.service.ts');
    expect(s).toContain('gorselAdresleri(r.asset_urls)');
    expect(s).not.toMatch(/asset_urls\s*\)\s*\?\s*r\.asset_urls\.filter/);
  });
});

/**
 * ═══ MODÜL KAYDI ═══
 *
 * Depoda Nest bağımlılık grafiğini ayağa kaldıran bir test YOK: bir sağlayıcı
 * kaydedilmezse ya da modül içe alınmazsa hata yalnızca SUNUCU AÇILIŞINDA
 * görünüyor — yani paylaşımlı VPS'te deploy'un ortasında. `nest build` bunu
 * yakalamıyor (derleme başarılı, grafik çözülemiyor).
 *
 * Bu tarama o boşluğu kapatıyor. Zayıf bir kontrol ama ucuz ve tam olarak bu
 * değişikliğin kırılabileceği yeri koruyor.
 */
describe('kaynak taraması — modül kaydı', () => {
  const MODUL = readFileSync(join(__dirname, 'reports.module.ts'), 'utf8');

  it('KreatifAdresiService sağlayıcı listesinde', () => {
    const i = MODUL.indexOf('providers: [');
    expect(i, 'providers listesi bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const liste = MODUL.slice(i, MODUL.indexOf('],', i));
    expect(liste).toContain('KreatifAdresiService');
  });

  it('KRİTİK: ConnectionsModule içe alınmış — token ve sağlayıcı oradan geliyor', () => {
    const i = MODUL.indexOf('imports: [');
    expect(i, 'imports listesi yok — ConnectionsModule hiç içe alınmamış').toBeGreaterThan(-1);
    expect(MODUL.slice(i, MODUL.indexOf('],', i))).toContain('ConnectionsModule');
  });

  it('ConnectionsModule raporlamayı TANIMIYOR — döngüsel bağımlılık yok', () => {
    /*
     * Ters yönde bir içe alma, Nest'te `forwardRef` gerektiren ve teşhisi zor
     * bir açılış hatası üretirdi. Bugün yok; yarın eklenirse burada düşsün.
     */
    const conn = readFileSync(join(__dirname, '../connections/connections.module.ts'), 'utf8');
    expect(conn).not.toContain('ReportsModule');
  });
});
