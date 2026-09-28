import type { Prisma } from '@prisma/client';

/**
 * ═══ HESABIN BAĞLANTISI RLS ALTINDA AYRI OKUNUR — GÖRÜNMEYEN "YOK" DEĞİL ═══
 *
 * `adAccount.findMany({ select: { connection: { select: … } } })` ZORUNLU
 * bir ilişki çekiyor ve Prisma onu ikinci bir sorguyla getiriyor. RLS o
 * sorguda bağlantı satırını gizlerse Prisma `null`u kabul etmiyor ve bütün
 * isteği "Inconsistent query result: Field connection is required" ile
 * düşürüyor.
 *
 * Bu canlıda oldu (2026-09-28): "Tüm şirketler" modunda ATANMIŞ hesap bütün
 * kardeş şirketlere açılıyor (`org_kapsaminda`), ama HAVUZ bağlantısı yalnızca
 * kendi şirketinde ve ajansta görünüyor (`havuz_kapsaminda`). Biltaş kendi
 * Google'ını bağlayıp hesabını atayınca o hesabın satırı görünür, bağlantısı
 * görünmez oldu ve `/alerts` ile `/sync/status` ajansın bütün panelinde 500
 * döndü: her sayfada "Uyarılar alınamadı" bandı, Senkronizasyon ekranı hiç
 * açılmıyor. Tek bir hesap, iki ekranı tamamen kapatıyordu.
 *
 * Doğrusu bağlantıyı AYRI okumak ve görünmeyeni yokluk değil BİLİNMEZLİK
 * saymak. Politikayı gevşetmek çözüm değil: müşterinin kendi bağlantısının
 * başka şirketlere açılmaması 2026-09-23'ün bilinçli kararı ("havuzun iki
 * sahibi").
 */
/*
 * ALAN LİSTESİ SABİT ve tip ONDAN türüyor (CLAUDE.md: `satisfies` +
 * `GetPayload`). Şifreli token kolonları (`access_token_enc`,
 * `refresh_token_enc`) BİLEREK yok: bu yardımcı her panel isteğinde koşuyor
 * ve şifreli token'ı belleğe almanın burada hiçbir karşılığı yok.
 */
export const GORUNEN_BAGLANTI_SECIMI = {
  id: true,
  platform: true,
  status: true,
  // YETKİNİN bitişi, erişim token'ınınki değil (`yetki-bitisi.ts`). Google
  // bağlantısı bu alan yüzünden her saat "doluyor" diye uyarılıyordu.
  authorizationExpiresAt: true,
  accountLabel: true,
  updatedAt: true,
} satisfies Prisma.PlatformConnectionSelect;

export type GorunenBaglanti = Prisma.PlatformConnectionGetPayload<{
  select: typeof GORUNEN_BAGLANTI_SECIMI;
}>;

export async function gorunenBaglantilar(
  tx: Prisma.TransactionClient,
  idler: readonly string[],
): Promise<Map<string, GorunenBaglanti>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  const satirlar = await tx.platformConnection.findMany({
    where: { id: { in: tekil } },
    select: GORUNEN_BAGLANTI_SECIMI,
  });
  return new Map(satirlar.map((s) => [s.id, s]));
}
