import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GOOGLE_TURKCE,
  GORU_AYARI,
  OZEL_KATEGORILER,
  PROVA_TAZELIK_MS,
  REHBER_AMACLARI,
  REHBER_LISTE_SINIRI,
  acikPlatformlar,
  advKampanyaAdi,
  googleGorselKurgusuMu,
  googleTeklifKarari,
  calismaSaatleriSchema,
  type CalismaSaatleri,
  aciklamaMetniSec,
  altSayfaAdaylari,
  cipaBaglantiSayisi,
  siteBaglantisiSebebi,
  siteHaritasiOku,
  googleAramaOgeleri,
  ogeDurumlariGovdeyle,
  type GoogleOgeDurumu,
  type GoogleOgeKaynagi,
  sayfaOzeti,
  siteBaglantilariUret,
  googleUzantiReddiCumlesi,
  ALT_SAYFA_ESZAMANLI,
  ALT_SAYFA_ADAY_SINIRI,
  sitePikselHali,
  kanonikJson,
  kararTablosu,
  oranBul,
  platformAcilabilirMi,
  platformYenidenKurulabilirMi,
  provaNotu,
  kopyalanacakAlanlar,
  rehberAlanlariSchema,
  rehberEksikleri,
  rehberdenGoogle,
  rehberdenMeta,
  rehberYerlesimPlani,
  geriOkumaNotlariniSec,
  rehberFikirSetleri,
  taslakAlanlariSchema,
  taslakEksikleri,
  uyumDenetle,
  type AnahtarKelimeOnerisi,
  type GoogleDerlemeGirdisi,
  type GoogleUzantiKaynagi,
  type SiteAltSayfasi,
  type SiteBaglantisi,
  type SitePikselHali,
  type GorselOlcusu,
  type GorselOrani,
  type MetinOnerIstegi,
  type MetinOnerisi,
  type OzelKategori,
  type PlatformProvaSonucu,
  type PlatformYayinKaydi,
  type PlatformYayinOzeti,
  type RehberAlanlari,
  type RehberDurumu,
  type RehberEksigi,
  type RehberEksikBaglami,
  type FormOnizlemesi,
  type RehberFormListesi,
  type RehberGuncelle,
  type RehberHazirligi,
  type RehberKaydi,
  type RehberListesi,
  type RehberOnKosullari,
  type RehberOzeti,
  type RehberPikselListesi,
  type RehberPlatformu,
  type RehberProvaSonucu,
  type RehberYayinDurumu,
  type YoutubeVideoListesi,
  type TaslakAlanlari,
  type TenantContext,
  type YayinDurumu,
  taslakKanonikIcerik,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import { ajansYoneticisiMi } from '../ajans-yoneticisi';
import { CryptoService } from '../../../crypto/crypto.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { QuotaGuardService } from '../../../queue/quota-guard.service';
import { YAPAY_ZEKA } from '../../../yapay-zeka/yapay-zeka.module';
import { metinIsteOlcumlu, YapayZekaHatasi, type GeminiIstemcisi } from '../../../yapay-zeka/gemini';
import { AssetStorageService } from '../../ad-builder/asset-storage.service';
import { PlatformApiError, type FetchContext } from '../../connections/provider.types';
import { ProviderRegistry } from '../../connections/provider.registry';
import type { GoogleProvider } from '../../connections/providers/google.provider';
import { googleAlanHatalari, googleYalinKimlik, type GoogleGorselKaynagi } from '../../connections/providers/google-demandgen';
import { TokenVaultService } from '../../connections/token-vault.service';
import { YouTubeApiService } from '../../autoboost/youtube-api.service';
import { ReklamHazirlikService, seciliYoksaIlk, type RehberHazirlikSecimi, type RehberPlatformOkuyucu } from '../hazirlik.service';
import { gorselOkuyucu, hesapErisimi, sayfaTokenOkuyucu } from '../meta-erisim';
import { ReklamKuyrugu } from '../reklam-kuyrugu';
import { ReklamTaslakService, type AlanDegisikligi } from '../taslak.service';
import { formKimligiCoz, provaDurumu, yerelTarih } from '../yayin-baslat';
import { yayiniSonlandir, type TxRunner } from '../yayin-motoru';
import { ReklamYayinService } from '../yayin.service';
import { googleYazmaAcikMi, metaYazmaAcikMi } from '../yazma-kapisi';
import { metaSurumuDogrula } from '../meta-graf';
import { derleGoogle, GOOGLE_DERLEYICI_SURUMU, type GoogleLogo } from '../google/derle-google';
import { googleYayinKaydiOlustur, type GoogleYayinGovdesi } from '../google/google-yayin';
import { GOOGLE_TY_ASGARI_TRY_MICROS } from '../hazirlik.service';
import { degisiklikleriUygula, rehberOzeti } from './rehber-kayit';
import {
  GOOGLE_TURKIYE,
  METIN_ONERI_SEMASI,
  METIN_ONERI_SICAKLIGI,
  kelimeOnerisiHazirla,
  kelimeTohumlari,
  konumEsle,
  metinOneriIstemi,
  metinOnerisiTemizle,
} from './oneriler';
import {
  hazirlikSatisOlcumu,
  metaAsgariOku,
  metaFormKosuluOku,
  metaFormAyrintisiOku,
  metaSayfaFormlariOku,
  seciliFormHali,
  seciliPikselHali,
  whatsappHali,
  type MetaFormSatiri,
  type PikselSatiri,
} from './platform-okuma';
import type { MetaProvider } from '../../connections/providers/meta.provider';
import { rehberYayinKapilari, type PlatformProvaHali } from './yayin-kapilari';
import { sayfaHtmlGetir, type HtmlSonucu } from '../../tenancy/site-oku';

const logger = new Logger('Rehber');

interface RehberSatiri {
  id: string;
  org_id: string;
  client_id: string;
  durum: RehberDurumu;
  surum: number;
  alanlar: unknown;
  meta_taslak_id: string | null;
  google_taslak_id: string | null;
  prova_ozeti: string | null;
  updated_at: Date;
}

const SUTUNLAR = Prisma.sql`id::text, org_id::text, client_id::text, durum, surum, alanlar,
  meta_taslak_id::text, google_taslak_id::text, prova_ozeti, updated_at`;

/**
 * Platform ön koşulları ve Meta asgarisi — SÜREÇ İÇİ ÖNBELLEK.
 *
 * Değerler platform çağrısıyla okunuyor (`GET /reklam/rehber/hazirlik`). PUT
 * ve yayın kapısı platform ÇAĞIRMAMALI (kapılar sıfır çağrı; PUT her tuşta
 * Meta'ya gitmesin), o yüzden son okumayı buradan alıyorlar. Önbellekte yoksa
 * ya da seçilen hesap okunan hesap değilse `null` = "kontrol edilemedi" ve
 * eksik listesi bunu UYARI olarak söylüyor, engel olarak değil. Yanlış bir
 * "var" yerine dürüst bir "bilmiyorum".
 */
interface OnKosulKaydi {
  zaman: number;
  metaHesapId: string | null;
  googleHesapId: string | null;
  metaAsgari: string | null;
  googleDonusum: boolean | null;
  /** Birincil SATIN ALMA dönüşümü (Maks. Performans ön koşulu, Dalga 3). */
  googleSatis: boolean | null;
  /**
   * Son 30 günün dönüşüm sayısı (Arama teklif eşiği, `googleTeklifKarari`).
   * Yalnız ölçüm etkinse okunur; okunmadı/okunamadı = `null` = tıklama.
   */
  googleDonusum30Gun: number | null;
}
const ONBELLEK_MS = 15 * 60_000;
/** Form önizlemesi önbelleği: formu Meta'da değiştiren kullanıcı en geç 10 dk sonra yenisini görür. */
const FORM_AYRINTI_MS = 10 * 60_000;

/**
 * Son 30 günün dönüşüm sayısı (teklif eşiği). Kaynak taraması sorguyu bu
 * sabitten okuyor; `segments.date` WHERE'de seçilmeden: `ads-kurulum.ts`
 * harcama sorgusuyla aynı biçim (çekirdek tarih segmenti istisnası).
 */
export const GOOGLE_DONUSUM_SAYISI_SORGUSU = 'SELECT metrics.conversions FROM customer WHERE segments.date DURING LAST_30_DAYS';

/**
 * SAYFA BAŞINA ön koşullar (Lead Ads koşulları, WhatsApp hattı) ve yayında
 * form listesi. Anahtar `clientId:sayfaId`. Burada bir süre TEK kayıt vardı
 * ve hep İLK sayfa okunuyordu: ikinci sayfayı seçen kullanıcı, ilk sayfanın
 * cevabıyla uyarılıyor ya da ilk sayfanın formlarını görüyordu. Okuma artık
 * SEÇİLİ sayfaya yapılıyor (form listesi ucu ve prova öncesi tazeleme).
 *
 * Form listesi YALNIZ başarılı okumada yazılır: okunamayan liste "form yok"
 * olarak önbelleğe girerse seçili form haksız yere "yayında değil" görünürdü.
 */
interface SayfaKaydi {
  zaman: number;
  formKosullari?: boolean | null;
  whatsapp?: boolean | null;
  formlar?: MetaFormSatiri[];
}

/**
 * HESAP BAŞINA piksel listesi (Dalga 3). Anahtar `clientId:adAccountId`.
 * Yalnız BAŞARILI okuma yazılır: okunamayan liste "piksel yok" olarak
 * önbelleğe girerse seçili piksel haksız yere "hesapta yok" görünürdü.
 */
interface PikselKaydi {
  zaman: number;
  satirlar: PikselSatiri[];
  kesildi: boolean;
  /**
   * Yalnız SİTE önbelleğinde: son okuma DÜŞTÜ. Önceki başarılı okumanın
   * "aktif" hâli kullanılmaz; hâl `bilinmiyor` (`baglamKur`).
   */
  okunamadi?: boolean;
}

/**
 * SİTE TARAMASI (Arama + site uzantıları). Anahtar `clientId`; kayıt yalnız
 * AYNI adres için geçerli. Okunamayan site de yazılır (boş liste + sebep):
 * burada "okunamadı" ile "okunmadı" ayrı hâller ve ikincisi kayıt yokluğu.
 */
interface UzantiKaydi {
  zaman: number;
  adres: string;
  siteBaglantilari: SiteBaglantisi[];
  /** Son Google provası uzantıları reddetti: sebebi (kurulum uzantısız). */
  googleReddi?: string | null;
  sebep: string | null;
  /**
   * Ana sayfa menüsündeki AYRI sayfalara giden bağlantıların metinleri
   * (snippet'in ikinci kaynağı). Site okunamadıysa boş.
   */
  menuMetinleri?: string[];
}

/** `baglamlar`ın tek transaction'da okuduğu ham veri; satır başına `baglamKur` birleştirir. */
interface BaglamVerisi {
  /** `vaatler`: Arama + site açıklama metinlerinin kaynağı (`aciklamaMetinleriUret`). */
  m:
    | {
        ad: string;
        marka: string | null;
        logo: string | null;
        yasal: string | null;
        kategoriler: string[];
        vaatler: string[] | null;
        /** Arama öğeleri (g-1.2.0): workspace telefonu, ürün/hizmet kategorileri, logonun ölçüsü. */
        telefon: string | null;
        urun_kategorileri: string[] | null;
        logo_genislik: number | null;
        logo_yukseklik: number | null;
        /** JSONB ham hâli; `calismaSaatleriSchema` ile okunuyor. */
        calisma_saatleri: unknown;
      }
    | undefined;
  hesaplar: Array<{ id: string; platform: string; external_id: string; currency: string; timezone: string }>;
  ajans: boolean;
  olculer: Array<{ id: string; kind: string; width: number | null; height: number | null; byte_size: number | null }>;
  formKimligi: string | null;
}

/** Bir rehberin eksik/karar bağlamı: yalnız veritabanı + önbellek. */
interface Baglam extends RehberEksikBaglami {
  googleDonusum: boolean | null;
  googleDonusum30Gun: number | null;
  /** Marka Merkezi çalışma saatleri; yoksa ya da bozuksa `null` (bilinmiyor). */
  calismaSaatleri: CalismaSaatleri | null;
  /** "Siteme gelsinler" Meta hedefini seçen piksel hâli (`sitePikselHali`). */
  sitePikseli: SitePikselHali;
  /** Arama + site uzantı kaynağı; amaç başkaysa `null`. */
  uzantilar: GoogleUzantiKaynagi | null;
  /** Arama öğelerinin kaynağı (her ulaşma); amaç Arama değilse `null`. */
  ogeKaynagi: GoogleOgeKaynagi | null;
  isletmeAdi: string;
  logoVarlikId: string | null;
  kategoriTabani: OzelKategori[];
  meta: { id: string; currency: string; timezone: string } | null;
  google: { id: string; externalId: string; currency: string; timezone: string } | null;
  workspaceAdi: string;
}

/**
 * ADVCAMPAIGN REHBERİ (docs/advcampaign/MIMARI-REHBER.md § 3).
 *
 * Rehber iki platformun ORTAK girdisi; Meta ve Google taslakları prova
 * anında buradan türetiliyor ve mevcut zincir (Meta: sürüm → prova → yayın
 * motoru; Google: derleyici → validateOnly → yayın işleyicisi) onları
 * işliyor. Rehber zinciri yeniden yazmıyor, BESLİYOR.
 *
 * PLATFORM ÇAĞRISI TRANSACTION'IN İÇİNDE DEĞİL: her `withTenant` kısa ve
 * yalnız veritabanı; Meta/Google çağrısı ikisinin arasında.
 */
/**
 * PLATFORMA GİDERKEN BİLİNMEYEN FORM ENGELDİR (Ajan 4, Dalga 2 B2).
 * Düzenleme sırasında `FORM-BILINMIYOR` uyarı: liste henüz okunmadıysa
 * formu "yok" saymak sağlam bir kurulumu kilitler. Ama prova ve yayında
 * sayfa listesi taze okunmuş olmalı; okunamadıysa `FORM-SAYFA` (başka
 * sayfanın ya da müşterinin form kimliği) ve `FORM-GIZLILIK` HİÇ
 * denetlenmemiş demektir ve uyarıyla geçmek o iki kapıyı sessizce açardı.
 */
export function platformaGiderken(eksikler: RehberEksigi[]): RehberEksigi[] {
  return eksikler.map((e) =>
    e.kod === 'FORM-BILINMIYOR'
      ? { ...e, seviye: 'engel', metin: "Seçilen form Meta'dan okunamadı. Listeyi yenile; düzelmezse sayfa bağlantısını kontrol et" }
      : // Aynı ders piksel için (Dalga 3): okunamayan liste "hesapta yok",
        // "kullanılamaz" ve "hiç çalışmadı" kapılarını denetlenmemiş bırakır.
        e.kod === 'M-PIKSEL-BILINMIYOR'
        ? { ...e, seviye: 'engel', metin: "Seçilen piksel Meta'dan okunamadı. Listeyi yenile; düzelmezse Meta bağlantısını kontrol et" }
      : e.kod === 'G-DONUSUM-BILINMIYOR'
        ? /*
           * MAKS. PERFORMANS ÖLÇÜMSÜZ KURULMAZ (Dalga 3). Düzenlemede uyarı
           * (okunmadıysa sağlam kurulumu kilitlemesin); platforma giderken
           * engel: prova/yayın satış ölçümünü TAZE okuyor
           * (`googleSatisTazele`), yine de bilinmiyorsa öğrenmeyen bir
           * kampanyaya para gönderilmez.
           */
          { ...e, seviye: 'engel', metin: "Google Ads'teki satın alma dönüşümü okunamadı; Google bağlantısını kontrol edip yeniden dene" }
        : e,
  );
}

/**
 * Ortak metin önerisinde modele giden en çok görsel. Her görsel girdi
 * token'ı demek; üç fikir bir markanın tonunu yakalamaya yetiyor.
 */
export const METIN_ONERI_GORSEL_SINIRI = 3;

/** Gemini'nin `inlineData` olarak kabul ettiği görsel biçimleri (varlık arşivinin biçimleri). */
const METIN_GORSEL_BICIMLERI = ['image/jpeg', 'image/png', 'image/webp'];

/** Yayına alınmış rehberde hiç yayın kaydı açılmamış platformun sözü. */
/**
 * Platform başlatıcısının "başlamadı" DIŞINDAKİ üçüncü cevabı: aynı taslağın
 * aktif yayını başka bir istekle az önce açıldı (kurulum sürüyor). Sebep
 * yazılmaz, denetime "başlamadı" düşmez.
 */
const SURUYOR = { tur: 'suruyor' } as const;
type BaslatmaSonucu = string | null | typeof SURUYOR;

/**
 * Aktif yayın tekilliği (`yayin_taslak_aktif_key`) çakıştı mı. Prisma ham
 * sorgu hatası kısıt adını mesajda taşıyor (P2010, 23505); PGlite de aynı.
 * Ad ile ayırt ediliyor: başka bir tekillik ihlali (gerçek bir hata) bu
 * dala düşüp "sürüyor" diye yutulmamalı.
 */
export function aktifYayinCakismasiMi(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  const ek = (e as { meta?: { message?: unknown } } | null)?.meta?.message;
  return `${m} ${typeof ek === 'string' ? ek : ''}`.includes('yayin_taslak_aktif_key');
}

export const BASLAMAYAN_PLATFORM_SEBEBI = 'Bu platformda kurulum başlamadı; Yeni reklam ile yeniden deneyebilirsin.';

@Injectable()
export class RehberService {
  private readonly onbellek = new Map<string, OnKosulKaydi>();
  private readonly sayfaOnbellek = new Map<string, SayfaKaydi>();
  /** Form önizlemeleri (`formAyrintisi`); yalnız başarılı okuma. Anahtar `clientId:sayfaId:formId`. */
  private readonly formAyrintiOnbellek = new Map<string, { zaman: number; deger: FormOnizlemesi }>();
  private readonly pikselOnbellek = new Map<string, PikselKaydi>();
  /** SİTE amacının piksel listesi: satın alma istatistiği SORULMADAN (tek çağrı). */
  private readonly sitePikselOnbellek = new Map<string, PikselKaydi>();
  private readonly uzantiOnbellek = new Map<string, UzantiKaydi>();
  /**
   * Site okuyucu (SSRF korumalı `sayfaHtmlGetir`). Alan olarak duruyor ki
   * testler sahtesini versin: servis testleri prova yolunu koşuyor ve gerçek
   * okuyucu orada müşteri sitesine AĞDAN çıkardı.
   */
  siteHtmlOku: (adres: string) => Promise<HtmlSonucu> = (adres) => sayfaHtmlGetir(adres);
  /** Site haritası okuyucu (XML kabul eder; aynı SSRF kuralları). Testte sahte. */
  siteHaritasiGetir: (adres: string) => Promise<HtmlSonucu> = (adres) => sayfaHtmlGetir(adres, 3, { xml: true });
  private readonly metaSurumu: string;
  private sonKelimeIstegi = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hazirlikSvc: ReklamHazirlikService,
    private readonly taslakSvc: ReklamTaslakService,
    private readonly yayinSvc: ReklamYayinService,
    private readonly kuyruk: ReklamKuyrugu,
    private readonly kasa: TokenVaultService,
    private readonly saglayicilar: ProviderRegistry,
    private readonly kota: QuotaGuardService,
    private readonly crypto: CryptoService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(YAPAY_ZEKA) private readonly yz: GeminiIstemcisi | null,
    private readonly youtube: YouTubeApiService,
    private readonly depo: AssetStorageService,
  ) {
    this.metaSurumu = metaSurumuDogrula(config.platforms.meta.apiVersion);
  }

  private tx(ctx: TenantContext): TxRunner {
    return (fn) => this.prisma.withTenant(ctx, (t) => fn(t as never));
  }

  private get google(): GoogleProvider {
    return this.saglayicilar.get('google') as unknown as GoogleProvider;
  }

  // ===========================================================================
  // HAZIRLIK
  // ===========================================================================

  /**
   * `rehberId` verilirse ön koşullar o rehberin SEÇİLİ hesap ve sayfasından
   * okunur (yoksa ilkinden; yeni rehberde panel ilkini önden seçiyor).
   * Önbellek okunan kimliklerle yazılıyor; `baglam` yalnız seçili kimlik
   * önbellektekiyle aynıysa onu kullanıyor, yani yanlış sayfanın cevabı
   * eksik listesine sızamaz.
   */
  async hazirlik(ctx: TenantContext, clientId: string, rehberId?: string): Promise<RehberHazirligi> {
    let secim: RehberHazirlikSecimi | undefined;
    if (rehberId) {
      const s = await this.satir(ctx, rehberId);
      if (s.client_id !== clientId) throw new BadRequestException('Bu reklam başka bir workspace’e ait.');
      const a = alanlariOku(s);
      secim = { metaHesapId: a.metaHesabiId?.deger, sayfaId: a.sayfaId?.deger, googleHesapId: a.googleHesabiId?.deger };
    }
    const h = await this.hazirlikSvc.rehberOku(ctx, clientId, this.platformOkuyucu(ctx), secim);
    this.onbellek.set(clientId, {
      zaman: Date.now(),
      metaHesapId: seciliYoksaIlk(h.hesaplar, secim?.metaHesapId)?.id ?? null,
      googleHesapId: seciliYoksaIlk(h.googleHesaplari, secim?.googleHesapId)?.id ?? null,
      metaAsgari: h.asgariGunluk.meta,
      googleDonusum: h.onKosullar.googleDonusumEtkin,
      googleSatis: h.onKosullar.googleSatisOlcumu,
      googleDonusum30Gun: null,
    });
    const okunan = seciliYoksaIlk(h.sayfalar, secim?.sayfaId)?.id;
    // Karar tablosu prova ÖNCESİ de doğru söylesin: rehberin amacına göre
    // piksel hâli ve dönüşüm sayısı burada okunur (düşerse "bilinmiyor").
    if (rehberId) {
      const a = alanlariOku(await this.satir(ctx, rehberId));
      await this.sitePikselTazele(ctx, clientId, a);
      await this.googleDonusumTazele(ctx, clientId, a, h.onKosullar.googleDonusumEtkin);
    }
    if (okunan) this.sayfaYaz(clientId, okunan, { formKosullari: h.onKosullar.metaFormKosullari, whatsapp: h.onKosullar.metaWhatsapp });
    return h;
  }

  /**
   * Seçili sayfanın Meta'daki YAYINDA anlık formları (Ç-2). Okunamazsa 503 +
   * Meta'nın mesajı: "form yok" ile "okuyamadık" ayrı iş (CLAUDE.md).
   * Başarılı okuma önbelleğe girer; seçili formun eksik kontrolü onu okur.
   */
  async formSablonlari(ctx: TenantContext, clientId: string, sayfaId: string): Promise<RehberFormListesi> {
    erisim(ctx, clientId);
    const tx = this.tx(ctx);
    const [s] = await tx((t) =>
      t.$queryRaw<Array<{ external_id: string }>>(Prisma.sql`
        SELECT external_id FROM social_profiles WHERE id = ${sayfaId}::uuid AND client_id = ${clientId}::uuid AND profile_type = 'facebook_page'`),
    );
    if (!s) throw new BadRequestException('Facebook sayfası bu workspace’te değil.');
    let okunan: { satirlar: MetaFormSatiri[]; kesildi: boolean };
    try {
      // Platform çağrısı transaction DIŞINDA: token kendi kısa transaction'ında okunur.
      const token = await sayfaTokenOkuyucu(tx, this.crypto, clientId)(s.external_id);
      okunan = await metaSayfaFormlariOku(this.metaSurumu, s.external_id, token);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.warn(`Form listesi okunamadı (sayfa ${sayfaId}): ${m}`);
      throw new ServiceUnavailableException(`Meta formları okunamadı: ${m}`);
    }
    // Advetics'te yayınlanmış formun adı Advetics'teki ad (lead senkronizasyonu
    // ile aynı kural); liste yine Meta'nın: orada yayında olmayan form girmez.
    const bizim = await tx((t) =>
      t.$queryRaw<Array<{ external_form_id: string; name: string }>>(Prisma.sql`
        SELECT DISTINCT ON (external_form_id) external_form_id, name FROM lead_forms
         WHERE client_id = ${clientId}::uuid AND social_profile_id = ${sayfaId}::uuid AND external_form_id IS NOT NULL
         ORDER BY external_form_id, created_at DESC`),
    );
    const adlar = new Map(bizim.map((b) => [b.external_form_id, b.name]));
    const satirlar = okunan.satirlar.map((f) => ({ ...f, ad: adlar.get(f.id) ?? f.ad }));
    this.sayfaYaz(clientId, sayfaId, { formlar: satirlar });
    return {
      satirlar,
      toplam: satirlar.length,
      kesildi: okunan.kesildi,
      bosNeden: satirlar.length ? null : "Bu sayfada yayında anlık form yok. Formu Meta'da (Reklam Yöneticisi > Anlık formlar) oluşturup yayınla, sonra listeyi yenile.",
    };
  }

  /**
   * Seçili sayfanın TEK formunun önizlemesi (form seçicinin "Önizle"si).
   *
   * Sınırlar platforma GİTMEDEN kontrol ediliyor: workspace erişimi, sayfanın
   * bu workspace'te olması (başka workspace'in sayfası = 400, sıfır çağrı).
   * Okunan formun sayfası seçili sayfa DEĞİLSE de 400: aynı ajans kimliği
   * birçok sayfanın formunu okuyabilir ve kimliği elle değiştirilmiş bir
   * istek başka müşterinin formunu gösterirdi. Meta `page_id`'yi döndürmezse
   * yalnız seçili sayfanın son başarılı listesinde olan form kabul ediliyor;
   * ikisi de yoksa ret (bilinmeyeni "bu sayfanın" saymıyoruz).
   *
   * Kota bekçisinden geçer (anahtar SOSYAL PROFİL: çağrı sayfa token'ıyla
   * gidiyor, form yayınıyla aynı kural). Başarılı okuma 10 dk önbellekte:
   * kullanıcı aynı formu açıp kapadıkça Meta'ya gitmesin. Okunamazsa 503 +
   * Meta'nın mesajı; okunamayan önizleme önbelleğe GİRMEZ.
   */
  async formAyrintisi(ctx: TenantContext, clientId: string, sayfaId: string, formId: string): Promise<FormOnizlemesi> {
    erisim(ctx, clientId);
    if (!/^\d{1,30}$/.test(formId)) throw new BadRequestException('Form kimliği geçersiz.');
    const tx = this.tx(ctx);
    const [s] = await tx((t) =>
      t.$queryRaw<Array<{ external_id: string }>>(Prisma.sql`
        SELECT external_id FROM social_profiles WHERE id = ${sayfaId}::uuid AND client_id = ${clientId}::uuid AND profile_type = 'facebook_page'`),
    );
    if (!s) throw new BadRequestException('Facebook sayfası bu workspace’te değil.');
    const anahtar = `${clientId}:${sayfaId}:${formId}`;
    const eski = this.formAyrintiOnbellek.get(anahtar);
    if (eski && Date.now() - eski.zaman < FORM_AYRINTI_MS) return eski.deger;

    if (!this.kota.isEnabled) {
      logger.warn('Kota bekçisi kapalı (REDIS_URL yok); form önizlemesi kota kontrolsüz gidiyor.');
    } else {
      const g = await this.kota.acquire({ platform: 'meta', adAccountId: sayfaId, layer: 'interactive' });
      if (!g.allowed) {
        const dk = Math.max(1, Math.ceil((g.retryAfterMs ?? 60_000) / 60_000));
        throw new ServiceUnavailableException(`Meta kotası şu an dolu (${g.reason ?? 'kota'}). Yaklaşık ${dk} dakika sonra tekrar dene.`);
      }
    }

    let okunan: Awaited<ReturnType<typeof metaFormAyrintisiOku>>;
    try {
      const token = await sayfaTokenOkuyucu(tx, this.crypto, clientId)(s.external_id);
      okunan = await metaFormAyrintisiOku(this.metaSurumu, formId, token);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.warn(`Form önizlemesi okunamadı (sayfa ${sayfaId}, form ${formId}): ${m}`);
      throw new ServiceUnavailableException(`Form Meta'dan okunamadı: ${m}`);
    }
    const listede = this.sayfaOnbellek.get(`${clientId}:${sayfaId}`)?.formlar?.some((f) => f.id === formId) ?? false;
    if (okunan.sayfaPlatformId ? okunan.sayfaPlatformId !== s.external_id : !listede) {
      throw new BadRequestException('Bu form seçili Facebook sayfasının değil.');
    }
    // Advetics'te yayınlanmış formun adı Advetics'teki ad (liste ile aynı kural).
    const [bizim] = await tx((t) =>
      t.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT name FROM lead_forms
         WHERE client_id = ${clientId}::uuid AND social_profile_id = ${sayfaId}::uuid AND external_form_id = ${formId}
         ORDER BY created_at DESC LIMIT 1`),
    );
    const { sayfaPlatformId: _sayfa, ...onizleme } = okunan;
    const deger: FormOnizlemesi = { ...onizleme, ad: bizim?.name ?? onizleme.ad };
    this.formAyrintiOnbellek.set(anahtar, { zaman: Date.now(), deger });
    return deger;
  }

  /**
   * Seçili Meta reklam hesabının pikselleri (Dalga 3). Okunamazsa 503 +
   * Meta'nın mesajı: "piksel yok" ile "okuyamadık" ayrı iş. Platform çağrısı
   * transaction DIŞINDA (token kendi kısa transaction'ında okunur).
   */
  async pikseller(ctx: TenantContext, clientId: string, adAccountId: string): Promise<RehberPikselListesi> {
    erisim(ctx, clientId);
    let okunan: { satirlar: PikselSatiri[]; kesildi: boolean };
    try {
      okunan = await this.pikselOku(ctx, clientId, adAccountId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.warn(`Piksel listesi okunamadı (hesap ${adAccountId}): ${m}`);
      throw new ServiceUnavailableException(`Meta pikselleri okunamadı: ${m}`);
    }
    return {
      satirlar: okunan.satirlar,
      toplam: okunan.satirlar.length,
      kesildi: okunan.kesildi,
      bosNeden: okunan.satirlar.length
        ? null
        : "Bu reklam hesabında Meta pikseli yok. Pikseli Meta'da (Etkinlik Yöneticisi) oluşturup sitene kur, sonra listeyi yenile.",
    };
  }

  /** Piksel okuması + önbellek. Hata FIRLATIR (önbelleğe yazılmaz). */
  private async pikselOku(ctx: TenantContext, clientId: string, adAccountId: string): Promise<{ satirlar: PikselSatiri[]; kesildi: boolean }> {
    const e = await hesapErisimi(this.tx(ctx), this.crypto, adAccountId, clientId);
    const p = this.saglayicilar.get('meta') as unknown as Partial<Pick<MetaProvider, 'fetchAdPixels'>>;
    if (typeof p.fetchAdPixels !== 'function') throw new Error('Meta sağlayıcısı piksel okumayı desteklemiyor');
    const r = await p.fetchAdPixels({ adAccountPath: e.hesap, accessToken: e.kullaniciToken });
    this.pikselOnbellek.set(`${clientId}:${adAccountId}`, { zaman: Date.now(), satirlar: r.satirlar, kesildi: r.kesildi });
    return r;
  }

  private pikselKaydi(clientId: string, adAccountId: string | null | undefined): { satirlar: PikselSatiri[]; kesildi: boolean } | null {
    if (!adAccountId) return null;
    const k = this.pikselOnbellek.get(`${clientId}:${adAccountId}`);
    return k && Date.now() - k.zaman < ONBELLEK_MS ? { satirlar: k.satirlar, kesildi: k.kesildi } : null;
  }

  private sitePikselKaydi(clientId: string, adAccountId: string): { satirlar: PikselSatiri[]; kesildi: boolean } | null {
    const k = this.sitePikselOnbellek.get(`${clientId}:${adAccountId}`);
    return k && Date.now() - k.zaman < ONBELLEK_MS ? { satirlar: k.satirlar, kesildi: k.kesildi } : null;
  }

  private sayfaYaz(clientId: string, sayfaId: string, d: Omit<SayfaKaydi, 'zaman'>): void {
    const k = `${clientId}:${sayfaId}`;
    const eski = this.sayfaOnbellek.get(k);
    // Alanlar ayrı ayrı tazeleniyor ama zaman tek: bayat bir alanı yeni bir
    // zamanla taze göstermemek için bayat kayıt baştan kuruluyor.
    const taban = eski && Date.now() - eski.zaman < ONBELLEK_MS ? eski : { zaman: 0 };
    this.sayfaOnbellek.set(k, { ...taban, ...d, zaman: Date.now() });
  }

  private sayfaOku(clientId: string, sayfaId: string | null | undefined): SayfaKaydi | null {
    if (!sayfaId) return null;
    const k = this.sayfaOnbellek.get(`${clientId}:${sayfaId}`);
    return k && Date.now() - k.zaman < ONBELLEK_MS ? k : null;
  }

  /**
   * PROVA ÖNCESİ TAZELEME: seçili sayfanın ön koşulları ve (Form amacında)
   * form listesi TAZE okunur, sonra eksik listesi hesaplanır. Eksik listesi
   * önbellekten çalışıyor (PUT her tuşta Meta'ya gitmesin) ve önbellek ilk
   * sayfa için doluyordu; provaya giden hâl ise BİLİNEN hâl olmalı. Okuma
   * düşerse değer `null` kalır ve uyarı olarak görünür (sessiz değil, log).
   * Platform çağrıları transaction DIŞINDA.
   */
  private async sayfaTazele(ctx: TenantContext, clientId: string, a: RehberAlanlari): Promise<void> {
    const sayfaId = a.sayfaId?.deger;
    const amac = a.amac?.deger;
    const guvenli = async <T>(ad: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        logger.warn(`Prova öncesi ${ad} okunamadı (sayfa ${sayfaId ?? '-'}): ${(e as Error).message}`);
        return null;
      }
    };
    // SATIŞ: seçili hesabın pikselleri TAZE okunur (hesap başına, sayfadan
    // bağımsız). Düşerse önbellek yazılmaz ve piksel "bilinmiyor" kalır;
    // `platformaGiderken` onu engele çevirir.
    const hesapId = a.metaHesabiId?.deger;
    if (amac === 'SATIS' && a.platformlar?.deger.meta && hesapId) {
      await guvenli('piksel listesi', () => this.pikselOku(ctx, clientId, hesapId));
      return;
    }
    // SİTE: hedef (sayfa görüntüleme ↔ tıklama) pikselin hâline bağlı;
    // prova TAZE okumayla türetir. Düşerse hâl `bilinmiyor` = tıklama.
    if (amac === 'SITE') {
      await this.sitePikselTazele(ctx, clientId, a);
      return;
    }
    if (!sayfaId || !a.platformlar?.deger.meta || (amac !== 'FORM' && amac !== 'WHATSAPP')) return;
    const okuyucu = this.platformOkuyucu(ctx);
    if (amac === 'WHATSAPP') {
      this.sayfaYaz(clientId, sayfaId, { whatsapp: await guvenli('WhatsApp hattı', () => okuyucu.metaWhatsapp(sayfaId, clientId)) });
      return;
    }
    this.sayfaYaz(clientId, sayfaId, { formKosullari: await guvenli('form koşulları', () => okuyucu.metaFormKosullari(sayfaId, clientId)) });
    // Liste düşerse `formSablonlari` YAZMADAN fırlatır: eski başarılı liste
    // süresi dolana kadar kalır, yoksa seçili form "bilinmiyor" uyarısı olur.
    await guvenli('form listesi', () => this.formSablonlari(ctx, clientId, sayfaId));
  }

  /**
   * SATIŞ amacında Google'ın satın alma ölçümünü prova/yayından önce TAZE
   * okur (`sayfaTazele`nin Google karşılığı). Hazırlık önbelleği 15 dk ve
   * yalnız hazırlık ucunda doluyordu; prova onu bulamazsa Maks. Performans
   * "bilinmiyor" engeline düşerdi. Okuma düşerse `null` yazılır (log), engel
   * sebebini söyler.
   */
  private async googleSatisTazele(ctx: TenantContext, clientId: string, a: RehberAlanlari): Promise<void> {
    const hesap = a.googleHesabiId?.deger;
    if (!hesap || a.amac?.deger !== 'SATIS' || !a.platformlar?.deger.google) return;
    let satis: boolean | null = null;
    try {
      satis = await this.platformOkuyucu(ctx).googleSatisOlcumu(hesap);
    } catch (e) {
      logger.warn(`Prova öncesi Google satış ölçümü okunamadı (hesap ${hesap}): ${(e as Error).message}`);
    }
    const o = this.onbellek.get(clientId);
    const taze = o && Date.now() - o.zaman < ONBELLEK_MS ? o : null;
    this.onbellek.set(clientId, {
      zaman: taze?.zaman ?? Date.now(),
      metaHesapId: taze?.metaHesapId ?? null,
      googleHesapId: hesap,
      metaAsgari: taze?.metaAsgari ?? null,
      // Hesap değiştiyse eski hesabın dönüşüm hâli taşınmaz.
      googleDonusum: taze && taze.googleHesapId === hesap ? taze.googleDonusum : null,
      googleSatis: satis,
      googleDonusum30Gun: taze && taze.googleHesapId === hesap ? taze.googleDonusum30Gun : null,
    });
  }

  /** SİTE piksel listesi (satın alma istatistiği SORULMADAN). Hata FIRLATIR, önbelleğe yazılmaz. */
  private async sitePikselOku(ctx: TenantContext, clientId: string, adAccountId: string): Promise<void> {
    const e = await hesapErisimi(this.tx(ctx), this.crypto, adAccountId, clientId);
    const p = this.saglayicilar.get('meta') as unknown as Partial<Pick<MetaProvider, 'fetchAdPixels'>>;
    if (typeof p.fetchAdPixels !== 'function') throw new Error('Meta sağlayıcısı piksel okumayı desteklemiyor');
    const r = await p.fetchAdPixels({ adAccountPath: e.hesap, accessToken: e.kullaniciToken, satinAlmaSor: false });
    this.sitePikselOnbellek.set(`${clientId}:${adAccountId}`, { zaman: Date.now(), satirlar: r.satirlar, kesildi: r.kesildi });
  }

  /** "Siteme gelsinler" + Meta + hesap seçiliyse piksel listesini tazeler; düşerse log (hâl `bilinmiyor`). */
  private async sitePikselTazele(ctx: TenantContext, clientId: string, a: RehberAlanlari): Promise<void> {
    const hesapId = a.metaHesabiId?.deger;
    if (a.amac?.deger !== 'SITE' || !a.platformlar?.deger.meta || !hesapId) return;
    try {
      await this.sitePikselOku(ctx, clientId, hesapId);
    } catch (e) {
      logger.warn(`Site amacı piksel listesi okunamadı (hesap ${hesapId}): ${(e as Error).message}`);
      // ESKİ "AKTİF" KAYDI EZ (Ajan 4, N-1): okuma düştüğünde önbellekteki
      // önceki okuma kalsaydı, piksel kaldırılmış olsa bile 15 dakika LPV
      // kurulurdu. Düşen okuma = bilinmiyor = tıklama.
      this.sitePikselOnbellek.set(`${clientId}:${hesapId}`, { zaman: Date.now(), satirlar: [], kesildi: false, okunamadi: true });
    }
  }

  /**
   * ARAMA kurgusunda dönüşüm ölçümünü ve son 30 günün dönüşüm sayısını TAZE
   * okur (teklif eşiği). `etkinBilinen` verilirse (hazırlık az önce okudu)
   * ölçüm yeniden sorulmaz. Sayı YALNIZ ölçüm etkinse sorulur: etkin değilse
   * cevap zaten tıklama ve çağrı boşa kota. Düşerse `null` + log.
   */
  private async googleDonusumTazele(ctx: TenantContext, clientId: string, a: RehberAlanlari, etkinBilinen?: boolean | null): Promise<void> {
    const hesap = a.googleHesabiId?.deger;
    const amac = a.amac?.deger;
    if (!hesap || !amac || !a.platformlar?.deger.google || REHBER_AMACLARI[amac].google.kurgu !== 'ARAMA') return;
    /*
     * TELEFON: teklif her zaman tıklama (`googleTeklifKarari`, Ö-1); dönüşüm
     * okuması karara girmiyor ve kota harcamasın diye HİÇ yapılmıyor.
     */
    if (REHBER_AMACLARI[amac].google.ulasma === 'telefon') return;
    let etkin: boolean | null = etkinBilinen ?? null;
    let sayi: number | null = null;
    try {
      if (etkinBilinen === undefined) etkin = await this.platformOkuyucu(ctx).googleDonusumEtkin(hesap);
      if (etkin === true) sayi = await this.googleDonusumSayisi(ctx, hesap);
    } catch (e) {
      logger.warn(`Google dönüşüm sayısı okunamadı (hesap ${hesap}): ${(e as Error).message}`);
    }
    const o = this.onbellek.get(clientId);
    const taze = o && Date.now() - o.zaman < ONBELLEK_MS ? o : null;
    this.onbellek.set(clientId, {
      zaman: taze?.zaman ?? Date.now(),
      metaHesapId: taze?.metaHesapId ?? null,
      googleHesapId: hesap,
      metaAsgari: taze?.metaAsgari ?? null,
      googleDonusum: etkin,
      googleSatis: taze && taze.googleHesapId === hesap ? taze.googleSatis : null,
      googleDonusum30Gun: sayi,
    });
  }

  /**
   * Hesabın son 30 gündeki dönüşüm sayısı (`metrics.conversions` = yalnız
   * "dönüşümlere dahil" işlemler, teklifin öğrendiği sayı). Kota bekçisinden.
   * `ads-kurulum.ts`teki harcama sorgusuyla aynı biçim (müşteri düzeyi,
   * `segments.date DURING`). Okunamayan değer sıfır SAYILMAZ: fırlatır.
   */
  private async googleDonusumSayisi(ctx: TenantContext, adAccountId: string): Promise<number> {
    const { fctx } = await this.googleBaglami(ctx, adAccountId, null);
    await this.kotaKapisi(adAccountId);
    const r = await this.google.rehberAra<{ metrics?: { conversions?: number | string } }>(fctx, GOOGLE_DONUSUM_SAYISI_SORGUSU);
    let toplam = 0;
    for (const x of r) {
      const v = x.metrics?.conversions;
      // Proto3 JSON'da sıfır değerli alan HİÇ gelmeyebilir: eksik = 0.
      const n = v === undefined ? 0 : Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`Dönüşüm sayısı çözülemedi: ${String(v)}`);
      toplam += n;
    }
    return toplam;
  }

  /**
   * ARAMA + SİTE: sitenin alt sayfalarını okuyup site bağlantısı kaynağını
   * önbelleğe yazar (`google-uzanti.ts`). Ana sayfa + en çok
   * `ALT_SAYFA_ADAY_SINIRI` alt sayfa, SSRF korumalı okuyucuyla
   * (`sayfaHtmlGetir`, Ölçüm ve hazırlığın kullandığı). Alt sayfalar
   * PARALEL: tek tek 8 sn zaman aşımı prova isteğini dakikalarca tutardı.
   * Yönlendirmeyle BAŞKA alana giden sayfa atlanır.
   */
  private async siteUzantiTazele(clientId: string, a: RehberAlanlari, markaAdi: string | null): Promise<void> {
    const amac = a.amac?.deger;
    const adres = a.hedefAdres?.deger;
    if (!amac || !adres || !a.platformlar?.deger.google) return;
    const g = REHBER_AMACLARI[amac].google;
    if (g.kurgu !== 'ARAMA' || g.ulasma !== 'site') return;
    const yaz = (siteBaglantilari: SiteBaglantisi[], sebep: string | null, menuMetinleri: string[] = []) =>
      this.uzantiOnbellek.set(clientId, { zaman: Date.now(), adres, siteBaglantilari, sebep, menuMetinleri });
    try {
      const ana = await this.siteHtmlOku(adres);
      if (!ana.ok) return void yaz([], `Site okunamadı: ${ana.sebep}`);
      const menu = altSayfaAdaylari(ana.html, ana.adres);
      const menuMetinleri = menu.map((x) => x.metin).filter((x): x is string => !!x);
      const alanAdi = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, '');
      const okuAdaylar = async (adaylar: Array<{ adres: string; metin: string | null }>) => {
        // En çok ALT_SAYFA_ESZAMANLI istek aynı anda (paylaşımlı VPS); sıra
        // korunuyor çünkü bağlantı sırası sitedeki menü sırası.
        const okunan: Array<SiteAltSayfasi | null> = new Array(adaylar.length).fill(null);
        let sira = 0;
        const isci = async () => {
          while (sira < adaylar.length) {
            const i = sira++;
            const c = adaylar[i]!;
            const r = await this.siteHtmlOku(c.adres);
            if (!r.ok || !r.adres.startsWith('https://') || alanAdi(r.adres) !== alanAdi(ana.adres)) continue;
            okunan[i] = { adres: r.adres, ...sayfaOzeti(r.html), baglantiMetni: c.metin };
          }
        };
        await Promise.all(Array.from({ length: Math.min(ALT_SAYFA_ESZAMANLI, adaylar.length) }, isci));
        return okunan.filter((x): x is SiteAltSayfasi => x !== null);
      };
      // Ana sayfaya (ve reklamın kendi hedefine) yönlenen sayfa bağlantı değil;
      // tekillik SON adreste (Ajan 4, Ö-2).
      let sayfalar = await okuAdaylar(menu);
      let baglantilar = siteBaglantilariUret(sayfalar, markaAdi, [ana.adres, adres]);
      let haritaSayfasi: number | null = null;
      let aday = menu.length;
      if (baglantilar.length === 0) {
        // İKİNCİ KAYNAK: site haritası (tek sayfalık site, JavaScript menüsü).
        // Menüden zaten okunan adresler tekrar okunmaz.
        const harita = await this.haritaAdresleri(ana.adres);
        if (harita !== null) {
          const anahtar = (u: string) => u.replace(/\/+$/, '').toLowerCase();
          const gorulen = new Set([ana.adres, adres, ...menu.map((x) => x.adres)].map(anahtar));
          const ek = harita.filter((u) => !gorulen.has(anahtar(u))).slice(0, ALT_SAYFA_ADAY_SINIRI).map((u) => ({ adres: u, metin: null }));
          haritaSayfasi = harita.filter((u) => anahtar(u) !== anahtar(ana.adres) && anahtar(u) !== anahtar(adres)).length;
          if (ek.length) {
            sayfalar = [...sayfalar, ...(await okuAdaylar(ek))];
            aday += ek.length;
            baglantilar = siteBaglantilariUret(sayfalar, markaAdi, [ana.adres, adres]);
          }
        }
      }
      yaz(
        baglantilar,
        baglantilar.length ? null : siteBaglantisiSebebi({ cipa: cipaBaglantiSayisi(ana.html), aday, haritaSayfasi, acilan: sayfalar.length }),
        menuMetinleri,
      );
    } catch (e) {
      yaz([], `Site okunamadı: ${(e as Error).message}`);
    }
  }

  /**
   * Site haritasındaki sayfa adresleri; harita yoksa `null`. Sırayla
   * `/sitemap.xml`, `/wp-sitemap.xml`, `/sitemap_index.xml` (WordPress ve
   * Yoast'un adresleri; Ege Birlik Yapı'da yalnız ikincisi var). Dizin bir
   * kat açılıyor, en çok iki alt harita: paylaşımlı sunucudan müşteri sitesine
   * sınırsız istek atılmaz.
   */
  private async haritaAdresleri(anaAdres: string): Promise<string[] | null> {
    const kok = new URL('/', anaAdres).toString();
    for (const yol of ['sitemap.xml', 'wp-sitemap.xml', 'sitemap_index.xml']) {
      const r = await this.siteHaritasiGetir(new URL(yol, kok).toString());
      if (!r.ok || !/<(urlset|sitemapindex)\b/i.test(r.html)) continue;
      const ilk = siteHaritasiOku(r.html, anaAdres);
      const sayfalar = [...ilk.sayfalar];
      for (const alt of ilk.altHaritalar.slice(0, 2)) {
        const a = await this.siteHaritasiGetir(alt);
        if (a.ok) sayfalar.push(...siteHaritasiOku(a.html, anaAdres).sayfalar);
      }
      return [...new Set(sayfalar)];
    }
    return null;
  }

  private platformOkuyucu(ctx: TenantContext): RehberPlatformOkuyucu {
    const tx = this.tx(ctx);
    return {
      metaAsgariGunluk: async (adAccountId, clientId) => {
        const e = await hesapErisimi(tx, this.crypto, adAccountId, clientId);
        return metaAsgariOku(this.metaSurumu, e.hesap, e.kullaniciToken, e.paraBirimi);
      },
      metaFormKosullari: async (sayfaId, clientId) => {
        const [s] = await tx((t) =>
          t.$queryRaw<Array<{ external_id: string }>>(Prisma.sql`
            SELECT external_id FROM social_profiles WHERE id = ${sayfaId}::uuid AND client_id = ${clientId}::uuid AND profile_type = 'facebook_page'`),
        );
        if (!s) return null;
        const token = await sayfaTokenOkuyucu(tx, this.crypto, clientId)(s.external_id);
        return metaFormKosuluOku(this.metaSurumu, s.external_id, token);
      },
      metaWhatsapp: async (sayfaId, clientId) => {
        const [s] = await tx((t) =>
          t.$queryRaw<Array<{ external_id: string }>>(Prisma.sql`
            SELECT external_id FROM social_profiles WHERE id = ${sayfaId}::uuid AND client_id = ${clientId}::uuid AND profile_type = 'facebook_page'`),
        );
        if (!s) return null;
        const token = await sayfaTokenOkuyucu(tx, this.crypto, clientId)(s.external_id);
        // VAR OLAN OKUYUCU (`MetaProvider.fetchPageWhatsapp`, bağlantılar
        // ekranının teyit kutusu): ikinci bir okuyucu yazmak, biri alanı
        // değiştirdiğinde öbürünün sessizce eski kalması demekti.
        const p = this.saglayicilar.get('meta') as unknown as Partial<Pick<MetaProvider, 'fetchPageWhatsapp'>>;
        if (typeof p.fetchPageWhatsapp !== 'function') return null;
        const r = await p.fetchPageWhatsapp({ pageExternalId: s.external_id, pageAccessToken: token });
        if (r.hata) logger.warn(`Sayfanın WhatsApp hattı okunamadı (${sayfaId}): ${r.hata}`);
        return whatsappHali(r);
      },
      metaSatisOlcumu: async (adAccountId, clientId) => hazirlikSatisOlcumu((await this.pikselOku(ctx, clientId, adAccountId)).satirlar),
      googleDonusumEtkin: async (adAccountId) => {
        const { fctx } = await this.googleBaglami(ctx, adAccountId, null);
        await this.kotaKapisi(adAccountId);
        const r = await this.google.rehberAra<{ conversionAction?: { id?: string } }>(
          fctx,
          `SELECT conversion_action.id FROM conversion_action
            WHERE conversion_action.status = 'ENABLED' AND conversion_action.primary_for_goal = TRUE LIMIT 1`,
        );
        return r.length > 0;
      },
      googleSatisOlcumu: async (adAccountId) => {
        const { fctx } = await this.googleBaglami(ctx, adAccountId, null);
        await this.kotaKapisi(adAccountId);
        // WHERE'deki HER alan SELECT'te (GAQL kuralı, canlıda `campaign_asset`
        // ile öğrenildi). Kategori PURCHASE = "Satın alma"; birincil olmayan
        // işlem teklifi beslemiyor, sayılmaz.
        const r = await this.google.rehberAra<{ conversionAction?: { id?: string } }>(
          fctx,
          `SELECT conversion_action.id, conversion_action.status, conversion_action.primary_for_goal, conversion_action.category
             FROM conversion_action
            WHERE conversion_action.status = 'ENABLED' AND conversion_action.primary_for_goal = TRUE
              AND conversion_action.category = 'PURCHASE' LIMIT 1`,
        );
        return r.length > 0;
      },
    };
  }

  // ===========================================================================
  // CRUD
  // ===========================================================================

  /**
   * Workspace'in rehberleri — ARŞİV DAHİL (giriş ekranının Arşiv sekmesi).
   * Sıra: arşiv en sonda, sonra son değişiklik; `REHBER_LISTE_SINIRI`
   * aşılırsa önce arşiv kesilir ve `toplam` gerçek sayıyı söyler.
   *
   * SABİT SAYIDA SORGU: satırlar + sayım + yayın durumları + küçük
   * görseller tek transaction'da, bağlam (`baglamlar`) bir transaction'da.
   * Önceki sürüm satır başına `baglam` ve `yayinDurumu` çağırıyordu.
   */
  async listele(ctx: TenantContext, clientId: string): Promise<RehberListesi> {
    erisim(ctx, clientId);
    const okunan = await this.tx(ctx)(async (t) => {
      const satirlar = await t.$queryRaw<Array<RehberSatiri & { created_at: Date }>>(Prisma.sql`
        SELECT ${SUTUNLAR}, created_at FROM reklam_rehberi
         WHERE client_id = ${clientId}::uuid
         ORDER BY (durum = 'arsivlendi'), updated_at DESC, id
         LIMIT ${REHBER_LISTE_SINIRI}::int`);
      const [sayim] = await t.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int AS n FROM reklam_rehberi WHERE client_id = ${clientId}::uuid`);
      const taslakIdleri = satirlar.flatMap((x) => [x.meta_taslak_id, x.google_taslak_id]).filter((x): x is string => !!x);
      // Taslak başına SON yayın, `yayinDurumu` ile AYNI öncelik: süren
      // (sonlanmamış) kayıt önce, sonra en yenisi. Hesabın saat dilimi ad
      // tarihini üretiyor; hesap satırı RLS'te görünmezse ana satır
      // düşmesin diye LEFT JOIN.
      const yayinlar = taslakIdleri.length
        ? await t.$queryRaw<Array<{ taslak_id: string; id: string; durum: YayinDurumu; sebep: string | null; created_at: Date; timezone: string | null }>>(Prisma.sql`
            SELECT DISTINCT ON (y.taslak_id) y.taslak_id::text, y.id::text, y.durum, y.sebep, y.created_at, a.timezone
              FROM yayin y LEFT JOIN ad_accounts a ON a.id = y.ad_account_id
             WHERE y.taslak_id = ANY(${taslakIdleri}::uuid[])
             ORDER BY y.taslak_id, (y.sonlandi_at IS NULL) DESC, y.created_at DESC`)
        : [];
      // Küçük görsel adayları: ilk medyanın kapağı (video) ve kendisi.
      const adaylar = satirlar.map((x) => gorselAdaylari(alanlariOku(x)));
      const adayIdleri = [...new Set(adaylar.flat())];
      const gorseller = adayIdleri.length
        ? await t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id::text FROM assets WHERE client_id = ${clientId}::uuid AND kind = 'image' AND id = ANY(${adayIdleri}::uuid[])`)
        : [];
      return { satirlar, toplam: sayim?.n ?? satirlar.length, yayinlar, adaylar, gorseller: new Set(gorseller.map((g) => g.id)) };
    });
    const alanlar = okunan.satirlar.map((x) => alanlariOku(x));
    const baglamlar = await this.baglamlar(ctx, clientId, alanlar);
    const yayinOku = (taslakId: string | null) => (taslakId ? okunan.yayinlar.find((y) => y.taslak_id === taslakId) ?? null : null);
    const satirlar = okunan.satirlar.map((s, i): RehberOzeti => {
      const a = alanlar[i]!;
      const b = baglamlar[i]!;
      // Yayınlanmış satırda platformların GERÇEK hâli: "Vazgeç ve arşivle"
      // rehberin durumunu değiştirmiyor, liste yalnız onu okuyunca
      // arşivlenen reklam "Yayında" görünüyordu. Kaydı olmayan platform
      // `yayinDurumu` ile aynı sebebi taşır. Arşivdeki satır da (listeden
      // kaldırılmış yayın) platform hâlini gösterir: kampanya platformda
      // durmaya devam ediyor.
      const yayinVar = s.durum !== 'taslak';
      const platformYayinlari = yayinVar
        ? (
            [
              ['meta', s.meta_taslak_id],
              ['google', s.google_taslak_id],
            ] as Array<[RehberPlatformu, string | null]>
          )
            .filter(([, tid]) => !!tid)
            .map(([platform, tid]) => {
              const y = yayinOku(tid);
              return { platform, durum: y?.durum ?? null, sebep: y ? y.sebep : BASLAMAYAN_PLATFORM_SEBEBI, y };
            })
        : [];
      // Arşivde ama hiç yayına gitmemiş taslak: platform satırı yok.
      const gercekYayinlar = s.durum === 'arsivlendi' && platformYayinlari.every((p) => !p.y) ? [] : platformYayinlari;
      const adKaynagi = gercekYayinlar.find((p) => p.y)?.y ?? null;
      const amac = a.amac?.deger ?? null;
      const butce = a.butce?.deger;
      return {
        id: s.id,
        amac,
        durum: s.durum,
        platformlar: a.platformlar?.deger ?? { meta: false, google: false },
        eksikSayisi: rehberEksikleri(a, b).filter((e) => e.seviye === 'engel').length,
        yayinlar: gercekYayinlar.map(({ platform, durum, sebep }) => ({ platform, durum, sebep })),
        gorselVarlikId: okunan.adaylar[i]!.find((id) => okunan.gorseller.has(id)) ?? null,
        butce: butce ? { tip: butce.tip, micros: butce.micros, paraBirimi: b.paraBirimi } : null,
        yayinAdi: adKaynagi && amac ? advKampanyaAdi(yerelTarih(new Date(adKaynagi.created_at), adKaynagi.timezone ?? 'Europe/Istanbul'), REHBER_AMACLARI[amac].ekranAdi, adKaynagi.id) : null,
        createdAt: new Date(s.created_at).toISOString(),
        updatedAt: new Date(s.updated_at).toISOString(),
      };
    });
    return { satirlar, toplam: okunan.toplam };
  }

  async olustur(ctx: TenantContext, clientId: string, kaynakRehberId?: string): Promise<RehberKaydi> {
    erisim(ctx, clientId);
    const s = await this.tx(ctx)(async (t) => {
      // org_id HEDEF WORKSPACE'TEN: "tüm şirketler" modunda ctx.orgId ev
      // şirketi kalıyor ve (client_id, org_id) kompozit anahtarını deler.
      const [c] = await t.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`SELECT org_id::text FROM clients WHERE id = ${clientId}::uuid`);
      if (!c) throw new NotFoundException('Workspace bulunamadı');
      let alanlar: RehberAlanlari = {};
      if (kaynakRehberId) {
        // Kaynak AYNI workspace'te olmalı: başka bir müşterinin hesabı ve
        // görselleri bu workspace'in taslağına taşınmamalı (aitlik ayrıca).
        const [k] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`SELECT ${SUTUNLAR} FROM reklam_rehberi WHERE id = ${kaynakRehberId}::uuid`);
        if (!k || k.client_id !== clientId) throw new NotFoundException('Kopyalanacak reklam bulunamadı');
        alanlar = kopyalanacakAlanlar(alanlariOku(k));
        await aitlikDenetle(t, clientId, alanlar);
      }
      const [r] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`
        INSERT INTO reklam_rehberi (org_id, client_id, olusturan_id, alanlar)
        VALUES (${c.org_id}::uuid, ${clientId}::uuid, ${ctx.userId}::uuid, ${JSON.stringify(alanlar)}::jsonb)
        RETURNING ${SUTUNLAR}`);
      return r!;
    });
    return this.kayit(ctx, s);
  }

  async oku(ctx: TenantContext, id: string): Promise<RehberKaydi> {
    return this.kayit(ctx, await this.satir(ctx, id));
  }

  /**
   * PUT — değişiklikleri birleştir, doğrula, İYİMSER KİLİTLE yaz. İki sekme
   * aynı rehberi yazarsa ikincisi 409 alır ("Başka bir sekmede değişti");
   * sessizce ezilseydi biri yazdığını kaybederdi ve fark etmezdi.
   */
  async guncelle(ctx: TenantContext, id: string, dto: RehberGuncelle): Promise<RehberKaydi> {
    return this.yaz(ctx, id, dto, false);
  }

  /**
   * `sunucuEslemesi`: yalnız `konumlariEsle` true geçer. İstemciden gelen
   * konumun Google karşılığı atılıyor (BULGU-4); sunucunun kendi eşlemesi
   * aynı yoldan yazılırken atılmamalı. Controller bu bayrağı GEÇEMEZ.
   */
  private async yaz(ctx: TenantContext, id: string, dto: RehberGuncelle, sunucuEslemesi: boolean): Promise<RehberKaydi> {
    const zaman = new Date().toISOString();
    const s = await this.tx(ctx)(async (t) => {
      const [r] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`SELECT ${SUTUNLAR} FROM reklam_rehberi WHERE id = ${id}::uuid FOR UPDATE`);
      if (!r) throw new NotFoundException('Rehber bulunamadı');
      erisim(ctx, r.client_id);
      if (r.durum !== 'taslak') throw new ConflictException(r.durum === 'yayinda' ? 'Yayına alınmış rehber düzenlenmez; yeni bir reklam başlat.' : 'Rehber arşivde.');
      if (r.surum !== dto.surum) throw new ConflictException('Başka bir sekmede değişti; sayfayı yenile.');
      const u = degisiklikleriUygula(r.alanlar, dto.degisiklikler, ctx.userId, zaman, { sunucuKonumEslemesi: sunucuEslemesi });
      if (u.tur === 'ret') throw new BadRequestException(u.mesaj);
      await aitlikDenetle(t, r.client_id, u.alanlar);
      const [g] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`
        UPDATE reklam_rehberi SET alanlar = ${JSON.stringify(u.alanlar)}::jsonb, surum = surum + 1, updated_at = now()
         WHERE id = ${id}::uuid AND surum = ${dto.surum}
        RETURNING ${SUTUNLAR}`);
      // RLS'li UPDATE hata vermeden SIFIR satır etkileyebilir: say.
      if (!g) throw new ConflictException('Rehber güncellenemedi; sayfayı yenile.');
      return g;
    });
    return this.kayit(ctx, s);
  }

  async arsivle(ctx: TenantContext, id: string): Promise<RehberKaydi> {
    const s = await this.tx(ctx)(async (t) => {
      // Erişim UPDATE'TEN ÖNCE (`geriGetir` ile aynı gerekçe). Panel bu ucu
      // 2026-10-12'den beri satır menüsünden doğrudan çağırıyor.
      const [o] = await t.$queryRaw<Array<{ client_id: string }>>(Prisma.sql`SELECT client_id::text FROM reklam_rehberi WHERE id = ${id}::uuid FOR UPDATE`);
      if (!o) throw new NotFoundException('Rehber bulunamadı');
      erisim(ctx, o.client_id);
      const [r] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`
        UPDATE reklam_rehberi SET durum = 'arsivlendi', arsivlendi_at = now(), updated_at = now()
         WHERE id = ${id}::uuid AND durum <> 'arsivlendi'
        RETURNING ${SUTUNLAR}`);
      if (!r) throw new ConflictException('Bu reklam zaten arşivde.');
      return r;
    });
    return this.kayit(ctx, s);
  }

  /**
   * ARŞİVDEN GERİ GETİR — arşivden önceki duruma. Önceki durum saklanmıyor
   * ama TÜRETİLEBİLİYOR: rehber yalnız en az bir platform yayını başladığında
   * `yayinda` oluyor (`yayinla`), yani çocuk taslaklarından birinin yayın
   * kaydı varsa `yayinda`, yoksa `taslak`. Yanlış yöne düşmek pahalı:
   * yayına gitmiş bir rehberi `taslak`a döndürmek onu yeniden yayınlanabilir
   * yapar ve platformda İKİNCİ bir kampanya açar. Arşiv yalnız listeden
   * kaldırıyor, platforma hiç dokunmadığı için geri getirmek de dokunmuyor.
   */
  async geriGetir(ctx: TenantContext, id: string): Promise<RehberKaydi> {
    const s = await this.tx(ctx)(async (t) => {
      // Erişim UPDATE'TEN ÖNCE: sonra denetlemek, yetkisiz isteği yalnız
      // transaction'ın geri alınmasına emanet ederdi.
      const [o] = await t.$queryRaw<Array<{ client_id: string }>>(Prisma.sql`SELECT client_id::text FROM reklam_rehberi WHERE id = ${id}::uuid FOR UPDATE`);
      if (!o) throw new NotFoundException('Rehber bulunamadı');
      erisim(ctx, o.client_id);
      const [r] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`
        UPDATE reklam_rehberi r
           SET durum = CASE WHEN EXISTS (SELECT 1 FROM yayin y WHERE y.taslak_id IN (r.meta_taslak_id, r.google_taslak_id)) THEN 'yayinda' ELSE 'taslak' END,
               arsivlendi_at = NULL, updated_at = now()
         WHERE r.id = ${id}::uuid AND r.durum = 'arsivlendi'
        RETURNING ${SUTUNLAR}`);
      // RLS'li UPDATE hata vermeden SIFIR satır etkileyebilir: say.
      if (!r) throw new ConflictException('Bu reklam arşivde değil.');
      return r;
    });
    return this.kayit(ctx, s);
  }

  // ===========================================================================
  // KONUM EŞLEME, ANAHTAR KELİME, METİN ÖNERİSİ (düğme arkasında)
  // ===========================================================================

  /**
   * Her konumun Google karşılığı — `geoTargetConstants:suggest`, YALNIZ tam
   * ad eşleşmesi (`konumEsle`). Belirsiz konum `google: null` kalır; eksik
   * listesi G-KONUM der. Yazma iyimser kilitli (okunan sürümle).
   */
  async konumlariEsle(ctx: TenantContext, id: string): Promise<RehberKaydi> {
    const s = await this.satir(ctx, id);
    if (s.durum !== 'taslak') throw new ConflictException('Bu rehber düzenlenmez.');
    const a = alanlariOku(s);
    const konumlar = a.konumlar;
    if (!konumlar || konumlar.deger.length === 0) throw new BadRequestException('Önce konum seç.');
    const hesapId = a.googleHesabiId?.deger;
    const eksik = konumlar.deger.filter((k) => !k.google && k.tur !== 'country');
    let fctx: FetchContext | null = null;
    if (eksik.length) {
      if (!hesapId) throw new BadRequestException('Önce Google Ads hesabı seç.');
      fctx = (await this.googleBaglami(ctx, hesapId, s.client_id)).fctx;
    }
    const yeni = [];
    for (const k of konumlar.deger) {
      if (k.google) {
        yeni.push(k);
        continue;
      }
      if (k.tur === 'country') {
        yeni.push({ ...k, google: konumEsle(k, []) });
        continue;
      }
      await this.kotaKapisi(hesapId!);
      const adaylar = await this.google.searchGeoLocations(fctx!, k.etiket);
      yeni.push({ ...k, google: konumEsle(k, adaylar.map((x) => ({ key: x.key, name: x.name, countryCode: x.countryCode, type: x.type }))) });
    }
    // Kaynak KORUNUYOR: eşleme alanın değerini değil Google karşılığını ekliyor.
    return this.yaz(ctx, id, { surum: s.surum, degisiklikler: [{ alan: 'konumlar', deger: yeni, kaynak: konumlar.kaynak }] }, true);
  }

  async anahtarKelimeOner(ctx: TenantContext, id: string, tohumlar: string[] | undefined): Promise<AnahtarKelimeOnerisi> {
    const s = await this.satir(ctx, id);
    const a = alanlariOku(s);
    const hesapId = a.googleHesabiId?.deger;
    if (!hesapId) return { satirlar: [], toplam: 0, bosNeden: 'Önce Google Ads hesabı seç; öneriler o hesaptan geliyor.' };
    const t = kelimeTohumlari(tohumlar, a.metin?.deger.basliklar ?? [], a.hedefAdres?.deger ?? null);
    if (t.length === 0) return { satirlar: [], toplam: 0, bosNeden: 'Öneri için en az bir başlık ya da kelime yaz.' };
    const konumlar = (a.konumlar?.deger ?? []).map((k) => k.google?.kaynak).filter((x): x is string => !!x).slice(0, 10);
    const { fctx } = await this.googleBaglami(ctx, hesapId, s.client_id);
    await this.kotaKapisi(hesapId);
    // Keyword Planner 1 QPS (worker'daki AdvStrategy kuyruğuyla AYNI kova).
    // Süreç içi en az 1,1 sn aralık; kuyruğun sınırını bu uç görmüyor (devir notu).
    const bekle = this.sonKelimeIstegi + 1_100 - Date.now();
    if (bekle > 0) await new Promise((r) => setTimeout(r, bekle));
    this.sonKelimeIstegi = Date.now();
    const ham = await this.google.kelimeFikirleri(
      fctx.accessToken,
      fctx.accountExternalId,
      { tohumlar: t, dilKaynagi: GOOGLE_TURKCE, konumKaynaklari: konumlar.length ? konumlar : [GOOGLE_TURKIYE] },
      fctx.loginCustomerId,
    );
    return kelimeOnerisiHazirla(ham, (a.anahtarKelimeler?.deger ?? []).map((k) => k.metin));
  }

  /**
   * METİN ÖNERİSİ (Dalga 2 — görsele özel metin).
   *
   * Teşhis (2026-10-12): model görseli HİÇ görmüyordu, site ADRESİNİ
   * okuyordu, "Kullan"dan sonra kullanıcının metni bir sonraki isteme
   * "Kullanıcının yazdığı metin" olarak girip modeli o metne çapalıyordu ve
   * sıcaklık gönderilmediği için "Yeniden yaz" aynı metni veriyordu.
   *
   * - Görsel(ler) metinden ÖNCE gider (orta çözünürlük, açıkça). 4 MB üstü,
   *   desteklenmeyen biçim ya da okunamayan görsel ATLANIR ve sebebi
   *   `notlar`da; sessizce görselsiz yazmak "görsele göre yazdı" sanılırdı.
   * - Varlık `client_id` süzgeciyle okunur (`AssetsService.bytes` `ctx.orgId`
   *   süzüyor ve "tüm şirketler" modunda kardeş şirketin görselinde sessiz
   *   NotFound veriyordu).
   * - Kullanıcının metni isteme YALNIZ `buna_gore` ile girer.
   * - Görsele özel sonuç içerik özeti + amaçla saklanır; `yeni` modda önbellek
   *   varsa yapay zekâya gidilmez (görsel başına tek çağrı).
   *
   * REHBERE YAZMAZ: öneri bir karar değil (panel kaydeder, kaynağıyla).
   */
  async metinOner(ctx: TenantContext, id: string, istek: MetinOnerIstegi = {}): Promise<MetinOnerisi> {
    if (!this.yz) throw new ServiceUnavailableException('Yapay zekâ bağlı değil; metni kendin yaz.');
    const yz = this.yz;
    const mod = istek.mod ?? 'yeni';
    const s = await this.satir(ctx, id);
    const a = alanlariOku(s);
    const medya = a.medya?.deger ?? [];
    const amacKodu = a.amac?.deger ?? null;
    const onbellekAmaci = amacKodu ?? 'YOK';

    // ── Hangi görsel(ler) ─────────────────────────────────────────────────
    let hedef: (typeof medya)[number] | null = null;
    if (istek.varlikId) {
      hedef = medya.find((x) => x.varlikId === istek.varlikId || x.kapakVarlikId === istek.varlikId) ?? null;
      if (!hedef) throw new BadRequestException('Bu görsel reklamda yok; önce reklama ekle.');
    }
    const notlar: string[] = [];
    // Video için KAPAK gider (sunucuda video işlenmez). Üretilen boyutlar aynı
    // tasarımın kırpılmış hâli: ortak öneride onları göndermek aynı görsele
    // birkaç kez para ödemek olurdu.
    const adaylar = hedef
      ? [hedef.kapakVarlikId ?? hedef.varlikId]
      : [...new Set(medya.filter((x) => !x.uretildi).map((x) => x.kapakVarlikId ?? x.varlikId))];
    const secilen = adaylar.slice(0, METIN_ONERI_GORSEL_SINIRI);
    if (adaylar.length > secilen.length) {
      notlar.push(`İlk ${secilen.length} görsel yapay zekâya gönderildi; ${adaylar.length - secilen.length} görsel gönderilmedi.`);
    }
    const gorselOku = await this.metinGorselleri(ctx, s.client_id, secilen);
    notlar.push(...gorselOku.notlar);
    const hedefOzeti = hedef && gorselOku.gorseller.length === 1 ? gorselOku.gorseller[0]!.ozet : null;

    // ── Önbellek (yalnız görsele özel) ────────────────────────────────────
    let onceki: MetinOnerisi | null = null;
    if (hedefOzeti) {
      const [o] = await this.tx(ctx)((t) =>
        t.$queryRaw<Array<{ sonuc: MetinOnerisi }>>(Prisma.sql`
          SELECT sonuc FROM rehber_gorsel_metni
           WHERE client_id = ${s.client_id}::uuid AND icerik_ozeti = ${hedefOzeti} AND amac = ${onbellekAmaci}`),
      );
      onceki = o?.sonuc ?? null;
    }

    const [p] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ marka: string | null; sektor: string | null; bilgi: string | null; vaatler: string[] | null; uslup: string | null; kategoriler: string[] | null; yasal: string | null; ad: string }>>(Prisma.sql`
        SELECT p.marka_adi AS marka, p.sektor, p.marka_bilgileri AS bilgi, p.vaatler, p.uslup,
               p.urun_kategorileri AS kategoriler, p.yasal_uyari AS yasal, c.name AS ad
          FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
         WHERE c.id = ${s.client_id}::uuid`),
    );
    const amac = amacKodu ? REHBER_AMACLARI[amacKodu].ekranAdi : 'belirtilmedi';
    const kelimeler = (a.anahtarKelimeler?.deger ?? []).map((k) => k.metin);
    // ÇAPA YALNIZ "buna göre yeniden yaz"da: görsele özel istekte o görselin
    // metni, ortak istekte ortak metin.
    const mevcut = mod === 'buna_gore' ? (hedef ? hedef.metin : a.metin?.deger) : undefined;
    const satirlar = [
      `Amaç: ${amac}`,
      `İşletme: ${p?.marka ?? p?.ad ?? ''}`,
      p?.sektor ? `Sektör: ${p.sektor}` : null,
      p?.kategoriler?.length ? `Ürünler: ${p.kategoriler.join(', ')}` : null,
      p?.bilgi ? `Marka bilgisi: ${p.bilgi}` : null,
      p?.vaatler?.length ? `Vaatler: ${p.vaatler.join('; ')}` : null,
      p?.uslup ? `Üslup: ${p.uslup}` : null,
      // SİTE METNİ ELİMİZDE YOK: Ölçüm taraması piksel arıyor, metni
      // saklamıyor. Canlı okumak her öneriyi siteye bağımlı ve yavaş yapardı;
      // site bilgisi Marka Merkezi'ne hazırlıkta zaten süzülüyor.
      a.hedefAdres?.deger ? `Site adresi: ${a.hedefAdres.deger} (sitenin metni okunmadı)` : null,
      kelimeler.length ? `Anahtar kelimeler: ${kelimeler.join(', ')}` : null,
      p?.yasal ? `Zorunlu yasal uyarı: ${p.yasal}` : null,
      mevcut?.anaMetin ? `Kullanıcının yazdığı metin: ${mevcut.anaMetin}` : null,
      mevcut?.basliklar?.length ? `Kullanıcının başlıkları: ${mevcut.basliklar.join(' | ')}` : null,
    ].filter((x): x is string => !!x);
    const girdi = satirlar.join('\n');
    const kapi = {
      kaynakMetin: girdi,
      yasalUyari: p?.yasal ?? null,
      yolKaynagi: [a.hedefAdres?.deger ?? '', ...kelimeler].join(' '),
      vaatAciklamasiVar: aciklamaMetniSec(undefined, p?.vaatler ?? []).metinler.length > 0,
    };
    /*
     * ÖNBELLEKTEN DÖNEN ÖNERİ DE KAPIDAN GEÇER (Ajan 4, Ö-3). Önbellek anahtarı
     * (workspace, görsel, amaç) rehberi taşımıyor ama uydurma kapısının
     * kaynağı rehbere özel: A rehberinin adresiyle doğrulanmış görünen yol ya
     * da anahtar kelimesindeki fiyat, aynı görsel B'ye bırakılınca olduğu gibi
     * dönerdi. Yeniden süzmek bedava: yapay zekâya ve platforma çağrı yok.
     */
    if (onceki && mod === 'yeni') {
      const t = metinOnerisiTemizle(onceki as unknown as Parameters<typeof metinOnerisiTemizle>[0], kapi);
      return { ...t, onbellekten: true, gorselSayisi: 1 };
    }
    // "Tekrar etme" listesi isteme girer ama UYDURMA TARAMASININ kaynağına
    // girmez: önceki öneri bir bilgi kaynağı değil.
    const tekrar = [...(istek.tekrarEtme ?? []), ...(onceki ? [onceki.anaMetin, ...onceki.basliklar] : [])]
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30);
    const istem = tekrar.length ? `${girdi}\n\nTekrar etme (önceki öneri):\n${tekrar.map((x) => `- ${x}`).join('\n')}` : girdi;
    let r;
    try {
      r = await metinIsteOlcumlu(yz, {
        sistem: metinOneriIstemi(gorselOku.gorseller.length > 0),
        metin: istem,
        enCokCikti: 2_500,
        jsonSemasi: METIN_ONERI_SEMASI as unknown as Record<string, unknown>,
        sicaklik: METIN_ONERI_SICAKLIGI,
        ...(gorselOku.gorseller.length > 0 && {
          gorseller: gorselOku.gorseller.map((g) => ({ mimeType: g.mimeType, data: g.data })),
          mediaResolution: GORU_AYARI.mediaResolution,
        }),
      });
    } catch (e) {
      if (e instanceof YapayZekaHatasi) throw new ServiceUnavailableException(`Yapay zekâ cevap vermedi: ${e.message}`);
      throw e;
    }
    // Maliyet ölçümü (ölçüm listesi): görsel başına tek çağrının bedeli.
    logger.log(`metin-oner rehber=${id} gorsel=${gorselOku.gorseller.length} girdi=${r.girdiToken} cikti=${r.ciktiToken} sure=${r.sureMs}ms`);
    if (r.sonuc.tur !== 'tamam') throw new ServiceUnavailableException(r.sonuc.mesaj);
    let ham: unknown;
    try {
      ham = JSON.parse(r.sonuc.metin);
    } catch {
      throw new ServiceUnavailableException('Yapay zekânın cevabı okunamadı; yeniden dene.');
    }
    const temiz = metinOnerisiTemizle(ham as object, kapi);
    const sonuc: MetinOnerisi = { ...temiz, notlar: [...notlar, ...temiz.notlar], gorselSayisi: gorselOku.gorseller.length };
    if (hedefOzeti) {
      try {
        await this.tx(ctx)((t) =>
          t.$queryRaw(Prisma.sql`
            INSERT INTO rehber_gorsel_metni (org_id, client_id, icerik_ozeti, amac, sonuc, model, girdi_token, cikti_token)
            VALUES (${s.org_id}::uuid, ${s.client_id}::uuid, ${hedefOzeti}, ${onbellekAmaci}, ${JSON.stringify(sonuc)}::jsonb,
                    ${yz.model.slice(0, 60)}, ${r.girdiToken}::int, ${r.ciktiToken}::int)
            ON CONFLICT (client_id, icerik_ozeti, amac) DO UPDATE
              SET sonuc = EXCLUDED.sonuc, model = EXCLUDED.model, girdi_token = EXCLUDED.girdi_token,
                  cikti_token = EXCLUDED.cikti_token, updated_at = now()
            RETURNING client_id`),
        );
      } catch (e) {
        // Öneri yine döner (bedeli ödendi); saklanamadığı SÖYLENİR.
        logger.warn(`görsel metni saklanamadı: ${e instanceof Error ? e.message : String(e)}`);
        sonuc.notlar.push('Bu metin saklanamadı; görsel yeniden bırakılırsa yeniden yazılır.');
      }
    }
    return sonuc;
  }

  /**
   * Metin önerisine gidecek görseller — `client_id` süzgeciyle, sırayla.
   * Atlanan her görselin sebebi `notlar`a girer (boyut, biçim, okuma).
   */
  private async metinGorselleri(
    ctx: TenantContext,
    clientId: string,
    idler: string[],
  ): Promise<{ gorseller: Array<{ id: string; mimeType: string; data: string; ozet: string }>; notlar: string[] }> {
    const notlar: string[] = [];
    const gorseller: Array<{ id: string; mimeType: string; data: string; ozet: string }> = [];
    if (idler.length === 0) return { gorseller, notlar };
    const satirlar = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ id: string; name: string; mime_type: string; byte_size: number; storage_key: string; content_hash: string }>>(Prisma.sql`
        SELECT id::text, name, mime_type, byte_size, storage_key, content_hash
          FROM assets WHERE client_id = ${clientId}::uuid AND id = ANY(${idler}::uuid[])`),
    );
    const mb = Math.round(GORU_AYARI.maxBayt / (1024 * 1024));
    for (const id of idler) {
      const v = satirlar.find((x) => x.id === id);
      if (!v) {
        notlar.push('Bir görsel bu workspace’in varlıklarında bulunamadı; o görsel olmadan yazıldı.');
        continue;
      }
      if (v.byte_size > GORU_AYARI.maxBayt) {
        notlar.push(`"${v.name}" ${mb} MB’tan büyük olduğu için yapay zekâya gönderilmedi.`);
        continue;
      }
      if (!METIN_GORSEL_BICIMLERI.includes(v.mime_type)) {
        notlar.push(`"${v.name}" biçimi (${v.mime_type}) yapay zekâya gönderilemiyor.`);
        continue;
      }
      let bayt: Buffer;
      try {
        bayt = await this.depo.read(v.storage_key);
      } catch (e) {
        notlar.push(`"${v.name}" okunamadı (${e instanceof Error ? e.message : 'bilinmeyen hata'}); o görsel olmadan yazıldı.`);
        continue;
      }
      // Kayıttaki boyut yalan söyleyebilir (eski satır): sınır baytta da uygulanır.
      if (bayt.length > GORU_AYARI.maxBayt) {
        notlar.push(`"${v.name}" ${mb} MB’tan büyük olduğu için yapay zekâya gönderilmedi.`);
        continue;
      }
      gorseller.push({ id, mimeType: v.mime_type, data: bayt.toString('base64'), ozet: v.content_hash.trim() });
    }
    return { gorseller, notlar };
  }

  // ===========================================================================
  // PROVA
  // ===========================================================================

  /**
   * Prova: eksik engel varsa YOK (400, liste). Türet → çocuk taslakları
   * yaz → Meta: mevcut prova kuyruğu; Google: aynı gövde `validateOnly`.
   * Sonuç rehberin içerik özetine bağlanır (`prova_ozeti`).
   */
  async prova(ctx: TenantContext, id: string): Promise<RehberProvaSonucu> {
    let s = await this.satir(ctx, id);
    if (s.durum !== 'taslak' && s.durum !== 'yayinda') throw new ConflictException('Bu rehber için prova yapılmaz.');
    const a = alanlariOku(s);
    await this.sayfaTazele(ctx, s.client_id, a);
    await this.googleSatisTazele(ctx, s.client_id, a);
    // Arama: teklif eşiği ve uzantılar provadan ÖNCE taze (gövdeye giriyorlar).
    await this.googleDonusumTazele(ctx, s.client_id, a);
    await this.siteUzantiTazele(s.client_id, a, await this.markaAdi(ctx, s.client_id));
    const b = await this.baglam(ctx, s.client_id, a);
    const engeller = platformaGiderken(rehberEksikleri(a, b)).filter((e) => e.seviye === 'engel');
    if (engeller.length) throw new BadRequestException({ message: 'Önce eksikleri tamamla.', eksikler: engeller });
    const ozet = rehberOzeti(a);
    const acik = acikPlatformlar(a, b.ajansYoneticisi);
    const zaman = new Date().toISOString();
    // Yayındaki rehberde YALNIZ başlamamış platform prova edilir: başlamış
    // platformu yeniden prova etmek onu yeniden kurmanın ilk adımı olurdu.
    const hedef = await this.hedefPlatformlar(ctx, s, acik);

    const meta = hedef.meta ? await this.metaProva(ctx, s, a, b, acik, zaman) : null;
    s = await this.satir(ctx, id);
    const google = hedef.google ? await this.googleProva(ctx, s, a, b, acik) : null;

    // Prova bu İÇERİĞE yapıldı. Arada rehber değiştiyse (başka sekme) kayıt
    // eski özetle kalır ve yayın kapısı "yeniden prova et" der.
    await this.tx(ctx)((t) =>
      t.$queryRaw(Prisma.sql`
        UPDATE reklam_rehberi SET prova_ozeti = ${ozet}, prova_at = now()
         WHERE id = ${id}::uuid AND surum = ${s.surum} RETURNING id`),
    );
    return { icerikOzeti: ozet, meta, google };
  }

  /**
   * Son provanın durumu (Meta provası kuyrukta; sonucu sonradan gelir).
   * Hiç prova yapılmadıysa `null`: "yapılmadı" bir sonuç değil, hâl.
   */
  async provaOku(ctx: TenantContext, id: string): Promise<RehberProvaSonucu | null> {
    const s = await this.satir(ctx, id);
    if (!s.prova_ozeti) return null;
    const a = alanlariOku(s);
    const b = await this.baglam(ctx, s.client_id, a);
    const acik = acikPlatformlar(a, b.ajansYoneticisi);
    const durum = async (p: RehberPlatformu): Promise<PlatformProvaSonucu | null> => {
      if (!acik[p]) return null;
      const h = await this.provaHali(ctx, s, p);
      if (h.tur !== 'gecti') return hal2sonuc(h);
      // Meta parça notları (özel kategori kapsaması) sayfa yenilenince de görünmeli.
      const not = p === 'meta' && s.meta_taslak_id ? provaNotu((await this.yayinSvc.provaOku(ctx, s.meta_taslak_id)).sonuclar) : null;
      return { tur: 'gecti', zaman: new Date().toISOString(), not };
    };
    // `icerikOzeti` PROVANIN yapıldığı özet: güncel özetten ayrıysa panel
    // "rehber provadan sonra değişti" diyebilir.
    return { icerikOzeti: s.prova_ozeti, meta: await durum('meta'), google: await durum('google') };
  }

  /**
   * Bağlı YouTube kanalının son videoları — Akıllı Boost'un okuma kodu
   * (`YouTubeApiService.listRecentVideos`, yükleme listesi, 2 kota birimi).
   * En çok 50 (YouTube'un sayfa sınırı); `toplam` DÖNEN sayı — kanalın
   * bütün video sayısı bu çağrıda yok (devir notu).
   */
  async youtubeVideolari(ctx: TenantContext, clientId: string, kanalId: string): Promise<YoutubeVideoListesi> {
    erisim(ctx, clientId);
    const [k] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ external_id: string }>>(Prisma.sql`
        SELECT external_id FROM social_profiles
         WHERE id = ${kanalId}::uuid AND client_id = ${clientId}::uuid AND profile_type = 'youtube_channel'`),
    );
    if (!k) return { satirlar: [], toplam: 0, dahaFazlaVar: false, bosNeden: 'Bu YouTube kanalı bu workspace’e bağlı değil.' };
    const r = await this.youtube.listRecentVideos(k.external_id, 50);
    // Hata BOŞ LİSTEYE ÇEVRİLMİYOR: "video yok" ile "okunamadı" ayrı iş.
    if (r.durum === 'hata') throw new ServiceUnavailableException(`YouTube okunamadı: ${r.message}`);
    if (r.durum === 'bulunamadi') return { satirlar: [], toplam: 0, dahaFazlaVar: false, bosNeden: 'YouTube bu kanalı bulamadı; kanal bağlantısını kontrol et.' };
    const satirlar = r.videolar.map((v) => ({
      videoId: v.id,
      baslik: v.title,
      kucukResim: v.thumbnailUrl,
      yayinTarihi: v.publishedAt ? v.publishedAt.toISOString() : null,
    }));
    return { satirlar, toplam: satirlar.length, dahaFazlaVar: satirlar.length >= 50, bosNeden: satirlar.length ? null : 'Kanalda yüklenmiş video yok.' };
  }

  private async metaProva(ctx: TenantContext, s: RehberSatiri, a: RehberAlanlari, b: Baglam, acik: Record<RehberPlatformu, boolean>, zaman: string): Promise<PlatformProvaSonucu> {
    const t = rehberdenMeta(a, acik, b.meta?.currency ?? b.paraBirimi, zaman, b.medyaOranlari ?? new Map(), b.sitePikseli);
    if (t.tur === 'ret') return { tur: 'reddetti', zaman, mesajlar: t.kodlar.map((k) => `Eksik: ${k}`) };
    /*
     * KAYNAK KİLİDİ PROVADA DA (2026-10-12 canlı hatası). `provaIste` bu
     * kilidi BİLEREK atlıyor (AdvCampaign sohbetinde öneri provadan sonra
     * onaylanıyor), yayın kapısı ise uyguluyor. Rehberde ikisinin arasında
     * kullanıcının kapatabileceği bir adım yok: prova "geçti" deyip yayında
     * "Bu alanı kendin seç" ile durmak, Google kurulmuşken Meta'yı hiç
     * başlatmamak demekti. Türetme kaynakları uyarlıyor
     * (`rehberKaynaklariniTasi`); bu kontrol onun bozulduğu gün aynı hatayı
     * YAYINDAN ÖNCE ve alan adıyla söyler.
     */
    const kilit = taslakEksikleri(t.deger).filter((e) => e.kod === 'KAYNAK');
    if (kilit.length) return { tur: 'reddetti', zaman, mesajlar: kilit.map((e) => e.metin) };
    try {
      let taslakId = s.meta_taslak_id;
      if (!taslakId) {
        taslakId = (await this.taslakSvc.olustur(ctx, s.client_id, 'acemi', null)).id;
        await this.cocukBagla(ctx, s.id, 'meta', taslakId);
      }
      // TAM DEĞİŞTİRME: rehberde olmayan alan çocuktan da silinir (null).
      const degisiklik: AlanDegisikligi = {};
      for (const k of Object.keys(taslakAlanlariSchema.shape) as Array<keyof TaslakAlanlari>) {
        const d = t.deger[k];
        degisiklik[k] = d ? { deger: d.deger, kaynak: d.kaynak } : null;
      }
      await this.taslakSvc.surumYaz(ctx, taslakId, degisiklik);
      const p = await this.yayinSvc.provaIste(ctx, taslakId);
      if (p.durum.tur === 'gecti') return { tur: 'gecti', zaman, not: provaNotu(p.sonuclar) };
      return hal2sonuc(p.durum);
    } catch (e) {
      if (e instanceof ConflictException || e instanceof BadRequestException) {
        return { tur: 'reddetti', zaman, mesajlar: [String((e.getResponse() as { message?: unknown }).message ?? e.message)] };
      }
      throw e;
    }
  }

/**
   * `uzantiReddi` verilirse UZANTISIZ ikinci deneme: ilk prova yalnız site
   * bağlantısı / açıklama metni öğeleri yüzünden reddedildi. Uzantı bir EK;
   * reddi kampanyanın tamamını kilitleseydi kullanıcı reklamı hiç kuramazdı.
   * Kısıt sessiz değil: prova notu ve karar tablosu sebebi söylüyor.
   */
  private async googleProva(
    ctx: TenantContext,
    s: RehberSatiri,
    a: RehberAlanlari,
    bIlk: Baglam,
    acik: Record<RehberPlatformu, boolean>,
    uzantiReddi: string | null = null,
  ): Promise<PlatformProvaSonucu> {
    const zaman = new Date().toISOString();
    // Öğe reddinde İKİSİ birden boşalır: site bağlantısı/açıklama metni ve
    // Arama öğeleri (`googleReddi` öğe seçiminde hepsini "eklenmedi" yapar).
    const b: Baglam = uzantiReddi
      ? {
          ...bIlk,
          uzantilar: bIlk.uzantilar ? { ...bIlk.uzantilar, siteBaglantilari: [], aciklamaMetinleri: [], googleReddi: uzantiReddi } : null,
          ogeKaynagi: bIlk.ogeKaynagi ? { ...bIlk.ogeKaynagi, googleReddi: uzantiReddi } : null,
        }
      : bIlk;
    if (!b.google) return { tur: 'reddetti', zaman, mesajlar: ['Google Ads hesabı seçilmedi.'] };
    // LOGO DOSYASI TÜRETMEDEN ÖNCE (Ajan 4, Ö-B): okunamazsa (ENOENT vb.)
    // yalnız logo öğesi düşer ve sebebi ekranda; prova düşmez. Türetmeden
    // ÖNCE çünkü girdi (yayına giden) ve ekran satırı aynı kararı taşımalı.
    if (b.ogeKaynagi?.logo && !b.ogeKaynagi.googleReddi) {
      const sorun = await this.aramaLogoSorunu(ctx, s.client_id, b.ogeKaynagi.logo.varlikId, b.google.id);
      if (sorun) b.ogeKaynagi = { ...b.ogeKaynagi, logoSorunu: sorun };
    }
    const t = rehberdenGoogle(a, acik, {
      musteriId: b.google.externalId,
      paraBirimi: b.google.currency,
      saatDilimi: b.google.timezone,
      donusumEtkin: b.googleDonusum,
      son30GunDonusum: b.googleDonusum30Gun,
      uzantilar: b.uzantilar,
      ogeKaynagi: b.ogeKaynagi,
      satisOlcumu: b.onKosullar?.googleSatisOlcumu ?? null,
      medyaOranlari: b.medyaOranlari ?? new Map(),
      isletmeAdi: b.isletmeAdi,
      logoVarlikId: b.logoVarlikId,
      kategoriTabani: b.kategoriTabani,
      calismaSaatleri: b.calismaSaatleri,
    });
    if (t.tur === 'ret') return { tur: 'reddetti', zaman, mesajlar: t.kodlar.map((k) => `Eksik: ${k}`) };
    const cocuk = await this.googleCocukYaz(ctx, s, t.deger, b.google.id);
    const provaId = randomUUID();
    const logo = await this.googleLogo(ctx, s.client_id, t.deger, b.google.id);
    const d = derleGoogle(t.deger, {
      kimlik: provaId,
      workspaceKisaAdi: b.workspaceAdi,
      amacEkranAdi: REHBER_AMACLARI[a.amac!.deger].ekranAdi,
      simdi: new Date(),
      validateOnly: true,
      logo,
      youtubeVideoBasligi: a.youtubeVideo?.deger?.baslik ?? null,
      gorselKaynaklari: await this.googleGorselKaynaklari(ctx, s.client_id, t.deger, b.google.id),
    });
    const tx = this.tx(ctx);
    const [p] = await tx((x) =>
      x.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO prova (id, org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, ad_account_id, api_surumu, derleyici_surumu)
        VALUES (${provaId}::uuid, ${s.org_id}::uuid, ${s.client_id}::uuid, ${cocuk.taslakId}::uuid, ${cocuk.surumNo}, ${cocuk.ozet},
                ${b.google!.id}::uuid, ${this.config.platforms.google.apiVersion}, ${GOOGLE_DERLEYICI_SURUMU})
        ON CONFLICT (taslak_id, icerik_ozeti) WHERE durum = 'bekliyor' DO NOTHING
        RETURNING id::text`),
    );
    if (!p) return { tur: 'yapilmadi', sebep: "Google'a bu hâl zaten soruluyor; birkaç saniye sonra yenile." };
    const bitir = async (durum: 'gecti' | 'reddedildi' | 'dogrulanamadi', sebep: string | null, sonuclar: unknown[] = []) => {
      await tx((x) =>
        x.$queryRaw(Prisma.sql`
          UPDATE prova SET durum = ${durum}, sebep = ${sebep?.slice(0, 2000) ?? null}, sonuclar = ${JSON.stringify(sonuclar)}::jsonb, bitti_at = now()
           WHERE id = ${provaId}::uuid AND durum = 'bekliyor' RETURNING id`),
      );
    };
    if (d.tur === 'ret') {
      // Yerelde reddedildi: Google'a hiç gidilmedi.
      await bitir('reddedildi', d.retler.map((r) => r.mesaj).join(' '));
      return { tur: 'reddetti', zaman, mesajlar: d.retler.map((r) => r.mesaj) };
    }
    try {
      const { fctx } = await this.googleBaglami(ctx, b.google.id, s.client_id);
      await this.kotaKapisi(b.google.id);
      await this.google.rehberMutate(fctx, d.govde);
    } catch (e) {
      if (e instanceof PlatformApiError && e.kind !== 'transient') {
        // Google'ın BÜTÜN hataları alan yoluyla: "metin çok uzun" tek başına
        // işe yaramıyor, hangi başlık olduğu gerekiyor.
        const alan = googleAlanHatalari(e.detail?.raw);
        const mesajlar = alan.length ? alan.map((h) => [h.mesaj, h.alan ? `(${h.alan})` : null, h.ayrinti].filter(Boolean).join(' ')) : [e.message];
        await bitir('reddedildi', mesajlar.join(' · '), alan);
        // YALNIZ uzantı öğeleri reddedildiyse (her hata bir uzantı işleminde)
        // uzantısız yeniden prova. Karışık retler olduğu gibi döner: başka
        // bir sorun uzantıyı atınca kaybolmaz.
        const uzantiIslemleri = new Set([...[...(d.sira.siteBaglantilari ?? []), ...(d.sira.aciklamaMetinleri ?? [])].flatMap((i) => [i - 1, i]), ...(d.sira.ogeIslemleri ?? [])]);
        if (!uzantiReddi && uzantiIslemleri.size > 0 && alan.length > 0 && alan.every((h) => h.islemSirasi !== null && uzantiIslemleri.has(h.islemSirasi))) {
          const sebep = alan.map((h) => h.mesaj || h.kod).join('; ');
          const k = this.uzantiOnbellek.get(s.client_id);
          if (k) this.uzantiOnbellek.set(s.client_id, { ...k, googleReddi: sebep });
          // Satır YENİDEN okunur: ilk deneme çocuk taslağı açıp rehbere bağladı;
          // eski satırla ikinci bir Google taslağı açılır ve ilki yetim kalırdı.
          return this.googleProva(ctx, await this.satir(ctx, s.id), a, bIlk, acik, sebep);
        }
        return { tur: 'reddetti', zaman, mesajlar };
      }
      const m = e instanceof Error ? e.message : String(e);
      await bitir('dogrulanamadi', m);
      if (e instanceof BadRequestException) return { tur: 'yapilmadi', sebep: m };
      return { tur: 'yapilmadi', sebep: `Google'ın kontrolü tamamlanamadı: ${m}` };
    }
    await bitir('gecti', null);
    const notlar = [...(uzantiReddi ? [`${googleUzantiReddiCumlesi(uzantiReddi)}.`] : []), ...d.notlar];
    return { tur: 'gecti', zaman, not: notlar.length ? notlar.join(' ') : null };
  }

  // ===========================================================================
  // YAYIN
  // ===========================================================================

  async yayinla(ctx: TenantContext, id: string, istenenOzet: string): Promise<RehberYayinDurumu> {
    const s = await this.satir(ctx, id);
    if (s.durum !== 'taslak' && s.durum !== 'yayinda') throw new ConflictException('Bu rehber zaten yayına alındı ya da arşivde.');
    const a = alanlariOku(s);
    // Yayın da TAZE okur: prova ile yayın arasında önbellek (15 dk) dolmuş
    // olabilir ve bilinmeyen form hâli aşağıda engele çevriliyor.
    await this.sayfaTazele(ctx, s.client_id, a);
    await this.googleSatisTazele(ctx, s.client_id, a);
    const b = await this.baglam(ctx, s.client_id, a);
    const eksikler = platformaGiderken(rehberEksikleri(a, b));
    const acik = acikPlatformlar(a, b.ajansYoneticisi);
    // `acik` TÜRETME için (bütçe payı açık kümeyle bölünüyor; yeniden denemede
    // daraltılsaydı Meta bütün bütçeyi alırdı), `hedef` KURULACAK platformlar.
    const hedef = await this.hedefPlatformlar(ctx, s, acik);
    const tx = this.tx(ctx);
    const k = await rehberYayinKapilari(
      { istenenOzet, guncelOzet: rehberOzeti(a), provaOzeti: s.prova_ozeti, eksikler, acik: hedef },
      {
        prova: (p) => this.provaHali(ctx, s, p),
        yazma: (p) => (p === 'meta' ? metaYazmaAcikMi(tx, s.client_id) : googleYazmaAcikMi(tx, s.client_id)),
        uyum: () =>
          uyumDenetle({
            platformlar: acik,
            kategoriler: [...new Set([...b.kategoriTabani, ...(a.ekKategoriler?.deger ?? [])])],
            yasalUyari: b.yasalUyari,
            metaAnaMetin: a.metin?.deger.anaMetin ?? '',
            // Görsele özel ana metin o fikirde ortak metnin YERİNE gidiyor.
            metaEkAnaMetinler: (a.medya?.deger ?? []).map((x) => x.metin?.anaMetin ?? '').filter((x) => x.trim()),
            googleAciklamalar: a.metin?.deger.aciklamalar ?? [],
            enDusukYas: a.enDusukYas?.deger ?? 18,
            yasAraligi: a.yasAraligi?.deger ?? null,
            cinsiyetDaraltmasi: false,
          }),
      },
    );
    if (k.tur === 'ret') {
      if (k.kapi === 'OZET') throw new ConflictException(k.mesajlar[0]);
      if (k.kapi === 'UYUM') return { ...(await this.yayinDurumu(ctx, id)), uyum: { tur: 'durdu', bulgular: k.uyum.bulgular } };
      throw new BadRequestException({ message: k.mesajlar.join(' '), kapi: k.kapi, mesajlar: k.mesajlar });
    }

    // PLATFORMLAR BAĞIMSIZ (K-08): biri düşerse öbürü geri alınmaz ve
    // başlamayan platformun sebebi ekranda kalır.
    const amac = a.amac!.deger;
    const baslamayan: PlatformYayinOzeti[] = [];
    /*
     * BAŞLAYAN PLATFORM REHBERİ HEMEN "YAYINDA" YAPAR (Ajan 4, giriş ekranı
     * kapısı Ö-1). Durum eskiden İKİ platform da denendikten sonra tek
     * seferde yazılıyordu: Meta kurulduktan sonra Google dalı FIRLATIRSA
     * UPDATE hiç koşmuyor, rehber "taslak" kalıyor ve giriş ekranı ona
     * "Devam et" / "Taslağı sil" sunuyordu. Yeniden yayınlamak Meta'da
     * İKİNCİ bir kampanya açar (para). Artık her başlayan platformdan hemen
     * sonra yazılıyor ve bir platformun fırlatması öbürünün sonucunu ve
     * sebebini götürmüyor: hata o platformun sebebi olur.
     */
    const yayindaYaz = () =>
      tx((t) => t.$queryRaw(Prisma.sql`UPDATE reklam_rehberi SET durum = 'yayinda', updated_at = now() WHERE id = ${id}::uuid AND durum = 'taslak' RETURNING id`));
    const dene = async (baslat: () => Promise<BaslatmaSonucu>): Promise<BaslatmaSonucu> => {
      try {
        return await baslat();
      } catch (e) {
        // EŞZAMANLI İKİNCİ İSTEK (Ajan 4 Ö-1): öbür istek aynı taslağın
        // aktif yayınını az önce yazdı. Bu "başlamadı" DEĞİL: sebep yazmak
        // ve denetime "başlamadı" düşürmek, kurulum sürerken ekranda
        // "yeniden dene" düğmesi ve yanlış bir hata gösterirdi.
        if (aktifYayinCakismasiMi(e)) return SURUYOR;
        logger.error(`Rehber ${id} yayını başlatılırken hata: ${e instanceof Error ? e.message : String(e)}`);
        return `Kurulum başlatılamadı: ${e instanceof Error ? e.message : String(e)}`;
      }
    };
    if (hedef.meta && s.meta_taslak_id) {
      const r = await dene(() => this.metaYayinBaslat(ctx, s.meta_taslak_id!, a, acik, b.meta?.currency ?? b.paraBirimi, { uyum: k.uyum, kapaliKalacak: !platformAcilabilirMi(amac, 'meta') }, b.medyaOranlari ?? new Map()));
      if (typeof r === 'string') baslamayan.push({ platform: 'meta', taslakId: s.meta_taslak_id, yayinId: null, durum: null, sebep: r, kampanyaKimligi: null, duraklatilmisKalacak: !platformAcilabilirMi(amac, 'meta'), yenidenKurulabilir: true });
      else await yayindaYaz();
    }
    if (hedef.google && s.google_taslak_id) {
      const r = await dene(() => this.googleYayinBaslat(ctx, s, a, b, k.uyum, !platformAcilabilirMi(amac, 'google')));
      if (typeof r === 'string') baslamayan.push({ platform: 'google', taslakId: s.google_taslak_id, yayinId: null, durum: null, sebep: r, kampanyaKimligi: null, duraklatilmisKalacak: !platformAcilabilirMi(amac, 'google'), yenidenKurulabilir: true });
      else await yayindaYaz();
    }
    await this.sebepleriYaz(ctx, s, hedef, baslamayan);
    const d = await this.yayinDurumu(ctx, id);
    // Başlamayan platformun bu denemede yayın kaydı yok: satırı SEBEBİYLE
    // değiştirilir (eski bir yayın kaydını göstermek "başladı" sanılırdı).
    // Yeniden kurulabilirlik SUNUCUNUN kaydından: kuyruğa alınamayan yayının
    // kaydı var (on_kontrol_reddi) ve kural onu tek yerde değerlendiriyor.
    const yerine = (p: PlatformYayinOzeti) => {
      const b = baslamayan.find((x) => x.platform === p.platform);
      return b ? { ...b, yenidenKurulabilir: p.yenidenKurulabilir } : p;
    };
    const eksikler2 = baslamayan.filter((x) => !d.platformlar.some((p) => p.platform === x.platform));
    return { ...d, platformlar: [...d.platformlar.map(yerine), ...eksikler2] };
  }

  /**
   * ═══ KURULACAK PLATFORMLAR — YENİDEN DENEME YALNIZ BAŞLAMAMIŞ OLANA ═══
   *
   * Taslaktaki rehberde açık platformların hepsi. YAYINDAKİ rehberde
   * (bir platform başladı, öbürü başlamadı) yalnız YAYIN KAYDI OLMAYAN
   * platform: 2026-10-12'de Google kuruldu, Meta KAYNAK kilidinde kaldı ve
   * rehberi yeniden yayınlamanın yolu yoktu ("Aynı içerikle yeniden kur" yeni
   * bir rehber açar ve Google'ı İKİNCİ kez kurar: para). Yayın kaydı olan
   * platform (sonradan düşmüş olsa bile) burada ASLA hedef değil; o kaydın
   * kendi yolları var (yeniden oku, geri al). Hiç hedef yoksa 409: aynı
   * düğmeye iki kez basılması da buraya düşer.
   */
  private async hedefPlatformlar(ctx: TenantContext, s: RehberSatiri, acik: Record<RehberPlatformu, boolean>): Promise<Record<RehberPlatformu, boolean>> {
    // Rehberin durumuna BAKILMAZ (Ajan 4 Ö-2): "yayinda" yazımı düşmüş bir
    // rehber taslakta kalır ama kayıtlar gerçektir; durumla kısa devre
    // yapmak iki platformu da ikinci kez kurduruyordu (2 → 4 yayın).
    const kayitlar = await this.yayinKayitlari(ctx, [s.meta_taslak_id, s.google_taslak_id]);
    const kurulabilir = (id: string | null) => !id || platformYenidenKurulabilirMi(kayitlar.get(id) ?? []);
    const hedef = { meta: acik.meta && kurulabilir(s.meta_taslak_id), google: acik.google && kurulabilir(s.google_taslak_id) };
    if (!hedef.meta && !hedef.google) {
      const adlar = (['meta', 'google'] as const).filter((p) => acik[p]).map((p) => (p === 'meta' ? 'Meta' : 'Google'));
      throw new ConflictException(
        `${adlar.join(' ve ') || 'Açık platform'} için yayın kaydı var (kuruldu, kuruluyor ya da platformda sonlandı); yeniden kurulmaz. Yalnız platforma hiçbir şey gitmeden düşen kurulum yeniden denenir.`,
      );
    }
    return hedef;
  }

  /**
   * Taslak başına yayın kayıtları: sonlanma sebebi ve platformda nesne açılıp
   * açılmadığı. `yayin_nesnesi` satırı yayın başlarken PLAN olarak yazılıyor;
   * platforma bir şey GİTMİŞ nesne = kimliği (`meta_id`, Google'da kaynak
   * adı) dolu ya da `bekliyor`dan çıkmış satır (`gonderiliyor`/`belirsiz`:
   * istek gitti, sonucu bilinmiyor; platformda kampanya olabilir). Satırın
   * varlığına bakmak her kaydı "açıldı" sayardı.
   */
  private async yayinKayitlari(ctx: TenantContext, taslaklar: ReadonlyArray<string | null>): Promise<Map<string, PlatformYayinKaydi[]>> {
    const idler = taslaklar.filter((x): x is string => !!x);
    const m = new Map<string, PlatformYayinKaydi[]>();
    if (!idler.length) return m;
    const satirlar = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ taslak_id: string; sonlanma_sebebi: string | null; nesne_var: boolean }>>(Prisma.sql`
        SELECT y.taslak_id::text, y.sonlanma_sebebi::text,
               EXISTS (SELECT 1 FROM yayin_nesnesi n WHERE n.yayin_id = y.id AND (n.meta_id IS NOT NULL OR n.durum <> 'bekliyor')) AS nesne_var
          FROM yayin y WHERE y.taslak_id = ANY (${idler}::uuid[])`),
    );
    for (const r of satirlar) m.set(r.taslak_id, [...(m.get(r.taslak_id) ?? []), { sonlanmaSebebi: r.sonlanma_sebebi, nesneVar: r.nesne_var }]);
    return m;
  }

  /**
   * BAŞLAMAYAN PLATFORMUN SEBEBİ KALICI (sessiz hata, 2026-10-12). Sebep
   * yalnız yayınlama yanıtında dönüyordu: sayfa yenilenince genel cümle
   * ("kurulum başlamadı") görünüyor, gerçek sebep ("Meta taslağı rehberden
   * sonra değişmiş", derleyicinin reddi) kayboluyordu. Bu denemede açık olan
   * her platform yazılır: başlayanın eski sebebi SİLİNİR (yeni yayın
   * kaydının yanında eski bir hata görünmesin). Denetim kaydı da yazılır:
   * kim, ne zaman, hangi sebeple yayın başlatamadı.
   *
   * `org_id` REHBERDEN okunur, `ctx.orgId`den değil: "tüm şirketler"
   * modunda ctx ev şirketi kalıyor (CLAUDE.md).
   */
  private async sebepleriYaz(ctx: TenantContext, s: RehberSatiri, acik: Record<RehberPlatformu, boolean>, baslamayan: PlatformYayinOzeti[]): Promise<void> {
    const zaman = new Date().toISOString();
    const yaz: Record<string, { sebep: string; zaman: string }> = {};
    const sil: string[] = [];
    for (const p of ['meta', 'google'] as const) {
      if (!acik[p]) continue;
      const b = baslamayan.find((x) => x.platform === p);
      if (b?.sebep) yaz[p] = { sebep: b.sebep.slice(0, 2000), zaman };
      else sil.push(p);
    }
    await this.tx(ctx)(async (t) => {
      await t.$queryRaw(Prisma.sql`
        UPDATE reklam_rehberi SET platform_sebepleri = (platform_sebepleri - ${sil}::text[]) || ${JSON.stringify(yaz)}::jsonb
         WHERE id = ${s.id}::uuid RETURNING id`);
      if (Object.keys(yaz).length) {
        // audit_logs.id BIGSERIAL: id verilmiyor.
        await t.$queryRaw(Prisma.sql`
          INSERT INTO audit_logs (org_id, client_id, actor_type, actor_id, action, target_type, target_id, after)
          VALUES (${s.org_id}::uuid, ${s.client_id}::uuid, 'user'::"ActorType", ${ctx.userId}::uuid,
                  'reklam.rehber.baslamadi', 'reklam_rehberi', ${s.id}, ${JSON.stringify(yaz)}::jsonb)
          RETURNING id`);
      }
    });
  }

  async yayinDurumu(ctx: TenantContext, id: string): Promise<RehberYayinDurumu> {
    const s = await this.satir(ctx, id);
    const [ps] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ platform_sebepleri: Partial<Record<RehberPlatformu, { sebep: string; zaman: string }>> | null }>>(Prisma.sql`
        SELECT platform_sebepleri FROM reklam_rehberi WHERE id = ${id}::uuid`),
    );
    const kayitliSebep = (p: RehberPlatformu) => ps?.platform_sebepleri?.[p]?.sebep ?? null;
    const kayitlar = await this.yayinKayitlari(ctx, [s.meta_taslak_id, s.google_taslak_id]);
    const platformlar: PlatformYayinOzeti[] = [];
    let uyum: RehberYayinDurumu['uyum'] = null;
    for (const [platform, taslakId] of [
      ['meta', s.meta_taslak_id],
      ['google', s.google_taslak_id],
    ] as Array<[RehberPlatformu, string | null]>) {
      if (!taslakId) continue;
      const [y] = await this.tx(ctx)((t) =>
        t.$queryRaw<Array<{ id: string; durum: YayinDurumu; sebep: string | null; kapali_kalacak: boolean; uyum_sonucu: { tur?: string } | null; kampanya: string | null }>>(Prisma.sql`
          SELECT y.id::text, y.durum, y.sebep, y.kapali_kalacak, y.uyum_sonucu,
                 (SELECT n.meta_id FROM yayin_nesnesi n WHERE n.yayin_id = y.id AND n.tur = 'kampanya' LIMIT 1) AS kampanya
            FROM yayin y WHERE y.taslak_id = ${taslakId}::uuid
           ORDER BY (y.sonlandi_at IS NULL) DESC, y.created_at DESC LIMIT 1`),
      );
      if (y?.uyum_sonucu?.tur === 'gecti') uyum = { tur: 'gecti' };
      const notlar = y ? await this.geriOkumaNotlari(ctx, y.id) : [];
      platformlar.push({
        platform,
        taslakId,
        yayinId: y?.id ?? null,
        durum: y?.durum ?? null,
        // YAYINA ALINMIŞ REHBERDE KAYDI OLMAYAN PLATFORM BAŞLAMAMIŞTIR. Sebep
        // yalnız yayınlama yanıtında dönüyordu; sonraki her okumada durum
        // null'dı ve panel onu "Kuruluyor" diye sonsuza kadar gösterdi
        // (canlı, rehber 37df523b, 2026-10-10). Kayıt yokken sebep yazılır;
        // panel sebepli null'u hata sayar (`yayinSonucu`).
        // Kayıt yokken önce KAYITLI GERÇEK sebep (`sebepleriYaz`); o da yoksa
        // genel cümle. Taslakta kalan rehberde de gerçek sebep görünür: iki
        // platform da başlamadıysa rehber taslak kalıyor ve eskiden hiçbir
        // sebep okunmuyordu.
        sebep: y ? y.sebep : (kayitliSebep(platform) ?? (s.durum !== 'taslak' ? BASLAMAYAN_PLATFORM_SEBEBI : null)),
        // Google'da kaynak adı saklanıyor; Reklam Yöneticisi yalın kimlik arıyor.
        kampanyaKimligi: y?.kampanya ? (platform === 'google' ? googleYalinKimlik(y.kampanya) : y.kampanya) : null,
        duraklatilmisKalacak: y?.kapali_kalacak ?? false,
        yenidenKurulabilir: platformYenidenKurulabilirMi(kayitlar.get(taslakId) ?? []),
        ...(notlar.length ? { geriOkumaNotlari: notlar } : {}),
      });
    }
    return { rehberId: s.id, platformlar, uyum };
  }

  /**
   * Son geri okumanın durdurmayan notları (`uyari`, `bilgi`). Aynı cümle
   * beş kreatifte beş kez yazılmasın diye tekilleşiyor. Diğer bilgi türleri
   * (normalleştirmeler) bilerek burada YOK: onlar beklenen Meta davranışı
   * ve her yayında aynı satırları göstermek asıl uyarıyı boğardı.
   */
  private async geriOkumaNotlari(ctx: TenantContext, yayinId: string): Promise<Array<{ tur: 'uyari' | 'bilgi'; metin: string }>> {
    const [g] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ bilgiler: unknown }>>(Prisma.sql`
        SELECT bilgiler FROM geri_okuma WHERE yayin_id = ${yayinId}::uuid ORDER BY created_at DESC LIMIT 1`),
    );
    return geriOkumaNotlariniSec(g?.bilgiler);
  }

  /** Meta: mevcut tek yayın yolu (`yayinBaslat`) — rehberin uyum kararıyla. Dönen değer: başlamadıysa sebebi. */
  private async metaYayinBaslat(
    ctx: TenantContext,
    taslakId: string,
    a: RehberAlanlari,
    acik: Record<RehberPlatformu, boolean>,
    paraBirimi: string,
    rehber: { uyum: { tur: 'gecti'; surum: string }; kapaliKalacak: boolean },
    oranlar: ReadonlyMap<string, GorselOrani | null>,
  ): Promise<BaslatmaSonucu> {
    const [t] = await this.tx(ctx)((x) =>
      x.$queryRaw<Array<{ aktif_surum_no: number; icerik_ozeti: string | null; alanlar: unknown }>>(Prisma.sql`
        SELECT t.aktif_surum_no, s.icerik_ozeti, s.alanlar FROM reklam_taslagi t
          LEFT JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no
         WHERE t.id = ${taslakId}::uuid`),
    );
    if (!t?.icerik_ozeti) return 'Meta taslağı bulunamadı; yeniden prova et.';
    /*
     * ÇOCUK REHBERDEN Mİ TÜREDİ (Ajan 4, BULGU-2): uyum denetçisi REHBERİ
     * denetliyor ama Meta'ya ÇOCUĞUN aktif sürümü gidiyor. Çocuk, prova ile
     * yayın arasında eski taslak uçlarından değiştirilmişse denetlenmemiş
     * içerik "uyum geçti" damgasıyla yayınlanırdı. Rehberden yeniden türetip
     * aynı özet kuralıyla karşılaştırıyoruz; uyuşmazsa yayın yok.
     */
    /*
     * PİKSEL HÂLİ ÇOCUKTAN: rehberin içeriği değil, provanın okuduğu
     * platform hâli. Yayında yeniden okunsaydı (ya da okuma düşseydi) hâl
     * provadakinden ayrılıp bu karşılaştırmayı "taslak değişmiş" diye
     * düşürürdü; kullanıcının değiştirdiği hiçbir şey yokken. Uyum denetçisi
     * bu alana bakmıyor, kapının koruduğu içerik değişmedi.
     */
    const cocuk = taslakAlanlariSchema.safeParse(t.alanlar);
    const sitePikseli = (cocuk.success ? cocuk.data.sitePikseli?.deger : undefined) ?? 'bilinmiyor';
    const yeniden = rehberdenMeta(a, acik, paraBirimi, new Date().toISOString(), oranlar, sitePikseli);
    const beklenen = yeniden.tur === 'tamam' ? createHash('sha256').update(taslakKanonikIcerik(yeniden.deger)).digest('hex') : null;
    if (beklenen !== t.icerik_ozeti) return 'Meta taslağı rehberden sonra değişmiş; yeniden prova et.';
    const r = await this.yayinSvc.baslat(ctx, { taslakId, surumNo: t.aktif_surum_no, icerikOzeti: t.icerik_ozeti, testKipi: false, kaynak: 'panel', rehber });
    if (r.tur !== 'ret') return null;
    // DURUM: taslağın aktif yayını var (başka bir istek az önce kurdu).
    if (r.retler.some((x) => x.kod === 'DURUM')) return SURUYOR;
    return r.retler.map((x) => x.mesaj).join(' ');
  }

  /** Google: çocuk taslağın aktif sürümünden derle, kaydı yaz, kuyruğa al. */
  private async googleYayinBaslat(
    ctx: TenantContext,
    s: RehberSatiri,
    a: RehberAlanlari,
    b: Baglam,
    uyum: { tur: 'gecti'; surum: string },
    kapaliKalacak: boolean,
  ): Promise<BaslatmaSonucu> {
    if (!b.google || !s.google_taslak_id) return 'Google Ads hesabı seçilmedi.';
    const tx = this.tx(ctx);
    const [c] = await tx((x) =>
      x.$queryRaw<Array<{ durum: string; aktif_surum_no: number; alanlar: unknown; icerik_ozeti: string | null; ad_account_id: string | null }>>(Prisma.sql`
        SELECT t.durum, t.aktif_surum_no, s.alanlar, s.icerik_ozeti, t.ad_account_id::text
          FROM reklam_taslagi t LEFT JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no
         WHERE t.id = ${s.google_taslak_id}::uuid`),
    );
    if (!c?.icerik_ozeti) return 'Google taslağı bulunamadı; yeniden prova et.';
    // Süren yayın = başka bir istek az önce kurdu; "başlamadı" değil.
    if (c.durum !== 'taslak' && c.durum !== 'hazir') return SURUYOR;
    if (c.ad_account_id !== b.google.id) return 'Google hesabı provadan sonra değişti; yeniden prova et.';
    const girdi = googleGirdisiOku(c.alanlar);
    const yayinId = randomUUID();
    const d = derleGoogle(girdi, {
      kimlik: yayinId,
      workspaceKisaAdi: b.workspaceAdi,
      amacEkranAdi: REHBER_AMACLARI[a.amac!.deger].ekranAdi,
      simdi: new Date(),
      validateOnly: false,
      logo: await this.googleLogo(ctx, s.client_id, girdi, b.google.id),
      youtubeVideoBasligi: a.youtubeVideo?.deger?.baslik ?? null,
      gorselKaynaklari: await this.googleGorselKaynaklari(ctx, s.client_id, girdi, b.google.id),
    });
    if (d.tur === 'ret') return d.retler.map((r) => r.mesaj).join(' ');
    const govde: GoogleYayinGovdesi = { platform: 'google', kurgu: d.kurgu, govde: d.govde, sira: d.sira, logoVarlikId: d.sira.logo !== null ? (girdi.kurgu === 'ARAMA' ? (girdi.ogeler?.logoVarlikId ?? null) : girdi.logoVarlikId) : null };
    try {
      await googleYayinKaydiOlustur(tx, {
        id: yayinId,
        orgId: s.org_id,
        clientId: s.client_id,
        taslakId: s.google_taslak_id,
        taslakSurumNo: c.aktif_surum_no,
        icerikOzeti: c.icerik_ozeti,
        adAccountId: b.google.id,
        govde,
        beklenen: d.beklenen,
        apiSurumu: this.config.platforms.google.apiVersion,
        derleyiciSurumu: GOOGLE_DERLEYICI_SURUMU,
        atifStandardi: d.atif,
        baslatanId: ctx.userId,
        kapaliKalacak,
        uyum,
      });
    } catch (e) {
      // Taslak başına tek aktif yayın indeksi: çift tıklamanın ASIL koruması.
      if (String((e as Error).message).includes('yayin_taslak_aktif_key')) return 'Bu Google taslağının süren bir yayını var.';
      throw e;
    }
    try {
      await this.kuyruk.ekleGoogle(yayinId);
    } catch (e) {
      // Kuyruğa girmeyen yayın sonsuza kadar on_kontrol'de kalırdı. Google'a
      // hiçbir şey gitmedi: kapat.
      await yayiniSonlandir(tx, yayinId, 'on_kontrol_reddi', `Kuyruğa alınamadı: ${(e as Error).message}`);
      return 'Yayın kuyruğa alınamadı; birazdan yeniden dene.';
    }
    return null;
  }

  // ===========================================================================
  // Yardımcılar
  // ===========================================================================

  private async satir(ctx: TenantContext, id: string): Promise<RehberSatiri> {
    const [s] = await this.tx(ctx)((t) => t.$queryRaw<RehberSatiri[]>(Prisma.sql`SELECT ${SUTUNLAR} FROM reklam_rehberi WHERE id = ${id}::uuid`));
    if (!s) throw new NotFoundException('Rehber bulunamadı');
    erisim(ctx, s.client_id);
    return s;
  }

  private async kayit(ctx: TenantContext, s: RehberSatiri): Promise<RehberKaydi> {
    const a = alanlariOku(s);
    const son = await this.sonProvaGirdisi(ctx, s);
    const b = this.sonProvaSitesi(son, a, await this.baglam(ctx, s.client_id, a));
    const amac = a.amac?.deger;
    /*
     * ÖĞE SATIRLARI KALICI KAYNAKTAN (Ajan 4, Ö-A). Öğe reddi yalnız 15 dk
     * bellek önbelleğindeydi (telefon ulaşmasında hiç yazılmıyordu): önbellek
     * dolunca ekran "İşletme adı: Eklendi" diyor, yayına giden gövdede işletme
     * adı yoktu. Prova bu içeriğe yapıldıysa satırlar provanın girdisinden
     * (yayın o girdiden derleniyor) ve gövdeyle uzlaştırılarak.
     */
    const ogeDurumlari =
      son && son.kurgu === 'ARAMA' && son.ogeDurumlari && s.prova_ozeti === rehberOzeti(a)
        ? ogeDurumlariGovdeyle(son.ogeDurumlari, son.ogeler, son.ulasma)
        : null;
    return {
      id: s.id,
      clientId: s.client_id,
      durum: s.durum,
      surum: s.surum,
      alanlar: a,
      eksikler: rehberEksikleri(a, b),
      // Teklif kuralı `rehberdenGoogle` ile AYNI fonksiyondan (`googleTeklifi`):
      // önceden burada ayrı yazılıydı ve Talep Yaratma'da gövdenin tutmadığı
      // "En çok dönüşüm"ü söylüyordu.
      kararlar: amac ? this.kararlar(amac, a, b, ogeDurumlari) : [],
      metaTaslakId: s.meta_taslak_id,
      googleTaslakId: s.google_taslak_id,
      icerikOzeti: rehberOzeti(a),
      updatedAt: new Date(s.updated_at).toISOString(),
    };
  }

  /**
   * SİTE OKUMASI BELLEKTE 15 DAKİKA; SEBEBİ KALICI OLMALI (açık not,
   * 2026-10-13). Önbellek dolunca karar tablosu "prova sırasında okunur"a
   * dönüyor ve provanın bulduğu sebep ("site tek sayfa") kayboluyordu;
   * kullanıcı site bağlantılarının neden boş olduğunu bir daha göremiyordu.
   * Son provanın Google girdisi (çocuk taslak) bağlantıları ve sebebi
   * taşıyor: önbellek yokken ve adres aynıysa oradan okunur.
   */
  private sonProvaSitesi(g: GoogleDerlemeGirdisi | null, a: RehberAlanlari, b: Baglam): Baglam {
    if (!g || !b.uzantilar || b.uzantilar.siteBaglantilari !== null) return b;
    if (g.hedefAdres !== a.hedefAdres?.deger || g.siteBaglantilari === undefined) return b;
    return { ...b, uzantilar: { ...b.uzantilar, siteBaglantilari: g.siteBaglantilari, siteSebebi: g.siteSebebi ?? null } };
  }

  /** Son provanın Google girdisi (çocuk taslağın aktif sürümü); yoksa `null`. */
  private async sonProvaGirdisi(ctx: TenantContext, s: RehberSatiri): Promise<GoogleDerlemeGirdisi | null> {
    if (!s.google_taslak_id) return null;
    const [c] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ alanlar: unknown }>>(Prisma.sql`
        SELECT v.alanlar FROM reklam_taslagi t
          JOIN taslak_surumu v ON v.taslak_id = t.id AND v.surum_no = t.aktif_surum_no
         WHERE t.id = ${s.google_taslak_id}::uuid`),
    );
    if (!c) return null;
    try {
      return googleGirdisiOku(c.alanlar);
    } catch {
      return null;
    }
  }

  /**
   * Karar tablosu. Teklif ve sebebi `rehberdenGoogle` ile AYNI fonksiyondan
   * (`googleTeklifKarari`), Meta hedefi derleyiciyle AYNI piksel hâlinden.
   */
  private kararlar(amac: NonNullable<RehberAlanlari['amac']>['deger'], a: RehberAlanlari, b: Baglam, provaOgeleri: GoogleOgeDurumu[] | null = null) {
    const kurgu = REHBER_AMACLARI[amac].google.kurgu;
    const gTanim = REHBER_AMACLARI[amac].google;
    const teklif = kurgu ? googleTeklifKarari(kurgu, b.googleDonusum, b.googleDonusum30Gun, gTanim.kurgu ? gTanim.ulasma : null) : null;
    return kararTablosu(
      amac,
      acikPlatformlar(a, b.ajansYoneticisi),
      teklif?.teklif ?? 'MAKS_TIKLAMA',
      a.instagramId?.deger != null,
      rehberYerlesimPlani(a, b.medyaOranlari ?? new Map()),
      {
        sitePikseli: b.sitePikseli,
        ...(teklif ? { googleTeklifSebebi: teklif.sebep } : {}),
        uzantilar: b.uzantilar,
        // Öğe satırları derleyicinin okuduğu AYNI fonksiyondan (`googleAramaOgeleri`).
        // Prova bu içeriğe yapıldıysa provanın (yayına gidecek) satırları.
        ogeler: provaOgeleri ?? (b.ogeKaynagi ? googleAramaOgeleri(b.ogeKaynagi).durumlar : null),
        // Seçili formun türü ve soru sayısı: eksik listesinin okuduğu AYNI hâl.
        form: b.onKosullar?.seciliForm ?? null,
        // WhatsApp ilk mesajı: setli fikirlerde gitmediğini tablo söylesin.
        whatsappKarsilama: { kayit: a.whatsappKarsilama?.deger ?? null, setler: rehberFikirSetleri(a, b.medyaOranlari ?? new Map()) },
        // TELEFON: arama öğesinin saatleri (derleyicinin gönderdiği AYNI değer).
        calismaSaatleri: b.calismaSaatleri,
        googleSaatDilimi: b.google?.timezone ?? null,
      },
    );
  }

  /** Marka adı (site bağlantısı metninden ayıklanır: "Hizmetler | Marka"). */
  private async markaAdi(ctx: TenantContext, clientId: string): Promise<string | null> {
    const [m] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ marka: string | null; ad: string }>>(Prisma.sql`
        SELECT p.marka_adi AS marka, c.name AS ad FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id WHERE c.id = ${clientId}::uuid`),
    );
    return m?.marka ?? m?.ad ?? null;
  }

  /** Eksik/karar bağlamı: YALNIZ veritabanı ve önbellek — platform çağrısı yok. */
  private async baglam(ctx: TenantContext, clientId: string, a: RehberAlanlari): Promise<Baglam> {
    const [b] = await this.baglamlar(ctx, clientId, [a]);
    return b!;
  }

  /**
   * AYNI WORKSPACE'İN BİRDEN ÇOK REHBERİ İÇİN BAĞLAM, TEK TRANSACTION'DA.
   * Liste ucu her satır için `baglam` çağırıyordu: satır başına bir
   * transaction ve beş sorgu, üstüne yayın durumu için iki-üç tane daha.
   * Ege Birlik Yapı'nın 24 satırında yüzü aşkın gidiş-dönüş demekti ve
   * satır sayısıyla doğrusal büyüyordu. Workspace, ajans yetkisi ve marka
   * profili her satırda AYNI; hesap ve varlık ölçüleri birleşik kümeyle tek
   * sorguda okunuyor. Kalan tek satır başı sorgu eski kayıtların form
   * kimliği çevirisi (`formKimligiCoz`): yalnız UUID taşıyan eski form
   * değerinde koşuyor, sayısal kimlikte sorgusuz dönüyor.
   */
  private async baglamlar(ctx: TenantContext, clientId: string, liste: readonly RehberAlanlari[]): Promise<Baglam[]> {
    const hesapIdleri = [...new Set(liste.flatMap((a) => [a.metaHesabiId?.deger, a.googleHesabiId?.deger]).filter((x): x is string => !!x))];
    // BANNER SETİ: oran varlığın ÖLÇÜSÜNDEN (istemci söylemez). Workspace'in
    // arşivinde olmayan varlık listede yok, yani oranı `null` — türetme durur.
    const medyaIdleri = [...new Set(liste.flatMap((a) => (a.medya?.deger ?? []).map((x) => x.varlikId)))];
    const ortak = await this.tx(ctx)(async (t) => {
      const [m] = await t.$queryRaw<Array<NonNullable<BaglamVerisi['m']>>>(Prisma.sql`
        SELECT c.name AS ad, p.marka_adi AS marka, p.logo_asset_id::text AS logo, p.yasal_uyari AS yasal,
               c.special_ad_categories AS kategoriler, p.vaatler, c.contact_phone AS telefon,
               p.urun_kategorileri, la.width AS logo_genislik, la.height AS logo_yukseklik,
               p.calisma_saatleri
          FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
          LEFT JOIN assets la ON la.id = p.logo_asset_id AND la.client_id = c.id
         WHERE c.id = ${clientId}::uuid`);
      const hesaplar = hesapIdleri.length
        ? await t.$queryRaw<BaglamVerisi['hesaplar']>(Prisma.sql`
            SELECT id::text, platform::text AS platform, external_id, currency, timezone FROM ad_accounts
             WHERE client_id = ${clientId}::uuid AND id = ANY(${hesapIdleri}::uuid[])`)
        : [];
      // Hazırlık ucuyla AYNI kural, tek yardımcıdan (BULGU-5).
      const ajans = await ajansYoneticisiMi(t, ctx);
      const olculer = medyaIdleri.length
        ? await t.$queryRaw<BaglamVerisi['olculer']>(Prisma.sql`
            SELECT id::text, kind, width, height, byte_size FROM assets WHERE client_id = ${clientId}::uuid AND id = ANY(${medyaIdleri}::uuid[])`)
        : [];
      // ESKİ KAYIT: Dalga 2'den önce seçilen form `lead_forms.id` (UUID)
      // taşıyor; Meta listesiyle karşılaştırmak için Meta kimliğine çevrilir.
      const formKimlikleri: Array<string | null> = [];
      for (const a of liste) {
        const formDegeri = a.formSablonuId?.deger ?? null;
        formKimlikleri.push(formDegeri ? await formKimligiCoz(t, clientId, a.sayfaId?.deger ?? null, formDegeri) : null);
      }
      return { m, hesaplar, ajans, olculer, formKimlikleri };
    });
    return liste.map((a, i) => this.baglamKur(clientId, a, { ...ortak, formKimligi: ortak.formKimlikleri[i] ?? null }));
  }

  private baglamKur(clientId: string, a: RehberAlanlari, r: BaglamVerisi): Baglam {
    const metaId = a.metaHesabiId?.deger ?? null;
    const googleId = a.googleHesabiId?.deger ?? null;
    const meta = r.hesaplar.find((h) => h.id === metaId && h.platform === 'meta') ?? null;
    const google = r.hesaplar.find((h) => h.id === googleId && h.platform === 'google') ?? null;
    const o = this.onbellek.get(clientId);
    const taze = o && Date.now() - o.zaman < ONBELLEK_MS ? o : null;
    // Önbellek yalnız OKUNAN hesap/sayfa seçiliyse geçerli.
    const metaAsgari = taze && meta && taze.metaHesapId === meta.id ? taze.metaAsgari : null;
    const sayfa = this.sayfaOku(clientId, a.sayfaId?.deger);
    const googleDonusum = taze && google && taze.googleHesapId === google.id ? taze.googleDonusum : null;
    const googleSatis = taze && google && taze.googleHesapId === google.id ? taze.googleSatis : null;
    const googleDonusum30Gun = taze && google && taze.googleHesapId === google.id ? taze.googleDonusum30Gun : null;
    const saatlerOkunan = r.m?.calisma_saatleri == null ? null : calismaSaatleriSchema.safeParse(r.m.calisma_saatleri);
    if (saatlerOkunan && !saatlerOkunan.success) logger.warn(`Çalışma saatleri geçersiz (${clientId}), bilinmiyor sayıldı`);
    const calismaSaatleri = saatlerOkunan?.success && saatlerOkunan.data.length ? saatlerOkunan.data : null;
    // SİTE piksel hâli: SATIŞ'ın tam listesi de aynı hesabı anlatıyor; hangisi varsa.
    // SİTE okuması ÖNCE: SİTE amacının taze okuması o. Düştüyse (`okunamadi`)
    // satış listesine de düşülmez: hâl bilinmiyor = tıklama.
    const siteKaydi = meta ? this.sitePikselOnbellek.get(`${clientId}:${meta.id}`) : undefined;
    const siteTaze = siteKaydi && Date.now() - siteKaydi.zaman < ONBELLEK_MS ? siteKaydi : null;
    const sitePk = siteTaze?.okunamadi ? null : (siteTaze ?? (meta ? this.pikselKaydi(clientId, meta.id) : null));
    const sitePikseli = sitePikselHali(sitePk?.satirlar ?? null, new Date(), sitePk?.kesildi ?? false);
    const amacG = a.amac?.deger ? REHBER_AMACLARI[a.amac.deger].google : null;
    const uk = this.uzantiOnbellek.get(clientId);
    const ukTaze = uk && Date.now() - uk.zaman < ONBELLEK_MS && uk.adres === a.hedefAdres?.deger ? uk : null;
    const uzantilar: GoogleUzantiKaynagi | null =
      amacG?.kurgu === 'ARAMA' && amacG.ulasma === 'site'
        ? {
            siteBaglantilari: ukTaze ? ukTaze.siteBaglantilari : null,
            googleReddi: ukTaze?.googleReddi ?? null,
            siteSebebi: ukTaze?.sebep ?? null,
            ...(() => {
              const ac = aciklamaMetniSec(a.metin?.deger.aciklamaMetinleri, r.m?.vaatler ?? []);
              return { aciklamaMetinleri: ac.metinler, aciklamaKaynagi: ac.kaynak, aciklamaAtilan: ac.atilan };
            })(),
          }
        : null;
    // ARAMA ÖĞELERİ her ulaşmada (yönetici kararı 2026-10-12). Kaynaklar
    // veritabanından; yalnız site menüsü önbellekten (okunduysa).
    const ogeKaynagi: GoogleOgeKaynagi | null =
      amacG?.kurgu === 'ARAMA'
        ? {
            ulasma: amacG.ulasma === 'site' || amacG.ulasma === 'telefon' ? amacG.ulasma : null,
            workspaceTelefonu: r.m?.telefon ?? null,
            markaAdi: r.m?.marka ?? null,
            logo: r.m?.logo ? { varlikId: r.m.logo, genislik: r.m.logo_genislik ?? null, yukseklik: r.m.logo_yukseklik ?? null } : null,
            urunKategorileri: r.m?.urun_kategorileri ?? [],
            menuMetinleri: ukTaze?.menuMetinleri ?? null,
            promosyon: a.googlePromosyon?.deger ?? null,
            fiyatListesi: a.googleFiyatListesi?.deger ?? null,
            googleReddi: ukTaze?.googleReddi ?? null,
          }
        : null;
    const taban: OzelKategori[] = [];
    for (const k of r.m?.kategoriler ?? []) {
      // Meta CREDIT'i FINANCIAL_PRODUCTS_SERVICES ile değiştirdi; tanınmayan
      // taban burada düşmüyor, Meta derleyicisi OZK-TABAN ile durduruyor.
      const c = k === 'CREDIT' ? 'FINANCIAL_PRODUCTS_SERVICES' : k;
      if ((OZEL_KATEGORILER as readonly string[]).includes(c)) taban.push(c as OzelKategori);
    }
    // Piksel listesi SEÇİLİ Meta hesabının; başka hesabın listesiyle
    // karşılaştırmak "hesapta yok" yalanı üretirdi.
    const pk = this.pikselKaydi(clientId, meta?.id);
    const seciliPiksel = seciliPikselHali(a.pikselId?.deger ?? null, pk?.satirlar ?? null, new Date(), pk?.kesildi ?? false);
    const onKosullar: RehberOnKosullari = {
      metaFormKosullari: sayfa?.formKosullari ?? null,
      metaWhatsapp: sayfa?.whatsapp ?? null,
      metaSatisOlcumu: seciliPiksel?.satinAlma7Gun ?? null,
      seciliPiksel,
      googleSatisOlcumu: googleSatis,
      googleDonusumEtkin: googleDonusum,
      googleLogoVeAd: !!r.m?.logo,
      seciliForm: seciliFormHali(a.formSablonuId?.deger ?? null, r.formKimligi, sayfa?.formlar ?? null),
    };
    const acik = acikPlatformlar(a, r.ajans);
    const paraBirimi = (acik.meta && meta?.currency) || google?.currency || meta?.currency || 'TRY';
    return {
      ajansYoneticisi: r.ajans,
      onKosullar,
      yasalUyari: r.m?.yasal ?? null,
      asgariGunluk: {
        meta: metaAsgari === null ? null : BigInt(metaAsgari),
        googleTalepYaratma: google?.currency === 'TRY' ? GOOGLE_TY_ASGARI_TRY_MICROS : null,
      },
      paraBirimi,
      paraBirimleriAyni: !(meta && google) || meta.currency === google.currency,
      // Geçmiş tarihli promosyon bitişi GİRİŞTE engel (Ajan 4, N-1): bugün
      // Google hesabının saat diliminde (promosyon Google öğesi).
      bugun: new Intl.DateTimeFormat('en-CA', { timeZone: google?.timezone ?? 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
      googleDonusum,
      googleDonusum30Gun,
      calismaSaatleri,
      sitePikseli,
      uzantilar,
      ogeKaynagi,
      isletmeAdi: r.m?.marka ?? r.m?.ad ?? 'İşletme',
      logoVarlikId: r.m?.logo ?? null,
      kategoriTabani: [...new Set(taban)],
      meta: meta ? { id: meta.id, currency: meta.currency, timezone: meta.timezone } : null,
      google: google ? { id: google.id, externalId: google.external_id, currency: google.currency, timezone: google.timezone } : null,
      workspaceAdi: r.m?.ad ?? 'Workspace',
      medyaOranlari: new Map(
        (a.medya?.deger ?? []).map((x) => {
          const v = r.olculer.find((o) => o.id === x.varlikId);
          return [x.varlikId, v && v.kind === 'image' ? oranBul(v.width, v.height) : null] as const;
        }),
      ),
      // Google'ın ±%1 ve en az boyut kuralı GİRİŞ ANINDA (`googleGorselBulgulari`).
      googleGorselOlculeri: new Map(
        (a.medya?.deger ?? []).map((x) => {
          const v = r.olculer.find((o) => o.id === x.varlikId);
          const olcu: GorselOlcusu | null = v && v.kind === 'image' && v.width && v.height ? { genislik: v.width, yukseklik: v.height, bayt: v.byte_size ?? 0 } : null;
          return [x.varlikId, olcu] as const;
        }),
      ),
    };
  }

  private async cocukBagla(ctx: TenantContext, rehberId: string, platform: RehberPlatformu, taslakId: string): Promise<void> {
    await this.tx(ctx)((t) =>
      platform === 'meta'
        ? t.$queryRaw(Prisma.sql`UPDATE reklam_rehberi SET meta_taslak_id = ${taslakId}::uuid WHERE id = ${rehberId}::uuid RETURNING id`)
        : t.$queryRaw(Prisma.sql`UPDATE reklam_rehberi SET google_taslak_id = ${taslakId}::uuid WHERE id = ${rehberId}::uuid RETURNING id`),
    );
  }

  /**
   * Google çocuk taslağı ve DEĞİŞMEZ sürümü. Meta'nın strict şeması burada
   * UYGULANMAZ (sürüm `GoogleDerlemeGirdisi` taşıyor; MIMARI § 2.2). Aynı
   * özet ikinci sürüm yazmaz.
   */
  private async googleCocukYaz(ctx: TenantContext, s: RehberSatiri, g: GoogleDerlemeGirdisi, hesapId: string): Promise<{ taslakId: string; surumNo: number; ozet: string }> {
    const json = JSON.parse(JSON.stringify(g, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) as unknown;
    const ozet = createHash('sha256').update(kanonikJson(json)).digest('hex');
    return this.tx(ctx)(async (t) => {
      let taslakId = s.google_taslak_id;
      if (!taslakId) {
        const [y] = await t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, ad_account_id, niyet_kodu)
          VALUES (${s.org_id}::uuid, ${s.client_id}::uuid, 'google'::"Platform", 'acemi', ${ctx.userId}::uuid, ${hesapId}::uuid, ${g.kurgu})
          RETURNING id::text`);
        taslakId = y!.id;
        await t.$queryRaw(Prisma.sql`UPDATE reklam_rehberi SET google_taslak_id = ${taslakId}::uuid WHERE id = ${s.id}::uuid RETURNING id`);
      }
      const [c] = await t.$queryRaw<Array<{ durum: string; aktif_surum_no: number; icerik_ozeti: string | null }>>(Prisma.sql`
        SELECT t.durum, t.aktif_surum_no, v.icerik_ozeti FROM reklam_taslagi t
          LEFT JOIN taslak_surumu v ON v.taslak_id = t.id AND v.surum_no = t.aktif_surum_no
         WHERE t.id = ${taslakId}::uuid FOR UPDATE OF t`);
      if (!c) throw new NotFoundException('Google taslağı bulunamadı');
      if (c.durum !== 'taslak' && c.durum !== 'hazir') throw new ConflictException('Google tarafında süren bir yayın var.');
      if (c.icerik_ozeti === ozet) return { taslakId, surumNo: c.aktif_surum_no, ozet };
      const no = c.aktif_surum_no + 1;
      await t.$queryRaw(Prisma.sql`
        INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, eksikler, olusturan_id)
        VALUES (${taslakId}::uuid, ${s.org_id}::uuid, ${s.client_id}::uuid, ${no}, ${JSON.stringify(json)}::jsonb, ${ozet}, '[]'::jsonb, ${ctx.userId}::uuid)
        RETURNING id`);
      const [u] = await t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE reklam_taslagi SET aktif_surum_no = ${no}, ad_account_id = ${hesapId}::uuid, niyet_kodu = ${g.kurgu}, updated_at = now()
         WHERE id = ${taslakId}::uuid RETURNING id::text`);
      if (!u) throw new ConflictException('Google taslağı güncellenemedi.');
      return { taslakId, surumNo: no, ozet };
    });
  }

  /**
   * GÖRSEL KURGULARININ görselleri (Dalga 3): her biri için hesapta kayıtlı
   * Google kaynak adı (`asset_platform_refs`, logo ile aynı önbellek) ya da
   * arşivden bayt, ve ÖLÇÜSÜ (derleyici Google'ın ±%1 kuralını onunla
   * uyguluyor). Arşivde olmayan görsel haritaya GİRMEZ; derleyici onu
   * `G-GORSEL-KAYNAK` ile reddeder (sessizce eksik görselle kurmak yok).
   * 9:16 (Google'a gitmiyor) için bayt okunmuyor.
   */
  private async googleGorselKaynaklari(
    ctx: TenantContext,
    clientId: string,
    g: GoogleDerlemeGirdisi,
    hesapId: string,
  ): Promise<Map<string, { kaynak: GoogleGorselKaynagi; olcu: GorselOlcusu }>> {
    const sonuc = new Map<string, { kaynak: GoogleGorselKaynagi; olcu: GorselOlcusu }>();
    if (!googleGorselKurgusuMu(g.kurgu)) return sonuc;
    const idler = (g.gorseller ?? []).filter((x) => x.oran !== 'dikey').map((x) => x.varlikId);
    if (idler.length === 0) return sonuc;
    const tx = this.tx(ctx);
    const satirlar = await tx((t) =>
      t.$queryRaw<Array<{ id: string; name: string; width: number; height: number; byte_size: number; ref: string | null }>>(Prisma.sql`
        SELECT a.id::text, a.name, a.width, a.height, a.byte_size, r.external_ref AS ref
          FROM assets a
          LEFT JOIN asset_platform_refs r ON r.asset_id = a.id AND r.ad_account_id = ${hesapId}::uuid
         WHERE a.client_id = ${clientId}::uuid AND a.kind = 'image' AND a.id = ANY(${idler}::uuid[])`),
    );
    const oku = gorselOkuyucu(tx, this.config.uploads.dir, clientId);
    for (const v of satirlar) {
      const olcu = { genislik: v.width, yukseklik: v.height, bayt: v.byte_size };
      const kaynak: GoogleGorselKaynagi = v.ref ? { resource: v.ref } : { yeniGorsel: { name: v.name, bytes: await oku(v.id) } };
      sonuc.set(v.id, { kaynak, olcu });
    }
    return sonuc;
  }

  /** Talep Yaratma ve Maks. Performans logosu: hesapta kayıtlı kaynak adı, değilse arşivden bayt. */
  private async googleLogo(ctx: TenantContext, clientId: string, g: GoogleDerlemeGirdisi, hesapId: string): Promise<GoogleLogo | null> {
    // ARAMA: işletme logosu öğesi (g-1.2.0) — yalnız öğe seçimi logoyu
    // kabul ettiyse (kare, ≥ 128). Aynı önbellek (`asset_platform_refs`):
    // hesapta bir kez yüklenen logo yeniden yüklenmez.
    if (g.kurgu === 'ARAMA') {
      if (!g.ogeler?.logoVarlikId) return null;
      // Arama'da logo İSTEĞE BAĞLI: okunamazsa derleyici öğeyi düşürüp notta
      // söylüyor (`!b.logo`); yayın düşmez (Ajan 4, Ö-B).
      const id = g.ogeler.logoVarlikId;
      return this.googleLogo(ctx, clientId, { ...g, kurgu: 'TALEP_YARATMA_VIDEO', logoVarlikId: id }, hesapId).catch((e: unknown) => {
        logger.warn(`Arama logosu okunamadı (${id}): ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
    } else if (g.kurgu !== 'TALEP_YARATMA_VIDEO' && !googleGorselKurgusuMu(g.kurgu)) return null;
    if (!g.logoVarlikId) return null;
    const tx = this.tx(ctx);
    const [ref] = await tx((t) =>
      t.$queryRaw<Array<{ ref: string }>>(Prisma.sql`
        SELECT external_ref AS ref FROM asset_platform_refs WHERE asset_id = ${g.logoVarlikId}::uuid AND ad_account_id = ${hesapId}::uuid`),
    );
    if (ref) return { resource: ref.ref };
    return { yeniGorsel: { name: `${g.isletmeAdi ?? 'Logo'} logo`, bytes: await gorselOkuyucu(tx, this.config.uploads.dir, clientId)(g.logoVarlikId) } };
  }

  /** Arama logosunun okunup okunamadığı: okunamıyorsa kısa sebep, okunuyorsa `null`. */
  private async aramaLogoSorunu(ctx: TenantContext, clientId: string, varlikId: string, hesapId: string): Promise<string | null> {
    const tx = this.tx(ctx);
    try {
      const [ref] = await tx((t) =>
        t.$queryRaw<Array<{ ref: string }>>(Prisma.sql`
          SELECT external_ref AS ref FROM asset_platform_refs WHERE asset_id = ${varlikId}::uuid AND ad_account_id = ${hesapId}::uuid`),
      );
      if (ref) return null;
      await gorselOkuyucu(tx, this.config.uploads.dir, clientId)(varlikId);
      return null;
    } catch (e) {
      const m = e instanceof Error ? ((e as NodeJS.ErrnoException).code ?? e.message) : String(e);
      logger.warn(`Arama logosu okunamadı (${varlikId}): ${m}`);
      return m.slice(0, 120);
    }
  }

  /** Platform provasının durumu — yayın kapısı ve GET prova aynı fonksiyonu okuyor. */
  private async provaHali(ctx: TenantContext, s: RehberSatiri, p: RehberPlatformu): Promise<PlatformProvaHali> {
    const taslakId = p === 'meta' ? s.meta_taslak_id : s.google_taslak_id;
    if (!taslakId) return { tur: 'yok', metin: 'Bu hâl için prova yapılmadı.' };
    const tx = this.tx(ctx);
    const [t] = await tx((x) =>
      x.$queryRaw<Array<{ aktif_surum_no: number; icerik_ozeti: string | null }>>(Prisma.sql`
        SELECT t.aktif_surum_no, v.icerik_ozeti FROM reklam_taslagi t
          LEFT JOIN taslak_surumu v ON v.taslak_id = t.id AND v.surum_no = t.aktif_surum_no
         WHERE t.id = ${taslakId}::uuid`),
    );
    if (!t?.icerik_ozeti) return { tur: 'yok', metin: 'Bu hâl için prova yapılmadı.' };
    if (p === 'meta') {
      const d = await provaDurumu(tx, taslakId, t.aktif_surum_no, t.icerik_ozeti, this.metaSurumu, new Date());
      return d.tur === 'gecti' ? { tur: 'gecti' } : d;
    }
    const [g] = await tx((x) =>
      x.$queryRaw<Array<{ durum: string; bitti_at: Date | null; sebep: string | null }>>(Prisma.sql`
        SELECT durum, bitti_at, sebep FROM prova
         WHERE taslak_id = ${taslakId}::uuid AND taslak_surum_no = ${t.aktif_surum_no} AND icerik_ozeti = ${t.icerik_ozeti}
           AND api_surumu = ${this.config.platforms.google.apiVersion} AND derleyici_surumu = ${GOOGLE_DERLEYICI_SURUMU}
         ORDER BY created_at DESC LIMIT 1`),
    );
    if (!g) return { tur: 'yok', metin: 'Google’ın ön kontrolü bu hâl için yapılmadı.' };
    if (g.durum === 'bekliyor') return { tur: 'bekliyor', metin: 'Google’a soruluyor…' };
    if (g.durum === 'reddedildi') return { tur: 'reddedildi', metin: g.sebep ?? 'Google bir alanı kabul etmedi.' };
    if (g.durum === 'dogrulanamadi') return { tur: 'dogrulanamadi', metin: `Google’ın kontrolü tamamlanamadı: ${g.sebep ?? ''}`.trim() };
    if (!g.bitti_at || Date.now() - new Date(g.bitti_at).getTime() > PROVA_TAZELIK_MS) {
      return { tur: 'bayat', metin: 'Google’ın ön kontrolü 30 dakikadan eski; yeniden prova et.' };
    }
    return { tur: 'gecti' };
  }

  private async googleBaglami(ctx: TenantContext, adAccountId: string, clientId: string | null): Promise<{ fctx: FetchContext }> {
    const [h] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ connection_id: string; external_id: string; manager_external_id: string | null; client_id: string | null }>>(Prisma.sql`
        SELECT connection_id::text, external_id, manager_external_id, client_id::text FROM ad_accounts
         WHERE id = ${adAccountId}::uuid AND platform = 'google'`),
    );
    // Havuz hesabı başka bir müşterinin olabilir: yalnız bu workspace'e ATANMIŞ hesap.
    if (!h || !h.client_id || (clientId !== null && h.client_id !== clientId)) throw new BadRequestException('Google Ads hesabı bu workspace’e atanmış değil.');
    const accessToken = await this.kasa.getAccessToken(h.connection_id, this.saglayicilar.get('google'));
    return { fctx: { accessToken, accountExternalId: h.external_id.replace(/-/g, ''), loginCustomerId: h.manager_external_id ?? undefined } };
  }

  /**
   * Google kotası — istek GİTMEDEN. Bekçi kapalıysa (Redis yok) engellemiyor
   * ama log'a yazıyor; kapalıyken susmak, kotayı kimin yediğini gizlerdi.
   */
  private async kotaKapisi(adAccountId: string): Promise<void> {
    if (!this.kota.isEnabled) {
      logger.warn('Kota bekçisi kapalı (REDIS_URL yok); rehberin Google isteği kota kontrolsüz gidiyor.');
      return;
    }
    const g = await this.kota.acquire({ platform: 'google', adAccountId, layer: 'interactive' });
    if (!g.allowed) {
      const dk = Math.max(1, Math.ceil((g.retryAfterMs ?? 60_000) / 60_000));
      throw new BadRequestException(`Google Ads kotası şu an dolu (${g.reason ?? 'kota'}). Yaklaşık ${dk} dakika sonra tekrar dene.`);
    }
  }
}

/**
 * Liste satırının küçük görsel adayları, öncelik sırasıyla: ilk medya
 * videoysa KAPAĞI (videonun kendisi `<img>` ile gösterilemez), sonra
 * kendisi. Sorgu yalnız `kind = 'image'` olanı seçtiği için video kimliği
 * aday olarak kalsa da seçilmez.
 */
export function gorselAdaylari(a: RehberAlanlari): string[] {
  const ilk = a.medya?.deger[0];
  if (!ilk) return [];
  return ilk.kapakVarlikId ? [ilk.kapakVarlikId, ilk.varlikId] : [ilk.varlikId];
}

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

/**
 * Kayıtlı alanlar şemadan geçerek okunuyor. Geçmiyorsa (şema daralmış,
 * eski kayıt) PATLAMIYOR ama BOŞ DA DÖNMÜYOR — boş dönmek kullanıcının
 * yarım işini sessizce silmek olurdu; hata ekranda ve log'da.
 */
function alanlariOku(s: RehberSatiri): RehberAlanlari {
  const r = rehberAlanlariSchema.safeParse(s.alanlar);
  if (r.success) return r.data;
  logger.error(`reklam_rehberi(${s.id}).alanlar şemadan geçmiyor: ${r.error.message}`);
  throw new ConflictException('Rehberin kayıtlı alanları okunamadı; destek ekibine bildir.');
}

/** Seçilen hesap, sayfa, kanal ve medya BU workspace'in olmalı (RLS havuzu yöneticiye açıyor). */
async function aitlikDenetle(t: { $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T> }, clientId: string, a: RehberAlanlari): Promise<void> {
  const hesap = async (id: string | undefined | null, platform: 'meta' | 'google', mesaj: string) => {
    if (!id) return;
    const [r] = await t.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
      SELECT 1 AS ok FROM ad_accounts WHERE id = ${id}::uuid AND client_id = ${clientId}::uuid AND platform = ${platform}::"Platform"`);
    if (!r) throw new BadRequestException(mesaj);
  };
  const profil = async (id: string | undefined | null, tur: string, mesaj: string) => {
    if (!id) return;
    const [r] = await t.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
      SELECT 1 AS ok FROM social_profiles WHERE id = ${id}::uuid AND client_id = ${clientId}::uuid AND profile_type::text = ${tur}`);
    if (!r) throw new BadRequestException(mesaj);
  };
  await hesap(a.metaHesabiId?.deger, 'meta', 'Meta reklam hesabı bu workspace’e atanmış değil.');
  await hesap(a.googleHesabiId?.deger, 'google', 'Google Ads hesabı bu workspace’e atanmış değil.');
  await profil(a.sayfaId?.deger, 'facebook_page', 'Facebook sayfası bu workspace’te değil.');
  await profil(a.instagramId?.deger, 'instagram_business', 'Instagram hesabı bu workspace’te değil.');
  await profil(a.youtubeKanaliId?.deger, 'youtube_channel', 'YouTube kanalı bu workspace’te değil.');
  const medya = [...new Set((a.medya?.deger ?? []).flatMap((m) => (m.kapakVarlikId ? [m.varlikId, m.kapakVarlikId] : [m.varlikId])))];
  if (medya.length) {
    const [r] = await t.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(*)::int AS n FROM assets WHERE client_id = ${clientId}::uuid AND id = ANY(${medya}::uuid[])`);
    if ((r?.n ?? 0) !== medya.length) throw new BadRequestException('Seçilen medyanın bir kısmı bu workspace’in arşivinde değil.');
  }
}

/** Saklanan Google sürümü → derleyici girdisi (micros dizgeden BigInt'e). */
function googleGirdisiOku(ham: unknown): GoogleDerlemeGirdisi {
  const g = ham as GoogleDerlemeGirdisi & { butce: { tip: 'gunluk' | 'toplam'; micros: string | bigint } };
  return { ...g, butce: { tip: g.butce.tip, micros: BigInt(g.butce.micros) } };
}

function hal2sonuc(h: { tur: string; metin: string }): PlatformProvaSonucu {
  if (h.tur === 'reddedildi') return { tur: 'reddetti', zaman: new Date().toISOString(), mesajlar: [h.metin] };
  // Kuyruktaki prova "yapılmadı" DEĞİL: panel yoklamaya devam etmeli.
  if (h.tur === 'bekliyor') return { tur: 'bekliyor', zaman: new Date().toISOString() };
  return { tur: 'yapilmadi', sebep: h.metin };
}
