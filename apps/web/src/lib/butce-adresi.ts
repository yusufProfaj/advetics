import { baglanti } from '@/lib/baglanti';

/**
 * AYLIK BÜTÇE'NİN TEK ADRES ÜRETİCİSİ.
 *
 * Bütçe 2026-10-06'da Marka Merkezi'ne (Base) taşınmıştı, 2026-10-09'da
 * Planla bölümüne kendi sayfası olarak döndü (kullanıcı kararı: "bütçe
 * Planla'da olsun"). İki taşımada da bağlantılar ayrı ayrı elle kuruluyordu
 * (Genel Bakış, kurulum listesi, ay seçici, eski Bilgi Bankası yönü); biri
 * unutulsa kullanıcı eski yere düşer ve oradan yönlenmeyle geri gelirdi.
 * Hepsi buradan geçiyor.
 */
export function butceAdresi(clientId: string | null | undefined, ek: { ay?: string } = {}): string {
  return baglanti('/butce', { musteri: clientId ?? undefined, ay: ek.ay });
}
