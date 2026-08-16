import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  coverageFor,
  matchRatio,
  packTextsFor,
  restrictTargetingFor,
  SPECIAL_AD_CATEGORY_META,
  type SpecialAdCategory,
  type AdvancedSettings,
  type AssetCoverage,
  type AssetRatio,
  type CreativeTexts,
  type DraftAdGroupRecord,
  type DraftCampaignRecord,
  type DraftGroupRecord,
  type PublishCheck,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { PlatformApiError } from '../connections/provider.types';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { AssetUploaderService } from '../assets/asset-uploader.service';
import {
  campaignSpec,
  defaultTargeting,
  labelFor,
  placementsFor,
  placementsFrom,
  resolveSpec,
  targetingFrom,
} from '../ad-builder/goal-mapping';
import { validateAdvanced } from '../ad-builder/objective-matrix';
import { DraftTreeService } from './draft-tree.service';

/**
 * Kampanya taslağı ağacını platformda yayınlar.
 *
 * MEVCUT YAYIN YOLU YENİDEN KULLANILIYOR (`provider.publishDraft`) ve
 * `goal-mapping.ts`'e HİÇ DOKUNULMUYOR. Sebebi §3'ün kendisi: o dosyadaki her
 * karar canlıda öğrenilmiş bir hatanın karşılığı ve ikinci bir eşleme yazmak,
 * altı hatanın düzeltmesinin yalnızca bir yola gitmesi hikâyesini tekrarlamak
 * olurdu.
 *
 * İKİ YÜZEY, TEK YAYIN YOLU. Basit yüzeyde spec'i `campaignSpec` üretiyor,
 * uzman yüzeyinde `resolveSpec` kullanıcının ayarlarını alıyor — ikisi de aynı
 * dosyada ve zaten mevcut reklam oluşturucuyu besliyorlar.
 *
 * ÇOKLU KREATİF: ilk reklam `publishDraft` ile kampanyayı ve ad set'i kuruyor,
 * kalanlar `createAd` ile AYNI ad set'e ekleniyor. İkisi de mevcut kod.
 *
 * KALAN KISIT — ÇOKLU AD SET. `publishDraft` tek ad set yazıyor ve ikinci bir
 * ad set açmanın yolu canlıda hiç denenmedi. Ağaç taşıyor ama yayınlamıyor ve
 * bu kullanıcıya AÇIKÇA söyleniyor: tahmin etmektense kısıtla, kısıtı
 * kullanıcıya söyle.
 */
@Injectable()
export class DraftPublishService {
  private readonly logger = new Logger(DraftPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: DraftTreeService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
    private readonly assetUploader: AssetUploaderService,
  ) {}

  // ---------------------------------------------------------------------------
  // Kontrol
  // ---------------------------------------------------------------------------

  /**
   * Yayınlamadan önce ne eksik, ne riskli.
   *
   * ENGELLEYENLER VE UYARILAR AYRI — mevcut `publishCheck` ile aynı sözleşme.
   * İkisini birleştirmek, "başlığın kısaltılacak" gibi bir notu yayını durduran
   * bir hataya çevirirdi.
   */
  async check(ctx: TenantContext, campaignId: string): Promise<PublishCheck> {
    const campaign = await this.tree.get(ctx, campaignId);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (campaign.status === 'published') blockers.push('Bu kampanya zaten yayınlanmış.');

    const google = campaign.platform === 'google';

    /**
     * TEK GRUP KISITI — sessiz değil.
     *
     * Ağaç çoklu grup taşıyor (K4) ama `publishDraft` tek kampanya + tek ad
     * set yazıyor ve ikinci bir ad set açmanın yolu canlıda hiç denenmedi.
     * Fazlasını sessizce atlamak, kullanıcının iki grup kurup birinin
     * yayınlandığını fark etmemesi demek olurdu.
     *
     * ÇOKLU REKLAM ARTIK ENGELLİ DEĞİL: ilk reklam `publishDraft` ile
     * kampanyayı ve ad set'i kuruyor, kalanlar `createAd` ile AYNI ad set'e
     * ekleniyor. İkisi de mevcut kod; yeni bir eşleme yazılmadı.
     */
    if (campaign.adGroups.length !== 1) {
      blockers.push(
        `Bu kampanyada ${campaign.adGroups.length} reklam grubu var; şimdilik tek gruplu ` +
          'kampanyalar yayınlanabiliyor.',
      );
    }
    const group = campaign.adGroups[0];
    const ads = group?.ads ?? [];
    if (group && ads.length === 0) {
      blockers.push('Reklam grubunda hiç reklam yok.');
    }

    /**
     * UZMAN AYARLARI AYNI KONTROL LİSTESİNE KATILIYOR.
     *
     * Ayrı bir "gelişmiş doğrulama" ekranı olsaydı kullanıcı iki ayrı yerde
     * iki ayrı liste görürdü ve hangisinin yayını engellediği belirsiz
     * kalırdı. Tek liste, tek karar — mevcut `publishCheck` de aynı şeyi
     * yapıyor.
     */
    const advanced = advancedFrom(campaign, group);
    if (!google && campaign.surface === 'expert' && advanced) {
      const adv = validateAdvanced(advanced, {
        hasLinkUrl: Boolean(group?.settings?.linkUrl),
        hasLeadForm: Boolean(group?.leadFormId),
        ratios: [],
        dailyBudget: Number(BigInt(campaign.budgetAmountMicros ?? '0') / 1_000_000n),
        currency: 'TRY',
      });
      blockers.push(...adv.blockers.map((b) => b.message));
      warnings.push(...adv.warnings.map((w) => w.message));
    }

    /**
     * AYAR EKSİKLİĞİ YALNIZCA META'DA HATA.
     *
     * `advancedFrom` Meta ayarlarını topluyor ve Google arama kampanyasında
     * öyle bir küme YOK — amaç, optimizasyon ve yerleşim Meta'nın kavramları.
     * Google taslağında `null` dönmesi normal; onu hata saymak, doğru kurulmuş
     * bir kampanyayı "ayarları okunamadı" diye reddetmek olurdu.
     */
    if (!google && campaign.surface === 'expert' && !advanced) {
      blockers.push('Uzman taslağının ayarları okunamadı — taslağı yeniden oluştur.');
    }

    if (!google && !group?.socialProfileId) {
      blockers.push('Reklam bir Facebook sayfası adına yayınlanır — sayfa seçilmemiş.');
    }

    /**
     * GOOGLE ARAMA KAMPANYASININ İKİ ZORUNLUSU.
     *
     * ANAHTAR KELİMESİZ kampanya hiç gösterim almıyor ve hiçbir hata da
     * vermiyor — sessiz sıfırın ta kendisi. HEDEF URL'siz reklam ise Google
     * tarafından reddediliyor ama mesaj hangi alanın eksik olduğunu
     * söylemiyor.
     */
    if (google) {
      const keywords = (group?.settings?.keywords as string[] | undefined) ?? [];
      if (keywords.length === 0) {
        blockers.push(
          'Google arama kampanyası en az bir anahtar kelime gerektiriyor — ' +
            'kelimesiz kampanya hiç gösterim almaz.',
        );
      }
      if (!group?.settings?.linkUrl) {
        blockers.push('Google arama reklamı hedef URL olmadan oluşturulamaz.');
      }

      /**
       * BU YOL CANLIDA HİÇ ÇALIŞTIRILMADI — uyarı olarak söyleniyor.
       *
       * Meta'da ilk gerçek yazma çağrısında altı hata çıktı ve üçü sessizdi.
       * Kullanıcı bunu bilerek denemeli; kampanya zaten DURAKLATILMIŞ
       * açılıyor ve kendisi Google Ads'ten başlatıyor.
       */
      warnings.push(
        'Google yayın yolu canlıda ilk kez çalışacak. Kampanya DURAKLATILMIŞ açılır — ' +
          'Google Ads’te gözden geçirip kendin başlatman gerekiyor.',
      );
    }

    if (campaign.budgetMode === 'none' || !campaign.budgetAmountMicros) {
      blockers.push('Bütçe belirlenmemiş.');
    }

    const linkUrl = (group?.settings?.linkUrl as string | undefined) ?? undefined;
    if (campaign.goal === 'website' && !linkUrl) {
      blockers.push('Web sitesi adresi eksik.');
    }

    let coverage: AssetCoverage[] = [];

    /**
     * HER REKLAM AYRI AYRI DENETLENİYOR, yalnızca ilki değil.
     *
     * Uzman yüzeyi aynı gruba 3-5 kreatif koyabiliyor. Yalnızca ilkini
     * denetlemek, üçüncü varyantın metinsiz ya da kare görselsiz olduğunu
     * yayına çıktıktan sonra öğrenmek demek olurdu — ve o varyant sessizce
     * kötü performans gösterirdi.
     *
     * MESAJDA VARYANT NUMARASI VAR: "ana metin boş" tek başına, beş kreatifli
     * bir kampanyada hangisini düzelteceğini söylemiyor.
     */
    for (const [i, ad] of ads.entries()) {
      /**
       * BOOST REKLAMININ METNİ VE GÖRSELİ BİZDE DEĞİL.
       *
       * Gönderi zaten Meta'da yayında; metin havuzu ve kapsama kontrolleri
       * onun için anlamsız. Uygulamak, yayında olan bir gönderiyi "ana metin
       * boş" diye reddetmek olurdu.
       */
      if (ad.organicPostId) continue;

      const creative = await this.loadCreative(ctx, ad.creativeId!);
      const etiket = ads.length > 1 ? `${i + 1}. reklam: ` : '';

      /**
       * METİN HAVUZUNDAN META PAKETİ.
       *
       * Kreatif iki platformu birden besliyor; hangi metnin Meta'ya gideceğine
       * `packTextsFor` karar veriyor. Sığmayan metin kırpılmıyor, eleniyor ve
       * sebebi buraya uyarı olarak düşüyor — kullanıcı "yazdığım başlık nerede"
       * sorusunu sormak zorunda kalmıyor.
       */
      const packed = packTextsFor(google ? 'google_rsa' : 'meta_single_image', creative.texts);
      blockers.push(...packed.blockers.map((b) => etiket + b));
      warnings.push(...packed.warnings.map((w) => etiket + w));

      /**
       * ANA METİN YALNIZCA META'DA ZORUNLU.
       *
       * Google RSA'da "birincil metin" diye bir alan yok; `packTextsFor` onu
       * zaten düşürüyor ve düşürdüğünü uyarı olarak söylüyor. Burada da
       * zorunlu tutmak, Google kullanıcısına hiçbir yerde görünmeyecek bir
       * metin yazdırmak olurdu.
       */
      if (!google && !packed.primaryText) {
        blockers.push(
          `${etiket}Ana metin boş — reklamın üstünde görünecek yazı olmadan yayınlanamaz.`,
        );
      }
      if (!google && packed.headlines.length === 0) {
        warnings.push(
          `${etiket}Başlık boş — reklamın altında kalın yazıyla görünen kısım olmayacak.`,
        );
      }

      /**
       * KAPSAMA — kova değil, ÖLÇÜLEN BOYUT.
       *
       * `coverageFor` her yuvayı gerçek sayılarla değerlendiriyor ve kırpmanın
       * ne kadarını kaybettireceğini önceden söylüyor. Google bloğu da
       * hesaplanıyor ama yayını ENGELLEMİYOR: yazılmamış bir özellik yüzünden
       * çalışan bir akışı durdurmak olurdu.
       */
      const metaCoverage = coverageFor('meta', creative.assets);
      const googleCoverage = coverageFor('google', creative.assets);
      /**
       * GÖRSEL KAPSAMASI ARAMA KAMPANYASINDA ENGEL DEĞİL.
       *
       * Arama reklamı METİNSEL — görsel kullanmıyor. Kare görsel yok diye
       * bir arama kampanyasını durdurmak, ilgisiz bir kuralı dayatmak olurdu.
       */
      if (!google) {
        blockers.push(...metaCoverage.blockers.map((b) => etiket + b));
        warnings.push(...metaCoverage.warnings.map((w) => etiket + w));
      }

      // KAPSAMA PANELİ İLK REKLAMINKİNİ GÖSTERİYOR: üç kreatif için üç tablo
      // basmak ekranı okunamaz kılardı, engeller ise hepsi listede duruyor.
      if (i === 0) coverage = [metaCoverage, googleCoverage];
    }

    /**
     * ÖZEL KATEGORİ VE HEDEFLEME KISITI — kontrolde SÖYLENİYOR.
     *
     * Kullanıcı 25-44 yaş kadın hedefleyen bir taslak kurmuş olabilir ve
     * konut kategorisi yüzünden o daraltma uygulanmayacak. Yayından sonra
     * fark etmesi, yanlış kitleye harcanan bütçe demek.
     */
    const [musteri] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ special_ad_categories: string[] }>>(Prisma.sql`
        SELECT special_ad_categories FROM clients WHERE id = ${campaign.clientId}::uuid
      `),
    );
    const kategoriler = (musteri?.special_ad_categories ?? []) as SpecialAdCategory[];
    if (kategoriler.length > 0 && !google) {
      const etiketler = kategoriler
        .map((k) => SPECIAL_AD_CATEGORY_META[k]?.label ?? k)
        .join(', ');
      const dusen = restrictTargetingFor(
        kategoriler,
        advanced ? targetingFrom(advanced.targeting) : defaultTargeting(),
      ).removed;

      warnings.push(
        `Bu müşteri özel reklam kategorisinde beyan edilmiş (${etiketler}) — ` +
          'kampanya Meta’ya bu beyanla gidiyor.' +
          (dusen.length > 0
            ? ` Meta bu kategoride ${dusen.join(', ')} daraltmasına izin vermiyor; ` +
              'o alanlar gönderilmeyecek.'
            : ''),
      );
    }

    const budget = BigInt(campaign.budgetAmountMicros ?? '0');
    const days = campaign.endAt
      ? Math.max(
          1,
          Math.round(
            (new Date(campaign.endAt).getTime() - Date.now()) / 86_400_000,
          ),
        )
      : 0;
    const total = days > 0 ? budget * BigInt(days) : null;

    if (!campaign.endAt) {
      // SÜRESİZ KAMPANYA bu üründe en pahalı kullanıcı hatası: unutuluyor.
      warnings.push(
        'Süre sınırı yok — kampanya sen durdurana kadar her gün harcamaya devam eder.',
      );
    }

    const summary =
      total !== null
        ? `${platformLabel(campaign.platform)} · günde ${money(budget)} · ${days} gün · ` +
          `toplam ${money(total)}`
        : `${platformLabel(campaign.platform)} · günde ${money(budget)} · süresiz`;

    return {
      ok: blockers.length === 0,
      blockers,
      warnings,
      summary,
      totalBudgetMicros: (total ?? 0n).toString(),
      assetCoverage: coverage,
    };
  }

  // ---------------------------------------------------------------------------
  // Yayın
  // ---------------------------------------------------------------------------

  /**
   * Bir niyetin BÜTÜN platformlarını yayınlar — her biri BAĞIMSIZ.
   *
   * BU METOT HATA FIRLATMIYOR ve K13'ün bütün gerekçesi bu. Meta çıkar, Google
   * düşer; bu istisna değil normal sonuçtur. Tek bir hata fırlatmak, yayına
   * girmiş Meta kampanyasını kullanıcıdan gizlemek olurdu — hâlbuki o kampanya
   * o anda para harcamaya başlamış oluyor.
   *
   * Her satır kendi durumunu ve kendi hatasını taşıyor; düşen taraf tek başına
   * yeniden denenebiliyor.
   */
  async publishGroup(ctx: TenantContext, campaignId: string): Promise<DraftGroupRecord> {
    const group = await this.tree.getGroup(ctx, campaignId);

    for (const campaign of group.campaigns) {
      if (campaign.status === 'published') continue;
      try {
        await this.publish(ctx, campaign.id);
      } catch (err) {
        // Durum ve sebep zaten `publish` içinde satıra yazıldı; burada
        // yalnızca döngünün devam etmesi önemli.
        this.logger.warn(
          `Kampanya yayınlanamadı (${campaign.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return this.tree.getGroup(ctx, campaignId);
  }

  /** Tek platform kampanyasını yayınlar. */
  async publish(ctx: TenantContext, campaignId: string): Promise<DraftCampaignRecord> {
    const campaign = await this.tree.get(ctx, campaignId);

    // ENGELLEYİCİLER YAYINDAN ÖNCE. Aynı kontroller arayüzde de çalışıyor ama
    // orada geçen bir istek burada da geçmeli — API doğrudan çağrılabilir.
    const check = await this.check(ctx, campaignId);
    if (!check.ok) {
      await this.fail(ctx, campaignId, check.blockers.join(' '));
      throw new BadRequestException(check.blockers.join(' '));
    }

    const group = campaign.adGroups[0]!;
    const ad = group.ads[0]!;
    const advanced = advancedFrom(campaign, group);

    /**
     * BOOST AYRI BİR YAYIN ÇAĞRISI — `createBoost`, `publishDraft` değil.
     *
     * Boost edilen gönderinin metni ve görseli ZATEN META'DA duruyor; bizim
     * kreatif kütüphanemizde karşılığı yok ve `publishDraft` bir kreatif
     * kurmaya çalışırdı. Meta'nın kendi uç noktası gönderiyi olduğu gibi öne
     * çıkarıyor.
     *
     * Ağacın kazancı burada: boost artık aynı listede, aynı durum modeliyle ve
     * aynı "nereden geldi" bilgisiyle duruyor.
     */
    if (ad.organicPostId) {
      return this.publishBoost(ctx, campaign, group, ad);
    }

    const creative = await this.loadCreative(ctx, ad.creativeId!);
    const auth = await this.resolveAuth(ctx, campaign, group.socialProfileId, group.leadFormId);

    /**
     * SAĞLAYICI KAMPANYANIN PLATFORMUNDAN GELİYOR, sabit 'meta' değil.
     *
     * Sabit bırakmak, Google kampanyasını Meta'ya yazmayı denemek demek
     * olurdu — ve hata "hesap bulunamadı" gibi okunurdu.
     */
    const google = campaign.platform === 'google';
    const provider = this.providers.get(campaign.platform);
    const can = provider.canWrite(auth.grantedScopes);
    if (!can.ok) {
      const message =
        `Yazma izni yok: ${can.missing.join(', ')}. ` +
        'Meta onayı gelene kadar reklam yayınlanamaz.';
      await this.fail(ctx, campaignId, message);
      throw new BadRequestException(message);
    }

    const gate = await this.quota.acquire({
      platform: campaign.platform,
      adAccountId: campaign.adAccountId,
      // Kullanıcı ekranda bekliyor: öncelikli kova.
      layer: 'interactive',
    });
    if (!gate.allowed) {
      throw new BadRequestException(
        `Meta kotası şu an dolu (${gate.reason}). Birkaç dakika sonra tekrar dene.`,
      );
    }

    await this.setStatus(ctx, campaignId, 'publishing', null);

    const accessToken = await this.vault.getAccessToken(auth.connectionId, provider);
    const fetchCtx = {
      accessToken,
      accountExternalId: auth.accountExternalId,
      loginCustomerId: auth.managerExternalId,
      onRateLimit: (snapshot: Parameters<NonNullable<typeof this.quota.record>>[0]['snapshot']) =>
        this.quota.record({
          platform: campaign.platform,
          adAccountId: campaign.adAccountId,
          endpoint: 'draft-tree:publish',
          snapshot,
        }),
    };

    try {
      /**
       * ARAMA REKLAMI METİNSEL — görsel yüklenmiyor.
       *
       * Google'a görsel göndermeyi denemek `uploadAdImage`'a düşerdi ve o
       * hâlâ uygulanmamış (PMax geldiğinde gerekecek). Arama kampanyasının
       * görsele ihtiyacı yok.
       */
      const images = google
        ? []
        : await this.uploadImages(ctx, campaign.adAccountId, creative, fetchCtx);
      const packed = packTextsFor(
        google ? 'google_rsa' : 'meta_single_image',
        creative.texts,
      );

      const result = await provider.publishDraft(fetchCtx, {
        adAccountExternalId: auth.accountExternalId,
        pageExternalId: auth.pageExternalId,
        name: campaign.name,
        /**
         * SPEC `goal-mapping.ts`'TEN — dosyaya dokunulmadı.
         *
         * `campaignSpec` bugün `ad_drafts` yolunu besliyor ve aynı kararları
         * burada da veriyor. İkinci bir eşleme yazmak, `LEAD_GENERATION` yerine
         * `LINK_CLICKS` sınıfı hataların bir yolda düzeltilip diğerinde
         * kalması demek olurdu.
         */
        /**
         * SPEC `goal-mapping.ts`'TEN — dosyaya dokunulmadı.
         *
         * Basit yüzeyde `campaignSpec` hedefi çeviriyor; uzman yüzeyinde
         * `resolveSpec` kullanıcının ayarlarını alıyor. İKİSİ DE O DOSYADA
         * ve zaten mevcut reklam oluşturucuyu besliyorlar. Burada ikinci bir
         * eşleme yazmak, `LEAD_GENERATION` yerine `LINK_CLICKS` sınıfı
         * hataların bir yolda düzeltilip diğerinde kalması demek olurdu.
         */
        spec: advanced
          ? // `goal` BURADA OKUNMUYOR: `resolveSpec` mod 'advanced' olduğunda
            // doğrudan kullanıcının ayarlarına bakıyor ve hedefe hiç
            // dokunmuyor. Alan tipin zorunlu kıldığı bir doldurma; uzman
            // taslağında hedef zaten NULL.
            resolveSpec({ goal: 'website', mode: 'advanced', advanced }, auth.pageExternalId)
          : campaignSpec(campaign.goal!, auth.pageExternalId),
        primaryText: packed.primaryText ?? '',
        headline: packed.headlines[0],
        description: packed.descriptions[0],
        linkUrl: (group.settings?.linkUrl as string | undefined) ?? undefined,
        whatsappNumber: (group.settings?.whatsappNumber as string | undefined) ?? undefined,
        dailyBudgetMicros: BigInt(campaign.budgetAmountMicros!),
        endTime: campaign.endAt ? new Date(campaign.endAt) : null,
        startTime: campaign.startAt ? new Date(campaign.startAt) : null,
        budgetMode: campaign.budgetMode === 'lifetime' ? 'lifetime' : 'daily',
        leadFormExternalId: auth.leadFormExternalId,
        currency: auth.currency,
        images,
        // GOOGLE RSA METİNLERİ AYRI ALANDA: Meta bir başlık alıyor, Google
        // en az üç istiyor ve aynı alanı paylaştırmak Google'ın reddettiği
        // bir paket üretirdi.
        googleHeadlines: google ? packed.headlines : undefined,
        googleDescriptions: google ? packed.descriptions : undefined,
        keywords: google
          ? ((group.settings?.keywords as string[] | undefined) ?? [])
          : undefined,
        specialAdCategories: auth.specialAdCategories,
        /**
         * HEDEFLEME VE YERLEŞİM `goal-mapping.ts`'TEN.
         *
         * Yerleşim YÜKLENEN GÖRSELE göre kısıtlanıyor: dikey görsel yoksa
         * Hikâyeler açılmıyor, çünkü otomatik yerleşim kare görseli oraya
         * kırpıyor ve metin kesiliyor.
         */
        /**
         * HEDEFLEME VE YERLEŞİM: basit yüzeyde BİZİM kararımız, uzman
         * yüzeyinde KULLANICININ.
         *
         * Basit modda yerleşim yüklenen görsele göre kısıtlanıyor (dikey
         * görsel yoksa Hikâyeler açılmıyor); uzman modda kullanıcı ne
         * seçtiyse o gidiyor. Otomatik yerleşimde `placementsFrom` BOŞ nesne
         * dönüyor ve hiçbir alan gönderilmiyor — boş `publisher_platforms`
         * göndermek "hiçbir platform" demek ve ad set hiç dağıtım yapmıyor.
         */
        /**
         * ÖZEL KATEGORİDE HEDEFLEME KISITLANIYOR.
         *
         * Meta konut/istihdam/kredi kampanyalarında yaş, cinsiyet ve
         * ayrıntılı hedeflemeyi kapatıyor. Alanları yine göndermek isteğin
         * REDDEDİLMESİ demek — ya da daha kötüsü, Meta kabul edip sessizce
         * yok sayıyor ve kullanıcı 25-44 yaşa reklam verdiğini sanıyor.
         * Kısıtlamayı biz uyguluyoruz ve kontrol ekranı ne düştüğünü yazıyor.
         */
        targeting: restrictTargetingFor(
          auth.specialAdCategories,
          advanced ? targetingFrom(advanced.targeting) : defaultTargeting(),
        ).targeting,
        placements: advanced
          ? placementsFrom(advanced.placement)
          : placementsFor(images.map((i) => i.ratio)),
        bidStrategy: advanced?.bidStrategy,
        bidAmountMinor: advanced?.bidAmount ? bidToMinor(advanced.bidAmount) : undefined,
        customizationRules: null,
      });

      await this.markPublished(ctx, campaignId, group.id, ad.id, result);

      /**
       * KALAN REKLAMLAR AYNI AD SET'E EKLENİYOR.
       *
       * `publishDraft` kampanya + ad set + ilk reklamı kuruyor; `createAd`
       * mevcut bir ad set'e reklam ekliyor ve toplu oluşturucu onu zaten
       * kullanıyor. İkisini birleştirmek yeni bir eşleme yazmadan çoklu
       * kreatifi mümkün kılıyor.
       *
       * BİR VARYANTIN DÜŞMESİ KAMPANYAYI DÜŞÜRMÜYOR. Kampanya ve ad set
       * yayında; hepsini geri almak, çalışan bir yapıyı bir varyant yüzünden
       * yıkmak olurdu. Düşen varyantın sebebi KENDİ satırına yazılıyor.
       */
      for (const digeri of group.ads.slice(1)) {
        try {
          /**
           * BOOST VARYANTI OLMAZ. Bir gönderi bir kez öne çıkarılıyor; ikinci
           * bir "varyant" aynı gönderiye ikinci kez para harcamak demek ve
           * `boost-selector` bunu zaten engelliyor ("aynı gönderi ikinci kez
           * boost edilmez"). Buraya düşmesi çağıranın hatası.
           */
          if (!digeri.creativeId) {
            throw new Error('Boost reklamının varyantı olamaz.');
          }
          const varyant = await this.loadCreative(ctx, digeri.creativeId);
          const varyantImages = await this.uploadImages(
            ctx,
            campaign.adAccountId,
            varyant,
            fetchCtx,
          );
          const ilkGorsel = varyantImages[0];
          if (!ilkGorsel) throw new Error('Varyantın kullanılabilir görseli yok.');

          const varyantMetin = packTextsFor('meta_single_image', varyant.texts);
          const eklendi = await provider.createAd(fetchCtx, {
            adAccountExternalId: auth.accountExternalId,
            adSetExternalId: result.adSetId,
            pageExternalId: auth.pageExternalId,
            name: digeri.name,
            primaryText: varyantMetin.primaryText,
            headline: varyantMetin.headlines[0],
            description: varyantMetin.descriptions[0],
            linkUrl: (group.settings?.linkUrl as string | undefined) ?? undefined,
            mediaRef: ilkGorsel.hash,
          });
          await this.setAdRefs(ctx, digeri.id, eklendi.externalAdId, eklendi.externalCreativeId);
        } catch (err) {
          const mesaj = err instanceof Error ? err.message : String(err);
          await this.setAdError(ctx, digeri.id, mesaj.slice(0, 2000));
          this.logger.warn(`Varyant eklenemedi (${digeri.id}): ${mesaj}`);
        }
      }
    } catch (err) {
      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      await this.fail(ctx, campaignId, message.slice(0, 2000));
      this.logger.error(`Kampanya yayınlanamadı (${campaignId}): ${message}`);
      throw new BadRequestException(message);
    }

    return this.tree.get(ctx, campaignId);
  }

  /**
   * Gönderi boost'unu yayınlar.
   *
   * `createBoost` kampanya + ad set + reklamı tek çağrıda kuruyor ve ortada
   * kalırsa kendi içinde geri alıyor — o kod zaten var ve Auto-Boost onu
   * kullanıyor. Burada yeniden yazmak, aynı hatanın iki yerde düzeltilmesi
   * demek olurdu.
   */
  private async publishBoost(
    ctx: TenantContext,
    campaign: DraftCampaignRecord,
    group: DraftAdGroupRecord,
    ad: { id: string; organicPostId: string | null },
  ): Promise<DraftCampaignRecord> {
    const [post] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ post_external_id: string; page_external_id: string }>>(Prisma.sql`
        SELECT p.external_id AS post_external_id, sp.external_id AS page_external_id
        FROM organic_posts p
        JOIN social_profiles sp ON sp.id = p.social_profile_id
        WHERE p.id = ${ad.organicPostId}::uuid AND p.org_id = ${ctx.orgId}::uuid
      `),
    );
    if (!post) throw new BadRequestException('Öne çıkarılacak gönderi bulunamadı.');

    const auth = await this.resolveAuth(ctx, campaign, group.socialProfileId, null);
    const provider = this.providers.get('meta');
    const can = provider.canWrite(auth.grantedScopes);
    if (!can.ok) {
      const message = `Yazma izni yok: ${can.missing.join(', ')}.`;
      await this.fail(ctx, campaign.id, message);
      throw new BadRequestException(message);
    }

    await this.setStatus(ctx, campaign.id, 'publishing', null);

    const accessToken = await this.vault.getAccessToken(auth.connectionId, provider);
    try {
      const result = await provider.createBoost(
        { accessToken, accountExternalId: auth.accountExternalId },
        {
          adAccountExternalId: auth.accountExternalId,
          postExternalId: post.post_external_id,
          pageExternalId: post.page_external_id,
          /**
           * BÜTÇE KİPİ AĞAÇTAN OKUNUYOR, VARSAYILMIYOR.
           *
           * `draft_campaigns.budget_mode` bu kolonu baştan beri taşıyordu ama
           * burası tutarı koşulsuz GÜNLÜK sayıyordu. Bugüne kadar doğru
           * sonuç veriyordu, çünkü boost ağacına yazan tek yol kural
           * yürütücüsüydü ve o hep 'daily' yazıyor. Elle boost toplam bütçe
           * yazacak (K18) ve o gün bu satır sessizce yanlış olurdu: 300 TL'lik
           * toplam, günlük 300 TL olarak beş gün harcanırdı.
           */
          budget:
            campaign.budgetMode === 'lifetime'
              ? { mode: 'lifetime', totalMicros: BigInt(campaign.budgetAmountMicros!) }
              : { mode: 'daily', dailyMicros: BigInt(campaign.budgetAmountMicros!) },
          /**
           * SÜRE BİTİŞ TARİHİNDEN TÜRÜYOR.
           *
           * `createBoost` gün sayısı istiyor, ağaç ise bitiş tarihi tutuyor.
           * Süresiz bir boost olmamalı: taahhüt bazlı tavan hesabı gün
           * sayısına dayanıyor ve süresiz bir kayıt o hesabı anlamsız kılardı.
           */
          durationDays: durationFrom(campaign.endAt),
          objective: (campaign.settings?.objective as string) ?? 'OUTCOME_ENGAGEMENT',
          currency: auth.currency,
          name: campaign.name,
          specialAdCategories: auth.specialAdCategories,
        },
      );

      await this.markPublished(ctx, campaign.id, group.id, ad.id, {
        campaignId: result.externalCampaignId,
        adSetId: result.externalAdSetId,
        creativeId: result.externalAdId,
        adId: result.externalAdId,
      });
    } catch (err) {
      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      await this.fail(ctx, campaign.id, message.slice(0, 2000));
      throw new BadRequestException(message);
    }

    return this.tree.get(ctx, campaign.id);
  }

  // ---------------------------------------------------------------------------

  /**
   * Kreatifin görsellerini Meta'ya yükler.
   *
   * HASH HESAP BAŞINA ve önbellek `asset_platform_refs`'te. Aynı görselin iki
   * reklam hesabında iki ayrı hash'i var; A'nın hash'ini B'de kullanmak ya
   * reddediliyor ya da kreatifi GÖRSELSİZ oluşturuyor — reklam yayınlanır,
   * para harcar, boş görünür.
   *
   * `AssetUploaderService` bunu zaten çözüyor ve toplu oluşturucu da onu
   * kullanıyor; ikinci bir önbellek yazmak iki kaynağın ayrışması olurdu.
   */
  private async uploadImages(
    ctx: TenantContext,
    adAccountId: string,
    creative: LoadedCreative,
    fetchCtx: Parameters<AssetUploaderService['ensureExternalRef']>[1]['fetchCtx'],
  ): Promise<Array<{ ratio: AssetRatio; hash: string }>> {
    const out: Array<{ ratio: AssetRatio; hash: string }> = [];

    for (const asset of creative.assets) {
      const ratio = matchRatio(asset.width, asset.height);
      /**
       * ORANA OTURMAYAN GÖRSEL ATLANMIYOR, SAYILIYOR.
       *
       * Kapsama raporu bunu zaten söylüyor ve kontrol aşamasında görünüyor;
       * burada log'a düşmesi, canlıda "üç görsel yükledim ikisi gitti"
       * durumunun izini bırakıyor.
       */
      if (!ratio) {
        this.logger.warn(
          `Kreatif görseli Meta oranlarına oturmuyor, atlandı: ${asset.id} ` +
            `(${asset.width}×${asset.height})`,
        );
        continue;
      }

      // ETİKET ORANLA AYNI: kreatifteki `asset_customization_rules` bu
      // etiketle görseli eşleştiriyor.
      const hash = await this.assetUploader.ensureExternalRef(ctx, {
        assetId: asset.id,
        adAccountId,
        label: labelFor(ratio),
        fetchCtx,
      });
      out.push({ ratio, hash });
    }

    // KARE HER ZAMAN İLK. Kreatif tek görselli yolda ilk elemanı kullanıyor ve
    // orada kare olmalı; sıra veritabanından rastgele gelirse dikey görsel
    // akışta çıkardı.
    return out.sort((a, b) => (a.ratio === 'square' ? -1 : b.ratio === 'square' ? 1 : 0));
  }

  private async loadCreative(ctx: TenantContext, creativeId: string): Promise<LoadedCreative> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ texts: CreativeTexts }>>(Prisma.sql`
        SELECT texts FROM ad_creatives
        WHERE id = ${creativeId}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (!row) throw new BadRequestException('Kreatif bulunamadı');

      const assets = await tx.$queryRaw<
        Array<{ id: string; width: number; height: number }>
      >(Prisma.sql`
        SELECT a.id::text AS id, a.width, a.height
        FROM ad_creative_assets ca
        JOIN assets a ON a.id = ca.asset_id
        WHERE ca.creative_id = ${creativeId}::uuid
        ORDER BY ca.position
      `);

      return { texts: normalizeTexts(row.texts), assets };
    });
  }

  private async resolveAuth(
    ctx: TenantContext,
    campaign: DraftCampaignRecord,
    socialProfileId: string | null,
    leadFormId: string | null,
  ): Promise<{
    connectionId: string;
    accountExternalId: string;
    pageExternalId: string;
    /**
     * Google MCC kimliği — `login-customer-id` başlığı için.
     *
     * MCC altındaki bir hesapta YAZMA yaparken de zorunlu, okuma tarafındaki
     * kadar: eksikse Google `USER_PERMISSION_DENIED` dönüyor ve mesaj token
     * sorunu gibi okunuyor.
     */
    managerExternalId?: string;
    currency: string;
    grantedScopes: string[];
    leadFormExternalId?: string;
    /** Müşterinin beyan ettiği özel reklam kategorileri. */
    specialAdCategories: SpecialAdCategory[];
  }> {
    /**
     * SAYFA LEFT JOIN — Google'da sayfa YOK.
     *
     * Eski hâli `JOIN social_profiles` idi ve Google kampanyasında hiçbir
     * satır dönmüyordu; hata "Reklam hesabı bağlantısı bulunamadı" olurdu ve
     * kullanıcı bağlantısında sorun sanırdı.
     */
    const [row] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<
        Array<{
          connection_id: string;
          account_external_id: string;
          page_external_id: string | null;
          manager_external_id: string | null;
          currency: string;
          granted_scopes: string[];
          status: string;
          special_ad_categories: string[];
        }>
      >(Prisma.sql`
        SELECT a.connection_id::text AS connection_id,
               a.external_id AS account_external_id,
               sp.external_id AS page_external_id,
               a.manager_external_id,
               a.currency, c.granted_scopes, c.status::text AS status,
               cl.special_ad_categories
        FROM ad_accounts a
        JOIN platform_connections c ON c.id = a.connection_id
        -- KATEGORİLER MÜŞTERİDEN, kampanyadan değil: bir emlak firması her
        -- kampanyasında emlakçı.
        JOIN clients cl ON cl.id = ${campaign.clientId}::uuid
        LEFT JOIN social_profiles sp ON sp.id = ${socialProfileId}::uuid
        WHERE a.id = ${campaign.adAccountId}::uuid
      `),
    );
    if (!row) throw new BadRequestException('Reklam hesabı bağlantısı bulunamadı');
    if (row.status !== 'active') {
      throw new BadRequestException(
        `Platform bağlantısı etkin değil (${row.status}) — yeniden bağlanmak gerekiyor.`,
      );
    }

    let leadFormExternalId: string | undefined;
    if (leadFormId) {
      const [form] = await this.prisma.withTenant(ctx, (tx) =>
        tx.$queryRaw<Array<{ external_form_id: string | null }>>(Prisma.sql`
          SELECT external_form_id FROM lead_forms
          WHERE id = ${leadFormId}::uuid AND org_id = ${ctx.orgId}::uuid
        `),
      );
      // Meta'da var olmayan bir forma referans veren kreatif reddediliyor ve
      // hata mesajı ("Invalid parameter") sebebi hiç anlatmıyor.
      if (!form?.external_form_id) {
        throw new BadRequestException(
          'Seçilen form henüz Meta’da yayınlanmamış. Kütüphane > Formlar bölümünden yayınla.',
        );
      }
      leadFormExternalId = form.external_form_id;
    }

    return {
      connectionId: row.connection_id,
      accountExternalId: row.account_external_id,
      // Google'da sayfa yok; boş dize gidiyor ve sağlayıcı onu okumuyor.
      pageExternalId: row.page_external_id ?? '',
      managerExternalId: row.manager_external_id ?? undefined,
      currency: row.currency,
      grantedScopes: row.granted_scopes ?? [],
      leadFormExternalId,
      specialAdCategories: (row.special_ad_categories ?? []) as SpecialAdCategory[],
    };
  }

  /**
   * Dış kimlikler AĞACIN KENDİ SEVİYELERİNE yazılıyor.
   *
   * Hepsini kampanyaya yığmak kolay olurdu ama sonra "bu reklam grubu
   * platformda hangisi" sorusunun cevabı olmazdı — ve o soru, ikinci bir grup
   * eklendiği gün sorulacak.
   */
  private async markPublished(
    ctx: TenantContext,
    campaignId: string,
    adGroupId: string,
    adId: string,
    result: { campaignId: string; adSetId: string; creativeId: string; adId: string },
  ): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE draft_campaigns SET
          status = 'published',
          external_campaign_id = ${result.campaignId},
          error = NULL,
          published_at = now(),
          updated_at = now()
        WHERE id = ${campaignId}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE draft_ad_groups SET
          external_ad_set_id = ${result.adSetId}, error = NULL, updated_at = now()
        WHERE id = ${adGroupId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE draft_ads SET
          external_ad_id = ${result.adId},
          external_creative_id = ${result.creativeId},
          error = NULL,
          updated_at = now()
        WHERE id = ${adId}::uuid
      `);
    });
  }

  private async setAdRefs(
    ctx: TenantContext,
    adId: string,
    externalAdId: string,
    externalCreativeId: string,
  ): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE draft_ads SET
          external_ad_id = ${externalAdId},
          external_creative_id = ${externalCreativeId},
          error = NULL,
          updated_at = now()
        WHERE id = ${adId}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
  }

  private async setAdError(ctx: TenantContext, adId: string, error: string): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE draft_ads SET error = ${error}, updated_at = now()
        WHERE id = ${adId}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
  }

  private async fail(ctx: TenantContext, campaignId: string, error: string): Promise<void> {
    await this.setStatus(ctx, campaignId, 'failed', error);
  }

  private async setStatus(
    ctx: TenantContext,
    campaignId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE draft_campaigns SET status = ${status}, error = ${error}, updated_at = now()
        WHERE id = ${campaignId}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
  }
}

interface LoadedCreative {
  texts: CreativeTexts;
  assets: Array<{ id: string; width: number; height: number }>;
}

/**
 * JSONB'den gelen havuzun eksik alanlarını tamamlar.
 *
 * Veritabanındaki eski bir satır yalnızca `headlines` taşıyor olabilir ve
 * `packTextsFor` dizileri okurken `undefined` üzerinde patlardı — okuma
 * anında normalize etmek, her çağıran yerde kontrol yazmaktan güvenli.
 */
function normalizeTexts(raw: Partial<CreativeTexts> | null): CreativeTexts {
  return {
    primaryText: raw?.primaryText,
    headlines: raw?.headlines ?? [],
    longHeadlines: raw?.longHeadlines ?? [],
    descriptions: raw?.descriptions ?? [],
  };
}

/**
 * Ağaçtaki ayarlardan `AdvancedSettings` toplar.
 *
 * KAMPANYA VE GRUP AYRI YERLERDE TUTUYOR — Meta'da da öyle: amaç ve teklik
 * kampanyanın, optimizasyon ve hedefleme ad set'in alanları. `AdvancedSettings`
 * ikisini tek nesnede birleştiriyor çünkü `resolveSpec` ve `validateAdvanced`
 * onu bekliyor; birleştirme burada, tek yerde.
 *
 * BASİT YÜZEYDE `null` DÖNÜYOR ve dönmeli: orada kararları biz verdik ve
 * `campaignSpec` çalışmalı. Eksik bir ayarı varsayılanla doldurup uzman gibi
 * davranmak, kullanıcının seçmediği bir hedefle yayınlamak olurdu.
 */
function advancedFrom(
  campaign: DraftCampaignRecord,
  group: DraftAdGroupRecord | undefined,
): AdvancedSettings | null {
  if (campaign.surface !== 'expert' || !group) return null;
  const c = campaign.settings ?? {};
  const g = group.settings ?? {};
  if (!c.objective || !g.optimizationGoal || !g.targeting || !g.placement) return null;

  return {
    objective: c.objective,
    optimizationGoal: g.optimizationGoal,
    billingEvent: g.billingEvent ?? 'IMPRESSIONS',
    destinationType: g.destinationType,
    bidStrategy: c.bidStrategy ?? 'LOWEST_COST_WITHOUT_CAP',
    bidAmount: c.bidAmount,
    budgetMode: campaign.budgetMode === 'lifetime' ? 'lifetime' : 'daily',
    startAt: g.startAt,
    endAt: campaign.endAt ?? undefined,
    targeting: g.targeting,
    placement: g.placement,
    pixelId: g.pixelId,
    conversionEvent: g.conversionEvent,
  } as AdvancedSettings;
}

/**
 * Teklif tutarını hesabın alt birimine çevirir.
 *
 * `150,50` → 15050 kuruş. Virgül ondalık ayırıcı olarak kabul ediliyor:
 * Türkçe klavyede varsayılan bu ve nokta beklemek sessizce NaN üretirdi —
 * teklif alanı boş gider, Meta varsayılanı uygular ve kullanıcı tavan
 * koyduğunu sanır.
 */
function bidToMinor(amount: string): bigint {
  const normalized = amount.replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('Teklif tutarı okunamadı.');
  }
  return BigInt(Math.round(value * 100));
}

function platformLabel(platform: string): string {
  return platform === 'google' ? 'Google Ads' : 'Meta';
}

/**
 * Bitiş tarihinden gün sayısı.
 *
 * SÜRESİZ BOOST YOK: taahhüt bazlı tavan hesabı gün sayısına dayanıyor
 * (`fitsInCap`) ve süresiz bir kayıt o hesabı anlamsız kılardı — ay sonunda
 * tavanın ne kadar aşıldığı hiç bilinmezdi. Bitiş yoksa yedi gün.
 */
function durationFrom(endAt: string | null): number {
  if (!endAt) return 7;
  const gun = Math.round((new Date(endAt).getTime() - Date.now()) / 86_400_000);
  return Math.max(1, Math.min(gun, 90));
}

function money(micros: bigint): string {
  return `${(micros / 1_000_000n).toLocaleString('tr-TR')} ₺`;
}
