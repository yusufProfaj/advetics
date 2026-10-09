import type { Platform } from '@advetics/shared';
import { PLATFORMS } from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';

/*
 * Genel Bakış ve Reklam Yöneticisi'nin ortak adres/hata yardımcıları. İkisi
 * de aynı süzgeçleri aynı adreste taşıyor; platform çözümü iki kopyada
 * ayrışırsa bir ekranda LinkedIn süzgeci tutar, öbüründe sessizce düşer.
 */

/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
export function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.';
}

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Platform parametresi.
 *
 * Bilinmeyen değer "tümü"ye düşüyor, hata vermiyor: URL elle düzenlenmiş
 * olabilir ve bir yazım hatası yüzünden panelin açılmaması abartı olurdu.
 */
export function resolvePlatform(raw: string | undefined): Platform | null {
  /*
   * LİSTEDEN ÇÖZÜLÜYOR, ELLE DALLANMIYOR.
   *
   * Burada `raw === 'meta' || raw === 'google'` yazıyordu ve üçüncü platform
   * eklenince en can sıkıcı hâli üretecekti: LinkedIn süzgecini seçen
   * kullanıcı bilinmeyen değer sayılıp SESSİZCE "tümü"ye dönerdi. Hata yok,
   * uyarı yok — sadece yanlış rakamlar. CLAUDE.md'deki "süzgeç bazen
   * kayboluyor" hatasının aynısı.
   */
  return PLATFORMS.find((p) => p === raw) ?? null;
}
