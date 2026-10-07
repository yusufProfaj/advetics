import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CONFIG, type AppConfig } from '../../config/configuration';

/**
 * Yeni reklam modülünün KENDİ kuyruğu. Senkron kuyruğundan ayrı: yayın
 * etkileşimli bir iş ve senkron işlerinin arkasında beklememeli; ayrıca
 * eski kuyruk servisi eski modüllere bağlı (modül sınırı).
 *
 * Tek deneme (`attempts: 1`): motor her belirsizliği kendi durumuna
 * çeviriyor. BullMQ'nun otomatik tekrarı, sonucu bilinmeyen bir POST'u
 * yeniden göndermek olurdu — ikinci kampanya.
 */
export const REKLAM_YAYIN_KUYRUGU = 'reklam-yayin';

export type YayinAdimi = 'kur' | 'devam' | 'geri_al' | 'yeniden_oku';
export interface YayinIsi {
  yayinId: string;
  adim: YayinAdimi;
}

/** İş kimliği: ayırıcı `__` (BullMQ `:`'yı reddediyor). Aynı adım iki kez kuyruğa giremez. */
export function yayinIsKimligi(yayinId: string, adim: YayinAdimi): string {
  return `yayin__${yayinId}__${adim}`;
}

@Injectable()
export class ReklamKuyrugu implements OnModuleDestroy {
  private readonly baglanti: Redis | null;
  private readonly kuyruk: Queue<YayinIsi> | null;

  constructor(@Inject(CONFIG) config: AppConfig) {
    if (!config.redis.url) {
      this.baglanti = null;
      this.kuyruk = null;
      return;
    }
    this.baglanti = new Redis(config.redis.url, { db: config.redis.db, maxRetriesPerRequest: null });
    this.kuyruk = new Queue<YayinIsi>(REKLAM_YAYIN_KUYRUGU, {
      connection: this.baglanti,
      prefix: config.redis.keyPrefix,
      defaultJobOptions: { attempts: 1, removeOnComplete: 500, removeOnFail: 1000 },
    });
  }

  /** Kuyruk yoksa FIRLATIR: sessizce kuyruğa girmeyen yayın sonsuza kadar on_kontrol'de kalırdı. */
  async ekle(yayinId: string, adim: YayinAdimi): Promise<void> {
    if (!this.kuyruk) throw new Error('Yayın kuyruğu kurulu değil (REDIS_URL yok)');
    await this.kuyruk.add(adim, { yayinId, adim }, { jobId: yayinIsKimligi(yayinId, adim) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.kuyruk?.close();
    await this.baglanti?.quit().catch(() => this.baglanti?.disconnect());
  }
}
