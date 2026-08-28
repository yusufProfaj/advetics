import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import { SyncController } from './sync.controller';

/**
 * "ŞİMDİ GÜNCELLE" EKRANDA SEÇİLİ ARALIĞI YENİLİYOR.
 *
 * Düğme bir süre sabit `isoToday()` gönderiyordu: kullanıcı "Son 30 gün"
 * seçip basıyor, hiçbir şey değişmiyordu — tazelenen tek gün aralığın içinde
 * olsa bile geri kalan 29 güne dokunulmuyordu. Adı ile yaptığı iş
 * ayrışıyordu ve belirtisi "düğme çalışmıyor" oluyordu.
 *
 * İKİ FARKLI İŞ AÇILIYOR ÇÜNKÜ MALİYETLERİ FARKLI:
 *   · bugün → `insights_realtime` (hesap + kampanya)
 *   · geçmiş → `insights_backfill` (kampanya + reklam seti + reklam)
 */
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CTX: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [CLIENT],
  activeClientId: CLIENT,
  isOrgAdmin: true,
} as TenantContext;

let enqueued: Array<Record<string, unknown>>;
let ctrl: SyncController;

/**
 * Hesap kümesi TESTTEN DEĞİŞTİRİLEBİLİR.
 *
 * Anahtar kelime ve arama terimi YALNIZCA Google hesaplarında iş açıyor;
 * bunu sınamak için iki platformlu bir kurulum gerekiyor. Sabit bir fixture
 * ile "Meta'da açılmıyor" iddiası yazılamazdı.
 */
let hesaplar: Array<Record<string, unknown>>;

const META_HESAP = {
  id: 'acc-1',
  clientId: CLIENT,
  platform: 'meta',
  name: 'Hesap',
  lastInsightsSyncAt: null,
  lastStructureSyncAt: new Date('2026-08-15T00:00:00Z'),
};
const GOOGLE_HESAP = {
  id: 'acc-g',
  clientId: CLIENT,
  platform: 'google',
  name: 'Google Hesap',
  lastInsightsSyncAt: null,
  lastStructureSyncAt: new Date('2026-08-15T00:00:00Z'),
};

const bugun = (): string => new Date().toISOString().slice(0, 10);
const gunOnce = (n: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

beforeEach(() => {
  enqueued = [];
  hesaplar = [META_HESAP];
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) =>
      fn({
        adAccount: { findMany: async () => hesaplar },
        socialProfile: { findMany: async () => [] },
      }),
  } as unknown as PrismaService;

  const queue = {
    enqueue: async (p: Record<string, unknown>) => {
      enqueued.push(p);
      return { enqueued: true };
    },
  } as unknown as SyncQueueService;

  ctrl = new SyncController(prisma, queue);
});

const isler = (): string[] => enqueued.map((i) => i.jobType as string);
const isi = (tip: string): Record<string, unknown> | undefined =>
  enqueued.find((i) => i.jobType === tip);

describe('aralık verilmezse — eski davranış', () => {
  it('yalnızca bugün yenileniyor', async () => {
    await ctrl.refresh(CTX, {});
    expect(isler()).toEqual(['structure', 'insights_realtime']);
    expect(isi('insights_realtime')).toMatchObject({ dateFrom: bugun(), dateTo: bugun() });
  });
});

describe('GEÇMİŞ İÇEREN ARALIK', () => {
  it('KRİTİK: geçmiş için insights_backfill açılıyor', async () => {
    await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
    expect(isler()).toContain('insights_backfill');
  });

  it('KRİTİK: backfill aralığı SEÇİLEN aralık — bugün hariç', async () => {
    /*
     * Bugün ayrı bir işe gidiyor (`insights_realtime`, ucuz). Backfill'in
     * bugünü de kapsaması, aynı günü iki kez çekmek ve gün içi veriyi
     * "kapanmış gün" gibi yazmak olurdu.
     */
    await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
    const b = isi('insights_backfill')!;
    expect(b.dateFrom).toBe(gunOnce(29));
    expect(b.dateTo).toBe(gunOnce(1));
  });

  it('bugün de yenileniyor — aralık bugünü kapsıyorsa', async () => {
    await ctrl.refresh(CTX, { dateFrom: gunOnce(6), dateTo: bugun() });
    expect(isi('insights_realtime')).toMatchObject({ dateFrom: bugun(), dateTo: bugun() });
  });

  it('KRİTİK: BUGÜNÜ KAPSAMAYAN aralıkta realtime işi AÇILMIYOR', async () => {
    // "Geçen ay" gibi kapalı bir aralıkta bugünü çekmek boşa kota.
    await ctrl.refresh(CTX, { dateFrom: gunOnce(40), dateTo: gunOnce(11) });
    expect(isler()).not.toContain('insights_realtime');
    expect(isi('insights_backfill')).toMatchObject({
      dateFrom: gunOnce(40),
      dateTo: gunOnce(11),
    });
  });

  it('KRİTİK: YALNIZCA BUGÜN seçiliyse backfill AÇILMIYOR', async () => {
    await ctrl.refresh(CTX, { dateFrom: bugun(), dateTo: bugun() });
    expect(isler()).not.toContain('insights_backfill');
  });

  it('yapı işi her durumda açılıyor — metrikler ona bağlanıyor', async () => {
    await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
    expect(isler()[0]).toBe('structure');
  });

  /**
   * ═══ KIRILIMLAR DA BU DÜĞMEDE ═══
   *
   * Organik gönderilerde öğrenilen dersin aynısı: düğme "Şimdi güncelle"
   * diyor ama raporun bir bölümüne hiç dokunmuyorsa adı ile yaptığı iş
   * ayrışıyor. Kırılım tabloları raporda duruyor ve kullanıcı düğmeye basıp
   * onların boş kalmasını "arıza" diye okur — sebebi hiçbir ekranda yazmaz.
   */
  describe('kitle kırılımları', () => {
    it('KRİTİK: geçmiş aralıkta kırılım işi AÇILIYOR', async () => {
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      expect(isler()).toContain('insights_breakdowns');
    });

    it('kırılım GEÇMİŞ aralığı alıyor, bugünü değil', async () => {
      /*
       * Kırılım verisi gün kapandıktan sonra oturuyor ve gecelik süpürme de
       * aynı pencereyi çekiyor. Bugünü göndermek, yarım günün dağılımını
       * "kapanmış gün" gibi yazmak olurdu.
       */
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      expect(isi('insights_breakdowns')).toMatchObject({
        dateFrom: gunOnce(29),
        dateTo: gunOnce(1),
      });
    });

    it('KRİTİK: YALNIZCA BUGÜN seçiliyse kırılım AÇILMIYOR', async () => {
      // Kapanmamış gün için kırılım çekmek boşa kota.
      await ctrl.refresh(CTX, { dateFrom: bugun(), dateTo: bugun() });
      expect(isler()).not.toContain('insights_breakdowns');
    });

    it('KRİTİK: kırılım GECİKMESİZ — yapıya bağlı değil', async () => {
      /*
       * Metrik işleri kampanya satırına bağlanıyor ve o yüzden yapıyı
       * bekliyor. Kırılım hesap seviyesinde toplanmış geliyor ve hiçbir
       * varlık satırına eşlenmiyor; boşuna beklemek, kullanıcının ekranda
       * beklediği süreyi uzatırdı.
       */
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      const kirilim = enqueued.find((e) => e.jobType === 'insights_breakdowns');
      expect(kirilim?.delayMs).toBeUndefined();
      // Karşılaştırma: metrik işi GECİKİYOR.
      expect(enqueued.find((e) => e.jobType === 'insights_backfill')?.delayMs).toBeGreaterThan(0);
    });
  });

  /**
   * ═══ ANAHTAR KELİME VE ARAMA TERİMİ DE BU DÜĞMEDE ═══
   *
   * Kırılımlarda ve organik gönderilerde öğrenilen dersin aynısı: düğme
   * raporun bir bölümüne hiç dokunmuyorsa adı ile yaptığı iş ayrışıyor.
   * İkisi de Google şablonunun bölümleri.
   */
  describe('anahtar kelime ve arama terimi', () => {
    it('KRİTİK: Google hesabında İKİSİ DE açılıyor', async () => {
      hesaplar = [GOOGLE_HESAP];
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      expect(isler()).toContain('keyword_insights');
      expect(isler()).toContain('search_terms');
    });

    it('KRİTİK: META hesabında HİÇ açılmıyor', async () => {
      /*
       * Meta'da anahtar kelime ve arama terimi diye bir şey YOK. Sağlayıcı
       * boş dizi dönüyor ama iş yine de token çözer, kuyruk satırı yazar ve
       * teşhis ekranında "0 satır" olarak görünüp "neden boş" sorusunu
       * doğururdu.
       */
      hesaplar = [META_HESAP];
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      expect(isler()).not.toContain('keyword_insights');
      expect(isler()).not.toContain('search_terms');
    });

    it('karışık portföyde YALNIZCA Google hesabına açılıyor', async () => {
      hesaplar = [META_HESAP, GOOGLE_HESAP];
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      const kelime = enqueued.filter((e) => e.jobType === 'keyword_insights');
      expect(kelime).toHaveLength(1);
      expect(kelime[0]!.adAccountId).toBe('acc-g');
    });

    it('GEÇMİŞ aralığı alıyor, bugünü değil', async () => {
      // İkisi de gün bazlı ve bugünün verisi kapanmamış.
      hesaplar = [GOOGLE_HESAP];
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      expect(isi('keyword_insights')).toMatchObject({
        dateFrom: gunOnce(29),
        dateTo: gunOnce(1),
      });
    });

    it('KRİTİK: YALNIZCA BUGÜN seçiliyse açılmıyor', async () => {
      hesaplar = [GOOGLE_HESAP];
      await ctrl.refresh(CTX, { dateFrom: bugun(), dateTo: bugun() });
      expect(isler()).not.toContain('keyword_insights');
      expect(isler()).not.toContain('search_terms');
    });

    it('KRİTİK: yapı taramasını BEKLİYORLAR', async () => {
      /*
       * İkisi de REKLAM GRUBUNA eşleniyor; yapı bitmeden koşarlarsa eşleşme
       * bulunamıyor ve satır `ad_group_id = null` ile bağlamsız yazılıyor —
       * atılmıyor ama raporda hangi gruba ait olduğu kayboluyor.
       *
       * Kırılımla KARŞILAŞTIRMA: o hesap seviyesinde toplanmış geliyor ve
       * beklemiyor.
       */
      hesaplar = [GOOGLE_HESAP];
      await ctrl.refresh(CTX, { dateFrom: gunOnce(29), dateTo: bugun() });
      expect(
        enqueued.find((e) => e.jobType === 'keyword_insights')?.delayMs,
      ).toBeGreaterThan(0);
      expect(
        enqueued.find((e) => e.jobType === 'search_terms')?.delayMs,
      ).toBeGreaterThan(0);
      expect(
        enqueued.find((e) => e.jobType === 'insights_breakdowns')?.delayMs,
      ).toBeUndefined();
    });
  });
});
