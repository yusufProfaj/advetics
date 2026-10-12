import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LeadFormRecord, TenantContext } from '@advetics/shared';
import { FORM_GERI_OKUMA_ALANLARI, FORM_GERI_OKUMA_TEMEL_ALANLARI, formGeriOkumaDenetimi, formGeriOkumaUyarisi } from '@advetics/shared';
import { alanReddiMi } from '../reklam/rehber/platform-okuma';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { FormsService } from './forms.service';
import { publishBlockers } from './form-versioning';
import { kutuphaneFormuGovdesi } from './form-govdesi';

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

    // GÖVDE TEK ÜRETİCİDEN (`derleForm`): KVKK kutularının biçimi, dil ve
    // niyet adımı orada. Ret Meta'ya HİÇ gitmeden: geri alınamayan bir
    // adımın önünde, derleyicinin kendi cümleleriyle.
    const derleme = kutuphaneFormuGovdesi(form, auth.pageExternalId);
    if (derleme.tur === 'ret') throw new BadRequestException(derleme.retler.map((r) => r.mesaj).join(' '));
    const alanlar = derleme.govde.alanlar;

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

    /*
     * SAHİPLENME — Meta'ya gitmeden ÖNCE ve koşullu. İki sekme aynı formu
     * yayınlarsa ikincisi burada durur; `publishBlockers` okuması tek başına
     * yetmiyordu (ikisi de "taslak" görüp ikisi de form açardı).
     */
    if (!(await this.forms.yayinSahiplen(ctx, formId))) {
      throw new ConflictException('Bu form şu an yayınlanıyor ya da yayını yarım kaldı; Formlar’dan kontrol et.');
    }

    const fetchCtx = {
      // Kullanıcı token'ı yalnızca kota geri bildirimi için taşınıyor;
      // isteğin kendisi sayfa token'ıyla gidiyor.
      accessToken: auth.pageAccessToken,
      accountExternalId: auth.pageExternalId,
      onRateLimit: (snapshot: Parameters<NonNullable<Parameters<typeof provider.createLeadForm>[0]['onRateLimit']>>[0]) =>
        this.quota.record({ platform: 'meta', adAccountId: form.socialProfileId, endpoint: 'forms:publish', snapshot }),
    };

    // 1) META. Yalnız BU adımın hatası satırı `failed` yapar: form açılmadı.
    let externalId: string;
    try {
      externalId = await provider.createLeadForm(fetchCtx, { pageExternalId: auth.pageExternalId, pageAccessToken: auth.pageAccessToken, alanlar });
    } catch (err) {
      const message = err instanceof PlatformApiError ? `${err.kind}: ${err.message}` : err instanceof Error ? err.message : String(err);
      await this.forms.markFailed(ctx, formId, message);
      this.logger.error(`Form yayınlanamadı (${formId}): ${message}`);
      throw new BadRequestException(message);
    }

    /*
     * 2) KİMLİK — HEMEN, AYRI VE KISA. Meta formu açtı; bundan sonraki hiçbir
     * hata satırı `failed` YAPMAZ ("Kayıt yazılamazsa satır failed DEĞİL",
     * CLAUDE.md): `failed` yeniden denenebilir demek ve Meta'da form
     * silinemiyor. Bu yazım düşerse satır `publishing` kalır, yeniden yayın
     * kapalıdır ve kimlik log'da durur.
     */
    try {
      await this.forms.kimlikYaz(ctx, formId, externalId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.logger.error(`Meta formu açıldı (${externalId}) ama kimlik kayda yazılamadı (${formId}): ${m}`);
      throw new BadRequestException(
        `Meta'da form açılmış olabilir (kimlik ${externalId}) ama kayda yazılamadı. Formlar'dan kontrol et; yeniden yayın kapalı.`,
      );
    }

    // 3) GERİ OKUMA. "200 döndü" doğrulama değil: Meta tanımadığı alanı kabul
    // edip yok sayabiliyor. Okuma da karşılaştırma da düşebilir; ikisi de
    // uyarıya çevrilir, satır yayında kalır.
    let uyari: string | null;
    try {
      const { okunan, okumaHatasi } = await this.geriOku(provider, fetchCtx, auth.pageAccessToken, externalId, formId);
      uyari = formGeriOkumaUyarisi(formGeriOkumaDenetimi(alanlar, okunan, okumaHatasi));
    } catch (e) {
      uyari = `Form yayınlandı ama Meta'da doğrulanamadı: geri okuma karşılaştırılamadı (${e instanceof Error ? e.message : String(e)}).`;
    }
    if (uyari) this.logger.warn(`Form geri okuma (${formId}): ${uyari}`);

    // 4) SONUCUN KAYDI. Düşerse satır yayında ve "geri okuma tamamlanmadı"
    // uyarısıyla kalır (kimlik yazımı onu koymuştu); hata kullanıcıya gider.
    try {
      await this.forms.markPublished(ctx, formId, externalId, uyari);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.logger.error(`Form geri okuma sonucu kaydedilemedi (${formId} → ${externalId}): ${m}`);
      throw new BadRequestException(`Form Meta'da yayında (kimlik ${externalId}) ama geri okuma sonucu kaydedilemedi: ${m}`);
    }

    return this.forms.get(ctx, formId);
  }

  /**
   * Geri okuma. Önce bütün alanlar; Graph ALAN reddederse (#100 "nonexisting
   * field") temel alanlarla yeniden: reddedilen kısım okunmamış olur ve
   * denetim onu "okunamadı" yazar (temiz DEĞİL). Başka hata: okunamadı.
   */
  private async geriOku(
    provider: ReturnType<ProviderRegistry['get']>,
    fetchCtx: { accessToken: string; accountExternalId: string },
    pageAccessToken: string,
    formId: string,
    kayitId: string,
  ): Promise<{ okunan: Record<string, unknown> | null; okumaHatasi: string | null }> {
    if (!provider.readLeadForm) return { okunan: null, okumaHatasi: 'bu platformda form geri okunamıyor' };
    try {
      return { okunan: await provider.readLeadForm(fetchCtx, { pageAccessToken, formId, fields: FORM_GERI_OKUMA_ALANLARI }), okumaHatasi: null };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Form geri okunamadı (${kayitId} → ${formId}): ${m}`);
      if (!alanReddiMi(e)) return { okunan: null, okumaHatasi: m };
      try {
        return { okunan: await provider.readLeadForm(fetchCtx, { pageAccessToken, formId, fields: FORM_GERI_OKUMA_TEMEL_ALANLARI }), okumaHatasi: null };
      } catch (e2) {
        return { okunan: null, okumaHatasi: e2 instanceof Error ? e2.message : String(e2) };
      }
    }
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
