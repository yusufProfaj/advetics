import { Prisma } from '@prisma/client';
import type { TxRunner } from './yayin-motoru';

export type KapiDurumu = { acik: true } | { acik: false; sebep: string };

/**
 * `metaYazmaAcikMi` — "Meta'ya yazmayı durdur" anahtarının TEK KAPISI
 * (TASARIM.md § 11.10).
 *
 * İki şirkete bakılıyor: workspace'in kendi şirketi ve onun AJANSI (üst
 * hesabın `ajans_org_id`si). Anahtarı ajans basar ve bütün şirketlerine
 * geçerlidir; yalnız kendi şirketine baksaydık ajansın durdurması müşteri
 * şirketlerinde hiçbir şey durdurmazdı.
 *
 * OKUNAMAZSA KAPALI: anahtarın durumunu bilmeden yazmak, durdurulmuş bir
 * olayın ortasında yazmak olabilir.
 */
export async function metaYazmaAcikMi(tx: TxRunner, clientId: string): Promise<KapiDurumu> {
  try {
    const satirlar = await tx((t) =>
      t.$queryRaw<Array<{ durduruldu: boolean; sebep: string | null }>>(Prisma.sql`
        WITH s AS (
          SELECT c.org_id, ma.ajans_org_id
            FROM clients c
            JOIN organizations o ON o.id = c.org_id
            LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
           WHERE c.id = ${clientId}::uuid
        )
        SELECT a.meta_yazma_durduruldu AS durduruldu, a.durdurma_sebebi AS sebep
          FROM ajans_ayari a, s
         WHERE a.org_id = s.org_id OR a.org_id = s.ajans_org_id`),
    );
    const d = satirlar.find((s) => s.durduruldu);
    return d ? { acik: false, sebep: `Meta'ya yazma ajans tarafından durduruldu: ${d.sebep ?? ''}`.trim() } : { acik: true };
  } catch (e) {
    return { acik: false, sebep: `Yazma anahtarının durumu okunamadı: ${(e as Error).message}` };
  }
}
