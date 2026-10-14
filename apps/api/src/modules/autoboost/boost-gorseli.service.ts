import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GORU_AYARI, GORU_MIME, goruBicimi, type TenantContext } from '@advetics/shared';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { ProviderRegistry } from '../connections/provider.registry';
import type { MetaProvider } from '../connections/providers/meta.provider';
import { goruIcinIndir } from '../reports/kreatif-gorseli';

/**
 * ═══ AKILLI BOOST KARTININ GÖRSELİ — KULLANIM ANINDA TAZELENİR ═══
 *
 * CANLIDA GÖRÜLDÜ (2026-10-14): Ege Birlik Yapı'da 39 kartın 6'sı "görsel
 * yok" diyordu; hepsi yayınlanıp süresi dolmuş Instagram gönderisiydi.
 * Kart oluşturulurken gönderinin CDN adresi `auto_boost_queue_items`a
 * KOPYALANIYOR ve o adres imzalı: birkaç günde ölüyor. Okuma artık organik
 * senkronun tazelediği adresi tercih ediyor (`autoboost-read.service.ts`),
 * ama senkron yalnız son 45 günü tazeliyor. Daha eski kart için adres
 * BURADA, kullanılacağı an soruluyor ve görsel akıtılıyor.
 *
 * Neden akıtılıyor (adres döndürülmüyor): indirme beyaz listesi
 * (`kreatif-gorseli.ts`, yalnız Meta CDN sonekleri, IP literali yok,
 * yönlendirme izlenmiyor) sunucuda; panel ham adresi bilmeden çiziyor.
 *
 * Yalnız Meta profilleri. YouTube küçük resmi `i.ytimg.com` üzerinde ve
 * kalıcı; "tazelenemedi" demek olmayan bir sorunu bildirmek olurdu.
 *
 * Platform çağrısı transaction DIŞINDA, 8 sn sınırlı, kart başına 10 dk
 * önbellekli (yalnız başarı): kırık bir kart sayfası her yenilendiğinde
 * Meta'ya gitmesin. Kota telemetrisi organik senkronla aynı anahtarla
 * yazılıyor; yazılmazsa bekçi bu trafiği hiç görmez.
 */
const ISTEK_MS = 8_000;
const ONBELLEK_MS = 10 * 60 * 1000;
const ONBELLEK_TAVANI = 500;

type Satir = {
  client_id: string;
  platform: string;
  external_id: string;
  profil_id: string | null;
  profil_turu: string | null;
  token_enc: Uint8Array | null;
};

@Injectable()
export class BoostGorseliService {
  private readonly log = new Logger(BoostGorseliService.name);
  private readonly onbellek = new Map<string, { url: string; son: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly crypto: CryptoService,
    private readonly quota: QuotaGuardService,
  ) {}

  async akit(ctx: TenantContext, kartId: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const [k] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Satir[]>(Prisma.sql`
        SELECT q.client_id::text AS client_id, q.platform::text AS platform, q.external_id,
               sp.id::text AS profil_id, sp.profile_type::text AS profil_turu, sp.page_access_token_enc AS token_enc
          FROM auto_boost_queue_items q
          LEFT JOIN social_profiles sp ON sp.id = q.social_profile_id
         WHERE q.id = ${kartId}::uuid`),
    );
    if (!k || !ctx.clientIds.includes(k.client_id)) throw new NotFoundException('Kart bulunamadı');
    // KAPALI LİSTE: yeni bir profil türü varsayılan olarak DIŞARIDA (CLAUDE.md, YouTube kanalı dersi).
    if (k.platform !== 'meta' || (k.profil_turu !== 'instagram_business' && k.profil_turu !== 'facebook_page')) {
      throw new NotFoundException('Bu kartın görseli kalıcı adreste; yenilenecek bir şey yok');
    }
    if (!k.token_enc) throw new BadGatewayException('Görsel alınamadı: sayfanın erişim anahtarı yok, sayfayı yeniden bağla');

    let url = this.onbellekten(kartId);
    if (!url) {
      try {
        url = await (this.providers.get('meta') as unknown as MetaProvider).organikGorselAdresi({
          pageAccessToken: this.crypto.decrypt(Buffer.from(k.token_enc)),
          externalId: k.external_id,
          profileType: k.profil_turu,
          timeoutMs: ISTEK_MS,
          onRateLimit: (snapshot) =>
            this.quota.record({ platform: 'meta', adAccountId: k.profil_id!, clientId: k.client_id, endpoint: 'organic:gorsel', snapshot }),
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        this.log.warn(`Boost kartı görseli tazelenemedi (${kartId}): ${m}`);
        throw new BadGatewayException(`Görsel alınamadı: ${m}`);
      }
      if (!url) throw new BadGatewayException('Görsel alınamadı: Meta bu gönderi için görsel adresi döndürmedi');
      this.onbellegeYaz(kartId, url);
    }
    const ind = await goruIcinIndir(url, {
      maxBayt: GORU_AYARI.maxBayt,
      zamanAsimiMs: GORU_AYARI.indirmeZamanAsimiMs,
      bicimAnla: goruBicimi,
      bicimHatasi: 'desteklenmeyen biçim (yalnızca JPEG/PNG/WebP)',
    });
    if (!ind.ok) throw new BadGatewayException(`Görsel alınamadı: ${ind.sebep}`);
    return { bytes: ind.bytes, mime: GORU_MIME[ind.tur] };
  }

  private onbellekten(id: string): string | null {
    const k = this.onbellek.get(id);
    return k && k.son > Date.now() ? k.url : null;
  }

  private onbellegeYaz(id: string, url: string): void {
    if (this.onbellek.size >= ONBELLEK_TAVANI) {
      const enEski = this.onbellek.keys().next();
      if (!enEski.done) this.onbellek.delete(enEski.value);
    }
    this.onbellek.set(id, { url, son: Date.now() + ONBELLEK_MS });
  }
}
