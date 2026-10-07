/**
 * ADVCAMPAIGN SOHBETİ — SINIRLAR VE KOTA (TASARIM-PLAN § 4.9).
 *
 * Tek sabit: hem kota bekçisi hem ekran ("bugün 38 / 40") bunu okuyor.
 * Ekrandaki sayı elle yazılırsa sınır değiştiği gün kullanıcıya yanlış sayı
 * söyler (CLAUDE.md "KULLANICIYA GÖSTERİLEN SINIR SABİTTEN TÜREMELİ").
 *
 * Değerler TAHMİN; ilk hafta gerçek kullanımla ölçülüp gözden geçirilecek.
 * Bekçi model çağrısından ÖNCE çalışır: sınırı aşan bir mesaj için modeli
 * çağırıp sonra reddetmek, parayı harcayıp cevabı çöpe atmak olurdu.
 */
import type { KotaDurumu } from './hal';

export const ADV_SOHBET_SINIRLARI = {
  /** Kullanıcı mesajı başına araç adımı; aşılırsa tur "kesildi". */
  aracAdimi: 8,
  /** Kullanıcı mesajı başına çıktı token. */
  ciktiToken: 8_000,
  /** Kullanıcı başına, kayan bir saatte mesaj. */
  saatlikMesaj: 40,
  /** Workspace başına, takvim gününde (İstanbul) önbellek dışı girdi token. */
  gunlukGirdiToken: 1_500_000,
  /** Oturum başına mesaj; aşınca yeni oturum önerilir. */
  oturumMesaj: 120,
  /** Oturum başına modele gönderilen görsel. */
  oturumGorsel: 10,
} as const;

export interface KotaKullanimi {
  /** Bu kullanıcının son 60 dakikadaki mesaj sayısı. */
  saatlikMesaj: number;
  /** Bu workspace'in bugünkü (İstanbul günü) önbellek dışı girdi token'ı. */
  gunlukGirdiToken: number;
  oturumMesaj: number;
  /** Son 60 dakikadaki en eski mesajın zamanı: saatlik sınır o mesajdan 1 saat sonra açılır. */
  saatlikEnEski: Date | null;
}

/**
 * Sıra: önce oturum (yeni oturum açmak hemen çözer), sonra saatlik, en son
 * günlük. Yenilenme anı söylenir: "sınır doldu" deyip ne zaman açılacağını
 * yazmamak kullanıcıyı sayfayı yenilemeye iter.
 */
export function kotaDurumu(k: KotaKullanimi, simdi: Date): KotaDurumu {
  const s = ADV_SOHBET_SINIRLARI;
  if (k.oturumMesaj >= s.oturumMesaj) return { tur: 'doldu', sebep: 'oturum_mesaj', yenilenme: null };
  if (k.saatlikMesaj >= s.saatlikMesaj) {
    const acilis = k.saatlikEnEski ? new Date(k.saatlikEnEski.getTime() + 60 * 60_000) : new Date(simdi.getTime() + 60 * 60_000);
    return { tur: 'doldu', sebep: 'saatlik_mesaj', yenilenme: acilis.toISOString() };
  }
  if (k.gunlukGirdiToken >= s.gunlukGirdiToken) {
    return { tur: 'doldu', sebep: 'gunluk_token', yenilenme: istanbulYarin(simdi).toISOString() };
  }
  return { tur: 'serbest' };
}

/** İstanbul'da bir sonraki gece yarısı (UTC+3, yaz saati yok). */
export function istanbulYarin(simdi: Date): Date {
  const ist = new Date(simdi.getTime() + 3 * 60 * 60_000);
  const yarin = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1);
  return new Date(yarin - 3 * 60 * 60_000);
}
