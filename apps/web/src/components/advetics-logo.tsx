/**
 * ═══ ADVETICS LOGOSU — İŞARET + YAZI ═══
 *
 * Kenar çubuğu, beyaz etiketli bir logo yüklenmemişse şirket adının ilk iki
 * harfini bir kutuda gösteriyordu ("AD"); ürünün kendi markası hiçbir yerde
 * yoktu. Kullanıcı kararı (2026-10-06): işaret + yazı.
 *
 *   · İşaret: marka renginde kare, içinde yükselen üç çubuk (veri). Sekme
 *     ikonuyla AYNI çizim (`app/marka-isareti.tsx`); ikisi ayrışırsa sekme ile
 *     menü farklı logo gösterir.
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
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.6rem] bg-brand shadow-[0_6px_16px_-8px_var(--brand-primary)]"
      >
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
          <rect x="6" y="56" width="22" height="38" rx="5" fill="#ffffff" />
          <rect x="39" y="32" width="22" height="62" rx="5" fill="#ffffff" />
          <rect x="72" y="6" width="22" height="88" rx="5" fill="#ffffff" />
        </svg>
      </span>
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
