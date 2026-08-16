import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import type { TxLike } from '../rules/rules.service';
import { INSTAGRAM_BOOST_UNSUPPORTED, isInstagramProfile } from './instagram-boost-guard';

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
  org_id: string;
  client_id: string;
  ad_account_id: string;
  organic_post_id: string;
  social_profile_id: string;
  boost_rule_id: string | null;
  draft_campaign_id: string | null;
  daily_budget_micros: bigint;
  duration_days: number;
  objective: string;
  post_external_id: string;
  profile_external_id: string;
  /**
   * `facebook_page` | `instagram_business`.
   *
   * `profile_external_id`'nin NE OLDUĞUNU bu alan belirliyor: Facebook'ta
   * sayfa kimliği, Instagram'da IG kullanıcı kimliği. İkisi aynı yere
   * gönderilemez.
   */
  profile_type: string;
  rule_name: string | null;
  account_external_id: string;
  connection_id: string;
  currency: string;
  special_ad_categories: string[];
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
      SELECT b.id, b.org_id::text AS org_id, b.client_id,
             b.ad_account_id::text AS ad_account_id,
             b.organic_post_id::text AS organic_post_id,
             b.boost_rule_id::text AS boost_rule_id,
             b.draft_campaign_id::text AS draft_campaign_id,
             p.social_profile_id::text AS social_profile_id,
             b.daily_budget_micros, b.duration_days, b.objective,
             p.external_id AS post_external_id,
             sp.external_id AS profile_external_id,
             sp.profile_type::text AS profile_type,
             r.name AS rule_name,
             a.external_id AS account_external_id,
             a.connection_id::text AS connection_id,
             a.currency,
             -- ÖZEL REKLAM KATEGORİLERİ MÜŞTERİDEN. Beyan edilmeden
             -- yayınlanan konut/istihdam/kredi reklamı politika ihlali ve
             -- cezası HESAP seviyesinde.
             cl.special_ad_categories,
             c.granted_scopes, c.status::text AS connection_status
      FROM boosts b
      JOIN organic_posts p ON p.id = b.organic_post_id
      JOIN social_profiles sp ON sp.id = p.social_profile_id
      JOIN ad_accounts a ON a.id = b.ad_account_id
      JOIN platform_connections c ON c.id = a.connection_id
      JOIN clients cl ON cl.id = b.client_id
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

    /**
     * INSTAGRAM ENGELİ — SON SAVUNMA HATTI ve en başta duruyor.
     *
     * Aday üretimi Instagram gönderisini artık atlıyor, ama bu satır o
     * kontrolün tekrarı değil: veritabanında bu düzeltmeden ÖNCE oluşmuş
     * `approved` kayıtlar olabilir ve onlar bu döngüden geçer.
     *
     * KOTA ALINMADAN ÖNCE: hiçbir zaman yapılamayacak bir iş için kota
     * yakmanın anlamı yok. Bağlantı durumundan da önce, çünkü bağlantı
     * geçici bir sorun, bu ise K17'ye kadar kalıcı.
     */
    if (isInstagramProfile(row.profile_type)) {
      await this.fail(tx, row.id, INSTAGRAM_BOOST_UNSUPPORTED);
      return false;
    }

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
          specialAdCategories: row.special_ad_categories ?? [],
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

      await this.writeTree(tx, row, result);

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

  /**
   * Boost'u KAMPANYA AĞACINA yazar.
   *
   * NEDEN BURADA VE NEDEN AYNI TRANSACTION'DA: bu servis zaten `tx` üzerinden
   * kiracı tablolarına yazıyor (`boosts`, `organic_posts`). Ağaç satırlarını
   * aynı transaction'dan yazmak YENİ BİR GÜVENLİK KARARI DEĞİL — mevcut
   * kararın ta kendisi. Ayrı bir yola çıkarmak, boost oluşup ağaç satırının
   * yazılamadığı bir aralık bırakırdı ve o boost panelde hiç görünmezdi.
   *
   * NE KAZANDIRIYOR: kuraldan doğan bir boost artık elle kurulan
   * kampanyalarla AYNI listede, aynı durum modeliyle ve "nereden geldi"
   * bilgisiyle duruyor. Beklenmedik bir harcamanın kaynağını bulmanın tek
   * yolu bu bağ — `boost_rule_id` hangi kuralın açtığını söylüyor.
   *
   * `boosts` TABLOSU KALIYOR ve işi değişmiyor: onay kuyruğu ve aylık tavan
   * muhasebesi. Ağaç "hangi kampanyalar var" sorusunun, `boosts` "hangi
   * boost'lar onaylandı ve ne kadar taahhüt edildi" sorusunun cevabı.
   *
   * SESSİZ KALMIYOR: ağaç yazılamazsa boost YİNE oluşmuş durumda ve
   * platformda para harcıyor. Hata fırlatmak, oluşan boost'u "başarısız"
   * göstermek olurdu; log'a yazıp devam ediyoruz.
   */
  private async writeTree(
    tx: TxLike,
    row: PendingRow,
    result: { externalCampaignId: string; externalAdSetId: string; externalAdId: string },
  ): Promise<void> {
    try {
      /**
       * TASLAK ZATEN VARSA GÜNCELLENİYOR, YENİSİ AÇILMIYOR.
       *
       * Aday üretilirken bir kampanya taslağı da yazıldı (`BoostsService`).
       * Burada ikinci bir kampanya oluşturmak, kullanıcının listede aynı
       * boost'u iki kez görmesi ve hangisinin gerçek olduğunu bilememesi
       * demek olurdu.
       *
       * Eski adaylarda (bu bağ eklenmeden önce oluşmuş) `draft_campaign_id`
       * boş; onlar için aşağıdaki yol yeni bir ağaç kuruyor. Geriye dönük
       * tarama gerekmiyor — eski adaylar zaten tükenecek.
       */
      if (row.draft_campaign_id) {
        await this.markTreePublished(tx, row, result);
        return;
      }

      /**
       * KAYNAK KURALA BAĞLI. `draft_campaigns_boost_rule_chk` kuraldan doğan
       * bir kampanyanın kuralını taşımasını zorunlu kılıyor; elle onaylanan
       * bir boost'ta kural yok ve o satır 'manual' oluyor.
       */
      const source = row.boost_rule_id ? 'boost_rule' : 'manual';
      const name = `Boost — ${row.rule_name ?? 'elle'} — ${row.post_external_id.slice(-8)}`;
      const endAt = new Date(Date.now() + row.duration_days * 86_400_000);

      const [campaign] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO draft_campaigns (
          id, org_id, client_id, platform, ad_account_id, name, surface, goal,
          settings, budget_mode, budget_amount_micros, end_at, status,
          external_campaign_id, published_at, source, boost_rule_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${row.org_id}::uuid, ${row.client_id}::uuid, 'meta',
          ${row.ad_account_id}::uuid, ${name}, 'simple', NULL,
          ${JSON.stringify({ objective: row.objective })}::jsonb,
          'daily', ${row.daily_budget_micros}::bigint, ${endAt}::timestamptz,
          'published', ${result.externalCampaignId}, now(),
          ${source}, ${row.boost_rule_id}::uuid, now()
        )
        RETURNING id::text AS id
      `);
      if (!campaign) throw new Error('Kampanya satırı yazılamadı');

      const [group] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO draft_ad_groups (
          id, org_id, campaign_id, name, position, social_profile_id,
          external_ad_set_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${row.org_id}::uuid, ${campaign.id}::uuid, ${name}, 0,
          ${row.social_profile_id}::uuid, ${result.externalAdSetId}, now()
        )
        RETURNING id::text AS id
      `);
      if (!group) throw new Error('Reklam grubu satırı yazılamadı');

      // KREATİF YOK, GÖNDERİ VAR. `draft_ads_source_chk` ikisinden tam
      // birinin dolu olmasını zorunlu kılıyor.
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO draft_ads (
          id, org_id, ad_group_id, creative_id, organic_post_id, name, position,
          external_ad_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${row.org_id}::uuid, ${group.id}::uuid, NULL,
          ${row.organic_post_id}::uuid, ${name}, 0, ${result.externalAdId}, now()
        )
      `);
    } catch (err) {
      this.logger.error(
        `Boost ağaca yazılamadı (${row.id}): ` +
          `${err instanceof Error ? err.message : String(err)}. ` +
          'Boost platformda OLUŞTU ve harcıyor; panelde kampanya listesinde görünmeyecek.',
      );
    }
  }

  /**
   * Adayla birlikte doğmuş taslağı YAYINLANMIŞ yapar.
   *
   * Dış kimlikler ağacın kendi seviyelerine yazılıyor: kampanya, reklam grubu
   * ve reklam ayrı ayrı. Hepsini kampanyaya yığmak, "bu reklam grubu
   * platformda hangisi" sorusunun cevabını yok ederdi.
   */
  private async markTreePublished(
    tx: TxLike,
    row: PendingRow,
    result: { externalCampaignId: string; externalAdSetId: string; externalAdId: string },
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE draft_campaigns SET
        status = 'published',
        external_campaign_id = ${result.externalCampaignId},
        published_at = now(),
        error = NULL,
        updated_at = now()
      WHERE id = ${row.draft_campaign_id}::uuid
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE draft_ad_groups SET
        external_ad_set_id = ${result.externalAdSetId}, updated_at = now()
      WHERE campaign_id = ${row.draft_campaign_id}::uuid
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE draft_ads SET external_ad_id = ${result.externalAdId}, updated_at = now()
      WHERE ad_group_id IN (
        SELECT id FROM draft_ad_groups WHERE campaign_id = ${row.draft_campaign_id}::uuid
      )
    `);
  }

  private async fail(tx: TxLike, boostId: string, error: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE boosts SET status = 'failed', error = ${error.slice(0, 1000)}, updated_at = now()
      WHERE id = ${boostId}::uuid
    `);
  }
}
