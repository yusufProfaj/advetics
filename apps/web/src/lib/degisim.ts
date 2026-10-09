/**
 * ═══ ÖNCEKİ DÖNEME GÖRE DEĞİŞİM — TEK KARAR ═══
 *
 * Genel Bakış'ın Performans kartı ve Reklam Yöneticisi'nin metrik kutuları
 * aynı soruyu soruyor: bu değişim iyi mi kötü mü? Kararı iki bileşende ayrı
 * yazmak, eski panelde üç kopyayla yaşanan hatanın kapısı: maliyet kuralı
 * (`ters`: dönüşüm başı maliyetin ARTIŞI KÖTÜ) bir kopyada unutulursa maliyet
 * artışı yeşil görünür ve yeşil bir sayı kimseyi durdurmaz.
 *
 * `null` değişim HİÇ basılmıyor: "%0" yazmak "değişmedi" demek, anlamı ise
 * "karşılaştırma yapılamadı".
 *
 * YÖN YALNIZCA RENKTEN OKUNMAMALI: ok yönü söylüyor, `etiket` iyi/kötüyü
 * ekran okuyucuya ve renk ayırt edemeyen kullanıcıya söylüyor.
 */
export interface DegisimHali {
  /** "↑ %12,5" */
  metin: string;
  /** `null` = değişim önemsiz (|d| < 0,05), renk yok. */
  iyi: boolean | null;
  etiket: 'iyi yönde' | 'kötü yönde' | 'değişmedi';
}

export function degisimHali(d: number | null | undefined, ters?: boolean): DegisimHali | null {
  if (d === null || d === undefined || !Number.isFinite(d)) return null;
  const sabit = Math.abs(d) < 0.05;
  const iyi = sabit ? null : d > 0 !== Boolean(ters);
  return {
    metin: `${sabit ? '→' : d > 0 ? '↑' : '↓'} %${Math.abs(d).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`,
    iyi,
    etiket: iyi === null ? 'değişmedi' : iyi ? 'iyi yönde' : 'kötü yönde',
  };
}
