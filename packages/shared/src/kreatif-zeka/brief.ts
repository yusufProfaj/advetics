import { z } from 'zod';
import { sayiTasiyor } from '../sayi-yasagi';
import type { EtiketAlani } from './etiket';
import type { EtiketFarki, KreatifMetrigi } from './istatistik';

/**
 * ═══ ÜRETİM BRIEF'İ — METİN GEMINI'DEN, SAYI SORGUDAN ═══
 *
 * Brief kullanıcının "bir sonraki görseli nasıl yaptırayım" sorusunun
 * cevabı. Tasarımcıya ya da AdvCampaign'e gidiyor.
 *
 * SAYI UYDURMA YASAĞI YAPISAL: Gemini'ye yalnız ANLAMLI farkların kodu ve
 * yönü gidiyor (sayı GİTMİYOR) ve cevabındaki her metin alanında rakam
 * YASAK (`briefMetniDenetle`). Sayılar ekranda ve brief metninde
 * `farkCumlesi`nin şablonundan geliyor. Paket A ve B'nin kuralıyla aynı:
 * model sayı uydurmasın — "talimatla" değil, rakam taşıyan cevabı
 * reddederek. Talimat bir gün atlanır; ret atlanmaz.
 *
 * YALNIZ ANLAMLI FARKLAR. `belirsiz` ve `yetersiz` brief'e girmez: "renk
 * fark etmiyor" diye bir tavsiye, "henüz bilmiyoruz"u tavsiyeye çevirir.
 * Hiç anlamlı fark yoksa brief ÜRETİLMEZ ve ekran nedenini söyler
 * (`BRIEF_BOS_NEDENI`); Gemini'ye boş bir istek gitmez, para harcanmaz.
 */

/** Brief'e giren bir bulgu (sorgu + istatistikten, Gemini'den DEĞİL). */
export interface BriefBulgusu {
  alan: EtiketAlani;
  /** Daha iyi giden değer. */
  deger: string;
  /** Karşılaştırılan değer(ler)in kodu. */
  karsi: string;
  metrik: KreatifMetrigi;
  fark: EtiketFarki;
  /** `farkCumlesi` çıktısı: ekranda ve brief'te sayı taşıyan tek cümle. */
  cumle: string;
}

export const BRIEF_EN_FAZLA_BULGU = 5;

export const BRIEF_BOS_NEDENLERI = ['etiket_yok', 'kume_kucuk', 'anlamli_fark_yok', 'gunluk_sinir'] as const;
export type BriefBosNedeni = (typeof BRIEF_BOS_NEDENLERI)[number];

/** Gemini'nin dolduracağı JSON. Hepsi metin, hepsi kısa. */
export const briefCevabiSchema = z
  .object({
    /** Tek cümlelik yön: "Ürünü elinde tutan bir kişiyle, az yazıyla". */
    yon: z.string().min(3).max(200),
    /** Bulgu başına bir üretim talimatı; sıra bulgu sırası. */
    talimatlar: z.array(z.object({ alan: z.string(), talimat: z.string().min(3).max(220) }).strict()).min(1).max(BRIEF_EN_FAZLA_BULGU),
    /** Kaçınılacaklar (en çok üç). */
    kacin: z.array(z.string().min(3).max(160)).max(3),
  })
  .strict();
export type BriefCevabi = z.infer<typeof briefCevabiSchema>;

/**
 * Gemini cevabının denetimi. Rakam içeren bir metin alanı → RET (bir kez
 * yeniden denenir, ikincisinde brief "üretilemedi" der). `talimatlar`
 * bulgu alanlarıyla birebir eşleşmeli: modelin bulgu UYDURMASI da ret.
 */
/*
 * SAYI YASAĞI tek yerde: `../sayi-yasagi.ts`. Haftalık özet yorumu da aynı
 * fonksiyonu çağırıyor; iki kopya ayrışmıştı (Ajan 4, Paket B Ö-1).
 */
export function briefMetniDenetle(
  c: BriefCevabi,
  bulgular: readonly Pick<BriefBulgusu, 'alan'>[],
): { ok: true } | { ok: false; sebep: string } {
  const metinler = [c.yon, ...c.talimatlar.map((t) => t.talimat), ...c.kacin];
  if (metinler.some(sayiTasiyor)) return { ok: false, sebep: 'yapay zekâ metninde rakam var' };
  const beklenen = bulgular.map((b) => b.alan).join(',');
  const gelen = c.talimatlar.map((t) => t.alan).join(',');
  if (beklenen !== gelen) return { ok: false, sebep: `talimatlar bulgularla eşleşmiyor (${gelen} ≠ ${beklenen})` };
  return { ok: true };
}

export interface KreatifBrief {
  id: string;
  kumeAnahtari: string;
  /** Bulguların SHA-256'sı: aynı girdi tekrar Gemini'ye gitmez. */
  girdiOzeti: string;
  bulgular: BriefBulgusu[];
  cevap: BriefCevabi;
  model: string;
  uretildi: string;
}

/**
 * AdvCampaign'e aktarım metni (`adv_oturum.hazir_istem`, ≤ 4.000 karakter;
 * AdvStrategy ve İyileştir asistanı da aynı yolu kullanıyor). Sayı taşıyan
 * cümleler şablondan, yön ve talimatlar Gemini'den. Uzunsa SONDAN
 * kesilir ve kesildiği söylenir.
 */
export const HAZIR_ISTEM_SINIRI = 4000;

export function briefIstemi(b: Pick<KreatifBrief, 'bulgular' | 'cevap'>, kumeAdi: string): string {
  const satirlar = [
    `Kreatif brief'i (${kumeAdi}). Yeni görseli şu bulgulara göre hazırla:`,
    ...b.bulgular.map((x) => `- ${x.cumle}`),
    `Yön: ${b.cevap.yon}`,
    ...b.cevap.talimatlar.map((t) => `- ${t.talimat}`),
    ...(b.cevap.kacin.length ? [`Kaçın: ${b.cevap.kacin.join('; ')}`] : []),
  ];
  const metin = satirlar.join('\n');
  if (metin.length <= HAZIR_ISTEM_SINIRI) return metin;
  const ek = '\n(brief kısaltıldı)';
  return metin.slice(0, HAZIR_ISTEM_SINIRI - ek.length) + ek;
}
