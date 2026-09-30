import type { GuncellemeDurumu } from '@advetics/shared';

/**
 * "Şimdi güncelle" ilerlemesi: istenen kimliklerin durum sayımı.
 *
 * BİR DURUM ENUM'INDAN İKİSİNİ SAYMAK KALANLARI SONSUZA KADAR AÇIK BIRAKIR
 * (CLAUDE.md, toplu tazeleme çubuğu). Bu yüzden HER durum bir kovaya
 * düşüyor: `throttled` BEKLEYEN (kota bekliyor, tekrar denenecek),
 * `cancelled` DÜŞEN (iş yapılmadı). Tanınmayan yeni bir durum da bekleyen
 * sayılıyor: düğmenin erken "Güncellendi" demesi, geç demesinden kötü.
 */
export function guncellemeDurumu(
  istenen: readonly string[],
  satirlar: ReadonlyArray<{ id: string; status: string; error_message: string | null }>,
): GuncellemeDurumu {
  const tekil = [...new Set(istenen)];
  let bekleyen = 0;
  let biten = 0;
  let dusen = 0;
  let sonHata: string | null = null;
  for (const s of satirlar) {
    if (s.status === 'succeeded') biten++;
    else if (s.status === 'failed' || s.status === 'cancelled') {
      dusen++;
      sonHata ??= s.error_message;
    } else bekleyen++;
  }
  return {
    toplam: tekil.length,
    bekleyen,
    biten,
    dusen,
    bulunamayan: Math.max(0, tekil.length - satirlar.length),
    sonHata,
  };
}
