import { ISARET_KIRMIZI_YOL, ISARET_SIYAH_YOL, ISARET_VIEWBOX } from '@/app/marka-isareti';

/**
 * ═══ ADVETICS LOGOSU — İŞARET + YAZI ═══
 *
 * Kenar çubuğu, beyaz etiketli bir logo yüklenmemişse şirket adının ilk iki
 * harfini bir kutuda gösteriyordu ("AD"); ürünün kendi markası hiçbir yerde
 * yoktu. Kullanıcı kararı (2026-10-06): işaret + yazı.
 *
 *   · İşaret: kenetlenen iki köşebent, biri yazı renginde, biri marka
 *     renginde (2026-10-15; önceki üç yuvarlak çubuk Google Analytics'e
 *     benziyordu ve Google'ın OAuth marka incelemesi reddetti). Yollar
 *     sekme ikonuyla ORTAK sabitten (`app/marka-isareti.tsx`); ikisi
 *     ayrışırsa sekme ile menü farklı logo gösterir. Kutu YOK: kılavuzun
 *     beyaz zemindeki kullanımı çıplak işaret, ve siyah parça
 *     `currentColor` olduğu için koyu temada açık renge dönüyor.
 *   · Yazı: `advetics-logo.png` ile aynı — kalın geometrik, i'nin noktası
 *     kırmızı. Görsel değil METİN: ekran okuyucu okuyor, karanlık temada
 *     renk değişiyor, her boyutta keskin. Noktalı i yerine noktasız ı ve
 *     üstüne çizilen nokta, çünkü noktanın rengi yazıdan farklı.
 *
 * Renkler belirteçten (`--brand-primary`): beyaz etiketli bir markanın
 * rengi seçiliyse işaret onun renginde.
 */
export function AdveticsLogo({ kompakt = false }: { kompakt?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" role="img" aria-label="Advetics">
      <svg aria-hidden="true" className="h-8 w-8 shrink-0 text-ink" viewBox={ISARET_VIEWBOX} fill="none">
        <path d={ISARET_SIYAH_YOL} fill="currentColor" />
        <path d={ISARET_KIRMIZI_YOL} className="fill-brand" />
      </svg>
      {!kompakt && (
        <span
          aria-hidden="true"
          className="font-baslik text-[1.3rem] font-extrabold leading-none tracking-[-0.02em] text-ink"
        >
          Advet
          <span className="relative inline-block">
            ı
            <span className="absolute left-1/2 top-[-0.06em] h-[0.27em] w-[0.27em] -translate-x-1/2 rounded-full bg-brand" />
          </span>
          cs
        </span>
      )}
    </span>
  );
}
