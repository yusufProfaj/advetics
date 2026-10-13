import { z } from 'zod';
import { sayiTasiyor } from '../../sayi-yasagi';

/**
 * ═══ ADVSTRATEGY v2 — KAYNAK ETİKETİ ═══
 * (docs/advstrategy/YENIDEN-TASARIM.md § 2.1 + "Kullanıcı kararları 2026-10-13")
 *
 * Stratejideki HER sayı ve HER cümle nereden geldiğini taşır; ekran ve PDF
 * etiketi buradan yazar. Kaynak beyanı istemciden gelmez: sunucu basar
 * (rehberdeki `kim`/`zaman` kuralının aynısı).
 *
 * `varsayim` YOK (kullanıcı kararı 3, 2026-10-13): geçmiş verisi olmayan
 * hesapta beklenen sonuç HİÇ gösterilmez, ajansın elle girdiği bir aralık da
 * gösterilmez. Taslakta "Varsayım" rozetli bir örnek vardı; kaldırıldı.
 * Enum'a geri eklemek o kararı geri almak demek (testte kilitli).
 */
export const STRATEJI_KAYNAKLARI = ['veri', 'marka', 'kural', 'ai', 'ajans'] as const;
export type StratejiKaynagi = (typeof STRATEJI_KAYNAKLARI)[number];

export const STRATEJI_KAYNAK_ETIKETI: Record<StratejiKaynagi, string> = {
  veri: 'Hesabınızın verisi',
  marka: 'Marka Merkezi',
  kural: 'Advetics kuralı',
  ai: 'Yapay zekâ önerisi',
  ajans: 'Ajans yazdı',
};

/**
 * Müşteriye giden belgeye girebilen METİN kaynakları. `ai` yalnız öneri:
 * ajans "Kullan" deyince kaynak `ajans` olur (kim + zaman basılır). Onaylanmamış
 * bir yapay zekâ cümlesini müşteriye "strateji" diye göstermek, kimsenin
 * okumadığı bir vaadi imzalatmak olurdu.
 */
export const BELGEYE_GIREN_METIN_KAYNAKLARI: readonly StratejiKaynagi[] = ['marka', 'kural', 'ajans'];

/** Kaynaklı metin alanı (`{ metin, kaynak, kim, zaman }`). */
export const kaynakliMetinSchema = z.object({
  metin: z.string().trim().min(1).max(2000),
  kaynak: z.enum(STRATEJI_KAYNAKLARI),
  kim: z.string().uuid().nullable(),
  zaman: z.string().datetime({ offset: true }),
});
export type KaynakliMetin = z.infer<typeof kaynakliMetinSchema>;

export function belgeyeGirerMi(m: Pick<KaynakliMetin, 'kaynak'> | null | undefined): boolean {
  return !!m && BELGEYE_GIREN_METIN_KAYNAKLARI.includes(m.kaynak);
}

/**
 * Yapay zekâ metninin SAYI YASAĞI denetimi (`sayi-yasagi.ts`, kreatif zekâ
 * brief'iyle aynı fonksiyon). Strateji metni rakam/oran TAŞIYAMAZ: sayılar
 * motordan, şablonla girer. İhlalde metin REDDEDİLİR (düzeltilmez): bir
 * rakamı silip cümleyi bırakmak, cümlenin anlamını sessizce değiştirir.
 * Reklam METNİ bu kurala tabi değil ("2+1 daire" meşru) ve bu modülden
 * değil rehberin metin motorundan gelir.
 */
export function stratejiMetniDenetle(metin: string): { tamam: true } | { tamam: false; neden: 'sayi_var' | 'bos' } {
  if (metin.trim().length === 0) return { tamam: false, neden: 'bos' };
  return sayiTasiyor(metin) ? { tamam: false, neden: 'sayi_var' } : { tamam: true };
}
