import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  autoBoostPresetSettingsSchema,
  type AutoBoostPresetInput,
  type AutoBoostPresetRecord,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * BİLGİ BANKASI — otomatik boost ön ayarları.
 *
 * Ön ayar, kart onaylandığında HANGİ AYARLARLA yayınlanacağını söylüyor.
 * Kullanıcının tek tıkla para harcamasını mümkün kılan şey bu; yoksa her
 * kartta form doldurulması gerekirdi ve 1.0'ın vaadi de o değil.
 *
 * MÜŞTERİ + PLATFORM BAŞINA TEK KAYIT (veritabanı kısıtı). İki ön ayar
 * olsaydı "onaylanınca hangisi uygulanacak" sorusunun cevabı satır sırasına
 * kalırdı.
 */
@Injectable()
export class AutoBoostPresetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: TenantContext, clientId: string): Promise<AutoBoostPresetRecord[]> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<PresetRow[]>(Prisma.sql`
        SELECT p.id::text AS id, p.client_id::text AS client_id,
               p.platform::text AS platform,
               p.social_profile_id::text AS social_profile_id,
               sp.name AS social_profile_name,
               p.enabled, p.budget_mode, p.daily_budget_micros,
               p.total_budget_micros, p.duration_days, p.settings, p.updated_at
        FROM auto_boost_presets p
        LEFT JOIN social_profiles sp ON sp.id = p.social_profile_id
        WHERE p.client_id = ${clientId}::uuid
        ORDER BY p.platform
      `),
    );

    return rows.map((r) => {
      /*
       * AYARLAR ZOD İLE OKUNUYOR. `$queryRaw` denetimsiz bir dönüşüm ve
       * kolonda JSONB duruyor; doğrulamadan geçirmek, bozuk bir kaydın
       * ekranda "hazır" görünüp yayında patlamasını engelliyor.
       *
       * BOZUK KAYIT GİZLENMİYOR: `settings` yerine ham veri dönmüyor ama
       * satırın kendisi listede kalıyor ki kullanıcı "ön ayarım nerede" diye
       * aramasın — ekran onu "yeniden kaydet" diye işaretliyor.
       */
      const parsed = autoBoostPresetSettingsSchema.safeParse(r.settings);
      return {
        id: r.id,
        clientId: r.client_id,
        platform: r.platform as 'meta' | 'google',
        socialProfileId: r.social_profile_id,
        socialProfileName: r.social_profile_name,
        enabled: r.enabled,
        budgetMode: r.budget_mode as 'daily' | 'lifetime',
        budgetMicros: String(r.total_budget_micros ?? r.daily_budget_micros ?? 0),
        durationDays: r.duration_days,
        settings: parsed.success
          ? parsed.data
          : ({ platform: r.platform } as AutoBoostPresetRecord['settings']),
        updatedAt: r.updated_at.toISOString(),
      };
    });
  }

  /**
   * Ön ayarı kaydeder — varsa günceller.
   *
   * ÜSTÜNE YAZMA DAVRANIŞI BİLİNÇLİ: kullanıcı Bilgi Bankası'nda bir platformun
   * ayarını değiştirdiğinde niyeti "yenisini ekle" değil "bunu değiştir".
   * Ayrı bir "düzenle" akışı kurmak, tek kayıtlı bir tabloda gereksiz
   * sürtünme olurdu.
   */
  async upsert(
    ctx: TenantContext,
    input: AutoBoostPresetInput,
  ): Promise<AutoBoostPresetRecord> {
    const scoped = { ...ctx, activeClientId: input.clientId };
    const micros = toMicros(input.budget.amount);

    /*
     * GOOGLE'DA TOPLAM BÜTÇE YOK ve kontrol Zod'da da var. Burada tekrar
     * edilmesinin sebebi: veritabanı kısıtı ham bir hata mesajı üretiyor
     * ("violates check constraint") ve kullanıcı ondan ne yapacağını
     * anlamıyor.
     */
    if (input.settings.platform === 'google' && input.budget.mode === 'lifetime') {
      throw new BadRequestException(
        'Google tarafında toplam bütçe yok; bütçe kampanya seviyesinde ve ' +
          'günlük. Günlük bütçe seç.',
      );
    }

    const [row] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO auto_boost_presets (
          id, org_id, client_id, platform, social_profile_id, enabled,
          budget_mode, daily_budget_micros, total_budget_micros, duration_days,
          settings, created_by, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${input.settings.platform}::"Platform", ${input.socialProfileId}::uuid,
          ${input.enabled}, ${input.budget.mode},
          ${input.budget.mode === 'daily' ? micros : null}::bigint,
          ${input.budget.mode === 'lifetime' ? micros : null}::bigint,
          ${input.budget.durationDays},
          ${JSON.stringify(input.settings)}::jsonb,
          ${ctx.userId}::uuid, now()
        )
        -- MÜŞTERİ + PLATFORM BAŞINA TEK VARSAYILAN. Kısmi tekil indeks
        -- NULL profilli satırı koruyor; profil bazlı olanın kendi indeksi var.
        ON CONFLICT (client_id, platform) WHERE social_profile_id IS NULL
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          budget_mode = EXCLUDED.budget_mode,
          daily_budget_micros = EXCLUDED.daily_budget_micros,
          total_budget_micros = EXCLUDED.total_budget_micros,
          duration_days = EXCLUDED.duration_days,
          settings = EXCLUDED.settings,
          updated_at = now()
        RETURNING id::text AS id
      `),
    );
    if (!row) throw new Error('Ön ayar kaydedilemedi');

    const hepsi = await this.list(ctx, input.clientId);
    const kayit = hepsi.find((p) => p.id === row.id);
    if (!kayit) throw new Error('Kaydedilen ön ayar okunamadı');
    return kayit;
  }
}

/** Ana para biriminden micros'a. "300,50" ve "300.50" ikisi de kabul. */
function toMicros(amount: string): bigint {
  const n = Number(amount.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Geçersiz tutar');
  // YUVARLAMA ÖNCE, BigInt SONRA: `BigInt(300.5 * 1e6)` kesirli sayıda hata
  // fırlatıyor ve mesaj sebebi söylemiyor.
  return BigInt(Math.round(n * 1_000_000));
}

interface PresetRow {
  id: string;
  client_id: string;
  platform: string;
  social_profile_id: string | null;
  social_profile_name: string | null;
  enabled: boolean;
  budget_mode: string;
  daily_budget_micros: bigint | null;
  total_budget_micros: bigint | null;
  duration_days: number;
  settings: unknown;
  updated_at: Date;
}
