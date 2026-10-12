import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ikiAdimKodTuru,
  kurtarmaKoduBicimle,
  type IkiAdimDurumu,
  type IkiAdimKurulumBilgisi,
  type TenantContext,
} from '@advetics/shared';
import { CryptoService } from '../../../crypto/crypto.service';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  adimiTuket,
  hataSay,
  ikiAdimiKaldir,
  kilitYaz,
  kurtarmaKodlariniYaz,
  kurtarmaKodunuTuket,
  kurulumAnahtariYaz,
  kurulumuOnayla,
  satirOku,
  sayaciSifirla,
  sirketOku,
  sirketZorunluYaz,
  type IkiAdimSatiri,
  type SorguCalistirici,
} from './iki-adim-deposu';
import { qrDataAdresi } from './qr';
import {
  anahtarGosterimi,
  kilitSuresiMs,
  kurtarmaKoduOzeti,
  otpauthAdresi,
  totpDogrula,
  yeniKurtarmaKodlari,
  yeniTotpAnahtari,
} from './totp';

export interface IstekBilgisi {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** Saat dışarıdan: testler adım sınırını ve kilidin bitişini sınayabilsin. */
export type Saat = () => number;

/**
 * ═══ İKİ ADIMLI DOĞRULAMA ═══
 *
 * Kendi hesabındaki işlemler (`kurulum`, `kapat`, `yenile`) ve girişin
 * ikinci adımı YÖNETİM istemcisiyle (BYPASSRLS) yürüyor — `changePassword`
 * ile aynı sebep: giriş anında bağlam yok, kendi satırını yazan kullanıcı
 * için de RLS ek bir koruma getirmiyor. Kimlik DIŞARIDAN gelmiyor: kullanıcı
 * kimliği ya doğrulanmış oturumdan (`ctx.userId`) ya da imzalı ara
 * token'dan geliyor.
 *
 * BAŞKASINI ETKİLEYEN iki işlem (yöneticinin sıfırlaması, şirket
 * zorunluluğu) ise BAĞLAMLI istemciyle: hangi kullanıcıya / şirkete
 * dokunulabileceğine RLS karar veriyor ve görünmeyen satır "bulunamadı".
 */
@Injectable()
export class IkiAdimService {
  private readonly logger = new Logger(IkiAdimService.name);
  /** Testte değiştirilebilir; üretimde duvar saati. */
  saat: Saat = () => Date.now();

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** Depo fonksiyonlarına verilen çalıştırıcı. Ayrı alan: testler PGlite'ı buradan bağlıyor. */
  protected get db(): SorguCalistirici {
    return this.admin as unknown as SorguCalistirici;
  }

  private async satir(userId: string): Promise<IkiAdimSatiri> {
    const s = await satirOku(this.db, userId);
    if (!s) throw new NotFoundException('Kullanıcı bulunamadı');
    return s;
  }

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------

  async durum(ctx: TenantContext): Promise<IkiAdimDurumu> {
    const s = await this.satir(ctx.userId);
    let secilenSirket: IkiAdimDurumu['secilenSirket'] = null;
    if (!ctx.tumSirketler) {
      const sirket = await sirketOku(this.db, ctx.orgId);
      secilenSirket = sirket
        ? { ad: sirket.ad, zorunlu: sirket.zorunlu, degistirebilir: ctx.isOrgAdmin }
        : null;
    }
    return {
      acik: s.acik,
      kurulumBekliyor: !s.acik && s.anahtarSifreli !== null,
      acilis: s.acilis?.toISOString() ?? null,
      kalanKurtarmaKodu: s.acik ? s.kalanKurtarma : 0,
      sirketteZorunlu: s.sirketteZorunlu,
      secilenSirket,
    };
  }

  // ---------------------------------------------------------------------------
  // Kod doğrulama — girişin ikinci adımı ve kapatma bunu kullanıyor
  // ---------------------------------------------------------------------------

  /**
   * Doğrulayıcı kodu YA DA kurtarma kodunu doğrular ve tüketir.
   *
   * SIRA ÖNEMLİ:
   *   1. KİLİT, kriptodan ÖNCE. Kilitliyken doğru kod da reddediliyor;
   *      yoksa kilit yalnızca yanlış tahminleri sayan bir süs olurdu ve
   *      saldırgan kilit süresince denemeye devam ederdi.
   *   2. BİÇİM. Biçimi bozuk girdi (5 hane, harf karışık) deneme hakkı
   *      YEMİYOR: yazım hatası yapan kullanıcı kendini kilitlememeli ve
   *      biçim zaten tahmin değil.
   *   3. Doğrulama + TÜKETME tek deyimde (depo). Eşleşen ama tüketilemeyen
   *      kod (aynı 30 saniyede ikinci kullanım) HATA sayılıyor: ele geçirilen
   *      bir kodun tekrar oynatılması tam olarak budur.
   */
  async kodDogrula(
    userId: string,
    kod: string,
    secenek: { kurtarmaKabul: boolean } = { kurtarmaKabul: true },
  ): Promise<{ tur: 'totp' | 'kurtarma'; kalanKurtarma: number }> {
    const s = await this.satir(userId);
    if (!s.acik || s.anahtarSifreli === null) {
      throw new BadRequestException('Bu hesapta iki adımlı doğrulama açık değil');
    }

    const simdi = this.saat();
    if (s.kilitBitis && s.kilitBitis.getTime() > simdi) {
      throw this.kilitHatasi(s.kilitBitis.getTime() - simdi);
    }

    const tur = ikiAdimKodTuru(kod);
    if (tur === null || (tur === 'kurtarma' && !secenek.kurtarmaKabul)) {
      throw new BadRequestException(
        secenek.kurtarmaKabul
          ? '6 haneli kodu ya da bir kurtarma kodunu yaz'
          : 'Uygulamadaki 6 haneli kodu yaz',
      );
    }

    let kabul = false;
    let tekrar = false;
    if (tur === 'totp') {
      const anahtar = Buffer.from(this.crypto.decrypt(s.anahtarSifreli), 'base64');
      const adim = totpDogrula(anahtar, kod, simdi);
      if (adim !== null) {
        kabul = (await adimiTuket(this.db, userId, adim)) === 1;
        tekrar = !kabul;
      }
    } else {
      kabul = (await kurtarmaKodunuTuket(this.db, userId, kurtarmaKoduOzeti(kod))) === 1;
    }

    if (!kabul) {
      const n = await hataSay(this.db, userId);
      const sure = kilitSuresiMs(n);
      if (sure > 0) {
        await kilitYaz(this.db, userId, new Date(simdi + sure));
        await this.audit.recordUnauthenticated(s.orgId, {
          action: 'auth.iki_adim_kilitlendi',
          targetType: 'user',
          targetId: userId,
          actorId: userId,
          after: { basarisizDeneme: n, kilitDakika: sure / 60_000 },
        });
        this.logger.warn(`2FA kilidi: userId=${userId} deneme=${n} süre=${sure / 60_000} dk`);
        throw this.kilitHatasi(sure);
      }
      throw new UnauthorizedException(
        tekrar
          ? 'Bu kod az önce kullanıldı. Uygulamada yeni kodun çıkmasını bekle.'
          : tur === 'totp'
            ? 'Kod hatalı. Telefonunun saati doğru mu? Uygulamadaki güncel kodu yaz.'
            : 'Kurtarma kodu hatalı ya da daha önce kullanılmış.',
      );
    }

    await sayaciSifirla(this.db, userId);
    const kalanKurtarma = tur === 'kurtarma' ? s.kalanKurtarma - 1 : s.kalanKurtarma;
    if (tur === 'kurtarma') {
      await this.audit.recordUnauthenticated(s.orgId, {
        action: 'auth.iki_adim_kurtarma_kodu_kullanildi',
        targetType: 'user',
        targetId: userId,
        actorId: userId,
        after: { kalan: kalanKurtarma },
      });
    }
    return { tur, kalanKurtarma };
  }

  private kilitHatasi(kalanMs: number): HttpException {
    const dk = Math.max(1, Math.ceil(kalanMs / 60_000));
    return new HttpException(
      `Çok fazla hatalı deneme. ${dk} dakika sonra tekrar dene.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // ---------------------------------------------------------------------------
  // Kurulum
  // ---------------------------------------------------------------------------

  /**
   * Yeni anahtar üretir ve ŞİFRELİ olarak yazar (2FA henüz AÇILMIYOR).
   *
   * Her çağrı yeni anahtar üretiyor: kullanıcı QR'ı okutmadan sayfayı
   * yenilediyse eski anahtarın bir değeri yok. Açıkken çağrılırsa ret —
   * yoksa açık bir 2FA'nın anahtarı, kodu bilmeyen biri tarafından
   * değiştirilebilirdi.
   */
  async kurulumBaslat(userId: string): Promise<IkiAdimKurulumBilgisi> {
    const s = await this.satir(userId);
    if (s.acik) {
      throw new ConflictException('İki adımlı doğrulama zaten açık');
    }
    const anahtar = yeniTotpAnahtari();
    // Anahtar base64 olarak şifreleniyor: `CryptoService` metin alıyor ve
    // ham baytı utf8 diye okumak geri dönüşü bozardı.
    const yazilan = await kurulumAnahtariYaz(
      this.db,
      userId,
      this.crypto.encrypt(anahtar.toString('base64')),
    );
    if (yazilan !== 1) throw new ConflictException('İki adımlı doğrulama zaten açık');

    const adres = otpauthAdresi(anahtar, s.email);
    return { anahtar: anahtarGosterimi(anahtar), otpauthAdresi: adres, qrAdresi: qrDataAdresi(adres) };
  }

  /**
   * Kodla onaylar, 2FA'yı açar ve kurtarma kodlarını DÜZ METİN olarak YALNIZCA
   * bu yanıtta döndürür (veritabanında özetleri).
   *
   * Hatalı kod deneme sayacına YAZILMIYOR: kurulumdaki anahtar kullanıcının
   * kendi ürettiği ve henüz hiçbir şeyi korumayan bir anahtar; tahmin etmek
   * kimseye bir şey kazandırmıyor. Saymak ise saati kaymış telefonla
   * uğraşan kullanıcıyı açılmamış bir 2FA yüzünden kilitlerdi.
   */
  async kurulumOnayla(userId: string, kod: string): Promise<string[]> {
    const s = await this.satir(userId);
    if (s.acik) throw new ConflictException('İki adımlı doğrulama zaten açık');
    if (s.anahtarSifreli === null) {
      throw new BadRequestException('Önce kurulumu başlat: QR kodu henüz oluşturulmadı');
    }
    const anahtar = Buffer.from(this.crypto.decrypt(s.anahtarSifreli), 'base64');
    const adim = totpDogrula(anahtar, kod, this.saat());
    if (adim === null) {
      throw new BadRequestException(
        'Kod tutmadı. QR kodunu okuttuğun uygulamadaki güncel 6 haneli kodu yaz; telefonunun saati otomatik olmalı.',
      );
    }
    const kodlar = yeniKurtarmaKodlari();
    const yazilan = await kurulumuOnayla(
      this.db,
      userId,
      s.anahtarSifreli,
      kodlar.map(kurtarmaKoduOzeti),
      adim,
      new Date(this.saat()),
    );
    if (yazilan !== 1) {
      // Arada başka bir sekme yeni anahtar üretti ya da kurulum tamamlandı.
      throw new ConflictException(
        'Kurulum başka bir pencerede değişti. Sayfayı yenileyip yeni QR kodunu okut.',
      );
    }
    await this.audit.recordUnauthenticated(s.orgId, {
      action: 'auth.iki_adim_acildi',
      targetType: 'user',
      targetId: userId,
      actorId: userId,
    });
    return kodlar.map(kurtarmaKoduBicimle);
  }

  // ---------------------------------------------------------------------------
  // Kendi hesabında: kapatma, kurtarma kodu yenileme
  // ---------------------------------------------------------------------------

  /**
   * 2FA'yı kapatır — GEÇERLİ BİR KODLA. Oturum tek başına yetmiyor: açık
   * kalmış bir tarayıcıya oturan biri 2FA'yı kapatabilseydi korumanın anlamı
   * kalmazdı. Kurtarma kodu da kabul: telefonunu kaybetmiş kullanıcının
   * yeni telefona geçmesinin yolu bu.
   *
   * Şirket zorunlu tutuyorsa kapatılamıyor; kapatsaydı bir sonraki oturum
   * yenilemesinde zaten dışarı atılıp kuruluma zorlanacaktı.
   */
  async kapat(ctx: TenantContext, kod: string, bilgi: IstekBilgisi): Promise<void> {
    const s = await this.satir(ctx.userId);
    if (!s.acik) throw new BadRequestException('İki adımlı doğrulama zaten kapalı');
    if (s.sirketteZorunlu) {
      throw new ForbiddenException(
        'Şirketin iki adımlı doğrulamayı zorunlu tutuyor; kapatılamaz. Telefonunu değiştirdiysen yöneticinden sıfırlamasını iste.',
      );
    }
    await this.kodDogrula(ctx.userId, kod);
    await ikiAdimiKaldir(this.db, ctx.userId);
    await this.denetim(ctx, 'auth.iki_adim_kapatildi', ctx.userId, bilgi);
  }

  /** Kurtarma kodlarını yeniler; eskilerin hepsi geçersiz olur. Yalnızca uygulama kodu kabul. */
  async kurtarmaKodlariniYenile(ctx: TenantContext, kod: string, bilgi: IstekBilgisi): Promise<string[]> {
    await this.kodDogrula(ctx.userId, kod, { kurtarmaKabul: false });
    const kodlar = yeniKurtarmaKodlari();
    const yazilan = await kurtarmaKodlariniYaz(this.db, ctx.userId, kodlar.map(kurtarmaKoduOzeti));
    if (yazilan !== 1) throw new BadRequestException('İki adımlı doğrulama açık değil');
    await this.denetim(ctx, 'auth.iki_adim_kurtarma_yenilendi', ctx.userId, bilgi);
    return kodlar.map(kurtarmaKoduBicimle);
  }

  // ---------------------------------------------------------------------------
  // Yönetici işlemleri — bağlamlı (RLS) istemciyle
  // ---------------------------------------------------------------------------

  /**
   * Başka bir kullanıcının 2FA'sını sıfırlar (telefonunu kaybetti, kurtarma
   * kodları yok).
   *
   * KENDİ HESABINA KAPALI: kendi 2FA'sını kaldırmak isteyen yönetici kod
   * girerek kapatmalı. Bu yol koddan muaf ve kendine açık olsaydı açık
   * kalmış bir yönetici oturumu 2FA'yı kodsuz kaldırmanın kapısı olurdu.
   *
   * Satırı RLS seçiyor: `users` güncelleme politikası org yöneticisine
   * yalnızca kendi şirket kapsamındaki kullanıcıları açıyor. Görünmeyen
   * kullanıcı "bulunamadı" — 403 dönmek o kişinin VAR olduğunu sızdırırdı
   * (`members.service.ts` ile aynı kural).
   */
  async kullaniciyiSifirla(ctx: TenantContext, hedefId: string, bilgi: IstekBilgisi): Promise<void> {
    if (!ctx.isOrgAdmin) throw new ForbiddenException('Bu işlem yalnızca yöneticiler içindir');
    if (hedefId === ctx.userId) {
      throw new BadRequestException(
        'Kendi iki adımlı doğrulamanı Hesabım ekranından, kodunla kapatabilirsin.',
      );
    }
    await this.prisma.withTenant({ ...ctx, activeClientId: null }, async (tx) => {
      const n = await ikiAdimiKaldir(tx as unknown as SorguCalistirici, hedefId);
      if (n !== 1) throw new NotFoundException('Kullanıcı bulunamadı');
      await this.audit.record(tx, ctx, {
        action: 'user.iki_adim_sifirlandi',
        targetType: 'user',
        targetId: hedefId,
        ...bilgi,
      });
    });
  }

  /**
   * Seçili şirkette 2FA zorunluluğu.
   *
   * AÇMAK İÇİN YÖNETİCİNİN KENDİ 2FA'SI AÇIK OLMALI. Kendisi kurmamış bir
   * yönetici zorunluluğu açarsa bir sonraki oturum yenilemesinde kendisi de
   * dışarı atılıp kuruluma zorlanıyor; neden olduğunu ekranda göremeden.
   * Önce kendisi yaşasın, sonra ekibine zorunlu kılsın.
   */
  async sirketZorunluAyarla(ctx: TenantContext, zorunlu: boolean, bilgi: IstekBilgisi): Promise<void> {
    if (!ctx.isOrgAdmin) throw new ForbiddenException('Bu ayarı yalnızca şirket yöneticisi değiştirebilir');
    if (ctx.tumSirketler) {
      throw new BadRequestException('Önce bir şirket seç: bu ayar şirket başına');
    }
    if (zorunlu) {
      const s = await this.satir(ctx.userId);
      if (!s.acik) {
        throw new BadRequestException(
          'Önce kendi hesabında iki adımlı doğrulamayı aç (Hesabım), sonra şirkette zorunlu yap.',
        );
      }
    }
    await this.prisma.withTenant({ ...ctx, activeClientId: null }, async (tx) => {
      const n = await sirketZorunluYaz(tx as unknown as SorguCalistirici, ctx.orgId, zorunlu);
      if (n !== 1) throw new ForbiddenException('Bu şirketin ayarını değiştirme yetkin yok');
      await this.audit.record(tx, ctx, {
        action: zorunlu ? 'org.iki_adim_zorunlu_acildi' : 'org.iki_adim_zorunlu_kapatildi',
        targetType: 'organization',
        targetId: ctx.orgId,
        ...bilgi,
      });
    });
  }

  private async denetim(ctx: TenantContext, action: string, hedef: string, bilgi: IstekBilgisi) {
    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, { action, targetType: 'user', targetId: hedef, ...bilgi }),
    );
  }
}
