import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GORU_AYARI, GORU_MIME, goruBicimi, gorselAdresleri, type Platform, type TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { KreatifAdresiService } from './kreatif-adresi.service';
import { goruIcinIndir } from './kreatif-gorseli';

/**
 * ═══ KREATİF GÖRSELİ — KULLANIM ANINDA TAZELENİP AKITILIR ═══
 *
 * İyileştir › Kreatifler'in görsel ucunda (Paket D) doğdu; 2026-10-14'te
 * Reklam Yöneticisi önizlemesi ve Reklam Galerisi de aynı soruna düştü
 * (kullanıcı: *"reklam önizlemelerinde de problem oluyor"*): `creatives.
 * asset_urls` içindeki Meta CDN adresi imzalı ve birkaç günde ölüyor, kart
 * "görsel alınamadı" diyordu. TEK GÖVDE: iki uç ayrı ayrı yazılsaydı kota
 * katmanı, süre bütçesi ya da indirme beyaz listesi birinde unutulurdu
 * (`kreatif-adresi.service.ts`: "ikinci tazeleyici yazılmaz").
 *
 * Sıra: kısa okuma (RLS'li) → transaction DIŞINDA platform çağrısı
 * (`report_creative` kotası %50, yapı taramasını kilitleyemez) → beyaz
 * listeli indirme. Hata 200 + boş görsel DEĞİL: 502 ve nedeni; panel onu
 * yazıyor.
 *
 * Kimlik iki biçimde gelebiliyor: kreatif (İyileştir) ya da reklam (Reklam
 * Yöneticisi — panelde kreatifin iç kimliği yok, reklamınki var).
 */
const GORSEL_BUTCESI_MS = 8_000;

type Satir = {
  external_id: string;
  asset_urls: unknown;
  hesap_id: string;
  client_id: string | null;
  platform: Platform;
  hesap_ext: string;
  connection_id: string;
  manager_external_id: string | null;
};

export async function kreatifGorseliAkit(
  prisma: PrismaService,
  adres: KreatifAdresiService,
  ctx: TenantContext,
  kimlik: { creativeId: string } | { adId: string },
  etiket: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const kosul =
    'creativeId' in kimlik
      ? Prisma.sql`c.id = ${kimlik.creativeId}::uuid`
      : Prisma.sql`c.id = (SELECT ad.creative_id FROM ads ad WHERE ad.id = ${kimlik.adId}::uuid)`;
  const [k] = await prisma.withTenant(ctx, (tx) =>
    tx.$queryRaw<Satir[]>(Prisma.sql`
      SELECT c.external_id, c.asset_urls, a.id::text AS hesap_id, a.client_id::text AS client_id, a.platform::text AS platform,
             a.external_id AS hesap_ext, a.connection_id::text AS connection_id, a.manager_external_id
        FROM creatives c JOIN ad_accounts a ON a.id = c.ad_account_id
       WHERE ${kosul}`),
  );
  if (!k || !k.client_id || !ctx.clientIds.includes(k.client_id)) throw new NotFoundException('Kreatif bulunamadı');

  let url: string | null;
  if (k.platform === 'meta') {
    const r = await adres.hesapAdresleri(
      { id: k.hesap_id, clientId: k.client_id, platform: k.platform, externalId: k.hesap_ext, connectionId: k.connection_id, managerExternalId: k.manager_external_id },
      [k.external_id],
      { katman: 'report_creative', bitis: Date.now() + GORSEL_BUTCESI_MS, etiket },
    );
    const a = r?.adresler.get(k.external_id);
    if (!a || 'hata' in a) throw new BadGatewayException(`Görsel alınamadı: ${a && 'hata' in a ? a.hata : 'platform adres döndürmedi'}`);
    url = a.url;
  } else {
    // Google görsel varlıklarının adresi kalıcı; tazelenecek bir şey yok.
    url = gorselAdresleri(k.asset_urls)[0] ?? null;
    if (!url) throw new BadGatewayException('Görsel alınamadı: platform bu reklam için görsel adresi vermiyor');
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
