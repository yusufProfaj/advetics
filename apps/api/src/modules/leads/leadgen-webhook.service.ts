import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { SyncQueueService } from '../../queue/sync-queue.service';

/**
 * Meta anlık form bildirimi (leadgen webhook).
 *
 * BU UÇ NOKTANIN İKİ KURALI VAR VE İKİSİ DE İHLAL EDİLİRSE SESSİZ ZARAR VERİR.
 *
 * 1. İMZA DOĞRULANMAK ZORUNDA. Uç nokta kimlik doğrulaması olmadan açık —
 *    Meta'nın bizde oturumu yok. Doğrulama `X-Hub-Signature-256` başlığıyla
 *    yapılıyor: imza app secret ile HAM GÖVDE üzerinden üretiliyor.
 *    Doğrulamamak, herhangi birinin uydurma müşteri kaydı enjekte etmesine
 *    izin vermek demek — ajans var olmayan kişileri arar.
 *
 * 2. YANIT HIZLI DÖNMEK ZORUNDA. Meta birkaç saniye içinde 200 bekliyor;
 *    gecikirse isteği başarısız sayıyor, tekrar deniyor ve tekrarlar
 *    sürerse ABONELİĞİ KAPATIYOR. Kapatılan abonelik hiçbir yerde hata
 *    üretmiyor: bildirimler sessizce durur.
 *
 *    Bu yüzden burada Graph API'ye HİÇBİR ÇAĞRI YAPILMIYOR. Kaydın alanları
 *    ayrı bir çağrı gerektiriyor ve o çağrı kuyruğa alınıyor.
 */

/** Meta'nın gönderdiği gövdenin ilgilendiğimiz kısmı. */
interface LeadgenChange {
  value?: {
    leadgen_id?: string;
    page_id?: string;
    form_id?: string;
    ad_id?: string;
    created_time?: number;
  };
  field?: string;
}

interface LeadgenEntry {
  id?: string;
  changes?: LeadgenChange[];
}

export interface LeadgenPayload {
  object?: string;
  entry?: LeadgenEntry[];
}

@Injectable()
export class LeadgenWebhookService {
  private readonly logger = new Logger(LeadgenWebhookService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: PrismaAdminService,
    private readonly queue: SyncQueueService,
  ) {}

  /**
   * Abonelik el sıkışması (GET).
   *
   * Meta uç noktayı ilk kez kaydederken bir `hub.challenge` gönderiyor ve
   * onu aynen geri bekliyor. `hub.verify_token` bizim belirlediğimiz sabit;
   * eşleşmezse el sıkışma reddediliyor.
   *
   * TOKEN YAPILANDIRILMAMIŞSA REDDEDİYORUZ, geçmiyoruz. Boş bir token'ı
   * "kontrol yok" diye yorumlamak, herkesin uç noktayı kendi uygulamasına
   * bağlayabilmesi demek olurdu.
   */
  verifySubscription(params: {
    mode?: string;
    token?: string;
    challenge?: string;
  }): string {
    const expected = this.config.platforms.meta.webhookVerifyToken;
    if (!expected) {
      throw new UnauthorizedException('Webhook doğrulama anahtarı yapılandırılmamış');
    }
    if (params.mode !== 'subscribe' || params.token !== expected) {
      this.logger.warn('Webhook el sıkışması reddedildi — anahtar eşleşmedi');
      throw new UnauthorizedException('Doğrulama anahtarı geçersiz');
    }
    return params.challenge ?? '';
  }

  /**
   * `X-Hub-Signature-256` doğrular.
   *
   * HAM GÖVDE ÜZERİNDEN. Ayrıştırılmış nesneyi yeniden `JSON.stringify`
   * etmek işe yaramıyor: anahtar sırası, boşluk ve sayı biçimi değişiyor ve
   * imza tutmuyor. Bu, "webhook hiç çalışmıyor" diye saatler harcatan
   * klasik hata.
   *
   * Karşılaştırma SABİT SÜREDE — `===` saldırgana byte byte doğru imzayı
   * bulduran bir zamanlama kanalı açar.
   */
  verifySignature(rawBody: Buffer | undefined, header: string | undefined): void {
    const secret = this.config.platforms.meta.appSecret;
    if (!secret) throw new UnauthorizedException('Meta app secret yapılandırılmamış');

    if (!rawBody || rawBody.length === 0) {
      // Ham gövde yoksa doğrulama YAPILAMAZ ve doğrulanamayan istek
      // reddedilir. "Gövde boş, geçelim" demek imzayı isteğe bağlı kılardı.
      throw new UnauthorizedException('İstek gövdesi okunamadı');
    }
    if (!header?.startsWith('sha256=')) {
      throw new UnauthorizedException('İmza başlığı yok ya da biçimi geçersiz');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const received = Buffer.from(header.slice('sha256='.length), 'hex');

    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      this.logger.error('Leadgen webhook imzası doğrulanamadı — istek reddedildi');
      throw new UnauthorizedException('İmza geçersiz');
    }
  }

  /**
   * Bildirimi işler — GRAPH API'YE ÇAĞRI YAPMADAN.
   *
   * Yapılan tek iş: hangi kayıtların çekileceğini kuyruğa yazmak. Tek bir
   * istekte birden çok sayfa ve birden çok kayıt gelebiliyor.
   *
   * TANIMADIĞIMIZ SAYFA SESSİZCE ATLANIYOR ama LOGLANIYOR. Hata dönmek
   * Meta'ya "bu isteği tekrar gönder" demek olurdu ve tekrar da aynı sonucu
   * verirdi — sonsuz tekrar, sonunda kapatılan abonelik.
   */
  async handle(payload: LeadgenPayload): Promise<{ queued: number; skipped: number }> {
    let queued = 0;
    let skipped = 0;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v?.leadgen_id) {
          skipped++;
          continue;
        }

        const pageId = v.page_id ?? entry.id;
        const profile = pageId ? await this.findProfile(pageId) : null;
        if (!profile) {
          this.logger.warn(
            `Leadgen bildirimi tanınmayan sayfadan: ${pageId ?? 'bilinmiyor'} — atlandı`,
          );
          skipped++;
          continue;
        }

        const res = await this.queue.enqueue({
          clientId: profile.clientId,
          platform: 'meta',
          jobType: 'lead_fetch',
          socialProfileId: profile.id,
          externalLeadId: v.leadgen_id,
          externalFormId: v.form_id,
        });
        if (res.enqueued) queued++;
        else skipped++;
      }
    }

    if (queued > 0) this.logger.log(`Leadgen: ${queued} kayıt kuyruğa alındı`);
    return { queued, skipped };
  }

  private async findProfile(
    pageExternalId: string,
  ): Promise<{ id: string; clientId: string } | null> {
    return this.db.socialProfile.findFirst({
      where: { externalId: pageExternalId, profileType: 'facebook_page' },
      select: { id: true, clientId: true },
    });
  }
}
