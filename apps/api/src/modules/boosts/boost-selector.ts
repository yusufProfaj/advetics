import type { BoostCondition, BoostMetric } from '@advetics/shared';

/**
 * Boost aday seçimi — SAF fonksiyonlar.
 *
 * KURAL MOTORUNDAN TERS ASİMETRİ. Modül 5'te yanlış karar harcamayı durdurur;
 * burada BAŞLATIR. Durdurulan kampanya yeniden açılır, harcanan para geri
 * gelmez. Bu yüzden buradaki her eşik "seçmemeye" meyilli.
 */

export interface PostSnapshot {
  postId: string;
  publishedAt: Date;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
  engagements: number;
  /** Daha önce boost edildiyse dolu. */
  boostedAt: Date | null;
}

export interface SelectionContext {
  conditions: BoostCondition[];
  combinator: 'and' | 'or';
  minPostAgeHours: number;
  maxPostAgeHours: number;
  now: Date;
}

export type SkipReason =
  | 'too_new'
  | 'too_old'
  | 'already_boosted'
  | 'no_reach'
  | 'conditions_not_met';

export interface SelectionResult {
  selected: boolean;
  reason: string;
  skipReason?: SkipReason;
}

/**
 * Metrik değeri.
 *
 * `engagement_rate` YÜZDE olarak dönüyor: eşik de yüzde giriliyor (%4 için 4).
 * Erişim sıfırsa `null` — oran tanımsız ve sıfır saymak, hiç görülmemiş bir
 * gönderiyi "%0 etkileşim" diye elemek yerine "veri yok" demek.
 */
export function boostMetricValue(metric: BoostMetric, post: PostSnapshot): number | null {
  switch (metric) {
    case 'engagements':
      return post.engagements;
    case 'reach':
      return post.reach;
    case 'impressions':
      return post.impressions;
    case 'likes':
      return post.likes;
    case 'comments':
      return post.comments;
    case 'shares':
      return post.shares;
    case 'saves':
      return post.saves;
    case 'video_views':
      return post.videoViews;
    case 'engagement_rate':
      return post.reach > 0 ? (post.engagements / post.reach) * 100 : null;
  }
}

const METRIC_TEXT: Record<BoostMetric, string> = {
  engagements: 'Etkileşim',
  reach: 'Erişim',
  impressions: 'Gösterim',
  likes: 'Beğeni',
  comments: 'Yorum',
  shares: 'Paylaşım',
  saves: 'Kaydetme',
  video_views: 'Video izlenme',
  engagement_rate: 'Etkileşim oranı %',
};

export function selectPost(post: PostSnapshot, ctx: SelectionContext): SelectionResult {
  // 1. DAHA ÖNCE BOOST EDİLDİ Mİ.
  //
  // Aynı gönderiyi ikinci kez boost etmek, bütçeyi ikiye katlamak ve aynı
  // kitleye aynı içeriği tekrar göstermek. Veritabanında da kısmi tekil
  // indeks var; buradaki kontrol o kısıta çarpmadan önce anlaşılır bir
  // sebep üretmek için.
  if (post.boostedAt !== null) {
    return {
      selected: false,
      skipReason: 'already_boosted',
      reason: 'Bu gönderi daha önce boost edildi.',
    };
  }

  const ageHours = (ctx.now.getTime() - post.publishedAt.getTime()) / 3_600_000;

  // 2. ÇOK YENİ.
  //
  // İlk saatlerdeki etkileşim gönderinin gerçek performansını temsil
  // etmiyor: takipçilerin ilk dalgası her gönderide benzer davranıyor.
  // Beklemek, boost kararını gerçek veriye dayandırıyor.
  if (ageHours < ctx.minPostAgeHours) {
    return {
      selected: false,
      skipReason: 'too_new',
      reason: `Gönderi ${Math.floor(ageHours)} saatlik — en az ${ctx.minPostAgeHours} saat beklenmeli.`,
    };
  }

  // 3. ÇOK ESKİ. Ölü içeriğe para harcamak.
  if (ageHours > ctx.maxPostAgeHours) {
    return {
      selected: false,
      skipReason: 'too_old',
      reason: `Gönderi ${Math.floor(ageHours)} saatlik — sınır ${ctx.maxPostAgeHours} saat.`,
    };
  }

  // 4. HİÇ ERİŞİM YOKSA karar verilecek veri yok.
  //
  // Sıfır erişimli bir gönderi ya henüz ölçülmemiş ya da gerçekten kimseye
  // ulaşmamış. İkisini ayırt edemiyoruz ve boost etmek ilkinde erken,
  // ikincisinde yanlış olurdu.
  if (post.reach === 0) {
    return {
      selected: false,
      skipReason: 'no_reach',
      reason: 'Gönderinin erişim verisi henüz yok.',
    };
  }

  const matched: string[] = [];
  const results = ctx.conditions.map((c) => {
    const actual = boostMetricValue(c.metric, post);
    if (actual === null) return false;
    const ok = c.operator === 'gte' ? actual >= c.value : actual > c.value;
    if (ok) {
      matched.push(
        `${METRIC_TEXT[c.metric]} ${format(actual)} ${c.operator === 'gte' ? '≥' : '>'} ${format(c.value)}`,
      );
    }
    return ok;
  });

  const ok = ctx.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);
  if (!ok) {
    return {
      selected: false,
      skipReason: 'conditions_not_met',
      reason: 'Koşullar sağlanmadı.',
    };
  }

  return {
    selected: true,
    reason: matched.join(ctx.combinator === 'and' ? ' ve ' : ' veya '),
  };
}

function format(v: number): string {
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

/**
 * Aylık tavanın ne kadarı kaldı.
 *
 * TAAHHÜT EDİLEN tutar üzerinden hesaplanıyor, harcanan üzerinden değil.
 * Üç günlük bir boost açıldığı anda üç günlük bütçeyi taahhüt ediyor; yalnızca
 * bugüne kadar harcananı saymak, ay sonunda tavanın iki katına çıkmaya izin
 * verirdi — her gün "hâlâ yerimiz var" diyerek.
 */
export function remainingCapMicros(
  capMicros: bigint,
  committedMicros: bigint,
): bigint {
  const remaining = capMicros - committedMicros;
  return remaining > 0n ? remaining : 0n;
}

/**
 * Bu boost tavana sığıyor mu.
 *
 * KISMİ BOOST YOK. Kalan 100 ₺ ve boost 150 ₺ istiyorsa, bütçeyi 100'e
 * düşürüp açmak cazip görünüyor ama yanlış: kuralın tanımladığı günlük bütçe
 * bir performans varsayımı ve onu tek taraflı değiştirmek, kullanıcının
 * kurmadığı bir kampanya açmak olur.
 */
export function fitsInCap(
  dailyBudgetMicros: bigint,
  durationDays: number,
  remainingMicros: bigint,
): boolean {
  return dailyBudgetMicros * BigInt(durationDays) <= remainingMicros;
}
