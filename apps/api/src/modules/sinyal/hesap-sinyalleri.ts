import { Prisma } from '@prisma/client';
import type { TxLike } from './sinyal-hesap';

/**
 * ═══ İZLENMEYEN HESABIN AÇIK SİNYALİ KALMAZ (Ajan 4, Ö3) ═══
 *
 * Hesap workspace'ten ayrılınca ya da izlemesi kapatılınca hesaplama işi o
 * hesap için bir daha KOŞMUYOR (süpürme `SUPURME_HESAP_KOSULU` ile eliyor).
 * Açık sinyali kapatacak tek yol (`sure_doldu`) o işin içinde olduğu için
 * sinyal SONSUZA KADAR açık kalıyor, Genel Bakış'ta "N sinyal açık" yazıyor
 * ve kimsenin artık izlemediği bir kampanyayı "durdur" diye gösteriyordu.
 *
 * Son durum `kendiliginden_kapandi`; sözleşmede "hesap ayrıldı" nedeni yok
 * ve ona dokunulmadı: neden `sure_doldu` (kapanmayı iş yazdı, kullanıcı
 * değil), hangi olayla kapandığı `kapatma_notu`nda. Yalnız AÇIK sinyaller:
 * kullanıcının kapattığı sinyalin kararı ezilmesin.
 *
 * TEK FONKSİYON, İKİ ÇAĞIRAN: hesap verisi taşıması (atama kaldırıldı,
 * `hesap-verisi-tasima.ts`) ve izleme anahtarı (`setAccountSync`). Emniyet
 * için 07:40 sinyal süpürmesi de atanmamış/izlenmeyen hesapların açık
 * sinyallerini kapatıyor (`izlenmeyenSinyalleriKapat`).
 */
export const HESAP_AYRILDI_NOTU = 'Hesap workspace’ten ayrıldı; sinyal hesaplanmıyor.';
export const IZLEME_KAPANDI_NOTU = 'Hesabın izlemesi kapatıldı; sinyal hesaplanmıyor.';

export function hesapSinyalleriniKapat(tx: TxLike, adAccountId: string, not: string): Promise<number> {
  return tx.$executeRaw(Prisma.sql`
    UPDATE sinyaller SET durum = 'kendiliginden_kapandi', kapatma_nedeni = 'sure_doldu',
           kapatma_z = NULL, kapatan_user_id = NULL, kapatma_zamani = now(),
           kapatma_notu = ${not}, updated_at = now()
     WHERE ad_account_id = ${adAccountId}::uuid AND durum = 'acik'`);
}

/** Süpürmenin emniyet adımı: hesabı atanmamış, izlenmeyen ya da başka workspace'e geçmiş açık sinyaller. */
export function izlenmeyenSinyalleriKapat(tx: TxLike): Promise<number> {
  return tx.$executeRaw(Prisma.sql`
    UPDATE sinyaller s SET durum = 'kendiliginden_kapandi', kapatma_nedeni = 'sure_doldu',
           kapatma_z = NULL, kapatan_user_id = NULL, kapatma_zamani = now(),
           kapatma_notu = CASE WHEN a.client_id IS NULL OR a.client_id <> s.client_id
                               THEN ${HESAP_AYRILDI_NOTU} ELSE ${IZLEME_KAPANDI_NOTU} END,
           updated_at = now()
      FROM ad_accounts a
     WHERE a.id = s.ad_account_id AND s.durum = 'acik'
       AND (a.client_id IS NULL OR a.client_id <> s.client_id OR a.sync_enabled = false)`);
}
