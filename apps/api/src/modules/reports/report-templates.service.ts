import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  REPORT_SECTIONS,
  reportOptionsSchema,
  type ReportOptions,
  type ReportSection,
  type ReportTemplateInput,
  type ReportTemplateSummary,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * RAPOR ŞABLONLARI — sıra, başlık ve bölüm ayarları.
 *
 * Bu servis geç yazıldı ve sebebi kayda değer: veri modeli, RLS politikaları
 * ve belgeyi şablondan render eden zincir BAŞTAN BERİ hazırdı. `sections`
 * dizisi sırayı zaten sürüyordu, dört RLS politikası duruyordu, `options`
 * kolonu tam bu iş için tanımlıydı — ve hiçbirini okuyan/yazan bir uç yoktu.
 * `report.write` izni de tanımlıydı ama hiçbir uca bağlı değildi.
 */
@Injectable()
export class ReportTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext): Promise<ReportTemplateSummary[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          client_id: string | null;
          client_name: string | null;
          sections: unknown;
          options: unknown;
          title: string | null;
          closing_text: string | null;
          updated_at: Date;
          share_count: bigint;
        }>
      >(Prisma.sql`
        SELECT t.id, t.name, t.client_id, c.name AS client_name,
               t.sections, t.options, t.title, t.closing_text, t.updated_at,
               /*
                * PAYLAŞIM SAYISI LİSTEDE. Şablon silmek ona bağlı bütün
                * paylaşım linklerini de siliyor (report_shares.template_id
                * ON DELETE CASCADE). Sayıyı göstermeden silme sormak,
                * müşteriye gönderilmiş bir raporu haber vermeden 404'e
                * çevirmek olurdu.
                */
               (SELECT COUNT(*) FROM report_shares s
                 WHERE s.template_id = t.id AND s.revoked_at IS NULL) AS share_count
          FROM report_templates t
          LEFT JOIN clients c ON c.id = t.client_id
         ORDER BY t.client_id NULLS FIRST, t.name
      `);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        clientId: r.client_id,
        clientName: r.client_name,
        sections: this.parseSections(r.sections),
        options: this.parseOptions(r.options),
        title: r.title,
        closingText: r.closing_text,
        updatedAt: r.updated_at.toISOString(),
        shareCount: Number(r.share_count),
      }));
    });
  }

  async create(
    ctx: TenantContext,
    input: ReportTemplateInput,
    meta: Meta,
  ): Promise<{ id: string }> {
    this.assertYetki(ctx, input.clientId ?? null);

    const row = await this.yazmaBaglami(ctx, input.clientId ?? null, async (tx) => {
      const [created] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO report_templates
          (id, org_id, client_id, name, title, closing_text, sections, options, status, updated_at)
        VALUES (
          -- id ACIKCA URETILIYOR: kolonun veritabani varsayilani yok, Prisma
          -- normalde uygulama tarafinda dolduruyor ve ham SQL o yoldan
          -- gecmiyor. (SQL yorumunda BACKTICK YOK — sablonu kapatiyor.)
          gen_random_uuid(),
          ${ctx.orgId}::uuid,
          ${input.clientId ?? null}::uuid,
          ${input.name},
          ${input.title ?? null},
          ${input.closingText ?? null},
          ${JSON.stringify(input.sections)}::jsonb,
          ${JSON.stringify(input.options ?? {})}::jsonb,
          'published',
          now()
        )
        RETURNING id
      `);
      // DENETİM AYNI TRANSACTION'DA: kayıt yazılıp denetim düşerse iz kopar.
      await this.audit.record(tx, ctx, {
        action: 'report_template.create',
        targetType: 'report_template',
        targetId: created!.id,
        clientId: input.clientId ?? null,
        after: { name: input.name, clientId: input.clientId ?? null, sections: input.sections },
        ...meta,
      });
      return created!;
    });

    return row;
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: ReportTemplateInput,
    meta: Meta,
  ): Promise<{ id: string }> {
    this.assertYetki(ctx, input.clientId ?? null);

    const row = await this.yazmaBaglami(ctx, input.clientId ?? null, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE report_templates SET
          client_id = ${input.clientId ?? null}::uuid,
          name = ${input.name},
          title = ${input.title ?? null},
          closing_text = ${input.closingText ?? null},
          sections = ${JSON.stringify(input.sections)}::jsonb,
          options = ${JSON.stringify(input.options ?? {})}::jsonb,
          updated_at = now()
        WHERE id = ${id}::uuid
        RETURNING id
      `);
      if (!rows[0]) return null;
      await this.audit.record(tx, ctx, {
        action: 'report_template.update',
        targetType: 'report_template',
        targetId: id,
        clientId: input.clientId ?? null,
        after: { name: input.name, clientId: input.clientId ?? null, sections: input.sections },
        ...meta,
      });
      return rows[0];
    });

    if (!row) throw new NotFoundException('Şablon bulunamadı');
    return row;
  }

  /**
   * Şablonu siler — VE KAÇ PAYLAŞIM LİNKİNİN GİTTİĞİNİ SÖYLER.
   *
   * `report_shares.template_id` `ON DELETE CASCADE`: şablonu silmek o
   * şablondan üretilmiş bütün linkleri de siliyor. Müşteriye gönderilmiş bir
   * rapor haber vermeden 404 olurdu. Silme yine de yapılıyor (ürün kararı),
   * ama sonucu sessiz kalmıyor: sayı hem yanıtta hem denetim kaydında.
   */
  async remove(
    ctx: TenantContext,
    id: string,
    meta: Meta,
  ): Promise<{ deleted: true; revokedShares: number }> {
    const sonuc = await this.prisma.withTenant(ctx, async (tx) => {
      const [before] = await tx.$queryRaw<
        Array<{ name: string; client_id: string | null; share_count: bigint }>
      >(Prisma.sql`
        SELECT t.name, t.client_id,
               (SELECT COUNT(*) FROM report_shares s WHERE s.template_id = t.id) AS share_count
          FROM report_templates t
         WHERE t.id = ${id}::uuid
      `);
      if (!before) return null;

      const shares = Number(before.share_count);
      /*
       * SAYI SİLMEDEN ÖNCE OKUNUYOR — kaydın ne zaman yazıldığı değil, sayının
       * ne zaman OKUNDUĞU önemli. `report_shares` CASCADE ile gidiyor; silme
       * sonrası sayarsak her zaman 0 çıkardı ve silmenin en pahalı yan etkisi
       * denetimde görünmezdi.
       *
       * (İlk yazımda buraya "denetim silmeden ÖNCE yazılmalı" diye bir yorum
       * koymuştum ve bir test onu iddia ediyordu; mutasyon denemesinde
       * kaydı silmeden sonraya almak hiçbir testi düşürmedi — çünkü sayı
       * zaten yukarıda değişkene alınmış. İddia yanlıştı, düzeltildi.)
       */
      await this.audit.record(tx, ctx, {
        action: 'report_template.delete',
        targetType: 'report_template',
        targetId: id,
        clientId: before.client_id,
        before: { name: before.name, clientId: before.client_id, revokedShares: shares },
        ...meta,
      });
      await tx.$executeRaw(Prisma.sql`DELETE FROM report_templates WHERE id = ${id}::uuid`);
      return { name: before.name, clientId: before.client_id, shares };
    });

    if (!sonuc) throw new NotFoundException('Şablon bulunamadı');
    return { deleted: true, revokedShares: sonuc.shares };
  }

  /**
   * ORG VARSAYILANINI YALNIZCA ORG YÖNETİCİSİ DEĞİŞTİRİR.
   *
   * RLS bunu zaten uyguluyor ama SESSİZCE: politika 0 satır döndürüyor ve
   * ekran "kaydedildi" diyor. Kontrolü burada da yapmak, kullanıcıya
   * neden olmadığını söylemeyi mümkün kılıyor.
   */
  private assertYetki(ctx: TenantContext, clientId: string | null): void {
    if (clientId === null && !ctx.isOrgAdmin) {
      throw new ForbiddenException(
        'Organizasyon geneli şablonu yalnızca org yöneticisi değiştirebilir. ' +
          'Bu müşteriye özel bir şablon oluşturun.',
      );
    }
  }

  /**
   * YAZMA BAĞLAMINDA AKTİF MÜŞTERİ KAPATILIYOR.
   *
   * `can_access_client()` aktif müşteriye daraltıyor. Bir şablonu müşteri
   * A'dan B'ye taşıyan (ya da org varsayılanına çeviren) UPDATE, yeni satır
   * o daraltmanın dışına düştüğü için `new row violates row-level security
   * policy` veriyor — WITH CHECK'i gevşetmek çözmüyor, engel SELECT
   * politikasında. Çözüm çağıran tarafta: bağlamı daraltan değeri bu istek
   * için kapatmak. `ad-account-pool-rls.spec.ts` aynı tuzağı kilitliyor.
   */
  private yazmaBaglami<T>(
    ctx: TenantContext,
    _hedefClientId: string | null,
    fn: (tx: Parameters<Parameters<PrismaService['withTenant']>[1]>[0]) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenant({ ...ctx, activeClientId: null }, fn);
  }

  private parseSections(value: unknown): ReportSection[] {
    if (!Array.isArray(value)) return [...REPORT_SECTIONS];
    const gecerli = value.filter((v): v is ReportSection =>
      REPORT_SECTIONS.includes(v as ReportSection),
    );
    // Tekrarlar eleniyor: aynı bölüm iki kez yazılırsa belge onu iki kez
    // basıyor ve React aynı `key` ile iki düğüm üretiyor.
    const tekil = [...new Set(gecerli)];
    return tekil.length > 0 ? tekil : [...REPORT_SECTIONS];
  }

  /**
   * `options` JSONB'sini ALAN ALAN doğrular.
   *
   * Ham JSON'u belgeye geçirmek, uydurulmuş bir anahtarın sessizce yok
   * sayılması demek olurdu — `auto_boost_presets.settings` yorumundaki
   * kararın aynısı. Bozuk kayıt boş nesneye düşüyor ve rapor varsayılan
   * sütunlarına dönüyor.
   */
  private parseOptions(value: unknown): ReportOptions {
    const r = reportOptionsSchema.safeParse(value);
    return r.success ? r.data : {};
  }
}
