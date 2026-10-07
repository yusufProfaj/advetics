import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { Prisma } from '@prisma/client';
import type { CryptoService } from '../../crypto/crypto.service';
import { MetaKesinHata, type TxRunner } from './yayin-motoru';
import type { GrafAyarlari } from './meta-graf';

/**
 * Reklam modülünün Meta ERİŞİMİ: token, sayfa token'ı, görsel baytları ve
 * hesap başına görsel önbelleği. Ortak olan yalnız tablolar ve şifreleme
 * servisi; eski bağlantı/varlık servisleri kullanılmıyor (modül sınırı).
 *
 * TOKEN YENİLEMEZ. Yenileme ve "yeniden yetkilendir" kararı bağlantının
 * sahibinin işi; yayın sırasında token yenilemek, yarım kalmış bir yayının
 * ortasında bağlantının durumunu değiştirebilirdi. Bağlantı `active`
 * değilse ya da token süresi geçtiyse yayın KESİN retle duruyor ve sebep
 * ekranda: "Meta bağlantısı yeniden yetkilendirilmeli".
 *
 * Token hiçbir hata mesajına, log'a ya da kayda yazılmıyor.
 */

export interface HesapErisimi {
  hesap: string;
  adAccountId: string;
  kullaniciToken: string;
  paraBirimi: string;
  saatDilimi: string;
}

interface HesapSatiri {
  external_id: string;
  currency: string;
  timezone: string;
  client_id: string | null;
  platform: string;
  durum: string;
  token: Buffer | Uint8Array;
  bitis: Date | null;
}

export async function hesapErisimi(
  tx: TxRunner,
  crypto: Pick<CryptoService, 'decrypt'>,
  adAccountId: string,
  clientId: string,
  simdi: Date = new Date(),
): Promise<HesapErisimi> {
  const [h] = await tx((t) =>
    t.$queryRaw<HesapSatiri[]>(Prisma.sql`
      SELECT a.external_id, a.currency, a.timezone, a.client_id::text, a.platform::text AS platform,
             c.status::text AS durum, c.access_token_enc AS token, c.token_expires_at AS bitis
        FROM ad_accounts a
        JOIN platform_connections c ON c.id = a.connection_id
       WHERE a.id = ${adAccountId}::uuid`),
  );
  if (!h) throw new MetaKesinHata('Reklam hesabı bulunamadı');
  // Atama kalktıysa ya da hesap başka workspace'e geçtiyse YAZMA YOK.
  if (h.client_id !== clientId) throw new MetaKesinHata('Bu reklam hesabı artık bu workspace’e atanmış değil');
  if (h.platform !== 'meta') throw new MetaKesinHata('Bu hesap bir Meta hesabı değil');
  if (h.durum !== 'active' || (h.bitis && h.bitis.getTime() <= simdi.getTime())) {
    throw new MetaKesinHata('Meta bağlantısı yeniden yetkilendirilmeli');
  }
  // `act_` öneki veride zaten var; elle eklemek "act_act_" üretir.
  const hesap = h.external_id.startsWith('act_') ? h.external_id : `act_${h.external_id}`;
  return {
    hesap,
    adAccountId,
    kullaniciToken: crypto.decrypt(Buffer.from(h.token)),
    paraBirimi: h.currency,
    saatDilimi: h.timezone,
  };
}

/** Form uçları için SAYFA token'ı; sayfa bu workspace'te olmalı. */
export function sayfaTokenOkuyucu(
  tx: TxRunner,
  crypto: Pick<CryptoService, 'decrypt'>,
  clientId: string,
): GrafAyarlari['sayfaTokeni'] {
  return async (sayfaPlatformId) => {
    const [s] = await tx((t) =>
      t.$queryRaw<Array<{ token: Buffer | Uint8Array | null }>>(Prisma.sql`
        SELECT page_access_token_enc AS token FROM social_profiles
         WHERE external_id = ${sayfaPlatformId} AND client_id = ${clientId}::uuid
           AND profile_type = 'facebook_page'`),
    );
    if (!s?.token) throw new MetaKesinHata('Sayfanın erişim izni yok; sayfa bağlantısını yenile');
    return crypto.decrypt(Buffer.from(s.token));
  };
}

/** `image_hash` önbelleği: `asset_platform_refs` (varlık × reklam hesabı). */
export function gorselOnbellegi(
  tx: TxRunner,
  orgId: string,
  adAccountId: string,
): GrafAyarlari['gorselOnbellek'] {
  return {
    async oku(varlikId) {
      const [r] = await tx((t) =>
        t.$queryRaw<Array<{ ref: string }>>(Prisma.sql`
          SELECT external_ref AS ref FROM asset_platform_refs
           WHERE asset_id = ${varlikId}::uuid AND ad_account_id = ${adAccountId}::uuid`),
      );
      return r?.ref ?? null;
    },
    async yaz(varlikId, hash) {
      await tx((t) =>
        t.$queryRaw(Prisma.sql`
          INSERT INTO asset_platform_refs (id, org_id, asset_id, platform, ad_account_id, external_ref)
          VALUES (gen_random_uuid(), ${orgId}::uuid, ${varlikId}::uuid, 'meta'::"Platform", ${adAccountId}::uuid, ${hash})
          ON CONFLICT (asset_id, ad_account_id) DO UPDATE SET external_ref = EXCLUDED.external_ref, uploaded_at = now()
          RETURNING id`),
      );
    },
  };
}

/**
 * Görsel baytları — yükleme kökünün DIŞINA çıkamaz. Anahtar veritabanından
 * geliyor; `..` taşıyan bir anahtar paylaşımlı sunucuda başka sitelerin
 * dosyalarını okutabilirdi.
 */
export function gorselOkuyucu(tx: TxRunner, yuklemeKoku: string, clientId: string): GrafAyarlari['gorselBaytlari'] {
  const kok = isAbsolute(yuklemeKoku) ? yuklemeKoku : resolve(process.cwd(), yuklemeKoku);
  const kokSep = kok.endsWith(sep) ? kok : kok + sep;
  return async (varlikId) => {
    const [v] = await tx((t) =>
      t.$queryRaw<Array<{ anahtar: string; tur: string }>>(Prisma.sql`
        SELECT storage_key AS anahtar, mime_type AS tur FROM assets
         WHERE id = ${varlikId}::uuid AND client_id = ${clientId}::uuid`),
    );
    if (!v) throw new MetaKesinHata('Görsel bu workspace’in arşivinde değil');
    // Meta yalnız JPEG/PNG kabul ediyor (yüklemede doğrulanmış olmalı).
    if (v.tur !== 'image/jpeg' && v.tur !== 'image/png') throw new MetaKesinHata(`Görsel biçimi desteklenmiyor: ${v.tur}`);
    const yol = resolve(kok, v.anahtar);
    if (!yol.startsWith(kokSep)) throw new Error(`Geçersiz depolama anahtarı: ${v.anahtar}`);
    return readFile(yol);
  };
}

/** Video baytları: yalnız mp4 ve mov, yalnız bu workspace'in arşivinden. */
export function videoOkuyucu(tx: TxRunner, yuklemeKoku: string, clientId: string): NonNullable<GrafAyarlari['videoBaytlari']> {
  const kok = isAbsolute(yuklemeKoku) ? yuklemeKoku : resolve(process.cwd(), yuklemeKoku);
  const kokSep = kok.endsWith(sep) ? kok : kok + sep;
  return async (varlikId) => {
    const [v] = await tx((t) =>
      t.$queryRaw<Array<{ anahtar: string; tur: string }>>(Prisma.sql`
        SELECT storage_key AS anahtar, mime_type AS tur FROM assets
         WHERE id = ${varlikId}::uuid AND client_id = ${clientId}::uuid AND kind = 'video'`),
    );
    if (!v) throw new MetaKesinHata('Video bu workspace’in arşivinde değil');
    if (v.tur !== 'video/mp4' && v.tur !== 'video/quicktime') throw new MetaKesinHata(`Video biçimi desteklenmiyor: ${v.tur}`);
    const yol = resolve(kok, v.anahtar);
    if (!yol.startsWith(kokSep)) throw new Error(`Geçersiz depolama anahtarı: ${v.anahtar}`);
    return { bayt: await readFile(yol), mime: v.tur };
  };
}
