import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import type { TxLike } from '../rules/rules.service';

/**
 * Onaylanmış boost'ları platformda oluşturur.
 *
 * ADAY ÜRETİMİNDEN AYRI BİR ADIM ve bu ayrım bu modülün en önemli tasarım
 * kararı: aday üretmek bedava, boost oluşturmak PARA TAAHHÜT EDİYOR. İkisi
 * aynı işlemde olsaydı, "kural çalıştı" ile "para harcandı" arasında hiçbir
 * karar noktası kalmazdı.
 *
 * Yalnızca `approved` durumundaki kayıtları alıyor. Onay ya bir insan
 * tarafından (`boost.approve`) ya da kuralın `autoApprove` ayarıyla verilmiş
 * oluyor; ikisi de `boosts` tablosunda görünür.
 */

interface PendingRow {
  id: string;
  client_id: string;
  ad_account_id: string;
  organic_post_id: string;
  daily_budget_micros: bigint;
  duration_days: number;
  objective: string;
  post_external_id: string;
  profile_external_id: string;
  rule_name: string | null;
  account_external_id: string;
  connection_id: string;
  currency: string;
  granted_scopes: string[];
  connection_status: string;
}

@Injectable()
export class BoostExecutorService {
  private readonly logger = new Logger(BoostExecutorService.name);

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  /**
   * Onaylanmış boost'ları oluşturur.
   *
   * `limit` var çünkü bu döngü platforma ÜÇ çağrı/boost yapıyor. Sınırsız
   * bırakmak, biriken 50 onaylı boost'un tek turda kotayı yakması demek
   * olurdu; kalanlar bir sonraki turda alınıyor.
   */
  async createApproved(
    tx: TxLike,
    clientId: string,
    limit = 10,
  ): Promise<{ created: number; failed: number }> {
    const pending = await tx.$queryRaw<PendingRow[]>(Prisma.sql`
      SELECT b.id, b.client_id, b.ad_account_id::text AS ad_account_id,
             b.organic_post_id::text AS organic_post_id,
             b.daily_budget_micros, b.duration_days, b.objective,
             p.external_id AS post_external_id,
             sp.external_id AS profile_external_id,
             r.name AS rule_name,
             a.external_id AS account_external_id,
             a.connection_id::text AS connection_id,
             a.currency,
             c.granted_scopes, c.status::text AS connection_status
      FROM boosts b
      JOIN organic_posts p ON p.id = b.organic_post_id
      JOIN social_profiles sp ON sp.id = p.social_profile_id
      JOIN ad_accounts a ON a.id = b.ad_account_id
      JOIN platform_connections c ON c.id = a.connection_id
      LEFT JOIN boost_rules r ON r.id = b.boost_rule_id
      WHERE b.client_id = ${clientId}::uuid AND b.status = 'approved'
      ORDER BY b.approved_at
      LIMIT ${limit}
    `);

    let created = 0;
    let failed = 0;

    for (const row of pending) {
      const ok = await this.createOne(tx, row);
      if (ok) created++;
      else failed++;
    }
    return { created, failed };
  }

  private async createOne(tx: TxLike, row: PendingRow): Promise<boolean> {
    const provider = this.providers.get('meta');

    if (row.connection_status !== 'active') {
      await this.fail(tx, row.id, `Platform bağlantısı etkin değil (${row.connection_status}).`);
      return false;
    }

    const can = provider.canWrite(row.granted_scopes ?? []);
    if (!can.ok) {
      // App Review onayı gelene kadar en sık karşılaşılacak durum. Boost
      // `failed` düşüyor ama `approved` durumuna geri alınabilir — onay
      // kararı hâlâ geçerli, eksik olan platform izni.
      await this.fail(
        tx,
        row.id,
        `Yazma izni yok: ${can.missing.join(', ')}. Platform onayı geldikten sonra yeniden denenebilir.`,
      );
      return false;
    }

    const gate = await this.quota.acquire({
      platform: 'meta',
      adAccountId: row.ad_account_id,
      layer: 'rule_action',
    });
    if (!gate.allowed) {
      await this.fail(tx, row.id, `Kota engeli: ${gate.reason}. Sonraki turda denenecek.`);
      return false;
    }

    // OLUŞTURMA BAŞLIYOR — durum önce `creating`.
    //
    // Süreç ortasında worker düşerse kayıt `creating` kalıyor ve bu bilgi
    // değerli: `approved` bırakmak, bir sonraki turun aynı boost'u ikinci kez
    // oluşturmasına yol açardı. `creating` kayıtlar elle incelenmeli.
    await tx.$executeRaw(Prisma.sql`
      UPDATE boosts SET status = 'creating', updated_at = now() WHERE id = ${row.id}::uuid
    `);

    try {
      const accessToken = await this.vault.getAccessToken(row.connection_id, provider);
      const result = await provider.createBoost(
        {
          accessToken,
          accountExternalId: row.account_external_id,
          onRateLimit: (snapshot) =>
            this.quota.record({
              platform: 'meta',
              adAccountId: row.ad_account_id,
              clientId: row.client_id,
              endpoint: 'boost:create',
              snapshot,
            }),
        },
        {
          adAccountExternalId: row.account_external_id,
          postExternalId: row.post_external_id,
          pageExternalId: row.profile_external_id,
          dailyBudgetMicros: row.daily_budget_micros,
          durationDays: row.duration_days,
          objective: row.objective,
          currency: row.currency,
          name: `Boost — ${row.rule_name ?? 'elle'} — ${row.post_external_id.slice(-8)}`,
        },
      );

      await tx.$executeRaw(Prisma.sql`
        UPDATE boosts SET
          status = 'active',
          external_campaign_id = ${result.externalCampaignId},
          external_ad_set_id = ${result.externalAdSetId},
          external_ad_id = ${result.externalAdId},
          created_on_platform_at = now(),
          error = NULL,
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `);

      // GÖNDERİ İŞARETLENİYOR — aynı gönderi ikinci kez aday olmasın.
      //
      // Kısmi tekil indeks zaten canlı bir boost varken ikinciyi engelliyor,
      // ama boost sonradan iptal edilirse indeks serbest kalıyor. `boosted_at`
      // kalıcı: bir kez boost edilmiş gönderi, boost bittikten sonra da
      // yeniden aday olmamalı.
      await tx.$executeRaw(Prisma.sql`
        UPDATE organic_posts SET boosted_at = now(), updated_at = now()
        WHERE id = ${row.organic_post_id}::uuid
      `);

      this.logger.log(`Boost oluşturuldu: ${result.externalAdId}`);
      return true;
    } catch (err) {
      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      await this.fail(tx, row.id, message);
      return false;
    }
  }

  private async fail(tx: TxLike, boostId: string, error: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE boosts SET status = 'failed', error = ${error.slice(0, 1000)}, updated_at = now()
      WHERE id = ${boostId}::uuid
    `);
  }
}
