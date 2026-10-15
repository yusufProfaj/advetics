/**
 * ═══ UZUN SÜREDİR GİRİŞ YAPMAMIŞ KİŞİ (pazar araştırması 2026-10-15) ═══
 *
 * Ajans erişim yönetiminin en pahalı hatası ayrılan kişinin erişiminin
 * kapanmaması (docs/pazar/ayarlar.md: 2026'da eski bir ajans, altı yıl önce
 * kaldırılmamış yönetici hakkıyla müşterinin hesabını sildi). Ekip listesi
 * "Son giriş" tarihini yazıyordu ama hiçbirini işaretlemiyordu.
 *
 * HİÇ GİRİŞ YAPMAMIŞ AYRI: davet edilmiş ama hesabını açmamış biri ile
 * 90 gündür gelmeyen biri farklı iş (daveti yenile / erişimi kaldır).
 */
import { sec, type Dil } from '@advetics/shared';
import { ayarlarSozlugu } from '@/dil/sozlukler/ayarlar';

export const ETKISIZ_GUN = 90;

export function erisimYasi(
  lastLoginAt: string | null,
  simdi: number = Date.now(),
  dil: Dil = 'tr',
): { tur: 'hic' | 'uzun'; metin: string } | null {
  const d = sec(ayarlarSozlugu, dil).ortak;
  if (!lastLoginAt) return { tur: 'hic', metin: d.hicGirisYok };
  const gun = Math.floor((simdi - Date.parse(lastLoginAt)) / 86_400_000);
  if (Number.isNaN(gun) || gun < ETKISIZ_GUN) return null;
  return { tur: 'uzun', metin: d.uzunSuredir(gun) };
}
