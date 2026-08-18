import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  autoBoostPresetSettingsSchema,
  type AutoBoostQueueItemRecord,
  type AutoBoostQueueList,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * BİLDİRİM HAVUZUNUN OKUMA YOLU.
 *
 * Kart, kullanıcının tek tıkla PARA HARCAYACAĞI düğme. Bu yüzden her satır
 * kendisiyle birlikte iki şey taşıyor: hangi ön ayarla yayınlanacağı ve
 * yayınlanamayacaksa NEDEN.
 *
 * "Onaylanamıyor" demek yetmiyor — bu ekranda daha önce tam olarak o hataya
 * düşüldü ve kullanıcı sebebi kendi kurulumunda aradı.
 */
@Injectable()
export class AutoBoostReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listQueue(ctx: TenantContext, clientId: string): Promise<AutoBoostQueueList> {
    const scoped = { ...ctx, activeClientId: clientId };

    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<QueueRow[]>(Prisma.sql`
        SELECT q.id::text AS id, q.client_id::text AS client_id, cl.name AS client_name,
               q.platform::text AS platform, q.external_id, q.title, q.thumbnail_url,
               q.permalink, q.media_type, q.published_at, q.status,
               q.error, q.external_campaign_id, q.created_at,
               q.signature_state,
               sp.name AS profile_name,
               sp.linked_ad_account_id::text AS linked_ad_account_id,
               p.id::text AS preset_id, p.enabled AS preset_enabled,
               p.budget_mode, p.daily_budget_micros, p.total_budget_micros,
               p.duration_days, p.settings,
               COUNT(*) OVER () AS total
        FROM auto_boost_queue_items q
        JOIN clients cl ON cl.id = q.client_id
        JOIN social_profiles sp ON sp.id = q.social_profile_id
        -- ÖN AYAR AYNI ÇÖZÜMLEME SIRASIYLA: profil bazlı varsayılanı eziyor.
        -- Sıra kuyruk beslemesindekiyle AYNI olmak zorunda; ayrışırsa kartta
        -- gösterilen ayar ile yayınlanan ayar farklı olur.
        LEFT JOIN LATERAL (
          SELECT * FROM auto_boost_presets ap
          WHERE ap.client_id = q.client_id AND ap.platform = q.platform
            AND (ap.social_profile_id = q.social_profile_id OR ap.social_profile_id IS NULL)
          ORDER BY ap.social_profile_id NULLS LAST
          LIMIT 1
        ) p ON true
        WHERE q.client_id = ${clientId}::uuid
        ORDER BY
          -- BEKLEYENLER ÖNCE: kullanıcının işi onlar.
          CASE WHEN q.status = 'pending' THEN 0 ELSE 1 END,
          q.created_at DESC
        LIMIT 50
      `),
    );

    const items = rows.map((r) => this.toRecord(r));

    return {
      items,
      total: Number(rows[0]?.total ?? 0),
      emptyReason:
        items.length === 0
          ? 'Onay bekleyen içerik yok. Yeni bir Instagram gönderisi ya da YouTube ' +
            'videosu yayınlandığında kart burada belirir.'
          : null,
    };
  }

  private toRecord(r: QueueRow): AutoBoostQueueItemRecord {
    /*
     * AYARLAR ZOD İLE OKUNUYOR, ham JSON olarak DEĞİL.
     *
     * Kolonda JSONB duruyor ve `$queryRaw` denetimsiz bir dönüşüm — tip yalan
     * söyleyebilir. Doğrulamadan geçirmek, bozuk bir kaydın panelde
     * "hazır" görünüp yayında patlamasını engelliyor.
     */
    const parsed = r.settings ? autoBoostPresetSettingsSchema.safeParse(r.settings) : null;

    const preset =
      r.preset_id && parsed?.success
        ? {
            id: r.preset_id,
            clientId: r.client_id,
            platform: r.platform as 'meta' | 'google',
            socialProfileId: null,
            socialProfileName: r.profile_name,
            enabled: r.preset_enabled ?? false,
            budgetMode: (r.budget_mode ?? 'daily') as 'daily' | 'lifetime',
            budgetMicros: String(r.total_budget_micros ?? r.daily_budget_micros ?? 0),
            durationDays: r.duration_days ?? 0,
            settings: parsed.data,
            updatedAt: r.created_at.toISOString(),
          }
        : null;

    return {
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      platform: r.platform as 'meta' | 'google',
      externalId: r.external_id,
      title: r.title,
      thumbnailUrl: r.thumbnail_url,
      permalink: r.permalink,
      mediaType: r.media_type,
      publishedAt: r.published_at?.toISOString() ?? null,
      status: r.status as AutoBoostQueueItemRecord['status'],
      preset,
      blockedReason: this.blockedReason(r, preset !== null, parsed),
      error: r.error,
      externalCampaignId: r.external_campaign_id,
      createdAt: r.created_at.toISOString(),
    };
  }

  /**
   * Kart neden onaylanamıyor?
   *
   * HER SEBEP AYRI CÜMLE ve her cümle YAPILACAK İŞİ söylüyor. "Onaylanamıyor"
   * demek, kullanıcıyı sebebi kendi kurulumunda aramaya iter — bu ekranda
   * daha önce tam olarak o oldu.
   */
  private blockedReason(
    r: QueueRow,
    presetVar: boolean,
    parsed: { success: boolean } | null,
  ): string | null {
    if (r.status !== 'pending') return null;

    if (!r.preset_id) {
      return (
        'Bu platform için otomatik boost ön ayarı yok. Kütüphane → Bilgi ' +
        'Bankası’ndan bütçe ve hedefleme tanımla.'
      );
    }
    if (r.preset_enabled === false) {
      return 'Otomatik boost ön ayarı kapalı. Bilgi Bankası’ndan aç.';
    }
    if (parsed && !parsed.success) {
      // Kaydın kendisi bozuk: panelde "hazır" göstermek, yayında patlayan bir
      // düğme göstermek olurdu.
      return 'Ön ayar kaydı okunamadı; Bilgi Bankası’ndan yeniden kaydet.';
    }
    if (!presetVar) return 'Ön ayar okunamadı.';

    /*
     * REKLAM HESABI HER İKİ PLATFORMDA DA ZORUNLU ve mesaj platforma göre
     * değişiyor: Meta'da "sayfaya bağlı boost hesabı", Google'da "kanala bağlı
     * Google Ads hesabı". Tek bir genel cümle, kullanıcıyı yanlış ekrana
     * yönlendirirdi.
     */
    if (!r.linked_ad_account_id) {
      return r.platform === 'meta'
        ? 'Bu sayfaya bağlı bir reklam hesabı yok. Müşteriler ekranından ' +
            '“Boost hesabı” seç — reklam o hesaptan faturalandırılıyor.'
        : 'Bu kanala bağlı bir Google Ads hesabı yok. Müşteriler ekranından ' +
            'reklam hesabı seç — YouTube reklamı oradan yayınlanıyor.';
    }

    return null;
  }
}

interface QueueRow {
  id: string;
  client_id: string;
  client_name: string;
  platform: string;
  external_id: string;
  title: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  media_type: string | null;
  published_at: Date | null;
  status: string;
  error: string | null;
  external_campaign_id: string | null;
  created_at: Date;
  signature_state: string | null;
  profile_name: string;
  linked_ad_account_id: string | null;
  preset_id: string | null;
  preset_enabled: boolean | null;
  budget_mode: string | null;
  daily_budget_micros: bigint | null;
  total_budget_micros: bigint | null;
  duration_days: number | null;
  settings: unknown;
  total: bigint;
}
