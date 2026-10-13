import { ASSET_KINDS, type AssetKind } from '@advetics/shared';

/**
 * VARLIKLAR › GÖRSELLER'İN TÜRLERİ — LOGO HARİÇ (docs/panel-sadelestirme/
 * MIMARI.md Ç-11). Logonun evi Marka Merkezi › Marka › Logo.
 *
 * AYRI DOSYADA, `'use client'` TAŞIMIYOR: hem sunucu sayfası (adresteki
 * `tur` süzgeci) hem istemci arşivi okuyor. İstemci modülünden dışa
 * aktarılan bir dizi sunucuda dizinin kendisi değil bir istemci referansı
 * olur ve `includes` sessizce hep yanlış döner.
 */
export const GORSEL_TURLERI = ASSET_KINDS.filter((k): k is Exclude<AssetKind, 'logo'> => k !== 'logo');
export type GorselTuru = (typeof GORSEL_TURLERI)[number];

/** Adresteki `tur` → görsel türü; logo ve tanınmayan değer `null` (Tümü). */
export function gorselTuru(ham: string | null | undefined): GorselTuru | null {
  return GORSEL_TURLERI.find((k) => k === ham) ?? null;
}
