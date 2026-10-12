import { z } from 'zod';
import type { Platform } from '../constants/platforms';
import type { EslemeSonucu, EslenemediNedeni, TrafikKaynagi } from './esleme';
import type { KaynakTuru } from './kaynak';

/**
 * ═══ F1 UÇLARININ SORGU VE YANIT TİPLERİ (Ajan 2 eki, 2026-10-14) ═══
 *
 * Ajan 1 sözleşmesi `KAYNAK_UCLARI`nda yolları ve izinleri verdi ama üç
 * ucun sorgu/yanıt tipini tanımlamadı (`secenekler`, `ga4/trafik`, dönem
 * sorgusu). Ajan 2 ve 3 tip TANIMLAMAZ kuralı yüzünden ikisi aynı şekli iki
 * yerde yazmasın diye EN DAR hâliyle buraya eklendi; başka hiçbir sözleşme
 * dosyası değişmedi (`VeriKaynagiOzeti`ne iki alan hariç, kaynak.ts).
 */

const GUN = /^\d{4}-\d{2}-\d{2}$/;

/** `ga4/trafik` ve `takip-acigi` sorgusu. Tarihler `YYYY-MM-DD` dizgesi (Date'e çevrilmez). */
export const kaynakDonemSorgusuSchema = z
  .object({
    clientId: z.string().uuid(),
    from: z.string().regex(GUN),
    to: z.string().regex(GUN),
  })
  .refine((s) => s.from <= s.to, { message: 'Başlangıç bitişten sonra olamaz.' });
export type KaynakDonemSorgusu = z.infer<typeof kaynakDonemSorgusuSchema>;

export const kaynakListeSorgusuSchema = z.object({ clientId: z.string().uuid() });
export type KaynakListeSorgusu = z.infer<typeof kaynakListeSorgusuSchema>;

export const kaynakSecenekSorgusuSchema = z.object({
  clientId: z.string().uuid(),
  tur: z.enum(['ga4']),
});
export type KaynakSecenekSorgusu = z.infer<typeof kaynakSecenekSorgusuSchema>;

export interface KaynakSecenegi {
  disKimlik: string;
  ad: string;
  /** Analytics hesabının adı (seçicide grup başlığı). */
  grup: string;
  /** Bu şirkette başka bir workspace'e bağlıysa onun adı: seçilemez, NEDENİ yazar. */
  bagliWorkspace: string | null;
}

export interface KaynakSecenekleriYaniti {
  tur: KaynakTuru;
  secenekler: KaynakSecenegi[];
  /** Kurulum rehberinin kurduğu mülk (önden seçili gelir). */
  kurulumMulkId: string | null;
}

/** `ga4/trafik` satırı: dönem toplamı, kaynak/ortam × kampanya. Kullanıcı sütunu YOK (toplanamaz). */
export interface Ga4TrafikSatiri {
  kaynakOrtam: string;
  trafikKaynagi: TrafikKaynagi;
  kampanyaAdi: string | null;
  oturum: number;
  etkilesimliOturum: number;
  anahtarEtkinlik: number;
  /** Mülk para biriminde, micros dizgesi (BigInt JSON'a girmez). */
  gelirMikro: string;
  esleme:
    | { sonuc: Exclude<EslemeSonucu, 'eslenemedi'>; kampanyaId: string; kampanyaAdi: string; platform: Platform }
    | { sonuc: 'eslenemedi'; neden: EslenemediNedeni };
}

export interface Ga4TrafikYaniti {
  donem: { from: string; to: string };
  emptyReason: 'kaynak_yok' | 'izin_eksik' | 'cekim_kosmadi' | 'veri_yok' | null;
  paraBirimi: string | null;
  satirlar: Ga4TrafikSatiri[];
  /** Kesme yok: gösterilen ve toplam satır. */
  gosterilen: number;
  toplamSatir: number;
  toplam: { oturum: number; ucretliOturum: number; anahtarEtkinlik: number };
}
