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
): { metin: string; gecikti: boolean } | null {
  if (status !== 'new') return null;
  const dk = Math.max(0, Math.floor((simdi - Date.parse(submittedAt)) / 60_000));
  if (Number.isNaN(dk)) return null;
  const metin =
    dk < 60 ? `${dk} dakikadır aranmadı` : dk < 1440 ? `${Math.floor(dk / 60)} saattir aranmadı` : `${Math.floor(dk / 1440)} gündür aranmadı`;
  return { metin, gecikti: dk >= GECIKME_DAKIKA };
}
