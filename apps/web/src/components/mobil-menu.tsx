'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { KenarIcerigi, type KenarVerisi } from '@/components/kenar-cubugu';

/**
 * ═══ MOBİL MENÜ — PANELİN TELEFONDA HİÇ GEZİLEMİYOR OLMASI ═══
 *
 * Kenar çubuğu `hidden lg:flex` idi ve panelde tek bir `lg:hidden` yoktu:
 * 1024px altında menü tamamen kayboluyor ve yerine hiçbir şey gelmiyordu.
 * Telefonla giren kullanıcı üst bardaki seçicileri ve zili görüyor, ama
 * hiçbir sayfaya geçemiyordu. Genel Bakış'ta kilitli kalıyordu.
 *
 * ÇEKMECE, AÇILIR MENÜ DEĞİL: menüde beş bölüm ve on dört satır var;
 * küçük bir açılır kutu bunları taşımıyor.
 *
 * ┌─ ÇEKMECE `document.body`YE TAŞINIYOR — VE BU ZORUNLU ──────────────────┐
 * │ Düğme üst barın içinde duruyor; üst bar `backdrop-blur` taşıyor.        │
 * │ `backdrop-filter` uygulanan bir öğe, içindeki `position: fixed`         │
 * │ elemanlar için YENİ BİR KAPSAYICI KUTU kuruyor: `fixed inset-0` artık   │
 * │ ekranın tamamına değil, 64 piksellik üst bara göre çözülüyor ve çekmece │
 * │ oraya sıkışıyor. Kullanıcının gördüğü hâli: "menü header kısmında       │
 * │ açılıyor."                                                              │
 * │                                                                         │
 * │ `z-index` bunu ÇÖZMÜYOR — sorun yığın sırası değil, koordinatların      │
 * │ neye göre hesaplandığı. Aynı tuzak `transform`, `filter` ve             │
 * │ `will-change` için de geçerli; üst bardan blur kaldırılsa bile bir gün  │
 * │ animasyon eklenince geri gelirdi. Portal, çekmeceyi o kutunun tamamen   │
 * │ dışına çıkarıyor.                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function MobilMenu({
  veri,
  stil,
}: {
  veri: KenarVerisi;
  /** Marka renkleri. Portal layout'un dışına çıktığı için elden geçiyor. */
  stil?: React.CSSProperties;
}) {
  const [acik, setAcik] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const dugmeRef = useRef<HTMLButtonElement>(null);

  /*
   * SAYFA DEĞİŞİNCE KAPANIYOR. Next.js gezinmesi bileşeni söküp takmıyor,
   * yani durum kendiliğinden sıfırlanmıyor: bağlantıya basınca yeni sayfa
   * çekmecenin ARKASINDA açılıyor ve kullanıcı hiçbir şey olmadı sanıyor.
   */
  useEffect(() => {
    setAcik(false);
  }, [pathname]);

  useEffect(() => {
    if (!acik) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setAcik(false);
    }
    document.addEventListener('keydown', onKey);
    // ARKA PLAN KAYMASIN: çekmece açıkken sayfanın kayması, kullanıcıyı
    // kapattığında bambaşka bir yerde bırakıyor.
    const onceki = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Odak çekmeceye taşınıyor; klavye kullanıcısı aksi hâlde arkadaki
    // sayfada geziniyor.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = onceki;
    };
  }, [acik]);

  return (
    <>
      <button
        ref={dugmeRef}
        type="button"
        onClick={() => setAcik(true)}
        aria-label="Menüyü aç"
        aria-expanded={acik}
        className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink transition hover:bg-surface-sunken lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            d="M2 4.5h14M2 9h14M2 13.5h14"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {acik &&
        createPortal(
          /*
           * MARKA DEĞİŞKENLERİ PORTALA DA GEÇİYOR.
           *
           * `--brand-primary` ve arkadaşları layout'taki bir `div`in inline
           * stilinde duruyor. Portal çekmeceyi `document.body`ye taşıdığı
           * için o kabın DIŞINA çıkıyor ve değişkenler miras alınmıyor:
           * logosuz bir müşteride baş harf rozeti (`bg-brand`) ajansın
           * rengi yerine VARSAYILAN kırmızıyı basardı. Beyaz etiketli bir
           * üründe müşteriye başkasının rengini göstermek, bu depoda
           * açıkça yazılı bir kural ihlali.
           */
          <div style={stil} className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Menüyü kapat"
              onClick={() => setAcik(false)}
              className="absolute inset-0 bg-black/40"
            />
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Menü"
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-pop outline-none"
            >
              <KenarIcerigi
                veri={veri}
                /*
                 * KAPATMA `nav`ın ÜSTÜNDE, her bağlantıda DEĞİL. Her satıra
                 * ayrı bir kapatma bağlamak, menüye yeni bir satır
                 * eklendiğinde unutulacak bir adım demekti.
                 */
                onGezinme={() => setAcik(false)}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
