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
