import { Prisma } from '@prisma/client';
import type { RuleRecord } from '@advetics/shared';
import { govdeKur } from './bildirim-icerik';
import type { TxLike } from './sinyal-hesap';

/**
 * ═══ KURAL BİLDİRİMİ (MIMARI Ç-6, kabul edildi) ═══
 *
 * İki olay `kural` türünde kanala gidiyor:
 *
 *  1. `notify` eylemli CANLI kuralın eşleşmesi → kuralın `kanalIdleri`
 *     (isteğe bağlı) ∩ workspace'in `kural` olayını alan etkin kanalları.
 *     Kanalsız eski kurallar "yalnız kural geçmişine yazılır" (sözleşme).
 *  2. Canlı kuralın platformda BAŞARISIZ olan eylemi → workspace'in `kural`
 *     olayını alan BÜTÜN etkin kanalları. Bugüne kadar yalnız kural
 *     geçmişinde duruyordu: kural "çalışıyor" görünüp hiçbir şey yapmıyordu.
 *
 * PROVA (dryRun) KURAL BİLDİRMEZ: prova "dış dünyaya etkisi olmayan
 * çalıştırma" ve kanala düşen mesaj bir dış etki. `notify` kuralının
 * gerçekten haber vermesi için canlıya alınması (rule.activate) gerekiyor.
 *
 * KURAL TURU BAŞINA KANAL BAŞINA TEK SATIR (`kural:<run_id>`); 20 varlık
 * eşleşse de tek mesaj. Satırlar `bekliyor`; işleyici tur biter bitmez
 * gönderiyor (`anahtarlaGonder`), düşerse 5 dakikalık süpürme yeniden dener.
 *
 * KAYNAK `rule_action_logs`, yürütücünün bellekteki sayacı DEĞİL: kayıt
 * neyse bildirim o. Sayaç ile kayıt ayrışırsa kanal ile kural geçmişi iki
 * farklı hikâye anlatırdı.
 */
export async function kuralBildirimiYaz(tx: TxLike, rule: RuleRecord, runId: string): Promise<number> {
  if (rule.dryRun) return 0;
  const bildir = rule.action.type === 'notify';
  const kanalIdleri = rule.action.type === 'notify' ? (rule.action.kanalIdleri ?? []) : null;
  if (bildir && kanalIdleri!.length === 0) return 0;

  const kayitlar = await tx.$queryRaw<
    Array<{ outcome: string; entity_level: string; entity_name: string; reason: string | null; error: string | null }>
  >(Prisma.sql`
    SELECT outcome, entity_level::text AS entity_level, entity_name, reason, error
      FROM rule_action_logs
     WHERE run_id = ${runId}::uuid
       AND outcome = ${bildir ? 'simulated' : 'failed'}
     ORDER BY entity_name`);
  if (kayitlar.length === 0) return 0;

  const seviyeAdi: Record<string, string> = { campaign: 'Kampanya', ad_group: 'Reklam seti', ad: 'Reklam' };
  const n = kayitlar.length;
  const baslik = bildir ? `Kural: ${rule.name}, ${n} eşleşme` : `Kural: ${rule.name}, ${n} eylem uygulanamadı`;
  const govde = govdeKur({
    baslik,
    konu: `Advetics · ${baslik}`,
    satirlar: kayitlar.map((k) => ({
      etiket: `${seviyeAdi[k.entity_level] ?? k.entity_level} ${k.entity_name}`,
      metin: (bildir ? k.reason : k.error ?? k.reason) ?? '',
    })),
    fazlaBirimi: 'kayıt',
    baglanti: { metin: "Kural geçmişini Advetics'te aç", yol: 'kurallar' },
  });

  return tx.$executeRaw(Prisma.sql`
    INSERT INTO bildirim_gonderimleri (org_id, client_id, kanal_id, olay, anahtar, ozet, govde, kaynaklar, durum)
    SELECT k.org_id, k.client_id, k.id, 'kural', ${`kural:${runId}`}, ${baslik.slice(0, 200)},
           ${JSON.stringify(govde)}::jsonb, ${JSON.stringify([runId])}::jsonb, 'bekliyor'
      FROM bildirim_kanallari k
     WHERE k.client_id = ${rule.clientId}::uuid AND k.etkin AND 'kural' = ANY(k.olaylar)
       ${kanalIdleri ? Prisma.sql`AND k.id = ANY(${kanalIdleri}::uuid[])` : Prisma.empty}
    ON CONFLICT (kanal_id, anahtar) DO NOTHING`);
}

/**
 * ═══ KURAL TURUNUN TRANSACTION'INI BİLDİRİM HATASINDAN KORU (Ajan 4, N-d) ═══
 *
 * API'nin elle çalıştırma yolu kuralı `withTenant` transaction'ı içinde
 * yürütüyor. Orada bildirim yazımı düşerse (RLS reddi, bozuk kanal kimliği)
 * Postgres transaction'ı İPTAL ediyor: hatayı yakalamak yetmiyor, sonraki
 * `UPDATE rule_runs` "current transaction is aborted" ile düşüyor ve kuralın
 * bütün kaydı geri alınıyordu. Yazım bir SAVEPOINT içinde: düşerse yalnız
 * kendisi geri alınıyor ve hata cümlesi çağırana dönüyor (tur kaydına yazılır).
 *
 * Worker transaction AÇMIYOR (autocommit); orada SAVEPOINT komutu
 * "yalnız transaction bloğunda" diye reddediliyor ve buna gerek de yok:
 * autocommit'te düşen deyim başka hiçbir şeyi iptal etmiyor.
 */
export async function kuralBildirimiGuvenli(
  tx: TxLike,
  rule: RuleRecord,
  runId: string,
  transactionIcinde: boolean,
): Promise<string | null> {
  /*
   * ÇAĞIRAN SÖYLÜYOR, DENEYEREK ÖĞRENİLMİYOR. Eskiden SAVEPOINT her yolda
   * gönderiliyor ve worker'da reddedilince yutuluyordu: her kural turunda
   * Postgres'e bir hatalı komut, Prisma hata günlüğünde bir satır gürültü
   * (Ajan 4, N1). Ayrıca boş catch, transaction İÇİNDE başka bir sebeple
   * düşen SAVEPOINT'i de "transaction yok" sanıp korumasız devam ederdi.
   */
  const savepoint = transactionIcinde;
  if (savepoint) await tx.$executeRaw(Prisma.sql`SAVEPOINT kural_bildirimi`);
  try {
    await kuralBildirimiYaz(tx, rule, runId);
    if (savepoint) await tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT kural_bildirimi`);
    return null;
  } catch (err) {
    if (savepoint) await tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT kural_bildirimi`);
    return `Bildirim kuyruğa alınamadı: ${err instanceof Error ? err.message : String(err)}`;
  }
}
