import { AB_SIYASI_BEYAN, campaignBudgetBody, kampanyaDiliBody, kampanyaKonumlariBody, kampanyaTarihleri } from './google-write';
import { googleGorselVarligi, googleImageAssetBody, type AtomikGovde, type GoogleGorselKaynagi, type KampanyaAcilisi } from './google-demandgen';

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
  validateOnly: boolean;
}

export interface AtomikPmaxSirasi {
  kampanya: number;
  /** Varlık grubu (rehberin "reklam grubu" yuvası). */
  reklamGrubu: number;
  /** Maks. Performans'ta reklam nesnesi YOK: Google reklamları varlık grubundan kendisi kuruyor. */
  reklam: null;
  logo: number | null;
  gorseller: Array<{ varlikId: string; sira: number }>;
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
  const KAMPANYA = `${kok}/campaigns/-2`;
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
        name: `${p.name} — ${p.stamp}`,
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

  return {
    govde: { mutateOperations: ops, partialFailure: false, validateOnly: p.validateOnly },
    sira: { kampanya, reklamGrubu, reklam: null, logo: logoSira, gorseller: yeniGorseller },
  };
}
