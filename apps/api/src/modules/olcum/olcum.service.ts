import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  analyticsBagliMi,
  altyapiBul,
  enUygunOneri,
  olcumSatirlari,
  siteKimlikleri,
  type GoogleDonusumIslemi,
  type MetaPikselOlcumu,
  type OlcumDurumuYaniti,
  type OlcumGirdisi,
  type OlcumOkumaHatasi,
  type SiteTaramasi,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import type { FetchContext } from '../connections/provider.types';
import type { GoogleProvider } from '../connections/providers/google.provider';
import type { MetaProvider } from '../connections/providers/meta.provider';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { sayfaHtmlGetir } from '../tenancy/site-oku';

const logger = new Logger('OlcumService');

/** Workspace başına önbellek: tarama + iki platform okuması pahalı ve ekran sık açılıyor. */
const ONBELLEK_MS = 10 * 60_000;
/** Ekranda "son 7 gün" diyor; Meta istatistiği bu pencereden. */
const META_GUN = 7;
/** Tag Manager dosyası en çok bu kadar kapsayıcı için okunur (bir sitede genelde bir). */
const GTM_SINIRI = 3;

export type SiteOkuyucu = (adres: string) => Promise<{ ok: true; html: string } | { ok: false; sebep: string }>;

/**
 * Sitenin ana sayfası + bulunan Tag Manager kapsayıcıları. Tag Manager dosyası
 * HERKESE AÇIK (`googletagmanager.com/gtm.js?id=`, ölçüldü) ve içindeki
 * etiketler kimlik taşıyor: Ege Birlik'te Analytics ve Meta pikseli YALNIZ
 * orada, sayfa kaynağında yok. Okunamayan kapsayıcı sessizce atlanmıyor,
 * `tagManagerOkunamayan`a yazılıyor.
 */
export async function siteTara(adres: string | null, oku: SiteOkuyucu): Promise<SiteTaramasi> {
  const bos = { tagManager: [], analytics: [], googleAds: [], metaPiksel: [], altyapi: null, tagManagerOkunamayan: [] };
  if (!adres || !adres.trim()) return { durum: 'adres_yok', adres: null, hata: null, ...bos };
  const tam = /^https?:\/\//i.test(adres.trim()) ? adres.trim() : `https://${adres.trim()}`;
  const ana = await oku(tam);
  if (!ana.ok) return { durum: 'ulasilamadi', adres: tam, hata: ana.sebep, ...bos };
  const k = siteKimlikleri(ana.html);
  const okunamayan: string[] = [];
  const birlesik = { analytics: new Set(k.analytics), googleAds: new Set(k.googleAds), metaPiksel: new Set(k.metaPiksel) };
  for (const gtm of k.tagManager.slice(0, GTM_SINIRI)) {
    const r = await oku(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`);
    if (!r.ok) {
      okunamayan.push(gtm);
      continue;
    }
    const ic = siteKimlikleri(r.html);
    ic.analytics.forEach((x) => birlesik.analytics.add(x));
    ic.googleAds.forEach((x) => birlesik.googleAds.add(x));
    ic.metaPiksel.forEach((x) => birlesik.metaPiksel.add(x));
  }
  // Sınırın ötesindeki kapsayıcılar da "okunamadı": sessiz kesme yok.
  okunamayan.push(...k.tagManager.slice(GTM_SINIRI));
  return {
    durum: 'tarandi',
    adres: tam,
    hata: null,
    tagManager: k.tagManager,
    analytics: [...birlesik.analytics].sort(),
    googleAds: [...birlesik.googleAds].sort(),
    metaPiksel: [...birlesik.metaPiksel].sort(),
    altyapi: altyapiBul(ana.html),
    tagManagerOkunamayan: okunamayan,
  };
}

const mesaj = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Hesaplar {
  site: string | null;
  google: { id: string; ad: string; external_id: string; connection_id: string; manager_external_id: string | null } | null;
  meta: { id: string; ad: string; external_id: string } | null;
}

@Injectable()
export class OlcumService {
  private readonly onbellek = new Map<string, { zaman: number; yanit: OlcumDurumuYaniti }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly kasa: TokenVaultService,
    private readonly saglayicilar: ProviderRegistry,
    private readonly kota: QuotaGuardService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private get google(): GoogleProvider {
    return this.saglayicilar.get('google') as unknown as GoogleProvider;
  }
  private get meta(): MetaProvider {
    return this.saglayicilar.get('meta') as unknown as MetaProvider;
  }

  private erisim(ctx: TenantContext, clientId: string): void {
    if (!ctx.clientIds.includes(clientId)) throw new BadRequestException('Bu workspace’e erişimin yok.');
  }

  /**
   * Bu workspace'e ATANMIŞ hesaplar. Birden çok varsa İLKİ (ada göre) ve
   * bunu ekrandaki hesap adı söylüyor; havuz hesabı (client_id NULL) asla.
   */
  private async hesaplar(ctx: TenantContext, clientId: string): Promise<Hesaplar> {
    return this.prisma.withTenant(ctx, async (t) => {
      const [c] = await t.$queryRaw<Array<{ website: string | null }>>(Prisma.sql`SELECT website FROM clients WHERE id = ${clientId}::uuid`);
      const satirlar = await t.$queryRaw<Array<{ id: string; ad: string; platform: string; external_id: string; connection_id: string; manager_external_id: string | null }>>(Prisma.sql`
        SELECT id::text, name AS ad, platform::text AS platform, external_id, connection_id::text, manager_external_id
          FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND platform IN ('meta', 'google')
         ORDER BY name, id`);
      const g = satirlar.find((s) => s.platform === 'google') ?? null;
      const m = satirlar.find((s) => s.platform === 'meta') ?? null;
      return {
        site: c?.website ?? null,
        google: g ? { id: g.id, ad: g.ad, external_id: g.external_id, connection_id: g.connection_id, manager_external_id: g.manager_external_id } : null,
        meta: m ? { id: m.id, ad: m.ad, external_id: m.external_id } : null,
      };
    });
  }

  private async googleBaglami(h: NonNullable<Hesaplar['google']>): Promise<FetchContext> {
    const accessToken = await this.kasa.getAccessToken(h.connection_id, this.saglayicilar.get('google'));
    return { accessToken, accountExternalId: h.external_id.replace(/-/g, ''), loginCustomerId: h.manager_external_id ?? undefined };
  }

  /** Google kotası — istek GİTMEDEN; kapalı bekçi log'a yazılıyor (susmak kotayı kimin yediğini gizler). */
  private async kotaKapisi(adAccountId: string): Promise<void> {
    if (!this.kota.isEnabled) {
      logger.warn('Kota bekçisi kapalı (REDIS_URL yok); Ölçüm\'ün Google isteği kota kontrolsüz gidiyor.');
      return;
    }
    const g = await this.kota.acquire({ platform: 'google', adAccountId, layer: 'interactive' });
    if (!g.allowed) {
      const dk = Math.max(1, Math.ceil((g.retryAfterMs ?? 60_000) / 60_000));
      throw new Error(`Google Ads kotası şu an dolu; yaklaşık ${dk} dakika sonra yeniden dene.`);
    }
  }

  private async metaTokeni(ctx: TenantContext, adAccountId: string): Promise<string> {
    const [r] = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<Array<{ token: Buffer | Uint8Array; durum: string }>>(Prisma.sql`
        SELECT c.access_token_enc AS token, c.status::text AS durum
          FROM ad_accounts a JOIN platform_connections c ON c.id = a.connection_id
         WHERE a.id = ${adAccountId}::uuid`),
    );
    if (!r) throw new Error('Meta bağlantısı bulunamadı');
    if (r.durum !== 'active') throw new Error('Meta bağlantısı yeniden yetkilendirilmeli');
    return this.crypto.decrypt(Buffer.from(r.token));
  }

  async durum(ctx: TenantContext, clientId: string, yenile: boolean, simdi: Date = new Date()): Promise<OlcumDurumuYaniti> {
    this.erisim(ctx, clientId);
    const o = this.onbellek.get(clientId);
    if (!yenile && o && simdi.getTime() - o.zaman < ONBELLEK_MS) return o.yanit;

    const h = await this.hesaplar(ctx, clientId);
    const hatalar: OlcumOkumaHatasi[] = [];

    // ÜÇ OKUMA BAĞIMSIZ: biri düşerse diğerleri gösterilir, düşenin mesajı
    // ekranda kalır ("okunamadı" ile "yok" ayrı iş).
    const [site, google, meta] = await Promise.all([
      siteTara(h.site, async (adres) => {
        const r = await sayfaHtmlGetir(adres);
        return r.ok ? { ok: true as const, html: r.html } : { ok: false as const, sebep: r.sebep };
      }).catch((e: unknown): SiteTaramasi => ({ durum: 'ulasilamadi', adres: h.site, hata: mesaj(e), tagManager: [], analytics: [], googleAds: [], metaPiksel: [], altyapi: null, tagManagerOkunamayan: [] })),
      (async () => {
        if (!h.google) return { islemler: null, kimlik: null, hata: null };
        try {
          await this.kotaKapisi(h.google.id);
          const r = await this.google.donusumIslemleriOku(await this.googleBaglami(h.google));
          return { islemler: r.islemler as GoogleDonusumIslemi[], kimlik: r.donusumKimligi, hata: null };
        } catch (e) {
          return { islemler: null, kimlik: null, hata: mesaj(e) };
        }
      })(),
      (async () => {
        if (!h.meta) return { pikseller: null, toplam: 0, hata: null };
        try {
          const token = await this.metaTokeni(ctx, h.meta.id);
          const hesap = h.meta.external_id.startsWith('act_') ? h.meta.external_id : `act_${h.meta.external_id}`;
          const liste = await this.meta.fetchAdPixels({ adAccountPath: hesap, accessToken: token, simdi });
          const baslangic = Math.floor((simdi.getTime() - META_GUN * 86_400_000) / 1000);
          const pikseller: MetaPikselOlcumu[] = [];
          for (const p of liste.satirlar) {
            // Hiç çalışmamış ya da kullanılamaz pikselde istatistik sorulmaz:
            // cevap belli ve çağrı boşa gider.
            const olaylar = p.kullanilamaz || !p.sonCalisma ? {} : await this.meta.fetchPixelEventCounts({ pikselId: p.id, accessToken: token, baslangic });
            pikseller.push({ id: p.id, ad: p.ad, sonCalisma: p.sonCalisma, kullanilamaz: p.kullanilamaz, olaylar });
          }
          return { pikseller, toplam: liste.satirlar.length, hata: liste.kesildi ? 'Piksel listesi sayfa sınırında kesildi' : null };
        } catch (e) {
          return { pikseller: null, toplam: 0, hata: mesaj(e) };
        }
      })(),
    ]);

    if (site.durum === 'ulasilamadi' && site.hata) hatalar.push({ kaynak: 'site', mesaj: site.hata });
    if (google.hata) hatalar.push({ kaynak: 'google', mesaj: google.hata });
    if (meta.hata) hatalar.push({ kaynak: 'meta', mesaj: meta.hata });

    const girdi: OlcumGirdisi = {
      googleHesapVar: !!h.google,
      metaHesapVar: !!h.meta,
      googleIslemleri: google.islemler,
      googleHata: google.hata,
      metaPikselleri: meta.pikseller,
      metaHata: meta.hata,
      site,
    };
    const satirlar = olcumSatirlari(girdi);
    const yanit: OlcumDurumuYaniti = {
      clientId,
      site,
      googleHesabi: h.google ? { id: h.google.id, ad: h.google.ad, musteriNo: h.google.external_id, donusumKimligi: google.kimlik } : null,
      metaHesabi: h.meta ? { id: h.meta.id, ad: h.meta.ad } : null,
      satirlar,
      analyticsBagli: analyticsBagliMi(google.islemler),
      googleIslemleri: google.islemler ? { satirlar: google.islemler, toplam: google.islemler.length } : null,
      metaPikselleri: meta.pikseller ? { satirlar: meta.pikseller, toplam: meta.toplam } : null,
      oneri: enUygunOneri(girdi, satirlar),
      okumaHatalari: hatalar,
      zaman: simdi.toISOString(),
    };
    this.onbellek.set(clientId, { zaman: simdi.getTime(), yanit });
    return yanit;
  }

  /**
   * "Birincil yap" — yalnız bu workspace'e atanmış Google hesabında, yalnız
   * ETKİN ve SAYIM ALAN işlemde (önerinin koşuluyla aynı; istemcinin
   * gönderdiği kimliğe güvenilmiyor, platformdan yeniden okunuyor).
   * Yazmadan sonra GERİ OKUNUR: 200 döndü doğrulama değil.
   */
  async birincilYap(ctx: TenantContext, clientId: string, donusumId: string): Promise<OlcumDurumuYaniti> {
    this.erisim(ctx, clientId);
    const h = await this.hesaplar(ctx, clientId);
    if (!h.google) throw new BadRequestException("Bu workspace'e Google Ads hesabı atanmamış.");
    await this.kotaKapisi(h.google.id).catch((e: unknown) => {
      throw new ConflictException(mesaj(e));
    });
    const fctx = await this.googleBaglami(h.google);
    const { islemler } = await this.google.donusumIslemleriOku(fctx);
    const i = islemler.find((x) => x.id === donusumId);
    if (!i) throw new BadRequestException('Bu dönüşüm işlemi Google Ads hesabında bulunamadı.');
    if (i.durum !== 'ENABLED') throw new ConflictException('Yalnız etkin bir dönüşüm işlemi birincil yapılabilir.');
    if (i.sayim30Gun <= 0) throw new ConflictException('Son 30 günde sayım almayan işlem birincil yapılmıyor; önce kurulumun çalıştığı görülmeli.');
    if (!i.birincil) {
      await this.google.donusumBirincilYap(fctx, donusumId);
      const dogru = await this.google.donusumBirincilMi(fctx, donusumId);
      if (dogru !== true) throw new ConflictException('Google değişikliği kabul etti ama geri okumada işlem hâlâ birincil görünmüyor; Google Ads\'te kontrol et.');
      await this.prisma.withTenant(ctx, (t) =>
        this.audit.record(t as never, ctx, {
          clientId,
          action: 'olcum.birincil_yap',
          targetType: 'google_conversion_action',
          targetId: donusumId,
          before: { birincil: false },
          after: { birincil: true, ad: i.ad, hesap: h.google!.external_id },
        }),
      );
    }
    this.onbellek.delete(clientId);
    return this.durum(ctx, clientId, true);
  }
}
