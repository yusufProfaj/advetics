/**
 * GENEL BAKIŞ — BEKLEYEN İŞLER sözleşmesi (Aşama 2, Ajan 1 / Mimar).
 * Kararlar ve ölçüm listesi: `docs/genel-bakis/MIMARI.md`.
 *
 * Genel Bakış'ın üstünde "bugün ne yapmalıyım" sorusunun cevabı. Yalnız
 * EYLEM GEREKTİREN işler: bağlantı/ödeme uyarıları sayfada zaten kendi
 * kutusunda (`/alerts`) ve burada tekrarlanmıyor — iki kutuda aynı satır,
 * hangisinin güncel olduğu sorusunu doğurur.
 */
import { z } from 'zod';
import type { Permission } from '../auth/roles';

/**
 * Tür SIRASI ÖNCELİKTİR: liste bu sırayla diziliyor.
 *
 * - `boost_onay` — Akıllı Boost kartı onay bekliyor (`boost.read`). Yeni
 *   gönderi her gün düşüyor; bekleyen kart, kaçan erişim demek.
 * - `strateji_onay` — plan `onayda` (`strategy.read`). Onay yetkisi olan
 *   (müşteri hesabı dahil) için kendi işi; olmayan için bilgi.
 * - `strateji_aktar` — plan `onaylandi` ama AdvCampaign'e aktarılmadı
 *   (`strategy.write`). Onay alınmış bir planın kurulmaması sessiz kayıp.
 * - `butce_yok` — bu ay harcaması olan ama aylık bütçesi tanımsız
 *   workspace (`budget.write`). Bütçesiz harcamanın temposu ölçülemiyor.
 */
export const BEKLEYEN_IS_TURLERI = ['boost_onay', 'strateji_onay', 'strateji_aktar', 'butce_yok'] as const;
export type BekleyenIsTuru = (typeof BEKLEYEN_IS_TURLERI)[number];

/** Bir workspace'te bir türden bekleyen işlerin özeti — satır başına bir tür. */
export interface BekleyenIs {
  tur: BekleyenIsTuru;
  clientId: string;
  clientAdi: string;
  /** Kaç kart / plan. `butce_yok`ta her zaman 1. */
  sayi: number;
  /**
   * En eski bekleyenin zamanı (ISO). "23 gündür bekliyor" bir önceliktir.
   * `butce_yok`ta null (beklemenin başlangıcı yok, ay başı).
   */
  enEski: string | null;
}

/**
 * Kaynak okunamadıysa SATIRI SESSİZCE DÜŞÜRME: "bekleyen yok" ile "Boost
 * kuyruğu okunamadı" aynı boş kutu olurdu (CLAUDE.md sessiz hata). Kaynak
 * başına hata ayrı taşınıyor; diğer kaynaklar yine geliyor.
 */
export interface BekleyenIsKaynakHatasi {
  tur: BekleyenIsTuru;
  mesaj: string;
}

export interface BekleyenIslerYaniti {
  isler: BekleyenIs[];
  /** Kesilmeden önceki satır sayısı — sessiz kesme yok. */
  toplam: number;
  /** Kullanıcının YETKİSİ OLMADIĞI için hiç sorulmayan türler (bilgi, hata değil). */
  sorulmayan: BekleyenIsTuru[];
  hatalar: BekleyenIsKaynakHatasi[];
  uretildi: string;
}

/** Yanıtta en çok bu kadar satır; fazlası `toplam`da sayılıyor. */
export const BEKLEYEN_IS_SINIRI = 50;

/** Tür başına okuma yetkisi — sunucu süzgeci ve panel aynı tablodan. */
export const BEKLEYEN_IS_YETKISI = {
  boost_onay: 'boost.read',
  strateji_onay: 'strategy.read',
  strateji_aktar: 'strategy.write',
  butce_yok: 'budget.write',
} as const satisfies Record<BekleyenIsTuru, Permission>;

/**
 * `GET /genel-bakis/bekleyenler?clientId=` — clientId yoksa kullanıcının
 * erişebildiği BÜTÜN workspace'ler (Genel Bakış'ın "Tüm workspace'ler" kipi).
 */
export const bekleyenIslerSorgusuSchema = z.object({
  clientId: z.string().uuid().optional(),
});
export type BekleyenIslerSorgusu = z.infer<typeof bekleyenIslerSorgusuSchema>;

/** Sunucunun sıralaması: önce tür önceliği, sonra en eski bekleyen. */
export function bekleyenIsSirasi(a: BekleyenIs, b: BekleyenIs): number {
  const t = BEKLEYEN_IS_TURLERI.indexOf(a.tur) - BEKLEYEN_IS_TURLERI.indexOf(b.tur);
  if (t !== 0) return t;
  if (a.enEski && b.enEski) return a.enEski < b.enEski ? -1 : a.enEski > b.enEski ? 1 : 0;
  if (a.enEski) return -1;
  if (b.enEski) return 1;
  return a.clientAdi.localeCompare(b.clientAdi, 'tr');
}
