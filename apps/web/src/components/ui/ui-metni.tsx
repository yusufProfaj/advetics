'use client';

import { useSozluk } from '@/dil/saglayici';
import { uiSozlugu } from '@/dil/sozlukler/ui';

type DuzAnahtar = { [K in keyof typeof uiSozlugu.tr]: (typeof uiSozlugu.tr)[K] extends string ? K : never }[keyof typeof uiSozlugu.tr];

/**
 * ORTAK BİLEŞENİN METNİ, EKRANIN DİLİNDE. `hal.tsx`, `tablo.tsx`,
 * `sihirbaz.tsx` direktifsiz (sunucu sayfaları da çiziyor) ve kanca
 * çağıramıyor; metni bu küçük istemci yaprağı basıyor. Öznitelik gereken
 * yerde (`aria-label`) bunun yerine `sr-only` içinde kullanılıyor: ekran
 * okuyucu aynı adı okuyor.
 */
export function UiMetni({ k }: { k: DuzAnahtar }) {
  return <>{useSozluk(uiSozlugu)[k]}</>;
}
