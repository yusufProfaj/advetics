import { z } from 'zod';

/**
 * Kreatif — metin havuzu + görsel havuzu.
 *
 * BU DOSYA META İLE GOOGLE'IN BİRLEŞTİĞİ YER. Kampanya, ad set ve yayın çağrısı
 * platforma özgü kalıyor ve kalmalı; birleşen tek şey kreatif.
 *
 * SEBEBİ İKİ PLATFORMUN METİN İSTEĞİNİN AYNI ŞEY OLMAMASI:
 *
 *   Meta            1 birincil metin + 1 başlık + 1 açıklama
 *   Google RSA      15'e kadar başlık (30 karakter) + 4'e kadar açıklama (90)
 *
 * Bugünkü model bunu taşıyamıyor: metinler `ad_drafts` tablosunun üç sütununda
 * (`primary_text`, `headline`, `description`) ve on beş başlık üç sütuna
 * sığmıyor. Her platform için ayrı sütun açmak ise aynı cümlenin iki yerde
 * durması demek — biri düzeltilir, diğeri unutulur ve fark yalnızca yayına
 * çıkan reklamda görülür.
 *
 * ÇÖZÜM: kullanıcı bir HAVUZ dolduruyor, her platform kendi paketini o
 * havuzdan kuruyor (`packTextsFor`). Kullanıcı bir kez yazıyor; Meta bir
 * başlık alıyor, Google on beşin en iyisini kendi seçiyor.
 */

// -----------------------------------------------------------------------------
// Metin havuzu
// -----------------------------------------------------------------------------

/**
 * HAVUZ SINIRLARI GEVŞEK, PAKETLEME SINIRLARI SIKI — ve bu bilinçli.
 *
 * 45 karakterlik bir başlık Meta'da sorunsuz, Google RSA'da uzun. Girişte
 * 30 karakterle kesmek, yalnızca Meta'ya çıkacak kullanıcıya Google'ın
 * kuralını dayatmak olurdu. Tersi de doğru değil: sınırsız bırakmak, veriyi
 * hiçbir platformun kabul etmeyeceği hâlde saklamak demek.
 *
 * Buradaki sınırlar "hiçbir platformda işe yaramayacak kadar uzun" eşiği;
 * gerçek kısıt `packTextsFor` içinde, hedef platform belliyken uygulanıyor
 * ve kullanıcıya HANGİ platformda neyin sığmadığı söyleniyor.
 */
export const CREATIVE_TEXT_CAPS = {
  primaryText: 2000,
  headline: 255,
  longHeadline: 255,
  description: 255,
  /** Havuzda tutulabilecek en fazla parça — Google RSA'nın 15'i tavan. */
  maxHeadlines: 15,
  maxLongHeadlines: 5,
  maxDescriptions: 5,
} as const;

export const creativeTextsSchema = z.object({
  /**
   * Meta'nın "birincil metin"i — görselin ÜSTÜNDE görünen uzun yazı.
   *
   * Google'da karşılığı YOK ve bu yüzden opsiyonel. Yalnızca Google'a çıkan
   * bir kreatifte doldurulması gerekmiyor; zorunlu kılmak, Google kullanıcısına
   * hiçbir yerde görünmeyecek bir metin yazdırmak olurdu.
   */
  primaryText: z.string().trim().max(CREATIVE_TEXT_CAPS.primaryText).optional(),

  /**
   * Kısa başlıklar. SIRA ANLAMLI, rastgele değil.
   *
   * Meta tek başlık alıyor ve `headlines[0]`'ı kullanıyor. Sırayı önemsiz
   * saymak, kullanıcının Google için yazdığı on beşinci alternatifin Meta
   * reklamında ana başlık olarak çıkması demek olurdu.
   */
  headlines: z.array(z.string().trim().min(1).max(CREATIVE_TEXT_CAPS.headline))
    .max(CREATIVE_TEXT_CAPS.maxHeadlines)
    .default([]),

  /** Google'ın uzun başlığı. Meta'da karşılığı yok. */
  longHeadlines: z
    .array(z.string().trim().min(1).max(CREATIVE_TEXT_CAPS.longHeadline))
    .max(CREATIVE_TEXT_CAPS.maxLongHeadlines)
    .default([]),

  descriptions: z
    .array(z.string().trim().min(1).max(CREATIVE_TEXT_CAPS.description))
    .max(CREATIVE_TEXT_CAPS.maxDescriptions)
    .default([]),
});

export type CreativeTexts = z.infer<typeof creativeTextsSchema>;

/** Boş havuz — arayüzün başlangıç değeri. */
export function emptyCreativeTexts(): CreativeTexts {
  return { headlines: [], longHeadlines: [], descriptions: [] };
}

// -----------------------------------------------------------------------------
// Platform paketleme
// -----------------------------------------------------------------------------

/**
 * Paketleme hedefi — platform değil, REKLAM BİÇİMİ.
 *
 * Google'ın arama reklamı ile Performance Max'i aynı metni istemiyor; ikisini
 * "google" diye tek kovaya koymak, birinin kuralını diğerine uygulamak olurdu.
 *
 * PMAX ŞİMDİLİK YOK ve bu kasıtlı: kısa/uzun başlık dağılımı sürüme göre
 * değişiyor ve bu üründe henüz tek bir canlı Google yazma çağrısı yapılmadı.
 * Doğrulanmamış bir sayıyı buraya yazmak, kullanıcıya "hazır" görünen ama
 * platformun reddedeceği bir paket üretmek demek. K14 kapanıp yazma yolu
 * açıldığında eklenecek.
 */
export const CREATIVE_FORMATS = ['meta_single_image', 'google_rsa'] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export interface FormatTextSpec {
  label: string;
  /** Birincil metin kullanılıyor mu. */
  usesPrimaryText: boolean;
  headlines: { min: number; max: number; maxLength: number };
  descriptions: { min: number; max: number; maxLength: number };
}

export const FORMAT_TEXT_SPEC: Record<CreativeFormat, FormatTextSpec> = {
  /**
   * Meta tek görselli reklam.
   *
   * Başlık ZORUNLU DEĞİL (min 0): Meta başlıksız reklamı kabul ediyor ve
   * yalnızca birincil metinle yayınlıyor. Zorunlu kılmak, bugün çalışan bir
   * akışı bozmak olurdu — mevcut `publishCheck` bunu uyarı olarak veriyor,
   * engel olarak değil.
   */
  meta_single_image: {
    label: 'Meta — tek görselli reklam',
    usesPrimaryText: true,
    headlines: { min: 0, max: 1, maxLength: 255 },
    descriptions: { min: 0, max: 1, maxLength: 255 },
  },

  /**
   * Google duyarlı arama reklamı (RSA).
   *
   * EN AZ 3 BAŞLIK VE 2 AÇIKLAMA: Google bu sayının altındaki bir RSA'yı
   * oluşturmuyor. Sayılar Google Ads dokümantasyonundan; yazma yolu açıldığı
   * gün `google-check` ile canlıda teyit edilmeli — platformun bir alanı
   * kabul edip görmezden gelmesi bu projede birden çok kez görüldü.
   *
   * KARAKTER SINIRI META'DAN ÇOK DAHA DAR (30 / 90). Bu, havuzu Meta'ya göre
   * dolduran bir kullanıcının Google paketinin neden eksik çıktığının en
   * yaygın sebebi olacak; mesaj bunu hangi metin için söylediğini yazıyor.
   */
  google_rsa: {
    label: 'Google — duyarlı arama reklamı',
    usesPrimaryText: false,
    headlines: { min: 3, max: 15, maxLength: 30 },
    descriptions: { min: 2, max: 4, maxLength: 90 },
  },
};

export interface PackedTexts {
  format: CreativeFormat;
  primaryText?: string;
  headlines: string[];
  descriptions: string[];
  /** Yayını engelleyen eksikler. */
  blockers: string[];
  /** Engellemeyen ama sonucu etkileyen notlar. */
  warnings: string[];
}

/**
 * Havuzdan bir platform paketi kurar.
 *
 * SAF FONKSİYON: veritabanı yok, ağ yok, doğrudan test edilebilir. Bu dosyanın
 * `goal-mapping.ts` ile aynı sınıfta olmasının sebebi bu — bir paketleme
 * hatası SESSİZ: reklam yayınlanır, başlığı eksik ya da kırpılmış çıkar,
 * hiçbir hata mesajı görünmez.
 *
 * SIĞMAYAN METİN KIRPILMIYOR, ELENİYOR ve sebebi yazılıyor. Kırpmak cazip
 * görünüyor ("30 karakterde kes") ama cümlenin ortasından kesilmiş bir başlık
 * reklamda kullanıcının yazmadığı bir şey söyler. Elemek, kullanıcıya
 * "bunu kısalt" deme şansı bırakıyor.
 */
export function packTextsFor(format: CreativeFormat, texts: CreativeTexts): PackedTexts {
  const spec = FORMAT_TEXT_SPEC[format];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const headlines = fit(texts.headlines, spec.headlines.maxLength, spec.headlines.max, {
    label: 'Başlık',
    formatLabel: spec.label,
    warnings,
  });

  const descriptions = fit(
    texts.descriptions,
    spec.descriptions.maxLength,
    spec.descriptions.max,
    { label: 'Açıklama', formatLabel: spec.label, warnings },
  );

  if (headlines.length < spec.headlines.min) {
    blockers.push(
      `${spec.label}: en az ${spec.headlines.min} başlık gerekiyor, ` +
        `${headlines.length} tane sığdı (en fazla ${spec.headlines.maxLength} karakter).`,
    );
  }
  if (descriptions.length < spec.descriptions.min) {
    blockers.push(
      `${spec.label}: en az ${spec.descriptions.min} açıklama gerekiyor, ` +
        `${descriptions.length} tane sığdı (en fazla ${spec.descriptions.maxLength} karakter).`,
    );
  }

  /**
   * BİRİNCİL METİN KULLANILMAYAN BİÇİMDE SESSİZCE DÜŞÜRÜLMÜYOR.
   *
   * Kullanıcı Meta için uzun bir ana metin yazıp Google'a da çıkarsa, o
   * metnin hiçbir yerde görünmeyeceğini bilmeli. Sessizce atmak, "yazdığım
   * metin nerede" sorusunun cevapsız kalması demek.
   */
  if (!spec.usesPrimaryText && texts.primaryText) {
    warnings.push(`${spec.label}: ana metin bu biçimde kullanılmıyor, gönderilmeyecek.`);
  }

  return {
    format,
    primaryText: spec.usesPrimaryText ? texts.primaryText : undefined,
    headlines,
    descriptions,
    blockers,
    warnings,
  };
}

/**
 * Sınırı aşanları eleyip, fazlasını kırpar.
 *
 * İKİ AYRI ELEME VE İKİSİ DE SAYILIYOR — sessiz kesme yok:
 *   · uzunluğu tutmayanlar (kullanıcı kısaltabilir)
 *   · sığdıktan sonra kotaya girmeyenler (platform zaten almıyor)
 */
function fit(
  items: string[],
  maxLength: number,
  maxCount: number,
  ctx: { label: string; formatLabel: string; warnings: string[] },
): string[] {
  const tooLong = items.filter((t) => t.length > maxLength);
  const usable = items.filter((t) => t.length <= maxLength);

  if (tooLong.length > 0) {
    ctx.warnings.push(
      `${ctx.formatLabel}: ${tooLong.length} ${ctx.label.toLowerCase()} ` +
        `${maxLength} karakteri aştığı için kullanılmadı.`,
    );
  }

  if (usable.length > maxCount) {
    ctx.warnings.push(
      `${ctx.formatLabel}: ${usable.length} ${ctx.label.toLowerCase()} var, ` +
        `ilk ${maxCount} tanesi kullanıldı.`,
    );
  }

  return usable.slice(0, maxCount);
}

// -----------------------------------------------------------------------------
// Kayıt ve girdi
// -----------------------------------------------------------------------------

export const creativeInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1, 'Kreatife bir ad ver').max(200),
  texts: creativeTextsSchema,
  /**
   * Arşivdeki görseller. ORAN BURADA SORULMUYOR.
   *
   * Hangi görselin hangi yerleşime gideceğini `coverageFor` ölçülen
   * boyutlardan hesaplıyor ve iki platformu da biliyor. Kullanıcıya oran
   * sormak, `asset-routing`'in zaten bildiği bir şeyi ona yaptırmak olurdu.
   */
  assetIds: z.array(z.string().uuid()).max(20).default([]),
});

export type CreativeInput = z.infer<typeof creativeInputSchema>;

export interface CreativeAssetRef {
  assetId: string;
  name: string;
  width: number;
  height: number;
  /** image | logo */
  kind: string;
  previewUrl: string;
}

export interface CreativeRecord {
  id: string;
  clientId: string;
  name: string;
  texts: CreativeTexts;
  assets: CreativeAssetRef[];
  createdAt: string;
  updatedAt: string;
}
