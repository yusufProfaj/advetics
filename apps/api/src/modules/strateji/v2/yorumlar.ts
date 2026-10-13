import { Prisma } from '@prisma/client';
import type { StratejiOnayRolu, StratejiYorumlari, StratejiYorumu } from '@advetics/shared';
import type { PlanSatiri, Sorgucu } from './satirlar';

/** Yorum listesi bu sayıda kesilir; `toplam` ayrıca söylenir (sessiz kesme yok). */
export const YORUM_SINIRI = 200;

/**
 * Yorum KAYDI: yalnız INSERT (politika da yalnız INSERT + SELECT). Revizyon
 * nedeni ve onay izi burada; değiştirilebilir bir yorum "müşteri neye itiraz
 * etti" sorusunun cevabını sonradan değiştirirdi.
 */
export async function yorumEkle(
  tx: Sorgucu,
  p: Pick<PlanSatiri, 'id' | 'org_id' | 'client_id'>,
  y: { surum: number; userId: string | null; rol: StratejiOnayRolu; tur: 'yorum' | 'revizyon' | 'onay'; metin: string; yazanAd: string | null; kalemId: string | null },
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    INSERT INTO strateji_yorumlari (plan_id, org_id, client_id, kalem_id, surum, user_id, rol, tur, metin, yazan_ad)
    VALUES (${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${y.kalemId}::uuid, ${y.surum}::int, ${y.userId}::uuid,
            ${y.rol}, ${y.tur}, ${y.metin}, ${y.yazanAd})
    RETURNING id`);
}

export async function yorumlariOku(tx: Sorgucu, p: Pick<PlanSatiri, 'id' | 'client_id'>): Promise<StratejiYorumlari> {
  const r = await tx.$queryRaw<Array<{ id: string; rol: StratejiOnayRolu; tur: StratejiYorumu['tur']; ad: string | null; yazan_ad: string | null; metin: string; surum: number; kalem_sira: number | null; created_at: Date }>>(Prisma.sql`
    SELECT y.id::text, y.rol, y.tur, u.full_name AS ad, y.yazan_ad, y.metin, y.surum, k.sira::int AS kalem_sira, y.created_at
      FROM strateji_yorumlari y
      LEFT JOIN users u ON u.id = y.user_id
      LEFT JOIN strateji_kalemleri k ON k.id = y.kalem_id
     WHERE y.plan_id = ${p.id}::uuid AND y.client_id = ${p.client_id}::uuid
     ORDER BY y.created_at, y.id
     LIMIT ${YORUM_SINIRI}::int`);
  const [n] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int AS n FROM strateji_yorumlari WHERE plan_id = ${p.id}::uuid AND client_id = ${p.client_id}::uuid`);
  return {
    yorumlar: r.map((y) => ({
      id: y.id,
      rol: y.rol,
      tur: y.tur,
      // Bağlantıyla yazanın adı kendi BEYANI; panel kullanıcısının adı users'tan.
      ad: y.rol === 'baglanti' ? y.yazan_ad : y.ad,
      metin: y.metin,
      surum: y.surum,
      kalemSira: y.kalem_sira,
      zaman: new Date(y.created_at).toISOString(),
    })),
    toplam: n?.n ?? r.length,
  };
}

