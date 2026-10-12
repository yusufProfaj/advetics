import { Prisma } from '@prisma/client';

/**
 * ═══ ARAMA KAMPANYASI: DÖNÜŞÜM SAYILMIYOR (yönetici kararı Ö-4, 2026-10-13) ═══
 *
 * Meta arama reklamı (ad set `optimization_goal = QUALITY_CALL`,
 * `destination_type = PHONE_CALL`) sonucunu `conversions` kolonuna YAZMIYOR:
 * aramalar rapor kovasında (`calls`), sorgu anında okunuyor. Bu kampanyanın
 * `conversions` değeri her gün 0 ve o 0 bir ÖLÇÜM DEĞİL. Kural motoru,
 * sinyaller ve İyileştir onu ölçüm sansaydı "dönüşüm 0 → durdur" çalışan
 * bir arama reklamını DURDURURDU, "dönüşüm kesildi" her sabah yanlış alarm
 * verirdi.
 *
 * TEK YARDIMCI: üç tüketici aynı yüklemi okuyor; ikinci bir kopya doğduğu
 * anda biri yeni bir alanı unutur.
 *
 * KAYNAK YAPI SENKRONU: `ad_groups.optimization_goal` kolonu (Meta yapı
 * taraması yazıyor) ve varsa `raw.destination_type`. Yapı taraması bugün
 * `destination_type` alanını İSTEMİYOR (meta.provider.ts alan listesi):
 * tek geçersiz alan bütün taramayı düşürebildiği için ölçülmeden eklenmedi;
 * hedef `QUALITY_CALL` arama reklamını tek başına tanımlıyor.
 */
export const ARAMA_OPTIMIZASYON_HEDEFI = 'QUALITY_CALL';
export const ARAMA_HEDEF_TURU = 'PHONE_CALL';

/** Saf yüklem (bellekteki reklam seti satırı için). */
export function aramaSetiMi(set: { optimizationGoal: string | null | undefined; raw?: unknown }): boolean {
  if (set.optimizationGoal === ARAMA_OPTIMIZASYON_HEDEFI) return true;
  const raw = set.raw as { destination_type?: unknown } | null | undefined;
  return raw?.destination_type === ARAMA_HEDEF_TURU;
}

/** Reklam seti satırı (alias) için SQL yüklemi; sabitler ADLA, değerleri bağlı parametre. */
function setKosulu(g: string): Prisma.Sql {
  return Prisma.sql`(${Prisma.raw(g)}.optimization_goal = ${ARAMA_OPTIMIZASYON_HEDEFI} OR ${Prisma.raw(g)}.raw ->> 'destination_type' = ${ARAMA_HEDEF_TURU})`;
}

/**
 * Varlığın (kampanya / reklam seti / reklam) arama kampanyasına ait olup
 * olmadığını veren SQL boolean ifadesi. Kampanya: setlerinden BİRİ arama
 * ise (Meta'da bir kampanyanın setleri aynı amaçla kuruluyor). Reklam:
 * kendi seti. `alias` varlık tablosunun takma adı.
 */
export function aramaVarligiSql(seviye: 'campaign' | 'ad_group' | 'ad', alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error(`Geçersiz takma ad: ${alias}`);
  switch (seviye) {
    case 'ad_group':
      return setKosulu(alias);
    case 'campaign':
      return Prisma.sql`EXISTS (SELECT 1 FROM ad_groups ag_arama WHERE ag_arama.campaign_id = ${Prisma.raw(alias)}.id AND ${setKosulu('ag_arama')})`;
    case 'ad':
      return Prisma.sql`EXISTS (SELECT 1 FROM ad_groups ag_arama WHERE ag_arama.id = ${Prisma.raw(alias)}.ad_group_id AND ${setKosulu('ag_arama')})`;
  }
}

/** Kullanıcıya ve kural geçmişine yazılan cümle (tek yer). */
export const ARAMA_DONUSUM_CUMLESI = 'Değerlendirilemedi: arama kampanyasında dönüşüm sayılmıyor';
