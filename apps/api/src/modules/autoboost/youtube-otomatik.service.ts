import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext, YoutubeOtomatikOnizleme } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { gorselIndir } from '../reports/kreatif-gorseli';
import { ConnectionsService } from '../connections/connections.service';
import {
  YOUTUBE_HESAP_KOSULU,
  youtubeHesabiEngeli,
  youtubeHesabiSec,
  type YoutubeHesabiKarari,
} from './youtube-hesabi';
import { hedefUrl, markaAdiSec, videoMetinleri, type VideoMetinleri } from './youtube-otomatik';

/** Ön ayarda elle seçilmiş (eski) değerler — varsa önce onlar. */
export interface OnAyarGecersizKilma {
  businessName?: string;
  logoAssetId?: string;
  finalUrl?: string;
}

/** Yayına hazır değerler. */
export interface YoutubeYayinDegerleri {
  businessName: string;
  logoAssetId: string;
  finalUrl: string;
}

/**
 * LOGONUN YÜKLENDİĞİ YER — kullanıcıya gösterilen tek dize.
 *
 * Bu modülün metinlerinde "Bilgi Bankası" adı YASAK (`boost-yonlendirme-
 * metni.spec.ts`): ön ayar formu bir süre orada yaşadı ve taşındıktan sonra
 * altı hata cümlesi kullanıcıyı boş bir sayfaya gönderdi. Logo ise GERÇEKTEN
 * orada, Logo sekmesinde duruyor; tek bir sabitte tutuluyor ve bekçi test
 * yalnızca bu satırı muaf tutuyor. Yer bir gün değişirse değişecek tek dize bu.
 */
export const LOGO_YERI = 'Bilgi Bankası › Logo sekmesi';

interface Kaynaklar {
  workspaceAdi: string;
  website: string | null;
  profilLogosu: string | null;
  kanal: { id: string; ad: string; gorsel: string | null } | null;
}

/**
 * ═══ YOUTUBE ÖN AYARININ OTOMATİK DOLAN BİLGİLERİ ═══
 *
 * Kullanıcının tarifi: *"çok büyük angarya — senin logoyu kendin çekmen
 * lazım"*. Marka adı, logo ve hedef adres sistemde ZATEN duruyordu:
 *
 *   · marka adı → workspace adı (sığmazsa YouTube kanal adı)
 *   · logo      → Bilgi Bankası logosu, yoksa YouTube kanalının görseli
 *   · adres     → workspace'in web sitesi
 *
 * ÖNİZLEME VE YAYIN AYNI YERDEN. Ekran "logo: Bilgi Bankası" deyip yayın
 * kanal görselini kullansaydı kullanıcı gördüğüne güvenip başka bir şey
 * yayınlamış olurdu. İki yol da `kaynaklar()` + aynı saf kurallardan
 * geçiyor.
 *
 * KANAL GÖRSELİ YAYIN ANINDA ARŞİVE ALINIYOR, önizlemede değil. Önizleme bir
 * GET ve ekran açıldığı için Görsel Arşivi'ne kayıt düşmesi beklenmez. Aynı
 * görsel ikinci kez alınınca yükleme içerik özetiyle mükerrerini buluyor ve
 * yeni kayıt açmıyor.
 */
@Injectable()
export class YoutubeOtomatikService {
  private readonly logger = new Logger(YoutubeOtomatikService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly connections: ConnectionsService,
  ) {}

  /** Ekranda gösterilen hâl — hiçbir şey yazmıyor. */
  async onizleme(
    ctx: TenantContext,
    clientId: string,
    gecersiz: OnAyarGecersizKilma,
  ): Promise<YoutubeOtomatikOnizleme> {
    const k = await this.kaynaklar(ctx, clientId, null);
    const marka = gecersiz.businessName
      ? { deger: gecersiz.businessName, kaynak: 'on-ayar' as const }
      : markaAdiSec(k.workspaceAdi, k.kanal?.ad ?? null);

    let logo: YoutubeOtomatikOnizleme['logo'];
    const logoId = gecersiz.logoAssetId ?? k.profilLogosu;
    if (logoId) {
      const kayit = await this.assets.get(ctx, logoId).catch(() => null);
      logo = {
        kaynak: gecersiz.logoAssetId ? 'on-ayar' : 'profil-logosu',
        onizleme: kayit?.previewUrl ?? null,
      };
    } else if (k.kanal?.gorsel) {
      logo = { kaynak: 'kanal', onizleme: k.kanal.gorsel };
    } else {
      logo = { kaynak: 'yok', onizleme: null };
    }

    const urlDeger = gecersiz.finalUrl ?? hedefUrl(k.website);
    const url: YoutubeOtomatikOnizleme['url'] = gecersiz.finalUrl
      ? { deger: gecersiz.finalUrl, kaynak: 'on-ayar' }
      : urlDeger
        ? { deger: urlDeger, kaynak: 'workspace' }
        : { deger: null, kaynak: 'yok' };

    const [son] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ title: string | null }>>(Prisma.sql`
        SELECT title FROM auto_boost_queue_items
        WHERE client_id = ${clientId}::uuid AND platform = 'google'
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `),
    );
    const ornekMetin = son?.title && marka.deger ? videoMetinleri(son.title, null, marka.deger) : null;

    /*
     * REKLAM HESABI YAYINLA AYNI KARARDAN. Kanalın ham bağına bakmak, eski bir
     * Meta bağı dururken konum aramasını "hesap yok" diye kapatırdı; oysa
     * workspace'teki tek Google hesabı yayında zaten kullanılacak.
     */
    const hesap = await this.reklamHesabi(ctx, clientId, k.kanal?.id ?? null);
    const hesapEngeli = youtubeHesabiEngeli(hesap);

    return {
      kanal: k.kanal,
      reklamHesabiId: hesap.durum === 'kanal' || hesap.durum === 'tek-hesap' ? hesap.hesapId : null,
      marka,
      logo,
      url,
      ornek:
        ornekMetin && son?.title
          ? {
              videoBasligi: son.title,
              baslik: ornekMetin.headlines[0]!,
              uzunBaslik: ornekMetin.longHeadlines[0]!,
              aciklama: ornekMetin.descriptions[0]!,
            }
          : null,
      eksikler: [
        ...eksikler(marka.deger, logo.kaynak, url.deger, k.kanal),
        ...(k.kanal && hesapEngeli ? [hesapEngeli] : []),
      ],
    };
  }

  /**
   * YAYIN DEĞERLERİ — eksik varsa sebepleriyle REDDEDİYOR.
   *
   * Eksik alanla Google'a gitmek, Google'ın kendi (İngilizce, alan adlı)
   * hatasıyla dönmek ve kartı `failed` yapmak demekti. Burada reddedilince
   * kart kilitlenmeden ÖNCE duruluyor ve kullanıcı neyi nereye gireceğini
   * Türkçe okuyor.
   */
  async yayinDegerleri(
    ctx: TenantContext,
    clientId: string,
    kanalProfilId: string,
    gecersiz: OnAyarGecersizKilma,
  ): Promise<YoutubeYayinDegerleri> {
    const k = await this.kaynaklar(ctx, clientId, kanalProfilId);
    const marka = gecersiz.businessName ?? markaAdiSec(k.workspaceAdi, k.kanal?.ad ?? null).deger;
    const finalUrl = gecersiz.finalUrl ?? hedefUrl(k.website);
    const logoKaynagi = gecersiz.logoAssetId || k.profilLogosu ? 'profil-logosu' : k.kanal?.gorsel ? 'kanal' : 'yok';

    const eksik = eksikler(marka, logoKaynagi, finalUrl, k.kanal);
    if (eksik.length > 0 || !marka || !finalUrl) {
      throw new BadRequestException(`YouTube reklamı yayınlanamıyor: ${eksik.join(' ')}`);
    }

    const logoAssetId =
      gecersiz.logoAssetId ?? k.profilLogosu ?? (await this.kanalGorseliniAl(ctx, clientId, k.kanal!));
    return { businessName: marka, logoAssetId, finalUrl };
  }

  /**
   * MARKA ADI — logoya ve adrese DOKUNMADAN.
   *
   * Kart metin önizlemesi yalnızca marka adına ihtiyaç duyuyor (açıklama
   * yedeği onu kullanıyor). `yayinDegerleri`ni çağırmak eksik site ya da logo
   * yüzünden önizlemeyi reddeder, üstelik kanal görselini arşive alırdı —
   * bir GET'ten beklenmeyecek bir yazma. Karar `yayinDegerleri` ile AYNI:
   * ön ayardaki ad, yoksa `markaAdiSec`.
   */
  async markaAdi(
    ctx: TenantContext,
    clientId: string,
    kanalProfilId: string,
    gecersiz: Pick<OnAyarGecersizKilma, 'businessName'>,
  ): Promise<string | null> {
    if (gecersiz.businessName) return gecersiz.businessName;
    const k = await this.kaynaklar(ctx, clientId, kanalProfilId);
    return markaAdiSec(k.workspaceAdi, k.kanal?.ad ?? null).deger;
  }

  /**
   * YOUTUBE REKLAMININ GOOGLE ADS HESABI — `youtubeHesabiSec` girdileri.
   *
   * Kanalın bağlı hesabı (platformu ve sahibiyle) ve workspace'in Google
   * Ads hesapları okunuyor; karar saf fonksiyonda. Okuma servisi aynı
   * girdileri kendi sorgusunda aynı koşulla (`YOUTUBE_HESAP_KOSULU`) okuyor.
   */
  async reklamHesabi(
    ctx: TenantContext,
    clientId: string,
    kanalProfilId: string | null,
  ): Promise<YoutubeHesabiKarari> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    const [satir] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<
        Array<{
          bagli_id: string | null;
          bagli_platform: string | null;
          bagli_client_id: string | null;
          google_hesaplari: string[] | null;
        }>
      >(Prisma.sql`
        SELECT la.id::text AS bagli_id, la.platform::text AS bagli_platform,
               la.client_id::text AS bagli_client_id,
               (SELECT array_agg(aa.id::text ORDER BY aa.id) FROM ad_accounts aa
                 WHERE aa.client_id = ${clientId}::uuid AND ${Prisma.raw(YOUTUBE_HESAP_KOSULU)}
               ) AS google_hesaplari
        FROM (SELECT 1) bos
        LEFT JOIN LATERAL (
          SELECT linked_ad_account_id FROM social_profiles
          WHERE client_id = ${clientId}::uuid AND profile_type = 'youtube_channel'
            AND (${kanalProfilId}::uuid IS NULL OR id = ${kanalProfilId}::uuid)
          ORDER BY created_at ASC
          LIMIT 1
        ) sp ON true
        LEFT JOIN ad_accounts la ON la.id = sp.linked_ad_account_id
      `),
    );
    return youtubeHesabiSec(
      satir?.bagli_id && satir.bagli_platform
        ? { id: satir.bagli_id, platform: satir.bagli_platform, clientId: satir.bagli_client_id }
        : null,
      clientId,
      satir?.google_hesaplari ?? [],
    );
  }

  /**
   * TEK HESAP SEÇİMİNİ KANALA YAZAR — mevcut kapıdan (`setProfileAdAccount`).
   *
   * O yol hesabın platformunu ve aynı workspace'te olduğunu doğruluyor ve
   * denetim kaydı yazıyor; doğrudan UPDATE bunların hepsini atlardı.
   */
  async kanalaBagla(ctx: TenantContext, kanalProfilId: string, adAccountId: string): Promise<void> {
    await this.connections.setProfileAdAccount(ctx, kanalProfilId, adAccountId, {
      ip: null,
      userAgent: null,
      requestId: null,
    });
  }

  /** Videonun metinleri — çağıran marka adını `yayinDegerleri`nden veriyor. */
  metinler(baslik: string | null, aciklama: string | null, marka: string): VideoMetinleri {
    return videoMetinleri(baslik, aciklama, marka);
  }

  /**
   * KANAL GÖRSELİNİ GÖRSEL ARŞİVİNE ALIR — `kind = 'logo'`.
   *
   * İNDİRME BEYAZ LİSTEDEN (`gorselIndir`): adres veritabanından geliyor ve
   * "YouTube'dan geldi" güvenli demek değil. Kanal görselleri `yt3.ggpht.com`
   * ve `yt3.googleusercontent.com` üzerinden geliyor; ikisi de listede.
   *
   * YÜKLEME AYNI DOĞRULAMADAN GEÇİYOR (`AssetsService.upload`): biçim, boyut,
   * en az 128 piksel. Kanal görseli genelde 800×800; küçük çıkarsa yükleme
   * sebebiyle reddediyor ve o cümle kullanıcıya gidiyor.
   */
  private async kanalGorseliniAl(
    ctx: TenantContext,
    clientId: string,
    kanal: { ad: string; gorsel: string | null },
  ): Promise<string> {
    const r = await gorselIndir(kanal.gorsel!);
    if (!r.ok) {
      throw new BadRequestException(
        `YouTube kanal görseli indirilemedi (${r.sebep}). ${LOGO_YERI} üzerinden bir logo yükle.`,
      );
    }
    const yukleme = await this.assets.upload(ctx, {
      clientId,
      kind: 'logo',
      fileName: `youtube-kanal-logosu.${r.tur === 'png' ? 'png' : 'jpg'}`,
      mimeType: r.tur === 'png' ? 'image/png' : 'image/jpeg',
      bytes: Buffer.from(r.bytes),
      name: `${kanal.ad} YouTube logosu`,
    });
    if (!yukleme.duplicate) {
      this.logger.log(`YouTube kanal görseli logo olarak arşive alındı: ${kanal.ad}`);
    }
    return yukleme.asset.id;
  }

  /**
   * Workspace'in adı, sitesi, Bilgi Bankası logosu ve YouTube kanalı.
   *
   * KANAL: yayında kartın kendi kanalı; önizlemede workspace'in ilk kanalı.
   * Bir workspace'te birden çok kanal varsa önizleme onlardan birini
   * gösteriyor — yayın yine kartın kanalını kullanıyor.
   */
  private async kaynaklar(
    ctx: TenantContext,
    clientId: string,
    kanalProfilId: string | null,
  ): Promise<Kaynaklar> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    const [satir] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<
        Array<{
          name: string;
          website: string | null;
          logo_asset_id: string | null;
          kanal_id: string | null;
          kanal_adi: string | null;
          kanal_gorseli: string | null;
        }>
      >(Prisma.sql`
        SELECT c.name, c.website, cp.logo_asset_id::text AS logo_asset_id,
               sp.id::text AS kanal_id, sp.name AS kanal_adi, sp.picture_url AS kanal_gorseli
        FROM clients c
        LEFT JOIN client_profiles cp ON cp.client_id = c.id
        LEFT JOIN LATERAL (
          SELECT id, name, picture_url FROM social_profiles
          WHERE client_id = c.id AND profile_type = 'youtube_channel'
            AND (${kanalProfilId}::uuid IS NULL OR id = ${kanalProfilId}::uuid)
          ORDER BY created_at ASC
          LIMIT 1
        ) sp ON true
        WHERE c.id = ${clientId}::uuid
      `),
    );
    if (!satir) throw new BadRequestException('Workspace bulunamadı.');
    return {
      workspaceAdi: satir.name,
      website: satir.website,
      profilLogosu: satir.logo_asset_id,
      kanal: satir.kanal_id
        ? { id: satir.kanal_id, ad: satir.kanal_adi ?? '', gorsel: satir.kanal_gorseli }
        : null,
    };
  }
}

/**
 * YAYINI ENGELLEYEN EKSİKLER — her biri NEREDE düzeltileceğini söylüyor.
 *
 * "Logo eksik" demek yetmiyor: kullanıcı logonun nereye yükleneceğini
 * bilmiyor ve Görsel Arşivi'nde yükleyip Bilgi Bankası'nda seçmesi
 * gerektiğini hiçbir ekran söylemiyordu.
 */
export function eksikler(
  marka: string | null,
  logoKaynagi: string,
  url: string | null,
  kanal: { id: string } | null,
): string[] {
  const liste: string[] = [];
  if (!kanal) liste.push('Bu workspace’e bağlı bir YouTube kanalı yok.');
  if (!marka) liste.push('Marka adı üretilemedi: workspace adını kontrol et.');
  if (logoKaynagi === 'yok') {
    liste.push(`Logo yok: ${LOGO_YERI} üzerinden bir logo yükle.`);
  }
  if (!url) {
    liste.push('Web sitesi yok: Şirketler ekranında workspace bilgilerine web sitesini ekle.');
  }
  return liste;
}
