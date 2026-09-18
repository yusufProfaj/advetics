import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  deriveCallbackToken,
  deriveHubSecret,
  hashCallbackToken,
  newTokenNonce,
} from './websub-token';
import { parseChannelInput } from './youtube-channel';
import { YouTubeApiService } from './youtube-api.service';
import { AutoBoostQueueService } from './autoboost-queue.service';
import {
  buildCallbackUrl,
  buildSubscribeBody,
  YOUTUBE_HUB_URL,
  youtubeTopicUrl,
  youtubeWatchUrl,
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
/**
 * ATAMADA KAÇ VİDEO ÇEKİLİYOR.
 *
 * Instagram tarafındaki ilk çekimle AYNI mantık, sayı DAHA KÜÇÜK: YouTube'da
 * içerik üretim hızı düşük ve on video çoğu kanalda aylar geriye gider. Ayı
 * geçmiş bir videoyu reklama çevirmek kullanıcıya bir seçim değil, elemesi
 * gereken bir liste verirdi.
 */
const ATAMADA_CEKILEN_VIDEO = 5;

@Injectable()
export class YouTubeSubscribeService {
  private readonly logger = new Logger(YouTubeSubscribeService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    /**
     * YENİLEME İŞİ İÇİN — zamanlayıcıdan geliyor ve oturumu yok.
     *
     * RLS politikaları oturumsuz bağlamda eşleşemiyor; `PrismaService` ile
     * tarama SIFIR satır bulur ve iş sessizce hiçbir şey yapmazdı.
     */
    private readonly db: PrismaAdminService,
    private readonly youtube: YouTubeApiService,
    /**
     * TOHUMLAMA MEVCUT KAPIDAN GEÇİYOR. Kuyruğa yazan ikinci bir SQL yazmak,
     * mükerrer engellemesini ve alan listesini ikiye ayırmak olurdu.
     */
    private readonly kuyruk: AutoBoostQueueService,
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
    input: { clientId: string | null; channelInput: string },
  ): Promise<{ socialProfileId: string; channelId: string; title: string; assigned: boolean }> {
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

    const sonucKayit = await this.prisma.withTenant(ctx, async (tx) => {
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
          -- HAVUZA EKLEME VAR OLAN ATAMAYI BOZMUYOR. Kanal bir workspace'e
          -- atanmışken bağlantı ekranından yeniden eklendiğinde düz atama
          -- onu havuza geri düşürürdü: abonelik o workspace'e bağlı kalır,
          -- kart gelmeye devam eder ama panelde kanal ATANMAMIŞ görünürdü.
          client_id = COALESCE(EXCLUDED.client_id, social_profiles.client_id),
          name = EXCLUDED.name,
          picture_url = EXCLUDED.picture_url,
          updated_at = now()
        RETURNING id::text AS id
      `);
      if (!profil) throw new Error('Kanal profili yazılamadı');

      /*
       * ═══ ABONELİK YALNIZCA ATANMIŞ KANALDA ═══
       *
       * `auto_boost_subscriptions.client_id` NOT NULL ve olması gereken de
       * bu: kart bir workspace'e düşüyor, sahipsiz kart diye bir şey yok.
       * Havuzdaki kanal için hub'a abone olmak, hiçbir yere yazılamayacak
       * bildirimler almak ve her on günde bir onları yenilemek olurdu.
       *
       * Abonelik kanal bir workspace'e ATANDIĞINDA kuruluyor (`kanaliBagla`).
       */
      const belirtec =
        input.clientId === null
          ? null
          : await this.abonelikKur(tx, {
              orgId: ctx.orgId,
              clientId: input.clientId,
              socialProfileId: profil.id,
              channelId: kanal.channelId,
            });

      this.logger.log(
        `YouTube kanalı eklendi: ${kanal.title} (${kanal.channelId})` +
          (input.clientId === null ? ' — havuza' : ''),
      );
      return {
        socialProfileId: profil.id,
        channelId: kanal.channelId,
        title: kanal.title,
        assigned: input.clientId !== null,
        belirtec,
      };
    });

    if (sonucKayit.belirtec) {
      await this.sendSubscribe({
        socialProfileId: sonucKayit.socialProfileId,
        token: sonucKayit.belirtec.token,
        nonce: sonucKayit.belirtec.nonce,
        channelId: sonucKayit.channelId,
        mode: 'subscribe',
      });
    }

    return {
      socialProfileId: sonucKayit.socialProfileId,
      channelId: sonucKayit.channelId,
      title: sonucKayit.title,
      assigned: sonucKayit.assigned,
    };
  }

  /**
   * ABONELİK SATIRI + HUB İSTEĞİ — kanal ekleme ve atama AYNI yoldan geçiyor.
   *
   * İki ayrı yerde yazılsaydı biri belirteci yeniler diğeri yenilemez, biri
   * imza kilidini sıfırlar diğeri taşırdı; ayrıştığı gün ortaya çıkan şey ya
   * hiç bildirim gelmemesi ya da imzasız bildirimin sessizce reddedilmesi
   * olurdu.
   */
  private async abonelikKur(
    tx: Prisma.TransactionClient,
    params: { orgId: string; clientId: string; socialProfileId: string; channelId: string },
  ): Promise<{ token: string; nonce: string }> {
    // Belirteç TÜRETİLİYOR, saklanmıyor.
    const nonce = newTokenNonce();
    const token = deriveCallbackToken({
      masterKey: this.masterKey(),
      socialProfileId: params.socialProfileId,
      nonce,
    });

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO auto_boost_subscriptions (
        id, org_id, client_id, social_profile_id, topic_url,
        token_nonce, callback_token_hash, updated_at
      ) VALUES (
        gen_random_uuid(), ${params.orgId}::uuid, ${params.clientId}::uuid,
        ${params.socialProfileId}::uuid, ${youtubeTopicUrl(params.channelId)},
        ${nonce}, ${hashCallbackToken(token)}, now()
      )
      -- YENİDEN EKLEMEDE BELİRTEÇ YENİLENİYOR ve bu KASITLI: eski adres
      -- ölüyor. Kullanıcı bir kanalı yeniden eklediğinde niyeti genelde
      -- "bozulmuştu, düzelt" oluyor ve sızmış bir belirteç varsa burada
      -- kapanıyor.
      ON CONFLICT (social_profile_id) DO UPDATE SET
        client_id = EXCLUDED.client_id,
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

    /*
     * HUB ÇAĞRISI BURADA DEĞİL — ÇAĞIRAN, TRANSACTION KAPANDIKTAN SONRA
     * YAPIYOR.
     *
     * `withTenant` etkileşimli bir transaction açıyor ve Prisma'nın sınırı 5
     * saniye; hub yavaş cevap verdiğinde transaction ölüyor ve abonelik
     * satırı GERİ ALINIYOR — kanal eklenmiş görünür, abonelik hiç olmazdı.
     */
    return { token, nonce };
  }

  /**
   * KANAL BİR WORKSPACE'E ATANDI — abonelik kurulur ve son videolar çekilir.
   *
   * ═══ ATAMA ÜÇ İŞ BİRDEN ═══
   *
   * Reklam hesabı atamasıyla aynı karar: "ata → aboneliği kur → bekle"
   * üçlüsü kullanıcının angarya dediği şeydi ve ikinci adımı atlamak
   * "atadım ama kart gelmiyor" hâlini üretiyordu.
   *
   *   1. sahiplik   — çağıran yaptı (`assignSocialProfile`)
   *   2. abonelik   — bundan sonraki her yükleme kart olarak düşecek
   *   3. son videolar — panel BUGÜN dolu açılsın diye
   *
   * ÜÇÜNCÜSÜ OLMADAN İLK KART, KANALIN BİR SONRAKİ VİDEOSUNU BEKLİYOR.
   * Haftada bir video yükleyen bir kanalda bu, panelin bir hafta boş durması
   * demek.
   *
   * TOHUMLAMA DÜŞERSE ATAMA GERİ ALINMIYOR: abonelik kuruldu ve bundan
   * sonraki videolar gelecek. Sebep NOTTA dönüyor — sessizce yutmak,
   * kullanıcıya boş bir panel ve hiçbir açıklama bırakırdı.
   */
  async kanaliBagla(
    ctx: TenantContext,
    socialProfileId: string,
    clientId: string,
  ): Promise<{ kartlar: number; note: string }> {
    const belirtec = await this.prisma.withTenant(ctx, async (tx) => {
      const [profil] = await tx.$queryRaw<
        Array<{ external_id: string; profile_type: string; name: string; org_id: string }>
      >(Prisma.sql`
        SELECT external_id, profile_type::text AS profile_type, name,
               org_id::text AS org_id
        FROM social_profiles WHERE id = ${socialProfileId}::uuid
      `);
      if (!profil) throw new BadRequestException('Kanal bulunamadı');
      if (profil.profile_type !== 'youtube_channel') {
        // Çağıranın hatası ve sessizce geçmemeli: Meta sayfası için hub
        // aboneliği kurmak, hiçbir zaman bildirim gelmeyecek bir kayıt
        // üretir ve panel onu "kurulu" gösterirdi.
        throw new BadRequestException('Bu profil bir YouTube kanalı değil.');
      }

      /*
       * ORG PROFİL SATIRINDAN OKUNUYOR, `ctx.orgId`DEN DEĞİL.
       *
       * Atama bu satırın `org_id`'sini HEDEF WORKSPACE'in şirketine çekti
       * (bkz. `musteriOrgId`). "Tüm şirketler" modunda `ctx.orgId` ev şirketi
       * olarak kalıyor ve onu yazmak, abonelik ile kartları o workspace'in
       * şirketinden BAŞKA bir şirkete yazmak olurdu: yabancı anahtar
       * tutuyor (ikisi de ayrı ayrı geçerli) ama RLS o satırları
       * workspace'in kullanıcısına HİÇ göstermezdi — kart gelir, kimse
       * göremez.
       */
      return {
        ...(await this.abonelikKur(tx, {
          orgId: profil.org_id,
          clientId,
          socialProfileId,
          channelId: profil.external_id,
        })),
        channelId: profil.external_id,
        name: profil.name,
        orgId: profil.org_id,
      };
    });

    await this.sendSubscribe({
      socialProfileId,
      token: belirtec.token,
      nonce: belirtec.nonce,
      channelId: belirtec.channelId,
      mode: 'subscribe',
    });

    const sonuc = await this.youtube.listRecentVideos(
      belirtec.channelId,
      ATAMADA_CEKILEN_VIDEO,
    );
    if (sonuc.durum === 'hata') {
      return { kartlar: 0, note: `Bildirimler kuruldu. Son videolar çekilemedi: ${sonuc.message}` };
    }
    if (sonuc.durum === 'bulunamadi') {
      return {
        kartlar: 0,
        note: 'Bildirimler kuruldu. Kanalda henüz yüklenmiş video yok.',
      };
    }

    let kartlar = 0;
    for (const video of sonuc.videolar) {
      const yazildi = await this.kuyruk.enqueueOne({
        orgId: belirtec.orgId,
        clientId,
        socialProfileId,
        platform: 'google',
        externalId: video.id,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        permalink: youtubeWatchUrl(video.id),
        mediaType: 'video',
        publishedAt: video.publishedAt,
        // KURULUM ÇEKİMİ: mail "yeni içerik" diyor ve bu videolar yeni değil.
        bildirim: false,
      });
      if (yazildi) kartlar += 1;
    }

    this.logger.log(`YouTube kanalı atandı: ${belirtec.name} — ${kartlar} kart açıldı.`);
    return {
      kartlar,
      note:
        kartlar > 0
          ? `Bildirimler kuruldu, son ${kartlar} video Akıllı Boost'a düştü.`
          : 'Bildirimler kuruldu. Son videolar zaten listede.',
    };
  }

  /**
   * KANAL WORKSPACE'TEN ÇIKARILDI — abonelik KAPATILIR.
   *
   * Satırı bırakmak, bildirimlerin gelmeye devam etmesi ve kartların ARTIK O
   * KANALA SAHİP OLMAYAN workspace'e düşmesi demekti; `client_id` abonelik
   * satırında ayrıca duruyor ve kimse onu güncellemiyordu.
   *
   * HUB'A DA SÖYLENİYOR: yalnızca satırı silmek, hub'ın on gün daha bize
   * bildirim göndermesi demek. Gelen bildirim artık eşleşmiyor ve sessizce
   * düşüyor — yani zararsız, ama boşa trafik ve teşhiste yanıltıcı bir iz.
   */
  async kanaliCoz(ctx: TenantContext, socialProfileId: string): Promise<void> {
    const kayit = await this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<
        Array<{ token_nonce: string; channel_external_id: string }>
      >(Prisma.sql`
        SELECT s.token_nonce, sp.external_id AS channel_external_id
        FROM auto_boost_subscriptions s
        JOIN social_profiles sp ON sp.id = s.social_profile_id
        WHERE s.social_profile_id = ${socialProfileId}::uuid
      `);
      if (!row) return null;

      await tx.$executeRaw(Prisma.sql`
        DELETE FROM auto_boost_subscriptions
        WHERE social_profile_id = ${socialProfileId}::uuid
      `);
      return row;
    });

    if (!kayit) return;

    await this.sendSubscribe({
      socialProfileId,
      token: deriveCallbackToken({
        masterKey: this.masterKey(),
        socialProfileId,
        nonce: kayit.token_nonce,
      }),
      nonce: kayit.token_nonce,
      channelId: kayit.channel_external_id,
      mode: 'unsubscribe',
    });
  }

  /**
   * SÜRESİ YAKLAŞAN ABONELİKLERİ YENİLER — sessiz ölümün panzehiri.
   *
   * ═══ NEDEN BU İŞ VAR ═══
   *
   * WebSub kiralaması azami ~10 gün ve dolduğunda hub HABER VERMİYOR: ne
   * hata, ne log, ne bildirim. Yenilenmezse video bildirimleri sessizce
   * duruyor ve panelde yalnızca "hiç kart gelmiyor" görünüyor — sebebi
   * YouTube'da, kanalda, izinlerde aranıyor.
   *
   * İKİ KÜME YENİLENİYOR, BİRİ BİLEREK DIŞARIDA:
   *
   *   1. `renew_at` GEÇMİŞ — normal yenileme (sürenin %80'inde).
   *   2. HİÇ DOĞRULANMAMIŞ — kanal eklendi ama hub el sıkışması hiç
   *      tamamlanmadı. Hub o an ulaşılamaz olmuş olabilir.
   *   3. REDDEDİLMİŞ (`denied_reason` dolu) — DENENMİYOR. Hub bir sebeple
   *      reddetti ve aynı isteği tekrarlamak o sebebi değiştirmiyor; insan
   *      müdahalesi gerekiyor ve panel bunu gösteriyor. Sonsuza kadar yeniden
   *      denemek, hub'ı gereksiz meşgul etmenin yanında gerçek sorunu da
   *      gizlerdi.
   *
   * HATA TEK ABONELİĞİ DÜŞÜRÜYOR, TURU DEĞİL. Bir kanalın hub'ı reddetmesi
   * diğerlerinin yenilenmesini engellememeli.
   *
   * WORKER BAĞLAMINDA (`PrismaAdminService`, BYPASSRLS): bu iş zamanlayıcıdan
   * geliyor ve oturumu yok; RLS politikaları eşleşemez ve tarama SIFIR satır
   * bulurdu — yani sessizce hiçbir şey yapmazdı.
   */
  async renewDueSubscriptions(): Promise<{ rows: number; note: string }> {
    const bekleyenler = await this.db.$queryRaw<
      Array<{
        social_profile_id: string;
        token_nonce: string;
        channel_external_id: string;
        verified_at: Date | null;
      }>
    >(Prisma.sql`
      SELECT s.social_profile_id::text AS social_profile_id, s.token_nonce,
             sp.external_id AS channel_external_id, s.verified_at
      FROM auto_boost_subscriptions s
      JOIN social_profiles sp ON sp.id = s.social_profile_id
      WHERE s.denied_reason IS NULL
        AND (
          (s.renew_at IS NOT NULL AND s.renew_at <= now())
          OR
          -- HİÇ DOĞRULANMAMIŞ ama YENİ DEĞİL: kanal eklendikten sonra hub'ın
          -- el sıkışması birkaç saniye sürüyor, o pencerede yeniden istek
          -- göndermek gereksiz. Beş dakika sonra hâlâ doğrulanmamışsa bir şey
          -- ters gitmiş demektir.
          (s.verified_at IS NULL AND s.created_at < now() - interval '5 minutes')
        )
      ORDER BY s.renew_at NULLS FIRST
      LIMIT 100
    `);

    if (bekleyenler.length === 0) {
      return { rows: 0, note: 'yenilenecek abonelik yok' };
    }

    let basarili = 0;
    for (const a of bekleyenler) {
      try {
        const token = deriveCallbackToken({
          masterKey: this.masterKey(),
          socialProfileId: a.social_profile_id,
          nonce: a.token_nonce,
        });
        await this.sendSubscribe({
          socialProfileId: a.social_profile_id,
          token,
          nonce: a.token_nonce,
          channelId: a.channel_external_id,
          mode: 'subscribe',
        });

        /*
         * `renew_at` İLERİ ALINIYOR ama `verified_at` DEĞİL.
         *
         * Abonelik ancak hub'ın doğrulama çağrısıyla gerçekten yenileniyor;
         * burada yalnızca isteği gönderdik. `verified_at`i şimdi yazmak,
         * doğrulama hiç gelmese bile aboneliği sağlıklı göstermek olurdu —
         * ölü adam düğmesini kendi elimizle devre dışı bırakmak.
         *
         * İleri alınmasının sebebi ayrı: aksi hâlde her tur aynı abonelik
         * için yeniden istek gönderilir ve hub gereksiz yere dövülürdü.
         */
        await this.db.$executeRaw(Prisma.sql`
          UPDATE auto_boost_subscriptions
          SET renew_at = now() + interval '1 hour', updated_at = now()
          WHERE social_profile_id = ${a.social_profile_id}::uuid
        `);
        basarili++;
      } catch (err) {
        // TUR DEVAM EDİYOR: bir kanalın sorunu diğerlerini engellememeli.
        this.logger.error(
          `YouTube aboneliği yenilenemedi (profil ${a.social_profile_id}): ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      rows: basarili,
      note: `${bekleyenler.length} abonelik · ${basarili} istek gönderildi`,
    };
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
