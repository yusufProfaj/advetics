import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { TokenVaultService } from '../modules/connections/token-vault.service';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService } from './quota-guard.service';

/**
 * Anahtar kelime performansı senkronizasyonu — yalnızca Google.
 *
 * Raporun "Anahtar Kelime Performansı" bölümü başından beri arayüzde vardı ve
 * `keywords: null` gönderildiğinde "bu yetenek henüz yok" diye gösteriyordu.
 * Google Basic Access alınınca engel kalktı.
 *
 * META BOŞ DÖNÜYOR ve bu hata değil — orada anahtar kelime kavramı yok.
 * Sağlayıcı boş dizi veriyor, iş başarılı sayılıyor.
 */
@Injectable()
export class KeywordSyncService {
  private readonly logger = new Logger(KeywordSyncService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  async syncAccount(params: {
    adAccountId: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<{ rows: number; apiCalls: number; note: string }> {
    const account = await this.db.adAccount.findUniqueOrThrow({
      where: { id: params.adAccountId },
    });

    const provider = this.providers.get(account.platform);

    // META İÇİN ERKEN ÇIKIŞ. Sağlayıcı zaten boş dizi dönüyor ama token
    // çözmek ve kota harcamak gereksiz — bu iş o platformda hiçbir şey
    // yapmıyor.
    if (account.platform !== 'google') {
      return { rows: 0, apiCalls: 0, note: `${account.name}: anahtar kelime yalnızca Google'da` };
    }

    const gate = await this.quota.acquire({
      platform: account.platform,
      adAccountId: account.id,
      layer: 'insights_breakdown',
    });
    if (!gate.allowed) {
      throw new Error(`Kota engeli: ${gate.reason}`);
    }

    const accessToken = await this.vault.getAccessToken(account.connectionId, provider);
    const result = await provider.fetchKeywords(
      {
        accessToken,
        accountExternalId: account.externalId,
        loginCustomerId: account.managerExternalId ?? undefined,
        onRateLimit: (snapshot) =>
          this.quota.record({
            platform: account.platform,
            adAccountId: account.id,
            clientId: account.clientId,
            endpoint: 'google:keywords',
            snapshot,
          }),
      },
      { dateFrom: params.dateFrom, dateTo: params.dateTo },
    );

    if (result.rows.length === 0) {
      return {
        rows: 0,
        apiCalls: result.apiCalls,
        note: `${account.name}: gösterim alan anahtar kelime yok`,
      };
    }

    /**
     * AD GROUP EŞLEMESİ — platform kimliğinden bizim UUID'mize.
     *
     * Eşleşme bulunamazsa satır ATILMIYOR, `ad_group_id` null kalıyor. Yapı
     * senkronizasyonu anahtar kelime senkronizasyonundan sonra çalışmış
     * olabilir; veriyi atmak, bir sonraki tura kadar raporu boş bırakmak
     * demekti.
     */
    const externalIds = [
      ...new Set(result.rows.map((r) => r.adGroupExternalId).filter(Boolean)),
    ] as string[];
    const groups = await this.db.adGroup.findMany({
      where: { adAccountId: account.id, externalId: { in: externalIds } },
      select: { id: true, externalId: true },
    });
    const groupId = new Map(groups.map((g) => [g.externalId, g.id]));

    const values = result.rows.map(
      (r) => Prisma.sql`(
        ${account.clientId}::uuid, ${account.id}::uuid,
        ${r.adGroupExternalId ? (groupId.get(r.adGroupExternalId) ?? null) : null}::uuid,
        ${r.externalCriterionId}, ${r.keyword}, ${r.matchType},
        ${r.date}::date, ${r.impressions}, ${r.clicks}, ${r.spendMicros}::bigint,
        ${r.conversions}, ${r.conversionValueMicros}::bigint, ${r.currency}, now()
      )`,
    );

    const written = await this.db.$executeRaw(Prisma.sql`
      INSERT INTO keyword_insights (
        client_id, ad_account_id, ad_group_id, external_criterion_id,
        keyword, match_type, date, impressions, clicks, spend_micros,
        conversions, conversion_value_micros, currency, fetched_at
      ) VALUES ${Prisma.join(values, ', ')}
      ON CONFLICT (date, ad_account_id, external_criterion_id) DO UPDATE SET
        -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
        -- eski satirlarin client_id'si degismiyordu; upsert onu atladigi
        -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
        -- Kaynak HER ZAMAN hesabin o anki musterisi.
        client_id = EXCLUDED.client_id,
        ad_group_id = EXCLUDED.ad_group_id,
        -- METİN DE GÜNCELLENİYOR: anahtar kelime metni düzenlenebiliyor ve
        -- criterion kimliği aynı kalıyor. Eski metni saklamak, raporda artık
        -- var olmayan bir kelimeyi göstermek olurdu.
        keyword = EXCLUDED.keyword,
        match_type = EXCLUDED.match_type,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        spend_micros = EXCLUDED.spend_micros,
        conversions = EXCLUDED.conversions,
        conversion_value_micros = EXCLUDED.conversion_value_micros,
        currency = EXCLUDED.currency,
        fetched_at = now()
    `);

    const unmatched = result.rows.filter(
      (r) => r.adGroupExternalId && !groupId.has(r.adGroupExternalId),
    ).length;
    if (unmatched > 0) {
      // SESSİZ DEĞİL. Eşleşmeyen satırlar kaydediliyor ama bağlamsız; sayısı
      // logda görünmezse "raporda ad group boş" sorusunun cevabı bulunamaz.
      this.logger.warn(
        `${account.name}: ${unmatched}/${result.rows.length} anahtar kelime ad group'a eşlenemedi ` +
          '— yapı senkronizasyonu geride kalmış olabilir.',
      );
    }

    return {
      rows: written,
      apiCalls: result.apiCalls,
      note: `${account.name}: ${result.rows.length} anahtar kelime · ${params.dateFrom}..${params.dateTo}`,
    };
  }
}
