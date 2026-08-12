import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LEAD_STATUSES,
  type LeadField,
  type LeadListResult,
  type LeadQuery,
  type LeadRecord,
  type LeadSource,
  type LeadStatus,
  type LeadUpdateInput,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Potansiyel müşteriler — okuma ve durum yönetimi.
 *
 * YAZMA BURADA DEĞİL. Kayıtlar `queue/lead-sync.service.ts` tarafından
 * worker rolüyle yazılıyor (webhook ve mutabakat). Bu servis yalnızca
 * ajansın kendi girdiği şeyleri değiştiriyor: durum ve not.
 *
 * Ayrım önemli: platformdan gelen alanların elle düzenlenebilmesi, panelde
 * yazanla Meta'da yazanın ayrışması demek olurdu ve hangisinin doğru olduğu
 * bir daha bilinemezdi.
 */

interface LeadRow {
  id: string;
  client_id: string;
  external_lead_id: string;
  lead_form_id: string | null;
  lead_form_name: string | null;
  social_profile_name: string | null;
  external_ad_id: string | null;
  campaign_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  fields: LeadField[];
  status: LeadStatus;
  note: string | null;
  source: LeadSource;
  submitted_at: Date;
  created_at: Date;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, query: LeadQuery): Promise<LeadListResult> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const where = this.filters(ctx, query);

      const rows = await tx.$queryRaw<LeadRow[]>(Prisma.sql`
        SELECT l.id, l.client_id, l.external_lead_id, l.lead_form_id, l.lead_form_name,
               sp.name AS social_profile_name,
               l.external_ad_id, l.campaign_name,
               l.full_name, l.email, l.phone, l.fields,
               l.status, l.note, l.source, l.submitted_at, l.created_at
        FROM leads l
        LEFT JOIN social_profiles sp ON sp.id = l.social_profile_id
        WHERE ${where}
        ORDER BY l.submitted_at DESC
        LIMIT ${query.limit} OFFSET ${query.offset}
      `);

      /**
       * TOPLAM AYRI SORGUYLA.
       *
       * Sayfa boyutu kadar satır dönüp "toplam bu" demek, kullanıcının 51.
       * kaydın var olmadığını sanması demek. Bu üründe sessiz kesme kuralı
       * her listede geçerli ve burada bedeli en yüksek: gelmeyen bir müşteri
       * kaydı, fark edilmeyen bir gelir kaybı.
       */
      const [countRow] = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT count(*) AS total FROM leads l WHERE ${where}
      `);

      /**
       * DURUM SAYIMLARI FİLTREDEN BAĞIMSIZ — ama durum filtresi hariç.
       *
       * Hattın üstündeki rozetler "Yeni 12 · Arandı 4" diyor. Durum filtresi
       * uygulanmış sayımlar, seçili durumun dışındaki her rozeti sıfır
       * gösterirdi ve hat işe yaramaz hâle gelirdi.
       */
      const statusWhere = this.filters(ctx, { ...query, status: undefined });
      const statusRows = await tx.$queryRaw<Array<{ status: LeadStatus; n: bigint }>>(Prisma.sql`
        SELECT status, count(*) AS n FROM leads l WHERE ${statusWhere} GROUP BY status
      `);

      const byStatus = Object.fromEntries(
        LEAD_STATUSES.map((s) => [s, 0]),
      ) as Record<LeadStatus, number>;
      for (const r of statusRows) byStatus[r.status] = Number(r.n);

      /**
       * MUTABAKAT ORANI — WEBHOOK SAĞLIK GÖSTERGESİ.
       *
       * Tarama bir yedek yol; her şey düzgünse hiçbir şey bulmaması gerekir.
       * Kayıtların önemli bir kısmı `reconcile` ile geliyorsa webhook o sayfa
       * için sessizce ölmüş demektir — ve bu, başka hiçbir yerde görünmeyecek
       * bir arıza. Sayı olmadan kimse fark etmez.
       */
      const [ratioRow] = await tx.$queryRaw<Array<{ ratio: number | null }>>(Prisma.sql`
        SELECT
          CASE WHEN count(*) = 0 THEN NULL
               ELSE count(*) FILTER (WHERE source = 'reconcile')::float / count(*)
          END AS ratio
        FROM leads l WHERE ${statusWhere}
      `);

      return {
        rows: rows.map(toRecord),
        total: Number(countRow?.total ?? 0),
        byStatus,
        reconciledRatio: ratioRow?.ratio ?? 0,
      };
    });
  }

  async get(ctx: TenantContext, id: string): Promise<LeadRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<LeadRow[]>(Prisma.sql`
        SELECT l.id, l.client_id, l.external_lead_id, l.lead_form_id, l.lead_form_name,
               sp.name AS social_profile_name,
               l.external_ad_id, l.campaign_name,
               l.full_name, l.email, l.phone, l.fields,
               l.status, l.note, l.source, l.submitted_at, l.created_at
        FROM leads l
        LEFT JOIN social_profiles sp ON sp.id = l.social_profile_id
        WHERE l.id = ${id}::uuid AND l.org_id = ${ctx.orgId}::uuid
      `);
      if (!row) throw new NotFoundException('Kayıt bulunamadı');
      return toRecord(row);
    });
  }

  async update(ctx: TenantContext, id: string, input: LeadUpdateInput): Promise<LeadRecord> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE leads SET
          status = ${input.status},
          -- NOT GÖNDERİLMEDİYSE MEVCUDU KORU.
          --
          -- Arayüz durum değiştirirken notu göndermiyor. Boş yazmak, durumu
          -- ilerletmenin ajansın yazdığı notu silmesi demek olurdu.
          note = COALESCE(${input.note ?? null}, note),
          updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Kayıt bulunamadı');
    });
    return this.get(ctx, id);
  }

  /**
   * CSV dışa aktarma.
   *
   * SAYFALAMA YOK — dışa aktarma filtrenin tamamını içeriyor. Ekranda 50
   * satır görüp "dışa aktar" diyen kişi 50 satır değil, filtreye uyan her
   * şeyi bekliyor.
   */
  async exportCsv(ctx: TenantContext, query: LeadQuery): Promise<string> {
    const result = await this.list(ctx, { ...query, limit: 200, offset: 0 });
    const all: LeadRecord[] = [...result.rows];

    // Sayfa sayfa okuyup birleştiriyoruz: tek sorguda sınırsız satır çekmek,
    // 50 bin kayıtlık bir müşteride belleği doldurur.
    for (let offset = 200; offset < result.total; offset += 200) {
      const page = await this.list(ctx, { ...query, limit: 200, offset });
      all.push(...page.rows);
    }

    const header = ['Tarih', 'Ad Soyad', 'E-posta', 'Telefon', 'Form', 'Kampanya', 'Durum', 'Not'];
    const lines = [header.map(csvCell).join(',')];

    for (const r of all) {
      lines.push(
        [
          r.submittedAt,
          r.fullName ?? '',
          r.email ?? '',
          r.phone ?? '',
          r.leadFormName ?? '',
          r.campaignName ?? '',
          r.status,
          r.note ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }

    /**
     * BOM İLE BAŞLIYOR.
     *
     * Excel BOM'suz UTF-8'i Windows-1254 sanıyor ve Türkçe karakterler
     * bozuluyor: "Şükrü" → "Ãükrü". Ajansın müşteri listesini açıp çöp
     * görmesi, dosyanın hiç üretilmemesinden beter.
     */
    return '﻿' + lines.join('\r\n');
  }

  private filters(ctx: TenantContext, query: Partial<LeadQuery>): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`l.org_id = ${ctx.orgId}::uuid`,
      Prisma.sql`l.client_id = ${query.clientId}::uuid`,
    ];

    if (query.status) parts.push(Prisma.sql`l.status = ${query.status}`);
    if (query.leadFormId) parts.push(Prisma.sql`l.lead_form_id = ${query.leadFormId}::uuid`);
    if (query.dateFrom) {
      parts.push(Prisma.sql`l.submitted_at >= ${`${query.dateFrom}T00:00:00Z`}::timestamptz`);
    }
    if (query.dateTo) {
      // GÜN SONUNA KADAR: `<= tarih` yazmak o günün 00:00'ından sonrasını
      // dışarıda bırakır ve kullanıcı "bugünü seçtim ama bugünkü kayıtlar yok"
      // der. Ertesi günün başlangıcından KÜÇÜK kullanıyoruz.
      parts.push(Prisma.sql`l.submitted_at < (${`${query.dateTo}T00:00:00Z`}::timestamptz + interval '1 day')`);
    }
    if (query.search) {
      const term = `%${query.search}%`;
      parts.push(Prisma.sql`(
        l.full_name ILIKE ${term} OR l.email ILIKE ${term} OR l.phone ILIKE ${term}
      )`);
    }

    return Prisma.join(parts, ' AND ');
  }
}

function toRecord(row: LeadRow): LeadRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    externalLeadId: row.external_lead_id,
    leadFormId: row.lead_form_id,
    leadFormName: row.lead_form_name,
    socialProfileName: row.social_profile_name,
    externalAdId: row.external_ad_id,
    campaignName: row.campaign_name,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    fields: row.fields ?? [],
    status: row.status,
    note: row.note,
    source: row.source,
    submittedAt: row.submitted_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * CSV hücresi.
 *
 * FORMÜL ENJEKSİYONUNA KARŞI ÖNEK. `=`, `+`, `-`, `@` ile başlayan bir hücre
 * Excel'de formül olarak çalışıyor ve bu, reklamla gelen bir yabancının
 * yazdığı metin. `=cmd|'/c calc'!A1` gibi bir ad, dosyayı açan kişinin
 * makinesinde komut çalıştırabiliyor.
 */
function csvCell(value: string): string {
  const risky = /^[=+\-@\t\r]/.test(value);
  const safe = risky ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
