import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import {
  deriveCallbackToken,
  deriveHubSecret,
  hashCallbackToken,
  newTokenNonce,
} from './websub-token';
import { parseChannelInput } from './youtube-channel';
import { YouTubeApiService } from './youtube-api.service';
import {
  buildCallbackUrl,
  buildSubscribeBody,
  YOUTUBE_HUB_URL,
  youtubeTopicUrl,
} from './youtube-websub';

/**
 * KANAL EKLEME VE HUB ABONELİĞİ (Advetics 1.0).
 *
 * ═══ TEK İŞLEM, İKİ ADIM ═══
 *
 * Kanal eklemek ile bildirim aboneliği kurmak AYRILMIYOR. Ayrılsaydı
 * "kanal ekli ama bildirim gelmiyor" diye bir ara durum olurdu ve panelde
 * ikisi de "eklendi" görünürdü — bu projenin klasik sessiz hatası.
 *
 * ABONELİK ASENKRON TAMAMLANIYOR ve bu WebSub'ın gereği: hub'a isteği
 * gönderiyoruz, hub bize GET ile doğrulama çağrısı yapıyor ve abonelik ancak o
 * zaman kuruluyor. Yani bu metot döndüğünde abonelik HENÜZ AKTİF DEĞİL —
 * `verified_at` NULL. Kullanıcıya "kuruluyor" denmesi ve doğrulanmadığında
 * bunun GÖRÜNMESİ gerekiyor (ölü adam düğmesi).
 */
@Injectable()
export class YouTubeSubscribeService {
  private readonly logger = new Logger(YouTubeSubscribeService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly youtube: YouTubeApiService,
  ) {}

  /**
   * Kanalı ekler ve hub aboneliğini başlatır.
   *
   * SIRA: girdiyi çöz → kanalı DOĞRULA → profil yaz → abonelik satırı yaz →
   * hub'a istek. Hub çağrısı en sonda çünkü tek dış bağımlılık o; öncesinde
   * bir şey ters giderse hesapta hiç iz kalmıyor.
   */
  async addChannel(
    ctx: TenantContext,
    input: { clientId: string; channelInput: string },
  ): Promise<{ socialProfileId: string; channelId: string; title: string }> {
    // --- 1. Girdiyi çöz
    const girdi = parseChannelInput(input.channelInput);
    if (girdi.kind === 'unsupported') {
      // Mesaj kullanıcıya OLDUĞU GİBİ gidiyor: ne yapacağını söylüyor.
      throw new BadRequestException(girdi.reason);
    }

    // --- 2. Kanalı DOĞRULA (uydurulmuş kimlikle profil açılmasın)
    const sonuc = await this.youtube.getChannel(girdi);
    if (sonuc.durum === 'hata') throw new BadRequestException(sonuc.message);
    if (sonuc.durum === 'bulunamadi') {
      throw new BadRequestException(
        'Bu kanal YouTube’da bulunamadı. Kanal sayfasındaki adresi ya da ' +
          '@tanıtıcıyı yapıştırdığından emin ol.',
      );
    }
    const kanal = sonuc.kanal;

    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * BAĞLANTI ZORUNLU. `social_profiles.connection_id` NOT NULL ve elle
       * eklenen kanalın kendi OAuth bağlantısı yok — ajansın Google
       * bağlantısına iliştiriliyor.
       *
       * BAĞLANTI YOKSA REDDEDİLİYOR ve bu bir kısıtlama değil gerçeğin
       * kendisi: Google Ads bağlı değilse o kanal için reklam da
       * yayınlanamaz. Şimdi söylemek, kullanıcının kanalı ekleyip "neden
       * yayınlanmıyor" diye aramasından iyi.
       */
      const [baglanti] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id::text AS id FROM platform_connections
        WHERE org_id = ${ctx.orgId}::uuid AND platform = 'google'
          AND status = 'active'
        ORDER BY created_at
        LIMIT 1
      `);
      if (!baglanti) {
        throw new BadRequestException(
          'Önce Google Ads bağlantısı kurulmalı: YouTube kanalı o bağlantının ' +
            'altında yaşıyor ve reklam da oradan yayınlanıyor.',
        );
      }

      /*
       * PROFİL EKLE — AYNI KANAL İKİNCİ KEZ EKLENEMEZ.
       *
       * `(org_id, external_id)` tekil. Çakışmada güncelleme yapılıyor:
       * kullanıcı aynı kanalı yeniden eklediğinde hata almak yerine kanal
       * müşteriye (yeniden) atanıyor — istediği şey buydu.
       */
      const [profil] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO social_profiles (
          id, org_id, client_id, connection_id, profile_type, external_id,
          name, picture_url, sync_enabled, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${baglanti.id}::uuid, 'youtube_channel', ${kanal.channelId},
          ${kanal.title.slice(0, 200)}, ${kanal.thumbnailUrl},
          -- SÜPÜRME KAPALI: YouTube içeriği süpürmeyle değil bildirimle
          -- geliyor. Açık bırakmak, Meta organik uçlarına kanal kimliğiyle
          -- gitmek demek olurdu.
          false, now()
        )
        ON CONFLICT (org_id, external_id) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          name = EXCLUDED.name,
          picture_url = EXCLUDED.picture_url,
          updated_at = now()
        RETURNING id::text AS id
      `);
      if (!profil) throw new Error('Kanal profili yazılamadı');

      // --- 4. Abonelik satırı (belirteç TÜRETİLİYOR, saklanmıyor)
      const nonce = newTokenNonce();
      const token = deriveCallbackToken({
        masterKey: this.masterKey(),
        socialProfileId: profil.id,
        nonce,
      });

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO auto_boost_subscriptions (
          id, org_id, client_id, social_profile_id, topic_url,
          token_nonce, callback_token_hash, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${profil.id}::uuid, ${youtubeTopicUrl(kanal.channelId)},
          ${nonce}, ${hashCallbackToken(token)}, now()
        )
        -- YENİDEN EKLEMEDE BELİRTEÇ YENİLENİYOR ve bu KASITLI: eski adres
        -- ölüyor. Kullanıcı bir kanalı yeniden eklediğinde niyeti genelde
        -- "bozulmuştu, düzelt" oluyor ve sızmış bir belirteç varsa burada
        -- kapanıyor.
        ON CONFLICT (social_profile_id) DO UPDATE SET
          token_nonce = EXCLUDED.token_nonce,
          callback_token_hash = EXCLUDED.callback_token_hash,
          topic_url = EXCLUDED.topic_url,
          verified_at = NULL, renew_at = NULL, denied_reason = NULL,
          -- İMZA KİLİDİ DE SIFIRLANIYOR: yeni secret ile hub'ın imzalayıp
          -- imzalamayacağı yeniden öğrenilecek. Kilidi taşımak, imzasız
          -- gelen meşru bildirimleri reddetmek olurdu.
          signature_seen_at = NULL,
          updated_at = now()
      `);

      // --- 5. Hub'a istek (dış çağrı EN SONDA)
      await this.sendSubscribe({
        socialProfileId: profil.id,
        token,
        nonce,
        channelId: kanal.channelId,
        mode: 'subscribe',
      });

      this.logger.log(`YouTube kanalı eklendi: ${kanal.title} (${kanal.channelId})`);
      return { socialProfileId: profil.id, channelId: kanal.channelId, title: kanal.title };
    });
  }

  /**
   * Hub'a abonelik/iptal isteği gönderir.
   *
   * HATA FIRLATMIYOR, LOG'LUYOR. Hub geçici olarak ulaşılamaz olabilir ve o
   * durumda kanal ekleme işlemini geri almak yanlış olurdu: kayıt duruyor,
   * yenileme işi bir sonraki turda tekrar deniyor ve doğrulanmamış abonelik
   * ölü adam düğmesiyle zaten görünür oluyor.
   */
  private async sendSubscribe(params: {
    socialProfileId: string;
    token: string;
    nonce: string;
    channelId: string;
    mode: 'subscribe' | 'unsubscribe';
  }): Promise<void> {
    /*
     * GENEL ADRES `OAUTH_REDIRECT_BASE_URL`'DEN — yeni bir değişken
     * eklenmedi.
     *
     * O değişken zaten "bu API'ye dışarıdan ulaşılan kök adres" anlamına
     * geliyor: Meta ve Google OAuth geri çağrıları da `<kök>/api/...`
     * biçiminde kuruluyor ve üretimde ayarlı (bağlantılar çalışıyor). İkinci
     * bir adres değişkeni, ikisinin bir gün ayrışması demekti.
     *
     * TANIMSIZSA ABONELİK KURULMUYOR. Göreli ya da localhost bir adresle
     * abone olmak, hub'ın bize hiç ulaşamaması ve bunun HİÇBİR YERDE
     * görünmemesi demek — kullanıcı "video yükledim, kart gelmedi" diye
     * bakardı.
     */
    const base = this.config.platforms.oauthRedirectBaseUrl;
    if (!base) {
      this.logger.error(
        'OAUTH_REDIRECT_BASE_URL tanımlı değil; YouTube bildirim aboneliği ' +
          'kurulamıyor. Hub bize ulaşamaz.',
      );
      return;
    }

    const callbackUrl = buildCallbackUrl({
      publicBaseUrl: base,
      globalPrefix: this.config.globalPrefix,
      token: params.token,
    });

    const body = buildSubscribeBody({
      callbackUrl,
      topicUrl: youtubeTopicUrl(params.channelId),
      secret: deriveHubSecret({
        masterKey: this.masterKey(),
        socialProfileId: params.socialProfileId,
        nonce: params.nonce,
      }),
      mode: params.mode,
    });

    try {
      const res = await fetch(YOUTUBE_HUB_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        /*
         * HUB'IN CEVABI LOG'A YAZILIYOR ama adres YAZILMIYOR — içinde
         * belirteç var. `maskPath` yalnızca HTTP katmanındaki log'ları
         * koruyor; buradaki kendi mesajımız.
         */
        const metin = await res.text().catch(() => '');
        this.logger.error(
          `YouTube hub aboneliği reddetti (profil ${params.socialProfileId}): ` +
            `HTTP ${res.status} ${metin.slice(0, 300)}`,
        );
        return;
      }

      this.logger.log(
        `YouTube hub'a ${params.mode} isteği gönderildi (profil ${params.socialProfileId}) — ` +
          'doğrulama el sıkışması bekleniyor.',
      );
    } catch (err) {
      this.logger.error(
        `YouTube hub'a ulaşılamadı (profil ${params.socialProfileId}): ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private masterKey(): Buffer {
    const encoded = this.config.encryption.keys[this.config.encryption.activeVersion];
    if (!encoded) throw new Error('Aktif şifreleme anahtarı yok');
    return Buffer.from(encoded, 'base64');
  }
}
