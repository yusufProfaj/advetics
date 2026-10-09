/**
 * Rehberin TEK metin seti ve iki platformun sınırları.
 *
 * Kullanıcı metni bir kez yazıyor; Meta ana metin + başlık, Google başlıklar +
 * açıklamalar olarak bölünüyor. Sınırlar BURADA ve ekrandaki sayaç, eksik
 * listesi ve derleyici bu sabitleri okuyor: "Üst sınır 10 MB" elle yazılıp
 * sabit değişince yalan söyleyen ekran bu depoda bir kez oldu.
 *
 * Karakter sayımı kod noktası üzerinden (`[...s].length`): `length` UTF-16
 * birimi sayar ve emoji iki karakter görünür. Google başlık sınırını
 * karakterle uyguluyor.
 */
export const METIN_SINIRLARI = {
  /** Meta ana metin: 125'ten sonrası "devamını gör" arkasına düşer (kesin sınır değil, uyarı). */
  anaMetinOnerilen: 125,
  anaMetinEnCok: 2200,
  /** Google duyarlı arama reklamı başlığı — kesin sınır. Meta başlığı da bundan kısa kalır. */
  baslik: 30,
  basliklarEnAz: 3,
  basliklarEnCok: 15,
  /** Google açıklaması — kesin sınır. */
  aciklama: 90,
  aciklamalarEnAz: 2,
  aciklamalarEnCok: 4,
  /** Meta reklamında kullanılan başlık sayısı (ilk N). */
  metaBaslikSayisi: 5,
  /** Google görünen yol parçası (iki parça). */
  gorunenYol: 15,
} as const;

export function karakterSayisi(s: string): number {
  return [...s].length;
}

export interface MetinSeti {
  anaMetin: string;
  basliklar: string[];
  aciklamalar: string[];
}

export type ReklamGucu = 'zayif' | 'orta' | 'iyi';

/**
 * Google'ın "reklam gücü" fikrinin sadeleştirilmiş, ÖLÇÜLEBİLİR hâli: kaç
 * başlık var, birbirinden farklılar mı. Google'ın kendi puanı API'den
 * kurulumdan sonra okunur; bu yalnız yazarken yön gösterir ve ekranda
 * "Google'ın puanı" diye SUNULMAZ.
 */
export function reklamGucu(m: MetinSeti): { gucu: ReklamGucu; ipucu: string | null } {
  const dolu = m.basliklar.map((b) => b.trim()).filter(Boolean);
  const benzersiz = new Set(dolu.map((b) => b.toLocaleLowerCase('tr-TR'))).size;
  const aciklama = m.aciklamalar.map((a) => a.trim()).filter(Boolean).length;
  if (benzersiz < dolu.length) return { gucu: 'zayif', ipucu: 'Aynı başlığı iki kez yazdın' };
  if (dolu.length < METIN_SINIRLARI.basliklarEnAz) {
    return { gucu: 'zayif', ipucu: `${METIN_SINIRLARI.basliklarEnAz - dolu.length} başlık daha ekle` };
  }
  if (aciklama < METIN_SINIRLARI.aciklamalarEnAz) return { gucu: 'zayif', ipucu: 'Bir açıklama daha ekle' };
  if (dolu.length < 8) return { gucu: 'orta', ipucu: `${8 - dolu.length} başlık daha eklersen Google daha çok deneme yapar` };
  return { gucu: 'iyi', ipucu: null };
}
