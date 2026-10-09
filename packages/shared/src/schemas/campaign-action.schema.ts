import { z } from 'zod';
import type { Platform } from '../constants/platforms';

/**
 * Yayınlanmış bir kampanyada elle tetiklenen aksiyon — panel butonu ya da
 * AI asistanı onay kartı AYNI şemayı gönderiyor.
 *
 * `amountMicros` STRING: para BigInt olarak taşınıyor ve BigInt JSON'a hiç
 * girmiyor (`draft-tree.schema.ts`teki `budgetAmountMicros` ile aynı kural).
 */
export const campaignActionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({
    type: z.literal('set_budget'),
    amountMicros: z
      .string()
      .regex(/^\d+$/, 'amountMicros yalnızca rakam olmalı')
      .refine((v) => BigInt(v) > 0n, 'Bütçe sıfırdan büyük olmalı'),
    budgetMode: z.enum(['daily', 'lifetime']),
  }),
  /**
   * ═══ KOPYALA ═══
   *
   * Kopyayı PLATFORM çıkarıyor (`POST /{campaign_id}/copies`), biz değil.
   * Kendi modelimize çevirmek, hedeflemeyi Meta'nın ham biçiminden bizim
   * şemamıza taşımak demekti ve çeviri, kaynağıyla aynı sanılan ama farklı
   * hedefleyen bir kampanya üretme riski taşıyor.
   *
   * KOPYA HER ZAMAN DURAKLATILMIŞ AÇILIYOR — sağlayıcı `status_option`u
   * açıkça yazıyor. Kullanıcı bütçesini gözden geçirip kendisi başlatıyor.
   */
  z.object({
    type: z.literal('copy'),
    /** Kopyanın adı. Boşsa platformun verdiği ad kalıyor. */
    name: z.string().trim().min(1).max(200).optional(),
    /**
     * Reklam setleri ve reklamlar da kopyalansın mı.
     *
     * VARSAYILAN `true`: reklamsız bir kampanya kopyası kullanıcıya hiçbir
     * şey kazandırmıyor — hedefleme ve kreatif zaten kopyalamanın sebebi.
     * Meta'nın sınırı belgede yazılı: eşzamanlı çağrıda 3, asenkron çağrıda
     * 51 alt reklam.
     */
    deepCopy: z.boolean().default(true),
  }),
]);

export type CampaignActionInput = z.infer<typeof campaignActionInputSchema>;

// -----------------------------------------------------------------------------
// YAYINDAKİ KAMPANYALAR — panelde listelenen hâli
// -----------------------------------------------------------------------------

/**
 * ═══ PANELDE "YAYINDA OLANLAR" LİSTESİ ═══
 *
 * Bu liste bugüne kadar YOKTU ve kullanıcının bildirdiği eksik buydu:
 * *"sadece adveticsten yayınladığım reklamlar gözüküyor, yayında olan
 * kampanyaları da görebilmem düzenleyebilmem lazım"*.
 *
 * Veri zaten vardı: gecelik yapı taraması `campaigns` tablosunu dolduruyor ve
 * `POST /campaigns/:id/actions` ucu (durdur · sürdür · bütçe) yazılmıştı —
 * ama onu çağıran tek yer AI asistanının onay kartıydı. Eksik olan EKRANDI.
 */
export interface CanliKampanyaOzeti {
  id: string;
  name: string;
  platform: Platform;
  /** Platformun kendi amaç kodu (ODAX) — ham, çevrilmiyor. */
  objective: string | null;

  /**
   * `status` KAMPANYANIN KENDİ durumu, `effectiveStatus` ise PLATFORMUN
   * uyguladığı durum.
   *
   * İkisi ayrı gösteriliyor çünkü ayrışabiliyorlar: kampanya `active`
   * görünürken reklam seti duraklatılmış ya da hesap kapatılmış olabiliyor
   * ve o hâlde hiçbir gösterim almıyor. Tek bir rozete indirgemek, para
   * harcamayan bir kampanyayı "yayında" göstermek olurdu.
   */
  status: string;
  effectiveStatus: string | null;

  budgetMode: string;
  budgetAmountMicros: string | null;
  /** `null` = reklam hesabı satırı okunamıyor (başka workspace'e taşınmış). */
  currency: string | null;

  adAccountId: string;
  adAccountName: string | null;

  /** Son senkronizasyon — liste bayatsa kullanıcı bunu görmeli. */
  syncedAt: string;

  /**
   * SON 7 GÜN — `insights_daily`den, yeni platform çağrısı YOK.
   *
   * `null` = o dönemde hiç satır yok. Sıfır DEĞİL: "harcama yapmadı" ile
   * "veri gelmedi" aynı şey değil ve ikisinin yapılacak işi farklı.
   */
  son7Gun: {
    spendMicros: string;
    impressions: number;
    clicks: number;
    conversions: number;
  } | null;
}

export interface CanliKampanyaListesi {
  rows: CanliKampanyaOzeti[];
  /** TOPLAM kampanya sayısı — sessiz kesme yok. */
  toplam: number;
}

// ─── Reklam Yöneticisi satır içi durdur / başlat (2026-10-10) ───────────────

/**
 * SATIR İÇİ EYLEM: kampanya, reklam seti ya da reklam düzeyinde durdur ve
 * başlat. Bütçe burada YOK: bütçe değişikliği İyileştir önerisinden geçiyor
 * (%20 sınırı, aylık bütçe kontrolü); tablodan serbest bütçe yazdırmak o
 * kuralları atlatırdı.
 */
export const VARLIK_EYLEM_SEVIYELERI = ['campaign', 'ad_group', 'ad'] as const;
export type VarlikEylemSeviyesi = (typeof VARLIK_EYLEM_SEVIYELERI)[number];

/**
 * GOOGLE'IN API'DEN DEĞİŞTİRİLMESİNE İZİN VERMEDİĞİ KAMPANYA KANALLARI.
 * Video (YouTube) kampanyaları API'de yalnız okunuyor: durum değiştirme
 * isteği `MUTATE_NOT_ALLOWED · reddedilen değer=VIDEO` ile düşüyor (canlıda
 * ölçüldü, 2026-10-10). Kampanya, set ve reklam düzeyinde aynı kural.
 */
export const GOOGLE_YAZILAMAYAN_KANALLAR: readonly string[] = ['VIDEO'];

export function googleYazilamazMi(platform: string, kampanyaKanali: string | null | undefined): boolean {
  return platform === 'google' && !!kampanyaKanali && GOOGLE_YAZILAMAYAN_KANALLAR.includes(kampanyaKanali.toUpperCase());
}

export const varlikEylemiSchema = z.object({
  type: z.enum(['pause', 'resume']),
});
export type VarlikEylemiGirdisi = z.infer<typeof varlikEylemiSchema>;

/**
 * Sonuç PLATFORMDAN GERİ OKUNAN değerle ("200 döndü" doğrulama değil):
 * `uyusmadi` = platform kabul etti ama okunan durum istenen değil ya da
 * okunamadı; ekranda platformun söylediği yazılır.
 */
export interface VarlikEylemSonucu {
  dogrulama: 'dogrulandi' | 'uyusmadi';
  platformDegeri: string;
  varlikAdi: string;
}
