import {
  advancedDefaultsFor,
  type AdvancedIssue,
  type AdvancedSettings,
  type AdvancedValidation,
  type BillingEvent,
  type DestinationType,
  type Objective,
  type OptimizationGoal,
} from '@advetics/shared';

/**
 * Meta uyumluluk matrisi — bu modülün asıl işi.
 *
 * BU DOSYA NEDEN VAR: Meta'da hedef (objective), optimizasyon hedefi
 * (optimization_goal), varış tipi (destination_type) ve faturalama olayı
 * (billing_event) BİRBİRİNE BAĞLI. Geçersiz bir kombinasyonun iki sonucu
 * oluyor ve ikincisi tehlikeli olan:
 *
 *   1. Meta isteği reddediyor — sinir bozucu ama görünür.
 *   2. Meta KABUL EDİYOR, ad set "aktif" görünüyor ve HİÇ DAĞITIM YAPMIYOR.
 *      Hata yok, uyarı yok, harcama sıfır. Ajans günlerce bekliyor.
 *
 * İkinci durum bu projedeki bütün diğer sessiz hatalarla aynı türden ve en
 * pahalısı: kampanya çalışıyor sanılıyor.
 *
 * Matris Meta'nın Marketing API belgelerinden çıkarıldı. CANLIDA
 * DOĞRULANMADI — `ads_management` onayı yok. Bu yüzden matris "izin verilenler
 * listesi" olarak yazıldı, "yasaklananlar listesi" olarak değil: bilmediğimiz
 * bir kombinasyon geçersiz sayılıyor, geçerli değil.
 */

interface ObjectiveRule {
  label: string;
  /** Kullanıcıya düz Türkçe: bu hedef ne işe yarıyor. */
  purpose: string;
  /** İZİN VERİLENLER — listede olmayan geçersiz. */
  optimizationGoals: readonly OptimizationGoal[];
  /** Bu hedefte anlamlı olan varış tipleri. Boşsa varış tipi kullanılmıyor. */
  destinationTypes: readonly DestinationType[];
  /** Sayfa kimliği `promoted_object` içinde gerekiyor mu. */
  needsPage: boolean;
}

export const OBJECTIVE_RULES: Record<Objective, ObjectiveRule> = {
  OUTCOME_LEADS: {
    label: 'Potansiyel müşteri',
    purpose: 'İletişim bilgisi toplamak — form, WhatsApp ya da mesaj.',
    optimizationGoals: [
      'LEAD_GENERATION',
      'QUALITY_LEAD',
      'CONVERSATIONS',
      'OFFSITE_CONVERSIONS',
      'LINK_CLICKS',
    ],
    destinationTypes: ['ON_AD', 'WEBSITE', 'WHATSAPP', 'MESSENGER'],
    needsPage: true,
  },
  OUTCOME_TRAFFIC: {
    label: 'Trafik',
    purpose: 'İnsanları web sitene göndermek.',
    optimizationGoals: ['LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'REACH', 'IMPRESSIONS'],
    destinationTypes: ['WEBSITE'],
    needsPage: false,
  },
  OUTCOME_ENGAGEMENT: {
    label: 'Etkileşim',
    purpose: 'Gönderiye tepki, yorum, paylaşım ya da video izlenmesi.',
    optimizationGoals: ['POST_ENGAGEMENT', 'THRUPLAY', 'REACH', 'IMPRESSIONS', 'CONVERSATIONS'],
    destinationTypes: ['WHATSAPP', 'MESSENGER'],
    needsPage: true,
  },
  OUTCOME_AWARENESS: {
    label: 'Bilinirlik',
    purpose: 'Mümkün olduğunca çok kişiye ulaşmak.',
    optimizationGoals: ['REACH', 'IMPRESSIONS', 'AD_RECALL_LIFT', 'THRUPLAY'],
    destinationTypes: [],
    needsPage: false,
  },
  OUTCOME_SALES: {
    label: 'Satış',
    purpose: 'Sitende satın alma ya da tanımlı bir dönüşüm.',
    optimizationGoals: ['OFFSITE_CONVERSIONS', 'LANDING_PAGE_VIEWS', 'LINK_CLICKS'],
    destinationTypes: ['WEBSITE'],
    needsPage: false,
  },
};

export const OPTIMIZATION_LABELS: Record<OptimizationGoal, string> = {
  LEAD_GENERATION: 'Form dolduranlar',
  QUALITY_LEAD: 'Nitelikli form dolduranlar',
  CONVERSATIONS: 'Mesaj yazanlar',
  OFFSITE_CONVERSIONS: 'Sitende dönüşüm yapanlar',
  LANDING_PAGE_VIEWS: 'Sayfayı gerçekten açanlar',
  LINK_CLICKS: 'Tıklayanlar',
  POST_ENGAGEMENT: 'Gönderiyle etkileşenler',
  THRUPLAY: 'Videoyu izleyenler',
  REACH: 'Ulaşılan kişi sayısı',
  IMPRESSIONS: 'Gösterim sayısı',
  AD_RECALL_LIFT: 'Reklamı hatırlayanlar',
};

/**
 * Faturalama olayı — optimizasyon hedefine bağlı.
 *
 * Meta çoğu optimizasyonda yalnızca `IMPRESSIONS` faturalamasına izin
 * veriyor. `LINK_CLICKS` faturalaması yalnızca tıklama optimizasyonunda,
 * `THRUPLAY` yalnızca video optimizasyonunda geçerli.
 *
 * Yanlış eşleşme Meta tarafından reddediliyor — bu, görünür olan iyi durum.
 */
const BILLING_BY_GOAL: Partial<Record<OptimizationGoal, readonly BillingEvent[]>> = {
  LINK_CLICKS: ['IMPRESSIONS', 'LINK_CLICKS'],
  THRUPLAY: ['IMPRESSIONS', 'THRUPLAY'],
};

export function allowedBillingEvents(goal: OptimizationGoal): readonly BillingEvent[] {
  return BILLING_BY_GOAL[goal] ?? ['IMPRESSIONS'];
}

/**
 * Sitede dönüşüm ölçen optimizasyonlar — PİKSEL ZORUNLU.
 *
 * Pikselsiz `OFFSITE_CONVERSIONS` kampanyası hiç öğrenmiyor: Meta neyi
 * optimize edeceğini bilmiyor. Bütçe harcanıyor, sonuç sıfır kalıyor ve hata
 * mesajı yok.
 */
const NEEDS_PIXEL: readonly OptimizationGoal[] = ['OFFSITE_CONVERSIONS'];

/**
 * Anlık form gerektiren optimizasyonlar.
 *
 * `LEAD_GENERATION` + `ON_AD` bir form kimliği olmadan çalışmıyor; kreatif
 * forma referans veriyor ve form yoksa Meta kreatifi reddediyor.
 */
const NEEDS_LEAD_FORM: readonly OptimizationGoal[] = ['LEAD_GENERATION', 'QUALITY_LEAD'];

export function needsLeadForm(s: Pick<AdvancedSettings, 'optimizationGoal' | 'destinationType'>): boolean {
  return NEEDS_LEAD_FORM.includes(s.optimizationGoal) && s.destinationType === 'ON_AD';
}

// -----------------------------------------------------------------------------
// Doğrulama
// -----------------------------------------------------------------------------

export interface ValidationContext {
  /** Web sitesi adresi girilmiş mi — `WEBSITE` varışı bunu gerektiriyor. */
  hasLinkUrl: boolean;
  /** Taslağa bağlı bir anlık form var mı. */
  hasLeadForm: boolean;
  /** Yüklenen görsel oranları — yerleşim uyumu için. */
  ratios: readonly string[];
  /** Günlük bütçe (ana birim, TL). Teklif tavanı oranı için. */
  dailyBudget: number;
  currency: string;
}

/**
 * Gelişmiş ayarları doğrular.
 *
 * SIRA ÖNEMLİ: önce yapısal uyumsuzluklar (Meta reddeder ya da dağıtım
 * olmaz), sonra eksik ön koşullar, en son performans uyarıları. Kullanıcı
 * listenin başındaki şeyi çözmeden diğerleri anlamsız.
 */
export function validateAdvanced(
  s: AdvancedSettings,
  ctx: ValidationContext,
): AdvancedValidation {
  const blockers: AdvancedIssue[] = [];
  const warnings: AdvancedIssue[] = [];

  const rule = OBJECTIVE_RULES[s.objective];

  // ---------------------------------------------------------------------------
  // 1. Yapısal uyumluluk
  // ---------------------------------------------------------------------------

  if (!rule.optimizationGoals.includes(s.optimizationGoal)) {
    // EN TEHLİKELİ HATA BU. Meta bazı uyumsuz kombinasyonları kabul ediyor ve
    // ad set hiç dağıtım yapmıyor — "aktif" görünüyor, harcama sıfır.
    blockers.push({
      field: 'optimizationGoal',
      message:
        `"${rule.label}" hedefiyle "${OPTIMIZATION_LABELS[s.optimizationGoal]}" optimizasyonu ` +
        'birlikte çalışmıyor. Meta bunu bazen kabul ediyor ama reklam hiç gösterilmiyor.',
    });
  }

  if (s.destinationType && !rule.destinationTypes.includes(s.destinationType)) {
    blockers.push({
      field: 'destinationType',
      message: `"${rule.label}" hedefinde bu varış tipi kullanılamıyor.`,
    });
  }

  const billing = allowedBillingEvents(s.optimizationGoal);
  if (!billing.includes(s.billingEvent)) {
    blockers.push({
      field: 'billingEvent',
      message:
        `Bu optimizasyonla yalnızca ${billing.join(' / ')} faturalaması kullanılabiliyor.`,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Eksik ön koşullar
  // ---------------------------------------------------------------------------

  if (NEEDS_PIXEL.includes(s.optimizationGoal) && !s.pixelId) {
    blockers.push({
      field: 'pixelId',
      message:
        'Sitede dönüşüm optimizasyonu piksel olmadan çalışmıyor. Meta neyi optimize ' +
        'edeceğini bilemez; bütçe harcanır, sonuç gelmez.',
    });
  }

  if (s.pixelId && !s.conversionEvent) {
    blockers.push({
      field: 'conversionEvent',
      message: 'Piksel seçildi ama hangi olayın optimize edileceği belirtilmedi.',
    });
  }

  if (needsLeadForm(s) && !ctx.hasLeadForm) {
    blockers.push({
      field: 'leadForm',
      message:
        'Anlık form optimizasyonu seçildi ama forma bağlanmadı. ' +
        'Kütüphane > Formlar bölümünden bir form seç.',
    });
  }

  if (s.destinationType === 'WEBSITE' && !ctx.hasLinkUrl) {
    blockers.push({ field: 'linkUrl', message: 'Web sitesi varışında adres zorunlu.' });
  }

  // ---------------------------------------------------------------------------
  // 3. Bütçe ve takvim
  // ---------------------------------------------------------------------------

  if (s.budgetMode === 'lifetime' && !s.endAt) {
    // Meta toplam bütçeyi süreye bölerek dağıtıyor; süre yoksa bölecek bir
    // şey yok ve istek reddediliyor.
    blockers.push({
      field: 'endAt',
      message: 'Toplam bütçe kullanılıyorsa bitiş tarihi zorunlu.',
    });
  }

  if (s.startAt && s.endAt && s.endAt <= s.startAt) {
    blockers.push({ field: 'endAt', message: 'Bitiş, başlangıçtan sonra olmalı.' });
  }

  // ---------------------------------------------------------------------------
  // 4. Teklif
  // ---------------------------------------------------------------------------

  const capped =
    s.bidStrategy === 'COST_CAP' || s.bidStrategy === 'LOWEST_COST_WITH_BID_CAP';

  if (capped && !s.bidAmount) {
    blockers.push({ field: 'bidAmount', message: 'Bu stratejide bir tutar girmen gerekiyor.' });
  }

  if (capped && s.bidAmount) {
    const bid = Number(s.bidAmount.replace(',', '.'));
    /**
     * TAVAN GÜNLÜK BÜTÇENİN YARISINDAN BÜYÜKSE UYARI.
     *
     * Bu bir Meta kuralı değil, aritmetik: tavan bütçenin yarısıysa günde en
     * fazla iki sonuç alınabilir ve Meta'nın öğrenme aşaması (haftada ~50
     * sonuç) hiç tamamlanmaz. Kampanya öğrenmeden kalıyor ve maliyet hiç
     * düşmüyor.
     */
    if (ctx.dailyBudget > 0 && bid > ctx.dailyBudget / 2) {
      warnings.push({
        field: 'bidAmount',
        message:
          `Tavan (${bid} ${ctx.currency}) günlük bütçenin yarısından büyük. ` +
          'Günde birkaç sonuçtan fazlası alınamaz ve kampanya öğrenme aşamasını tamamlayamaz.',
      });
    }
    if (s.bidStrategy === 'LOWEST_COST_WITH_BID_CAP') {
      warnings.push({
        field: 'bidStrategy',
        message:
          'Teklif tavanı düşük kalırsa kampanya hiç dağıtım yapmaz — Meta bunu hata ' +
          'olarak bildirmez, ad set aktif görünür ve harcama sıfır kalır.',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Hedefleme
  // ---------------------------------------------------------------------------

  if (s.targeting.ageMin > s.targeting.ageMax) {
    blockers.push({ field: 'ageMax', message: 'Üst yaş, alt yaştan küçük olamaz.' });
  }

  if (s.targeting.ageMax - s.targeting.ageMin < 10) {
    warnings.push({
      field: 'ageMax',
      message:
        'Yaş aralığı çok dar. Meta 2023’ten beri geniş kitlede daha iyi sonuç veriyor; ' +
        'daraltma genelde maliyeti yükseltiyor.',
    });
  }

  if (s.targeting.genders !== 'all') {
    warnings.push({
      field: 'genders',
      message:
        'Cinsiyet daraltması kitleyi yarıya indiriyor. Ürün gerçekten tek cinsiyete ' +
        'yönelik değilse maliyeti yükseltir.',
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Yerleşim
  // ---------------------------------------------------------------------------

  if (s.placement.mode === 'manual') {
    const total = s.placement.facebookPositions.length + s.placement.instagramPositions.length;
    if (total === 0) {
      // Yerleşimsiz ad set dağıtım yapmıyor — yine sessiz.
      blockers.push({
        field: 'placement',
        message: 'Elle yerleşimde en az bir konum seçmen gerekiyor.',
      });
    }

    const wantsVertical =
      s.placement.facebookPositions.some((p) => p === 'story' || p === 'facebook_reels') ||
      s.placement.instagramPositions.some((p) => p === 'story' || p === 'reels');

    if (wantsVertical && !ctx.ratios.includes('vertical')) {
      // Kare görsel Hikâyeler'e kırpılıyor: metin kesiliyor, sonuç kötü
      // görünüyor. Engellemiyoruz — uzman bilerek yapıyor olabilir.
      warnings.push({
        field: 'placement',
        message:
          'Hikâye/Reels seçildi ama dikey görsel yüklenmedi. Kare görsel kırpılır ve ' +
          'metin kesilebilir.',
      });
    }

    if (total <= 2) {
      warnings.push({
        field: 'placement',
        message:
          'Az sayıda yerleşim, Meta’nın en ucuz envanteri bulmasını engelliyor. ' +
          'Otomatik yerleşim çoğu durumda daha ucuza sonuç veriyor.',
      });
    }
  }

  return { blockers, warnings };
}

/**
 * Gelişmiş ayarlardan varsayılan üretir.
 *
 * MODLAR ARASI GEÇİŞ BOŞ EKRAN OLMAMALI. Kullanıcı hızlı modda bir taslak
 * hazırlayıp gelişmişe geçtiğinde, hızlı modun kendi adına verdiği kararlar
 * karşısına DOLU olarak çıkıyor — hem başlangıç noktası oluyor hem de
 * "bizim adına ne seçtiğimizi" gösteriyor.
 */
export function defaultsFromSpec(spec: {
  objective: string;
  optimizationGoal: string;
  billingEvent: string;
  destinationType?: string;
}): AdvancedSettings {
  return {
    ...advancedDefaultsFor('website'),
    objective: spec.objective as Objective,
    optimizationGoal: spec.optimizationGoal as OptimizationGoal,
    billingEvent: spec.billingEvent as BillingEvent,
    destinationType: spec.destinationType as DestinationType | undefined,
  };
}
