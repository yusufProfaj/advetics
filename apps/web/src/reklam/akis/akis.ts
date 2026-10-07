/**
 * Yeni Reklam Oluştur — Acemi akışının SAF kararları (TASARIM.md § 03, § 02.6).
 *
 * Bileşenden ayrı duruyor çünkü panelde bileşen render eden test altyapısı
 * yok (`vitest.config.ts` bilinçli reddediyor) ve effect/handler içine
 * gömülen bir karar yalnızca kaynak taramasıyla sınanabiliyordu — o tarama
 * yanlış şeyi kilitleyebildi (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR").
 *
 * "Yayına ne kaldı" sorusunun TEK cevabı `eksikler()`: sağdaki özet kartı,
 * adım düğmeleri ve Gözden geçir aynı listeyi okuyor. İkinci bir liste
 * yazılırsa biri "hazır" derken öbürü düğmeyi kilitli tutar.
 */
import { NIYET_KATALOGU, NIYET_KODLARI, type NiyetKodu, type NiyetSatiri } from '@advetics/shared';

export const ADIMLAR = ['Amaç', 'Görsel', 'Metin', 'Bütçe', 'Süre', 'Gözden geçir'] as const;
export type AdimNo = 0 | 1 | 2 | 3 | 4 | 5;

/** Bir kampanyada en çok beş fikir: her fikir bir reklam (§ 06.3). */
export const EN_COK_FIKIR = 5;
/** Meta başlık alanı; akışta görünen kısım daha kısa ama sınır bu. */
export const BASLIK_SINIRI = 40;
/** Akışta "devamını gör"den önce görünen ana metin. Uyarı, engel değil. */
export const GORUNEN_METIN = 125;

export const SURE_SECENEKLERI = [7, 14, 30, null] as const;
export type Sure = (typeof SURE_SECENEKLERI)[number];

export interface YeniReklamTaslagi {
  niyet: NiyetKodu | null;
  reklamHesabiId: string | null;
  sayfaId: string | null;
  /** Görsel arşivinden seçilen varlık kimlikleri; sıra = fikir sırası. */
  gorseller: string[];
  baslik: string;
  metin: string;
  /** Hesabın para biriminde, TAM BİRİM (micros değil — ekran değeri). */
  gunlukButce: number | null;
  sureGun: Sure;
}

export const BOS_TASLAK: YeniReklamTaslagi = {
  niyet: null,
  reklamHesabiId: null,
  sayfaId: null,
  gorseller: [],
  baslik: '',
  metin: '',
  gunlukButce: null,
  sureGun: 14,
};

export interface Eksik {
  adim: AdimNo;
  metin: string;
}

/**
 * Akışta gösterilecek niyetler. Bu ekran bir ÖNİZLEME ve Meta'ya yazmıyor;
 * belgeden yazılmış satırlar da görünüyor ama `kanit` rozetiyle. Gerçek
 * Acemi listesi `acemiNiyetleri()` — yayın motoru gelince ona geçilir.
 */
export function onizlemeNiyetleri(): NiyetSatiri[] {
  return NIYET_KODLARI.map((k) => NIYET_KATALOGU[k]).filter(
    (n) => n.tur === 1 || n.tur === 'yonlendirme',
  );
}

export function eksikler(t: YeniReklamTaslagi, yasalUyari: string | null): Eksik[] {
  const e: Eksik[] = [];
  if (!t.niyet) e.push({ adim: 0, metin: 'Amaç seçilmedi' });
  if (!t.reklamHesabiId) e.push({ adim: 0, metin: 'Reklam hesabı seçilmedi' });
  if (!t.sayfaId) e.push({ adim: 0, metin: 'Facebook sayfası seçilmedi' });
  if (t.gorseller.length === 0) e.push({ adim: 1, metin: 'En az bir görsel seç' });
  if (!t.baslik.trim()) e.push({ adim: 2, metin: 'Başlık boş' });
  if (t.baslik.length > BASLIK_SINIRI) e.push({ adim: 2, metin: `Başlık ${BASLIK_SINIRI} karakteri aşıyor` });
  if (!t.metin.trim()) e.push({ adim: 2, metin: 'Ana metin boş' });
  // Marka Merkezi'ndeki zorunlu uyarı metinde yoksa yayın duruyor (Bölüm 3
  // kuralı). Giriş anında söylenmeli, yayın düğmesinde değil.
  if (yasalUyari && !metinUyariIceriyor(t.metin, yasalUyari)) {
    e.push({ adim: 2, metin: 'Zorunlu yasal uyarı metinde yok' });
  }
  if (t.gunlukButce === null || !(t.gunlukButce > 0)) e.push({ adim: 3, metin: 'Günlük bütçe seçilmedi' });
  return e;
}

/** Boşluk farkı uyarıyı "yok" saydırmasın: kopyala-yapıştır satır sonu taşıyor. */
export function metinUyariIceriyor(metin: string, uyari: string): boolean {
  const n = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  return n(metin).includes(n(uyari));
}

/** Toplam üst sınır; süresizde `null` (ekranda "her gün" cümlesi kurulur). */
export function toplamUstSinir(gunluk: number | null, sure: Sure): number | null {
  if (gunluk === null || sure === null) return null;
  return gunluk * sure;
}

/** Fikir ekleme/çıkarma: sıra korunur, beşi geçmez, aynı görsel iki kez girmez. */
export function gorselDegistir(secili: string[], id: string): string[] {
  if (secili.includes(id)) return secili.filter((x) => x !== id);
  if (secili.length >= EN_COK_FIKIR) return secili;
  return [...secili, id];
}
