import { GOAL_SPEC } from '@advetics/shared';
import type {
  AdvancedSettings,
  AssetRatio,
  CampaignGoal,
  PlacementInput,
  TargetingInput,
} from '@advetics/shared';

/**
 * Kampanya tipi → Meta ayarları.
 *
 * BU DOSYA ÜRÜNÜN ÇEKİRDEĞİ. "Reklamcılık bilmeyen biri kullanabilsin" vaadi,
 * pratikte "Meta'nın sorduğu her soruya biz cevap veriyoruz" demek ve o
 * cevapların tamamı burada.
 *
 * Saf fonksiyonlar: veritabanı yok, ağ yok, doğrudan test edilebilir. Bir
 * eşleme hatası SESSİZ — reklam yayınlanır, yanlış kişilere yanlış hedefle
 * gösterilir ve para harcanır. Hata mesajı yok.
 */

export interface MetaCampaignSpec {
  objective: string;
  optimizationGoal: string;
  billingEvent: string;
  /** Meta'nın `destination_type` alanı. Bazı tiplerde yok. */
  destinationType?: string;
  /** `promoted_object` gerekiyor mu ve neyle. */
  promotedObject?: Record<string, string>;
  callToAction: string;
  /** Kullanıcıya gösterilecek düz Türkçe açıklama. */
  explanation: string;
}

/**
 * Üç tipin tam eşlemesi.
 *
 * Her kararın gerekçesi yanında. Bu gerekçeler yorum olarak değil, ürün
 * kararı olarak duruyor: biri değiştirmek istediğinde neyi bozacağını
 * bilmeli.
 */
export function campaignSpec(goal: CampaignGoal, pageExternalId: string): MetaCampaignSpec {
  switch (goal) {
    /**
     * FORM — anlık form (Instant Form).
     *
     * `OUTCOME_LEADS` + `ON_AD`: form Meta'nın içinde açılıyor, web sitesine
     * gitmiyor. Web sitesi olmayan müşteri için tek çalışan yol ve
     * Türkiye'de dönüşüm maliyeti site formundan belirgin düşük — insanlar
     * uygulamadan çıkmıyor.
     *
     * `optimization_goal: LEAD_GENERATION` şart: `LINK_CLICKS` seçilseydi
     * Meta forma tıklayan ama doldurmayan kitleyi optimize ederdi ve
     * "300 tıklama, 4 form" tablosu çıkardı.
     */
    case 'form':
      return {
        // DEĞERLER `GOAL_SPEC`'TEN. Arayüz de gelişmiş moda geçerken aynı
        // tablodan besleniyor; iki yerde ayrı yazılsalardı zamanla ayrışır
        // ve kullanıcı hızlı modda kaydedip gelişmişe geçtiğinde bambaşka
        // bir ayar bulurdu.
        //
        // IMPRESSIONS faturalama: Meta lead başına faturalamayı küçük
        // hesaplarda desteklemiyor ve gösterim başına faturalama standart.
        ...GOAL_SPEC.form,
        promotedObject: { page_id: pageExternalId },
        callToAction: 'SIGN_UP',
        explanation:
          'Reklama tıklayan kişiye Facebook/Instagram içinde bir form açılır. ' +
          'Form doldurulduğunda bilgiler sana gelir. Web sitesi gerekmez.',
      };

    /**
     * WHATSAPP.
     *
     * `destination_type: WHATSAPP` + `promoted_object.page_id`. Meta bu
     * kombinasyonda "Click to WhatsApp" reklamı üretiyor ve tıklayan kişiyi
     * hazır bir mesajla WhatsApp'a atıyor.
     *
     * `CONVERSATIONS` optimizasyonu, `LINK_CLICKS` yerine: tıklayıp
     * WhatsApp'ı kapatan kişi değil, GERÇEKTEN yazan kişi optimize ediliyor.
     * Fark büyük ve bu, ajansın en çok kullanacağı tip.
     */
    case 'whatsapp':
      return {
        ...GOAL_SPEC.whatsapp,
        promotedObject: { page_id: pageExternalId },
        callToAction: 'WHATSAPP_MESSAGE',
        explanation:
          'Reklama tıklayan kişi doğrudan WhatsApp’ta sana mesaj yazar. ' +
          'Sohbet hazır bir mesajla açılır.',
      };

    /**
     * WEB SİTESİ.
     *
     * `OUTCOME_TRAFFIC` + `LANDING_PAGE_VIEW`, `LINK_CLICKS` DEĞİL.
     *
     * Fark kritik: `LINK_CLICKS` tıklamayı sayıyor, sayfanın açılmasını
     * değil. Yavaş açılan bir sitede tıklayanların yarısı sayfayı hiç
     * görmeden vazgeçiyor ve rapor "500 tıklama" derken siteye 240 kişi
     * giriyor. `LANDING_PAGE_VIEW` sayfası gerçekten açılanları optimize
     * ediyor — pixel gerektiriyor ama Meta pixel yoksa kendiliğinden
     * `LINK_CLICKS`e düşüyor, yani güvenli.
     *
     * `OUTCOME_SALES` KULLANILMIYOR: satış hedefi pixel + tanımlı dönüşüm
     * olayı istiyor ve ikisi de bu üründe henüz yok. Olmayan bir olayı
     * hedeflemek, kampanyanın hiç öğrenmemesi demek.
     */
    case 'website':
      return {
        ...GOAL_SPEC.website,
        callToAction: 'LEARN_MORE',
        explanation:
          'Reklama tıklayan kişi web sitene gider. Sayfayı gerçekten açanlara ' +
          'göre optimize edilir, sadece tıklayanlara göre değil.',
      };
  }
}

/**
 * Hedefleme — yaş, cinsiyet, ilgi alanı SORULMUYOR.
 *
 * Sebep hem ürünsel hem teknik:
 *
 *   · ÜRÜNSEL: reklamcılık bilmeyen biri "25-44 yaş, mobilya ilgisi" gibi bir
 *     daraltmayı yanlış yapar ve kitleyi öldürür. Meta'nın algoritması geniş
 *     kitlede kendi buluyor ve 2023'ten beri geniş hedefleme daraltmadan
 *     tutarlı biçimde daha iyi sonuç veriyor.
 *
 *   · TEKNİK: ilgi alanı seçimi ayrı bir arama uç noktası ve ayrı bir ekran
 *     demek. Kütüphane (BASE) bölümü yazıldığında kayıtlı kitleler buraya
 *     bağlanacak; o zamana kadar geniş hedefleme doğru varsayılan.
 *
 * ÜLKE sabit TR: bu ajansın müşterileri Türkiye'de. Yanlış ülkeye reklam
 * vermek en pahalı sessiz hata olurdu.
 */
export function defaultTargeting(): Record<string, unknown> {
  return {
    geo_locations: { countries: ['TR'] },
    age_min: 18,
    // ÜST YAŞ SINIRI YOK. 65+ Meta'da tek kova ve dışlamak, satın alma gücü
    // yüksek bir kitleyi sebepsiz atmak olur.
  };
}

/**
 * Yerleşimler — hangi görsel oranı yüklendiğine göre.
 *
 * Meta "otomatik yerleşim" öneriyor ve genelde doğru. Ama otomatik yerleşim,
 * dikey görsel yokken de Hikâyeler'de gösteriyor ve kare görseli oraya
 * kırpıyor: metin kesiliyor, sonuç kötü görünüyor.
 *
 * Bu yüzden yerleşimi YÜKLENEN GÖRSELE göre kısıtlıyoruz. Kullanıcı dikey
 * görsel yüklerse Hikâyeler açılıyor, yüklemezse açılmıyor.
 */
export function placementsFor(ratios: AssetRatio[]): Record<string, string[]> {
  const has = (r: AssetRatio): boolean => ratios.includes(r);

  const facebook: string[] = ['feed'];
  const instagram: string[] = ['stream'];

  if (has('vertical')) {
    facebook.push('story', 'facebook_reels');
    instagram.push('story', 'reels');
  }
  if (has('horizontal')) {
    // Sağ sütun yalnızca masaüstü ve yalnızca yatay/kare görselle mantıklı.
    facebook.push('right_hand_column', 'video_feeds');
  }

  return {
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: facebook,
    instagram_positions: instagram,
  };
}

/**
 * Görsel oranı → yerleşim eşlemesi (asset_customization_rules için).
 *
 * Meta bu kuralları "hangi yerleşimde hangi görsel" diye okuyor. Her
 * yerleşimin BİR kuralda karşılığı olmak zorunda; karşılıksız kalan bir
 * yerleşimde reklam hiç gösterilmiyor ve Meta bunu hata olarak da bildirmiyor.
 *
 * Bu yüzden kare her zaman VARSAYILAN kural: diğerlerinin kapsamadığı ne
 * varsa oraya düşüyor.
 */
export function customizationRules(ratios: AssetRatio[]): Array<Record<string, unknown>> {
  const rules: Array<Record<string, unknown>> = [];

  if (ratios.includes('vertical')) {
    rules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['story', 'facebook_reels'],
        instagram_positions: ['story', 'reels'],
      },
      image_label: { name: labelFor('vertical') },
    });
  }

  if (ratios.includes('horizontal')) {
    rules.push({
      customization_spec: {
        publisher_platforms: ['facebook'],
        facebook_positions: ['right_hand_column', 'video_feeds'],
      },
      image_label: { name: labelFor('horizontal') },
    });
  }

  // VARSAYILAN KURAL EN SONDA. Meta kuralları sırayla değerlendiriyor ve
  // ilk eşleşen kazanıyor; varsayılanı başa koymak diğer kuralları
  // işlevsiz bırakırdı.
  rules.push({
    customization_spec: {
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed'],
      instagram_positions: ['stream'],
    },
    image_label: { name: labelFor('square') },
  });

  return rules;
}

export function labelFor(ratio: AssetRatio): string {
  return `advetics_${ratio}`;
}

/**
 * Bitiş zamanı.
 *
 * `durationDays = 0` süresiz demek ve Meta'ya `end_time` göndermiyoruz.
 * Süresiz kampanya bilinçli bir seçim olmalı; arayüz varsayılan olarak 7 gün
 * öneriyor çünkü "unutulan kampanya" bu üründe en pahalı kullanıcı hatası.
 */
export function endTimeFor(durationDays: number, now: Date): Date | null {
  if (durationDays <= 0) return null;
  return new Date(now.getTime() + durationDays * 86_400_000);
}

/**
 * Toplam taahhüt.
 *
 * Süresiz kampanyada `null` — "sonsuz" diye bir sayı göstermek yerine
 * arayüz "süresiz" yazıyor ve bunun ne demek olduğunu açıklıyor.
 */
export function totalCommitmentMicros(
  dailyBudgetMicros: bigint,
  durationDays: number,
): bigint | null {
  return durationDays > 0 ? dailyBudgetMicros * BigInt(durationDays) : null;
}

// -----------------------------------------------------------------------------
// İKİ MODU BİRLEŞTİREN KATMAN
// -----------------------------------------------------------------------------

/**
 * Taslaktan Meta ayarlarını çözer — modu ne olursa olsun.
 *
 * BU FONKSİYON "TEK GİRİŞ, İKİ MOD"UN KİLİT TAŞI. Yayın yolu tek ve iki modu
 * da bu besliyor. İki ayrı yayın yolu olsaydı, birinde düzeltilen bir hata
 * diğerinde kalırdı ve fark ancak canlıda görülürdü.
 *
 * Basit modda kararı `campaignSpec` veriyor; gelişmiş modda kullanıcı veriyor
 * ama AYNI doğrulamadan (`objective-matrix.ts`) geçiyor. Kullanıcının seçimi
 * bizim eşlememizden daha ayrıcalıklı değil.
 */
export function resolveSpec(
  draft: { goal: CampaignGoal; mode: string; advanced: AdvancedSettings | null },
  pageExternalId: string,
): MetaCampaignSpec {
  if (draft.mode !== 'advanced' || !draft.advanced) {
    return campaignSpec(draft.goal, pageExternalId);
  }

  const a = draft.advanced;

  /**
   * `promoted_object` GELİŞMİŞ MODDA DA GEREKEBİLİYOR ve bunu kullanıcıya
   * sormuyoruz — teknik bir zorunluluk, stratejik bir karar değil.
   *
   * Piksel seçilmişse piksel + olay gidiyor; değilse sayfa kimliği. İkisini
   * birden göndermek Meta tarafından reddediliyor.
   */
  const promotedObject: Record<string, string> | undefined = a.pixelId
    ? { pixel_id: a.pixelId, custom_event_type: a.conversionEvent ?? 'LEAD' }
    : OBJECTIVE_NEEDS_PAGE.has(a.objective)
      ? { page_id: pageExternalId }
      : undefined;

  return {
    objective: a.objective,
    optimizationGoal: a.optimizationGoal,
    billingEvent: a.billingEvent,
    destinationType: a.destinationType,
    promotedObject,
    // CTA kullanıcıya sorulmuyor: varış tipinden türüyor ve uyumsuz bir CTA
    // Meta tarafından sessizce görmezden geliniyor (buton yine görünüyor ama
    // yanlış yere götürüyor).
    callToAction: ctaFor(a),
    explanation: 'Gelişmiş mod — ayarları sen belirledin.',
  };
}

/** `promoted_object.page_id` isteyen hedefler. */
const OBJECTIVE_NEEDS_PAGE = new Set(['OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT']);

function ctaFor(a: AdvancedSettings): string {
  switch (a.destinationType) {
    case 'ON_AD':
      return 'SIGN_UP';
    case 'WHATSAPP':
      return 'WHATSAPP_MESSAGE';
    case 'MESSENGER':
      return 'MESSAGE_PAGE';
    default:
      return a.objective === 'OUTCOME_SALES' ? 'SHOP_NOW' : 'LEARN_MORE';
  }
}

/**
 * Gelişmiş moddan Meta hedefleme nesnesi.
 *
 * `age_max = 65` GÖNDERİLMİYOR. Meta'da 65 "65 ve üzeri" demek ve alanı
 * göndermek ile göndermemek aynı sonucu veriyor; ama göndermek, Ads
 * Manager'da "18-65" yazması ve kullanıcının 66 yaşındakilerin dışlandığını
 * sanması demek.
 */
export function targetingFrom(t: TargetingInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    geo_locations:
      t.cityKeys.length > 0
        ? { countries: t.countries, cities: t.cityKeys.map((key) => ({ key })) }
        : { countries: t.countries },
    age_min: t.ageMin,
  };
  if (t.ageMax < 65) out.age_max = t.ageMax;
  // Meta: 1 = erkek, 2 = kadın. Alan hiç gönderilmezse ikisi de.
  if (t.genders === 'male') out.genders = [1];
  if (t.genders === 'female') out.genders = [2];
  if (t.locales.length > 0) out.locales = t.locales;
  return out;
}

/**
 * Gelişmiş moddan yerleşim.
 *
 * OTOMATİK YERLEŞİMDE HİÇBİR ŞEY GÖNDERİLMİYOR — boş nesne değil, alanların
 * kendisi yok. Meta'ya boş `publisher_platforms` göndermek "hiçbir platform"
 * demek ve ad set hiç dağıtım yapmıyor; alanı hiç göndermemek "hepsi" demek.
 * İkisi arasındaki fark sessiz bir sıfır harcama.
 */
export function placementsFrom(p: PlacementInput): Record<string, string[]> {
  if (p.mode === 'auto') return {};

  const out: Record<string, string[]> = { publisher_platforms: p.platforms };
  if (p.platforms.includes('facebook') && p.facebookPositions.length > 0) {
    out.facebook_positions = [...p.facebookPositions];
  }
  if (p.platforms.includes('instagram') && p.instagramPositions.length > 0) {
    out.instagram_positions = [...p.instagramPositions];
  }
  return out;
}

/**
 * Gelişmiş modda başlangıç/bitiş.
 *
 * Boş bırakılan başlangıç = hemen. Bitiş yoksa süresiz — ama toplam bütçe
 * kullanılıyorsa doğrulama bitişi zaten zorunlu kılıyor.
 */
export function scheduleFrom(a: AdvancedSettings): { startAt: Date | null; endAt: Date | null } {
  return {
    startAt: a.startAt ? new Date(a.startAt) : null,
    endAt: a.endAt ? new Date(a.endAt) : null,
  };
}
