import { z } from 'zod';
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
 * SAYI YAZIYLA DA GELEBİLİR (Ajan 4, Ö-2). Model "RAKAM YAZMA" talimatına
 * harfiyen uyup "yüzde otuz" ya da tam genişlikli "３０％" yazabiliyordu ve
 * ret yalnız ASCII `\d`'ye bakıyordu: uydurma oran brief'e ve AdvCampaign'e
 * giderdi. Üç kural:
 *  1. Her yazı sistemindeki rakam (`\p{Nd}`, u bayrağı) ve yüzde işareti.
 *  2. "yüzde" kelimesi: arkasından ne gelirse gelsin bir oran.
 *  3. Sayı kelimesi + ÇARPAN/ORAN bağlamı ("iki kat", "on kat daha",
 *     "otuz beş oranında", "dörtte bir").
 * DAR TUTULDU: "bir kişi", "birlikte", "ikinci el", "on plan" brief'in
 * olağan dili; sayı kelimesini tek başına yasaklamak her brief'i
 * reddederdi. Kelime sınırı harf sınıfıyla (`\b` Türkçe harfte çalışmıyor).
 */
const SAYI_KELIMESI = '(?:sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|yarım|çeyrek)';
const HARF_DISI_ONCE = '(?<!\\p{L})';
const HARF_DISI_SONRA = '(?!\\p{L})';
const SAYI_KALIPLARI: RegExp[] = [
  /[\p{Nd}%％]/u,
  new RegExp(`${HARF_DISI_ONCE}yüzde${HARF_DISI_SONRA}`, 'iu'),
  new RegExp(
    `${HARF_DISI_ONCE}${SAYI_KELIMESI}(?:\\s+${SAYI_KELIMESI})*\\s+(?:kat|katı|katına|katında|oranında|puan|puanlık)${HARF_DISI_SONRA}`,
    'iu',
  ),
  new RegExp(`${HARF_DISI_ONCE}${SAYI_KELIMESI}[’']?(?:te|ta|de|da)\\s+(?:bir|biri)${HARF_DISI_SONRA}`, 'iu'),
];

/** Metin bir sayı/oran taşıyor mu (rakam, yüzde ya da yazıyla çarpan). */
export function sayiTasiyor(metin: string): boolean {
  return SAYI_KALIPLARI.some((r) => r.test(metin));
}

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
