import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HESAP_ACAN_KODLAR,
  KURULUM_ADIM_ADI,
  KURULUM_HATA_KODLARI,
  KURULUM_LISTESI,
  KURULUM_PLATFORMLARI,
  OTOMATIK_SIRA,
  PANEL_YERLERI,
  gtmKodu,
  kurulumOzeti,
  siteYokKurulumKodlari,
  type DonusumTetigi,
  type HesapSahibi,
  type KurulumAdimKodu,
  type KurulumAdimSonucu,
  type KurulumIstegi,
  type KurulumPlatformu,
  type KurulumSecenekleri,
  type KurulumYaniti,
  type Platform,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { ConnectionsService } from '../connections/connections.service';
import { TokenVaultService } from '../connections/token-vault.service';
import { GtmEnvanterKuyrugu, envanterNotu, envanterOzeti } from './gtm-envanter';
import { baglantiSec } from '../connections/baglanti-sec';
import { ProviderRegistry } from '../connections/provider.registry';
import { GOOGLE_OLCUM_SCOPES } from '../connections/providers/google.provider';
import type { MetaProvider } from '../connections/providers/meta.provider';
import { OlcumService } from '../olcum/olcum.service';
import { AuditService } from '../audit/audit.service';
import { VeriKaynagiService } from '../veri-kaynagi/veri-kaynagi.service';
import { AdsKurulumIstemcisi, DONUSUM_ADI, DONUSUM_KATEGORISI, type DonusumTuru } from './ads-kurulum';
import { Ga4Istemcisi } from '../connections/providers/ga4';
import { GtmIstemcisi, ON_EK, SURUM_ADI, TUM_SAYFALAR_TETIGI, gtmPlani, konteynerdeYuklu } from './gtm';
import { MetaKurulumIstemcisi } from './meta-kurulum';
import { siteYokBeyaniVarMi, type SorguCalistirici } from './kurulum-beyan';
import {
  etiketImzasi,
  gerekenDonusumler,
  kurulumAdimlari,
  type AdimNotu,
  type AdsDonusumKaydi,
  type GtmYayin,
  type KurulumAnlik,
  type KurulumSatiri,
} from './kurulum-durum';

const logger = new Logger('KurulumService');

/** Sonucunu adım notuna yazan adımlar: başarıda not TEMİZLENMEZ. */
const NOTU_SONUC_OLAN: ReadonlySet<KurulumAdimKodu> = new Set(['meta_odeme', 'google_odeme']);

const mesaj = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * KULLANICININ KARARI GEREKİYOR — hata değil. "Eksikleri tamamla" bu
 * adımı ATLAR ve sonuç listesinde nedenini söyler; gerçek bir platform
 * hatası ise adımın notuna `hata` olarak yazılır. İkisini ayırmak, "birden
 * çok Tag Manager hesabı var, seç" ile "Google reddetti"yi aynı kırmızıya
 * boyamamak için.
 */
export class KullaniciGerekli extends Error {}

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

interface Baglanti {
  id: string;
  platform: 'meta' | 'google';
  clientId: string | null;
  orgId: string;
  scopes: string[];
}

interface Hesap {
  id: string;
  ad: string;
  externalId: string;
  connectionId: string;
  managerExternalId: string | null;
  accountStatus: number | null;
}

interface Baglam {
  ad: string;
  site: string | null;
  /** Workspace'in şirketi ve (varsa) ajans şirketi: ajans havuzunu şirket havuzundan ayırmak için. */
  orgId: string;
  ajansOrgId: string | null;
  /** Atanmış Facebook sayfasının platform kimliği (Meta hesap açarken son reklamveren). */
  sayfaKimligi: string | null;
  meta: Hesap | null;
  google: Hesap | null;
  baglantilar: Baglanti[];
  satir: KurulumSatiri | null;
  sahip: HesapSahibi | null;
  pikselId: string | null;
  /** Kullanıcının "bu platformu kullanmıyorum" beyanı (`kullanilmayan_platformlar`). */
  kullanilmayanlar: KurulumPlatformu[];
  /** O beyanın izi (kim, ne zaman); beyan yoksa `null`. */
  platformBeyani: KurulumYaniti['platformBeyani'];
}

/**
 * ═══ WORKSPACE KURULUM REHBERİ (docs/kurulum/MIMARI.md) ═══
 *
 * Her adım bağımsız ve tekrar koşulabilir: açılan varlığın kimliği
 * `workspace_kurulum`a yazılır, ikinci koşuda bulunur ve yeniden açılmaz.
 * Platform çağrıları transaction DIŞINDA (withTenant 5 sn sınırı; CLAUDE.md).
 */
@Injectable()
export class KurulumService {
  /**
   * WORKSPACE BAŞINA TEK İŞLEM (Ajan 4, B3). İki sekme ya da zaman aşımından
   * sonra tekrar basılan düğme aynı anda koşarsa ikinci hesap/konteyner/mülk
   * açılırdı. API tek süreç (ecosystem.config.js, fork, 1) olduğu için bellek
   * yeterli; süreç ölürse kilit de gider.
   */
  private readonly calisan = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly baglantilar: ConnectionsService,
    private readonly kasa: TokenVaultService,
    private readonly saglayicilar: ProviderRegistry,
    private readonly olcum: OlcumService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly veriKaynagi: VeriKaynagiService,
    private readonly gtmEnvanteri: GtmEnvanterKuyrugu,
  ) {}

  /**
   * ERİŞİM. Yazma yalnız o workspace seçiliyken (Ölçüm ile aynı gerekçe):
   * aktif seçim yokken yetki en geniş rolden hesaplanıyor ve B'de yalnız
   * izleyici olan biri B'ye hesap açtırabilirdi.
   */
  private erisim(ctx: TenantContext, clientId: string, yazma = false): void {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok.');
    if (yazma && ctx.activeClientId !== clientId) {
      throw new ConflictException({ code: KURULUM_HATA_KODLARI.workspaceSecilmeli, message: 'Değişiklik için önce üstten bu workspace’i seç.' });
    }
    if (yazma && !ctx.permissions.includes('client.write')) throw new ForbiddenException('Kurulum için workspace’i düzenleme yetkisi gerekiyor.');
  }

  // ───────────────────────────────────────────────────────────────────────
  // Okuma
  // ───────────────────────────────────────────────────────────────────────

  private async baglam(ctx: TenantContext, clientId: string): Promise<Baglam & { anlik: KurulumAnlik }> {
    const r = await this.prisma.withTenant(ctx, async (t) => {
      const [c] = await t.$queryRaw<Array<{ name: string; website: string | null; org_id: string; ajans: string | null }>>(
        Prisma.sql`SELECT name, website, org_id::text, app.ajans_org_id()::text AS ajans FROM clients WHERE id = ${clientId}::uuid`,
      );
      const hesaplar = await t.$queryRaw<
        Array<{ id: string; ad: string; platform: string; external_id: string; connection_id: string; manager_external_id: string | null; account_status: string | null }>
      >(Prisma.sql`
        SELECT id::text, name AS ad, platform::text AS platform, external_id, connection_id::text, manager_external_id,
               raw->>'account_status' AS account_status
          FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND platform IN ('meta', 'google')
         ORDER BY name, id`);
      const profiller = await t.$queryRaw<Array<{ ad: string; tur: string; external_id: string; ust: string | null; havuz: boolean }>>(Prisma.sql`
        SELECT name AS ad, profile_type::text AS tur, external_id, parent_page_external_id AS ust, client_id IS NULL AS havuz
          FROM social_profiles
         WHERE (client_id = ${clientId}::uuid OR client_id IS NULL) AND profile_type IN ('facebook_page', 'instagram_business')
         ORDER BY name`);
      const baglantilar = await t.$queryRaw<Array<{ id: string; platform: string; client_id: string | null; org_id: string; granted_scopes: string[] }>>(Prisma.sql`
        SELECT id::text, platform::text AS platform, client_id::text, org_id::text, granted_scopes
          FROM platform_connections
         WHERE revoked_at IS NULL AND status = 'active' AND platform IN ('meta', 'google')
           AND (client_id = ${clientId}::uuid OR client_id IS NULL)
         ORDER BY created_at`);
      /*
       * LEFT JOIN users — beyan edenin ADI için. INNER JOIN kurulum satırının
       * KENDİSİNİ süzerdi (users politikası dar; CLAUDE.md "RLS'li bir tabloya
       * yapılan INNER JOIN ana satırı sessizce süzüyor") ve bütün kurulum
       * "hiç başlanmamış" görünürdü.
       */
      const [k] = await t.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT k.*, u.full_name AS platform_beyan_eden_adi
          FROM workspace_kurulum k LEFT JOIN users u ON u.id = k.platform_beyan_eden
         WHERE k.client_id = ${clientId}::uuid`);
      const [hz] = await t.$queryRaw<Array<{ durum: string; soru: number; piksel_id: string | null }>>(Prisma.sql`
        SELECT durum, jsonb_array_length(sorular)::int AS soru, piksel_id FROM workspace_hazirlama WHERE client_id = ${clientId}::uuid`);
      return { c, hesaplar, profiller, baglantilar, k, hz };
    });
    if (!r.c) throw new ForbiddenException('Workspace bulunamadı.');
    const hesap = (p: string): Hesap | null => {
      const h = r.hesaplar.find((x) => x.platform === p);
      if (!h) return null;
      const n = h.account_status === null ? null : Number(h.account_status);
      return { id: h.id, ad: h.ad, externalId: h.external_id, connectionId: h.connection_id, managerExternalId: h.manager_external_id, accountStatus: Number.isFinite(n) ? n : null };
    };
    const satir = r.k ? satirOku(r.k) : null;
    const baglantilar: Baglanti[] = r.baglantilar.map((b) => ({ id: b.id, platform: b.platform as 'meta' | 'google', clientId: b.client_id, orgId: b.org_id, scopes: b.granted_scopes }));
    const meta = hesap('meta');
    const google = hesap('google');
    const sayfa = r.profiller.find((p) => !p.havuz && p.tur === 'facebook_page') ?? null;
    const ig = sayfa ? (r.profiller.find((p) => !p.havuz && p.tur === 'instagram_business' && p.ust === sayfa.external_id) ?? r.profiller.find((p) => !p.havuz && p.tur === 'instagram_business')) : null;
    const b = {
      ad: r.c.name,
      site: r.c.website,
      orgId: r.c.org_id,
      ajansOrgId: r.c.ajans,
      sayfaKimligi: sayfa?.external_id ?? null,
      meta,
      google,
      baglantilar,
      satir,
      sahip: satir?.hesapSahibi ?? null,
      pikselId: r.hz?.piksel_id ?? null,
      kullanilmayanlar: r.k ? kullanilmayanOku(r.k) : [],
      platformBeyani: r.k ? platformBeyaniOku(r.k) : null,
    };
    const gb = this.baglantiSec(b, 'google');
    const mb = this.baglantiSec(b, 'meta');
    return {
      ...b,
      anlik: {
        meta: meta ? { externalId: meta.externalId, ad: meta.ad, accountStatus: meta.accountStatus } : null,
        google: google ? { externalId: google.externalId, ad: google.ad } : null,
        sayfa: sayfa ? { ad: sayfa.ad, instagram: ig?.ad ?? null } : null,
        havuzSayfaSayisi: r.profiller.filter((p) => p.havuz && p.tur === 'facebook_page').length,
        googleBaglanti: gb ? { id: gb.id, olcumIzni: GOOGLE_OLCUM_SCOPES.every((s) => gb.scopes.includes(s)) } : null,
        metaBaglanti: mb ? { id: mb.id } : null,
        site: r.c.website,
        pikselId: b.pikselId,
        satir,
        hazirlama: r.hz ? { durum: r.hz.durum, soruSayisi: r.hz.soru } : null,
      },
    };
  }

  /**
   * HANGİ BAĞLANTININ TOKEN'I. Atanmış hesap varsa ONUN bağlantısı (hesaba
   * erişebildiği kesin); yoksa hesap sahibi kararına göre: şirket → workspace'in
   * kendi bağlantısı, ajans → havuz. Diğerine düşmek kararı sessizce bozardı,
   * o yüzden yalnız karar verilmemişse ikisinden biri.
   */
  private baglantiSec(b: Pick<Baglam, 'meta' | 'google' | 'baglantilar' | 'sahip' | 'orgId' | 'ajansOrgId'>, platform: 'meta' | 'google'): Baglanti | null {
    // Kural ortak yerde (connections/baglanti-sec.ts): veri kaynakları da
    // AYNI fonksiyonu çağırıyor, ikinci bir seçici yazılmadı (MIMARI Ç-3).
    return baglantiSec(b, platform);
  }

  async oku(ctx: TenantContext, clientId: string): Promise<KurulumYaniti> {
    this.erisim(ctx, clientId);
    const b = await this.baglam(ctx, clientId);
    const adimlar = kurulumAdimlari(b.anlik).map((a) =>
      // İzin akışı bağlantı yönetim yetkisi istiyor (reauthorize ucu); yetkisi
      // olmayana düğme göstermek tıklayınca 403 demek.
      a.eylem?.tur === 'izin' && !(ctx.permissions.includes('connection.write') && ctx.permissions.includes('connection.manage'))
        ? { ...a, eylem: null, neden: `${a.neden} İzni bağlantıları yönetme yetkisi olan kişi verebilir.` }
        : a,
    );
    const kimlik = b.satir?.gtmKimligi;
    return {
      clientId,
      workspaceAdi: b.ad,
      site: b.site,
      hesapSahibi: b.sahip,
      // Kullanıcının beyanı (MIMARI Ç-6). Boş liste "beyan yok": iki platform
      // da sayılıyor. Adımlar SÜZÜLMÜYOR: panelin birleştiricisi
      // (`kurulumListesi`) kullanılmayan platformun adımını "Kullanılmıyor"
      // diye gösteriyor; burada atmak o satırı "sunucu döndürmedi" yapardı.
      kullanilmayanPlatformlar: b.kullanilmayanlar,
      platformBeyani: b.platformBeyani,
      adimlar,
      ozet: kurulumOzeti(adimlar),
      siteKodu: kimlik ? { gtmKimligi: kimlik, ...gtmKodu(kimlik) } : null,
      donusumTetigi: b.satir?.donusumTetigi ?? null,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Tokenlar
  // ───────────────────────────────────────────────────────────────────────

  private async token(b: Baglam, platform: 'meta' | 'google'): Promise<string> {
    const c = this.baglantiSec(b, platform);
    if (!c) throw new KullaniciGerekli(`${platform === 'meta' ? 'Meta' : 'Google'} bağlantısı yok; önce ${PANEL_YERLERI.platformBaglantilari}’ndan bağla.`);
    return this.kasa.getAccessToken(c.id, this.saglayicilar.get(platform as Platform));
  }

  private async googleOlcumTokeni(b: Baglam): Promise<string> {
    const c = this.baglantiSec(b, 'google');
    if (!c) throw new KullaniciGerekli(`Google bağlantısı yok; önce ${PANEL_YERLERI.platformBaglantilari}’ndan bağla.`);
    if (!GOOGLE_OLCUM_SCOPES.every((s) => c.scopes.includes(s))) throw new KullaniciGerekli('Önce "Ölçüm izinlerini ver" (Tag Manager ve Analytics izni).');
    return this.kasa.getAccessToken(c.id, this.saglayicilar.get('google'));
  }

  private ads(token: string): AdsKurulumIstemcisi {
    const g = this.config.platforms.google;
    if (!g.developerToken) throw new Error('Google Ads geliştirici token’ı yapılandırılmamış.');
    return new AdsKurulumIstemcisi(token, g.developerToken, g.apiVersion);
  }

  private metaIstemci(token: string): MetaKurulumIstemcisi {
    return new MetaKurulumIstemcisi(token, this.config.platforms.meta.apiVersion);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Kayıt
  // ───────────────────────────────────────────────────────────────────────

  private async yaz(ctx: TenantContext, clientId: string, alanlar: Record<string, unknown>): Promise<void> {
    const kolonlar = Object.keys(alanlar);
    if (kolonlar.some((k) => !/^[a-z0-9_]+$/.test(k))) throw new Error('Geçersiz kolon adı');
    const degerler = kolonlar.map((k) => {
      const v = alanlar[k];
      // NULL LİTERAL: tipsiz bir NULL parametresi INSERT … SELECT'te metin
      // sayılır ve jsonb kolona "expression is of type text" ile düşer.
      // PGlite parametre tipini kendisi çıkardığı için testte görünmezdi.
      if (v === null || v === undefined) return Prisma.sql`NULL`;
      return typeof v === 'object' ? Prisma.sql`${JSON.stringify(v)}::jsonb` : Prisma.sql`${v}`;
    });
    const isimler = Prisma.raw(kolonlar.map((k) => `"${k}"`).join(', '));
    const guncelle = Prisma.raw(kolonlar.map((k) => `"${k}" = EXCLUDED."${k}"`).join(', '));
    const yazilan = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<unknown[]>(Prisma.sql`
        INSERT INTO workspace_kurulum (client_id, org_id, ${isimler}, updated_at)
        SELECT ${clientId}::uuid, c.org_id, ${Prisma.join(degerler)}, now() FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (client_id) DO UPDATE SET ${guncelle}, updated_at = now()
        RETURNING client_id`),
    ).catch((e: unknown) => {
      if (kolonlar.includes('gtm_konteyner_yolu') && /23505|unique|workspace_kurulum_gtm_konteyner_uniq/i.test(mesaj(e))) {
        throw new KullaniciGerekli('Bu Tag Manager konteyneri başka bir workspace’te kullanılıyor. Her proje kendi konteynerini kullanmalı: yeni konteyner aç.');
      }
      throw e;
    });
    // Politikası izin vermeyen yazma SIFIR satır etkiler ve hata vermez.
    if (yazilan.length !== 1) throw new ForbiddenException('Kurulum kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
  }

  private async not(ctx: TenantContext, clientId: string, kod: KurulumAdimKodu, n: Omit<AdimNotu, 'zaman'> | null): Promise<void> {
    const yazilan = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<unknown[]>(Prisma.sql`
        INSERT INTO workspace_kurulum (client_id, org_id, adim_notlari, updated_at)
        SELECT ${clientId}::uuid, c.org_id, ${JSON.stringify(n ? { [kod]: { ...n, zaman: new Date().toISOString() } } : {})}::jsonb, now()
          FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (client_id) DO UPDATE SET
          adim_notlari = CASE WHEN ${n === null} THEN workspace_kurulum.adim_notlari - ${kod}::text
                              ELSE workspace_kurulum.adim_notlari || EXCLUDED.adim_notlari END,
          updated_at = now()
        RETURNING client_id`),
    );
    if (yazilan.length !== 1) throw new ForbiddenException('Kurulum kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
  }

  private async pikselYaz(ctx: TenantContext, clientId: string, pikselId: string): Promise<void> {
    // TEK KAYNAK hazırlık satırı: rehber ön doldurması ve hazırlık oradan okuyor.
    const yazilan = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<unknown[]>(Prisma.sql`
        INSERT INTO workspace_hazirlama (client_id, org_id, piksel_id, updated_at)
        SELECT ${clientId}::uuid, c.org_id, ${pikselId}, now() FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (client_id) DO UPDATE SET piksel_id = EXCLUDED.piksel_id, updated_at = now()
        RETURNING client_id`),
    );
    if (yazilan.length !== 1) throw new ForbiddenException('Piksel kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
  }

  private async denetim(ctx: TenantContext, clientId: string, eylem: string, after: Record<string, unknown>, meta: Meta): Promise<void> {
    await this.prisma.withTenant(ctx, (t) =>
      this.audit.record(t as never, ctx, { action: `kurulum.${eylem}`, targetType: 'client', targetId: clientId, clientId, after: after as Prisma.InputJsonValue, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null }),
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  // Seçenekler (platforma gider)
  // ───────────────────────────────────────────────────────────────────────

  async secenekler(ctx: TenantContext, clientId: string, kod: KurulumSecenekleri['kod']): Promise<KurulumSecenekleri> {
    // Seçenekler ajans token'larıyla görülen her şeyi listeliyor (başka
    // müşterilerin hesap, sayfa, konteyner adları) ve kota harcıyor: yalnız
    // kurabilen görür (Ajan 4, Ö7).
    this.erisim(ctx, clientId, true);
    if ((kod === 'meta_hesap' || kod === 'google_hesap' || kod === 'sayfa') && !hesapYetkisi(ctx)) {
      throw new ForbiddenException('Hesap ve sayfa listesi için bağlantı yönetme yetkisi gerekiyor.');
    }
    const b = await this.baglam(ctx, clientId);
    try {
      if (kod === 'meta_hesap') {
        const havuz = await this.havuzHesaplari(ctx, 'meta');
        const ustler = this.baglantiSec(b, 'meta') ? (await this.metaIstemci(await this.token(b, 'meta')).isletmeler()).map((x) => ({ deger: x.id, etiket: x.ad })) : [];
        return { kod, mevcut: havuz, ustler, not: ustler.length ? null : 'Business Manager listesi okunamadı ya da bağlantı yok; yeni hesap açılamıyor.' };
      }
      if (kod === 'google_hesap') {
        const havuz = await this.havuzHesaplari(ctx, 'google');
        const mccler = await this.prisma.withTenant(ctx, (t) =>
          t.$queryRaw<Array<{ no: string; ad: string | null }>>(Prisma.sql`
            SELECT DISTINCT a.manager_external_id AS no, m.name AS ad
              FROM ad_accounts a LEFT JOIN ad_accounts m ON m.platform = 'google' AND m.external_id = a.manager_external_id
             WHERE a.platform = 'google' AND a.manager_external_id IS NOT NULL`),
        );
        const ustler = mccler.map((m) => ({ deger: m.no.replace(/-/g, ''), etiket: m.ad ? `${m.ad} (${m.no})` : `Yönetici hesap ${m.no}` }));
        return { kod, mevcut: havuz, ustler, not: ustler.length ? null : 'Erişilebilen yönetici hesap (MCC) yok; yeni hesap açılamıyor, mevcut hesap seç ya da davet gönder.' };
      }
      if (kod === 'sayfa') {
        const sayfalar = await this.prisma.withTenant(ctx, (t) =>
          t.$queryRaw<Array<{ id: string; ad: string }>>(Prisma.sql`
            SELECT id::text, name AS ad FROM social_profiles WHERE client_id IS NULL AND profile_type = 'facebook_page' ORDER BY name LIMIT 500`),
        );
        return { kod, mevcut: sayfalar.map((s) => ({ deger: s.id, etiket: s.ad })), ustler: [], not: sayfalar.length >= 500 ? 'İlk 500 sayfa gösteriliyor.' : null };
      }
      if (kod === 'meta_piksel') {
        if (!b.meta) return { kod, mevcut: [], ustler: [], not: 'Önce Meta reklam hesabı.' };
        const p = await (this.saglayicilar.get('meta') as unknown as MetaProvider).fetchAdPixels({ adAccountPath: b.meta.externalId, accessToken: await this.token(b, 'meta') });
        return {
          kod,
          mevcut: p.satirlar.filter((x) => !x.kullanilamaz).map((x) => ({ deger: x.id, etiket: x.ad, not: x.sonCalisma ? `son çalışma ${x.sonCalisma.slice(0, 10)}` : 'hiç çalışmamış' })),
          ustler: [{ deger: 'yeni', etiket: 'Yeni piksel aç' }],
          not: p.kesildi ? 'Liste kesildi; ilk sayfa gösteriliyor.' : null,
        };
      }
      if (kod === 'gtm_konteyner') {
        /*
         * BÜTÜN HESAPLAR, ENVANTERDEN (`gtm-envanter.ts`). Konteynerler hesap
         * başına listeleniyor ve Tag Manager kotası saniyede 0,25 istek; istek
         * anında yalnız ilk 30 hesap okunuyordu ve 155 hesaplı ajansta
         * konteynerlerin çoğu listede hiç görünmüyordu. Burada tek çağrı
         * (hesap listesi); konteynerler arka planda taranıp saklanıyor ve not
         * kaçının tarandığını söylüyor.
         */
        const baglanti = this.baglantiSec(b, 'google');
        const gtm = new GtmIstemcisi(await this.googleOlcumTokeni(b));
        const hesaplar = await gtm.hesaplar();
        const ustler = hesaplar.map((h) => ({ deger: h.accountId, etiket: h.name }));
        const satirlar = baglanti ? await this.gtmEnvanteri.oku(baglanti.id) : null;
        if (!baglanti || satirlar === null) {
          return { kod, mevcut: [], ustler, not: 'Konteyner listesi şu an okunamıyor (önbellek kapalı). Sitedeki konteyner otomatik bulunur; ya da yeni konteyner aç.' };
        }
        const simdi = new Date();
        const ozet = envanterOzeti(hesaplar, satirlar, simdi);
        await this.gtmEnvanteri.ekle(baglanti.id, ozet.kuyruga, simdi);
        return {
          kod,
          mevcut: ozet.konteynerler.map((c) => ({ deger: c.path, etiket: `${c.name} · ${c.publicId}`, not: c.hesapAdi })),
          ustler,
          not: envanterNotu({ toplam: hesaplar.length, taranan: ozet.taranan, hatali: ozet.hatali }),
        };
      }
      // ga4_mulk
      const ga = new Ga4Istemcisi(await this.googleOlcumTokeni(b));
      const hesaplar = await ga.hesaplar();
      return {
        kod,
        mevcut: hesaplar.flatMap((h) => h.mulkler.map((m) => ({ deger: m.mulkId, etiket: m.ad, not: h.ad }))),
        ustler: hesaplar.map((h) => ({ deger: h.hesapId, etiket: h.ad })),
        not: hesaplar.length === 0 ? 'Erişilebilen Analytics hesabı yok: analytics.google.com’da bir hesap aç (şartlar tarayıcıda kabul ediliyor), sonra yenile.' : null,
      };
    } catch (e) {
      if (e instanceof KullaniciGerekli) return { kod, mevcut: [], ustler: [], not: e.message };
      throw e;
    }
  }

  private async havuzHesaplari(ctx: TenantContext, platform: 'meta' | 'google') {
    const r = await this.prisma.withTenant({ ...ctx, activeClientId: null }, (t) =>
      t.$queryRaw<Array<{ id: string; ad: string; external_id: string }>>(Prisma.sql`
        SELECT id::text, name AS ad, external_id FROM ad_accounts
         WHERE client_id IS NULL AND platform = ${platform}::"Platform"
           AND (manager_external_id IS NULL OR manager_external_id <> external_id)
         ORDER BY name LIMIT 500`),
    );
    return r.map((h) => ({ deger: h.id, etiket: `${h.ad} · ${h.external_id}` }));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Adımlar
  // ───────────────────────────────────────────────────────────────────────

  async adim(ctx: TenantContext, clientId: string, istek: KurulumIstegi, meta: Meta): Promise<KurulumYaniti & { sonuc: KurulumAdimSonucu | null }> {
    this.erisim(ctx, clientId, true);
    let sonuc: KurulumAdimSonucu | null = null;
    if (istek.kod === 'hesap_sahibi') {
      await this.yaz(ctx, clientId, { hesap_sahibi: istek.deger });
    } else {
      sonuc = await this.kilitli(clientId, () => this.yurut(ctx, clientId, istek, meta));
      // Kullanıcının istediği tek adım düştüyse cevap HATA: ekran mesajı
      // gösterir. "Eksikleri tamamla"da ise liste döner, işlem sürer.
      if (sonuc.durum === 'hata') throw new BadRequestException(`${KURULUM_ADIM_ADI[sonuc.kod]}: ${sonuc.mesaj}`);
      if (sonuc.durum === 'atlandi') throw new BadRequestException(sonuc.mesaj);
    }
    return { ...(await this.oku(ctx, clientId)), sonuc };
  }

  /**
   * "BU PLATFORMU KULLANMIYORUM" BEYANI (MIMARI Ç-6). Sayaç ve "Eksikleri
   * tamamla" o platformun adımlarını saymıyor. Hiçbir platform verisi
   * silinmiyor, hesap ataması değişmiyor: beyan yalnız kurulumun neyi
   * İSTEDİĞİNİ değiştiriyor ve geri alınabilir (boş liste gönderilir).
   *
   * Yazma ve okuma AYNI satır: beyan ayrı bir tabloda dursaydı kurulum
   * yanıtı onu ikinci bir sorguyla birleştirmek zorunda kalırdı.
   */
  async platformlar(ctx: TenantContext, clientId: string, kullanilmayanlar: KurulumPlatformu[], meta: Meta): Promise<KurulumYaniti> {
    this.erisim(ctx, clientId, true);
    // Sabit sıra: aynı beyan iki farklı dizi olarak saklanmasın (denetim kaydı karşılaştırılabilir kalsın).
    const liste = KURULUM_PLATFORMLARI.filter((p) => kullanilmayanlar.includes(p));
    /*
     * BEYANIN İZİ (kim, ne zaman) beyanla AYNI deyimde: son kontrol ekranı
     * "kim, ne zaman" yazıyor ve iz ayrı yazılsaydı beyan izsiz kalabilirdi.
     * Beyan kalkınca iz de NULL — eski bir kişinin adı boş bir beyanın
     * üstünde asılı kalmasın.
     */
    const izEden = liste.length > 0 ? ctx.userId : null;
    const izTarih = liste.length > 0 ? new Date().toISOString() : null;
    const yazilan = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<unknown[]>(Prisma.sql`
        INSERT INTO workspace_kurulum (client_id, org_id, kullanilmayan_platformlar, platform_beyan_eden, platform_beyan_tarihi, updated_at)
        SELECT ${clientId}::uuid, c.org_id, ${liste}::text[], ${izEden}::uuid, ${izTarih}::timestamptz, now() FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (client_id) DO UPDATE SET kullanilmayan_platformlar = EXCLUDED.kullanilmayan_platformlar,
          platform_beyan_eden = EXCLUDED.platform_beyan_eden, platform_beyan_tarihi = EXCLUDED.platform_beyan_tarihi, updated_at = now()
        RETURNING client_id`),
    );
    // Politikası izin vermeyen yazma SIFIR satır etkiler ve hata vermez.
    if (yazilan.length !== 1) throw new ForbiddenException('Beyan kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
    await this.denetim(ctx, clientId, 'platform_beyani', { kullanilmayanlar: liste }, meta);
    return this.oku(ctx, clientId);
  }

  private async kilitli<T>(clientId: string, fn: () => Promise<T>): Promise<T> {
    // KOD SÖZLEŞMEDE (`KURULUM_HATA_KODLARI`): panel bunu yoklamaya çeviriyor,
    // öbür 409'u (workspace seç) mesaj olarak gösteriyor. Ayıran metin değil kod.
    if (this.calisan.has(clientId)) {
      throw new ConflictException({ code: KURULUM_HATA_KODLARI.suruyor, message: 'Bu workspace’te bir kurulum işlemi zaten sürüyor; bitince sayfa güncellenir.' });
    }
    this.calisan.add(clientId);
    try {
      return await fn();
    } finally {
      this.calisan.delete(clientId);
    }
  }

  /** Bir adımı yürütür; hatayı notuna yazar ve sonucu döndürür (fırlatmaz). */
  private async yurut(ctx: TenantContext, clientId: string, istek: Exclude<KurulumIstegi, { kod: 'hesap_sahibi' }>, meta: Meta): Promise<KurulumAdimSonucu> {
    const kod = istek.kod as KurulumAdimKodu;
    try {
      const m = await this.calistir(ctx, clientId, istek, meta);
      // ÖDEME KONTROLLERİ SONUCU NOTA YAZIYOR (durum oradan okunuyor); başarıda
      // notu temizlemek az önce yazılan "tamam"ı silerdi (Ajan 4, B1).
      if (!NOTU_SONUC_OLAN.has(kod)) await this.not(ctx, clientId, kod, null);
      return { kod, durum: 'yapildi', mesaj: m };
    } catch (e) {
      if (e instanceof KullaniciGerekli) return { kod, durum: 'atlandi', mesaj: e.message };
      if (e instanceof ForbiddenException || e instanceof ConflictException) throw e;
      logger.warn(`Kurulum adımı düştü (${clientId}, ${kod}): ${mesaj(e)}`);
      await this.not(ctx, clientId, kod, { durum: 'hata', mesaj: mesaj(e).slice(0, 800) }).catch((e2) => logger.error(`Not yazılamadı: ${mesaj(e2)}`));
      return { kod, durum: 'hata', mesaj: mesaj(e) };
    }
  }

  private async calistir(ctx: TenantContext, clientId: string, istek: Exclude<KurulumIstegi, { kod: 'hesap_sahibi' }>, meta: Meta): Promise<string> {
    // Hesap açmak ve atamak BAĞLANTI yetkisi istiyor: havuzdan hesap almak
    // ajansın portföyüne dokunmak demek (Bağlantılar ekranıyla aynı kapı).
    if ((istek.kod === 'meta_hesap' || istek.kod === 'google_hesap' || istek.kod === 'sayfa') && !hesapYetkisi(ctx)) {
      throw new ForbiddenException('Hesap açmak ve atamak için bağlantı yönetme yetkisi gerekiyor.');
    }
    const b = await this.baglam(ctx, clientId);
    switch (istek.kod) {
      case 'meta_hesap':
        // Sayfa hesaptan ÖNCE atanmış olabilir: hesap gelince boş boost bağı kurulur.
        return this.boostIle(ctx, clientId, await this.metaHesap(ctx, clientId, b, istek.secim, meta), meta);
      case 'google_hesap':
        return this.googleHesap(ctx, clientId, b, istek.secim, meta);
      case 'sayfa':
        return this.sayfa(ctx, clientId, istek.sayfaId, meta);
      case 'meta_odeme': {
        if (!b.meta) throw new KullaniciGerekli('Önce Meta reklam hesabı.');
        const d = await this.metaIstemci(await this.token(b, 'meta')).odemeDurumu(b.meta.externalId);
        await this.not(ctx, clientId, 'meta_odeme', { durum: d.hazir ? 'tamam' : 'eksik', mesaj: d.neden });
        return d.neden;
      }
      case 'google_odeme': {
        if (!b.google) throw new KullaniciGerekli('Önce Google Ads hesabı.');
        const onayli = await this.ads(await this.token(b, 'google')).faturaOnayli(b.google.externalId.replace(/-/g, ''), b.google.managerExternalId ?? undefined);
        const m = onayli ? 'Faturalandırma onaylı.' : 'Onaylı faturalandırma yok; Google Ads > Faturalandırma’dan ödeme yöntemi ekle.';
        await this.not(ctx, clientId, 'google_odeme', { durum: onayli ? 'tamam' : 'eksik', mesaj: m });
        return m;
      }
      case 'meta_piksel':
        return this.piksel(ctx, clientId, b, istek.secim);
      case 'gtm_konteyner':
        return this.konteyner(ctx, clientId, b, istek.secim);
      case 'ga4_mulk':
        return this.mulk(ctx, clientId, b, istek.secim);
      case 'ads_donusum':
        // Kullanıcı düğmeye bastı: onaylı.
        return this.donusumler(ctx, clientId, b, true);
      case 'ga4_ads_bag':
        return this.adsBag(ctx, clientId, b);
      case 'gtm_etiket':
        return this.etiketler(ctx, clientId, b, istek.tetik, true);
      case 'site_kodu':
        return this.siteKontrol(ctx, clientId, b);
      case 'dogrulama':
        return this.dogrula(ctx, clientId, b);
    }
  }

  private async hesabiBulVeAta(ctx: TenantContext, clientId: string, platform: 'meta' | 'google', externalId: string, baglantiId: string, meta: Meta): Promise<void> {
    // Yeni hesabı veritabanına keşifle al, sonra ata: atama izlemeyi açar ve
    // geçmişi kuyruğa alır (CLAUDE.md "Atama izlemeyi de açıyor").
    await this.baglantilar.refreshAccounts(ctx, baglantiId, meta);
    const [h] = await this.prisma.withTenant({ ...ctx, activeClientId: null }, (t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id::text FROM ad_accounts WHERE platform = ${platform}::"Platform" AND replace(external_id, '-', '') = ${externalId.replace(/-/g, '')}`),
    );
    if (!h) throw new Error(`Hesap açıldı (${externalId}) ama keşifte görünmedi; ${PANEL_YERLERI.platformBaglantilari}’ndan "Hesapları yenile" deyip elle ata.`);
    await this.baglantilar.assignAdAccount(ctx, h.id, clientId, meta);
  }

  private async metaHesap(ctx: TenantContext, clientId: string, b: Baglam, secim: Extract<KurulumIstegi, { kod: 'meta_hesap' }>['secim'], meta: Meta): Promise<string> {
    if (b.meta) throw new KullaniciGerekli('Bu workspace’in zaten Meta reklam hesabı var.');
    if (secim.tur === 'mevcut') {
      await this.baglantilar.assignAdAccount(ctx, secim.adAccountId, clientId, meta);
      return 'Hesap atandı; izleme açıldı.';
    }
    const c = this.baglantiSec(b, 'meta');
    if (!c) throw new KullaniciGerekli('Meta bağlantısı yok.');
    // DAHA ÖNCE AÇILDIYSA YENİDEN AÇILMAZ (Ajan 4, B3): keşif ya da atama
    // düştüyse kimlik kayıtlı; yalnız bul ve ata.
    const onceki = b.satir?.metaAcilanHesap;
    if (onceki) {
      await this.hesabiBulVeAta(ctx, clientId, 'meta', onceki, c.id, meta);
      return `${onceki} (önceki denemede açılmıştı) atandı.`;
    }
    const mi = this.metaIstemci(await this.kasa.getAccessToken(c.id, this.saglayicilar.get('meta')));
    const tz = await mi.saatKimligi(secim.businessId);
    if (tz === null) throw new KullaniciGerekli('Bu Business Manager’da İstanbul saatli bir hesap yok; saat dilimi kimliğini tahmin etmiyoruz. Hesabı Meta’da aç, sonra "mevcut hesap" olarak seç.');
    const act = await mi.hesapAc(secim.businessId, secim.ad, tz, b.sayfaKimligi);
    // HEMEN YAZ: bundan sonraki her adım (keşif, atama) düşebilir.
    await this.yaz(ctx, clientId, { meta_business_id: secim.businessId, meta_acilan_hesap: act });
    await this.denetim(ctx, clientId, 'meta_hesap_acildi', { act, businessId: secim.businessId, ad: secim.ad }, meta);
    await this.hesabiBulVeAta(ctx, clientId, 'meta', act, c.id, meta);
    return `${act} açıldı ve atandı. Ödeme yöntemini Meta Faturalandırma’dan ekle.`;
  }

  private async googleHesap(ctx: TenantContext, clientId: string, b: Baglam, secim: Extract<KurulumIstegi, { kod: 'google_hesap' }>['secim'], meta: Meta): Promise<string> {
    if (b.google) throw new KullaniciGerekli('Bu workspace’in zaten Google Ads hesabı var.');
    if (secim.tur === 'mevcut') {
      await this.baglantilar.assignAdAccount(ctx, secim.adAccountId, clientId, meta);
      return 'Hesap atandı; izleme açıldı.';
    }
    const c = this.baglantiSec(b, 'google');
    if (!c) throw new KullaniciGerekli('Google bağlantısı yok.');
    const ads = this.ads(await this.kasa.getAccessToken(c.id, this.saglayicilar.get('google')));
    if (secim.tur === 'davet') {
      const no = secim.musteriNo.replace(/-/g, '');
      await ads.davetEt(secim.mccId, no);
      await this.yaz(ctx, clientId, { google_mcc_id: secim.mccId });
      await this.denetim(ctx, clientId, 'google_davet', { mcc: secim.mccId, musteri: no }, meta);
      return `Davet gönderildi (${secim.musteriNo}). Şirket Google Ads › Yönetici hesaplar’dan kabul edince ${PANEL_YERLERI.platformBaglantilari}’nda "Hesapları yenile" deyip hesabı burada seç.`;
    }
    const onceki = b.satir?.googleAcilanHesap;
    if (onceki) {
      await this.hesabiBulVeAta(ctx, clientId, 'google', onceki, c.id, meta);
      return `${onceki} (önceki denemede açılmıştı) atandı.`;
    }
    const no = await ads.hesapAc(secim.mccId, secim.ad);
    await this.yaz(ctx, clientId, { google_mcc_id: secim.mccId, google_acilan_hesap: no });
    await this.denetim(ctx, clientId, 'google_hesap_acildi', { no, mcc: secim.mccId, ad: secim.ad }, meta);
    await this.hesabiBulVeAta(ctx, clientId, 'google', no, c.id, meta);
    return `${no} açıldı ve atandı. Faturalandırmayı Google Ads’ten ekle.`;
  }

  private async sayfa(ctx: TenantContext, clientId: string, sayfaId: string, meta: Meta): Promise<string> {
    await this.baglantilar.assignSocialProfile(ctx, sayfaId, clientId, meta);
    // Sayfaya bağlı Instagram hesabı da gelsin: ayrı satır ve ayrı atama, ama
    // reklam ikisini birlikte istiyor; kullanıcıya ikinci kez seçtirmek angarya.
    const ig = await this.prisma.withTenant({ ...ctx, activeClientId: null }, (t) =>
      t.$queryRaw<Array<{ id: string; ad: string }>>(Prisma.sql`
        SELECT i.id::text, i.name AS ad FROM social_profiles i
          JOIN social_profiles p ON p.id = ${sayfaId}::uuid
         WHERE i.client_id IS NULL AND i.profile_type = 'instagram_business' AND i.parent_page_external_id = p.external_id`),
    );
    for (const i of ig) await this.baglantilar.assignSocialProfile(ctx, i.id, clientId, meta);
    const m = ig.length ? `Sayfa ve Instagram (${ig.map((i) => i.ad).join(', ')}) atandı.` : 'Sayfa atandı. Bağlı Instagram hesabı bulunamadı.';
    return this.boostIle(ctx, clientId, m, meta);
  }

  /**
   * ═══ BOOST HESABI KURULUMDA BAĞLANIYOR (kurulum sihirbazı Ç-7) ═══
   *
   * Açılış artık hesap atamıyor; hesap ve sayfa bu rehberin adımlarından
   * geliyor. Açılışın yaptığı bağ (`client-setup.service.ts`, `boostHesabiId`)
   * burada YOKTU: sayfa atanıp boost hesabı bağlanmayınca Akıllı Boost her
   * gönderide "bağlı reklam hesabı yok" diyor ve çaresi başka bir ekrandaki
   * açılır kutu. Workspace'in Meta hesabı TEK (her projenin kendi hesabı),
   * yani hangi hesabın bağlanacağı tahmin değil.
   *
   * YALNIZ BOŞ BAĞ DOLDURULUR: kullanıcının elle seçtiği hesabı ezmek bir
   * kararı sessizce bozmak olurdu. Doğrulama MEVCUT yoldan
   * (`setProfileAdAccount`: hesap Meta mı, aynı workspace'te mi) — ikinci
   * bir doğrulama ayrışırdı. Bağ düşerse adım DÜŞMEZ (sayfa atandı) ama
   * sebep sonuç cümlesinde yazar.
   */
  private async boostIle(ctx: TenantContext, clientId: string, mesajMetni: string, meta: Meta): Promise<string> {
    const r = await this.prisma.withTenant({ ...ctx, activeClientId: clientId }, async (t) => {
      const [hesap] = await t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id::text FROM ad_accounts WHERE client_id = ${clientId}::uuid AND platform = 'meta' ORDER BY name, id LIMIT 1`);
      const profiller = await t.$queryRaw<Array<{ id: string; ad: string }>>(Prisma.sql`
        SELECT id::text, name AS ad FROM social_profiles
         WHERE client_id = ${clientId}::uuid AND profile_type IN ('facebook_page', 'instagram_business') AND linked_ad_account_id IS NULL
         ORDER BY name, id`);
      return { hesap: hesap?.id ?? null, profiller };
    });
    if (!r.hesap || r.profiller.length === 0) return mesajMetni;
    const dusen: string[] = [];
    for (const p of r.profiller) {
      try {
        await this.baglantilar.setProfileAdAccount(ctx, p.id, r.hesap, meta);
      } catch (e) {
        dusen.push(`${p.ad} (${mesaj(e)})`);
      }
    }
    const baglanan = r.profiller.length - dusen.length;
    return (
      mesajMetni +
      (baglanan > 0 ? ` Boost hesabı ${baglanan} profile bağlandı.` : '') +
      (dusen.length ? ` Boost hesabı bağlanamadı: ${dusen.join(', ')}.` : '')
    );
  }

  private async piksel(ctx: TenantContext, clientId: string, b: Baglam, secim: Extract<KurulumIstegi, { kod: 'meta_piksel' }>['secim'] | 'oto'): Promise<string> {
    if (!b.meta) throw new KullaniciGerekli('Önce Meta reklam hesabı.');
    if (b.pikselId && secim === 'oto') return `Piksel ${b.pikselId} zaten seçili.`;
    if (secim !== 'oto' && secim.tur === 'mevcut') {
      await this.pikselYaz(ctx, clientId, secim.pikselId);
      return `Piksel ${secim.pikselId} seçildi.`;
    }
    const token = await this.token(b, 'meta');
    if (secim === 'oto') {
      // Hesapta kullanılabilir piksel varsa YENİSİ AÇILMAZ: iki piksel veriyi
      // ikiye böler. Tekse o, birden çoksa seçim kullanıcıda.
      const p = await (this.saglayicilar.get('meta') as unknown as MetaProvider).fetchAdPixels({ adAccountPath: b.meta.externalId, accessToken: token });
      const uygun = p.satirlar.filter((x) => !x.kullanilamaz);
      if (uygun.length === 1) {
        await this.pikselYaz(ctx, clientId, uygun[0]!.id);
        return `Hesaptaki tek piksel (${uygun[0]!.ad}) seçildi.`;
      }
      if (uygun.length > 1) throw new KullaniciGerekli(`Hesapta ${uygun.length} piksel var; hangisinin kullanılacağını seç.`);
    }
    const id = await this.metaIstemci(token).pikselAc(b.meta.externalId, `${b.ad} · Advetics`);
    await this.pikselYaz(ctx, clientId, id);
    return `Yeni piksel ${id} açıldı.`;
  }

  private async konteyner(ctx: TenantContext, clientId: string, b: Baglam, secim: Extract<KurulumIstegi, { kod: 'gtm_konteyner' }>['secim'] | 'oto'): Promise<string> {
    if (b.satir?.gtmKimligi && secim === 'oto') return `${b.satir.gtmKimligi} zaten kurulu.`;
    const gtm = new GtmIstemcisi(await this.googleOlcumTokeni(b));
    let k: { path: string; publicId: string; hesap: string } | null = null;
    if (secim !== 'oto' && secim.tur === 'mevcut') {
      const c = await gtm.konteyner(secim.konteynerYolu);
      k = { path: c.path, publicId: c.publicId, hesap: secim.konteynerYolu.split('/')[1]! };
    } else if (secim !== 'oto' && secim.tur === 'yeni') {
      const c = await gtm.konteynerAc(secim.gtmHesapId, b.ad);
      k = { path: c.path, publicId: c.publicId, hesap: secim.gtmHesapId };
    } else {
      // OKUNAMAYAN SİTE "KOD YOK" DEĞİL (Ajan 4, B5): site okunamadıysa ya
      // da sitedeki konteynerin dosyası okunamadıysa yeni konteyner açmak
      // sitede ikinci kod ve bölünmüş veri demekti; karar kullanıcıda.
      const t = await this.siteTaramasi(ctx, clientId);
      if (t.durum !== 'okundu') throw new KullaniciGerekli(`Site okunamadı (${t.neden}); sitede konteyner olup olmadığını bilmiyoruz. Konteyneri seç ya da yeni aç.`);
      const hesaplar = await gtm.hesaplar();
      if (t.tagManager.length > 0) {
        /*
         * KİMLİKLE BUL, HESAP HESAP GEZME. İlk 30 hesabın konteynerlerine
         * bakılıyordu: sitedeki konteyner 31. hesaptaysa "Google hesabımız
         * erişemiyor" deniyordu — erişim varken. `lookup` tek çağrıda bütün
         * hesaplara bakıyor.
         */
        for (const kimlik of t.tagManager) {
          const c = await gtm.ara(kimlik);
          if (c) {
            k = { path: c.path, publicId: c.publicId, hesap: c.accountId };
            break;
          }
        }
        if (!k) throw new KullaniciGerekli(`Sitede ${t.tagManager.join(', ')} var ama Google hesabımız erişemiyor. Konteyneri seç ya da yeni aç (ya da o konteynere erişim ver).`);
      } else if (hesaplar.length === 1) {
        const c = await gtm.konteynerAc(hesaplar[0]!.accountId, b.ad);
        k = { path: c.path, publicId: c.publicId, hesap: hesaplar[0]!.accountId };
      } else {
        throw new KullaniciGerekli(hesaplar.length === 0 ? 'Erişilebilen Tag Manager hesabı yok; tagmanager.google.com’da bir hesap aç.' : `${hesaplar.length} Tag Manager hesabı var; konteynerin hangisinde açılacağını seç.`);
      }
    }
    await this.yaz(ctx, clientId, { gtm_hesap_id: k.hesap, gtm_konteyner_yolu: k.path, gtm_kimligi: k.publicId, gtm_yayin: null, site_kodu: null });
    return `Konteyner ${k.publicId} bağlandı.`;
  }

  private async mulk(ctx: TenantContext, clientId: string, b: Baglam, secim: Extract<KurulumIstegi, { kod: 'ga4_mulk' }>['secim'] | 'oto'): Promise<string> {
    if (b.satir?.ga4OlcumKimligi && secim === 'oto') return `${b.satir.ga4OlcumKimligi} zaten kurulu.`;
    if (!b.site) throw new KullaniciGerekli(`Web akışı site adresi istiyor; ${PANEL_YERLERI.workspaceBilgileri}’nden gir.`);
    const ga = new Ga4Istemcisi(await this.googleOlcumTokeni(b));
    // Önceki denemede açılmış ama akışı kurulamamış mülk YENİDEN AÇILMAZ (Ajan 4, Ö8).
    let mulkId: string | null = secim === 'oto' ? (b.satir?.ga4MulkId ?? null) : null;
    if (secim !== 'oto' && secim.tur === 'mevcut') {
      mulkId = secim.mulkId;
    } else if (secim !== 'oto' && secim.tur === 'yeni') {
      mulkId = await ga.mulkAc(secim.gaHesapId, b.ad);
      await this.yaz(ctx, clientId, { ga4_hesap_id: secim.gaHesapId, ga4_mulk_id: mulkId, ga4_akis_yolu: null, ga4_olcum_kimligi: null, ga4_ads_bagli: false });
    } else if (!mulkId) {
      const t = await this.siteTaramasi(ctx, clientId);
      if (t.durum !== 'okundu') throw new KullaniciGerekli(`Site okunamadı (${t.neden}); sitede Analytics olup olmadığını bilmiyoruz. Mülkü seç ya da yeni aç.`);
      if (t.analytics.length > 0) {
        // Sitedeki G- kimliğinin mülkünü bulmak her mülkün akışını okumak
        // demek (yüzlerce çağrı); TAHMİN ETMİYORUZ, seçimi kullanıcıya bırakıyoruz.
        throw new KullaniciGerekli(`Sitede ${t.analytics.join(', ')} var; aynı mülkü kullanmak için onu seç (yeni mülk açmak veriyi ikiye böler).`);
      }
      const hesaplar = await ga.hesaplar();
      if (hesaplar.length !== 1) throw new KullaniciGerekli(hesaplar.length === 0 ? 'Erişilebilen Analytics hesabı yok; analytics.google.com’da bir hesap aç.' : `${hesaplar.length} Analytics hesabı var; mülkün hangisinde açılacağını seç.`);
      mulkId = await ga.mulkAc(hesaplar[0]!.hesapId, b.ad);
      await this.yaz(ctx, clientId, { ga4_hesap_id: hesaplar[0]!.hesapId, ga4_mulk_id: mulkId, ga4_akis_yolu: null, ga4_olcum_kimligi: null, ga4_ads_bagli: false });
    }
    const akislar = await ga.webAkislari(mulkId);
    const akis = akislar[0] ?? (await ga.webAkisiAc(mulkId, b.ad, b.site));
    await this.yaz(ctx, clientId, { ga4_mulk_id: mulkId, ga4_akis_yolu: akis.yol, ga4_olcum_kimligi: akis.olcumKimligi, ga4_ads_bagli: false });
    /*
     * KURULAN MÜLK OKUNMAYA DA BAŞLASIN (docs/veri-kaynagi/MIMARI.md Ç-5):
     * kurulum "kurduğumuz", veri kaynağı "okuduğumuz" mülk; ikisi ayrı kayıt
     * ama kullanıcı ikinci kez seçmek zorunda kalmamalı. Bağlama hatası
     * ADIMI DÜŞÜRMEZ (mülk kuruldu); sebebi adımın sonucuna ekleniyor.
     */
    // Eski kurulum mülkü: okuma onu izliyorsa yenisine geçsin (Kurulum'da "Değiştir").
    const okuma = await this.veriKaynagi.kurulumdanBagla(ctx, clientId, mulkId, b.satir?.ga4MulkId ?? null);
    const sonuc = akislar.length > 1 ? `Mülk ${mulkId}: ${akislar.length} web akışından ilki (${akis.olcumKimligi}) kullanılıyor.` : `Mülk ${mulkId}, ölçüm kimliği ${akis.olcumKimligi}.`;
    return okuma ? `${sonuc} ${okuma}` : sonuc;
  }

  /**
   * SİTE TARAMASI ÜÇ HÂLLİ: okundu (kimlikler kesin), bilinmiyor (site ya da
   * sitedeki bir konteyner dosyası okunamadı). "Okunamadı"yı boş liste saymak
   * "kod yok" demekti ve yeni konteyner/mülk açtırıp çift saydırıyordu (B5).
   */
  private async siteTaramasi(ctx: TenantContext, clientId: string, yenile = false): Promise<
    { durum: 'okundu'; tagManager: string[]; analytics: string[]; metaPiksel: string[]; okunamayan: string[] } | { durum: 'bilinmiyor'; neden: string }
  > {
    try {
      const d = await this.olcum.durum(ctx, clientId, yenile);
      if (d.site.durum !== 'tarandi') return { durum: 'bilinmiyor', neden: d.site.hata ?? (d.site.durum === 'adres_yok' ? 'site adresi yok' : 'site okunamadı') };
      return { durum: 'okundu', tagManager: d.site.tagManager, analytics: d.site.analytics, metaPiksel: d.site.metaPiksel, okunamayan: d.site.tagManagerOkunamayan };
    } catch (e) {
      return { durum: 'bilinmiyor', neden: mesaj(e) };
    }
  }

  private async donusumler(ctx: TenantContext, clientId: string, b: Baglam, onayli: boolean): Promise<string> {
    if (!b.google) throw new KullaniciGerekli('Önce Google Ads hesabı.');
    const tetik = b.satir?.donusumTetigi;
    if (!tetik) throw new KullaniciGerekli('Önce dönüşüm tetiklerini seç (Ölçüm etiketleri).');
    const ads = this.ads(await this.token(b, 'google'));
    const no = b.google.externalId.replace(/-/g, '');
    const yonetici = b.google.managerExternalId ?? undefined;
    const islemler = await ads.donusumIslemleri(no, yonetici);
    const yeniGerek = gerekenDonusumler(tetik).some((t) => !islemler.some((x) => x.ad === DONUSUM_ADI[t]));
    // CANLI HESAPTA ONAYSIZ BİRİNCİL HEDEF YOK (Ajan 4, Ö4): harcaması olan
    // hesapta yeni birincil dönüşüm hesabın hedeflerine girer ve akıllı teklif
    // stratejisinin neyi optimize ettiğini değiştirir — para etkisi var.
    // "Eksikleri tamamla" bunu yapmaz; kullanıcı "Dönüşümleri kur"a basar.
    if (yeniGerek && !onayli && (await ads.harcamaVar(no, yonetici))) {
      throw new KullaniciGerekli('Hesapta son 30 günde harcama var; yeni birincil dönüşüm teklif stratejisini etkiler. "Dönüşümleri kur" ile onaylayarak kur.');
    }
    const kayit: Partial<Record<DonusumTuru, AdsDonusumKaydi>> = { ...(b.satir?.adsDonusumleri ?? {}) };
    const ozet: string[] = [];
    for (const tur of gerekenDonusumler(tetik)) {
      const bizim = islemler.find((x) => x.ad === DONUSUM_ADI[tur]);
      const baska = islemler.find((x) => x.birincil && x.kategori === DONUSUM_KATEGORISI[tur] && x.ad !== DONUSUM_ADI[tur]);
      if (!bizim && baska) {
        kayit[tur] = { kaynak: null, gonder: null, not: `Google Ads’te birincil "${baska.ad}" zaten var; çift sayılmasın diye yenisi açılmadı.` };
        ozet.push(`${tur}: mevcut "${baska.ad}"`);
        continue;
      }
      // Kayıtta kimlik varsa ve işlem hâlâ duruyorsa yeniden okunmaz; kimliği
      // OKUNAMAMIŞ kayıt her koşuda yeniden okunur (Ö3).
      const eski = kayit[tur];
      if (bizim && eski?.kaynak === bizim.resourceName && eski.gonder) {
        ozet.push(`${tur}: mevcut`);
        continue;
      }
      const kaynak = bizim?.resourceName ?? (await ads.donusumAc(no, tur, yonetici));
      const gonder = await ads.gonderAdresiOku(no, kaynak, yonetici);
      kayit[tur] = { kaynak, gonder, not: gonder ? `"${DONUSUM_ADI[tur]}" hazır.` : `"${DONUSUM_ADI[tur]}" açıldı ama etiket kimliği okunamadı; Google Ads etiketi yazılamıyor.` };
      ozet.push(`${tur}: ${bizim ? 'mevcut' : 'açıldı'}`);
    }
    await this.yaz(ctx, clientId, { ads_donusumleri: kayit });
    return ozet.join(' · ') || 'Seçilen tetiklerde Google Ads dönüşümü gerekmiyor.';
  }

  private async adsBag(ctx: TenantContext, clientId: string, b: Baglam): Promise<string> {
    if (!b.google || !b.satir?.ga4MulkId) throw new KullaniciGerekli('Önce Analytics mülkü ve Google Ads hesabı.');
    const ga = new Ga4Istemcisi(await this.googleOlcumTokeni(b));
    const mulk = b.satir.ga4MulkId;
    const no = b.google.externalId.replace(/-/g, '');
    const notlar: string[] = [];
    if (!(await ga.adsBaglantilari(mulk)).includes(no)) {
      await ga.adsBagla(mulk, no);
      notlar.push('Google Ads bağlandı.');
    } else notlar.push('Google Ads zaten bağlı.');
    if (b.satir.donusumTetigi?.formYolu && !(await ga.anahtarEtkinlikler(mulk)).includes('generate_lead')) {
      await ga.anahtarEtkinlikAc(mulk, 'generate_lead');
      notlar.push('generate_lead anahtar etkinlik yapıldı.');
    }
    await this.yaz(ctx, clientId, { ga4_ads_bagli: true });
    return notlar.join(' ');
  }

  private async etiketler(ctx: TenantContext, clientId: string, b0: Baglam, yeniTetik: DonusumTetigi | 'oto', onayli: boolean): Promise<string> {
    if (!b0.satir?.gtmKonteynerYolu) throw new KullaniciGerekli('Önce Tag Manager konteyneri.');
    if (yeniTetik !== 'oto') await this.yaz(ctx, clientId, { donusum_tetigi: yeniTetik });
    let b = yeniTetik === 'oto' ? b0 : await this.baglam(ctx, clientId);
    const tetik = b.satir!.donusumTetigi;
    if (!tetik) throw new KullaniciGerekli('Önce tetikleri seç: form gönderilince açılan sayfa, telefon ve WhatsApp tıklamaları.');
    const adsNotlari: string[] = [];
    // Dönüşüm işlemleri etiketten ÖNCE: Google Ads etiketi onların kimliğini taşıyor.
    if (b.google && gerekenDonusumler(tetik).some((t) => !b.satir!.adsDonusumleri[t]?.gonder && b.satir!.adsDonusumleri[t]?.kaynak !== null)) {
      try {
        await this.donusumler(ctx, clientId, b, onayli);
      } catch (e) {
        // Düşen dönüşüm etiketi durdurmaz (GA4 ve Meta yine yazılır) ama
        // SESSİZ KALMAZ: neden yayın notuna girer.
        adsNotlari.push(`Google Ads dönüşümleri kurulamadı: ${mesaj(e)}`);
      }
      b = await this.baglam(ctx, clientId);
    }
    const s = b.satir!;
    for (const t of gerekenDonusumler(tetik)) {
      const k = s.adsDonusumleri[t];
      if (b.google && k && !k.gonder) adsNotlari.push(k.not);
    }
    const gtm = new GtmIstemcisi(await this.googleOlcumTokeni(b));
    const yol = s.gtmKonteynerYolu!;

    // BAŞKASININ TASLAĞINI YAYINLAMA: son sürüm canlı değilse konteynerde
    // yayınlanmamış başka bir değişiklik var; bizim yayınımız onu da canlıya
    // alırdı. İstisna: son sürüm BİZİM (yayını yarım kalmış önceki koşu) ya da silinmiş.
    const [son, canli] = await Promise.all([gtm.sonSurum(yol), gtm.canliSurum(yol)]);
    const hicYok = (v: string | null) => v === null || v === '0';
    const bekleyenBaskasinin = !(hicYok(son.id) && hicYok(canli)) && son.id !== canli && !son.silinmis && son.ad !== SURUM_ADI;
    if (bekleyenBaskasinin) {
      throw new KullaniciGerekli(`Tag Manager’da yayınlanmamış bir sürüm var (sürüm ${son.id}${son.ad ? ` "${son.ad}"` : ''}, canlı ${canli ?? 'yok'}). Onu yayınlayın ya da silin; başkasının değişikliğini biz yayınlamayız.`);
    }

    // SİTE TARAMASI: okunamadıysa "sitede GA4/piksel var mı" bilinmiyor; temel
    // etiketleri eklemek çift sayım riski (B5). Kendi kodumuz sitedeyse
    // taramadaki kimlikler bizimkiler olabilir, o zaman önceki yayının kararı geçerli.
    const tarama = await this.siteTaramasi(ctx, clientId);
    const kendiKodumuzSitede = tarama.durum === 'okundu' && Boolean(s.gtmKimligi && tarama.tagManager.includes(s.gtmKimligi));
    const onceki = s.gtmYayin as (GtmYayin & { mevcut?: { ga4Yuklu: boolean; pikselYuklu: boolean } }) | null;
    if (!kendiKodumuzSitede) {
      if (tarama.durum !== 'okundu') throw new KullaniciGerekli(`Site okunamadı (${tarama.neden}); sitede zaten Analytics ya da piksel olup olmadığını bilmeden yayınlamıyoruz (çift sayım). Site açılınca tekrar dene.`);
      const yabanciOkunamayan = tarama.okunamayan.filter((x) => x !== s.gtmKimligi);
      if (yabanciOkunamayan.length > 0) throw new KullaniciGerekli(`Sitedeki ${yabanciOkunamayan.join(', ')} konteynerinin içeriği okunamadı; içinde Analytics ya da piksel olabilir. Okunamayan konteyner varken yayınlamıyoruz.`);
    }
    const alan = await gtm.calismaAlani(yol);
    const [varEtiket, varTetik] = await Promise.all([gtm.etiketler(alan), gtm.tetikler(alan)]);
    const konteyner = konteynerdeYuklu(varEtiket, s.ga4OlcumKimligi, b.pikselId);
    const siteGa4 = tarama.durum === 'okundu' && !kendiKodumuzSitede ? tarama.analytics : [];
    const sitePiksel = tarama.durum === 'okundu' && !kendiKodumuzSitede ? tarama.metaPiksel : [];
    const mevcut = {
      ...konteyner,
      ga4Yuklu: konteyner.ga4Yuklu || (s.ga4OlcumKimligi !== null && siteGa4.includes(s.ga4OlcumKimligi)) || (kendiKodumuzSitede && onceki?.mevcut?.ga4Yuklu === true),
      pikselYuklu: konteyner.pikselYuklu || (b.pikselId !== null && sitePiksel.includes(b.pikselId)) || (kendiKodumuzSitede && onceki?.mevcut?.pikselYuklu === true),
    };
    const ads = Object.fromEntries((['form', 'telefon', 'whatsapp'] as const).flatMap((t) => (s.adsDonusumleri[t]?.gonder ? [[t, s.adsDonusumleri[t]!.gonder!]] : [])));
    const plan = gtmPlani({ ga4OlcumKimligi: s.ga4OlcumKimligi, metaPikselId: b.pikselId, ads, tetik, mevcut });
    plan.atlananlar.push(...adsNotlari);
    if (plan.etiketler.length === 0) throw new KullaniciGerekli(plan.atlananlar.join(' '));

    await gtm.yerlesikDegiskenleriAc(alan, plan.degiskenler);
    const tetikKimligi = new Map<string, string>([[TUM_SAYFALAR_TETIGI, TUM_SAYFALAR_TETIGI]]);
    for (const t of plan.tetikler) tetikKimligi.set(t.name, await gtm.tetikYaz(alan, t, varTetik.find((x) => x.name === t.name)));
    for (const e of plan.etiketler) {
      const govde: Record<string, unknown> = {
        name: e.name,
        type: e.type,
        parameter: e.parameter,
        firingTriggerId: [tetikKimligi.get(e.tetik)!],
        ...(e.birKez ? { tagFiringOption: 'oncePerLoad' } : {}),
        ...(e.onceki ? { setupTag: [{ tagName: e.onceki, stopOnSetupFailure: false }] } : {}),
      };
      await gtm.etiketYaz(alan, govde, varEtiket.find((x) => x.name === e.name));
    }
    // ARTIK İSTENMEYEN BİZİM ETİKETLER SİLİNİR: WhatsApp kapatılınca eski
    // etiketi bırakmak, kullanıcının kapattığını sanıp saydırdığı dönüşüm demekti.
    // YALNIZ ön ekli etiketler: kullanıcının kendi etiketine asla dokunulmaz.
    const planAdlari = new Set(plan.etiketler.map((e) => e.name));
    for (const e of silinecekEtiketler(varEtiket, planAdlari)) await gtm.etiketSil(e.path);
    // Yazarken başkası yayınladıysa ya da yeni sürüm açtıysa DURUR: bizim
    // sürümümüz onun değişikliğini geri alır ya da onunkini de yayınlardı.
    const sonTekrar = await gtm.sonSurum(yol);
    if (sonTekrar.id !== son.id) throw new KullaniciGerekli('Biz yazarken Tag Manager’da yeni bir sürüm oluştu; çakışmamak için yayınlanmadı. Tekrar dene.');
    const v = await gtm.surumOlusturVeYayinla(alan, `Advetics: ${plan.etiketler.map((e) => e.name.replace(ON_EK, '')).join(', ')}`);
    const yayin: GtmYayin & { mevcut: typeof mevcut } = {
      surumId: v.surumId,
      zaman: new Date().toISOString(),
      etiketler: plan.etiketler.map((e) => e.name),
      atlananlar: plan.atlananlar,
      imza: etiketImzasi({ ga4: s.ga4OlcumKimligi, piksel: b.pikselId, tetik, ads: s.adsDonusumleri }),
      mevcut,
    };
    await this.yaz(ctx, clientId, { gtm_yayin: yayin });
    await this.denetim(ctx, clientId, 'gtm_yayinlandi', { konteyner: s.gtmKimligi, surum: v.surumId, etiketler: yayin.etiketler }, {});
    return `Sürüm ${v.surumId} yayınlandı: ${plan.etiketler.length} etiket.${plan.atlananlar.length ? ` ${plan.atlananlar.join(' ')}` : ''}`;
  }

  private async siteKontrol(ctx: TenantContext, clientId: string, b: Baglam): Promise<string> {
    const kimlik = b.satir?.gtmKimligi;
    if (!kimlik) throw new KullaniciGerekli('Önce Tag Manager konteyneri.');
    const d = await this.olcum.durum(ctx, clientId, true);
    const gorundu = d.site.durum === 'tarandi' && d.site.tagManager.includes(kimlik);
    const hata = d.site.durum === 'tarandi' ? null : (d.site.hata ?? (d.site.durum === 'adres_yok' ? 'Site adresi yok' : 'Site okunamadı'));
    await this.yaz(ctx, clientId, { site_kodu: { zaman: new Date().toISOString(), gorundu, hata } });
    return gorundu ? `${kimlik} sitede görüldü.` : hata ? `Site okunamadı: ${hata}` : `${kimlik} sitede görülmedi.`;
  }

  private async dogrula(ctx: TenantContext, clientId: string, b: Baglam): Promise<string> {
    const s = b.satir;
    if (!s?.gtmYayin) throw new KullaniciGerekli('Önce etiketleri yayınla.');
    let ga4: Record<string, number> | null = null;
    let ga4Hata: string | null = null;
    let metaOlaylar: Record<string, number> | null = null;
    let metaHata: string | null = null;
    if (s.ga4MulkId) {
      try {
        ga4 = await new Ga4Istemcisi(await this.googleOlcumTokeni(b)).anlikOlaylar(s.ga4MulkId);
      } catch (e) {
        ga4Hata = mesaj(e);
      }
    }
    if (b.pikselId && b.meta) {
      try {
        metaOlaylar = await (this.saglayicilar.get('meta') as unknown as MetaProvider).fetchPixelEventCounts({
          pikselId: b.pikselId,
          accessToken: await this.token(b, 'meta'),
          // Son 2 saat: Meta istatistiği saatlik kovalarla geliyor (Ölçüm modülü).
          baslangic: Math.floor(Date.now() / 1000) - 2 * 3600,
        });
        if (metaOlaylar === null) metaHata = 'Piksel istatistiği okunamadı';
      } catch (e) {
        metaHata = mesaj(e);
      }
    }
    await this.yaz(ctx, clientId, { son_dogrulama: { zaman: new Date().toISOString(), ga4, ga4Hata, meta: metaOlaylar, metaHata } });
    return 'Doğrulama sonucu kaydedildi.';
  }

  // ───────────────────────────────────────────────────────────────────────
  // Eksikleri tamamla
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `kodlar` verilirse YALNIZ o adımlar (sihirbazın adım başına "Otomatik
   * yap"ı, MIMARI § 7); verilmezse bütün otomatik adımlar (bugünkü davranış).
   */
  async tamamla(ctx: TenantContext, clientId: string, meta: Meta, kodlar?: readonly KurulumAdimKodu[]): Promise<KurulumYaniti & { sonuclar: KurulumAdimSonucu[] }> {
    this.erisim(ctx, clientId, true);
    return this.kilitli(clientId, () => this.tamamlaKilitli(ctx, clientId, meta, kodlar));
  }

  /**
   * "WEB SİTEMİZ YOK" BEYANI — ÜÇ HÂLLİ. Sorgu düşerse `null` (okunamadı),
   * `false` DEĞİL: okunamayan beyanı "yok" saymak sitesi olmayan bir
   * workspace'e Tag Manager konteyneri açtırmak demek.
   */
  private async siteYokOku(ctx: TenantContext, clientId: string): Promise<boolean | null> {
    try {
      return await this.prisma.withTenant(ctx, (t) => siteYokBeyaniVarMi(t as unknown as SorguCalistirici, clientId));
    } catch (e) {
      logger.warn(`Kurulum beyanı okunamadı (${clientId}): ${mesaj(e)}`);
      return null;
    }
  }

  private async tamamlaKilitli(
    ctx: TenantContext,
    clientId: string,
    meta: Meta,
    kodlar?: readonly KurulumAdimKodu[],
  ): Promise<KurulumYaniti & { sonuclar: KurulumAdimSonucu[] }> {
    const sonuclar: KurulumAdimSonucu[] = [];
    const istenen = kodlar ? new Set(kodlar) : null;
    /*
     * İSTENEN AMA OTOMATİK OLMAYAN ADIM SESSİZCE ATLANMAZ. Sihirbaz adım
     * başına "Otomatik yap" gönderiyor; dönen listede o kod hiç yoksa ekran
     * "yapıldı mı, yapılmadı mı" bilemez. GERÇEK HESAP AÇAN kodlar
     * (`HESAP_ACAN_KODLAR`) ayrıca adıyla reddediliyor: panelin süzgeci
     * tek başına koruma değil (MIMARI Ç-4).
     */
    for (const kod of kodlar ?? []) {
      if (OTOMATIK_SIRA.includes(kod)) continue;
      sonuclar.push({
        kod,
        durum: 'atlandi',
        mesaj: HESAP_ACAN_KODLAR.includes(kod)
          ? 'Gerçek bir reklam hesabı açar; "Otomatik yap" bunu yapmaz, adımın içinden seçerek yapılır.'
          : 'Bu adım otomatik yapılmıyor; adımın içinden yapılır.',
      });
    }
    /*
     * SİTE YOK BEYANI (kullanıcı kararı 2026-10-13, MIMARI § 0/2): piksel ve
     * ölçüm adımlarına DOKUNULMAZ. Liste panelin tek tanımından türüyor
     * (`siteYokKurulumKodlari`); beyan OKUNAMADIYSA da dokunulmaz ve bu
     * SÖYLENİR — belirsizde Tag Manager kurmak, beklemekten pahalı. Beyan
     * varsa adım panelde zaten "kapsam dışı" görünüyor; sonuç yalnız adım
     * açıkça istendiyse yazılıyor.
     */
    const siteYok = await this.siteYokOku(ctx, clientId);
    const siteAdimlari = siteYok === false ? new Set<KurulumAdimKodu>() : siteYokKurulumKodlari();
    /*
     * KULLANILMAYAN PLATFORMUN ADIMLARINA DOKUNULMAZ (MIMARI Ç-6). Google'ı
     * kullanmadığını söyleyen bir workspace'te "Eksikleri tamamla" Google Ads
     * dönüşümü AÇMAMALI; panelin süzgeci tek başına koruma değil (başka bir
     * istemci ya da eski sekme bu ucu doğrudan çağırabilir). Beyan döngünün
     * başında BİR KEZ okunuyor: tamamla sürerken beyan değişirse yarısı eski
     * yarısı yeni kurala göre çalışmasın.
     */
    const ilk = await this.baglam(ctx, clientId);
    const atlanan = kullanilmayanAdimlar(ilk.kullanilmayanlar);
    for (const kod of OTOMATIK_SIRA) {
      if (istenen && !istenen.has(kod)) continue;
      if (atlanan.has(kod)) {
        if (istenen) sonuclar.push({ kod, durum: 'atlandi', mesaj: 'Bu workspace’te bu platform kullanılmıyor.' });
        continue;
      }
      if (siteAdimlari.has(kod)) {
        if (siteYok === null) {
          sonuclar.push({ kod, durum: 'atlandi', mesaj: 'Kurulum beyanları okunamadı; "web sitemiz yok" denip denmediği bilinmediği için site işleri yapılmadı. Birazdan tekrar dene.' });
        } else if (istenen) {
          sonuclar.push({ kod, durum: 'atlandi', mesaj: 'Bu workspace için "web sitemiz yok" dendi; site işleri yapılmaz. Site eklenince beyanı geri al.' });
        }
        continue;
      }
      // Her adımdan önce durum YENİDEN hesaplanır: önceki adım bir sonrakinin
      // ön koşulunu açıyor (konteyner açılınca etiketler yazılabilir).
      const b = await this.baglam(ctx, clientId);
      const adim = kurulumAdimlari(b.anlik).find((x) => x.kod === kod)!;
      if (!adim.otomatik) {
        // Açıkça istenen adım bu durumda yapılamıyorsa NEDENİ dönüyor
        // (zaten tamam, önceki adım bekleniyor…); toplu çağrıda bugünkü gibi sessiz.
        if (istenen) sonuclar.push({ kod, durum: 'atlandi', mesaj: adim.durum === 'tamam' ? 'Zaten tamam.' : adim.neden });
        continue;
      }
      const r = await this.otomatikAdim(ctx, clientId, b, kod, meta);
      sonuclar.push(r);
    }
    return { ...(await this.oku(ctx, clientId)), sonuclar };
  }

  private async otomatikAdim(ctx: TenantContext, clientId: string, b: Baglam, kod: KurulumAdimKodu, meta: Meta): Promise<KurulumAdimSonucu> {
    try {
      let m: string;
      if (kod === 'sayfa') {
        if (!hesapYetkisi(ctx)) throw new KullaniciGerekli('Sayfa atamak için bağlantı yönetme yetkisi gerekiyor.');
        const s = await this.secenekler(ctx, clientId, 'sayfa');
        if (s.mevcut.length !== 1) throw new KullaniciGerekli('Birden çok sayfa var; seç.');
        m = await this.sayfa(ctx, clientId, s.mevcut[0]!.deger, meta);
      } else if (kod === 'meta_piksel') m = await this.piksel(ctx, clientId, b, 'oto');
      else if (kod === 'gtm_konteyner') m = await this.konteyner(ctx, clientId, b, 'oto');
      else if (kod === 'ga4_mulk') m = await this.mulk(ctx, clientId, b, 'oto');
      else if (kod === 'ads_donusum') m = await this.donusumler(ctx, clientId, b, false);
      else if (kod === 'ga4_ads_bag') m = await this.adsBag(ctx, clientId, b);
      else if (kod === 'gtm_etiket') m = await this.etiketler(ctx, clientId, b, 'oto', false);
      else throw new KullaniciGerekli('Bu adım otomatik yapılmıyor.');
      await this.not(ctx, clientId, kod, null);
      return { kod, durum: 'yapildi', mesaj: m };
    } catch (e) {
      if (e instanceof KullaniciGerekli) return { kod, durum: 'atlandi', mesaj: e.message };
      if (e instanceof ForbiddenException || e instanceof ConflictException) throw e;
      logger.warn(`Otomatik kurulum adımı düştü (${clientId}, ${kod}): ${mesaj(e)}`);
      await this.not(ctx, clientId, kod, { durum: 'hata', mesaj: mesaj(e).slice(0, 800) }).catch((e2) => logger.error(`Not yazılamadı: ${mesaj(e2)}`));
      return { kod, durum: 'hata', mesaj: mesaj(e) };
    }
  }
}

/** Ham satırdan tipli satır; JSON alanlar yoksa boş. */
export function satirOku(k: Record<string, unknown>): KurulumSatiri {
  const metin = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v.trim() : null);
  const nesne = <T>(v: unknown, bos: T): T => (v !== null && typeof v === 'object' ? (v as T) : bos);
  const sahip = metin(k.hesap_sahibi);
  return {
    hesapSahibi: sahip === 'ajans' || sahip === 'sirket' ? sahip : null,
    metaAcilanHesap: metin(k.meta_acilan_hesap),
    googleAcilanHesap: metin(k.google_acilan_hesap),
    gtmKonteynerYolu: metin(k.gtm_konteyner_yolu),
    gtmKimligi: metin(k.gtm_kimligi),
    gtmYayin: nesne<GtmYayin | null>(k.gtm_yayin, null),
    ga4MulkId: metin(k.ga4_mulk_id),
    ga4OlcumKimligi: metin(k.ga4_olcum_kimligi),
    ga4AdsBagli: k.ga4_ads_bagli === true,
    adsDonusumleri: nesne(k.ads_donusumleri, {}),
    donusumTetigi: nesne<DonusumTetigi | null>(k.donusum_tetigi, null),
    adimNotlari: nesne(k.adim_notlari, {}),
    sonDogrulama: nesne(k.son_dogrulama, null),
    siteKodu: nesne(k.site_kodu, null),
  };
}

/**
 * HESAP SEÇMEK / AÇMAK / SAYFA ATAMAK HAVUZ ATAMASIYLA AYNI KAPI (MIMARI
 * Ç-20, `PANEL_KAPILARI['kurulum.hesap']`). Uç yalnız `connection.write`
 * istiyordu, Ayarlar'daki havuz ataması ise `connection.write` +
 * `connection.manage`: aynı işin iki kapısı vardı ve `manage` taşımayan biri
 * (Reklam Yöneticisi) havuzdan hesabı Kurulum üzerinden alabiliyordu.
 */
export function hesapYetkisi(ctx: Pick<TenantContext, 'permissions'>): boolean {
  return ctx.permissions.includes('connection.write') && ctx.permissions.includes('connection.manage');
}

/**
 * Platform beyanının izi. Beyan yoksa `null`; beyan var ama iz yoksa (iz
 * kolonlarından ÖNCE verilmiş beyan) `tarih: null` — tarih UYDURULMAZ,
 * `updated_at` satırın başka bir alanı yazılınca da değişiyor.
 */
export function platformBeyaniOku(k: Record<string, unknown>): KurulumYaniti['platformBeyani'] {
  if (kullanilmayanOku(k).length === 0) return null;
  const eden = typeof k.platform_beyan_eden === 'string' ? k.platform_beyan_eden : null;
  const ad = typeof k.platform_beyan_eden_adi === 'string' ? k.platform_beyan_eden_adi : null;
  const t = k.platform_beyan_tarihi;
  const tarih = t instanceof Date ? t.toISOString() : typeof t === 'string' ? new Date(t).toISOString() : null;
  return { beyanEden: eden && ad ? { id: eden, ad } : null, tarih };
}

/** `workspace_kurulum.kullanilmayan_platformlar` → tipli liste; tanınmayan değer atılır. */
export function kullanilmayanOku(k: Record<string, unknown>): KurulumPlatformu[] {
  const ham = k.kullanilmayan_platformlar;
  if (!Array.isArray(ham)) return [];
  return KURULUM_PLATFORMLARI.filter((p) => ham.includes(p));
}

/**
 * KULLANILMAYAN PLATFORMLARIN KURULUM ADIMLARI — panelin tek listesinden
 * (`KURULUM_LISTESI`) TÜRETİLİYOR. Adım→platform eşlemesini burada ikinci
 * kez yazmak, panel "kullanılmıyor" derken sunucunun aynı adımı yapması
 * demekti (ya da tersi). Eşleme `eksikleriTamamlaKapsami` ile AYNI kural:
 * platformlu adımın bütün kurulum parçaları + platformsuz adımda platformu
 * işaretli parçalar (Google Ads dönüşümü, Analytics ↔ Ads bağı).
 */
export function kullanilmayanAdimlar(kullanilmayanlar: readonly KurulumPlatformu[]): Set<KurulumAdimKodu> {
  const atla = new Set<KurulumAdimKodu>();
  for (const a of KURULUM_LISTESI) {
    for (const p of a.parcalar as ReadonlyArray<{ kaynak: string; kod: string; platform?: KurulumPlatformu }>) {
      if (p.kaynak !== 'kurulum') continue;
      const platform = a.platform ?? p.platform;
      if (platform && kullanilmayanlar.includes(platform)) atla.add(p.kod as KurulumAdimKodu);
    }
  }
  return atla;
}

/** Silinecek etiketler: YALNIZ bizim ön ekli ve planda olmayanlar. */
export function silinecekEtiketler<T extends { name: string }>(varolan: readonly T[], plan: ReadonlySet<string>): T[] {
  return varolan.filter((x) => x.name.startsWith(ON_EK) && !plan.has(x.name));
}
