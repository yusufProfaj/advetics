import { z } from 'zod';
import { huniKatmaniSchema, stratejiPlatformuSchema, surumSchema, tutarGirdisiSchema, type HuniKatmani, type StratejiPlatformu } from './plan';

/**
 * ═══ BİLEŞEN 1 — BÜTÇE VE PLATFORM DAĞILIMI ═══
 *
 * KAYNAK HER SATIRDA YAZILI. Brief "sektörel benchmark" diyor; depoda öyle
 * bir veri YOK (Ç-4). Öneri yalnız workspace'in KENDİ geçmişinden üretilir
 * ve ekranda "son 90 günde dönüşümlerin %68'i Meta'dan" gibi, sayının
 * nereden geldiğini söyleyen bir gerekçeyle görünür. Kullanıcının elle
 * değiştirdiği satır `elle` olur; öneri yeniden istenirse elle satırların
 * üstüne YAZILMAZ (kullanıcının kararı sessizce silinmesin).
 */
export const DAGILIM_KAYNAKLARI = ['gecmis_veri', 'elle'] as const;
export type DagilimKaynagi = (typeof DAGILIM_KAYNAKLARI)[number];

export const dagilimSatiriGirdiSchema = z.object({
  platform: stratejiPlatformuSchema,
  katman: huniKatmaniSchema,
  /** Kullanıcının yazdığı tutar; sunucu plan para birimiyle çözer. */
  tutar: tutarGirdisiSchema,
});

/**
 * 2 platform × 3 katman. Fazlası aynı (platform, katman) çiftinin tekrarı
 * demek; tekrar ayrıca reddediliyor (aynı çiftin iki tutarı hangisi?).
 */
export const DAGILIM_SATIR_SINIRI = 6;

/** Bütün dağılım tek seferde yazılır; satır satır PATCH, toplam denetimini parçalardı. */
export const dagilimKaydetSchema = z
  .object({ surum: surumSchema, satirlar: z.array(dagilimSatiriGirdiSchema).max(DAGILIM_SATIR_SINIRI) })
  .refine(
    (v) => new Set(v.satirlar.map((s) => `${s.platform}:${s.katman}`)).size === v.satirlar.length,
    'Aynı platform ve kitle katmanı iki kez yazılamaz',
  );
export type DagilimKaydetGirdisi = z.infer<typeof dagilimKaydetSchema>;

export interface DagilimSatiri {
  platform: StratejiPlatformu;
  katman: HuniKatmani;
  tutarMicros: string;
  kaynak: DagilimKaynagi;
  /** `gecmis_veri` satırında dolu: önerinin dayandığı cümle. */
  gerekce: string | null;
}

/**
 * ÖNERİ YOKSA NEDENİ SÖYLENİR (`emptyReason` deseni). Dördü de boş öneri
 * olarak görünürdü ama yapılacak iş farklı:
 *   · hesap_yok        → workspace'e Meta/Google hesabı atanmamış
 *   · veri_yok         → hesap var, son 90 günde harcama yok
 *   · donusum_yok      → harcama var ama dönüşüm yok; pay harcamadan
 *                        önerilebilir ama "getiri" iddiası kurulamaz
 *   · karisik_birim    → hesaplar farklı para birimi taşıyor, kur yok
 */
export const DAGILIM_BOS_NEDENLERI = ['hesap_yok', 'veri_yok', 'donusum_yok', 'karisik_birim'] as const;
export type DagilimBosNedeni = (typeof DAGILIM_BOS_NEDENLERI)[number];

export interface DagilimOnerisi {
  /** Önerinin baktığı pencere — ekranda yazılır. */
  pencere: { from: string; to: string };
  /** `null` = öneri üretilemedi; neden `bosNedeni`nde. */
  satirlar: DagilimSatiri[] | null;
  bosNedeni: DagilimBosNedeni | null;
  /** Platform başına geçmiş: önerinin dayanağı, tablo olarak gösterilir. */
  dayanak: Array<{
    platform: StratejiPlatformu;
    harcamaMicros: string;
    donusum: number;
    /** Dönüşüm yoksa `null` (sıfıra bölme değil, "hesaplanamaz"). */
    donusumBasiMaliyetMicros: string | null;
  }>;
}

/**
 * Dağılım toplamı plan toplamını AŞAMAZ. Az olabilir (kalan "dağıtılmamış"
 * olarak ekranda yazılır); aşan plan müşteriye onaylattığı tutardan fazla
 * harcama vaat ederdi.
 */
export function dagilimToplamDenetimi(
  satirlarMicros: readonly bigint[],
  toplamMicros: bigint,
): { tamam: true; kalanMicros: bigint } | { tamam: false; asimMicros: bigint } {
  const toplam = satirlarMicros.reduce((a, b) => a + b, 0n);
  return toplam <= toplamMicros
    ? { tamam: true, kalanMicros: toplamMicros - toplam }
    : { tamam: false, asimMicros: toplam - toplamMicros };
}

