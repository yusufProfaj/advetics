import { IDS, type Harness } from './pglite-harness';

/**
 * Paket E testlerinin ortak tohumu: lead, ayar ve olay satırı. Testler
 * GERÇEK şemaya yazıyor (CHECK'ler, tekil indeks, FK); el yazımı tablo yok.
 */

/** 17 haneli Meta kimliği: 2^53'ü (≈9,007e15) aşıyor, sayıya çevrilirse bozulur. */
export const UZUN_LEAD_ID = '12345678901234567';

export const PIKSEL = '1234567890';

export async function lead(
  h: Harness,
  p: { id: string; externalId: string; submittedAt: Date; status?: string; client?: string; ad?: string },
): Promise<void> {
  await h.q(
    `INSERT INTO leads (id, org_id, client_id, external_lead_id, full_name, status, source, submitted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'webhook', $7, now())`,
    [p.id, IDS.org, p.client ?? IDS.client, p.externalId, p.ad ?? 'Ayşe Kaya', p.status ?? 'new', p.submittedAt.toISOString()],
  );
}

export async function ayarAc(h: Harness, p: { client?: string; baglanti?: string | null; etkin?: boolean } = {}): Promise<void> {
  const etkin = p.etkin ?? true;
  await h.q(
    `INSERT INTO geri_besleme_ayarlari
       (client_id, platform, org_id, etkin, dataset_id, dataset_adi, baglanti_id, aydinlatma_onaylayan,
        aydinlatma_zamani, etkinlestiren, etkinlestirme_zamani, updated_at)
     VALUES ($1, 'meta', $2, $3, $4, 'Test pikseli', $5, $6, now(), $6, now(), now())`,
    [p.client ?? IDS.client, IDS.org, etkin, PIKSEL, p.baglanti === undefined ? IDS.connection : p.baglanti, IDS.user],
  );
}

export async function olay(
  h: Harness,
  p: {
    leadId: string;
    asama: string;
    durum?: string;
    olayZamani: Date;
    sonrakiDeneme?: Date | null;
    deneme?: number;
    client?: string;
  },
): Promise<string> {
  const durum = p.durum ?? 'bekliyor';
  const ulasti = durum === 'iletildi' || durum === 'eslesmedi';
  const [r] = await h.q<{ id: string }>(
    `INSERT INTO geri_besleme_olaylari
       (org_id, client_id, lead_id, platform, asama, olay_kimligi, olay_zamani, durum, deneme, sonraki_deneme, gonderildi)
     VALUES ($1, $2, $3, 'meta', $4, $5, $6, $7, $8, $9, $10) RETURNING id::text AS id`,
    [
      IDS.org,
      p.client ?? IDS.client,
      p.leadId,
      p.asama,
      `adv-${p.leadId}-${p.asama}`,
      p.olayZamani.toISOString(),
      durum,
      p.deneme ?? 0,
      p.sonrakiDeneme === undefined ? (durum === 'bekliyor' || durum === 'basarisiz' ? new Date(0).toISOString() : null) : p.sonrakiDeneme?.toISOString() ?? null,
      ulasti ? new Date().toISOString() : null,
    ],
  );
  return r!.id;
}

export async function olaylar(h: Harness, leadId?: string): Promise<Array<{ asama: string; durum: string; deneme: number; hata: string | null; sonraki_deneme: Date | null }>> {
  return h.q(
    `SELECT asama, durum, deneme::int AS deneme, hata, sonraki_deneme FROM geri_besleme_olaylari
      ${leadId ? `WHERE lead_id = '${leadId}'` : ''} ORDER BY lead_id, asama`,
  );
}
