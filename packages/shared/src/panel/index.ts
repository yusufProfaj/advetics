/**
 * ═══ PANEL YAPISI — Ayarlar ve Marka Merkezi sadeleştirme sözleşmesi ═══
 *
 * Mimari: `docs/panel-sadelestirme/MIMARI.md`. Adresler, eski adres
 * eşlemesi, eylem kapıları ve Kurulum'un tek listesi. Panel bunları
 * `apps/web/src/lib/panel-adresleri.ts` üzerinden okur; API (uyarı
 * kuralları, OAuth dönüşü) doğrudan buradan.
 */
export * from './adresler';
export * from './eski-adresler';
export * from './kapilar';
export * from './kurulum-listesi';
