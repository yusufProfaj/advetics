import type { UyumKurali } from '../tipler';
import { GENEL_KURALLARI } from './genel';
import { ETICARET_KURALLARI, FINANS_KURALLARI, FORM_KVKK_KURALLARI, KONUT_KURALLARI, SAGLIK_KURALLARI, YEREL_HIZMET_KURALLARI } from './paketler';

/**
 * ═══ UYUM KATALOĞU — KOD OLARAK, SÜRÜMLÜ (TASARIM.md §10.1.2, S-5) ═══
 *
 * Veritabanında düzenlenebilir bir tablo DEĞİL: kuralın değişmesi kod
 * incelemesinden, testten ve sürüm numarasından geçmeli. Panelden
 * düzenlenen bir kural, değişmez uyum raporunun "hangi kuralla
 * denetlendi" sorusuna cevap veremez.
 *
 * SÜRÜM: herhangi bir kural, sözlük ya da mesaj değişince ARTAR. Onay
 * kapısı denetimi `katalog_surumu` ile saklıyor; sürüm artmadan mesaj
 * değişirse eski işaret yeni metne sessizce taşınırdı (işaret mesajla
 * eşleşiyor, ama "neye bakıldı" raporu yalan söylerdi).
 */
export const KATALOG_SURUMU = '2026.10.1';

export const UYUM_KATALOGU: readonly UyumKurali[] = [
  ...GENEL_KURALLARI,
  ...FORM_KVKK_KURALLARI,
  ...KONUT_KURALLARI,
  ...FINANS_KURALLARI,
  ...ETICARET_KURALLARI,
  ...YEREL_HIZMET_KURALLARI,
  ...SAGLIK_KURALLARI,
];

export { PAKETI_OLMAYAN_SEKTORLER } from './genel';
