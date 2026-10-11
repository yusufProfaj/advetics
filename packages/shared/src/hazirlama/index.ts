import { z } from 'zod';
import { SPECIAL_AD_CATEGORIES, SPECIAL_AD_CATEGORY_META, type SpecialAdCategory } from '../schemas/special-category.schema';
import { kitleKonumuSchema } from '../schemas/kitle-sablonu.schema';

/**
 * ═══ HAZIR WORKSPACE — SÖZLEŞME (HAZIR-WORKSPACE-PLANI.md § Dalga 3) ═══
 *
 * Kullanıcı (2026-10-12): "reklam hesabı kurulumunu çok kolay hale getirmemiz
 * gerekiyor, kullanıcı neredeyse hiç uğraşmamalı, marka merkezini doldurmayla
 * falan". Hesap atanınca sistem siteyi, pikseli, marka bilgilerini ve
 * varsayılanları KENDİSİ hazırlar; kullanıcıya yalnız tahmin edilemeyeni
 * (iki aday, bir beyan) TEK soru olarak sorar.
 */

export const HAZIRLAMA_ADIM_KODLARI = ['site', 'marka', 'olcum', 'piksel', 'kategori', 'konum', 'butce'] as const;
export type HazirlamaAdimKodu = (typeof HAZIRLAMA_ADIM_KODLARI)[number];

export const HAZIRLAMA_ADIM_DURUMLARI = ['tamam', 'soru', 'eksik', 'hata', 'atlandi'] as const;
export type HazirlamaAdimDurumu = (typeof HAZIRLAMA_ADIM_DURUMLARI)[number];

/** Tablonun CHECK listesiyle aynı (`hazirlama.spec.ts`). */
export const HAZIRLAMA_DURUMLARI = ['bekliyor', 'calisiyor', 'hazir', 'soru', 'eksik'] as const;
export type HazirlamaDurumu = (typeof HAZIRLAMA_DURUMLARI)[number];

export interface HazirlamaAdimi {
  kod: HazirlamaAdimKodu;
  durum: HazirlamaAdimDurumu;
  /** Kısa sonuç ("egebirlikseasight.com", "Egebirlik Seasight"). */
  baslik: string;
  /** NEDEN — her durumda dolu; hata ise platformun mesajı. */
  neden: string;
}

export type HazirlamaSorusu =
  | { kod: 'piksel'; soru: string; secenekler: Array<{ deger: string; etiket: string }> }
  | { kod: 'kategori'; soru: string }
  | { kod: 'konum'; soru: string };

export interface HazirlamaYaniti {
  clientId: string;
  durum: HazirlamaDurumu;
  adimlar: HazirlamaAdimi[];
  sorular: HazirlamaSorusu[];
  varsayilanlar: {
    pikselId: string | null;
    /** micros dizge (JSON sayısı 2^53 üstünde yuvarlanır). */
    gunlukButceMicros: string | null;
    /** Bütçenin birimi; rehber yalnız hesabın birimiyle AYNIYSA önden doldurur. */
    gunlukButceParaBirimi: string | null;
    kategoriCevaplandi: boolean;
  };
  sonCalisma: string | null;
}

export const hazirlamaCevapSchema = z.discriminatedUnion('kod', [
  z.object({ kod: z.literal('piksel'), pikselId: z.string().regex(/^\d{1,30}$/) }),
  /** Boş dizi = "hiçbiri" (beyan); sorulmadı ile ayrı (`kategori_cevaplandi`). */
  z.object({ kod: z.literal('kategori'), kategoriler: z.array(z.enum(SPECIAL_AD_CATEGORIES)).max(SPECIAL_AD_CATEGORIES.length) }),
  z.object({ kod: z.literal('konum'), konumlar: z.array(kitleKonumuSchema).min(1).max(25) }),
  z.object({ kod: z.literal('butce'), gunlukButceMicros: z.string().regex(/^\d{1,18}$/) }),
]);
export type HazirlamaCevabi = z.infer<typeof hazirlamaCevapSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Saf kararlar
// ─────────────────────────────────────────────────────────────────────────────

export interface PikselAday {
  id: string;
  ad: string;
  sonCalisma: string | null;
  kullanilamaz: boolean;
}

/**
 * PİKSEL SEÇİMİ — tahmin yok. Sırayla:
 * 1. Sitede görülen piksel hesapta da varsa ve TEK ise o (en güçlü kanıt:
 *    sitede çalışan kod bu piksel).
 * 2. Değilse hesapta çalışan TEK piksel varsa o.
 * 3. Birden çok aday → soru; hiç yok → eksik (nedeniyle).
 */
export function pikselSec(
  hesap: readonly PikselAday[],
  sitedeGorulen: readonly string[],
): { tur: 'secildi'; id: string; neden: string } | { tur: 'soru'; adaylar: PikselAday[] } | { tur: 'yok'; neden: string } {
  const kullanilir = hesap.filter((p) => !p.kullanilamaz);
  const eslesen = kullanilir.filter((p) => sitedeGorulen.includes(p.id));
  if (eslesen.length === 1) return { tur: 'secildi', id: eslesen[0]!.id, neden: 'Sitede çalışan pikselle reklam hesabının pikseli aynı' };
  if (eslesen.length > 1) return { tur: 'soru', adaylar: eslesen };
  const calisan = kullanilir.filter((p) => p.sonCalisma);
  if (calisan.length === 1) return { tur: 'secildi', id: calisan[0]!.id, neden: 'Reklam hesabında çalışan tek piksel' };
  if (calisan.length > 1) return { tur: 'soru', adaylar: calisan };
  if (kullanilir.length === 0) return { tur: 'yok', neden: 'Reklam hesabında piksel yok; satış ve site ölçümü için Meta\'da piksel kurulmalı' };
  return { tur: 'yok', neden: 'Hesaptaki piksel hiç çalışmamış; pikselin sitede kurulu olduğu görülmedi' };
}

/** TRY için varsayılan günlük bütçe: 500 ₺. Diğer para birimlerinde 20 birim. */
export const VARSAYILAN_GUNLUK_TRY_MICROS = 500_000_000n;
export const VARSAYILAN_GUNLUK_DIGER_MICROS = 20_000_000n;

/**
 * BÜTÇE ÖNERİSİ: iki platform açıkken bile her birinin payı asgarinin
 * üstünde kalsın diye tabanın İKİ katı ile asgarinin İKİ katının büyüğü.
 * Bilinmeyen asgari (null) tabanı değiştirmez.
 */
export function varsayilanGunlukButce(paraBirimi: string, asgariler: ReadonlyArray<bigint | null>): bigint {
  const taban = paraBirimi.toUpperCase() === 'TRY' ? VARSAYILAN_GUNLUK_TRY_MICROS : VARSAYILAN_GUNLUK_DIGER_MICROS;
  return asgariler.reduce<bigint>((m, a) => (a !== null && a * 2n > m ? a * 2n : m), taban);
}

/** Satırın genel durumu adımlarından: soru > eksik/hata > hazır. */
export function hazirlamaDurumu(adimlar: readonly HazirlamaAdimi[], sorular: readonly HazirlamaSorusu[]): HazirlamaDurumu {
  if (sorular.length > 0) return 'soru';
  if (adimlar.some((a) => a.durum === 'eksik' || a.durum === 'hata')) return 'eksik';
  return 'hazir';
}

/**
 * Adım başlıkları kullanıcıya görünüyor: kategori Meta'nın KODUYLA ("HOUSING")
 * değil Türkçe adıyla, bütçe para birimiyle yazılır. İki başlık iki yerde
 * (ilk çalışma ve cevap) üretiliyor; ayrı yazılınca biri birimi düşürüyordu.
 */
export function kategoriBasligi(kategoriler: readonly string[]): string {
  if (kategoriler.length === 0) return 'Özel kategori yok';
  return kategoriler.map((k) => SPECIAL_AD_CATEGORY_META[k as SpecialAdCategory]?.label ?? k).join(', ');
}

export function gunlukButceBasligi(micros: bigint, paraBirimi: string): string {
  const tutar = (Number(micros) / 1_000_000).toLocaleString('tr-TR');
  return `Günlük ${tutar} ${paraBirimi.toUpperCase() === 'TRY' ? '₺' : paraBirimi.toUpperCase()}`;
}
