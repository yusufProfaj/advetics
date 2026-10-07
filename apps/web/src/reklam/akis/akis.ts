/**
 * Yeni Reklam Oluştur — Acemi akışının SAF kararları (TASARIM.md § 03).
 *
 * Bileşenden ayrı duruyor çünkü panelde bileşen render eden test altyapısı
 * yok (`vitest.config.ts` bilinçli reddediyor); handler içine gömülen bir
 * karar yalnızca kaynak taramasıyla sınanabilir ve o tarama yanlış şeyi
 * kilitleyebilir (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR").
 *
 * "Yayına ne kaldı" burada HESAPLANMIYOR: tek cevap sunucunun döndürdüğü
 * `eksikler` (paylaşılan `taslakEksikleri`). Bu dosyada eksik listesi
 * yazılırsa panel ile yayın kapısı ayrışır.
 */
import {
  NIYET_KATALOGU,
  NIYET_KODLARI,
  type HedefKonum,
  type NiyetSatiri,
  type TaslakAlanlari,
} from '@advetics/shared';

export const ADIMLAR = ['Amaç', 'Görsel', 'Metin', 'Bütçe', 'Süre', 'Gözden geçir'] as const;
export type AdimNo = 0 | 1 | 2 | 3 | 4 | 5;

/** Bir kampanyada en çok beş fikir: her fikir bir reklam (§ 06.3). */
export const EN_COK_FIKIR = 5;
/** Meta başlık alanı; akışta görünen kısım daha kısa ama sınır bu. */
export const BASLIK_SINIRI = 40;
/** Akışta "devamını gör"den önce görünen ana metin. Uyarı, engel değil. */
export const GORUNEN_METIN = 125;

/**
 * Akışta gösterilecek niyetler: ilk tur + yönlendirme. Belgeden yazılmış
 * satırlar rozetle görünüyor; yayın motoru bağlanınca `acemiNiyetleri()`ne
 * geçilecek ve canlıda doğrulanmamış satır HİÇ görünmeyecek.
 */
export function onizlemeNiyetleri(): NiyetSatiri[] {
  return NIYET_KODLARI.map((k) => NIYET_KATALOGU[k]).filter(
    (n) => n.tur === 1 || n.tur === 'yonlendirme',
  );
}

/** Fikir ekleme/çıkarma: sıra korunur, beşi geçmez, aynı görsel iki kez girmez. */
export function gorselDegistir(secili: string[], id: string): string[] {
  if (secili.includes(id)) return secili.filter((x) => x !== id);
  if (secili.length >= EN_COK_FIKIR) return secili;
  return [...secili, id];
}

/**
 * Bütün fikirlerde aynı başlık ve metin (Acemi). Kavram listesi görsel
 * sırasından KURULUYOR: metin değişince görsel sırası, görsel değişince metin
 * kaybolmasın.
 */
export function kavramlarKur(
  gorseller: string[],
  baslik: string,
  metin: string,
): Array<{ varlikId: string; baslik: string; metin: string }> {
  return gorseller.map((varlikId) => ({ varlikId, baslik, metin }));
}

/** Taslaktan ekranın okuduğu düz değerler. Yok olan alan boş döner. */
export function ekranDegerleri(a: TaslakAlanlari) {
  const kavramlar = a.kavramlar?.deger ?? [];
  return {
    niyet: a.niyet?.deger ?? null,
    hesap: a.reklamHesabiId?.deger ?? null,
    sayfa: a.sayfaId?.deger ?? null,
    konumlar: a.konumlar?.deger ?? [],
    konumKaynagi: a.konumlar?.kaynak ?? null,
    ekKategoriler: a.ekKategoriler?.deger ?? null,
    gorseller: kavramlar.map((k) => k.varlikId),
    baslik: kavramlar[0]?.baslik ?? '',
    metin: kavramlar[0]?.metin ?? '',
    hedefAdres: a.hedefAdres?.deger ?? '',
    butce: a.butce?.deger ?? null,
    takvim: a.takvim?.deger ?? null,
  };
}

export const BUTUN_TURKIYE: HedefKonum = { tur: 'country', key: 'TR', etiket: 'Bütün Türkiye', ulkeKodu: 'TR' };

/**
 * Hesabın saat diliminde bugün, `YYYY-MM-DD`. Tarayıcının saat dilimi
 * KULLANILMIYOR: İstanbul'daki ajans ABD saatli bir hesaba reklam kurarsa
 * "bugün" Meta'da dün olabilir.
 */
export function bugun(saatDilimi: string, simdi: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: saatDilimi,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(simdi);
}

/** Gün ekleme UTC öğlesi üzerinden: yaz saati geçişinde tarih kaymasın. */
export function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(y, a - 1, g, 12) + gun * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** "3 Kasım 2026" — ekranda tarih Türkçe ve saat diliminden bağımsız. */
export function tarihGoster(tarih: string): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, a - 1, g, 12)),
  );
}
