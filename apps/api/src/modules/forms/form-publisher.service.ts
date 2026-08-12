import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LeadFormRecord, TenantContext } from '@advetics/shared';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { FormsService } from './forms.service';
import { publishBlockers } from './form-versioning';

/**
 * Formu Meta'da yayınlar.
 *
 * TEK ADIM ama GERİ ALINAMAZ.
 *
 * Reklam yayınlamanın aksine burada geri alma (rollback) yok: tek bir çağrı
 * var, ya olur ya olmaz. Asıl mesele sonrası — Meta'da oluşan form
 * GÜNCELLENEMİYOR ve silinmesi topladığı bilgileri de götürüyor. Bu yüzden
 * yayın öncesi kontroller (`publishBlockers`) arayüzde de, burada da
 * çalışıyor: API doğrudan çağrılabilir ve o yolda da aynı korumaların olması
 * gerekiyor.
 *
 * NOT: bu yol canlı Meta API'sinde HİÇ ÇALIŞTIRILMADI. `ads_management` +
 * `leads_retrieval` onayı bekleniyor; alan eşlemeleri Meta belgelerinden
 * çıkarıldı, gerçek yanıt görülmedi.
 */
@Injectable()
export class FormPublisherService {
  private readonly logger = new Logger(FormPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forms: FormsService,
    private readonly providers: ProviderRegistry,
    private readonly crypto: CryptoService,
    private readonly quota: QuotaGuardService,
  ) {}

  async publish(ctx: TenantContext, formId: string): Promise<LeadFormRecord> {
    const form = await this.forms.get(ctx, formId);

    const blockers = publishBlockers(form);
    if (blockers.length > 0) throw new BadRequestException(blockers.join(' '));

    const auth = await this.resolvePage(ctx, form);

    const provider = this.providers.get('meta');
    const can = provider.canWrite(auth.grantedScopes);
    if (!can.ok) {
      throw new BadRequestException(
        `Yazma izni yok: ${can.missing.join(', ')}. Meta onayı gelene kadar form yayınlanamaz.`,
      );
    }

    const gate = await this.quota.acquire({
      platform: 'meta',
      // Kota anahtarı SOSYAL PROFİL — çağrı sayfa token'ıyla gidiyor ve
      // reklam hesabının kotasından düşmüyor (organik senkronizasyonla aynı).
      adAccountId: form.socialProfileId,
      layer: 'interactive',
    });
    if (!gate.allowed) {
      throw new BadRequestException(
        `Meta kotası şu an dolu (${gate.reason}). Birkaç dakika sonra tekrar dene.`,
      );
    }

    try {
      const externalId = await provider.createLeadForm(
        {
          // Kullanıcı token'ı yalnızca kota geri bildirimi için taşınıyor;
          // isteğin kendisi sayfa token'ıyla gidiyor (aşağıda).
          accessToken: auth.pageAccessToken,
          accountExternalId: auth.pageExternalId,
          onRateLimit: (snapshot) =>
            this.quota.record({
              platform: 'meta',
              adAccountId: form.socialProfileId,
              endpoint: 'forms:publish',
              snapshot,
            }),
        },
        {
          pageExternalId: auth.pageExternalId,
          pageAccessToken: auth.pageAccessToken,
          name: form.name,
          formType: form.formType,
          headline: form.headline ?? undefined,
          intro: form.intro ?? undefined,
          questions: [
            ...form.prefillQuestions.map((t) => ({ type: t })),
            ...form.customQuestions.map((q) => ({
              type: 'CUSTOM' as const,
              label: q.label,
              options: q.type === 'multiple_choice' ? q.options : undefined,
            })),
          ],
          privacyPolicyUrl: form.privacyPolicyUrl,
          privacyPolicyLinkText: form.privacyPolicyLinkText,
          consentBoxes: form.consentBoxes,
          thankYouHeadline: form.thankYouHeadline,
          thankYouBody: form.thankYouBody,
          thankYouCtaText: form.thankYouCtaText,
          thankYouCtaUrl: form.thankYouCtaUrl ?? undefined,
        },
      );

      await this.forms.markPublished(ctx, formId, externalId);
    } catch (err) {
      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      await this.forms.markFailed(ctx, formId, message);
      this.logger.error(`Form yayınlanamadı (${formId}): ${message}`);
      throw new BadRequestException(message);
    }

    return this.forms.get(ctx, formId);
  }

  /**
   * Sayfa token'ını ve bağlantı izinlerini çözer.
   *
   * SAYFA TOKEN'I ZORUNLU. `leadgen_forms` sayfanın altında yaşıyor ve
   * kullanıcı token'ıyla çağrı, izinler doğru olsa bile "(#200) izin
   * gerekiyor" ile dönüyor — mesaj hangi token'ın eksik olduğunu söylemediği
   * için saatler yiyen bir hata. Eksikliği önceden söylüyoruz.
   */
  private async resolvePage(
    ctx: TenantContext,
    form: LeadFormRecord,
  ): Promise<{
    pageExternalId: string;
    pageAccessToken: string;
    grantedScopes: string[];
  }> {
    const [row] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<
        Array<{
          external_id: string;
          page_access_token_enc: Uint8Array | null;
          granted_scopes: string[];
          status: string;
        }>
      >(Prisma.sql`
        SELECT sp.external_id, sp.page_access_token_enc,
               c.granted_scopes, c.status::text AS status
        FROM social_profiles sp
        JOIN platform_connections c ON c.id = sp.connection_id
        WHERE sp.id = ${form.socialProfileId}::uuid
      `),
    );
    if (!row) throw new BadRequestException('Sayfa bağlantısı bulunamadı');
    if (row.status !== 'active') {
      throw new BadRequestException(
        `Platform bağlantısı etkin değil (${row.status}) — yeniden bağlanmak gerekiyor.`,
      );
    }
    if (!row.page_access_token_enc) {
      throw new BadRequestException(
        "Bu sayfanın token'ı yok. Bağlantıyı sayfa izinleriyle yeniden kurmak gerekiyor.",
      );
    }

    return {
      pageExternalId: row.external_id,
      // Anahtar sürümü şifreli verinin ilk baytına gömülü — `keyVersion`
      // kolonunu ayrıca vermek iki kaynağın ayrışması riski.
      pageAccessToken: this.crypto.decrypt(Buffer.from(row.page_access_token_enc)),
      grantedScopes: row.granted_scopes ?? [],
    };
  }
}
