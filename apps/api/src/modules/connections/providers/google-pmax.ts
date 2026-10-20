import { AB_SIYASI_BEYAN, campaignBudgetBody, kampanyaDiliBody, kampanyaKonumlariBody, kampanyaTarihleri } from './google-write';
import { googleGorselVarligi, googleImageAssetBody, kitleBoyutlari, rehberKitlesiCreate, type AtomikGovde, type GoogleGorselKaynagi, type GoogleKitleBoyutlari, type KampanyaAcilisi } from './google-demandgen';
import { PMAX_TEKLIF_HEDEFI, donusumHedefiAnahtari, type GoogleDonusumHedefi } from '@advetics/shared';

/**
 * ═══ MAKS. PERFORMANS (Performance Max) — rehberin "Sitemden satış gelsin" ═══
 *
 * Bütün alan adları v25 referansından ve Google'ın resmî
 * `AddPerformanceMaxCampaign` örneğinden (2026-10-11 okundu). CANLIDA HİÇ
 * KOŞMADI; ilk gerçek çağrı validateOnly provası.
 *
 * ═══ KARARLAR ═══
 *
 * TEKLİF `maximizeConversions` — Maks. Performans yalnız iki strateji kabul
 * ediyor (dönüşüm ya da dönüşüm değeri). Değer ölçümü olup olmadığını
 * bilmiyoruz; değersiz hesapta "değeri artır" sıfırı artırır. Ölçümsüz
 * hesapta kurgu HİÇ kurulmuyor (rehber `G-DONUSUM`): öğrenmeyen bir
 * Maks. Performans para yakar.
 *
 * MARKA KURALLARI AÇIK (`brandGuidelinesEnabled: true`) — v21'den beri yeni
 * kampanyada varsayılan zaten açık; açıkça yazılıyor çünkü alan
 * DEĞİŞTİRİLEMEZ ve iki hâlde işletme adı ile logo FARKLI yere bağlanıyor:
 * açıkken kampanyaya (`CampaignAsset`), kapalıyken varlık grubuna. Varsayılana
 * bırakıp yanlış yere bağlamak tüm isteği düşürür.
 *
 * OTOMASYONLAR (kampanya `assetAutomationSettings`, açıkça):
 * - `FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION` KAPALI: Maks. Performans'ta
 *   varsayılan AÇIK ve trafiği Google'ın seçtiği BAŞKA sayfalara gönderir.
 *   Kullanıcı "şu sayfa" dedi; satışın ölçüldüğü sayfa da o. (v25'te eski
 *   `url_expansion_opt_out` alanı Campaign'de YOK; yerine bu.)
 * - `TEXT_ASSET_AUTOMATION` KAPALI: Google'ın yazdığı başlık/açıklama
 *   kullanıcının onaylamadığı metin; yasal uyarılı sektörde risk.
 * - `GENERATE_IMAGE_EXTRACTION` KAPALI: siteden görsel çekmek, kullanıcının
 *   "kendi görsellerim" sözünün dışı.
 * - `GENERATE_IMAGE_ENHANCEMENT` AÇIK (açıkça): verilen görselin kırpılması
 *   ve netleştirilmesi; yeni içerik değil, aynı görsel. Daha çok yerleşime
 *   oturur.
 * - Video ÜRETİMİ için Maks. Performans'ta bir anahtar YOK (enum yalnız Talep
 *   Yaratma'ya özgü `GENERATE_VIDEOS_FROM_OTHER_ASSETS` tanıyor). YouTube
 *   videosu verilmezse Google görsellerden video üretebilir; karar tablosu
 *   bunu söylüyor.
 *
 * YAŞ ÖLÇÜTÜ YOK — rehber yaş > 18'de bu kurguyu durduruyor (`G-PMAX-YAS`).
 *
 * SIRA (resmî örnekle aynı): bütçe → kampanya → kampanya ölçütleri (konum,
 * dil) → VARLIK GRUBU → [varlık + varlık grubu bağı]… → marka varlıkları +
 * kampanya bağları. Varlık grubu ve asgari varlıkları AYNI istekte olmak
 * ZORUNDA (Google: "AssetGroup ... must be created in the same bulk mutate
 * request"); zaten tek atomik istek.
 *
 * ÖLÇÜLMEDİ — EN BÜYÜK RİSK: Google'ın örneği başlık ve açıklama metin
 * varlıklarını AYRI bir önceki istekte kuruyor ("repeated assets ... be
 * created before the campaign"); burada aynı istekte, geçici kimlikle.
 * validateOnly bunu reddederse ikinci yol devir notunda (metinler önce gerçek
 * bir istekle kurulur — metin varlığı para harcamaz, Google aynı metni
 * tekilleştirir).
 */

/**
 * ═══ KAMPANYA DÖNÜŞÜM HEDEFLERİ — YALNIZ SATIN ALMA (2026-10-13) ═══
 *
 * Kaynak: Google Ads API v25 "Performance Max › conversion goals" ve
 * `campaign_conversion_goal` alan referansı (2026-10-13 okundu).
 * - Kaynak adı: `customers/{customer_id}/campaignConversionGoals/{campaign_id}~{category}~{origin}`.
 * - Kampanya hedefleri Google tarafından kampanyayla birlikte KURULUYOR;
 *   bizim işlemimiz yalnız `update` (create yok). Belge: "biddable" alanı
 *   belirtilmezse HESAP varsayılanını devralır ve yeni hedeflerde bu
 *   varsayılan açık olabilir; kapatmak için `biddable: false` AÇIKÇA yazılıp
 *   `update_mask`e "biddable" konmalı.
 * - AYNI İSTEKTE GEÇİCİ KAMPANYA KİMLİĞİYLE: Google'ın resmî
 *   `AddPerformanceMaxRetailCampaign` örneği hedef güncellemelerini kampanya
 *   oluşturmayla TEK mutate'te, geçici kampanya kimliğiyle
 *   (`PERFORMANCE_MAX_CAMPAIGN_TEMPORARY_ID`) ve listenin SONUNDA gönderiyor;
 *   biddable yalnız `PURCHASE` + `WEBSITE`. Burada da aynısı.
 * CANLIDA ÖLÇÜLMEDİ: ilk sınama validateOnly provası (prova ve yayın aynı
 * gövde). Reddedilirse ikinci yol devir notunda: kampanya duraklatılmış
 * kurulur, hedefler AYRI mutate'le yazılır, geri okunur, sonra açılır.
 *
 * KÜMENİN TAMAMI yazılıyor: hesabın bütün müşteri düzeyi hedefleri (servis
 * `customer_conversion_goal`dan okuyor). Yalnız satın almayı açmak yetmez:
 * Advetics kurulumunun açtığı form/telefon/WhatsApp hedefleri hesap
 * varsayılanıyla teklife girerdi.
 */
export const PMAX_HEDEF_DEGERI = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Teklife giren hedeflerin anahtar kümesi (sıralı) — geri okuma bunu bekliyor. */
export function pmaxTeklifHedefleri(hedefler: readonly GoogleDonusumHedefi[]): string[] {
  const k = donusumHedefiAnahtari(PMAX_TEKLIF_HEDEFI);
  return hedefler.some((h) => donusumHedefiAnahtari(h) === k) ? [k] : [];
}

/**
 * Hedef güncelleme işlemleri. Kategori/kaynak Google enum'u olmalı: kaynak
 * adına giriyor ve tanınmayan bir değer (boş, `~` içeren) başka bir kaynağı
 * işaret edebilir — sessizce atlamak yerine FIRLATIR (derleyici önce süzer).
 * Aynı anahtar iki kez gelirse bir kez yazılır (ikinci güncelleme aynı
 * kaynağı iki kez değiştirmek olurdu).
 */
export function pmaxHedefIslemleri(customerId: string, kampanyaGeciciKimlik: string, hedefler: readonly GoogleDonusumHedefi[]): Array<Record<string, unknown>> {
  const teklif = donusumHedefiAnahtari(PMAX_TEKLIF_HEDEFI);
  const gorulen = new Set<string>();
  const ops: Array<Record<string, unknown>> = [];
  for (const h of hedefler) {
    if (!PMAX_HEDEF_DEGERI.test(h.kategori) || !PMAX_HEDEF_DEGERI.test(h.kaynak)) throw new Error(`Tanınmayan dönüşüm hedefi: ${String(h.kategori).slice(0, 40)}~${String(h.kaynak).slice(0, 40)}`);
    const anahtar = donusumHedefiAnahtari(h);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    ops.push({
      campaignConversionGoalOperation: {
        update: { resourceName: `customers/${customerId}/campaignConversionGoals/${kampanyaGeciciKimlik}~${anahtar}`, biddable: anahtar === teklif },
        // REST'te FieldMask dizge; belge "biddable"ın maskede olmasını şart koşuyor.
        updateMask: 'biddable',
      },
    });
  }
  if (!gorulen.has(teklif)) throw new Error('Hesapta siteden satın alma hedefi yok: Maks. Performans satın almaya bağlanamaz.');
  return ops;
}

/**
 * VARLIK SINIRLARI (Google Ads API "Performance Max asset requirements",
 * 2026-10-13 okundu): LOGO 1:1, en az 128×128, en çok 5120 KB, grupta en çok
 * 5; YOUTUBE_VIDEO en çok 15 (yönetici notu "5" diyordu; belge 15). Bugün
 * bir logo ve en çok bir video gidiyor; sınır, alan çoğaldığında sessizce
 * Google'ın reddine düşmesin diye burada.
 */
export const PMAX_EN_COK_LOGO = 5;
export const PMAX_EN_COK_VIDEO = 15;
export const PMAX_LOGO_EN_AZ_PIKSEL = 128;

/** Logo ölçüsü Maks. Performans LOGO kuralına uyuyor mu; bilinmiyorsa `null`. */
export function pmaxLogoKareMi(o: { genislik: number | null; yukseklik: number | null } | null | undefined): boolean | null {
  if (!o || !o.genislik || !o.yukseklik) return null;
  // Google oran payı ±%1 (görsel kuralıyla aynı, `google-gorsel.ts`).
  return Math.abs(o.genislik / o.yukseklik - 1) <= 0.01 && Math.min(o.genislik, o.yukseklik) >= PMAX_LOGO_EN_AZ_PIKSEL;
}

/**
 * Derlenmiş gövdede LOGO ve video bağlarını SAYAR (kampanya + varlık grubu):
 * sınırı aşan gövde Google'a gitmez. Gövdeden sayılıyor, girdiden değil:
 * bağ kuran ikinci bir yol eklendiğinde de tutsun.
 */
export function pmaxSinirSorunu(ops: ReadonlyArray<Record<string, unknown>>): string | null {
  const alan = (o: Record<string, unknown>) =>
    ((o.campaignAssetOperation ?? o.assetGroupAssetOperation) as { create?: { fieldType?: string } } | undefined)?.create?.fieldType;
  const logo = ops.filter((o) => alan(o) === 'LOGO').length;
  const video = ops.filter((o) => alan(o) === 'YOUTUBE_VIDEO').length;
  if (logo > PMAX_EN_COK_LOGO) return `Maks. Performans en çok ${PMAX_EN_COK_LOGO} logo alıyor (${logo}).`;
  if (video > PMAX_EN_COK_VIDEO) return `Maks. Performans en çok ${PMAX_EN_COK_VIDEO} YouTube videosu alıyor (${video}).`;
  return null;
}

/** Kampanyanın otomasyon ayarları — geri okuma da bunu bekliyor. */
export const PMAX_OTOMASYONU = [
  { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
  { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
  { assetAutomationType: 'GENERATE_IMAGE_EXTRACTION', assetAutomationStatus: 'OPTED_OUT' },
  { assetAutomationType: 'GENERATE_IMAGE_ENHANCEMENT', assetAutomationStatus: 'OPTED_IN' },
] as const;

/** Varlık grubu alan türleri (v25 `AssetFieldType`). */
export type PmaxAlani =
  | 'HEADLINE'
  | 'LONG_HEADLINE'
  | 'DESCRIPTION'
  | 'MARKETING_IMAGE'
  | 'SQUARE_MARKETING_IMAGE'
  | 'PORTRAIT_MARKETING_IMAGE'
  | 'YOUTUBE_VIDEO';

const ORAN_ALANI = { yatay: 'MARKETING_IMAGE', kare: 'SQUARE_MARKETING_IMAGE', dik45: 'PORTRAIT_MARKETING_IMAGE' } as const;

export interface AtomikPmaxIstegi {
  /** Kampanya adına damga eklenmez (rehber; `advKampanyaAdi`). */
  damgasiz?: boolean;
  customerId: string;
  name: string;
  stamp: string;
  dailyBudgetMicros: bigint;
  endDate: string | null;
  startDate?: string;
  acilis: KampanyaAcilisi;
  konumlar: string[];
  dil: string;
  finalUrl: string;
  businessName: string;
  logo: GoogleGorselKaynagi;
  gorseller: Array<{ varlikId: string; oran: 'yatay' | 'kare' | 'dik45'; kaynak: GoogleGorselKaynagi }>;
  basliklar: string[];
  uzunBasliklar: string[];
  aciklamalar: string[];
  youtubeVideo: { id: string; baslik: string } | null;
  /** Hesabın müşteri düzeyi dönüşüm hedefleri: yalnız satın alma teklife girer. */
  donusumHedefleri: readonly GoogleDonusumHedefi[];
  validateOnly: boolean;
  /**
   * KİTLE SİNYALİ (hedef kitleler 2. parça): rehberde seçilen Google
   * kitlesi. Maks. Performans'ta kitle bir SINIR değil, Google'a "önce
   * bunlara bak" ipucu (Google belgesi: audience signal); ekran bunu söylüyor.
   */
  kitle?: GoogleKitleBoyutlari | null;
}

export interface AtomikPmaxSirasi {
  kampanya: number;
  /** Varlık grubu (rehberin "reklam grubu" yuvası). */
  reklamGrubu: number;
  /** Maks. Performans'ta reklam nesnesi YOK: Google reklamları varlık grubundan kendisi kuruyor. */
  reklam: null;
  logo: number | null;
  gorseller: Array<{ varlikId: string; sira: number }>;
  /** Kitle sinyali bağının sırası; kitle seçilmediyse null. */
  kitleSinyali: number | null;
}

/** Varlık grubuna bağlanacak alanların SAYISI — geri okumanın beklediği. */
export function pmaxAlanSayilari(p: Pick<AtomikPmaxIstegi, 'basliklar' | 'uzunBasliklar' | 'aciklamalar' | 'gorseller' | 'youtubeVideo'>): Record<PmaxAlani, number> {
  const tekil = (x: string[]) => new Set(x).size;
  return {
    HEADLINE: tekil(p.basliklar),
    LONG_HEADLINE: tekil(p.uzunBasliklar),
    DESCRIPTION: tekil(p.aciklamalar),
    MARKETING_IMAGE: p.gorseller.filter((g) => g.oran === 'yatay').length,
    SQUARE_MARKETING_IMAGE: p.gorseller.filter((g) => g.oran === 'kare').length,
    PORTRAIT_MARKETING_IMAGE: p.gorseller.filter((g) => g.oran === 'dik45').length,
    YOUTUBE_VIDEO: p.youtubeVideo ? 1 : 0,
  };
}

function ilk(b: { operations: Array<{ create?: Record<string, unknown> }> }): Record<string, unknown> {
  const c = b.operations[0]?.create;
  if (!c) throw new Error('Gövde üreticisi create işlemi döndürmedi.');
  return c;
}

export function pmaxAtomikIstek(p: AtomikPmaxIstegi): { govde: AtomikGovde; sira: AtomikPmaxSirasi } {
  if (p.konumlar.length === 0) throw new Error('Konum listesi boş: kampanya bütün ülkelere açılırdı.');
  const kok = `customers/${p.customerId}`;
  const BUTCE = `${kok}/campaignBudgets/-1`;
  const KAMPANYA_GECICI = '-2';
  const KAMPANYA = `${kok}/campaigns/${KAMPANYA_GECICI}`;
  const GRUP = `${kok}/assetGroups/-3`;
  let gecici = -4;
  const yeniVarlik = () => `${kok}/assets/${gecici--}`;

  const ops: Array<Record<string, unknown>> = [];
  const ekle = (op: Record<string, unknown>): number => ops.push(op) - 1;

  // Bütçe AÇIK PAYLAŞIMSIZ (`campaignBudgetBody`): Maks. Performans paylaşımlı bütçe kabul etmiyor.
  ekle({ campaignBudgetOperation: { create: { ...ilk(campaignBudgetBody({ name: p.name, amountMicros: p.dailyBudgetMicros.toString(), stamp: p.stamp })), resourceName: BUTCE } } });
  const kampanya = ekle({
    campaignOperation: {
      create: {
        resourceName: KAMPANYA,
        name: p.damgasiz ? p.name : `${p.name} — ${p.stamp}`,
        status: p.acilis,
        // Alt tip VERİLMİYOR (Google: "No AdvertisingChannelSubType should be set").
        advertisingChannelType: 'PERFORMANCE_MAX',
        campaignBudget: BUTCE,
        maximizeConversions: {},
        containsEuPoliticalAdvertising: AB_SIYASI_BEYAN,
        brandGuidelinesEnabled: true,
        assetAutomationSettings: PMAX_OTOMASYONU.map((x) => ({ ...x })),
        // "Bulunanlar": Arama ile aynı gerekçe (ilgilenenler başka ülkeye akar).
        geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' },
        ...kampanyaTarihleri(p.startDate, p.endDate ?? undefined),
      },
    },
  });
  for (const o of [
    ...kampanyaKonumlariBody({ campaignResource: KAMPANYA, konumlar: p.konumlar }).operations,
    ...kampanyaDiliBody({ campaignResource: KAMPANYA, dil: p.dil }).operations,
  ]) {
    ekle({ campaignCriterionOperation: { create: o.create } });
  }

  /*
   * VARLIK GRUBU AÇIK (ENABLED). Google'ın örneği grubu PAUSED kuruyor ama
   * bizim akışımız yalnız KAMPANYAYI açıyor: grup duraklatılmış kalsaydı
   * kampanya açıldığında hiçbir şey yayınlanmazdı — hata yok, gösterim yok
   * (Demand Gen reklamıyla aynı ders). Yayın kararı tek yerde, kampanyada.
   */
  const reklamGrubu = ekle({
    assetGroupOperation: {
      create: { resourceName: GRUP, name: `${p.name} — varlık grubu ${p.stamp}`.slice(0, 128), campaign: KAMPANYA, finalUrls: [p.finalUrl], status: 'ENABLED' },
    },
  });

  /*
   * METİN VARLIKLARI: aynı metin TEK varlık. Aynı istekte aynı metinle iki
   * metin varlığı kurmanın sonucu ÖLÇÜLMEDİ (Google metni tekilleştiriyor);
   * tek varlık ve alan başına bir bağ kurmak bu soruyu hiç sormuyor.
   */
  const metinVarligi = new Map<string, string>();
  const metin = (t: string): string => {
    const var_ = metinVarligi.get(t);
    if (var_) return var_;
    const r = yeniVarlik();
    ekle({ assetOperation: { create: { resourceName: r, textAsset: { text: t } } } });
    metinVarligi.set(t, r);
    return r;
  };
  const bagla = (asset: string, fieldType: string) =>
    ekle({ assetGroupAssetOperation: { create: { assetGroup: GRUP, asset, fieldType } } });
  const baglananlar = new Set<string>();
  const metinBagla = (t: string, alan: PmaxAlani) => {
    const r = metin(t);
    // Aynı alana aynı varlığı iki kez bağlamak (iki aynı başlık) reddedilir: tekilleştir.
    if (baglananlar.has(`${r}|${alan}`)) return;
    baglananlar.add(`${r}|${alan}`);
    bagla(r, alan);
  };
  for (const t of p.basliklar) metinBagla(t, 'HEADLINE');
  for (const t of p.uzunBasliklar) metinBagla(t, 'LONG_HEADLINE');
  for (const t of p.aciklamalar) metinBagla(t, 'DESCRIPTION');

  const yeniGorseller: Array<{ varlikId: string; sira: number }> = [];
  for (const g of p.gorseller) {
    let r: string;
    if ('resource' in g.kaynak) r = g.kaynak.resource;
    else {
      r = yeniVarlik();
      const sira = ekle({
        assetOperation: { create: { ...googleGorselVarligi({ varlikId: g.varlikId, ad: g.kaynak.yeniGorsel.name, bytes: g.kaynak.yeniGorsel.bytes }, p.stamp), resourceName: r } },
      });
      yeniGorseller.push({ varlikId: g.varlikId, sira });
    }
    bagla(r, ORAN_ALANI[g.oran]);
  }
  if (p.youtubeVideo) {
    const r = yeniVarlik();
    ekle({
      assetOperation: {
        create: {
          resourceName: r,
          name: `${p.youtubeVideo.baslik.slice(0, 80)} — video ${p.stamp}`,
          type: 'YOUTUBE_VIDEO',
          youtubeVideoAsset: { youtubeVideoId: p.youtubeVideo.id, youtubeVideoTitle: p.youtubeVideo.baslik.slice(0, 100) },
        },
      },
    });
    bagla(r, 'YOUTUBE_VIDEO');
  }

  /*
   * KİTLE SİNYALİ: bir `Audience` + varlık grubuna `AssetGroupSignal` bağı.
   * YAŞ YOK: Maks. Performans'ta yaş sınırı kurulmuyor (derleyici 18 dışını
   * zaten reddediyor) ve sinyale yaş koymak "sınır" sanılırdı. Boyut yoksa
   * (kitle seçilmedi) hiçbir işlem eklenmez, gövde eskisiyle aynı.
   */
  const sinyalBoyutlari = kitleBoyutlari(p.customerId, [], p.kitle);
  let kitleSinyali: number | null = null;
  if (sinyalBoyutlari.length > 0) {
    const KITLE = `${kok}/audiences/${gecici--}`;
    ekle({ audienceOperation: { create: { ...rehberKitlesiCreate({ name: p.name, stamp: p.stamp, boyutlar: sinyalBoyutlari, yalnizYas: false }), resourceName: KITLE } } });
    kitleSinyali = ekle({ assetGroupSignalOperation: { create: { assetGroup: GRUP, audience: { audience: KITLE } } } });
  }

  // MARKA: kampanya düzeyinde (marka kuralları açık). İşletme adı da metin
  // varlığı; bir başlıkla aynıysa aynı varlık kullanılır.
  const ad = metin(p.businessName);
  ekle({ campaignAssetOperation: { create: { campaign: KAMPANYA, asset: ad, fieldType: 'BUSINESS_NAME' } } });
  let logoSira: number | null = null;
  let logo: string;
  if ('resource' in p.logo) logo = p.logo.resource;
  else {
    logo = yeniVarlik();
    logoSira = ekle({ assetOperation: { create: { ...ilk(googleImageAssetBody(p.logo.yeniGorsel)), resourceName: logo } } });
  }
  ekle({ campaignAssetOperation: { create: { campaign: KAMPANYA, asset: logo, fieldType: 'LOGO' } } });

  // HEDEFLER EN SONDA (resmî örnekle aynı sıra): kampanya bu istekte
  // kuruluyor ve geçici kimliği (-2) kaynak adına giriyor.
  for (const op of pmaxHedefIslemleri(p.customerId, KAMPANYA_GECICI, p.donusumHedefleri)) ekle(op);
  const sinir = pmaxSinirSorunu(ops);
  if (sinir) throw new Error(sinir);

  return {
    govde: { mutateOperations: ops, partialFailure: false, validateOnly: p.validateOnly },
    sira: { kampanya, reklamGrubu, reklam: null, logo: logoSira, gorseller: yeniGorseller, kitleSinyali },
  };
}
