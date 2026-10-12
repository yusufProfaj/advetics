import { IDS, type Harness } from './pglite-harness';

/**
 * ═══ KREATİF ZEKÂSI TEST TOHUMU (Paket D) ═══
 *
 * İş ve servis testleri AYNI tohumu kullanıyor: kampanya → reklam seti →
 * reklam → kreatif → reklam seviyesinde günlük metrik. Elle yazılmış bir
 * "kreatif zekâ satırı" yok; satırları işin kendisi açıyor ve ekran onu
 * okuyor, ikisinin biçimi ayrışırsa testler düşmeli.
 */

let sayac = 0;
const uuid = (on: string) => `${on}-0000-4000-8000-${String(++sayac).padStart(12, '0')}`;

/** Gerçek PNG başlığı (IHDR boyutlu) + ayırt edici kuyruk: farklı kuyruk = farklı SHA-256. */
export function png(genislik: number, yukseklik: number, kuyruk = 0): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, genislik);
  dv.setUint32(20, yukseklik);
  dv.setUint32(36, kuyruk);
  return b;
}

export interface KreatifTohumu {
  creativeId: string;
  adId: string;
  externalId: string;
}

/**
 * Bir kampanya (amaç `objective`), bir set, bir reklam, bir kreatif ve
 * `gunler` gün boyunca günlük metrik. Harcama TL, gün başına.
 */
export async function kreatifTohumla(
  h: Harness,
  g: {
    objective: string;
    platform?: 'meta' | 'google';
    raw?: Record<string, unknown>;
    assetUrls?: string[];
    creativeType?: string;
    gunler: string[];
    gosterim?: number;
    tiklama?: number;
    donusum?: number;
    harcamaTl?: number;
    adAccountId?: string;
    clientId?: string;
  },
): Promise<KreatifTohumu> {
  const platform = g.platform ?? 'meta';
  const acc = g.adAccountId ?? IDS.adAccount;
  const client = g.clientId ?? IDS.client;
  const camp = uuid('c0000000');
  const grup = uuid('d0000000');
  const ad = uuid('e0000000');
  const kreatif = uuid('f0000000');
  const ext = `k-${sayac}`;
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, objective, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now())`,
    [camp, acc, client, platform, `c-${sayac}`, `Kampanya ${sayac}`, g.objective],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Set', now())`,
    [grup, camp, acc, client, platform, `g-${sayac}`],
  );
  await h.q(
    `INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, creative_type, raw, asset_urls, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())`,
    [kreatif, acc, client, platform, ext, g.creativeType ?? null, JSON.stringify(g.raw ?? {}), g.assetUrls ? JSON.stringify(g.assetUrls) : null],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, creative_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, now())`,
    [ad, grup, acc, client, platform, `a-${sayac}`, `Reklam ${sayac}`, kreatif],
  );
  for (const gun of g.gunler) {
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
         impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
       VALUES ($1, $2, $3, 'ad', $4, $5, $6, '', $7, $8, $7, $9, $10, 0, 'TRY')`,
      [client, acc, platform, ad, `a-${sayac}`, gun, g.gosterim ?? 1000, g.tiklama ?? 10, String((g.harcamaTl ?? 100) * 1_000_000), g.donusum ?? 0],
    );
  }
  return { creativeId: kreatif, adId: ad, externalId: ext };
}

/** `YYYY-MM-DD`, bugünden `n` gün önce (UTC; testler İstanbul gününe göre en az bir gün geride tohumluyor). */
export function gunOnce(n: number, simdi = new Date()): string {
  const d = new Date(simdi);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
