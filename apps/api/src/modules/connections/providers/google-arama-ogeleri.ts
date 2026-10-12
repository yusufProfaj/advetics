import type { GoogleAramaOgeleri } from '@advetics/shared';
import { googleImageAssetBody, type GoogleGorselKaynagi } from './google-demandgen';

/**
 * ═══ ARAMA KAMPANYASI ÖĞELERİ — atomik isteğe EKLENEN işlemler (g-1.2.0) ═══
 *
 * İşletme adı (BUSINESS_NAME), işletme logosu (BUSINESS_LOGO), ek açıklamalı
 * snippet (STRUCTURED_SNIPPET), promosyon (PROMOTION) ve fiyat (PRICE):
 * her biri bir `Asset` + kampanyaya bağlayan bir `CampaignAsset`, AYNI
 * atomik istekte ve `partialFailure: false`. Ayrı bir ikinci istek, öğe
 * düştüğünde öğesiz açılan bir kampanya ve ekranda "logo eklendi" yazan bir
 * yalan bırakırdı.
 *
 * NEDEN AYRI DOSYA: logo görseli `googleImageAssetBody` (google-demandgen)
 * ile yükleniyor ve o dosya `google-write`ı içe aktarıyor; `aramaAtomikIstek`
 * buradan içe aktarsaydı döngü olurdu. Gövde `aramaAtomikIstek`in çıktısına
 * SONDAN ekleniyor: geçici kimlik ancak önce kurulduysa çözülüyor ve
 * öğelerin hepsi kampanyadan sonra, kendi bağından önce.
 *
 * ALAN ADLARI v25 başvurusundan (2026-10-12 okundu), CANLIDA ÖLÇÜLMEDİ:
 * - `AssetFieldType`: BUSINESS_NAME, BUSINESS_LOGO, STRUCTURED_SNIPPET,
 *   PROMOTION, PRICE (hepsi v25 enum'unda var).
 * - `TextAsset.text` (işletme adı), `StructuredSnippetAsset{header, values}`,
 *   `PromotionAsset{promotionTarget, percentOff | moneyAmountOff, languageCode,
 *   startDate, endDate}` (percent_off: 1.000.000 = %100),
 *   `PriceAsset{type, languageCode, priceOfferings[3-8]}` ve
 *   `PriceOffering{header, description, price{currencyCode, amountMicros}, finalUrl}`.
 *
 * ONAY DURUMU (politika incelemesi) kurulumdan SONRA ve günler sürebilir;
 * geri okuma öğenin VARLIĞINI ve içeriğini kıyaslıyor, onayını değil.
 */

export interface AramaOgeIstegi {
  customerId: string;
  /** Kampanyanın geçici kaynak adı (`aramaAtomikIstek` içinde -2). */
  kampanya: string;
  ogeler: GoogleAramaOgeleri;
  /** Logo: hesapta kayıtlı kaynak ya da bu istekte yüklenecek bayt. `ogeler.logoVarlikId` varken zorunlu. */
  logo: GoogleGorselKaynagi | null;
  paraBirimi: string;
  /** Fiyat kalemlerinin nihai adresi (reklamın hedefi). */
  finalUrl: string;
}

export interface AramaOgeSirasi {
  /** Öğelere ait BÜTÜN işlemler (öğe + bağ); öğe reddi teşhisi buna bakıyor. */
  islemler: number[];
  /** Yeni logo görseli bu istekte yüklendiyse sırası (önbelleğe yazılır). */
  logo: number | null;
}

/** Gövdedeki en küçük geçici kimlikten bir aşağısı: çakışma olmasın. */
function sonrakiGecici(ops: ReadonlyArray<Record<string, unknown>>): number {
  let enKucuk = -1;
  for (const m of JSON.stringify(ops).matchAll(/\/(?:assets|campaigns|adGroups|campaignBudgets)\/(-\d+)"/g)) enKucuk = Math.min(enKucuk, Number(m[1]));
  return enKucuk - 1;
}

/**
 * Öğe işlemlerini `ops`un SONUNA ekler ve sıralarını döner. Öğe yoksa hiçbir
 * işlem eklenmez (boş öğe göndermek yok).
 */
export function aramaOgeIslemleriEkle(ops: Array<Record<string, unknown>>, p: AramaOgeIstegi): AramaOgeSirasi {
  const kok = `customers/${p.customerId}`;
  let gecici = sonrakiGecici(ops);
  const yeni = () => `${kok}/assets/${gecici--}`;
  const islemler: number[] = [];
  const ekle = (op: Record<string, unknown>): number => {
    const i = ops.push(op) - 1;
    islemler.push(i);
    return i;
  };
  const bagla = (asset: string, fieldType: string) => ekle({ campaignAssetOperation: { create: { campaign: p.kampanya, asset, fieldType } } });
  const o = p.ogeler;
  let logo: number | null = null;

  if (o.isletmeAdi) {
    const r = yeni();
    ekle({ assetOperation: { create: { resourceName: r, textAsset: { text: o.isletmeAdi } } } });
    bagla(r, 'BUSINESS_NAME');
  }
  if (o.logoVarlikId) {
    // Logo kaynağı yoksa patlıyor: "logo eklendi" diyen ekranın arkasında
    // logosuz bir gövde gitmesin (servis kaynağı okuyamadıysa öğe düşmeli,
    // sessizce atlanmamalı).
    if (!p.logo) throw new Error('İşletme logosu seçildi ama görseli okunamadı.');
    let kaynak: string;
    if ('resource' in p.logo) kaynak = p.logo.resource;
    else {
      kaynak = yeni();
      const c = googleImageAssetBody(p.logo.yeniGorsel).operations[0]?.create;
      logo = ekle({ assetOperation: { create: { ...c, resourceName: kaynak } } });
    }
    bagla(kaynak, 'BUSINESS_LOGO');
  }
  if (o.snippet) {
    const r = yeni();
    ekle({ assetOperation: { create: { resourceName: r, structuredSnippetAsset: { header: o.snippet.baslik, values: o.snippet.degerler } } } });
    bagla(r, 'STRUCTURED_SNIPPET');
  }
  if (o.promosyon) {
    const x = o.promosyon;
    const r = yeni();
    ekle({
      assetOperation: {
        create: {
          resourceName: r,
          // Reklam tıklanınca reklamın kendi hedefine gider; Google öğe
          // başına nihai adres istiyor (ÖLÇÜLMEDİ, verilmesi zararsız).
          finalUrls: [p.finalUrl],
          promotionAsset: {
            promotionTarget: x.hedef,
            languageCode: 'tr',
            ...(x.yuzdeMicros !== null ? { percentOff: x.yuzdeMicros } : { moneyAmountOff: { currencyCode: p.paraBirimi, amountMicros: x.tutarMicros } }),
            ...(x.baslangic ? { startDate: x.baslangic } : {}),
            endDate: x.bitis,
          },
        },
      },
    });
    bagla(r, 'PROMOTION');
  }
  if (o.fiyat) {
    const r = yeni();
    ekle({
      assetOperation: {
        create: {
          resourceName: r,
          priceAsset: {
            type: o.fiyat.tur,
            languageCode: 'tr',
            // `priceQualifier` GÖNDERİLMİYOR: "başlayan"/"en çok" niteleyicisi
            // kullanıcının vermediği bir söz; yokken fiyat olduğu gibi okunur.
            priceOfferings: o.fiyat.kalemler.map((k) => ({
              header: k.baslik,
              description: k.aciklama,
              price: { currencyCode: p.paraBirimi, amountMicros: k.micros },
              finalUrl: p.finalUrl,
            })),
          },
        },
      },
    });
    bagla(r, 'PRICE');
  }
  return { islemler, logo };
}
