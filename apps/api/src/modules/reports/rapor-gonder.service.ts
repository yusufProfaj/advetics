import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createTransport } from 'nodemailer';
import {
  type ReportMailDraft,
  type ReportQuery,
  type ReportSendInput,
  type TenantContext,
} from '@advetics/shared';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { imzaTemizle } from '../email/imza-temizle';
import { raporMailTaslagi } from './rapor-mail';
import { RaporPdfService } from './rapor-pdf.service';
import { ReportsService } from './reports.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * ═══ RAPORU MÜŞTERİYE GÖNDER ═══
 *
 * SENKRON, KUYRUKTA DEĞİL — ve bu karar ÖLÇÜLEREK verildi.
 *
 * İlk plan işi worker'a taşımaktı; gerekçe pm2'nin API sürecine koyduğu 512M
 * tavanıydı. O gerekçe PUPPETEER varsayımından geliyordu (200-300 MB
 * Chromium). `pdf-lib` ile ölçüm bambaşka: 600 kampanya ve 200 anahtar
 * kelimeli bir raporda 1 saniye, 35 KB belge, 10 MB heap artışı. Tavanın
 * yanına yaklaşmıyor.
 *
 * Buna karşılık kuyruk gerçek bir bedel getiriyordu: kullanıcı "gönder"e
 * basıp sonucu göremiyor. Müşteriye mail giden bir işlemde "gitti mi?"
 * sorusunu cevapsız bırakmak, bu projede tekrar eden hata türünün ta kendisi.
 */
@Injectable()
export class RaporGonderService {
  private readonly logger = new Logger(RaporGonderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly pdf: RaporPdfService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** Taslak: sayılar rapordan, anlatı şablondan. Ekranda düzenleniyor. */
  async taslak(ctx: TenantContext, query: ReportQuery): Promise<ReportMailDraft> {
    const data = await this.reports.build(ctx, query);
    const gonderen = await this.gonderen(ctx);

    const musteri = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ contact_email: string | null }>>(Prisma.sql`
        SELECT contact_email FROM clients WHERE id = ${query.clientId}::uuid
      `),
    );

    const t = raporMailTaslagi(data, gonderen?.from_name ?? '');
    return {
      subject: t.subject,
      html: t.html,
      defaultTo: musteri[0]?.contact_email ?? null,
      /*
       * DOĞRULANMAMIŞ HESAPLA GÖNDERİM KAPALI. "Kaydedildi" doğrulama değil:
       * SMTP kimliği yanlışsa hata ilk gerçek gönderimde çıkar ve o gönderim
       * müşteriye gidecek olandır.
       */
      senderReady: gonderen !== null && gonderen.verified_at !== null,
      senderEmail: gonderen?.from_email ?? null,
    };
  }

  async gonder(
    ctx: TenantContext,
    input: ReportSendInput,
    meta: Meta,
  ): Promise<{ sent: true; to: string }> {
    const gonderen = await this.gonderen(ctx);
    if (!gonderen) {
      throw new BadRequestException(
        'Önce kendi e-posta ayarlarını kaydet (Ayarlar → E-posta Ayarları).',
      );
    }
    if (gonderen.verified_at === null) {
      throw new BadRequestException(
        'E-posta ayarların doğrulanmadı. Ayarlar ekranından kendine test maili gönder — ' +
          'doğrulanmamış bir hesapla müşteriye mail atmak, ilk hatanın müşteriye gitmesi demek.',
      );
    }

    const alici = input.to_email ?? (await this.musteriEpostasi(ctx, input.clientId));
    if (!alici) {
      throw new BadRequestException(
        'Müşterinin iletişim e-postası tanımlı değil. Müşteriler ekranından ekleyebilirsin.',
      );
    }

    const query: ReportQuery = {
      clientId: input.clientId,
      from: input.from,
      to: input.to,
      ...(input.templateId ? { templateId: input.templateId } : {}),
    };
    const data = await this.reports.build(ctx, query);

    /*
     * GÖVDE TEMİZLENİYOR. Kullanıcı taslağı ekranda düzenliyor ve sonuç
     * alıcının istemcisinde açılıyor — imza ile aynı yüzey. Temizlik
     * gönderimden ÖNCE, çünkü giden şey ile denetime yazılan şey aynı olmalı.
     */
    const govde = imzaTemizle(input.html).html;
    const imza = gonderen.signature_html ? `<br /><br />${gonderen.signature_html}` : '';

    const ekler = input.attachPdf
      ? [
          {
            filename: `${input.clientId}-${input.from}_${input.to}.pdf`,
            content: await this.pdf.uret(data),
            contentType: 'application/pdf',
          },
        ]
      : [];

    const parola = this.crypto.decrypt(Buffer.from(gonderen.smtp_pass_enc));
    try {
      const transport = createTransport({
        host: gonderen.smtp_host,
        port: Number(gonderen.smtp_port),
        secure: gonderen.smtp_secure,
        auth: { user: gonderen.smtp_user, pass: parola },
      });
      await transport.sendMail({
        from: { name: gonderen.from_name, address: gonderen.from_email },
        to: alici,
        /*
         * YANITLAR DANIŞMANA GİTSİN. `from` zaten onun adresi ama bazı
         * kurumsal sunucular gönderen adresini yeniden yazıyor; `replyTo`
         * açıkça yazılınca müşterinin "yanıtla"sı her hâlükârda doğru yere
         * gidiyor.
         */
        replyTo: gonderen.from_email,
        subject: input.subject,
        html: `${govde}${imza}`,
        attachments: ekler,
      });
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Rapor maili gönderilemedi (${ctx.userId} → ${alici}): ${mesaj}`);
      /*
       * PLATFORMUN KENDİ MESAJI YUKARI TAŞINIYOR. "Gönderilemedi" demek,
       * "kimlik doğrulanamadı" ile "alıcı reddedildi"yi aynı cümleye
       * çevirirdi ve ikisinin yapılacak işi farklı.
       */
      throw new BadRequestException(`Mail gönderilemedi — ${mesaj}`);
    }

    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, {
        action: 'report.emailed',
        targetType: 'client',
        targetId: input.clientId,
        clientId: input.clientId,
        after: {
          to: alici,
          from: gonderen.from_email,
          subject: input.subject,
          range: `${input.from}..${input.to}`,
          attachedPdf: input.attachPdf,
        },
        ...meta,
      }),
    );

    return { sent: true, to: alici };
  }

  private async musteriEpostasi(ctx: TenantContext, clientId: string): Promise<string | null> {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ contact_email: string | null }>>(Prisma.sql`
        SELECT contact_email FROM clients WHERE id = ${clientId}::uuid
      `),
    );
    return rows[0]?.contact_email ?? null;
  }

  /** Gönderenin kendi e-posta kimliği. RLS zaten yalnızca kendi satırını veriyor. */
  private async gonderen(ctx: TenantContext) {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<
        Array<{
          from_name: string;
          from_email: string;
          smtp_host: string;
          smtp_port: number;
          smtp_secure: boolean;
          smtp_user: string;
          smtp_pass_enc: Uint8Array;
          signature_html: string | null;
          verified_at: Date | null;
        }>
      >(Prisma.sql`
        SELECT from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user,
               smtp_pass_enc, signature_html, verified_at
          FROM user_email_accounts
         WHERE user_id = ${ctx.userId}::uuid
      `),
    );
    return rows[0] ?? null;
  }
}
