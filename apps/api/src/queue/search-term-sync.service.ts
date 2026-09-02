import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { TokenVaultService } from '../modules/connections/token-vault.service';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService } from './quota-guard.service';
import { topluUpsert } from './toplu-yazma';

/**
 * ARAMA TERİMİ senkronizasyonu — yalnızca Google.
 *
 * Anahtar kelime bizim HEDEFLEDİĞİMİZ şey; arama terimi kullanıcının YAZDIĞI
 * şey. Fark tam olarak paranın nereye gittiğini gösteriyor: geniş eşlemeli
 * bir kelime hiç istemediğimiz sorgulara da gösterim alabiliyor ve bu ancak
 * burada görünüyor.
 *
 * META'DA BÖYLE BİR KAVRAM YOK ve sağlayıcı bunu açık bir hatayla söylüyor;
 * bu servis o hataya hiç ulaşmadan erken çıkıyor — token çözmek ve kota
 * harcamak gereksiz.
 */
@Injectable()
export class SearchTermSyncService {
  private readonly logger = new Logger(SearchTermSyncService.name);

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

    if (account.platform !== 'google') {
      return { rows: 0, apiCalls: 0, note: `${account.name}: arama terimi yalnızca Google'da` };
    }

    const provider = this.providers.get(account.platform);

    const gate = await this.quota.acquire({
      platform: account.platform,
      adAccountId: account.id,
      // Anahtar kelimeyle AYNI katman: ikisi de opsiyonel derinleşme ve
      // çekirdek metriklerin önüne geçmemeli.
      layer: 'insights_breakdown',
    });
    if (!gate.allowed) {
      throw new Error(`Kota engeli: ${gate.reason}`);
    }

    const accessToken = await this.vault.getAccessToken(account.connectionId, provider);
    const result = await provider.fetchSearchTerms(
      {
        accessToken,
        accountExternalId: account.externalId,
        loginCustomerId: account.managerExternalId ?? undefined,
        onRateLimit: (snapshot) =>
          this.quota.record({
            platform: account.platform,
            adAccountId: account.id,
            clientId: account.clientId,
            endpoint: 'google:search_terms',
            snapshot,
          }),
      },
      { dateFrom: params.dateFrom, dateTo: params.dateTo },
    );

    if (result.rows.length === 0) {
      return {
        rows: 0,
        apiCalls: result.apiCalls,
        note: `${account.name}: gösterim alan arama terimi yok`,
      };
    }

    /*
     * AD GROUP EŞLEMESİ — eşleşmezse satır ATILMIYOR, bağlamsız yazılıyor.
     * Yapı senkronizasyonu geride kalmış olabilir; veriyi atmak bir sonraki
     * tura kadar raporu boş bırakmak demekti.
     */
    const externalIds = [
      ...new Set(result.rows.map((r) => r.adGroupExternalId).filter(Boolean)),
    ] as string[];
    const groups = await this.db.adGroup.findMany({
      where: { adAccountId: account.id, externalId: { in: externalIds } },
      select: { id: true, externalId: true },
    });
    const groupId = new Map(groups.map((g) => [g.externalId, g.id]));

    /*
     * AYNI GÜN + AYNI TERİM İKİ KEZ GELEBİLİYOR.
     *
     * Google raporu reklam grubu kırılımıyla veriyor: aynı sorgu iki farklı
     * ad group altında görünebiliyor. Tekil anahtarımız ad group taşımıyor
     * (terim bazlı rapor istiyoruz), yani aynı INSERT içinde iki satır aynı
     * anahtara düşüyor ve Postgres "ON CONFLICT DO UPDATE command cannot
     * affect row a second time" ile TÜM İFADEYİ düşürüyor — tek bir mükerrer
     * satır yüzünden o günün tamamı yazılamıyor.
     *
     * Bu yüzden metrikler yazmadan ÖNCE terim bazında toplanıyor.
     */
    const birlesik = new Map<
      string,
      {
        hash: string;
        term: string;
        keywordText?: string;
        matchType?: string;
        status: string;
        adGroupId: string | null;
        date: string;
        impressions: number;
        clicks: number;
        spendMicros: bigint;
        conversions: number;
        conversionValueMicros: bigint;
        currency: string;
      }
    >();

    for (const r of result.rows) {
      const hash = createHash('sha256').update(r.searchTerm).digest('hex');
      const anahtar = `${r.date}|${hash}`;
      const mevcut = birlesik.get(anahtar);
      if (mevcut) {
        mevcut.impressions += r.impressions;
        mevcut.clicks += r.clicks;
        mevcut.spendMicros += r.spendMicros;
        mevcut.conversions += r.conversions;
        mevcut.conversionValueMicros += r.conversionValueMicros;
        // DURUM BİRLEŞTİRME: aynı terim bir grupta eklenmiş, diğerinde
        // tanımsız olabiliyor. "Tanımlı" hâli korunuyor — "NONE" göstermek
        // kullanıcıyı zaten eklediği bir kelimeyi tekrar eklemeye iterdi.
        if (mevcut.status === 'NONE' && r.status !== 'NONE') mevcut.status = r.status;
        continue;
      }
      birlesik.set(anahtar, {
        hash,
        term: r.searchTerm,
        keywordText: r.keywordText,
        matchType: r.matchType,
        status: r.status,
        adGroupId: r.adGroupExternalId ? (groupId.get(r.adGroupExternalId) ?? null) : null,
        date: r.date,
        impressions: r.impressions,
        clicks: r.clicks,
        spendMicros: r.spendMicros,
        conversions: r.conversions,
        conversionValueMicros: r.conversionValueMicros,
        currency: r.currency,
      });
    }

    /*
     * ÇAKIŞMA ANAHTARI ZATEN `birlesik` ile tekilleştirildi (yukarıda);
     * `topluUpsert` burada PARÇALAMA için kullanılıyor. Üretimde bu yazma
     * `received 123615` ile düşüyordu — mükerrer değil, SATIR SAYISI sorunu.
     */
    const sonuc = await topluUpsert({
      satirlar: [...birlesik.values()],
      anahtar: (r) => `${r.date}|${r.hash}`,
      deger: (r) => Prisma.sql`(
        ${account.clientId}::uuid, ${account.id}::uuid, ${r.adGroupId}::uuid,
        ${r.hash}, ${r.term}, ${r.keywordText ?? null}, ${r.matchType ?? null}, ${r.status},
        ${r.date}::date, ${r.impressions}, ${r.clicks}, ${r.spendMicros}::bigint,
        ${r.conversions}, ${r.conversionValueMicros}::bigint, ${r.currency}, now()
      )`,
      yaz: (values) =>
        this.db.$executeRaw(Prisma.sql`
      INSERT INTO search_term_insights (
        client_id, ad_account_id, ad_group_id, term_hash, search_term,
        keyword_text, match_type, status, date, impressions, clicks,
        spend_micros, conversions, conversion_value_micros, currency, fetched_at
      ) VALUES ${values}
      ON CONFLICT (date, ad_account_id, term_hash) DO UPDATE SET
        -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
        -- eski satirlarin client_id'si degismiyordu; upsert onu atladigi
        -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
        -- Kaynak HER ZAMAN hesabin o anki musterisi.
        client_id = EXCLUDED.client_id,
        ad_group_id = EXCLUDED.ad_group_id,
        keyword_text = EXCLUDED.keyword_text,
        match_type = EXCLUDED.match_type,
        -- DURUM GÜNCELLENİYOR: kullanıcı terimi anahtar kelime olarak
        -- ekleyince ya da negatiflediğinde eski durumu göstermek, yapılacak
        -- iş listesinde bitmiş bir işi göstermek olurdu.
        status = EXCLUDED.status,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        spend_micros = EXCLUDED.spend_micros,
        conversions = EXCLUDED.conversions,
        conversion_value_micros = EXCLUDED.conversion_value_micros,
        currency = EXCLUDED.currency,
        fetched_at = now()
        `),
    });
    const written = sonuc.yazilan;

    const unmatched = result.rows.filter(
      (r) => r.adGroupExternalId && !groupId.has(r.adGroupExternalId),
    ).length;
    if (unmatched > 0) {
      this.logger.warn(
        `${account.name}: ${unmatched}/${result.rows.length} arama terimi ad group'a eşlenemedi ` +
          '— yapı senkronizasyonu geride kalmış olabilir.',
      );
    }

    const birlestirilen = result.rows.length - birlesik.size;
    return {
      rows: written,
      apiCalls: result.apiCalls,
      note:
        `${account.name}: ${birlesik.size} arama terimi · ${params.dateFrom}..${params.dateTo}` +
        (birlestirilen > 0 ? ` · ${birlestirilen} satır reklam grubu kırılımından birleştirildi` : ''),
    };
  }
}
