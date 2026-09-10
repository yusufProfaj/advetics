import type { MetricsBreakdownRow } from '@advetics/shared';

/**
 * ═══ KIRILIM TABLOSUNUN SIRALAMASI ═══
 *
 * SATIR KÜMESİNİ DEĞİŞTİRMİYOR, YALNIZCA SIRAYI. Sunucu her zaman
 * "harcamaya göre ilk N" satırı döndürüyor (`ORDER BY spend DESC LIMIT n`)
 * ve buradaki sıralama o kümenin İÇİNDE çalışıyor.
 *
 * BUNUN SQL'E TAŞINMAMASI BİLİNÇLİ. `ORDER BY platform LIMIT 25` yazmak
 * satır kümesini de değiştirirdi: alfabetik olarak öne düşen platformun 25
 * kampanyası gelir, diğer platform tabloda HİÇ GÖRÜNMEZDİ — üstelik hiçbir
 * hata vermeden. "Mecraya göre sırala" diyen kullanıcının göreceği şey tam
 * olarak bunun tersi. Küme sabit kalınca sıralama güvenli bir GÖSTERİM
 * kararı oluyor.
 *
 * Kesmenin kendisi ekranda YAZILI (`BreakdownTable`) — aksi hâlde "mecraya
 * göre sıraladım ama Google kampanyalarımın çoğu yok" hâli sessiz kalırdı.
 */
export const SIRALAMALAR = ['harcama', 'mecra', 'gosterim', 'tik', 'donusum', 'cpa'] as const;
export type Siralama = (typeof SIRALAMALAR)[number];

/**
 * YÖN SÜTUNA GÖMÜLÜ, TIKLAMAYLA DEĞİŞMİYOR.
 *
 * İki tıklamalı (artan/azalan) bir başlık, URL'de ikinci bir parametre ve
 * ekranda ikinci bir hâl demek. Her sütunun ZATEN doğru bir yönü var:
 * harcama/gösterim/tık/dönüşümde büyük olan üstte aranıyor, CPA'da ise
 * DÜŞÜK olan iyi — "artışın kötü olduğu" tek metrik o ve tabloda `inverse`
 * ile zaten öyle işaretli.
 */
export const SIRALAMA_YONU: Record<Siralama, 'artan' | 'azalan'> = {
  harcama: 'azalan',
  mecra: 'artan',
  gosterim: 'azalan',
  tik: 'azalan',
  donusum: 'azalan',
  cpa: 'artan',
};

/** Bilinmeyen değer varsayılana düşüyor — elle düzenlenmiş URL panel açmamalı. */
export function siralamaCoz(raw: string | undefined): Siralama {
  return SIRALAMALAR.find((s) => s === raw) ?? 'harcama';
}

/**
 * Micros METİN olarak taşınıyor ve `BigInt` ile okunuyor — `Number` DEĞİL.
 *
 * Yıllık harcama micros cinsinden 2^53'e yaklaşıyor: `Number(micros)` orada
 * hassasiyet kaybediyor ve birbirine yakın iki büyük tutar EŞİT görünüyor.
 * Sıralamada bunun belirtisi "iki kampanyanın yeri bazen değişiyor" oluyor
 * ve sebebi hiçbir yerde görünmüyor.
 *
 * Bozuk bir dize `0n`a düşüyor: tek bir satır yüzünden tablonun tamamının
 * patlaması, o satırın yanlış yerde durmasından çok daha kötü.
 */
function mikro(micros: string): bigint {
  try {
    return BigInt(micros);
  } catch {
    return 0n;
  }
}

/**
 * `null` DEĞERLER HER ZAMAN SONDA.
 *
 * CPA'da `null` "hesaplanamıyor" demek (dönüşüm yok), "sıfır" DEĞİL. Sıfır
 * saymak, hiç dönüşüm getirmemiş kampanyaları "en ucuz CPA" olarak listenin
 * en üstüne taşırdı — ekranın verdiği cevabın tam tersi.
 */
function nullSonda(a: number | null, z: number | null, yon: 'artan' | 'azalan'): number {
  if (a === null && z === null) return 0;
  if (a === null) return 1;
  if (z === null) return -1;
  return yon === 'artan' ? a - z : z - a;
}

/**
 * Satırları seçilen sütuna göre sıralar — KOPYA döndürür.
 *
 * Yerinde sıralamak (`Array.prototype.sort` mutasyonu) çağıranın elindeki
 * diziyi de değiştirirdi; aynı diziyi başka bir bileşene veren bir sayfa
 * sessizce farklı sıra görürdü.
 *
 * EŞİTLİKTE HARCAMA BELİRLİYOR. Mecraya göre sıralarken aynı platformun
 * satırları arasında bir düzen olmazsa tablo her yenilemede farklı sıra
 * gösterebilirdi (`sort` kararlılığı girdi sırasına bağlı) ve kullanıcı
 * veriyi değişmiş sanırdı.
 */
export function kirilimSirala(
  rows: MetricsBreakdownRow[],
  siralama: Siralama,
): MetricsBreakdownRow[] {
  /*
   * YÖN `SIRALAMA_YONU`DAN OKUNUYOR — burada TEKRAR YAZILMIYOR.
   *
   * Aynı bilgi iki yerde durursa doğduğu anda ayrışır: başlıktaki ok bir
   * yönü gösterirken tablo diğerine göre sıralanır ve hiçbir hata düşmez.
   * CLAUDE.md: "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU ANDA AYRIŞIR."
   */
  const yon = SIRALAMA_YONU[siralama];

  /**
   * Harcama karşılaştırması — `BigInt` farkı SAYIYA İNDİRİLMİYOR, yalnızca
   * işareti okunuyor. `Number(fark)` büyük tutarlarda taşar ve
   * `Array.sort` zaten sıfır/pozitif/negatif dışında bir şeye bakmıyor.
   *
   * Bu aynı zamanda EŞİTLİKTEKİ BELİRLEYİCİ: harcaması yüksek olan üstte.
   */
  const harcamaFarki = (a: MetricsBreakdownRow, z: MetricsBreakdownRow): number => {
    const fark = mikro(z.spendMicros) - mikro(a.spendMicros);
    return fark === 0n ? 0 : fark > 0n ? 1 : -1;
  };

  return [...rows].sort((a, z) => {
    switch (siralama) {
      case 'mecra': {
        const f = a.platform.localeCompare(z.platform, 'tr');
        const yonlu = yon === 'artan' ? f : -f;
        return yonlu !== 0 ? yonlu : harcamaFarki(a, z);
      }
      case 'gosterim':
        return nullSonda(a.impressions, z.impressions, yon) || harcamaFarki(a, z);
      case 'tik':
        return nullSonda(a.clicks, z.clicks, yon) || harcamaFarki(a, z);
      case 'donusum':
        return nullSonda(a.conversions, z.conversions, yon) || harcamaFarki(a, z);
      case 'cpa':
        return nullSonda(a.cpa, z.cpa, yon) || harcamaFarki(a, z);
      case 'harcama':
      default:
        return yon === 'azalan' ? harcamaFarki(a, z) : -harcamaFarki(a, z);
    }
  });
}
