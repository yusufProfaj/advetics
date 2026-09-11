import { Injectable, Logger } from '@nestjs/common';
import type { PlatformConnection } from '@prisma/client';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { Platform } from '@advetics/shared';
import { PlatformApiError, type IAdPlatformProvider } from './provider.types';

/**
 * Node `Buffer`'ını Prisma'nın Bytes alanına yazılabilir hâle getirir.
 *
 * Prisma 6 Bytes alanlarını `Uint8Array<ArrayBuffer>` olarak tipliyor.
 * `new Uint8Array(buffer)` taban tipi taşıdığı için `Uint8Array<ArrayBufferLike>`
 * üretir ve atanabilir olmaz. Yeni bir ArrayBuffer ayırıp üzerine kopyalamak
 * doğru daraltmayı verir — `any` cast'i yerine bunu tercih ediyoruz, çünkü cast
 * ileride gerçek bir tip hatasını gizleyebilir.
 */
function toPrismaBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

/**
 * Token kasası — şifreli token'ların TEK giriş kapısı.
 *
 * Sorumlulukları:
 *   1. Şifreleme/çözme (CryptoService, AES-256-GCM + anahtar sürümü)
 *   2. Süresi yaklaşan token'ı çağrı anında yenilemek
 *   3. Token ölürse bağlantıyı `needs_reauth` işaretlemek ve kullanıcıya
 *      görünür kılmak
 *
 * Neden PrismaAdminService: token yenileme arka planda (Modül 3 worker'ları) ve
 * OAuth callback'inde de çalışacak — ikisinde de tenant bağlamı yok. Bu servis
 * hiçbir zaman istek gövdesinden gelen bir id ile çağrılmaz; çağıran katman
 * yetkilendirmeyi zaten yapmış olur.
 */
@Injectable()
export class TokenVaultService {
  private readonly logger = new Logger(TokenVaultService.name);

  /**
   * ═══ YENİLEME EŞİĞİ PLATFORM BAŞINA ═══
   *
   * Tek bir 5 dakikalık eşik vardı ve Google için DOĞRU: token'ı 1 saat
   * yaşıyor, uzun bir senkronizasyonun ortasında dolmasını istemiyoruz.
   *
   * Meta ve LinkedIn'de aynı sayı bir ARIZA üretiyordu. Token'ları 60 GÜN
   * yaşıyor ve uyarı bandı süre dolmadan 7 GÜN önce "yeniden yetkilendir"
   * demeye başlıyor (`TOKEN_UYARI_GUNU`). Sistem ise tazelemeyi son 5
   * DAKİKAYA bırakıyordu. Sonuç: kullanıcı bir hafta boyunca her gün elle
   * yetkilendirmeye çağrılıyordu — hâlbuki yapılacak bir şey yoktu, sistem
   * zaten kendi tazeleyecekti. Kullanıcının cümlesi: *"sürekli şimdi
   * yetkilendir bildirimi gözüküp duruyor … sürekli yetkilendirme yapmak
   * istemiyorum."*
   *
   * Eşik artık uyarı penceresinden GENİŞ (10 gün > 7 gün): tazeleme, uyarı
   * hiç doğmadan önce deneniyor. Uyarı yine de çıkıyorsa GERÇEK bir sorun
   * var demektir — ve o zaman gösterilmesi gerekiyor.
   *
   * `Record<Platform, …>` BİLEREK: elle yazılmış platform listeleri bu
   * depoda üçüncü platformun sessizce kaybolduğu yer (CLAUDE.md). Yeni bir
   * platform eklendiğinde derleme kırılıyor.
   */
  private static readonly YENILEME_ESIGI_MS: Record<Platform, number> = {
    google: 5 * 60 * 1000,
    // 60 günlük token. Meta'nın `fb_exchange_token` çağrısı ZATEN UZUN
    // ÖMÜRLÜ bir token'ı gerçekten uzatıyor mu CANLIDA DOĞRULANMADI; eşik
    // yalnızca denemeyi erkene alıyor. Uzatmıyorsa uyarı yine çıkar ve o
    // zaman doğru bir uyarı olur.
    meta: 10 * 24 * 60 * 60 * 1000,
    // 60 günlük access token (ölçüldü). Refresh token'ın 365 günü İLK
    // yetkilendirmeden işliyor ve UZAMIYOR — yani bu bağlantı bir yıl sonra
    // kesin olarak insan eli istiyor. Eşik onu ertelemiyor, yalnızca
    // aradaki 60 günlük kesintileri kaldırıyor.
    linkedin: 10 * 24 * 60 * 60 * 1000,
  };

  /**
   * Token'ın GERÇEKTEN dolmak üzere olduğu an.
   *
   * Bu eşiğin ALTINDA yenileme başarısızlığı ÖLÜMCÜL (bağlantı
   * `needs_reauth`'a düşüyor); üstünde DEĞİL — elde hâlâ günlerce geçerli
   * bir token varken geçici bir ağ hatası yüzünden bütün senkronizasyonu
   * durdurmak, düzeltmeye çalıştığımız arızadan beterini üretirdi.
   */
  private static readonly SON_AN_MS = 5 * 60 * 1000;

  constructor(
    private readonly crypto: CryptoService,
    private readonly db: PrismaAdminService,
  ) {}

  /**
   * Şifreler ve Prisma'nın Bytes alanına yazılabilir hâlde döner.
   *
   * `Uint8Array` dönüyoruz, `Buffer` değil: Prisma 6 Bytes alanlarını
   * `Uint8Array<ArrayBuffer>` olarak tipliyor ve Node'un `Buffer<ArrayBufferLike>`
   * tipi buna atanabilir değil. Dönüşümü tek yerde yapmak, her çağrı yerinde
   * cast etmekten iyi.
   */
  encrypt(plaintext: string) {
    const buf = this.crypto.encrypt(plaintext);
    return { data: toPrismaBytes(buf), keyVersion: this.crypto.keyVersionOf(buf) };
  }

  /**
   * Kullanıma hazır access token döndürür — gerekirse yenileyerek.
   *
   * Çağıran hiçbir zaman `accessTokenEnc` ile doğrudan uğraşmaz; şifre çözme
   * yalnızca burada olur.
   */
  async getAccessToken(
    connectionId: string,
    provider: IAdPlatformProvider,
  ): Promise<string> {
    const conn = await this.db.platformConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });

    if (conn.status === 'revoked') {
      throw new PlatformApiError(
        provider.platform,
        'invalid_token',
        'Bu bağlantı kaldırılmış — yeniden bağlanmak gerekiyor',
      );
    }

    const kalanMs =
      conn.tokenExpiresAt === null ? null : conn.tokenExpiresAt.getTime() - Date.now();
    const esik = TokenVaultService.YENILEME_ESIGI_MS[provider.platform];
    const needsRefresh = kalanMs !== null && kalanMs < esik;

    if (!needsRefresh && conn.status === 'active') {
      return this.crypto.decrypt(Buffer.from(conn.accessTokenEnc));
    }

    /*
     * ELDE HÂLÂ GEÇERLİ BİR TOKEN VARSA YENİLEME ÖLÜMCÜL DEĞİL.
     *
     * Eşik 5 dakikadan 10 güne çıkınca yeni bir risk doğdu: on gün önce
     * yaşanan GEÇİCİ bir yenileme hatası (ağ, platform kesintisi) bağlantıyı
     * `needs_reauth`'a düşürüp BÜTÜN senkronizasyonu durdururdu — oysa
     * mevcut token günlerce daha çalışacaktı. Bu, düzeltmeye çalıştığımız
     * arızadan beteri olurdu.
     *
     * O yüzden: token gerçekten son ana yaklaşmadıysa ve bağlantı hâlâ
     * `active` ise, başarısız yenileme YUTULMUYOR ama ÖLDÜRMÜYOR da —
     * `recordFailure` sayacı ve hata kodunu yazıyor (teşhis ekranında
     * görünüyor), iş mevcut token'la sürüyor ve bir sonraki çağrı yeniden
     * deniyor.
     */
    const sonAnda =
      kalanMs === null || kalanMs < TokenVaultService.SON_AN_MS || conn.status !== 'active';
    if (sonAnda) return this.refresh(conn, provider);

    try {
      return await this.refresh(conn, provider);
    } catch {
      this.logger.warn(
        `Erken token yenilemesi başarısız (${provider.platform} bağlantı ${conn.id}). ` +
          `Mevcut token ${Math.floor(kalanMs / 86_400_000)} gün daha geçerli; iş sürüyor.`,
      );
      return this.crypto.decrypt(Buffer.from(conn.accessTokenEnc));
    }
  }

  /**
   * Token'ı yeniler ve saklar.
   *
   * Yenileme başarısız olursa bağlantı `needs_reauth` olur. Bu tek yönlü bir
   * kapı: kullanıcı OAuth akışını tekrar tamamlayana kadar hiçbir senkronizasyon
   * veya kural aksiyonu bu bağlantıyı kullanamaz. Sessizce yeniden denemek,
   * platformun kilitlenmesine yol açar.
   */
  private async refresh(
    conn: PlatformConnection,
    provider: IAdPlatformProvider,
  ): Promise<string> {
    const accessToken = this.crypto.decrypt(Buffer.from(conn.accessTokenEnc));
    const refreshToken = conn.refreshTokenEnc
      ? this.crypto.decrypt(Buffer.from(conn.refreshTokenEnc))
      : undefined;

    try {
      const fresh = await provider.refreshTokens({ accessToken, refreshToken });

      const enc = this.encrypt(fresh.accessToken);
      const refreshEnc = fresh.refreshToken ? this.encrypt(fresh.refreshToken) : null;

      await this.db.platformConnection.update({
        where: { id: conn.id },
        data: {
          accessTokenEnc: enc.data,
          keyVersion: enc.keyVersion,
          ...(refreshEnc ? { refreshTokenEnc: refreshEnc.data } : {}),
          tokenExpiresAt: fresh.expiresAt ?? null,
          grantedScopes: fresh.grantedScopes,
          status: 'active',
          failureCount: 0,
          lastErrorCode: null,
          lastErrorAt: null,
          lastVerifiedAt: new Date(),
        },
      });

      this.logger.log(`Token yenilendi: ${provider.platform} bağlantı ${conn.id}`);
      return fresh.accessToken;
    } catch (err) {
      await this.recordFailure(conn.id, err);
      throw err;
    }
  }

  /**
   * Hata kaydeder ve gerekirse bağlantıyı devre dışı bırakır.
   *
   * `invalid_token` → hemen `needs_reauth`. Yeniden denemenin faydası yok.
   * Diğer hatalar → sayaç artar; 5 ardışık hatada `error` durumuna geçer
   * (Modül 3'teki circuit breaker bunu okuyup o bağlantının işlerini duraklatır).
   */
  async recordFailure(connectionId: string, err: unknown): Promise<void> {
    const isAuthFailure = err instanceof PlatformApiError && err.kind === 'invalid_token';
    const code =
      err instanceof PlatformApiError
        ? String(err.detail?.platformCode ?? err.kind)
        : 'unknown';

    const conn = await this.db.platformConnection.findUnique({
      where: { id: connectionId },
      select: { failureCount: true },
    });
    const nextCount = (conn?.failureCount ?? 0) + 1;

    await this.db.platformConnection.update({
      where: { id: connectionId },
      data: {
        status: isAuthFailure ? 'needs_reauth' : nextCount >= 5 ? 'error' : undefined,
        failureCount: nextCount,
        lastErrorCode: code.slice(0, 80),
        lastErrorAt: new Date(),
      },
    });

    if (isAuthFailure) {
      this.logger.error(
        `Bağlantı ${connectionId} yeniden yetkilendirme gerektiriyor (kod ${code}). ` +
          'Tüm senkronizasyon ve kural aksiyonları bu bağlantı için durdu.',
      );
    }
  }

  /**
   * Token'ı platform tarafında iptal eder.
   *
   * Bu metod kasada duruyor çünkü şifre çözme yalnızca burada olur — sınıfın
   * belgelenmiş değişmezi bu. Çağıranın şifreli byte'larla uğraşması gerekmiyor.
   *
   * Hata FIRLATMAZ: iptal en iyi çabadır. Token zaten geçersiz olabilir ya da
   * platform erişilemez olabilir; bir platform kesintisi yüzünden kullanıcının
   * bağlantısını kaldıramaması kabul edilemez.
   */
  async revokeOnPlatform(
    connectionId: string,
    provider: IAdPlatformProvider,
  ): Promise<{ revoked: boolean; reason?: string }> {
    try {
      const conn = await this.db.platformConnection.findUnique({
        where: { id: connectionId },
        select: { status: true, accessTokenEnc: true, refreshTokenEnc: true },
      });

      if (!conn || conn.status === 'revoked') {
        return { revoked: false, reason: 'bağlantı zaten iptal edilmiş' };
      }

      const accessBuf = Buffer.from(conn.accessTokenEnc);
      if (accessBuf.length === 0) {
        return { revoked: false, reason: 'saklanan token boş' };
      }

      await provider.revokeToken({
        accessToken: this.crypto.decrypt(accessBuf),
        refreshToken: conn.refreshTokenEnc
          ? this.crypto.decrypt(Buffer.from(conn.refreshTokenEnc))
          : undefined,
      });

      this.logger.log(`${provider.platform} token'ı platform tarafında iptal edildi`);
      return { revoked: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Platform tarafında iptal başarısız (bağlantı yine kaldırılıyor): ${reason}`);
      return { revoked: false, reason };
    }
  }

  async recordSuccess(connectionId: string): Promise<void> {
    await this.db.platformConnection.update({
      where: { id: connectionId },
      data: { failureCount: 0, lastErrorCode: null, lastVerifiedAt: new Date() },
    });
  }

  /**
   * Anahtar rotasyonu sonrası eski anahtarla şifrelenmiş token'ları yeniden
   * şifreler. `ENCRYPTION_ACTIVE_KEY_VERSION` artırıldıktan sonra çalıştırılır.
   *
   * Eski anahtar env'den KALDIRILMADAN önce bu tamamlanmalı — aksi halde o
   * anahtarla şifrelenmiş tüm token'lar kalıcı olarak okunamaz hale gelir.
   */
  async rotateEncryption(): Promise<{ examined: number; rotated: number }> {
    const connections = await this.db.platformConnection.findMany({
      where: { status: { not: 'revoked' } },
      select: { id: true, accessTokenEnc: true, refreshTokenEnc: true },
    });

    let rotated = 0;
    for (const c of connections) {
      const accessBuf = Buffer.from(c.accessTokenEnc);
      if (!this.crypto.needsRotation(accessBuf)) continue;

      const access = this.encrypt(this.crypto.decrypt(accessBuf));
      const refresh = c.refreshTokenEnc
        ? this.encrypt(this.crypto.decrypt(Buffer.from(c.refreshTokenEnc)))
        : null;

      await this.db.platformConnection.update({
        where: { id: c.id },
        data: {
          accessTokenEnc: access.data,
          keyVersion: access.keyVersion,
          ...(refresh ? { refreshTokenEnc: refresh.data } : {}),
        },
      });
      rotated++;
    }

    this.logger.log(`Şifreleme rotasyonu: ${connections.length} incelendi, ${rotated} güncellendi`);
    return { examined: connections.length, rotated };
  }
}
