import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import {
  emailAccountInputSchema,
  type EmailAccountInput,
  type EmailAccountSummary,
  type SignatureCleanReport,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { EmailAccountService } from './email-account.service';

/**
 * KENDİ E-POSTA KİMLİĞİN — `/me/email-account`.
 *
 * YETKİ DEKORATÖRÜ YOK ve bu bilinçli: burada "başkasının ayarı" diye bir
 * kavram yok. Kullanıcı yalnızca KENDİ satırını görüyor ve düzenliyor;
 * kapsam RLS ile ve bağlamdan alınan `userId` ile kapalı, bir izin
 * kontrolüyle değil. `report.write` gibi bir izin istemek, danışmanın kendi
 * imzasını düzenlemesini yönetici ayarına bağlamak olurdu.
 */
@Controller('me/email-account')
export class EmailAccountController {
  constructor(private readonly accounts: EmailAccountService) {}

  @Get()
  get(@CurrentTenant() ctx: TenantContext): Promise<EmailAccountSummary | null> {
    return this.accounts.get(ctx);
  }

  @Put()
  save(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(emailAccountInputSchema)) dto: EmailAccountInput,
  ): Promise<{ account: EmailAccountSummary; signature: SignatureCleanReport }> {
    return this.accounts.upsert(ctx, dto);
  }

  /**
   * Kendine test maili gönderir.
   *
   * AYRI BİR ADIM, çünkü "kaydedildi" doğrulama değil: SMTP kimliği
   * yanlışsa hata ancak ilk gerçek gönderimde çıkar ve o gönderim müşteriye
   * gidecek olandır.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@CurrentTenant() ctx: TenantContext): Promise<{ ok: boolean; error: string | null }> {
    return this.accounts.verify(ctx);
  }
}
