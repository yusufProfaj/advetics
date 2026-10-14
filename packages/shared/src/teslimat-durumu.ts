/**
 * ═══ TESLİMAT DURUMU — "AÇIK MI" DEĞİL "YAYINDA MI" ═══
 * (pazar araştırması 2026-10-15, docs/pazar/reklam-yoneticisi.md)
 *
 * Reklam Yöneticisi'nin durum sütunu yalnız varlığın KENDİ durumunu
 * gösteriyordu: kampanyası duraklatılmış bir reklam seti, reddedilmiş bir
 * reklam "Yayında" görünüyor ve harcamıyordu. Google ve Meta'nın kendi
 * tabloları teslimatı gösteriyor; reklam bilmeyen kullanıcı için "Yayında
 * ama harcamıyor" en kafa karıştırıcı hâl.
 *
 * Sıra: kendi durumu kapalıysa o (kullanıcının kendi kararı), sonra ÜSTTEN
 * gelen engel (kampanya, sonra reklam seti), sonra platformun teslimat kodu.
 * Tanınmayan kod "Yayında" sayılmıyor değil, KENDİ durumuna düşüyor: bilinmeyen
 * bir kodu "reddedildi" diye yorumlamak tahmin olurdu.
 */
export interface TeslimatGirdisi {
  /** Varlığın kendi `EntityStatus`u. */
  status: string;
  /** Platformun teslimat kodu (Meta `effective_status`); yoksa null. */
  effectiveStatus: string | null;
  /** Bir üst varlığın durumu: setin kampanyası, reklamın seti. */
  ustDurum: string | null;
  /** Reklamın kampanyası (yalnız reklam düzeyinde). */
  kokDurum: string | null;
  seviye: 'campaign' | 'ad_group' | 'ad' | 'account';
}

export interface TeslimatDurumu {
  yayinda: boolean;
  ad: string;
}

const KENDI: Record<string, string> = {
  active: 'Yayında',
  paused: 'Duraklatıldı',
  deleted: 'Silindi',
  pending_review: 'İncelemede',
  ended: 'Bitti',
  unknown: 'Durumu bilinmiyor',
};

const KAPALI_UST = new Set(['paused', 'deleted', 'ended']);

/** Meta `effective_status` kodları; yalnız kullanıcıya ayrı bir şey söyleyenler. */
const META_KODU: Record<string, TeslimatDurumu> = {
  DISAPPROVED: { yayinda: false, ad: 'Reddedildi' },
  WITH_ISSUES: { yayinda: true, ad: 'Yayında, uyarı var' },
  IN_PROCESS: { yayinda: false, ad: 'İşleniyor' },
  PENDING_REVIEW: { yayinda: false, ad: 'İncelemede' },
  PENDING_BILLING_INFO: { yayinda: false, ad: 'Ödeme bilgisi bekliyor' },
  CAMPAIGN_PAUSED: { yayinda: false, ad: 'Kampanya duraklatıldı' },
  ADSET_PAUSED: { yayinda: false, ad: 'Reklam seti duraklatıldı' },
  /*
   * GOOGLE `campaign.serving_status` — yapı taraması kampanya satırında
   * `effective_status`a bunu yazıyor (`google.provider.ts`). Kampanya kendi
   * durumunda ENABLED (bizde `active`) olup bitiş tarihi geçmiş, başlangıcı
   * gelmemiş ya da askıya alınmış olabiliyor; üçü de harcamıyor. "Bütçeyle
   * sınırlı" BURADA DEĞİL: o `campaign.primary_status_reasons`ta ve o alan
   * okunmuyor (yeni GAQL alanı, canlıda ölçülmeli; PROGRESS.md).
   */
  ENDED: { yayinda: false, ad: 'Bitti (bitiş tarihi geçti)' },
  PENDING: { yayinda: false, ad: 'Başlamadı (başlangıç tarihi gelmedi)' },
  SUSPENDED: { yayinda: false, ad: 'Askıya alındı' },
};

export function teslimatDurumu(g: TeslimatGirdisi): TeslimatDurumu {
  if (g.status !== 'active') return { yayinda: false, ad: KENDI[g.status] ?? KENDI.unknown! };
  if (g.seviye === 'ad' && g.kokDurum && KAPALI_UST.has(g.kokDurum)) return { yayinda: false, ad: 'Kampanya duraklatıldı' };
  if (g.ustDurum && KAPALI_UST.has(g.ustDurum)) {
    return { yayinda: false, ad: g.seviye === 'ad' ? 'Reklam seti duraklatıldı' : 'Kampanya duraklatıldı' };
  }
  const kod = g.effectiveStatus?.toUpperCase();
  if (kod && META_KODU[kod]) return META_KODU[kod];
  return { yayinda: true, ad: KENDI.active! };
}
