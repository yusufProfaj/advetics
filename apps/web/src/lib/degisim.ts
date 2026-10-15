import { bicimKodu, sec, type Dil } from '@advetics/shared';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';

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
  /** "↑ %12,5" (tr) / "↑ 12.5%" (en) */
  metin: string;
  /** `null` = değişim önemsiz (|d| < 0,05), renk yok. */
  iyi: boolean | null;
  /** İyi/kötü/değişmedi, ekranın dilinde (sözlük). Karar `iyi`de, bu yalnız okunan hâli. */
  etiket: string;
}

/**
 * Yüzde, en çok bir ondalıkla: Türkçede işaret önde ("%12,5"), İngilizcede
 * sonda ("12.5%"). `formatPercent` sabit ondalık basıyor ("%12,00"); pay ve
 * değişim satırında gereksiz sıfır okunmayı zorlaştırıyor.
 */
export function yuzdeMetni(n: number, dil: Dil = 'tr'): string {
  const s = n.toLocaleString(bicimKodu(dil), { maximumFractionDigits: 1 });
  return dil === 'en' ? `${s}%` : `%${s}`;
}

export function degisimHali(d: number | null | undefined, ters?: boolean, dil: Dil = 'tr'): DegisimHali | null {
  if (d === null || d === undefined || !Number.isFinite(d)) return null;
  const sabit = Math.abs(d) < 0.05;
  const iyi = sabit ? null : d > 0 !== Boolean(ters);
  const e = sec(genelBakisSozlugu, dil).degisim;
  return {
    metin: `${sabit ? '→' : d > 0 ? '↑' : '↓'} ${yuzdeMetni(Math.abs(d), dil)}`,
    iyi,
    etiket: iyi === null ? e.sabit : iyi ? e.iyi : e.kotu,
  };
}
