import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AutoBoostQueueService } from './autoboost-queue.service';
import { deriveHubSecret, hashCallbackToken } from './websub-token';
import { YouTubeApiService } from './youtube-api.service';
import {
  decideNotificationAccept,
  decideRateLimit,
  decideVideoBelongsToChannel,
  decideWebSubVerification,
  parseYouTubeFeed,
  verifyWebSubSignature,
  yenilemeZamani,
  youtubeWatchUrl,
} from './youtube-websub';

/**
 * YOUTUBE BİLDİRİM UCUNUN İŞ MANTIĞI.
 *
 * Kararların TAMAMI `youtube-websub.ts` içindeki saf fonksiyonlarda; burası
 * yalnızca sırayı kuruyor, veritabanına dokunuyor ve dış çağrıyı yapıyor.
 * Ayrım bilinçli: karar mantığı gerçek HTTP olmadan sınanabilmeli ve bu uç
 * kimlik doğrulamasız, internete açık, sonunda para harcayan bir zincirin ilk
 * halkası.
 *
 * ═══ SIRA ÖNEMLİ ═══
 *
 *   1. Belirteçten aboneliği bul      — bilinmeyen belirteç hiç iş yapmadan düşer
 *   2. İmza + öğren-ve-kilitle        — düşürme saldırısı burada kapanıyor
 *   3. Atom gövdesini ayrıştır        — yalnızca TETİKLEYİCİ olarak
 *   4. Akış sınırı                    — kuyruk şişirme burada duruyor
 *   5. YouTube Data API doğrulaması   — asıl savunma; başka kanalın videosu burada eleniyor
 *   6. Kuyruğa yaz                    — veri API'den, gövdeden DEĞİL
 *
 * Pahalı adım (5) en sona bırakıldı: ucuz kontroller önce elensin ki sahte
 * istek yağmuru Data API kotasını yakmasın.
 *
 * WORKER/WEBHOOK BAĞLAMINDA `PrismaAdminService` (BYPASSRLS). Hub'ın oturumu
 * yok; RLS politikaları eşleşemezdi ve kayıt SESSİZCE kaybolurdu.
 */
@Injectable()
export class YouTubeWebSubService {
  private readonly logger = new Logger(YouTubeWebSubService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: PrismaAdminService,
    private readonly kuyruk: AutoBoostQueueService,
    private readonly youtube: YouTubeApiService,
  ) {}

  /**
   * Hub'ın GET doğrulama isteği.
   *
   * DÖNÜŞ `challenge` İSE GÖVDESİNDE AYNEN yazılmalı — hub o metni birebir
   * bekliyor ve farklıysa aboneliği kurmuyor.
   */
  async verifySubscription(params: {
    token: string;
    mode?: string;
    topic?: string;
    challenge?: string;
    leaseSeconds?: string;
    reason?: string;
  }): Promise<{ status: number; body: string }> {
    const abonelik = await this.findByToken(params.token);
    if (!abonelik) {
      // BİLİNMEYEN BELİRTEÇ — 404. Ayrıntı verilmiyor: "böyle bir abonelik
      // yok" ile "konu eşleşmedi" arasındaki fark, belirteç deneyen birine
      // geri bildirim olurdu.
      return { status: 404, body: 'not found' };
    }

    const karar = decideWebSubVerification({
      mode: params.mode,
      topic: params.topic,
      challenge: params.challenge,
      leaseSeconds: params.leaseSeconds,
      reason: params.reason,
      expectedTopic: abonelik.topic_url,
    });

    if (karar.action === 'denied') {
      /*
       * REDDEDİLME KAYDEDİLİYOR. Hub cevabımızı umursamıyor; kaydetmezsek
       * bizim tarafta abonelik "kurulu" görünür, panel hiçbir sorun göstermez
       * ve video bildirimi hiç gelmez — kiralamanın dolmasından çok daha hızlı
       * bir sessiz ölüm.
       */
      await this.db.$executeRaw(Prisma.sql`
        UPDATE auto_boost_subscriptions
        SET denied_reason = ${karar.reason.slice(0, 500)}, verified_at = NULL,
            renew_at = NULL, updated_at = now()
        WHERE id = ${abonelik.id}::uuid
      `);
      this.logger.error(
        `YouTube aboneliği REDDEDİLDİ (profil ${abonelik.social_profile_id}): ${karar.reason}`,
      );
      return { status: 200, body: 'ok' };
    }

    if (karar.action === 'unsubscribed') {
      await this.db.$executeRaw(Prisma.sql`
        UPDATE auto_boost_subscriptions
        SET verified_at = NULL, renew_at = NULL, updated_at = now()
        WHERE id = ${abonelik.id}::uuid
      `);
      return { status: 200, body: params.challenge ?? 'ok' };
    }

    if (karar.action === 'reject') {
      this.logger.warn(`YouTube doğrulaması reddedildi: ${karar.reason}`);
      return { status: 400, body: 'bad request' };
    }

    const now = new Date();
    await this.db.$executeRaw(Prisma.sql`
      UPDATE auto_boost_subscriptions
      SET verified_at = ${now}, lease_seconds = ${karar.leaseSeconds},
          renew_at = ${yenilemeZamani(now, karar.leaseSeconds)},
          denied_reason = NULL, updated_at = now()
      WHERE id = ${abonelik.id}::uuid
    `);

    // HUB CHALLENGE'I BİREBİR BEKLİYOR.
    return { status: 200, body: karar.challenge };
  }

  /**
   * Hub'ın POST bildirimi.
   *
   * HER YOLDA 200 DÖNÜLÜYOR — reddedilen bildirimlerde bile.
   *
   * Sebep hub'ın davranışı: 2xx dışı yanıt "teslim başarısız" sayılıyor ve
   * bildirim tekrar tekrar gönderiliyor; ısrarlı başarısızlık aboneliği
   * tamamen düşürebiliyor. Yani sahte bir isteğe 403 dönmek, saldırganın
   * ABONELİĞİ ÖLDÜRMESİNE imkân verirdi — reddetmenin kendisi bir hizmet
   * dışı bırakma aracına dönüşürdü.
   *
   * Reddetme sessiz DEĞİL: sebep log'a ve gerektiğinde abonelik satırına
   * yazılıyor.
   */
  async handleNotification(params: {
    token: string;
    rawBody: Buffer;
    signatureHeader: string | undefined;
    sourceIp: string | null;
  }): Promise<{ status: number; body: string }> {
    const abonelik = await this.findByToken(params.token);
    if (!abonelik) {
      // Bilinmeyen belirteç: hiç iş yapılmadan düşüyor. 404 güvenli — hub
      // bizim aboneliğimiz olmayan bir uca zaten bildirim göndermez.
      return { status: 404, body: 'not found' };
    }

    // --- 2. İmza + öğren-ve-kilitle
    const imza = verifyWebSubSignature({
      header: params.signatureHeader,
      rawBody: params.rawBody,
      secret: this.hubSecretFor(abonelik),
    });

    const kabul = decideNotificationAccept({
      imza,
      imzaDahaOnceGoruldu: abonelik.signature_seen_at !== null,
    });

    if (!kabul.accept) {
      this.logger.error(
        `YouTube bildirimi REDDEDİLDİ (profil ${abonelik.social_profile_id}, ` +
          `ip ${params.sourceIp ?? '?'}): ${kabul.reason}`,
      );
      return { status: 200, body: 'ok' };
    }

    if (kabul.kilitle && !abonelik.signature_seen_at) {
      /*
       * KİLİT BURADA KURULUYOR ve bir daha açılmıyor. Bundan sonra imzasız
       * gelen her istek düşürme denemesi sayılıyor.
       */
      await this.db.$executeRaw(Prisma.sql`
        UPDATE auto_boost_subscriptions
        SET signature_seen_at = now(), updated_at = now()
        WHERE id = ${abonelik.id}::uuid AND signature_seen_at IS NULL
      `);
      this.logger.log(
        `YouTube imza kilidi kuruldu (profil ${abonelik.social_profile_id}) — ` +
          'bundan sonra imzasız bildirim kabul edilmiyor.',
      );
    }

    // Ölü adam düğmesi bu damgaya bakıyor.
    await this.db.$executeRaw(Prisma.sql`
      UPDATE auto_boost_subscriptions
      SET last_notification_at = now(), updated_at = now()
      WHERE id = ${abonelik.id}::uuid
    `);

    // --- 3. Atom gövdesi — YALNIZCA tetikleyici
    const bildirim = parseYouTubeFeed(params.rawBody.toString('utf8'));
    if (!bildirim) {
      // Silme bildirimi ya da tanınmayan gövde. Hata değil.
      return { status: 200, body: 'ok' };
    }

    if (bildirim.guncelleme) {
      /*
       * GÜNCELLEME KART AÇMIYOR. Hub, videonun başlığı değiştiğinde de
       * bildiriyor. Tekillik kısıtı ikinci kartı zaten engelliyor ama burada
       * durdurmak, sebebi kaydedilmiş bir "atlandı" üretiyor — kısıta
       * çarpmak sessiz kalırdı.
       */
      this.logger.log(`YouTube bildirimi güncelleme (${bildirim.videoId}) — kart açılmadı.`);
      return { status: 200, body: 'ok' };
    }

    // --- 4. Akış sınırı (Data API'den ÖNCE: sahte yağmur kotayı yakmasın)
    const [sayim] = await this.db.$queryRaw<
      Array<{ son_saat: bigint; bekleyen: bigint }>
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour') AS son_saat,
        COUNT(*) FILTER (WHERE status = 'pending') AS bekleyen
      FROM auto_boost_queue_items
      WHERE social_profile_id = ${abonelik.social_profile_id}::uuid
    `);

    const akis = decideRateLimit({
      sonSaattekiKart: Number(sayim?.son_saat ?? 0),
      bekleyenKart: Number(sayim?.bekleyen ?? 0),
    });
    if (!akis.allow) {
      const seviye = akis.sizintiSinyali ? 'error' : 'warn';
      this.logger[seviye](
        `YouTube bildirimi sınırlandı (profil ${abonelik.social_profile_id}): ${akis.reason}`,
      );
      return { status: 200, body: 'ok' };
    }

    // --- 5. ASIL SAVUNMA: video gerçekten bu kanalın mı?
    const sonuc = await this.youtube.getVideo(bildirim.videoId);
    if (sonuc.durum === 'hata') {
      // ARIZA, saldırı değil. Kart açılmıyor ama sebep ayrı kaydediliyor.
      this.logger.warn(`YouTube videosu doğrulanamadı: ${sonuc.message}`);
      return { status: 200, body: 'ok' };
    }

    if (sonuc.durum === 'bulunamadi') {
      /*
       * BULUNAMAYAN VİDEO — karar saf fonksiyonda, mesajı oradan alıyoruz.
       * "Belki gecikmiştir" denmiyor: geçirmek uydurulmuş her kimliği kabul
       * etmek olurdu ve gerçek gecikmede hub bildirimi zaten tekrarlıyor.
       */
      const k = decideVideoBelongsToChannel({
        apiChannelId: null,
        expectedChannelId: abonelik.channel_external_id,
        bulunamadi: true,
      });
      this.logger.error(
        `YouTube bildirimi REDDEDİLDİ (profil ${abonelik.social_profile_id}, ` +
          `ip ${params.sourceIp ?? '?'}): ${!k.ok ? k.reason : ''}`,
      );
      return { status: 200, body: 'ok' };
    }

    const video = sonuc.video;

    const dogrulama = decideVideoBelongsToChannel({
      apiChannelId: video.channelId,
      expectedChannelId: abonelik.channel_external_id,
      bulunamadi: false,
    });

    if (!dogrulama.ok) {
      const seviye = dogrulama.saldiriSinyali ? 'error' : 'warn';
      this.logger[seviye](
        `YouTube bildirimi REDDEDİLDİ (profil ${abonelik.social_profile_id}, ` +
          `ip ${params.sourceIp ?? '?'}): ${dogrulama.reason}`,
      );
      return { status: 200, body: 'ok' };
    }

    // --- 6. Kuyruğa yaz — VERİ API'DEN, gövdeden DEĞİL
    const yazildi = await this.kuyruk.enqueueOne({
      orgId: abonelik.org_id,
      clientId: abonelik.client_id,
      socialProfileId: abonelik.social_profile_id,
      platform: 'google',
      externalId: bildirim.videoId,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      permalink: youtubeWatchUrl(bildirim.videoId),
      mediaType: 'video',
      publishedAt: video.publishedAt,
    });

    if (yazildi) {
      /*
       * BİLDİRİMİN KÖKENİ KAYDEDİLİYOR. `imzasiz` gelen kart panelde işaretli
       * görünecek: koruma o kart için yalnızca adresin gizli kalmasına
       * dayanıyor ve kullanıcı bunu bilmeli.
       */
      await this.db.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET signature_state = ${kabul.imzaDurumu}, source_ip = ${params.sourceIp},
            updated_at = now()
        WHERE social_profile_id = ${abonelik.social_profile_id}::uuid
          AND external_id = ${bildirim.videoId}
      `);
      this.logger.log(`YouTube kartı açıldı: ${bildirim.videoId} (${kabul.imzaDurumu})`);
    }

    return { status: 200, body: 'ok' };
  }

  /** Belirteçten aboneliği bulur — arama ÖZET üzerinden. */
  private async findByToken(token: string): Promise<AbonelikSatiri | null> {
    const [row] = await this.db.$queryRaw<AbonelikSatiri[]>(Prisma.sql`
      SELECT s.id::text AS id, s.org_id::text AS org_id, s.client_id::text AS client_id,
             s.social_profile_id::text AS social_profile_id, s.topic_url,
             s.token_nonce, s.signature_seen_at,
             sp.external_id AS channel_external_id
      FROM auto_boost_subscriptions s
      JOIN social_profiles sp ON sp.id = s.social_profile_id
      WHERE s.callback_token_hash = ${hashCallbackToken(token)}
    `);
    return row ?? null;
  }

  /**
   * Aboneliğin hub secret'ı — SAKLANMIYOR, türetiliyor.
   *
   * Ana anahtar `CryptoService` ile aynı kaynaktan; ayrı bir sır yönetmek
   * rotasyonu ikiye bölerdi.
   */
  private hubSecretFor(abonelik: AbonelikSatiri): string {
    const encoded = this.config.encryption.keys[this.config.encryption.activeVersion];
    if (!encoded) throw new Error('Aktif şifreleme anahtarı yok');
    return deriveHubSecret({
      masterKey: Buffer.from(encoded, 'base64'),
      socialProfileId: abonelik.social_profile_id,
      nonce: abonelik.token_nonce,
    });
  }
}

interface AbonelikSatiri {
  id: string;
  org_id: string;
  client_id: string;
  social_profile_id: string;
  topic_url: string;
  token_nonce: string;
  signature_seen_at: Date | null;
  /** Kanalın YouTube kimliği — `social_profiles.external_id`. */
  channel_external_id: string;
}
