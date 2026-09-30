import type { GuncellemeDurumu } from '@advetics/shared';

/**
 * "Şimdi güncelle" düğmesinin hâlleri. Her biri AYRI yazılıyor:
 * "başlatılıyor", "sürüyor", "bitti", "bir kısmı düştü", "bekleme süresi
 * doldu", "ilerleme okunamadı" ve "başlatılamadı" farklı şeyler ve
 * kullanıcının yapacağı iş her birinde farklı (CLAUDE.md: dört hâli aynı boş
 * alana çevirmek yasak).
 */
export type DugmeHali =
  | { tur: 'bos' }
  | { tur: 'baslatiliyor' }
  | { tur: 'guncelleniyor'; biten: number; toplam: number }
  | { tur: 'guncellendi'; dusen: number; sonHata: string | null }
  | { tur: 'uzun' }
  | { tur: 'bilinmiyor'; mesaj: string }
  | { tur: 'hata'; mesaj: string };

/**
 * Sunucunun sayımından düğmenin hâli. SAF FONKSİYON: panelde bileşen render
 * eden test altyapısı yok ve effect içindeki karar sınanamıyordu.
 *
 * - Bekleyen varsa ve süre dolmadıysa: sürüyor. Düşen iş de "işlendi"
 *   sayılıyor, çubuk takılı kalmasın (toplu tazeleme dersi).
 * - Süre dolduysa: "uzun" — BİTTİ DENMİYOR.
 * - Hiçbir iş görünmüyorsa (RLS, silinmiş): "bilinmiyor". Görünmeyen işi
 *   bitmiş saymak, düğmenin yalan söylemesi olurdu.
 * - Aksi hâlde bitti; düşen ve görünmeyen iş sayısı ayrı yazılıyor.
 */
export function dugmeHali(d: GuncellemeDurumu, sureDoldu: boolean): DugmeHali {
  if (d.bekleyen > 0) {
    return sureDoldu
      ? { tur: 'uzun' }
      : { tur: 'guncelleniyor', biten: d.biten + d.dusen, toplam: d.toplam };
  }
  if (d.toplam > 0 && d.bulunamayan === d.toplam) {
    return { tur: 'bilinmiyor', mesaj: 'İşlerin durumu görünmüyor.' };
  }
  return { tur: 'guncellendi', dusen: d.dusen + d.bulunamayan, sonHata: d.sonHata };
}
