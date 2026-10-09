import type { BudgetPacing } from '@advetics/shared';
import { formatDayShort, formatMoney } from '@/lib/format';

/**
 * ═══ AYIN TEMPOSU — BÜTÇE KARTININ CÜMLELERİ ═══
 *
 * `ButceKarti` harcama/bütçe ve çubuk gösteriyordu; çubuk "hızlı mıyız"
 * sorusunu cevaplıyor ama "ay sonunda nereye varırız" ve "kalan günlerde ne
 * kadar harcayabilirim" sorularını okuyucunun kafasından hesaplamasını
 * istiyordu. Veri zaten pacing yanıtında duruyordu (`projectedMicros`,
 * `suggestedDailyMicros`); yeni alan yok (MIMARI § 2).
 *
 * SAF FONKSİYON: panelde bileşen render eden test yok. Hangi cümlenin
 * yazılacağı ve uyarı tonu JSX'in içinde kalsaydı yalnızca kaynak taramasıyla
 * sınanabilirdi (CLAUDE.md "effect içindeki karar test edilemiyor").
 */
export interface TempoCumlesi {
  metin: string;
  /** Uyarı tonu: ay sonu tahmini bütçeyi aşıyor. */
  uyari: boolean;
}

/**
 * Sayıdan sonra gelen iyelik eki: "%26’sı", "%31’i", "%10’u", "%100’ü".
 *
 * Ek sayının OKUNUŞUNA uyuyor, yazılışına değil, ve okunuşun son kelimesi
 * sıfır olmayan en küçük basamaktan geliyor (30 = "otuz" → "u", 31 = "otuz
 * bir" → "i"). Sabit "’i" yazmak her üç sayıdan birinde bozuk Türkçe
 * demekti ve bu kart her sabah okunuyor.
 */
const BIRLER = ['ı', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'] as const; // sıfır, bir … dokuz
const ONLAR = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'] as const; // —, on, yirmi … doksan

export function sayiEki(n: number): string {
  const m = Math.abs(Math.trunc(n));
  if (m === 0) return BIRLER[0];
  if (m % 10 !== 0) return BIRLER[m % 10]!;
  if (m % 100 !== 0) return ONLAR[(m % 100) / 10]!;
  if (m % 1000 !== 0) return 'ü'; // yüz
  return 'i'; // bin (milyon yüzdesi bu kartta yok)
}

function yuzde(oran: number): string {
  const n = Math.round(oran * 100);
  return `%${n}’${sayiEki(n)}`;
}

/** Bugünün `YYYY-MM-DD`si — UTC, kartın ay anahtarıyla aynı saat dilimi. */
function bugunUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function dunu(gun: string): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * @param birim Kartın para birimi (`ClientPacing.currency`). `null` =
 *   hesaplarda farklı para birimi var: tutar cümleleri YAZILMIYOR, kart
 *   bunu zaten söylüyor. Karışık birimde tek tutar yazmak yanlış sayı olurdu.
 * @param bugun Testte sabitlenebilsin diye; ekranda bugünün tarihi.
 */
export function tempoCumleleri(
  p: BudgetPacing,
  birim: string | null,
  bugun: string = bugunUtc(),
): TempoCumlesi[] {
  // Bütçe yoksa tempo yok: kart "Tanımla →" diyor, oran uydurulmaz.
  if (!p.budget || p.spentRatio === null) return [];

  /*
   * AYIN İLK GÜNÜ HİÇ TAMAMLANMIŞ GÜN YOK. Bugünün verisi gün bitmeden eksik
   * geldiği için pacing dünde duruyor (`throughDate`); 1'inde "ayın %0’ı
   * geçti" ve boş bir tahmin yazmak yerine nedenini söylüyoruz.
   */
  if (p.daysElapsed === 0) {
    return [{ metin: 'Ay yeni başladı, tempo yarın hesaplanır', uyari: false }];
  }

  /*
   * "DÜN İTİBARIYLA": bugün sayılmıyor ve okuyucu sabah gördüğü düşük oranı
   * "bugün harcama yok" sanmamalı. Tarih dün değilse (ay bitti, saat
   * dilimi kenarı) gerçek tarih yazılıyor; her zaman "dün" demek yalan
   * olabilirdi.
   */
  const itibariyla =
    p.throughDate === dunu(bugun) ? 'Dün itibarıyla' : `${formatDayShort(p.throughDate)} itibarıyla`;
  const cumleler: TempoCumlesi[] = [
    {
      metin: `${itibariyla} ayın ${yuzde(p.elapsedRatio)} geçti, bütçenin ${yuzde(p.spentRatio)} harcandı`,
      uyari: false,
    },
  ];

  if (birim === null) return cumleler;

  if (p.projectedMicros !== null) {
    const tahmin = BigInt(p.projectedMicros);
    const butce = BigInt(p.budget.amountMicros);
    const tutar = formatMoney(p.projectedMicros, birim, { decimals: 0 });
    if (butce > 0n && tahmin > butce) {
      /*
       * YUKARI YUVARLANIYOR: bütçeyi 30 kuruş aşan tahmin "%0 aşar" demesin.
       * Aşım varsa sayı en az 1.
       */
      const asim = ((tahmin - butce) * 100n + butce - 1n) / butce;
      cumleler.push({ metin: `Bu hızla ay sonu: ${tutar} · bütçeyi %${asim} aşar`, uyari: true });
    } else {
      cumleler.push({ metin: `Bu hızla ay sonu: ${tutar}`, uyari: false });
    }
  }

  /*
   * Bütçe dolduysa sunucu öneriyi 0 gönderiyor: "günde 0 ₺ harcanabilir"
   * yazmak yerine cümle düşüyor; kartın durum rozeti "Doldu" diyor ve
   * tahmin satırı aşımı uyarı tonuyla söylüyor.
   */
  if (p.daysRemaining > 0 && p.suggestedDailyMicros !== null && BigInt(p.suggestedDailyMicros) > 0n) {
    cumleler.push({
      metin: `Kalan günlerde günde ${formatMoney(p.suggestedDailyMicros, birim, { decimals: 0 })} harcanabilir`,
      uyari: false,
    });
  }
  return cumleler;
}
