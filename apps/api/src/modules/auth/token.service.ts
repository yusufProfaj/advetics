import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IKI_ADIM_BEKLEME_DK } from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { CONFIG, type AppConfig } from '../../config/configuration';

export interface AccessTokenPayload {
  sub: string; // userId
  org: string; // orgId
  typ: 'access';
}

/**
 * ═══ İKİ ADIM ARA TOKEN'I ═══
 *
 * Parola doğru, ikinci adım bekleniyor. Bu token bir OTURUM DEĞİL: tek işi
 * "bu kişi parolayı az önce doğru girdi" demek. `typ: 'mfa'` taşıyor ve
 * `verifyAccessToken` yalnızca `typ: 'access'` kabul ettiği için hiçbir
 * korumalı uç onu tanımıyor — erişim token'ıyla AYNI anahtarla imzalanması
 * bu yüzden güvenli, ayırıcı imza değil TÜR. Tersi de kapalı:
 * `verifyIkiAdimToken` erişim token'ını reddediyor (bir oturum, ikinci adımı
 * atlamak için ara token yerine sunulamaz).
 *
 *   · `amac: 'dogrula'` — 2FA açık, kod girilecek.
 *   · `amac: 'kurulum'` — şirket zorunlu tutuyor, kullanıcı 2FA'yı girişte kuracak.
 */
export interface IkiAdimTokenPayload {
  sub: string;
  org: string;
  typ: 'mfa';
  amac: 'dogrula' | 'kurulum';
  /** "Beni hatırla" — oturum ikinci adımdan sonra açıldığı için taşınmak zorunda. */
  hatirla: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  /**
   * Oturum KALICI mı ("beni hatırla" işaretliydi mi).
   *
   * TOKEN'IN YANINDA TAŞINIYOR, ayrı bir parametre olarak DEĞİL. `setAuthCookies`
   * bunu buradan okuyor; ayrı geçirilseydi `register`, `login` ve `refresh`
   * yollarından birinin onu geçirmeyi unutması hiçbir derleme hatası
   * üretmeden mümkün olurdu ve o yol sessizce yanlış ömürlü cookie yazardı.
   */
  persistent: boolean;
}

interface TokenMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** '15m' | '30d' | '12h' | '900s' → milisaniye */
export function parseTtl(ttl: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(ttl.trim());
  if (!match) throw new Error(`Geçersiz TTL formatı: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * (factors[unit as string] ?? 0);
}

/**
 * Döndürülmüş bir token'ın tekrar sunulmasının "aynı tarayıcıdan eşzamanlı
 * istek" sayıldığı süre.
 *
 * KISA OLMAK ZORUNDA: bu pencere içinde çalıntı bir token da yeni bir çift
 * alabilir. 30 saniye, yarışan iki isteğin (ve yanıtı kaybolup hemen yeniden
 * denenen isteğin) arasındaki gerçek mesafeden çok büyük; pencere dışında
 * davranış eskisiyle aynı — bütün aile iptal.
 */
export const YENIDEN_KULLANIM_TOLERANSI_MS = 30_000;

/**
 * Tolerans kararı — saf fonksiyon, üç koşulun ÜÇÜ de şart:
 *
 *  1. İptal sebebi `rotated`. Çıkışla, şifre değişimiyle ya da hırsızlık
 *     tespitiyle kapatılmış bir token'a tolerans yok.
 *  2. Döndürme `YENIDEN_KULLANIM_TOLERANSI_MS` içinde.
 *  3. İstek, token'ı ALAN tarayıcıyla aynı User-Agent'ı taşıyor. Taklit
 *     edilebilir, ama çalıntı token'ı başka bir makineden deneyen
 *     saldırganın işini en azından tahmine bırakıyor. Tarayıcı sürüm
 *     güncellemesiyle UA değişirse tolerans uygulanmıyor ve davranış
 *     eskisine düşüyor — yanlış yönde değil, güvenli yönde hata.
 */
export function yenidenKullanimToleransli(
  satir: { revokedAt: Date; revokedReason: string | null; userAgent: string | null },
  istekUserAgent: string | null,
  simdi: number,
): boolean {
  if (satir.revokedReason !== 'rotated') return false;
  const gecen = simdi - satir.revokedAt.getTime();
  if (gecen < 0 || gecen > YENIDEN_KULLANIM_TOLERANSI_MS) return false;
  return (satir.userAgent ?? null) === (istekUserAgent?.slice(0, 512) ?? null);
}

/**
 * Şirket 2FA'yı zorunlu tutuyor ve kullanıcı kurmamış mı.
 *
 * Alanlar OPSİYONEL okunuyor: eski çağıranlar (ve testlerdeki sahte
 * satırlar) onları taşımıyor; eksik alan "zorunlu değil" sayılıyor. Ters
 * yön (eksikse zorunlu say) bir select'i unutan her yolda bütün
 * kullanıcıları dışarı atardı.
 */
export function ikiAdimZorunluIhlali(user: {
  mfaEnabled?: boolean;
  organization?: { ikiAdimZorunlu?: boolean } | null;
}): boolean {
  return user.organization?.ikiAdimZorunlu === true && user.mfaEnabled !== true;
}

/**
 * Token üretimi, doğrulaması ve rotasyonu.
 *
 * Tasarım:
 *   - Access token kısa ömürlü JWT'dir (varsayılan 15 dk). Stateless doğrulanır.
 *   - Refresh token opak rastgele bir dizedir; veritabanında yalnızca SHA-256
 *     hash'i tutulur. DB sızsa bile token'lar kullanılamaz.
 *   - Her refresh kullanımı token'ı DÖNDÜRÜR (rotation) ve eskisini iptal eder.
 *   - Kullanılmış bir token tekrar sunulursa (reuse) bu bir hırsızlık sinyalidir:
 *     tüm token AİLESİ iptal edilir, kullanıcı her yerden düşer — yeni
 *     döndürülmüş token'ın kısa tolerans içindeki tekrarı hariç (`rotate`).
 *
 * Bu servis PrismaAdminService kullanır çünkü token doğrulaması kimlik
 * doğrulamadan ÖNCE gerçekleşir — henüz RLS bağlamı yoktur.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly db: PrismaAdminService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async signAccessToken(userId: string, orgId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId, org: orgId, typ: 'access' };
    return this.jwt.signAsync({ ...payload }, {
      secret: this.config.jwt.accessSecret,
      // jsonwebtoken'ın tipleri '15m' gibi şablon literal bekliyor; bizim
      // değerimiz ortamdan gelen düz string. Format zaten parseTtl ile
      // doğrulanıyor, bu yüzden daraltma güvenli.
      expiresIn: this.config.jwt.accessTtl as JwtSignOptions['expiresIn'],
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
      if (payload.typ !== 'access') throw new Error('wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Oturum geçersiz veya süresi dolmuş');
    }
  }

  /** Ara token'ı imzalar. Ömür `IKI_ADIM_BEKLEME_DK`; çerez ömrüyle aynı. */
  async signIkiAdimToken(
    userId: string,
    orgId: string,
    amac: IkiAdimTokenPayload['amac'],
    hatirla: boolean,
  ): Promise<string> {
    const payload: IkiAdimTokenPayload = { sub: userId, org: orgId, typ: 'mfa', amac, hatirla };
    return this.jwt.signAsync({ ...payload }, {
      secret: this.config.jwt.accessSecret,
      expiresIn: `${IKI_ADIM_BEKLEME_DK}m` as JwtSignOptions['expiresIn'],
    });
  }

  /**
   * Ara token'ı doğrular. `beklenenAmac` ŞART: kurulum için verilmiş bir
   * token kod doğrulama ucuna (ya da tersi) sunulamamalı — kurulum ucu
   * 2FA'sı açık bir hesapta anahtar üretmeye kalkardı.
   */
  async verifyIkiAdimToken(
    token: string,
    beklenenAmac: IkiAdimTokenPayload['amac'],
  ): Promise<IkiAdimTokenPayload> {
    try {
      const p = await this.jwt.verifyAsync<IkiAdimTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
      if (p.typ !== 'mfa' || p.amac !== beklenenAmac) throw new Error('wrong token type');
      return p;
    } catch {
      throw new UnauthorizedException(
        'Doğrulama adımının süresi doldu. E-posta ve şifrenle yeniden giriş yap.',
      );
    }
  }

  /**
   * Yeni bir oturum başlatır (login / register / davet kabul).
   *
   * `persistent = false` → "beni hatırla" işaretsiz: cookie'ler oturum
   * cookie'si olarak yazılıyor ve tarayıcı kapanınca ölüyorlar.
   *
   * VERİTABANI ÖMRÜ KISALTILMIYOR ve bu bilinçli: token'a ulaşılabilirliği
   * cookie belirliyor, cookie gidince satır zaten erişilemez oluyor. İkinci
   * ve daha kısa bir son kullanma tarihi, tarayıcısını açık tutan kullanıcıyı
   * çalışmanın ortasında dışarı atardı — kimsenin istemediği bir sürpriz.
   */
  async issueSession(
    userId: string,
    orgId: string,
    meta: TokenMeta = {},
    persistent = true,
  ): Promise<IssuedTokens> {
    const familyId = randomUUID();
    return this.issueTokens(userId, orgId, familyId, meta, persistent);
  }

  private async issueTokens(
    userId: string,
    orgId: string,
    familyId: string,
    meta: TokenMeta,
    persistent: boolean,
    replacesTokenId?: string,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + parseTtl(this.config.jwt.refreshTtl));

    const created = await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
        persistent,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      },
      select: { id: true },
    });

    if (replacesTokenId) {
      await this.db.refreshToken.update({
        where: { id: replacesTokenId },
        data: { replacedById: created.id },
      });
    }

    const accessToken = await this.signAccessToken(userId, orgId);
    return { accessToken, refreshToken, refreshExpiresAt, persistent };
  }

  /**
   * Refresh token'ı döndürür.
   *
   * Reuse detection: sunulan token daha önce iptal edilmişse, aynı aileye ait
   * TÜM token'lar iptal edilir. Meşru kullanıcı bir kez yeniden giriş yapar;
   * saldırganın çaldığı token ise kalıcı olarak ölür.
   *
   * İSTİSNA: YENİ DÖNDÜRÜLMÜŞ TOKEN'IN TEKRARI (`yenidenKullanimToleransli`).
   * 2026-10-09'da üretimde birden çok sekmeyle çalışan kullanıcı "olası
   * hırsızlık" kaydıyla her yerden düştü. Aynı tarayıcının iki isteği aynı
   * çerezi taşıyor; biri döndürünce diğeri artık iptal olmuş token'ı sunuyor.
   * Panel kilidi (`oturum-tazeleyici.tsx`) bunu tek origin içinde önlüyor ama
   * kilidin göremediği yollar var: yanıtı yolda kaybolan istek (sekme
   * kapanırken/yenilenirken sunucu döndürmüş, çerez hiç yazılmamış), farklı
   * origin'den açılmış sekme (çerez alan adında ortak, kilit ve
   * `localStorage` origin başına), Web Locks'suz tarayıcı. Hepsinde sonuç
   * aynıydı: meşru kullanıcının bütün oturumları kapatılıyordu.
   */
  async rotate(presentedToken: string, meta: TokenMeta = {}): Promise<IssuedTokens> {
    const tokenHash = this.hash(presentedToken);

    const existing = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            orgId: true,
            status: true,
            mfaEnabled: true,
            organization: { select: { ikiAdimZorunlu: true } },
          },
        },
      },
    });

    if (!existing) {
      throw new UnauthorizedException('Oturum bulunamadı, lütfen tekrar giriş yapın');
    }

    if (existing.revokedAt) {
      return this.iptalliTokenSunuldu({ ...existing, revokedAt: existing.revokedAt }, meta);
    }

    this.gecerlilikKontrol(existing);
    if (existing.user.status !== 'active') {
      await this.revokeAllForUser(existing.userId, 'user_disabled');
      throw new UnauthorizedException('Hesabınız devre dışı bırakılmış');
    }
    /*
     * ŞİRKET 2FA'YI ZORUNLU YAPTIYSA, KURMAMIŞ KULLANICININ OTURUMU YENİLENMİYOR.
     *
     * Zorunluluk yalnızca girişte uygulansaydı, ayar açıldığı anda açık olan
     * bütün oturumlar 30 gün daha 2FA'sız yaşardı: "beni hatırla" işaretli
     * kullanıcı hiç giriş yapmadığı için zorunluluğu hiç görmezdi ve
     * yönetici ayarın işlediğini sanırdı. Rotasyon en geç erişim token'ının
     * ömründe (15 dk) bir kez geçiliyor; reddedilen kullanıcı girişe düşüyor
     * ve giriş onu kuruluma alıyor. Aile `iki_adim_zorunlu` sebebiyle
     * kapatılıyor; "olası hırsızlık" değil.
     */
    await this.zorunlulukDenetle(existing);

    /*
     * İPTAL KOŞULLU VE ATOMİK. Eskiden okuma ile iptal ayrı adımdı ve
     * `update` koşulsuzdu: aynı anda gelen iki istek ikisi de "iptal
     * edilmemiş" görüp ikisi de döndürüyordu — aile ÇATALLANIYORDU ve
     * ikinci iptal birincinin damgasını eziyordu. `revokedAt: null` koşulu
     * yarışı veritabanına bırakıyor: yalnızca biri satırı etkiler, diğeri
     * sıfır satır görür ve tekrar kullanım yoluna düşer.
     */
    const { count } = await this.db.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });
    if (count === 0) {
      const guncel = await this.db.refreshToken.findUnique({
        where: { id: existing.id },
        select: { revokedAt: true, revokedReason: true },
      });
      return this.iptalliTokenSunuldu(
        { ...existing, revokedAt: guncel?.revokedAt ?? new Date(0), revokedReason: guncel?.revokedReason ?? null },
        meta,
      );
    }

    return this.issueTokens(
      existing.user.id,
      existing.user.orgId,
      existing.familyId,
      meta,
      /*
       * KALICILIK ROTASYONDA TAŞINIYOR. Burada sabit `true` yazmak (ya da
       * varsayılana bırakmak) "beni hatırla" işaretsiz açılmış bir oturumu
       * İLK yenilemede kalıcıya çevirirdi ve access token 15 dakikada bir
       * yenilendiği için bu, pratikte özelliğin hiç çalışmaması demek.
       */
      existing.persistent,
      existing.id,
    );
  }

  /**
   * Zorunluluk ihlalinde aileyi kapatır ve fırlatır. TEK YER: hem normal
   * rotasyon hem 30 saniyelik tolerans yolu yeni token veriyor ve ikisi de
   * buradan geçiyor; ikinci bir kopya bir gün ayrışırdı.
   */
  private async zorunlulukDenetle(existing: {
    familyId: string;
    user: { mfaEnabled?: boolean; organization?: { ikiAdimZorunlu?: boolean } | null };
  }): Promise<void> {
    if (ikiAdimZorunluIhlali(existing.user)) {
      await this.revokeFamily(existing.familyId, 'iki_adim_zorunlu');
      throw new UnauthorizedException(
        'Şirketin iki adımlı doğrulamayı zorunlu yaptı. Yeniden giriş yapıp kurulumu tamamla.',
      );
    }
  }

  private gecerlilikKontrol(satir: { expiresAt: Date }): void {
    if (satir.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Oturum süresi doldu, lütfen tekrar giriş yapın');
    }
  }

  /**
   * İptal edilmiş bir token sunuldu: ya aynı tarayıcının yarışan ikinci
   * isteği ya da gerçek bir yeniden kullanım.
   *
   * Tolerans içindeyse aynı aileden YENİ bir token veriliyor — eski çifti
   * tekrar vermek mümkün değil, veritabanında yalnızca hash duruyor. Kazanan
   * isteğin ürettiği token İPTAL EDİLMİYOR: iki yanıt aynı çerez kavanozuna
   * yazıyor ve hangisinin son kalacağı belli değil; kazananınkini iptal
   * etmek, kavanozda o kalırsa bir sonraki yenilemede aileyi öldürürdü.
   */
  private async iptalliTokenSunuldu(
    existing: {
      id: string;
      userId: string;
      familyId: string;
      persistent: boolean;
      expiresAt: Date;
      revokedAt: Date;
      revokedReason: string | null;
      userAgent: string | null;
      user: {
        id: string;
        orgId: string;
        status: string;
        mfaEnabled?: boolean;
        organization?: { ikiAdimZorunlu?: boolean } | null;
      };
    },
    meta: TokenMeta,
  ): Promise<IssuedTokens> {
    const aileOlduMu = await this.aileOlduMu(existing.familyId);
    if (
      !aileOlduMu &&
      existing.user.status === 'active' &&
      existing.expiresAt.getTime() > Date.now() &&
      yenidenKullanimToleransli(existing, meta.userAgent ?? null, Date.now())
    ) {
      this.logger.warn(
        `Yeni döndürülmüş refresh token tolerans içinde tekrar sunuldu (eşzamanlı istek). userId=${existing.userId} family=${existing.familyId}`,
      );
      // TOLERANS DA YENİ TOKEN VERİYOR — zorunluluk burada da denetleniyor
      // (N-1). Atlanırsa 30 saniyelik pencere, zorunluluğa takılan bir
      // oturumun yenilenmesinin arka kapısı olurdu.
      await this.zorunlulukDenetle(existing);
      return this.issueTokens(
        existing.user.id,
        existing.user.orgId,
        existing.familyId,
        meta,
        existing.persistent,
      );
    }

    this.logger.error(
      `Refresh token yeniden kullanıldı (olası hırsızlık). userId=${existing.userId} family=${existing.familyId}`,
    );
    await this.revokeFamily(existing.familyId, 'reuse_detected');
    throw new UnauthorizedException(
      'Güvenlik nedeniyle tüm oturumlar sonlandırıldı. Lütfen tekrar giriş yapın.',
    );
  }

  /**
   * Aile BİLEREK kapatılmış mı: çıkış, tüm cihazlardan çıkış, şifre
   * değişimi, hesap kapatma ya da daha önce yakalanmış bir hırsızlık.
   *
   * Bu kontrol olmadan tolerans bir arka kapı olurdu: kullanıcı şifresini
   * değiştirdikten sonraki 30 saniye içinde, ondan hemen önce döndürülmüş
   * çalıntı token yeni bir oturum açabilirdi. Ölçüt "döndürme DIŞINDA bir
   * sebeple iptal edilmiş satır var mı" — canlı satır saymak yetmiyor, çünkü
   * yarışın kazananı yeni satırı henüz yazmamış olabilir.
   */
  private async aileOlduMu(familyId: string): Promise<boolean> {
    const n = await this.db.refreshToken.count({
      where: {
        familyId,
        revokedAt: { not: null },
        NOT: { revokedReason: 'rotated' },
      },
    });
    return n > 0;
  }

  async revokeByToken(presentedToken: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { tokenHash: this.hash(presentedToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Bu tarayıcının oturumu DIŞINDAKİ bütün oturumları kapatır.
   *
   * 2FA açılınca kullanılıyor: parolası çalınmış bir hesapta saldırganın
   * açık oturumu, 2FA açıldıktan sonra da yaşamaya devam ederdi — kullanıcı
   * korunduğunu sanırdı. Kendi oturumu AİLEYLE korunuyor (çerezdeki token
   * bir sonraki rotasyonda aynı aileden yenisini alıyor); aile bulunamazsa
   * (çerez yok) hiçbir şey İSTİSNA tutulmuyor ve hepsi kapanıyor — güvenli yön.
   */
  async revokeOthersForUser(userId: string, presentedToken: string | undefined, reason: string): Promise<void> {
    const kendi = presentedToken
      ? await this.db.refreshToken.findUnique({
          where: { tokenHash: this.hash(presentedToken) },
          select: { familyId: true, userId: true },
        })
      : null;
    const haric = kendi && kendi.userId === userId ? kendi.familyId : null;
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(haric ? { NOT: { familyId: haric } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
