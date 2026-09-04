import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createTransport } from 'nodemailer';
import type {
  EmailAccountInput,
  EmailAccountSummary,
  SignatureCleanReport,
  TenantContext,
} from '@advetics/shared';
// AYRI SATIR: yukarıdaki blok `import type` ve oraya bir DEĞER koymak
// `TS1361` veriyor — tip bloğuna körlemesine eklemek kolay bir hata.
import { imzaTemizle } from '@advetics/shared';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';

function toPrismaBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

/**
 * DANIŞMANIN KENDİ E-POSTA KİMLİĞİ.
 *
 * Bütün işlemler `withTenant` içinde ve RLS satırı yalnızca SAHİBİNE
 * gösteriyor — yani "başkasının ayarını okuma/yazma" ihtimali burada bir
 * `if` ile değil, veritabanı politikasıyla kapalı. Servis yine de `userId`yi
 * bağlamdan alıyor, istek gövdesinden DEĞİL: gövdeden almak, RLS'i tek bir
 * unutulmuş alanla atlatılabilir hâle getirirdi.
 */
@Injectable()
export class EmailAccountService {
  private readonly logger = new Logger(EmailAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async get(ctx: TenantContext): Promise<EmailAccountSummary | null> {
    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * `smtp_pass_enc` SEÇİLMİYOR. Şifreli de olsa belleğe almanın gereği
       * yok — CLAUDE.md `page_access_token_enc` için aynı hatayı kaydediyor.
       * `hasPassword` bilgisi kolondan değil, SATIRIN VARLIĞINDAN türüyor
       * (kolon NOT NULL, parolasız satır oluşamıyor).
       */
      const rows = await tx.$queryRaw<
        Array<{
          from_name: string;
          from_email: string;
          smtp_host: string;
          smtp_port: number;
          smtp_secure: boolean;
          smtp_user: string;
          signature_html: string | null;
          verified_at: Date | null;
          last_error: string | null;
          last_error_at: Date | null;
        }>
      >(Prisma.sql`
        SELECT from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user,
               signature_html, verified_at, last_error, last_error_at
          FROM user_email_accounts
         WHERE user_id = ${ctx.userId}::uuid
      `);

      const r = rows[0];
      if (!r) return null;
      return {
        fromName: r.from_name,
        fromEmail: r.from_email,
        smtpHost: r.smtp_host,
        smtpPort: Number(r.smtp_port),
        smtpSecure: r.smtp_secure,
        smtpUser: r.smtp_user,
        hasPassword: true,
        signatureHtml: r.signature_html,
        verifiedAt: r.verified_at?.toISOString() ?? null,
        lastError: r.last_error,
        lastErrorAt: r.last_error_at?.toISOString() ?? null,
      };
    });
  }

  /**
   * Ayarı kaydeder. PAROLA BOŞSA MEVCUT KORUNUYOR.
   *
   * Zorunlu yapmak, yalnızca imzasını güncellemek isteyen kullanıcıya
   * parolasını yeniden yazdırmak olurdu — ve o parola bir daha okunamıyor
   * (şifreli saklanıyor), yani kullanıcı onu hatırlamak zorunda kalırdı.
   */
  async upsert(
    ctx: TenantContext,
    input: EmailAccountInput,
  ): Promise<{ account: EmailAccountSummary; signature: SignatureCleanReport }> {
    const temiz = input.signatureHtml ? imzaTemizle(input.signatureHtml) : null;

    await this.prisma.withTenant(ctx, async (tx) => {
      const mevcut = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM user_email_accounts WHERE user_id = ${ctx.userId}::uuid
      `);

      if (mevcut.length === 0 && !input.smtpPass) {
        throw new BadRequestException(
          'İlk kayıtta uygulama parolası zorunlu — parola olmadan mail gönderilemiyor.',
        );
      }

      const sifreli = input.smtpPass ? this.crypto.encrypt(input.smtpPass) : null;
      /*
       * PAROLA GÜNCELLEMESİ KOŞULLU. Boş bırakmak "değiştirme" demek;
       * `COALESCE` yerine iki ayrı SQL parçası kullanılıyor çünkü `bytea`
       * için NULL geçirmek kolonu NOT NULL kısıtına düşürürdü.
       */
      const parolaSet = sifreli
        ? Prisma.sql`, smtp_pass_enc = ${toPrismaBytes(sifreli)}, key_version = ${this.crypto.keyVersionOf(sifreli)}`
        : Prisma.empty;

      if (mevcut.length > 0) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE user_email_accounts SET
            from_name = ${input.fromName},
            from_email = ${input.fromEmail},
            smtp_host = ${input.smtpHost},
            smtp_port = ${input.smtpPort},
            smtp_secure = ${input.smtpSecure},
            smtp_user = ${input.smtpUser},
            signature_html = ${temiz?.html ?? null},
            -- AYAR DEĞİŞTİ = DOĞRULAMA DÜŞTÜ. Sunucu adresi ya da parola
            -- degistiginde eski damga artik hicbir sey soylemiyor; birakmak
            -- yanlis bir kimlikle "dogrulanmis" gorunen bir hesaptan
            -- musteriye rapor gondermeye calismak demek olurdu.
            verified_at = NULL,
            last_error = NULL,
            last_error_at = NULL,
            updated_at = now()
            ${parolaSet}
          WHERE user_id = ${ctx.userId}::uuid
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO user_email_accounts
            (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port,
             smtp_secure, smtp_user, smtp_pass_enc, key_version, signature_html,
             created_at, updated_at)
          VALUES (
            gen_random_uuid(), ${ctx.orgId}::uuid, ${ctx.userId}::uuid,
            ${input.fromName}, ${input.fromEmail}, ${input.smtpHost}, ${input.smtpPort},
            ${input.smtpSecure}, ${input.smtpUser},
            ${toPrismaBytes(sifreli!)}, ${this.crypto.keyVersionOf(sifreli!)},
            ${temiz?.html ?? null}, now(), now()
          )
        `);
      }
    });

    const account = await this.get(ctx);
    return {
      account: account!,
      signature: temiz?.rapor ?? { removedTags: [], removedAttributes: [], rewrittenImages: 0 },
    };
  }

  /**
   * KENDİNE TEST MAİLİ — "kaydedildi" doğrulama değil.
   *
   * SMTP kimliği yanlışsa hata ancak ilk GERÇEK gönderimde çıkar ve o
   * gönderim müşteriye gidecek olandır. Bu yüzden doğrulama ayrı bir adım ve
   * `verified_at` yalnızca burada yazılıyor; hesap doğrulanmadan rapor
   * gönderimi açılmıyor.
   *
   * Hata mesajı OLDUĞU GİBİ saklanıyor: "Kimlik doğrulanamadı" ile
   * "bağlantı reddedildi" farklı işler ve ikisini "gönderilemedi"ye çevirmek
   * kullanıcıyı tahmine bırakır.
   */
  async verify(ctx: TenantContext): Promise<{ ok: boolean; error: string | null }> {
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
        }>
      >(Prisma.sql`
        SELECT from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user,
               smtp_pass_enc, signature_html
          FROM user_email_accounts
         WHERE user_id = ${ctx.userId}::uuid
      `),
    );
    const gizli = rows[0];
    if (!gizli) throw new BadRequestException('Önce e-posta ayarlarını kaydedin.');

    const parola = this.crypto.decrypt(Buffer.from(gizli.smtp_pass_enc));

    try {
      const transport = createTransport({
        host: gizli.smtp_host,
        port: Number(gizli.smtp_port),
        secure: gizli.smtp_secure,
        auth: { user: gizli.smtp_user, pass: parola },
      });

      await transport.sendMail({
        from: { name: gizli.from_name, address: gizli.from_email },
        to: gizli.from_email,
        subject: 'Advetics — e-posta ayarı testi',
        html:
          '<p>Bu mail Advetics panelinden gönderildi. Bunu görüyorsan SMTP ayarların ' +
          'çalışıyor ve raporlar bu adresten gidecek.</p>' +
          (gizli.signature_html ? `<br />${gizli.signature_html}` : ''),
      });

      await this.prisma.withTenant(ctx, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE user_email_accounts
             SET verified_at = now(), last_error = NULL, last_error_at = NULL
           WHERE user_id = ${ctx.userId}::uuid
        `),
      );
      return { ok: true, error: null };
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP testi düştü (kullanıcı ${ctx.userId}): ${mesaj}`);
      await this.prisma.withTenant(ctx, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE user_email_accounts
             SET verified_at = NULL, last_error = ${mesaj.slice(0, 500)}, last_error_at = now()
           WHERE user_id = ${ctx.userId}::uuid
        `),
      );
      return { ok: false, error: mesaj };
    }
  }
}
