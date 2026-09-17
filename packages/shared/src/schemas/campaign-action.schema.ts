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
