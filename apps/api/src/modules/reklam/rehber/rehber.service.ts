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
  OZEL_KATEGORILER,
  PROVA_TAZELIK_MS,
  REHBER_AMACLARI,
  acikPlatformlar,
  kanonikJson,
  kararTablosu,
  platformAcilabilirMi,
  rehberAlanlariSchema,
  rehberEksikleri,
  rehberdenGoogle,
  rehberdenMeta,
  taslakAlanlariSchema,
  uyumDenetle,
  type AnahtarKelimeOnerisi,
  type GoogleDerlemeGirdisi,
  type MetinOnerisi,
  type OzelKategori,
  type PlatformProvaSonucu,
  type PlatformYayinOzeti,
  type RehberAlanlari,
  type RehberDurumu,
  type RehberEksikBaglami,
  type RehberGuncelle,
  type RehberHazirligi,
  type RehberKaydi,
  type RehberListesi,
  type RehberOnKosullari,
  type RehberOzeti,
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
import { metinIste, YapayZekaHatasi, type GeminiIstemcisi } from '../../../yapay-zeka/gemini';
import { PlatformApiError, type FetchContext } from '../../connections/provider.types';
import { ProviderRegistry } from '../../connections/provider.registry';
import type { GoogleProvider } from '../../connections/providers/google.provider';
import { googleAlanHatalari, googleYalinKimlik } from '../../connections/providers/google-demandgen';
import { TokenVaultService } from '../../connections/token-vault.service';
import { YouTubeApiService } from '../../autoboost/youtube-api.service';
import { ReklamHazirlikService, type RehberPlatformOkuyucu } from '../hazirlik.service';
import { gorselOkuyucu, hesapErisimi, sayfaTokenOkuyucu } from '../meta-erisim';
import { ReklamKuyrugu } from '../reklam-kuyrugu';
import { ReklamTaslakService, type AlanDegisikligi } from '../taslak.service';
import { provaDurumu } from '../yayin-baslat';
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
  kelimeOnerisiHazirla,
  kelimeTohumlari,
  konumEsle,
  metinOneriIstemi,
  metinOnerisiTemizle,
} from './oneriler';
import { metaAsgariOku, metaFormKosuluOku } from './platform-okuma';
import { rehberYayinKapilari, type PlatformProvaHali } from './yayin-kapilari';

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
  sayfaId: string | null;
  googleHesapId: string | null;
  metaAsgari: string | null;
  metaForm: boolean | null;
  googleDonusum: boolean | null;
}
const ONBELLEK_MS = 15 * 60_000;

/** Bir rehberin eksik/karar bağlamı: yalnız veritabanı + önbellek. */
interface Baglam extends RehberEksikBaglami {
  googleDonusum: boolean | null;
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
@Injectable()
export class RehberService {
  private readonly onbellek = new Map<string, OnKosulKaydi>();
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

  async hazirlik(ctx: TenantContext, clientId: string): Promise<RehberHazirligi> {
    const h = await this.hazirlikSvc.rehberOku(ctx, clientId, this.platformOkuyucu(ctx));
    this.onbellek.set(clientId, {
      zaman: Date.now(),
      metaHesapId: h.hesaplar[0]?.id ?? null,
      sayfaId: h.sayfalar[0]?.id ?? null,
      googleHesapId: h.googleHesaplari[0]?.id ?? null,
      metaAsgari: h.asgariGunluk.meta,
      metaForm: h.onKosullar.metaFormKosullari,
      googleDonusum: h.onKosullar.googleDonusumEtkin,
    });
    return h;
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
    };
  }

  // ===========================================================================
  // CRUD
  // ===========================================================================

  /** Workspace'in açık rehberleri — HEPSİ (kesme yok, `toplam` = satır sayısı; arşiv hariç). */
  async listele(ctx: TenantContext, clientId: string): Promise<RehberListesi> {
    erisim(ctx, clientId);
    const satirlar = await this.tx(ctx)((t) =>
      t.$queryRaw<RehberSatiri[]>(Prisma.sql`
        SELECT ${SUTUNLAR} FROM reklam_rehberi
         WHERE client_id = ${clientId}::uuid AND durum <> 'arsivlendi'
         ORDER BY updated_at DESC, id`),
    );
    const sonuc: RehberOzeti[] = [];
    for (const s of satirlar) {
      const a = alanlariOku(s);
      const b = await this.baglam(ctx, s.client_id, a);
      sonuc.push({
        id: s.id,
        amac: a.amac?.deger ?? null,
        durum: s.durum,
        platformlar: a.platformlar?.deger ?? { meta: false, google: false },
        eksikSayisi: rehberEksikleri(a, b).filter((e) => e.seviye === 'engel').length,
        updatedAt: new Date(s.updated_at).toISOString(),
      });
    }
    return { satirlar: sonuc, toplam: sonuc.length };
  }

  async olustur(ctx: TenantContext, clientId: string): Promise<RehberKaydi> {
    erisim(ctx, clientId);
    const s = await this.tx(ctx)(async (t) => {
      // org_id HEDEF WORKSPACE'TEN: "tüm şirketler" modunda ctx.orgId ev
      // şirketi kalıyor ve (client_id, org_id) kompozit anahtarını deler.
      const [c] = await t.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`SELECT org_id::text FROM clients WHERE id = ${clientId}::uuid`);
      if (!c) throw new NotFoundException('Workspace bulunamadı');
      const [r] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`
        INSERT INTO reklam_rehberi (org_id, client_id, olusturan_id)
        VALUES (${c.org_id}::uuid, ${clientId}::uuid, ${ctx.userId}::uuid)
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
      const [r] = await t.$queryRaw<RehberSatiri[]>(Prisma.sql`
        UPDATE reklam_rehberi SET durum = 'arsivlendi', arsivlendi_at = now(), updated_at = now()
         WHERE id = ${id}::uuid AND durum <> 'arsivlendi'
        RETURNING ${SUTUNLAR}`);
      if (!r) throw new ConflictException('Rehber bulunamadı ya da zaten arşivde.');
      erisim(ctx, r.client_id);
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
      yeni.push({ ...k, google: konumEsle(k, adaylar.map((x) => ({ key: x.key, name: x.name, countryCode: x.countryCode }))) });
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

  async metinOner(ctx: TenantContext, id: string): Promise<MetinOnerisi> {
    if (!this.yz) throw new ServiceUnavailableException('Yapay zekâ bağlı değil; metni kendin yaz.');
    const s = await this.satir(ctx, id);
    const a = alanlariOku(s);
    const [p] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ marka: string | null; sektor: string | null; bilgi: string | null; vaatler: string[] | null; uslup: string | null; kategoriler: string[] | null; yasal: string | null; ad: string }>>(Prisma.sql`
        SELECT p.marka_adi AS marka, p.sektor, p.marka_bilgileri AS bilgi, p.vaatler, p.uslup,
               p.urun_kategorileri AS kategoriler, p.yasal_uyari AS yasal, c.name AS ad
          FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
         WHERE c.id = ${s.client_id}::uuid`),
    );
    const amac = a.amac?.deger ? REHBER_AMACLARI[a.amac.deger].ekranAdi : 'belirtilmedi';
    const mevcut = a.metin?.deger;
    const satirlar = [
      `Amaç: ${amac}`,
      `İşletme: ${p?.marka ?? p?.ad ?? ''}`,
      p?.sektor ? `Sektör: ${p.sektor}` : null,
      p?.kategoriler?.length ? `Ürünler: ${p.kategoriler.join(', ')}` : null,
      p?.bilgi ? `Marka bilgisi: ${p.bilgi}` : null,
      p?.vaatler?.length ? `Vaatler: ${p.vaatler.join('; ')}` : null,
      p?.uslup ? `Üslup: ${p.uslup}` : null,
      a.hedefAdres?.deger ? `Site: ${a.hedefAdres.deger}` : null,
      p?.yasal ? `Zorunlu yasal uyarı: ${p.yasal}` : null,
      mevcut?.anaMetin ? `Kullanıcının yazdığı metin: ${mevcut.anaMetin}` : null,
      mevcut?.basliklar.length ? `Kullanıcının başlıkları: ${mevcut.basliklar.join(' | ')}` : null,
    ].filter((x): x is string => !!x);
    const girdi = satirlar.join('\n');
    let r;
    try {
      r = await metinIste(this.yz, { sistem: metinOneriIstemi(), metin: girdi, enCokCikti: 2_000, jsonSemasi: METIN_ONERI_SEMASI as unknown as Record<string, unknown> });
    } catch (e) {
      if (e instanceof YapayZekaHatasi) throw new ServiceUnavailableException(`Yapay zekâ cevap vermedi: ${e.message}`);
      throw e;
    }
    if (r.tur !== 'tamam') throw new ServiceUnavailableException(r.mesaj);
    let ham: unknown;
    try {
      ham = JSON.parse(r.metin);
    } catch {
      throw new ServiceUnavailableException('Yapay zekânın cevabı okunamadı; yeniden dene.');
    }
    return metinOnerisiTemizle(ham as object, { kaynakMetin: girdi, yasalUyari: p?.yasal ?? null });
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
    if (s.durum !== 'taslak') throw new ConflictException('Bu rehber için prova yapılmaz.');
    const a = alanlariOku(s);
    const b = await this.baglam(ctx, s.client_id, a);
    const engeller = rehberEksikleri(a, b).filter((e) => e.seviye === 'engel');
    if (engeller.length) throw new BadRequestException({ message: 'Önce eksikleri tamamla.', eksikler: engeller });
    const ozet = rehberOzeti(a);
    const acik = acikPlatformlar(a, b.ajansYoneticisi);
    const zaman = new Date().toISOString();

    const meta = acik.meta ? await this.metaProva(ctx, s, a, b, acik, zaman) : null;
    s = await this.satir(ctx, id);
    const google = acik.google ? await this.googleProva(ctx, s, a, b, acik) : null;

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
      return h.tur === 'gecti' ? { tur: 'gecti', zaman: new Date().toISOString(), not: null } : hal2sonuc(h);
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
    const t = rehberdenMeta(a, acik, b.meta?.currency ?? b.paraBirimi, zaman);
    if (t.tur === 'ret') return { tur: 'reddetti', zaman, mesajlar: t.kodlar.map((k) => `Eksik: ${k}`) };
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
      if (p.durum.tur === 'gecti') return { tur: 'gecti', zaman, not: null };
      return hal2sonuc(p.durum);
    } catch (e) {
      if (e instanceof ConflictException || e instanceof BadRequestException) {
        return { tur: 'reddetti', zaman, mesajlar: [String((e.getResponse() as { message?: unknown }).message ?? e.message)] };
      }
      throw e;
    }
  }

  private async googleProva(ctx: TenantContext, s: RehberSatiri, a: RehberAlanlari, b: Baglam, acik: Record<RehberPlatformu, boolean>): Promise<PlatformProvaSonucu> {
    const zaman = new Date().toISOString();
    if (!b.google) return { tur: 'reddetti', zaman, mesajlar: ['Google Ads hesabı seçilmedi.'] };
    const t = rehberdenGoogle(a, acik, {
      musteriId: b.google.externalId,
      paraBirimi: b.google.currency,
      saatDilimi: b.google.timezone,
      donusumEtkin: b.googleDonusum,
      isletmeAdi: b.isletmeAdi,
      logoVarlikId: b.logoVarlikId,
      kategoriTabani: b.kategoriTabani,
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
        return { tur: 'reddetti', zaman, mesajlar };
      }
      const m = e instanceof Error ? e.message : String(e);
      await bitir('dogrulanamadi', m);
      if (e instanceof BadRequestException) return { tur: 'yapilmadi', sebep: m };
      return { tur: 'yapilmadi', sebep: `Google'ın kontrolü tamamlanamadı: ${m}` };
    }
    await bitir('gecti', null);
    return { tur: 'gecti', zaman, not: d.notlar.length ? d.notlar.join(' ') : null };
  }

  // ===========================================================================
  // YAYIN
  // ===========================================================================

  async yayinla(ctx: TenantContext, id: string, istenenOzet: string): Promise<RehberYayinDurumu> {
    const s = await this.satir(ctx, id);
    if (s.durum !== 'taslak') throw new ConflictException('Bu rehber zaten yayına alındı ya da arşivde.');
    const a = alanlariOku(s);
    const b = await this.baglam(ctx, s.client_id, a);
    const eksikler = rehberEksikleri(a, b);
    const acik = acikPlatformlar(a, b.ajansYoneticisi);
    const tx = this.tx(ctx);
    const k = await rehberYayinKapilari(
      { istenenOzet, guncelOzet: rehberOzeti(a), provaOzeti: s.prova_ozeti, eksikler, acik },
      {
        prova: (p) => this.provaHali(ctx, s, p),
        yazma: (p) => (p === 'meta' ? metaYazmaAcikMi(tx, s.client_id) : googleYazmaAcikMi(tx, s.client_id)),
        uyum: () =>
          uyumDenetle({
            platformlar: acik,
            kategoriler: [...new Set([...b.kategoriTabani, ...(a.ekKategoriler?.deger ?? [])])],
            yasalUyari: b.yasalUyari,
            metaAnaMetin: a.metin?.deger.anaMetin ?? '',
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
    let baslayan = 0;
    if (acik.meta && s.meta_taslak_id) {
      const r = await this.metaYayinBaslat(ctx, s.meta_taslak_id, a, acik, b.meta?.currency ?? b.paraBirimi, { uyum: k.uyum, kapaliKalacak: !platformAcilabilirMi(amac, 'meta') });
      if (r) baslamayan.push({ platform: 'meta', taslakId: s.meta_taslak_id, yayinId: null, durum: null, sebep: r, kampanyaKimligi: null, duraklatilmisKalacak: !platformAcilabilirMi(amac, 'meta') });
      else baslayan++;
    }
    if (acik.google && s.google_taslak_id) {
      const r = await this.googleYayinBaslat(ctx, s, a, b, k.uyum, !platformAcilabilirMi(amac, 'google'));
      if (r) baslamayan.push({ platform: 'google', taslakId: s.google_taslak_id, yayinId: null, durum: null, sebep: r, kampanyaKimligi: null, duraklatilmisKalacak: !platformAcilabilirMi(amac, 'google') });
      else baslayan++;
    }
    if (baslayan > 0) {
      await tx((t) => t.$queryRaw(Prisma.sql`UPDATE reklam_rehberi SET durum = 'yayinda', updated_at = now() WHERE id = ${id}::uuid AND durum = 'taslak' RETURNING id`));
    }
    const d = await this.yayinDurumu(ctx, id);
    // Başlamayan platformun bu denemede yayın kaydı yok: satırı SEBEBİYLE
    // değiştirilir (eski bir yayın kaydını göstermek "başladı" sanılırdı).
    const yerine = (p: PlatformYayinOzeti) => baslamayan.find((x) => x.platform === p.platform) ?? p;
    const eksikler2 = baslamayan.filter((x) => !d.platformlar.some((p) => p.platform === x.platform));
    return { ...d, platformlar: [...d.platformlar.map(yerine), ...eksikler2] };
  }

  async yayinDurumu(ctx: TenantContext, id: string): Promise<RehberYayinDurumu> {
    const s = await this.satir(ctx, id);
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
      platformlar.push({
        platform,
        taslakId,
        yayinId: y?.id ?? null,
        durum: y?.durum ?? null,
        sebep: y?.sebep ?? null,
        // Google'da kaynak adı saklanıyor; Reklam Yöneticisi yalın kimlik arıyor.
        kampanyaKimligi: y?.kampanya ? (platform === 'google' ? googleYalinKimlik(y.kampanya) : y.kampanya) : null,
        duraklatilmisKalacak: y?.kapali_kalacak ?? false,
      });
    }
    return { rehberId: s.id, platformlar, uyum };
  }

  /** Meta: mevcut tek yayın yolu (`yayinBaslat`) — rehberin uyum kararıyla. Dönen değer: başlamadıysa sebebi. */
  private async metaYayinBaslat(
    ctx: TenantContext,
    taslakId: string,
    a: RehberAlanlari,
    acik: Record<RehberPlatformu, boolean>,
    paraBirimi: string,
    rehber: { uyum: { tur: 'gecti'; surum: string }; kapaliKalacak: boolean },
  ): Promise<string | null> {
    const [t] = await this.tx(ctx)((x) =>
      x.$queryRaw<Array<{ aktif_surum_no: number; icerik_ozeti: string | null }>>(Prisma.sql`
        SELECT t.aktif_surum_no, s.icerik_ozeti FROM reklam_taslagi t
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
    const yeniden = rehberdenMeta(a, acik, paraBirimi, new Date().toISOString());
    const beklenen = yeniden.tur === 'tamam' ? createHash('sha256').update(taslakKanonikIcerik(yeniden.deger)).digest('hex') : null;
    if (beklenen !== t.icerik_ozeti) return 'Meta taslağı rehberden sonra değişmiş; yeniden prova et.';
    const r = await this.yayinSvc.baslat(ctx, { taslakId, surumNo: t.aktif_surum_no, icerikOzeti: t.icerik_ozeti, testKipi: false, kaynak: 'panel', rehber });
    return r.tur === 'ret' ? r.retler.map((x) => x.mesaj).join(' ') : null;
  }

  /** Google: çocuk taslağın aktif sürümünden derle, kaydı yaz, kuyruğa al. */
  private async googleYayinBaslat(
    ctx: TenantContext,
    s: RehberSatiri,
    a: RehberAlanlari,
    b: Baglam,
    uyum: { tur: 'gecti'; surum: string },
    kapaliKalacak: boolean,
  ): Promise<string | null> {
    if (!b.google || !s.google_taslak_id) return 'Google Ads hesabı seçilmedi.';
    const tx = this.tx(ctx);
    const [c] = await tx((x) =>
      x.$queryRaw<Array<{ durum: string; aktif_surum_no: number; alanlar: unknown; icerik_ozeti: string | null; ad_account_id: string | null }>>(Prisma.sql`
        SELECT t.durum, t.aktif_surum_no, s.alanlar, s.icerik_ozeti, t.ad_account_id::text
          FROM reklam_taslagi t LEFT JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no
         WHERE t.id = ${s.google_taslak_id}::uuid`),
    );
    if (!c?.icerik_ozeti) return 'Google taslağı bulunamadı; yeniden prova et.';
    if (c.durum !== 'taslak' && c.durum !== 'hazir') return 'Google tarafında süren bir yayın var.';
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
    });
    if (d.tur === 'ret') return d.retler.map((r) => r.mesaj).join(' ');
    const govde: GoogleYayinGovdesi = { platform: 'google', kurgu: d.kurgu, govde: d.govde, sira: d.sira, logoVarlikId: d.sira.logo !== null ? girdi.logoVarlikId : null };
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
    const b = await this.baglam(ctx, s.client_id, a);
    const amac = a.amac?.deger;
    return {
      id: s.id,
      clientId: s.client_id,
      durum: s.durum,
      surum: s.surum,
      alanlar: a,
      eksikler: rehberEksikleri(a, b),
      // Teklif kuralı `rehberdenGoogle` ile AYNI: yalnız ölçüm KESİN etkinse dönüşüm.
      kararlar: amac ? kararTablosu(amac, acikPlatformlar(a, b.ajansYoneticisi), b.googleDonusum === true ? 'MAKS_DONUSUM' : 'MAKS_TIKLAMA', a.instagramId?.deger != null) : [],
      metaTaslakId: s.meta_taslak_id,
      googleTaslakId: s.google_taslak_id,
      icerikOzeti: rehberOzeti(a),
      updatedAt: new Date(s.updated_at).toISOString(),
    };
  }

  /** Eksik/karar bağlamı: YALNIZ veritabanı ve önbellek — platform çağrısı yok. */
  private async baglam(ctx: TenantContext, clientId: string, a: RehberAlanlari): Promise<Baglam> {
    const metaId = a.metaHesabiId?.deger ?? null;
    const googleId = a.googleHesabiId?.deger ?? null;
    const r = await this.tx(ctx)(async (t) => {
      const [m] = await t.$queryRaw<Array<{ ad: string; marka: string | null; logo: string | null; yasal: string | null; kategoriler: string[] }>>(Prisma.sql`
        SELECT c.name AS ad, p.marka_adi AS marka, p.logo_asset_id::text AS logo, p.yasal_uyari AS yasal,
               c.special_ad_categories AS kategoriler
          FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
         WHERE c.id = ${clientId}::uuid`);
      const hesaplar = await t.$queryRaw<Array<{ id: string; platform: string; external_id: string; currency: string; timezone: string }>>(Prisma.sql`
        SELECT id::text, platform::text AS platform, external_id, currency, timezone FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND id = ANY(${[metaId, googleId].filter((x): x is string => !!x)}::uuid[])`);
      // Hazırlık ucuyla AYNI kural, tek yardımcıdan (BULGU-5).
      const ajans = await ajansYoneticisiMi(t, ctx);
      return { m, hesaplar, ajans };
    });
    const meta = r.hesaplar.find((h) => h.id === metaId && h.platform === 'meta') ?? null;
    const google = r.hesaplar.find((h) => h.id === googleId && h.platform === 'google') ?? null;
    const o = this.onbellek.get(clientId);
    const taze = o && Date.now() - o.zaman < ONBELLEK_MS ? o : null;
    // Önbellek yalnız OKUNAN hesap/sayfa seçiliyse geçerli.
    const metaAsgari = taze && meta && taze.metaHesapId === meta.id ? taze.metaAsgari : null;
    const metaForm = taze && a.sayfaId && taze.sayfaId === a.sayfaId.deger ? taze.metaForm : null;
    const googleDonusum = taze && google && taze.googleHesapId === google.id ? taze.googleDonusum : null;
    const taban: OzelKategori[] = [];
    for (const k of r.m?.kategoriler ?? []) {
      // Meta CREDIT'i FINANCIAL_PRODUCTS_SERVICES ile değiştirdi; tanınmayan
      // taban burada düşmüyor, Meta derleyicisi OZK-TABAN ile durduruyor.
      const c = k === 'CREDIT' ? 'FINANCIAL_PRODUCTS_SERVICES' : k;
      if ((OZEL_KATEGORILER as readonly string[]).includes(c)) taban.push(c as OzelKategori);
    }
    const onKosullar: RehberOnKosullari = {
      metaFormKosullari: metaForm,
      metaWhatsapp: null,
      metaSatisOlcumu: null,
      googleSatisOlcumu: null,
      googleDonusumEtkin: googleDonusum,
      googleLogoVeAd: !!r.m?.logo,
      gizlilikAdresi: false,
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
      googleDonusum,
      isletmeAdi: r.m?.marka ?? r.m?.ad ?? 'İşletme',
      logoVarlikId: r.m?.logo ?? null,
      kategoriTabani: [...new Set(taban)],
      meta: meta ? { id: meta.id, currency: meta.currency, timezone: meta.timezone } : null,
      google: google ? { id: google.id, externalId: google.external_id, currency: google.currency, timezone: google.timezone } : null,
      workspaceAdi: r.m?.ad ?? 'Workspace',
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

  /** Talep Yaratma logosu: hesapta kayıtlıysa kaynak adı, değilse arşivden bayt. */
  private async googleLogo(ctx: TenantContext, clientId: string, g: GoogleDerlemeGirdisi, hesapId: string): Promise<GoogleLogo | null> {
    if (g.kurgu !== 'TALEP_YARATMA_VIDEO' && g.kurgu !== 'TALEP_YARATMA_GORSEL') return null;
    if (!g.logoVarlikId) return null;
    const tx = this.tx(ctx);
    const [ref] = await tx((t) =>
      t.$queryRaw<Array<{ ref: string }>>(Prisma.sql`
        SELECT external_ref AS ref FROM asset_platform_refs WHERE asset_id = ${g.logoVarlikId}::uuid AND ad_account_id = ${hesapId}::uuid`),
    );
    if (ref) return { resource: ref.ref };
    return { yeniGorsel: { name: `${g.isletmeAdi ?? 'Logo'} logo`, bytes: await gorselOkuyucu(tx, this.config.uploads.dir, clientId)(g.logoVarlikId) } };
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
