import { sec, type Dil } from '@advetics/shared';
import { leadsSozlugu } from '@/dil/sozlukler/leads';

/**
 * ═══ YENİ KAYIT NE ZAMANDIR ARANMADI (pazar araştırması 2026-10-15) ═══
 *
 * İlk temas hızı form kaydının değerini belirliyor (docs/pazar/
 * potansiyel-musteriler.md): dakikalar önemli. Liste "Yeni" rozetini
 * gösteriyordu ama kaydın kaç saattir beklediğini söylemiyordu; reklam
 * bilmeyen müşteri için en pahalı kayıp "form doldu, kimse aramadı".
 *
 * Yalnız `new` durumundaki kayıt: "Arandı" ve sonrası kullanıcının
 * kararı, bekleme değil. Gelecekte görünen zaman (saat farkı) sıfıra
 * çekiliyor: "-3 dakikadır" yazmak uydurma olurdu.
 */
export const GECIKME_DAKIKA = 60;

export function bekleyenKayit(
  status: string,
  submittedAt: string,
  simdi: number = Date.now(),
  dil: Dil = 'tr',
): { metin: string; gecikti: boolean } | null {
  if (status !== 'new') return null;
  const dk = Math.max(0, Math.floor((simdi - Date.parse(submittedAt)) / 60_000));
  if (Number.isNaN(dk)) return null;
  const d = sec(leadsSozlugu, dil).bekleme;
  const metin = dk < 60 ? d.dakika(dk) : dk < 1440 ? d.saat(Math.floor(dk / 60)) : d.gun(Math.floor(dk / 1440));
  return { metin, gecikti: dk >= GECIKME_DAKIKA };
}

/**
 * ═══ KAYITTAN WHATSAPP'A TEK TIK ═══
 * Türkiye'de form kaydından sonra ilk temas çoğunlukla WhatsApp'tan
 * (docs/pazar/potansiyel-musteriler.md). Numara E.164'e paylaşılan
 * çeviriciyle (`telefonE164`, geri besleme hash'iyle AYNI kural) çevriliyor;
 * tanınmayan biçimde bağlantı YOK: tahmin edilen numara başka birinin
 * WhatsApp'ını açar.
 */
export function whatsappAdresi(telefon: string | null, e164: (ham: string) => string | null): string | null {
  if (!telefon) return null;
  const n = e164(telefon);
  return n ? `https://wa.me/${n.slice(1)}` : null;
}
