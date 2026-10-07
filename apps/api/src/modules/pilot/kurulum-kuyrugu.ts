import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CONFIG, type AppConfig } from '../../config/configuration';

/**
 * Pilot kurulumunun KENDİ kuyruğu. İki iş türü:
 *   · `plan`  — onaylı planın satırlarını açar (yoksa) ve her satır için
 *               ayrı iş kuyruğa koyar; plan durumunu kurulum sayımından yazar.
 *   · `satir` — tek satır: taslak → uyum → prova → kurulum → geri okuma → açma.
 * Satır başına iş: hesap yazıcı kilidi ve prova kotası SATIR düzeyinde
 * erteleme istiyor; tek büyük iş bir satır beklerken bütün planı bekletirdi.
 *
 * TEK DENEME (`attempts: 1`): motor her belirsizliği kendi durumuna
 * çeviriyor. BullMQ'nun kendiliğinden tekrarı sonucu bilinmeyen bir POST'u
 * yeniden göndermek olurdu — ikinci kampanya, gerçek para.
 */
export const PILOT_KURULUM_KUYRUGU = 'pilot-kurulum';

export type PilotKurulumIsi = { tur: 'plan'; planId: string } | { tur: 'satir'; satirId: string };

/**
 * İş kimliği: ayırıcı `__` (BullMQ `:`'yı reddediyor). `tetik` aynı planın
 * ikinci kez kuyruğa girmesini ayırıyor: onay bir kez, "Şimdi kur" her
 * basışta yeni bir tetik (satır işleri zaten son durumdakileri atlıyor).
 */
export function pilotIsKimligi(is: PilotKurulumIsi, tetik: string): string {
  return is.tur === 'plan' ? `pilot__plan__${is.planId}__${tetik}` : `pilot__satir__${is.satirId}__${tetik}`;
}

@Injectable()
export class PilotKurulumKuyrugu implements OnModuleDestroy {
  private readonly baglanti: Redis | null;
  private readonly kuyruk: Queue<PilotKurulumIsi> | null;

  constructor(@Inject(CONFIG) config: AppConfig) {
    if (!config.redis.url) {
      this.baglanti = null;
      this.kuyruk = null;
      return;
    }
    this.baglanti = new Redis(config.redis.url, { db: config.redis.db, maxRetriesPerRequest: null });
    this.kuyruk = new Queue<PilotKurulumIsi>(PILOT_KURULUM_KUYRUGU, {
      connection: this.baglanti,
      prefix: config.redis.keyPrefix,
      defaultJobOptions: { attempts: 1, removeOnComplete: 500, removeOnFail: 1000 },
    });
  }

  /** Kuyruk yoksa FIRLATIR: sessizce kuyruğa girmeyen onay sonsuza kadar "onaylandı" kalırdı. */
  async planEkle(planId: string, tetik: string): Promise<void> {
    if (!this.kuyruk) throw new Error('Pilot kurulum kuyruğu kurulu değil (REDIS_URL yok)');
    const is: PilotKurulumIsi = { tur: 'plan', planId };
    await this.kuyruk.add('plan', is, { jobId: pilotIsKimligi(is, tetik) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.kuyruk?.close();
    await this.baglanti?.quit().catch(() => this.baglanti?.disconnect());
  }
}
