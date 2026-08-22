import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SyncProcessorService } from './sync-processor.service';

/**
 * YAPI BİTTİĞİNDE, GEÇMİŞİ BEKLEYEN İŞ YENİDEN KUYRUĞA GİRMELİ.
 *
 * Canlıda görülen ölü nokta: büyük bir Meta hesabında yapı taraması
 * dakikalarca sürdü ve birkaç kez düştü (sayfa boyutu). Bu sırada geçmiş
 * çekimi beş denemesini de harcadı — her seferinde "yapı taraması hiç
 * koşmadı" diyerek, DOĞRU biçimde. Yapı taraması sonunda başardı ve 300
 * kampanya yazdı; ama geçmiş çekimi çoktan kalıcı `failed` olmuştu ve
 * kendiliğinden bir daha denenmiyordu (gecelik süpürme yalnızca son 7 günü
 * çekiyor).
 *
 * Panelde görünen: "Yapı: 13:06 · Metrik: hiç" — ve kullanıcının bunu bilip
 * elle "Son 90 gün" ile tetiklemesi gerekiyordu.
 */
interface Hesap {
  clientId: string | null;
  platform: string;
  lastInsightsSyncAt: Date | null;
  syncEnabled: boolean;
}

const HESAP: Hesap = {
  clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  platform: 'meta',
  lastInsightsSyncAt: null,
  syncEnabled: true,
};

let kuyruk: Array<{ jobType: string; entityLevel?: string; dateFrom?: string; dateTo?: string }>;

function kur(hesap: Hesap | null) {
  kuyruk = [];
  /*
   * Prototipten kuruluyor: yapıcı on üç bağımlılık istiyor ve hiçbirine
   * ihtiyaç yok. `SyncProcessorService` ile kesişim ALINMIYOR — `logger`
   * private olduğu için kesişim `never`e düşüyor ve alan atamaları tip
   * hatası veriyor.
   */
  const proc = Object.create(SyncProcessorService.prototype) as {
    db: unknown;
    queue: unknown;
    logger: unknown;
    yapiSonrasiGecmisiKuyrukla: (id: string) => Promise<void>;
  };
  proc.db = { adAccount: { findUnique: async () => hesap } };
  proc.queue = {
    enqueue: async (p: { jobType: string }) => {
      kuyruk.push(p);
      return { enqueued: true };
    },
  };
  proc.logger = { log: () => undefined, error: () => undefined, warn: () => undefined };
  return proc;
}

describe('yapı sonrası geçmiş kuyruğa alma', () => {
  beforeEach(() => {
    kuyruk = [];
  });

  it('KRİTİK: hiç metrik yoksa 90 günlük geçmiş yeniden kuyruğa giriyor', async () => {
    await kur({ ...HESAP }).yapiSonrasiGecmisiKuyrukla('acc-1');
    expect(kuyruk).toHaveLength(1);
    expect(kuyruk[0]!.jobType).toBe('initial_backfill');
    // Kampanya seviyesi: reklam seviyesinde 90 gün yeni bir hesabın kotasını
    // saatlerce bloklar.
    expect(kuyruk[0]!.entityLevel).toBe('campaign');
    const gun =
      (new Date(`${kuyruk[0]!.dateTo}T00:00:00Z`).getTime() -
        new Date(`${kuyruk[0]!.dateFrom}T00:00:00Z`).getTime()) /
      86_400_000;
    expect(Math.round(gun)).toBe(90);
  });

  it('METRİK VARSA kuyruğa girmiyor — her yapı taraması 90 gün çekerdi', async () => {
    // Yapı taraması 6 saatte bir koşuyor. Koşul dar olmasaydı günde dört kez
    // 90 günlük çekim tetiklenir ve kota boşa giderdi.
    await kur({ ...HESAP, lastInsightsSyncAt: new Date() }).yapiSonrasiGecmisiKuyrukla('acc-1');
    expect(kuyruk).toEqual([]);
  });

  it('ATANMAMIŞ hesap için kuyruğa girmiyor', async () => {
    // `sync_jobs.client_id` NOT NULL; atanmamış hesap için iş açmak patlardı.
    await kur({ ...HESAP, clientId: null }).yapiSonrasiGecmisiKuyrukla('acc-1');
    expect(kuyruk).toEqual([]);
  });

  it('İZLEMESİ KAPALI hesap için kuyruğa girmiyor', async () => {
    await kur({ ...HESAP, syncEnabled: false }).yapiSonrasiGecmisiKuyrukla('acc-1');
    expect(kuyruk).toEqual([]);
  });

  it('hesap bulunamazsa patlamıyor — yapı taraması BAŞARILI bitmişti', async () => {
    // Bu adım düşerse yapı taramasını başarısız saymak, yazılmış 3.382 satırı
    // çöpe atıp aynı taramayı tekrar koşturmak olurdu.
    await expect(kur(null).yapiSonrasiGecmisiKuyrukla('acc-1')).resolves.toBeUndefined();
    expect(kuyruk).toEqual([]);
  });
});

describe('kaynak taraması — ÇAĞRILDIĞI da doğrulanıyor', () => {
  /*
   * Fonksiyonun DOĞRU davranması yetmiyor: yapı dalından çağrılmazsa hiçbir
   * birim testi bunu yakalamıyor. Mutasyonla görüldü — çağrıyı silmek
   * yukarıdaki beş testin hiçbirini düşürmedi. CLAUDE.md'deki "bir fonksiyon
   * test edilmişti ama çağrıldığı test edilmemişti" tuzağının aynısı.
   */
  it('yapı taraması dalı, BAŞARIDAN SONRA geçmişi kuyruğa alıyor', () => {
    const src = readFileSync(join(__dirname, 'sync-processor.service.ts'), 'utf8');
    const bas = src.indexOf("if (payload.jobType === 'structure') {");
    if (bas === -1) {
      throw new Error('structure dalı bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    const dal = src.slice(bas, src.indexOf("if (\n      payload.jobType === 'insights_realtime'", bas));
    if (!dal.includes('this.structure.syncAccount(')) {
      throw new Error('structure dilimi yapı taraması çağırmıyor — tarama boşa düştü.');
    }

    expect(dal).toContain('this.yapiSonrasiGecmisiKuyrukla(');
    // SIRA: önce iş başarılı işaretleniyor, sonra geçmiş kuyruğa giriyor.
    // Tersi olsaydı kuyruk hatası, başarılı bir taramayı başarısız gösterirdi.
    expect(dal.indexOf('markSucceeded')).toBeLessThan(dal.indexOf('yapiSonrasiGecmisiKuyrukla('));
  });
});
