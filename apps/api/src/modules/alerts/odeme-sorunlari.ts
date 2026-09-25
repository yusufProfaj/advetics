import type { Prisma } from '@prisma/client';
import type { Platform, Uyari } from '@advetics/shared';
import { hesapUyarilari, type UyariHesabi } from './uyari-kurallari';

/**
 * ═══ ÖDEME SORUNU KARARI — TEK YERDE ═══
 *
 * Aynı soru üç yerde soruluyor: panelin uyarı bandı, günde iki kez giden
 * özet mail ve sorun görüldüğü an giden anlık mail. Üçü de `hesapUyarilari`
 * kuralını okuyor ve hesap satırını o kurala çeviren kod BURADA.
 *
 * Anlık mail için ikinci bir "ödeme sorunu mu" kararı yazmak, özetin ve
 * anlık mailin ayrışması demekti: biri "3 hesap" derken diğeri "2 hesap"
 * derdi ve fark yalnızca iki maili yan yana koyan birinin gözüne çarpardı.
 */
export const ODEME_HESAP_SECIMI = {
  id: true,
  name: true,
  platform: true,
  status: true,
  syncEnabled: true,
  lastInsightsSyncAt: true,
  lastStructureSyncAt: true,
  updatedAt: true,
  raw: true,
  clientId: true,
  paymentAlertedAt: true,
  client: { select: { name: true, status: true } },
  connection: { select: { status: true, tokenExpiresAt: true } },
} satisfies Prisma.AdAccountSelect;

export type OdemeHesapSatiri = Prisma.AdAccountGetPayload<{ select: typeof ODEME_HESAP_SECIMI }>;

/**
 * Hesabın ödeme uyarısı — yoksa `null`.
 *
 * ATANMAMIŞ ve ARŞİVLİ WORKSPACE'İN hesabı dışarıda. Ajansın havuzunda
 * yüzlerce hesap var ve çoğuyla çalışılmıyor; onların ödeme durumu ajansın
 * işi değil. Arşivlenmiş workspace'le de çalışılmıyor.
 */
export function odemeUyarisi(h: OdemeHesapSatiri, simdi: Date): Uyari | null {
  if (h.clientId === null || h.client?.status !== 'active') return null;

  const satir: UyariHesabi = {
    id: h.id,
    name: h.name,
    platform: h.platform as Platform,
    status: h.status,
    syncEnabled: h.syncEnabled,
    lastInsightsSyncAt: h.lastInsightsSyncAt,
    lastStructureSyncAt: h.lastStructureSyncAt,
    updatedAt: h.updatedAt,
    raw: h.raw,
    clientId: h.clientId,
    clientName: h.client?.name ?? null,
    connectionStatus: h.connection.status,
    connectionTokenExpiresAt: h.connection.tokenExpiresAt,
  };
  return hesapUyarilari(satir, simdi).find((u) => u.kod === 'hesap_odeme_sorunu') ?? null;
}
