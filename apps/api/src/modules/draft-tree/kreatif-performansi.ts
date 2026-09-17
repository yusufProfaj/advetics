/**
 * ═══ HANGİ KREATİF İŞE YARADI ═══
 *
 * Bu ürünün hedef kullanıcısı reklamcılık bilmiyor ve en sık takıldığı soru
 * "ne yazayım, hangi görseli koyayım". Cevabı zaten elimizde: aynı müşterinin
 * geçmişte YAYINLANMIŞ reklamları ve onların gerçek performansı.
 *
 * SIRALAMA SAF FONKSİYONDA çünkü asıl karar burada ve yanlış olduğunda
 * sessiz: kötü bir eşik, üç gösterim almış bir reklamı "en iyi kreatif" diye
 * öne çıkarır ve kullanıcı ona benzeyen bir reklam kurar.
 */

/**
 * SIRALAMAYA GİRMEK İÇİN EN AZ GÖSTERİM.
 *
 * 3 gösterim alıp 1 tıklama alan bir reklamın CTR'si %33 — listenin en
 * başına oturur ve orada durduğu için "en iyi" sanılır. Oysa o sayı bir
 * performans değil, GÜRÜLTÜ.
 *
 * 1.000 keyfi değil, ölçülebilir bir eşik: bu hacimde %1'lik bir CTR farkı
 * on tıklamaya karşılık geliyor ve tek bir tıklamayla oynamıyor. Altında
 * kalan kreatifler ELENMİYOR, AYRI SAYILIYOR — sessiz kesme yok.
 */
export const YETERLI_GOSTERIM = 1000;

export interface KreatifOlcumu {
  creativeId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spendMicros: bigint;
}

export interface KreatifSirasi<T extends KreatifOlcumu> {
  /** Yeterli veriye sahip ve CTR'ye göre sıralanmış kreatifler. */
  siralanan: Array<T & { ctr: number }>;
  /** Eşiğin altında kaldığı için sıralanmayan kreatif sayısı. */
  yetersiz: number;
}

/**
 * CTR'ye göre sıralar — YETERLİ ÖRNEK ŞARTIYLA.
 *
 * DÖNÜŞÜM SIRALAMAYA GİRMİYOR ve bu bilinçli: her müşteride dönüşüm takibi
 * kurulu değil ve kurulu olmayan hesapta dönüşüm her zaman sıfır. Sıfıra
 * göre sıralamak, takibi olmayan müşterinin listesini rastgele yapardı.
 * Dönüşüm sayısı yine de taşınıyor ve ekranda gösteriliyor — karar
 * kullanıcının.
 */
export function siralaKreatifler<T extends KreatifOlcumu>(
  olcumler: readonly T[],
  enFazla = 6,
): KreatifSirasi<T> {
  const yeterli = olcumler.filter((o) => o.impressions >= YETERLI_GOSTERIM);

  const siralanan = yeterli
    .map((o) => ({ ...o, ctr: o.impressions === 0 ? 0 : (o.clicks / o.impressions) * 100 }))
    /*
     * EŞİTLİKTE HARCAMASI BÜYÜK OLAN ÖNCE. Aynı CTR'de daha çok para
     * harcamış kreatif daha çok sınanmış demek; ikisi arasında seçim
     * yaparken sınanmış olan daha güvenilir.
     */
    .sort((a, b) => (b.ctr - a.ctr) || Number(b.spendMicros - a.spendMicros))
    .slice(0, enFazla);

  return { siralanan, yetersiz: olcumler.length - yeterli.length };
}
