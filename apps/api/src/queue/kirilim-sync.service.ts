import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BreakdownDimensionKind } from '../modules/connections/provider.types';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { TokenVaultService } from '../modules/connections/token-vault.service';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService } from './quota-guard.service';
import { topluUpsert } from './toplu-yazma';

/**
 * ═══ KIRILIM SENKRONİZASYONU — yaş, cinsiyet, yerleşim, saat, şehir ═══
 *
 * Raporun "kitle" bölümleri bu veriden besleniyor ve o veri bugüne kadar
 * HİÇ toplanmıyordu: `insights_daily.breakdown_key` kolonu ve
 * `insights_breakdown` kota katmanı hazır duruyordu ama Meta çağrısında
 * `breakdowns` parametresi hiç yoktu ve zamanlanmış bir kırılım işi de yoktu.
 *
 * VERİ AYRI TABLOYA YAZILIYOR (`insight_breakdowns`), `insights_daily`ye
 * DEĞİL. O tablonun birincil anahtarı `breakdown_key` taşıyor, yani kırılım
 * satırları oraya teknik olarak sığıyor — ama mevcut toplama sorgularının
 * hiçbiri o kolonu süzmüyor ve kırılım satırları yazıldığı an her harcama
 * rakamı kırılım sayısı kadar KATLANIR. Hiçbir hata düşmez; panel yalnızca
 * yanlış sayı gösterir.
 */
export const KIRILIM_BOYUTLARI: readonly BreakdownDimensionKind[] = [
  'age',
  'gender',
  'placement',
  'hour',
  'city',
];

@Injectable()
export class KirilimSyncService {
  private readonly logger = new Logger(KirilimSyncService.name);

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

    /*
     * ATANMAMIŞ HESAP İÇİN ÇALIŞMIYOR. `client_id`'si NULL bir satırı RLS
     * kimseye göstermez ve iş sessizce kaybolur — CLAUDE.md'deki
     * `assertAssigned()` kuralının bu servisteki karşılığı.
     */
    if (account.clientId === null) {
      return { rows: 0, apiCalls: 0, note: `${account.name}: hesap müşteriye atanmamış` };
    }

    const provider = this.providers.get(account.platform);

    /*
     * KOTA BİR KEZ SORULUYOR, BOYUT BAŞINA DEĞİL.
     *
     * Beş boyut beş çağrı ama tek bir mantıksal iş; her boyutta ayrı ayrı
     * sormak, üçüncü boyutta reddedilip ilk ikisinin yazıldığı YARIM bir tur
     * üretirdi ve o tur "başarılı" görünürdü.
     */
    const gate = await this.quota.acquire({
      platform: account.platform,
      adAccountId: account.id,
      layer: 'insights_breakdown',
    });
    if (!gate.allowed) throw new Error(`Kota engeli: ${gate.reason}`);

    const accessToken = await this.vault.getAccessToken(account.connectionId, provider);
    const fetchCtx = {
      accessToken,
      accountExternalId: account.externalId,
      loginCustomerId: account.managerExternalId ?? undefined,
      onRateLimit: (snapshot: Parameters<typeof this.quota.record>[0]['snapshot']) =>
        this.quota.record({
          platform: account.platform,
          adAccountId: account.id,
          clientId: account.clientId,
          endpoint: `${account.platform}:breakdowns`,
          snapshot,
        }),
    };

    let toplamSatir = 0;
    let toplamCagri = 0;
    const desteklenmeyen: string[] = [];
    const hatalar: string[] = [];

    for (const dimension of KIRILIM_BOYUTLARI) {
      try {
        const sonuc = await provider.fetchBreakdowns(fetchCtx, {
          dimension,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          timezone: account.timezone,
        });
        toplamCagri += sonuc.apiCalls;

        /*
         * DESTEKLENMEYEN BOYUT AYRI SAYILIYOR, boş sonuçla aynı sayılmıyor.
         * "Bu platform bu kırılımı vermiyor" ile "bu dönemde veri yok"
         * farklı iki hâl ve raporun ikisini ayırt etmesi gerekiyor.
         */
        if (sonuc.unsupported) {
          desteklenmeyen.push(dimension);
          continue;
        }
        if (sonuc.rows.length === 0) continue;

        toplamSatir += await this.yaz(account.clientId, account.id, account.platform, sonuc.rows);
      } catch (err) {
        /*
         * BİR BOYUTUN DÜŞMESİ DİĞERLERİNİ DURDURMUYOR. Şehir kırılımı
         * coğrafi kimlik çözümünde düşerse yaş ve cinsiyet yine de
         * yazılmalı; hata nota geçiyor ve iş KISMİ sayılıyor.
         */
        const mesaj = err instanceof Error ? err.message : 'bilinmeyen hata';
        this.logger.warn(`Kırılım ${dimension} düştü (${account.name}): ${mesaj}`);
        hatalar.push(`${dimension}: ${mesaj}`);
      }
    }

    const notlar = [`${account.name}: ${toplamSatir} satır`];
    if (desteklenmeyen.length > 0) {
      notlar.push(`desteklenmeyen: ${desteklenmeyen.join(', ')}`);
    }
    if (hatalar.length > 0) notlar.push(`düşen: ${hatalar.join('; ')}`);

    /*
     * HATA VARSA İŞ DÜŞÜYOR. "Üç boyut yazıldı, ikisi düştü" durumunu
     * `succeeded` saymak, eksik veriyi tam sanmak demek — bu projede
     * `succeeded` + `rows = 0` tam olarak böyle bir hata türüydü.
     */
    if (hatalar.length > 0) {
      throw new Error(notlar.join(' · '));
    }

    return { rows: toplamSatir, apiCalls: toplamCagri, note: notlar.join(' · ') };
  }

  /** Satırları upsert eder — idempotent, gün içinde birden çok kez koşabilir. */
  private async yaz(
    clientId: string,
    adAccountId: string,
    platform: string,
    rows: Array<{
      dimension: BreakdownDimensionKind;
      value: string;
      date: string;
      impressions: number;
      clicks: number;
      spendMicros: bigint;
      conversions: number;
      conversionValueMicros: bigint;
      currency: string;
    }>,
  ): Promise<number> {
    /*
     * MÜKERRER TEMİZLİĞİ ZORUNLU — ÜRETİMDE BU YÜZDEN DÜŞTÜ.
     *
     * Aynı gün + aynı boyut + aynı değer iki kez gelebiliyor: Meta bir
     * kırılımı iki kovaya birden yazabiliyor (örneğin aynı şehir farklı
     * yerleşimlerde) ve `value` normalize edilmeden saklandığı için ikisi
     * aynı çakışma anahtarına düşüyor. Postgres o durumda
     * "ON CONFLICT DO UPDATE command cannot affect row a second time" diyerek
     * KOMUTUN TAMAMINI reddediyor — beş boyutun hepsi birden kayboluyor.
     */
    const sonuc = await topluUpsert({
      satirlar: rows,
      anahtar: (r) => `${r.date}|${r.dimension}|${r.value}`,
      deger: (r) => Prisma.sql`(
        ${clientId}::uuid, ${adAccountId}::uuid, ${platform}::"Platform",
        ${r.dimension}::"BreakdownDimension", ${r.value}, ${r.date}::date,
        ${r.impressions}, ${r.clicks}, ${r.spendMicros}::bigint,
        ${r.conversions}, ${r.conversionValueMicros}::bigint, ${r.currency}, now()
      )`,
      yaz: (values) =>
        this.db.$executeRaw(Prisma.sql`
      INSERT INTO insight_breakdowns (
        client_id, ad_account_id, platform, dimension, value, date,
        impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, fetched_at
      ) VALUES ${values}
      ON CONFLICT (date, ad_account_id, dimension, value) DO UPDATE SET
        -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
        -- eski satirlarin client_id'si degismiyordu ve upsert onu atladigi
        -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
        client_id = EXCLUDED.client_id,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        spend_micros = EXCLUDED.spend_micros,
        conversions = EXCLUDED.conversions,
        conversion_value_micros = EXCLUDED.conversion_value_micros,
        currency = EXCLUDED.currency,
        fetched_at = now()
    `),
    });
    return sonuc.yazilan;
  }
}
