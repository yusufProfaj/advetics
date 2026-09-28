import type { SyncJobType } from '@prisma/client';

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
