import { Prisma } from '@prisma/client';
import { ETIKET_SINIRI, type SayacDurumu } from '@advetics/shared';

/**
 * ═══ MALİYET BEKÇİSİ: SAYAÇ (MIMARI § 2, Ç-11) ═══
 *
 * AYIRMA TEK DEYİM. Worker dört işi paralel koşturuyor; "oku, karşılaştır,
 * yaz" üç adım olsaydı iki iş aynı anda 39'u görüp birlikte 41'e çıkardı.
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE istek < sınır RETURNING`:
 * satır kilidi ikinci güncellemeyi bekletiyor ve WHERE YENİ sürüm üstünde
 * yeniden değerlendiriliyor, yani günlük workspace sınırı yarışta aşılamıyor.
 *
 * AYLIK ve KÜRESEL toplam AYNI deyimin içinde alt sorguyla okunuyor. Onlar
 * BAŞKA satırların toplamı ve satır kilidi onları korumuyor: aynı anda
 * dört farklı workspace'in ayırması küresel sınırı en çok üç (eşzamanlılık
 * eksi bir) aşabilir. AYLIK SINIR DA AYNI: aylık toplam bu ayın BAŞKA
 * günlerinin satırlarını da okuyor ve aynı workspace'in iki hesabının
 * işi farklı günlere değil aynı güne yazdığı için çoğu zaman günlük satır
 * kilidi korur, ama gün dönümünde (dünün satırı + bugünün satırı) paralel
 * iki iş de en çok üç aşabilir. Bilinçli kabul edilen kalıntı; sınırlar
 * günde 1.500 / ayda 400 ve aşım en çok üç çağrı.
 *
 * Bağlı sayılar `::int` (CLAUDE.md "bağlı sayı parametresi tipsiz gitmez").
 */

export type TxLike = {
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
  $executeRaw(sql: Prisma.Sql): Promise<number>;
};

/** İstanbul günü (`YYYY-MM-DD`): sınır insan saatiyle "yarın 00:00'da" açılıyor. */
export function istanbulGunu(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Bir etiket çağrısı için yer ayırır. `true` = ayrıldı, çağrı yapılabilir.
 * ÇAĞRIDAN ÖNCE çağrılmalı: sonra çağırmak, sınır doluyken parayı
 * harcayıp sonra "doldu" demek olurdu (mutasyonla sınanıyor).
 */
export async function etiketAyir(tx: TxLike, g: { orgId: string; clientId: string; gun: string }): Promise<boolean> {
  const aylik = Prisma.sql`(SELECT coalesce(sum(x.etiket_istek), 0) FROM kreatif_etiket_sayaci x
                             WHERE x.client_id = ${g.clientId}::uuid
                               AND x.gun >= date_trunc('month', ${g.gun}::date)::date AND x.gun <= ${g.gun}::date)`;
  const kuresel = Prisma.sql`(SELECT coalesce(sum(y.etiket_istek), 0) FROM kreatif_etiket_sayaci y WHERE y.gun = ${g.gun}::date)`;
  const r = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    INSERT INTO kreatif_etiket_sayaci AS s (org_id, client_id, gun, etiket_istek)
    SELECT ${g.orgId}::uuid, ${g.clientId}::uuid, ${g.gun}::date, 1
     WHERE ${aylik} < ${ETIKET_SINIRI.workspaceAylik}::int
       AND ${kuresel} < ${ETIKET_SINIRI.kureselGunluk}::int
       AND 0 < ${ETIKET_SINIRI.workspaceGunluk}::int
    ON CONFLICT (client_id, gun) DO UPDATE
       SET etiket_istek = s.etiket_istek + 1, updated_at = now()
     WHERE s.etiket_istek < ${ETIKET_SINIRI.workspaceGunluk}::int
       AND ${aylik} < ${ETIKET_SINIRI.workspaceAylik}::int
       AND ${kuresel} < ${ETIKET_SINIRI.kureselGunluk}::int
    RETURNING s.etiket_istek AS n`);
  return r.length > 0;
}

/**
 * Brief için yer ayırır (workspace başına günde `briefGunluk`). API'de
 * KULLANICI bağlamında koşuyor; RLS'te sayaç tablosunun UPDATE politikası
 * bu yüzden var (02_rls.sql).
 */
export async function briefAyir(tx: TxLike, g: { orgId: string; clientId: string; gun: string }): Promise<boolean> {
  const r = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    INSERT INTO kreatif_etiket_sayaci AS s (org_id, client_id, gun, brief_istek)
    VALUES (${g.orgId}::uuid, ${g.clientId}::uuid, ${g.gun}::date, 1)
    ON CONFLICT (client_id, gun) DO UPDATE
       SET brief_istek = s.brief_istek + 1, updated_at = now()
     WHERE s.brief_istek < ${ETIKET_SINIRI.briefGunluk}::int
    RETURNING s.brief_istek AS n`);
  return r.length > 0;
}

/** Bekçinin cümlesi için durum (`bekciKarari`). Ayırma DEĞİL; yarışı önlemez. */
export async function sayacDurumu(tx: TxLike, clientId: string, gun: string): Promise<SayacDurumu & { briefBugun: number }> {
  const [r] = await tx.$queryRaw<Array<{ bugun: number; ay: number; kuresel: number; brief: number }>>(Prisma.sql`
    SELECT
      coalesce((SELECT etiket_istek FROM kreatif_etiket_sayaci WHERE client_id = ${clientId}::uuid AND gun = ${gun}::date), 0)::int AS bugun,
      coalesce((SELECT sum(etiket_istek) FROM kreatif_etiket_sayaci
                 WHERE client_id = ${clientId}::uuid AND gun >= date_trunc('month', ${gun}::date)::date AND gun <= ${gun}::date), 0)::int AS ay,
      coalesce((SELECT sum(etiket_istek) FROM kreatif_etiket_sayaci WHERE gun = ${gun}::date), 0)::int AS kuresel,
      coalesce((SELECT brief_istek FROM kreatif_etiket_sayaci WHERE client_id = ${clientId}::uuid AND gun = ${gun}::date), 0)::int AS brief`);
  return { workspaceBugun: r?.bugun ?? 0, workspaceBuAy: r?.ay ?? 0, kureselBugun: r?.kuresel ?? 0, briefBugun: r?.brief ?? 0 };
}

/**
 * Çağrı SONUCU: başarı/hata ve token. Ayrılmış istek sayısından ayrı
 * tutuluyor; "kaç kez ayırdık" ile "kaçı tuttu" farkı Gemini'nin hata
 * oranını gösteriyor (ölçüm, § 9.1).
 */
export async function sayacSonuc(
  tx: TxLike,
  g: { orgId: string; clientId: string; gun: string; basarili: number; hata: number; girdiToken: number; ciktiToken: number },
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO kreatif_etiket_sayaci AS s (org_id, client_id, gun, basarili, hata, girdi_token, cikti_token)
    VALUES (${g.orgId}::uuid, ${g.clientId}::uuid, ${g.gun}::date, ${g.basarili}::int, ${g.hata}::int,
            ${g.girdiToken}::bigint, ${g.ciktiToken}::bigint)
    ON CONFLICT (client_id, gun) DO UPDATE
       SET basarili = s.basarili + EXCLUDED.basarili, hata = s.hata + EXCLUDED.hata,
           girdi_token = s.girdi_token + EXCLUDED.girdi_token, cikti_token = s.cikti_token + EXCLUDED.cikti_token,
           updated_at = now()`);
}
