import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';

/**
 * Meta'nın sunucudan sunucuya çağrıları: deauthorize ve veri silme.
 *
 * Bu uç noktalar kimlik doğrulaması OLMADAN çağrılır — Meta'nın bizim
 * oturumumuz yok. Kimlik doğrulama `signed_request` gövdesindeki HMAC ile
 * yapılır: imza app secret ile üretilir, dolayısıyla yalnızca Meta üretebilir.
 *
 * İmzayı doğrulamamak, herhangi birinin `user_id` uydurup başkasının
 * bağlantısını sildirmesine izin verirdi.
 */
export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  expires?: number;
}

@Injectable()
export class MetaWebhookService {
  private readonly logger = new Logger(MetaWebhookService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `signed_request` doğrular ve gövdesini döndürür.
   *
   * Format: `<base64url imza>.<base64url json>`
   * İmza = HMAC-SHA256(base64url_json, app_secret)
   *
   * İmza karşılaştırması SABİT SÜREDE yapılır. `===` ile karşılaştırmak,
   * saldırganın byte byte doğru imzayı bulmasına imkân veren bir zamanlama
   * kanalı açar.
   */
  verifySignedRequest(signedRequest: string): SignedRequestPayload {
    const secret = this.config.platforms.meta.appSecret;
    if (!secret) {
      throw new UnauthorizedException('Meta app secret yapılandırılmamış');
    }

    const parts = signedRequest.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('signed_request biçimi geçersiz');
    }

    const [encodedSig, encodedPayload] = parts as [string, string];

    const expected = createHmac('sha256', secret).update(encodedPayload).digest();
    const received = Buffer.from(encodedSig, 'base64url');

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      this.logger.error('signed_request imzası doğrulanamadı — istek reddedildi');
      throw new UnauthorizedException('signed_request imzası geçersiz');
    }

    let payload: SignedRequestPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('signed_request gövdesi okunamadı');
    }

    if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') {
      throw new UnauthorizedException(`Beklenmeyen imza algoritması: ${payload.algorithm}`);
    }
    if (!payload.user_id) {
      throw new UnauthorizedException('signed_request içinde user_id yok');
    }

    return payload;
  }

  /**
   * Kullanıcı Facebook tarafından uygulamayı kaldırdı.
   *
   * Token'lar artık geçersiz. Bağlantıyı `revoked` işaretliyoruz ve şifreli
   * token'ları SİLİYORUZ — elimizde tutmanın hiçbir faydası yok, yalnızca
   * gereksiz risk. Reklam verisi korunuyor: müşterinin raporlama geçmişi
   * bir iznin kaldırılmasıyla yok olmamalı.
   */
  async handleDeauthorize(
    externalUserId: string,
    meta: { ip?: string | null },
  ): Promise<{ revoked: number }> {
    const connections = await this.db.platformConnection.findMany({
      where: { platform: 'meta', externalUserId, status: { not: 'revoked' } },
      select: { id: true, clientId: true, client: { select: { orgId: true } } },
    });

    if (connections.length === 0) {
      // Bilinmeyen kullanıcı da olabilir; hata değil. Meta yeniden denemesin.
      this.logger.warn(`Deauthorize: eşleşen bağlantı yok (meta user ${externalUserId})`);
      return { revoked: 0 };
    }

    for (const conn of connections) {
      await this.db.platformConnection.update({
        where: { id: conn.id },
        data: {
          status: 'revoked',
          revokedAt: new Date(),
          // Sıfır uzunluklu buffer: kolon NOT NULL olduğu için null yazamıyoruz,
          // ama içeriği tamamen boşaltıyoruz.
          accessTokenEnc: Buffer.alloc(0),
          refreshTokenEnc: null,
          grantedScopes: [],
          lastErrorCode: 'deauthorized_by_user',
          lastErrorAt: new Date(),
        },
      });

      await this.audit.recordUnauthenticated(conn.client.orgId, {
        action: 'connection.deauthorized_by_platform',
        targetType: 'platform_connection',
        targetId: conn.id,
        clientId: conn.clientId,
        actorLabel: 'Meta deauthorize webhook',
        after: { platform: 'meta', externalUserId },
        ip: meta.ip ?? null,
      });
    }

    this.logger.log(`Deauthorize: ${connections.length} bağlantı iptal edildi`);
    return { revoked: connections.length };
  }

  /**
   * Kullanıcı verilerinin silinmesini talep etti.
   *
   * Meta bu uç noktadan bir onay kodu ve durum sayfası adresi bekliyor.
   * Silme İŞLEMİ burada senkron yapılıyor: bağlantı ve ona bağlı reklam
   * hesapları/sosyal profiller kaldırılıyor (Prisma cascade).
   *
   * Denetim kayıtları KORUNUYOR ve kimliksizleştirilmiş kalıyor — bütçe
   * değiştiren otomatik aksiyonların hesap verebilirliği için gerekli ve
   * içlerinde kişisel veri yok. Bu, gizlilik politikasında açıkça beyan edildi.
   */
  async handleDataDeletion(
    externalUserId: string,
    meta: { ip?: string | null },
  ): Promise<{ confirmationCode: string; statusUrl: string }> {
    const confirmationCode = randomBytes(16).toString('hex');

    const request = await this.db.dataDeletionRequest.create({
      data: {
        platform: 'meta',
        externalUserId,
        confirmationCode,
        status: 'received',
        ip: meta.ip ?? null,
      },
    });

    try {
      const connections = await this.db.platformConnection.findMany({
        where: { platform: 'meta', externalUserId },
        select: { id: true, clientId: true, client: { select: { orgId: true } } },
      });

      const clientIds = [...new Set(connections.map((c) => c.clientId))];
      const orgIds = [...new Set(connections.map((c) => c.client.orgId))];

      // Cascade: ad_accounts ve social_profiles bağlantıyla birlikte gider.
      await this.db.platformConnection.deleteMany({
        where: { platform: 'meta', externalUserId },
      });

      await this.db.dataDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          deletedConnections: connections.length,
          affectedClientIds: clientIds,
        },
      });

      for (const orgId of orgIds) {
        await this.audit.recordUnauthenticated(orgId, {
          action: 'connection.data_deleted_by_request',
          targetType: 'platform',
          targetId: 'meta',
          actorLabel: 'Meta veri silme webhook',
          after: { externalUserId, deletedConnections: connections.length, confirmationCode },
          ip: meta.ip ?? null,
        });
      }

      this.logger.log(
        `Veri silme tamamlandı: ${connections.length} bağlantı silindi (kod ${confirmationCode})`,
      );
    } catch (err) {
      // Talebi `failed` işaretleyip Meta'ya yine kod dönüyoruz: Meta'nın
      // beklediği yanıt biçimi bu ve kullanıcı durumu sayfadan görebilmeli.
      await this.db.dataDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'failed',
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });
      this.logger.error(`Veri silme başarısız (kod ${confirmationCode})`, err as Error);
    }

    const base = this.config.platforms.oauthRedirectBaseUrl ?? '';
    return {
      confirmationCode,
      statusUrl: `${base}/veri-silme?talep=${confirmationCode}`,
    };
  }

  /** Herkese açık durum sorgusu — kullanıcı Meta'dan gelen kodla kontrol eder. */
  async getDeletionStatus(confirmationCode: string) {
    const req = await this.db.dataDeletionRequest.findUnique({
      where: { confirmationCode },
      select: {
        confirmationCode: true,
        platform: true,
        status: true,
        deletedConnections: true,
        requestedAt: true,
        completedAt: true,
      },
    });
    return req;
  }
}
