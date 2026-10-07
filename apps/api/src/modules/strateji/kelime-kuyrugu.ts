import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CONFIG, type AppConfig } from '../../config/configuration';

/**
 * AdvStrategy kelime araması KENDİ kuyruğunda (MIMARI § 3).
 *
 * NEDEN AYRI KUYRUK: Google `GenerateKeywordIdeas` 1 QPS ve senkron
 * kuyruğunun yapı/metrik işleriyle aynı kotayı yememeli ("bağımlı iş,
 * bağlı olduğu işin kotasını yiyebilir" dersi). 1 QPS sınırı işçide
 * (`limiter`) kuruluyor: kuyruk düzeyinde, yani kaç API süreci iş eklerse
 * eklesin Google'a saniyede en çok bir istek gider.
 *
 * TEK DENEME. İşleyici her sonucu (başarı, Google hatası, sıfır fikir) plan
 * satırına yazıyor ve kullanıcı yeniden arayabiliyor; BullMQ'nun kendiliğinden
 * tekrarı, kotaya takılmış bir aramayı kullanıcı ekrana bakarken beş kez
 * daha denerdi.
 *
 * KİMLİK ARAMA BAŞINA (`aramaId`), tohumlardan DEĞİL. MIMARI § 3 tohum
 * özeti öneriyordu; aynı tohumlarla ikinci arama aynı kimliğe çarpıp
 * sessizce yutulurdu (CLAUDE.md "mükerrer engeli kalıcı kilit
 * üretebiliyor"). `aramaId` plan satırına da yazılıyor ve işçi yalnız kendi
 * kimliği hâlâ oradaysa sonuç yazıyor: bayat iş yeni aramayı ezemez.
 * Tamamlanan iş yine de saklanmıyor (`removeOnComplete: true`).
 */
export const STRATEJI_KELIME_KUYRUGU = 'strateji-kelime';

export interface KelimeAramaIsi {
  planId: string;
  /** Plan satırındaki `kelime_arama_id`; işçi yalnız bu eşleşirse yazar. */
  aramaId: string;
  tohumlar: string[];
}

/** Ayırıcı `__` (BullMQ `:`'yı reddediyor). */
export function kelimeIsKimligi(planId: string, aramaId: string): string {
  return `strateji_kelime__${planId}__${aramaId}`;
}

@Injectable()
export class StratejiKelimeKuyrugu implements OnModuleDestroy {
  private readonly baglanti: Redis | null;
  private readonly kuyruk: Queue<KelimeAramaIsi> | null;

  constructor(@Inject(CONFIG) config: AppConfig) {
    if (!config.redis.url) {
      this.baglanti = null;
      this.kuyruk = null;
      return;
    }
    this.baglanti = new Redis(config.redis.url, { db: config.redis.db, maxRetriesPerRequest: null });
    this.kuyruk = new Queue<KelimeAramaIsi>(STRATEJI_KELIME_KUYRUGU, {
      connection: this.baglanti,
      prefix: config.redis.keyPrefix,
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
    });
  }

  /** Kuyruk yoksa FIRLATIR: kuyruğa girmeyen arama sonsuza kadar "kuyrukta" görünürdü. */
  async ekle(is: KelimeAramaIsi): Promise<void> {
    if (!this.kuyruk) throw new Error('Kelime kuyruğu kurulu değil (REDIS_URL yok)');
    await this.kuyruk.add('kelime', is, { jobId: kelimeIsKimligi(is.planId, is.aramaId) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.kuyruk?.close();
    await this.baglanti?.quit().catch(() => this.baglanti?.disconnect());
  }
}
