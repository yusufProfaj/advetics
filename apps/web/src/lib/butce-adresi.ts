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

/**
 * GENEL BAKIŞ'IN BÜTÇE KARTI HANGİ WORKSPACE'İ GÖSTERİR.
 *
 * Bütçe workspace başına tutuluyor. Kart bir süre yalnız tek workspace
 * SEÇİLİYKEN çiziliyordu; şirketin tek workspace'i olduğu hâlde "şirket
 * geneli" görünümünde kart hiç çıkmıyordu ve kullanıcının tarifi *"aylık
 * bütçe kısmı yok, önceden vardı"* oldu. Hata yok, boş alan bile yok.
 * - Seçili workspace varsa o.
 * - Şirket geneli + tek workspace: o tek workspace (şirket = workspace).
 * - Şirket geneli + birden çok workspace: `secimGerekli`. Kart yine çizilir
 *   ve nedenini söyler; bütçeleri toplamak ayrı bir karar (para birimleri
 *   farklı olabilir).
 * - Ajans (tüm şirketler) görünümü: kart yok.
 */
export function butceKapsami(o: {
  ajansGorunumu: boolean;
  activeClientId: string | null;
  workspaceler: ReadonlyArray<{ id: string }>;
}): { tur: 'yok' } | { tur: 'workspace'; id: string } | { tur: 'secimGerekli' } {
  if (o.ajansGorunumu) return { tur: 'yok' };
  if (o.activeClientId) return { tur: 'workspace', id: o.activeClientId };
  if (o.workspaceler.length === 1) return { tur: 'workspace', id: o.workspaceler[0]!.id };
  return o.workspaceler.length > 1 ? { tur: 'secimGerekli' } : { tur: 'yok' };
}
