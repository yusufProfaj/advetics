import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  formatMoney,
  kitleOzeti,
  metaPresetSettingsSchema,
  restrictTargetingFor,
  type DegisiklikIzi,
  type SpecialAdCategory,
  type TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { AuditService } from '../audit/audit.service';
import { BoostsService } from '../boosts/boosts.service';
import { isInstagramProfile } from '../boosts/instagram-boost-guard';
import { metaTargetingFrom } from '../boosts/meta-targeting';
import { izli, karsilastir, platformDegeriMetni, type UygulamaEylemi } from '../campaign-actions/campaign-actions.service';
import { ConnectionsService } from '../connections/connections.service';
import { ProviderRegistry } from '../connections/provider.registry';
import type { FetchContext, IAdPlatformProvider, PlatformVarlikDurumu } from '../connections/provider.types';
import { boostHedefiParametreleri } from '../connections/providers/meta.provider';
import { TokenVaultService } from '../connections/token-vault.service';
import { metaSurumuDogrula } from '../reklam/meta-graf';
import { metaAsgariOku, metaErisimTahminiOku } from '../reklam/rehber/platform-okuma';
import { metaYazmaAcikMi } from '../reklam/yazma-kapisi';
import { KitleSablonuService } from '../tenancy/kitle-sablonu.service';
import {
  boostOnayOzeti,
  boostSecimiCoz,
  boostYonetimOzeti,
  hedefYuzeyeUyarMi,
  onizlemeKodu,
  taahhut,
  ustSinirDenetle,
  type BoostKitleGirdisi,
  type BoostOnAyari,
  type BoostSecimi,
} from './mcp-boost';
import { AracArgumanHatasi } from './okuma-araclari';

const logger = new Logger('McpBoostService');

/** `boost_onizle` / `boost_olustur` argümanının süzülmüş hâli. */
export interface BoostArgumani {
  workspace_id: string;
  gonderi_id: string;
  hedef?: BoostSecimi['hedef'];
  hedef_adres?: string;
  kitle?: BoostKitleGirdisi;
  butce?: { tip: 'gunluk' | 'toplam'; tutar_micros: string };
  sure_gun?: number;
  on_ayar_kullan?: boolean;
}

export type BoostYonetimIslemi = 'baslat' | 'duraklat' | 'butce';

interface GonderiSatiri {
  id: string;
  social_profile_id: string;
  social_profile_name: string;
  profile_type: string;
  linked_ad_account_id: string | null;
  external_id: string;
  media_type: string;
  message: string | null;
  permalink: string | null;
  published_at: Date;
}

interface HesapSatiri {
  id: string;
  ad: string;
  external_id: string;
  currency: string;
  connection_id: string;
  baglanti_durumu: string;
  granted_scopes: string[] | null;
  ozel_kategoriler: string[] | null;
}

interface BoostSatiri {
  id: string;
  status: string;
  external_campaign_id: string | null;
  external_ad_set_id: string | null;
  target_campaign_external_id: string | null;
  duraklatilmis_kur: boolean;
  yayin_baslangici: Date | null;
  duration_days: number;
  budget_mode: string;
  daily_budget_micros: string | null;
  total_budget_micros: string | null;
  hedef: string;
  hesap_id: string;
  hesap_adi: string;
  hesap_dis: string;
  currency: string;
  connection_id: string;
  baglanti_durumu: string;
  granted_scopes: string[] | null;
  sayfa: string;
  mesaj: string | null;
}

/** Hazırlanmış boost: önizlemenin ve onay satırının ortak çıktısı. */
export interface HazirBoost {
  secim: BoostSecimi;
  targeting: Record<string, unknown> | null;
  savedAudienceId: string | null;
  kod: string;
  ozet: string[];
  uyarilar: string[];
  taahhutMicros: bigint;
  paraBirimi: string;
  yuzey: 'facebook_page' | 'instagram';
}

/**
 * ═══ MCP BOOST SERVİSİ (`docs/okuma-api/MCP-BOOST-MIMARI.md`) ═══
 *
 * İKİNCİ BİR YAYIN YOLU YOK: kurulum `BoostsService.mcpBoostAc` (panelin
 * elle boost'uyla aynı engel kontrolü, ağaç ve yürütücü), yönetim
 * sağlayıcının `applyAction` / `durumOku`su (İyileştir'in kullandığı).
 * Burada olan: girdiyi çözmek, Meta'dan önizleme okumak (kitle büyüklüğü,
 * asgari bütçe, kayıtlı kitle) ve boost satırından yönetim hedefini bulmak.
 *
 * Bütün yollar çağıranın verdiği WORKSPACE bağlamıyla (`McpYazmaService
 * .workspace`): izin ve kapsam orada denetlendi.
 */
@Injectable()
export class McpBoostService {
  private readonly metaSurumu: ReturnType<typeof metaSurumuDogrula>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly boosts: BoostsService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
    private readonly kitleler: KitleSablonuService,
    private readonly connections: ConnectionsService,
    private readonly audit: AuditService,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.metaSurumu = metaSurumuDogrula(config.platforms.meta.apiVersion);
  }

  private tx<T>(ctx: TenantContext, fn: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.withTenant(ctx, fn);
  }

  // ---------------------------------------------------------------------------
  // Okuma
  // ---------------------------------------------------------------------------

  /** Boost edilebilir gönderiler: panelin listesi, model için kısaltılmış. */
  async gonderiler(ctx: TenantContext, w: string, sayfaId: string | null, limit: number): Promise<unknown> {
    const l = await this.boosts.listBoostablePosts(ctx, { clientId: w, limit, ...(sayfaId ? { socialProfileId: sayfaId } : {}) });
    return {
      gonderiler: l.items.map((p) => ({
        id: p.id,
        sayfa: p.socialProfileName,
        sayfaId: p.socialProfileId,
        yuzey: isInstagramProfile(p.profileType) ? 'instagram' : 'facebook',
        tarih: p.publishedAt,
        metin: p.message ? (p.message.length > 280 ? `${p.message.slice(0, 279)}…` : p.message) : null,
        medyaTuru: p.mediaType,
        gorsel: p.thumbnailUrl,
        baglanti: p.permalink,
        etkilesim: { erisim: p.reach, begeni: p.likes, yorum: p.comments, paylasim: p.shares, kaydetme: p.saves, videoIzlenme: p.videoViews, oran: p.engagementRate },
        // ENGEL SATIRDA, gizlenmiyor: model neden boost edilemeyeceğini söylesin.
        boostEdilemez: p.blockedReason,
        uyari: p.warning,
        onAyarHazir: p.presetReady,
      })),
      gosterilen: l.items.length,
      toplam: l.total,
      bosNedeni: l.emptyReason,
    };
  }

  /** Workspace'in boost'ları; toplam ayrıca (sessiz kesme yok). */
  async liste(ctx: TenantContext, w: string, limit: number): Promise<unknown> {
    const rows = await this.tx(ctx, (t) =>
      t.$queryRaw<
        Array<{
          id: string;
          status: string;
          hedef: string;
          duraklatilmis_kur: boolean;
          yayin_baslangici: Date | null;
          budget_mode: string;
          daily_budget_micros: string | null;
          total_budget_micros: string | null;
          duration_days: number;
          external_campaign_id: string | null;
          error: string | null;
          created_at: Date;
          kural: boolean;
          sayfa: string;
          mesaj: string | null;
          permalink: string | null;
          currency: string;
          toplam: number;
        }>
      >(Prisma.sql`
        SELECT b.id::text, b.status, b.hedef, b.duraklatilmis_kur, b.yayin_baslangici, b.budget_mode,
               b.daily_budget_micros::text, b.total_budget_micros::text, b.duration_days,
               b.external_campaign_id, b.error, b.created_at, (b.boost_rule_id IS NOT NULL) AS kural,
               sp.name AS sayfa, p.message AS mesaj, p.permalink, a.currency,
               COUNT(*) OVER ()::int AS toplam
          FROM boosts b
          JOIN organic_posts p ON p.id = b.organic_post_id
          JOIN social_profiles sp ON sp.id = p.social_profile_id
          JOIN ad_accounts a ON a.id = b.ad_account_id
         WHERE b.client_id = ${w}::uuid
         ORDER BY b.created_at DESC
         LIMIT ${limit}`),
    );
    return {
      boostlar: rows.map((r) => ({
        id: r.id,
        durum: r.status,
        platformda: platformDurumMetni(r.status, r.duraklatilmis_kur, r.yayin_baslangici),
        hedef: r.hedef,
        kaynak: r.kural ? 'kural' : 'elle',
        sayfa: r.sayfa,
        gonderi: r.mesaj ? r.mesaj.slice(0, 120) : null,
        baglanti: r.permalink,
        butce:
          r.budget_mode === 'lifetime'
            ? `${formatMoney(r.total_budget_micros, r.currency)} toplam`
            : `${formatMoney(r.daily_budget_micros, r.currency)} / gün`,
        sureGun: r.duration_days,
        yayinBaslangici: r.yayin_baslangici?.toISOString() ?? null,
        metaKampanyaKimligi: r.external_campaign_id,
        hata: r.error,
        olusturulma: r.created_at.toISOString(),
      })),
      gosterilen: rows.length,
      toplam: rows[0]?.toplam ?? 0,
    };
  }

  /**
   * Tek boost'un Meta'daki ANLIK hâli: kampanya ve ad set durumu, bütçe.
   * Aynadan değil platformdan: duraklatılmış kurulumda ayna kampanyayı
   * henüz görmemiş olabilir ve "yayında mı" sorusunun cevabı tahmin olurdu.
   */
  async durum(ctx: TenantContext, w: string, boostId: string): Promise<unknown> {
    const b = await this.boostAl(ctx, w, boostId);
    const temel = {
      id: b.id,
      durum: b.status,
      platformda: platformDurumMetni(b.status, b.duraklatilmis_kur, b.yayin_baslangici),
      hedef: b.hedef,
      sayfa: b.sayfa,
      hesap: `${b.hesap_adi} (${b.hesap_dis})`,
      metaKampanyaKimligi: b.external_campaign_id,
    };
    if (!b.external_campaign_id || !b.external_ad_set_id) {
      return { ...temel, canli: null, not: 'Boost platformda kurulmamış (durumu ve hatası yukarıda).' };
    }
    const { provider, fctx } = await this.metaBaglami(b.connection_id, b.hesap_dis, b.hesap_id, 'interactive');
    const oku = (level: 'campaign' | 'ad_group', id: string) =>
      provider.durumOku(fctx, { level, externalId: id, currency: b.currency }).catch((e: unknown) => ({ hata: e instanceof Error ? e.message : String(e) }));
    const kampanya = await oku('campaign', b.external_campaign_id);
    const adSet = await oku('ad_group', b.external_ad_set_id);
    const butce = 'hata' in adSet ? null : b.budget_mode === 'lifetime' ? adSet.lifetimeBudgetMicros : adSet.dailyBudgetMicros;
    return {
      ...temel,
      canli: {
        kampanya: 'hata' in kampanya ? `okunamadı: ${kampanya.hata}` : kampanya.hamDurum,
        reklamSeti: 'hata' in adSet ? `okunamadı: ${adSet.hata}` : adSet.hamDurum,
        butce: butce === null ? 'okunamadı' : `${formatMoney(butce.toString(), b.currency)} ${b.budget_mode === 'lifetime' ? 'toplam' : '/ gün'}`,
      },
      not: 'Harcama ve sonuçlar için metrik_ozeti / varlik_kirilimi (yapı taraması kampanyayı gördükten sonra).',
    };
  }

  /** Advetics kayıtlı kitleleri (+ istenirse Meta'daki kayıtlı kitleler). */
  async kitleListesi(ctx: TenantContext, w: string, hesapId: string | null): Promise<unknown> {
    const l = await this.kitleler.list(ctx, w);
    const advetics = l.items.map((k) => ({
      id: k.id,
      platform: k.platform,
      ad: k.name,
      ozet: kitleOzeti(k),
      varsayilan: k.varsayilan,
      // Başka hesabın özel kitlesi boost'ta engel: model seçmeden görsün.
      ozelKitleHesaplari: [...new Set(k.ozelKitleler.map((o) => o.hesapId))],
    }));
    let meta: unknown = null;
    if (hesapId) {
      await this.metaHesabi(ctx, w, hesapId);
      const m = await this.connections.listSavedAudiences(ctx, hesapId);
      meta = { kitleler: m.items, toplam: m.total, ...(m.total === 0 ? { bosNedeni: 'Bu hesapta Ads Manager\'da kayıtlı kitle yok.' } : {}) };
    }
    return { kayitliKitleler: advetics, toplam: advetics.length, metaKayitliKitleleri: meta };
  }

  async konumAra(ctx: TenantContext, w: string, hesapId: string | null, q: string): Promise<unknown> {
    const h = await this.metaHesabi(ctx, w, hesapId);
    const sonuc = await this.connections.searchGeoLocations(ctx, h, q);
    return {
      sonuclar: sonuc.map((s) => ({ key: s.key, type: s.type, ad: s.label, ulke: s.countryCode })),
      toplam: sonuc.length,
      ...(sonuc.length === 0 ? { bosNedeni: `Meta "${q}" için konum döndürmedi; yazımı değiştir (ör. il adı yalnız).` } : {}),
      not: 'Rehberde konumlar: [{"tur": type, "key": key, "etiket": ad, "ulkeKodu": ulke}]; boost kitlesinde: [{"key", "type", "ad"}].',
    };
  }

  async ilgiAra(ctx: TenantContext, w: string, hesapId: string | null, q: string): Promise<unknown> {
    const h = await this.metaHesabi(ctx, w, hesapId);
    const sonuc = await this.connections.searchInterests(ctx, h, q);
    return {
      sonuclar: sonuc.map((s) => ({ id: s.id, ad: s.name, yol: s.path.join(' > '), kitleAlt: s.audienceMin, kitleUst: s.audienceMax })),
      toplam: sonuc.length,
      ...(sonuc.length === 0 ? { bosNedeni: `Meta "${q}" için ilgi alanı döndürmedi.` } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Önizleme ve kurulum
  // ---------------------------------------------------------------------------

  /**
   * ÖNİZLEME: hiçbir şey açmaz. Onay satırı da aynı fonksiyondan geçer
   * (`McpYazmaService`), yani kullanıcının gördüğü özet ile onayladığı özet
   * aynı koddan çıkıyor.
   */
  async hazirla(ctx: TenantContext, wsAd: string, a: BoostArgumani, ustSinir: bigint | null): Promise<HazirBoost> {
    const w = a.workspace_id;
    const post = await this.tx(ctx, (t) => this.boosts.gonderiyiOkuVeDogrula(t, a.gonderi_id, w)) as unknown as GonderiSatiri;
    const yuzey: 'facebook_page' | 'instagram' = isInstagramProfile(post.profile_type) ? 'instagram' : 'facebook_page';
    const hesap = await this.hesapSatiri(ctx, w, post.linked_ad_account_id!);

    const secim = boostSecimiCoz(a, await this.onAyar(ctx, w, post.social_profile_id));
    const yuzeyHatasi = hedefYuzeyeUyarMi(secim.hedef, yuzey);
    if (yuzeyHatasi) throw new AracArgumanHatasi(yuzeyHatasi);

    // ERKEN RET, ASIL KAPI DEĞİL: yürütücü bağlantıyı, izni ve kotayı yeniden soruyor.
    const provider = this.providers.get('meta');
    if (hesap.baglanti_durumu !== 'active') throw new AracArgumanHatasi(`Meta bağlantısı etkin değil (${hesap.baglanti_durumu}); panelden yeniden bağlanmalı.`);
    const yazma = provider.canWrite(hesap.granted_scopes ?? []);
    if (!yazma.ok) throw new AracArgumanHatasi(`Meta yazma izni yok: ${yazma.missing.join(', ')}.`);
    const salter = await metaYazmaAcikMi((fn) => this.tx(ctx, fn), w);
    if (!salter.acik) throw new AracArgumanHatasi(salter.sebep);

    const fctx: FetchContext = { accessToken: await this.vault.getAccessToken(hesap.connection_id, provider), accountExternalId: hesap.external_id };
    const act = hesap.external_id.startsWith('act_') ? hesap.external_id : `act_${hesap.external_id}`;

    // KİTLE → Meta hedeflemesi (TEK üreticiden: `metaTargetingFrom`).
    let targeting: Record<string, unknown> | null = null;
    let savedAudienceId: string | null = null;
    let tahminHedeflemesi: Record<string, unknown> | null = null;
    let kitleMetni: string;
    if (secim.kitle.tur === 'kayitli') {
      const id = secim.kitle.id;
      const k = (await this.kitleler.list(ctx, w)).items.find((x) => x.id === id);
      if (!k) throw new AracArgumanHatasi('Kayıtlı kitle bu workspace\'te yok; kimliği `kitleler` aracından al.');
      if (k.platform !== 'meta') throw new AracArgumanHatasi(`"${k.name}" bir Google kitlesi; boost Meta kitlesi ister.`);
      const yabanci = k.ozelKitleler.filter((o) => o.hesapId !== hesap.id);
      if (yabanci.length) {
        throw new AracArgumanHatasi(
          `"${k.name}" başka bir reklam hesabının özel kitlesini içeriyor (${yabanci.map((o) => o.hesapAdi).join(', ')}); boost ${hesap.ad} hesabından çıkıyor ve Meta o kitleyi bu hesapta tanımaz.`,
        );
      }
      targeting = metaTargetingFrom({ locations: k.locations, ageMin: k.ageMin, ageMax: k.ageMax, genders: k.genders, interests: k.interests, ozelKitleler: k.ozelKitleler });
      tahminHedeflemesi = targeting;
      kitleMetni = `${k.name}: ${kitleOzeti(k)}`;
    } else if (secim.kitle.tur === 'meta_kayitli') {
      savedAudienceId = secim.kitle.id;
      // YAYIN ANINDA DA OKUNUYOR (yürütücü); burada okumak "yok" olanı onaydan ÖNCE söylüyor.
      tahminHedeflemesi = await provider.getSavedAudienceTargeting(fctx, savedAudienceId);
      if (!tahminHedeflemesi) throw new AracArgumanHatasi('Meta kayıtlı kitlesi bulunamadı ya da hedeflemesi boş; Ads Manager\'da kontrol et.');
      kitleMetni = `Meta kayıtlı kitlesi ${savedAudienceId} (tanımı Meta'da; yayında yeniden okunur)`;
    } else {
      targeting = metaTargetingFrom(secim.kitle.girdi);
      tahminHedeflemesi = targeting;
      const g = secim.kitle.girdi;
      // ADSIZ KONUM ANAHTARIYLA yazılıyor ve SÖYLENİYOR: özette "Konum 2343687"
      // gören kullanıcı neyi onayladığını bilmez; model `konum_ara`daki adı vermeli.
      kitleMetni = kitleOzeti({ ...g, locations: g.locations.map((l) => ({ ...l, label: l.label ?? `adı verilmemiş konum ${l.key}`, countryCode: null })) });
    }

    const uyarilar: string[] = [];
    const kategoriler = (hesap.ozel_kategoriler ?? []) as SpecialAdCategory[];
    const { removed } = restrictTargetingFor(kategoriler, tahminHedeflemesi);
    if (removed.length) uyarilar.push(`Özel reklam kategorisi (${kategoriler.join(', ')}) yüzünden Meta'ya gitmeyecek: ${removed.join(', ')}.`);

    // ASGARİ BÜTÇE: günlükte altı ENGEL (Meta reddeder), toplamda günlük ortalaması altıysa uyarı.
    const toplam = taahhut(secim.butce, secim.sureGun);
    if (hesap.currency === 'TRY' && secim.butce.kip === 'lifetime' && toplam < 20_000_000n) {
      throw new AracArgumanHatasi('Toplam bütçe en az 20 ₺: daha küçük bütçeli boost dağıtım almıyor.');
    }
    let asgari: string | null = null;
    try {
      asgari = await metaAsgariOku(this.metaSurumu, act, fctx.accessToken, hesap.currency);
    } catch (e) {
      logger.warn(`Meta asgari bütçe okunamadı (${act}): ${e instanceof Error ? e.message : String(e)}`);
    }
    const gunluk = secim.butce.kip === 'daily' ? secim.butce.micros : secim.butce.micros / BigInt(secim.sureGun);
    if (asgari === null) uyarilar.push('Meta\'nın bu hesaptaki asgari günlük bütçesi okunamadı; çok düşük bütçeyi Meta kurulumda reddedebilir.');
    else if (gunluk < BigInt(asgari)) {
      const metin = `Günlük ${formatMoney(gunluk.toString(), hesap.currency)}, Meta'nın bu hesaptaki asgarisinin (${formatMoney(asgari, hesap.currency)}) altında`;
      if (secim.butce.kip === 'daily') throw new AracArgumanHatasi(`${metin}; Meta reddeder. Günlük bütçeyi artır.`);
      uyarilar.push(`${metin}; toplam bütçeyi artır ya da süreyi kısalt.`);
    }

    ustSinirDenetle(toplam, ustSinir, hesap.currency);

    // KİTLE BÜYÜKLÜĞÜ: okunamazsa sebebiyle; "0 kişi" uydurulmuyor.
    let kitleBuyuklugu: { alt: number; ust: number } | { okunamadi: string };
    try {
      const k = this.quota.isEnabled ? await this.quota.acquire({ platform: 'meta', adAccountId: hesap.id, layer: 'interactive' }) : { allowed: true };
      kitleBuyuklugu = k.allowed
        ? await metaErisimTahminiOku(this.metaSurumu, act, fctx.accessToken, tahminHedeflemesi)
        : { okunamadi: 'Meta kotası şu an dolu' };
    } catch (e) {
      kitleBuyuklugu = { okunamadi: e instanceof Error ? e.message : String(e) };
    }

    const harcama = await this.boosts.spendSummary(ctx, w);
    const ozet = boostOnayOzeti({
      workspaceAdi: wsAd,
      gonderi: { yuzey, sayfa: post.social_profile_name, tarih: post.published_at.toISOString(), metin: post.message, baglanti: post.permalink, medyaTuru: post.media_type },
      hesap: { ad: hesap.ad, disKimlik: act, paraBirimi: hesap.currency },
      secim,
      kitleMetni,
      ozelKategoriler: kategoriler,
      kitleBuyuklugu,
      buAyTaahhut: { micros: harcama.committedThisMonthMicros, aylikButce: harcama.monthlyBudgetMicros },
    });
    if (harcama.monthlyBudgetMicros && BigInt(harcama.committedThisMonthMicros) + toplam > BigInt(harcama.monthlyBudgetMicros)) {
      uyarilar.push('Bu boost ile bu ayın boost taahhüdü workspace\'in aylık bütçesini aşıyor.');
    }
    return {
      secim,
      targeting,
      savedAudienceId,
      kod: onizlemeKodu({ workspaceId: w, gonderiId: a.gonderi_id, secim, targeting }),
      ozet: [...ozet, ...uyarilar.map((u) => `UYARI: ${u}`)],
      uyarilar,
      taahhutMicros: toplam,
      paraBirimi: hesap.currency,
      yuzey,
    };
  }

  /** ONAYDAN SONRA kurulum. Hazırlık yeniden koşar: 15 dakikada kitle ya da ön ayar değişmiş olabilir. */
  async kur(ctx: TenantContext, h: HazirBoost, a: BoostArgumani): Promise<{ basarili: boolean; sonuc: unknown; hata: string | null }> {
    const r = await this.boosts.mcpBoostAc(ctx, {
      clientId: a.workspace_id,
      organicPostId: a.gonderi_id,
      hedef: h.secim.hedef,
      hedefAdres: h.secim.hedefAdres,
      butce: h.secim.butce,
      durationDays: h.secim.sureGun,
      targeting: h.targeting,
      savedAudienceId: h.savedAudienceId,
      // AMAÇ EŞLEMEDEN, sağlayıcıyla AYNI fonksiyon: ağaçtaki amaç ile Meta'ya giden ayrışmasın.
      objective: boostHedefiParametreleri(h.secim.hedef, h.yuzey, h.secim.hedefAdres).objective,
      neden: `MCP ile öne çıkarıldı (${h.secim.hedef}) — onay özeti Denetim kaydında`,
    });
    const geri = r.hedefGeriOkuma;
    const uyustu = !geri || geri.uyustu;
    return {
      basarili: uyustu,
      sonuc: {
        boostId: r.boost.id,
        metaKampanyaKimligi: r.boost.externalCampaignId,
        metaReklamKimligi: r.boost.externalAdId,
        durum: 'DURAKLATILMIŞ: harcama yok. Başlatmak için boost_baslat (ayrı onay).',
        ...(geri ? { hedefGeriOkuma: geri } : {}),
      },
      hata: uyustu
        ? null
        : `Boost duraklatılmış kuruldu ama Meta'dan geri okunan hedef istenenle uyuşmadı (${geri?.optimizationGoal ?? '?'} / ${geri?.destinationType ?? '?'}${geri?.hata ? `; ${geri.hata}` : ''}). Başlatmadan önce Ads Manager'da kontrol et.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Yönetim: başlat / duraklat / bütçe
  // ---------------------------------------------------------------------------

  /**
   * YÖNETİM HEDEFİ. Boost kendi kampanyasını açtıysa kampanya; panelden var
   * olan bir kampanyanın altına eklendiyse (K21) REKLAM SETİ: paylaşılan
   * kampanyayı durdurmak başka gönderilerin boost'unu da durdururdu.
   * Bütçe her zaman reklam setinde (boost bütçesi orada).
   */
  private seviye(b: BoostSatiri): { level: 'campaign' | 'ad_group'; externalId: string; ad: 'kampanya' | 'reklam seti' } {
    if (!b.external_campaign_id || !b.external_ad_set_id) throw new AracArgumanHatasi('Boost platformda kurulmamış; yönetilecek bir şey yok.');
    return b.target_campaign_external_id
      ? { level: 'ad_group', externalId: b.external_ad_set_id, ad: 'reklam seti' }
      : { level: 'campaign', externalId: b.external_campaign_id, ad: 'kampanya' };
  }

  /** Onay özeti: platformdaki ŞU ANKİ hâl okunur (aynadan değil). */
  async yonetimHazirla(
    ctx: TenantContext,
    w: string,
    wsAd: string,
    boostId: string,
    islem: BoostYonetimIslemi,
    yeniMicros: bigint | null,
    ustSinir: bigint | null,
  ): Promise<string[]> {
    const b = await this.yonetilebilir(ctx, w, boostId, islem);
    const s = this.seviye(b);
    const { provider, fctx } = await this.metaBaglami(b.connection_id, b.hesap_dis, b.hesap_id, 'interactive');
    const durum = await provider.durumOku(fctx, { level: s.level, externalId: s.externalId, currency: b.currency }).catch(() => null);
    const kip: 'daily' | 'lifetime' = b.budget_mode === 'lifetime' ? 'lifetime' : 'daily';
    let butce;
    if (islem === 'butce') {
      if (yeniMicros === null || yeniMicros <= 0n) throw new AracArgumanHatasi('Yeni bütçe sıfırdan büyük olmalı.');
      ustSinirDenetle(taahhut({ kip, micros: yeniMicros }, b.duration_days), ustSinir, b.currency);
      const adSet = await provider.durumOku(fctx, { level: 'ad_group', externalId: b.external_ad_set_id!, currency: b.currency }).catch(() => null);
      const eski = adSet ? (kip === 'lifetime' ? adSet.lifetimeBudgetMicros : adSet.dailyBudgetMicros) : null;
      butce = { kip, eski: eski?.toString() ?? null, yeni: yeniMicros, paraBirimi: b.currency, sureGun: b.duration_days };
    }
    const zaman = islem === 'baslat' ? yenidenZamanlama(b, new Date()) : null;
    return boostYonetimOzeti({
      islem,
      workspaceAdi: wsAd,
      boostAdi: `${b.sayfa} · "${(b.mesaj ?? '(metinsiz)').replace(/\s+/g, ' ').slice(0, 60)}"`,
      hesap: `${b.hesap_adi} (${b.hesap_dis})`,
      seviye: s.ad,
      simdikiDurum: durum ? durum.hamDurum || durum.status : 'okunamadı',
      ...(butce ? { butce } : {}),
      yenidenZamanlama: zaman ? { baslangic: zaman.baslangic.toISOString().slice(0, 16).replace('T', ' '), bitis: zaman.bitis.toISOString().slice(0, 16).replace('T', ' ') } : null,
    });
  }

  /**
   * UYGULA: kota → (başlatmada gerekiyorsa yeniden zamanla) → yaz → GERİ
   * OKU → yalnız doğrulandıysa boost satırını güncelle → denetim. "Uyuşmadı"
   * başarı değil ("200 döndü doğrulama değil").
   */
  async yonetimUygula(
    ctx: TenantContext,
    w: string,
    boostId: string,
    islem: BoostYonetimIslemi,
    yeniMicros: bigint | null,
    iz: DegisiklikIzi,
  ): Promise<{ basarili: boolean; sonuc: unknown; hata: string | null }> {
    const b = await this.yonetilebilir(ctx, w, boostId, islem);
    const s = this.seviye(b);
    const { provider, fctx } = await this.metaBaglami(b.connection_id, b.hesap_dis, b.hesap_id, 'rule_action');
    const kip: 'daily' | 'lifetime' = b.budget_mode === 'lifetime' ? 'lifetime' : 'daily';
    const eylem: UygulamaEylemi =
      islem === 'baslat' ? { type: 'resume' } : islem === 'duraklat' ? { type: 'pause' } : { type: 'set_budget', amountMicros: yeniMicros!, budgetMode: kip };

    const zaman = islem === 'baslat' ? yenidenZamanlama(b, new Date()) : null;
    if (zaman) await provider.boostZamanla(fctx, b.external_ad_set_id!, zaman.baslangic, zaman.bitis);

    const hedef = eylem.type === 'set_budget' ? { level: 'ad_group' as const, externalId: b.external_ad_set_id! } : { level: s.level, externalId: s.externalId };
    await provider.applyAction(
      fctx,
      eylem.type === 'set_budget'
        ? { type: 'set_budget', level: 'ad_group', externalId: hedef.externalId, amountMicros: eylem.amountMicros, budgetMode: kip, currency: b.currency }
        : { type: eylem.type, level: hedef.level, externalId: hedef.externalId },
    );
    let okunan: PlatformVarlikDurumu | null = null;
    let okumaHatasi: string | null = null;
    try {
      okunan = await provider.durumOku(fctx, { level: hedef.level, externalId: hedef.externalId, currency: b.currency });
    } catch (e) {
      okumaHatasi = e instanceof Error ? e.message : String(e);
    }
    const dogrulama = okunan ? karsilastir(eylem, okunan) : 'uyusmadi';
    const platformDegeri = okunan ? platformDegeriMetni(eylem, okunan, b.currency) : `Platformdan geri okunamadı: ${okumaHatasi}`;

    await this.tx(ctx, async (t) => {
      if (dogrulama === 'dogrulandi') {
        if (islem === 'baslat') {
          // İLK BAŞLATMA ANI kalıcı: yeniden başlatma bitiş taramasının saatini kaydırmasın.
          await t.$executeRaw(Prisma.sql`UPDATE boosts SET yayin_baslangici = COALESCE(yayin_baslangici, now()), updated_at = now() WHERE id = ${b.id}::uuid`);
        } else if (islem === 'butce') {
          const kolon = Prisma.raw(kip === 'lifetime' ? 'total_budget_micros' : 'daily_budget_micros');
          await t.$executeRaw(Prisma.sql`UPDATE boosts SET ${kolon} = ${yeniMicros!}::bigint, updated_at = now() WHERE id = ${b.id}::uuid`);
        }
      }
      await this.audit.record(t, ctx, {
        action: `boost.${islem}`,
        targetType: 'boost',
        targetId: b.id,
        clientId: w,
        before: { durum: b.status, butce: kip === 'lifetime' ? b.total_budget_micros : b.daily_budget_micros },
        after: izli(
          {
            istenen: eylem.type === 'set_budget' ? { amountMicros: eylem.amountMicros.toString(), budgetMode: kip } : { type: eylem.type },
            seviye: hedef.level,
            metaKimligi: hedef.externalId,
            ...(zaman ? { yenidenZamanlama: { baslangic: zaman.baslangic.toISOString(), bitis: zaman.bitis.toISOString() } } : {}),
            dogrulama,
            platformDegeri,
          },
          iz,
        ) as Prisma.InputJsonValue,
      });
    });
    return {
      basarili: dogrulama === 'dogrulandi',
      sonuc: { boostId: b.id, seviye: hedef.level, dogrulama, platformDegeri, ...(zaman ? { yeniTakvim: { baslangic: zaman.baslangic.toISOString(), bitis: zaman.bitis.toISOString() } } : {}) },
      hata: dogrulama === 'dogrulandi' ? null : `Platformdan geri okunan değer istenenle uyuşmadı: ${platformDegeri}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private async yonetilebilir(ctx: TenantContext, w: string, boostId: string, islem: BoostYonetimIslemi): Promise<BoostSatiri> {
    const b = await this.boostAl(ctx, w, boostId);
    if (b.status !== 'active') {
      throw new AracArgumanHatasi(
        b.status === 'completed'
          ? 'Boost\'un süresi doldu; yeniden öne çıkarmak için yeni boost aç.'
          : `Boost platformda yönetilebilir durumda değil (durum: ${b.status}).`,
      );
    }
    if (b.baglanti_durumu !== 'active') throw new AracArgumanHatasi(`Meta bağlantısı etkin değil (${b.baglanti_durumu}).`);
    const provider = this.providers.get('meta');
    const yazma = provider.canWrite(b.granted_scopes ?? []);
    if (!yazma.ok) throw new AracArgumanHatasi(`Meta yazma izni yok: ${yazma.missing.join(', ')}.`);
    // ACİL ŞALTER: durdurmak da bir yazma; ajans "Meta'ya yazma" dediyse hiçbiri gitmiyor (İyileştir'le aynı kural).
    const salter = await metaYazmaAcikMi((fn) => this.tx(ctx, fn), w);
    if (!salter.acik) throw new AracArgumanHatasi(salter.sebep);
    if (islem === 'butce' && b.budget_mode !== 'lifetime' && b.budget_mode !== 'daily') throw new AracArgumanHatasi('Boost\'un bütçe kipi okunamadı.');
    return b;
  }

  private async boostAl(ctx: TenantContext, w: string, boostId: string): Promise<BoostSatiri> {
    const [b] = await this.tx(ctx, (t) =>
      t.$queryRaw<BoostSatiri[]>(Prisma.sql`
        SELECT b.id::text, b.status, b.external_campaign_id, b.external_ad_set_id, b.target_campaign_external_id,
               b.duraklatilmis_kur, b.yayin_baslangici, b.duration_days, b.budget_mode,
               b.daily_budget_micros::text, b.total_budget_micros::text, b.hedef,
               a.id::text AS hesap_id, a.name AS hesap_adi, a.external_id AS hesap_dis, a.currency,
               a.connection_id::text, c.status::text AS baglanti_durumu, c.granted_scopes,
               sp.name AS sayfa, p.message AS mesaj
          FROM boosts b
          JOIN ad_accounts a ON a.id = b.ad_account_id
          JOIN platform_connections c ON c.id = a.connection_id
          JOIN organic_posts p ON p.id = b.organic_post_id
          JOIN social_profiles sp ON sp.id = p.social_profile_id
         WHERE b.id = ${boostId}::uuid AND b.client_id = ${w}::uuid`),
    );
    if (!b) throw new AracArgumanHatasi('Boost bu workspace\'te yok; kimliği `boostlar` aracından al.');
    return b;
  }

  private async hesapSatiri(ctx: TenantContext, w: string, hesapId: string): Promise<HesapSatiri> {
    const [h] = await this.tx(ctx, (t) =>
      t.$queryRaw<HesapSatiri[]>(Prisma.sql`
        SELECT a.id::text, a.name AS ad, a.external_id, a.currency, a.connection_id::text,
               c.status::text AS baglanti_durumu, c.granted_scopes, cl.special_ad_categories AS ozel_kategoriler
          FROM ad_accounts a
          JOIN platform_connections c ON c.id = a.connection_id
          JOIN clients cl ON cl.id = ${w}::uuid
         WHERE a.id = ${hesapId}::uuid`),
    );
    if (!h) throw new AracArgumanHatasi('Sayfanın boost hesabı okunamadı (atama kalkmış olabilir).');
    return h;
  }

  /**
   * Workspace'in Meta hesabı. Verilmezse TEK Meta hesabı varsa o; birden
   * çoksa hangisi olduğu tahmin edilmiyor, liste hatada.
   */
  private async metaHesabi(ctx: TenantContext, w: string, hesapId: string | null): Promise<string> {
    const hesaplar = await this.tx(ctx, (t) =>
      t.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
        SELECT id::text, name FROM ad_accounts WHERE client_id = ${w}::uuid AND platform = 'meta' ORDER BY name`),
    );
    if (hesapId) {
      if (!hesaplar.some((h) => h.id === hesapId)) throw new AracArgumanHatasi('Bu Meta hesabı bu workspace\'e atanmış değil; `yazma_durumu` hesaplar listesinden al.');
      return hesapId;
    }
    if (hesaplar.length === 1) return hesaplar[0]!.id;
    if (hesaplar.length === 0) throw new AracArgumanHatasi('Bu workspace\'e atanmış Meta reklam hesabı yok.');
    throw new AracArgumanHatasi(`Workspace'te ${hesaplar.length} Meta hesabı var; reklam_hesabi_id ver: ${hesaplar.map((h) => `${h.name} (${h.id})`).join(', ')}.`);
  }

  /**
   * Sayfanın açık ön ayarı. ÖNCELİK panelin yayın yoluyla AYNI: sayfaya özel
   * ön ayar workspace varsayılanını ezer (`listBoostablePosts`taki sorgu).
   */
  private async onAyar(ctx: TenantContext, w: string, sayfaId: string): Promise<BoostOnAyari | null> {
    const [r] = await this.tx(ctx, (t) =>
      t.$queryRaw<Array<{ budget_mode: string; daily_budget_micros: string | null; total_budget_micros: string | null; duration_days: number; settings: unknown }>>(Prisma.sql`
        SELECT budget_mode, daily_budget_micros::text, total_budget_micros::text, duration_days, settings
          FROM auto_boost_presets
         WHERE client_id = ${w}::uuid AND platform = 'meta' AND enabled
           AND (social_profile_id = ${sayfaId}::uuid OR social_profile_id IS NULL)
         ORDER BY social_profile_id NULLS LAST
         LIMIT 1`),
    );
    if (!r) return null;
    const s = metaPresetSettingsSchema.safeParse(r.settings);
    if (!s.success) {
      // BOZUK ÖN AYAR "YOK" SAYILIYOR ve log'da: yarım okunmuş bir ön ayarla para harcamak tahmin olurdu.
      logger.warn(`Boost ön ayarı okunamadı (workspace ${w}): ${s.error.message}`);
      return null;
    }
    const kip = r.budget_mode === 'lifetime' ? 'lifetime' : 'daily';
    const m = kip === 'lifetime' ? r.total_budget_micros : r.daily_budget_micros;
    return {
      goal: s.data.goal,
      butce: m ? { kip, micros: BigInt(m) } : null,
      sureGun: r.duration_days,
      savedAudienceId: s.data.savedAudienceId,
      locations: s.data.locations,
      ageMin: s.data.ageMin,
      ageMax: s.data.ageMax,
      genders: s.data.genders,
      interests: s.data.interests,
      kitleSablonuId: s.data.kitleSablonuId,
    };
  }

  private async metaBaglami(
    connectionId: string,
    hesapDis: string,
    hesapId: string,
    katman: 'interactive' | 'rule_action',
  ): Promise<{ provider: IAdPlatformProvider; fctx: FetchContext }> {
    const provider = this.providers.get('meta');
    const k = await this.quota.acquire({ platform: 'meta', adAccountId: hesapId, layer: katman });
    if (!k.allowed) throw new AracArgumanHatasi(`Meta kotası şu an dolu (${k.reason ?? 'kota'}); birkaç dakika sonra yeniden dene.`);
    return {
      provider,
      fctx: {
        accessToken: await this.vault.getAccessToken(connectionId, provider),
        accountExternalId: hesapDis,
        onRateLimit: (snapshot) => this.quota.record({ platform: 'meta', adAccountId: hesapId, endpoint: 'mcp:boost', snapshot }),
      },
    };
  }
}

/** Platformdaki hâlin model için cümlesi (aynadan değil, satırdan; canlısı `boost_durumu`nda). */
function platformDurumMetni(status: string, duraklatilmisKur: boolean, yayinBaslangici: Date | null): string {
  if (status !== 'active') return status;
  if (duraklatilmisKur && !yayinBaslangici) return 'duraklatılmış kuruldu, hiç başlatılmadı (harcama yok)';
  return 'kuruldu (anlık durum için boost_durumu)';
}

/**
 * Duraklatılmış kurulup HİÇ başlatılmamış boost'un takvimi bugünden yeniden
 * kuruluyor: bitiş kurulum anından sayılmıştı ve toplam bütçe kalan kısa
 * süreye sıkışırdı. Bir kez başlamış boost'un takvimine dokunulmuyor.
 */
export function yenidenZamanlama(
  b: { duraklatilmis_kur: boolean; yayin_baslangici: Date | null; duration_days: number },
  simdi: Date,
): { baslangic: Date; bitis: Date } | null {
  if (!b.duraklatilmis_kur || b.yayin_baslangici) return null;
  return { baslangic: simdi, bitis: new Date(simdi.getTime() + b.duration_days * 86_400_000) };
}
