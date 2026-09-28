import { Prisma, type SyncJobType } from '@prisma/client';

/**
 * "Sıfır satır yazdı" hangi iş türlerinde bir ARIZA işareti.
 *
 * Organik gönderi ya da potansiyel müşteri işi sıfır satırla bitebilir ve bu
 * normaldir — o gün yeni gönderi yoktur. Metrik işinde sıfır satır ise ya
 * yapı taraması eksik ya varlık arşivlenmiş demek.
 *
 * AYRI DOSYADA: Senkronizasyon Durumu ucu ve onun ölçüm aracı
 * (`prisma/olcum-senkron.ts`) aynı listeyi kullanıyor. Aracın kendi kopyası
 * olsaydı iki liste ayrıştığı gün ÖLÇÜLEN sorgu ile ÇALIŞAN sorgu farklı
 * olurdu ve ölçüm yanlış yere işaret ederdi.
 */
export const METRIK_ISLERI = [
  'insights_realtime',
  'insights_daily',
  'insights_backfill',
  'initial_backfill',
  // `as const` DEĞİL: Prisma `in` süzgeci mutable dizi bekliyor.
] satisfies SyncJobType[];

/**
 * ═══ SENKRONİZASYON EKRANININ DÖRT SAYACI — TEK TARAMA ═══
 *
 * Dört ayrı `tx.syncJob.count()` çağrısıydı ve her biri `sync_jobs`u baştan
 * tarıyordu; RLS politikası (`can_access_client`) her satırda koşuyor.
 * Üretimde ölçüldü (2026-09-28, 294.108 satır, "Tüm şirketler"): dört sorgu
 * 1.536 ms, tek FILTER sorgusu 457 ms (7 koşumun ortancası). Uç 5 saniyelik
 * transaction sınırının hemen altında çalışıyordu ve soğuk başlangıçta
 * düşüyordu.
 *
 * ANLAM AYNI: dört sayı da TÜM ZAMANLARIN sayısı, eskisi gibi.
 * `olcum-senkron.spec.ts` dört eski sorguyla bunun aynı sayıları verdiğini
 * gerçek şemada kanıtlıyor.
 *
 * ÖLÇÜM ARACI DA BU FONKSİYONU KULLANIYOR (`prisma/olcum-senkron-sorgular.ts`):
 * ölçülen SQL ile çalışan SQL ayrı yazılsaydı bir gün ayrışır ve ölçüm başka
 * bir sorgunun süresini gösterirdi.
 *
 * İş türü listesi `Prisma.raw` ile gömülüyor: değerler bu dosyadaki sabit,
 * kullanıcı girdisi değil. Parametre yapılsaydı ölçüm aracı aynı metni
 * parametresiz koşturamazdı.
 */
export function isSayaclariSorgusu(): Prisma.Sql {
  const turler = Prisma.raw(METRIK_ISLERI.map((t) => `'${t}'`).join(', '));
  return Prisma.sql`
    SELECT COUNT(*)::int AS toplam,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS dusen,
           COUNT(*) FILTER (WHERE status = 'succeeded' AND rows_upserted = 0
                              AND job_type IN (${turler}))::int AS bos,
           COUNT(*) FILTER (WHERE status IN ('running', 'queued', 'throttled'))::int AS kosan
      FROM sync_jobs
  `;
}

export interface IsSayaclari {
  toplam: number;
  dusen: number;
  bos: number;
  kosan: number;
}
