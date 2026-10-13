'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * ═══ PENCERE VE YAN PANEL (referans "08 · Yan panel") ═══
 *
 * Panelde on'dan fazla elle yazılmış modal vardı: kimi `fixed` ile üst barın
 * `backdrop-filter`ına hapsoluyordu (bkz. `yukleniyor.tsx` "PORTAL
 * ZORUNLU"), kimi Esc ile kapanmıyordu, kimi açılınca odağı içeri almıyor ve
 * klavye kullanıcısı arkadaki sayfada dolaşıyordu, kimi koşullu render
 * edildiği için kapanırken bir karede yok oluyordu.
 *
 * ORTAK KURALLAR (ikisi aynı `useKatman`dan geçiyor):
 * - PORTAL: panel kökünün sonuna çiziliyor; hiçbir kapsayıcı onu hapsedemez.
 * - DOM'DA KALIR (CLAUDE.md §3 Tasarım): kapalıyken `invisible` + `inert`,
 *   açılıp kapanma opaklık/kayma geçişiyle; yarım kalan animasyon yok.
 * - Esc kapatır, perdeye tıklamak kapatır, açılınca odak İÇERİ girer ve Tab
 *   içeride döner (odak tuzağı), kapanınca odak açan öğeye geri döner.
 * - Hareket azaltılmışsa geçiş yok (`motion-reduce:` + globals kuralı).
 *
 * NE ZAMAN HANGİSİ: bir satırı DÜZENLEMEK sayfadan çıkmadan `YanPanel`
 * (sağdan, 380-440 piksel); bir kararı ONAYLAMAK ya da kısa bir soru
 * `Pencere` (ortada). Kaydet sağ altta, kapat sağ üstte.
 */
function useKatman(acik: boolean, onKapat: () => void, kutu: RefObject<HTMLDivElement | null>) {
  const kapat = useRef(onKapat);
  kapat.current = onKapat;

  useEffect(() => {
    if (!acik) return;
    const onceki = document.activeElement as HTMLElement | null;
    const odaklanabilir = () =>
      Array.from(
        kutu.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    // İlk alan değil İLK ODAKLANABİLİR öğe: başlıktaki kapat düğmesi dahil.
    (odaklanabilir()[0] ?? kutu.current)?.focus();

    function tus(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        kapat.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const ogeler = odaklanabilir();
      if (ogeler.length === 0) {
        e.preventDefault();
        return;
      }
      const ilk = ogeler[0]!;
      const son = ogeler[ogeler.length - 1]!;
      if (e.shiftKey && document.activeElement === ilk) {
        e.preventDefault();
        son.focus();
      } else if (!e.shiftKey && document.activeElement === son) {
        e.preventDefault();
        ilk.focus();
      }
    }
    document.addEventListener('keydown', tus);
    // Arkadaki sayfa kaymasın; açık iki katman üst üste binerse ikincisi sayfayı geri açmasın.
    const eskiTasma = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tus);
      document.body.style.overflow = eskiTasma;
      onceki?.focus?.();
    };
  }, [acik, kutu]);
}

/**
 * Portalın hedefi: panelin kök öğesi (`.panel`), yoksa `body`.
 *
 * `body` DEĞİL `.panel`: beyaz etiketin marka rengi (`--brand-primary`)
 * `(dashboard)/layout.tsx`te `.panel`in satır içi stiline basılıyor. Body'ye
 * çizilen pencere o değişkeni görmez ve müşterinin panelinde ajansın
 * varsayılan kırmızısıyla açılırdı. `.panel` kendisi transform/filter
 * taşımıyor, yani `fixed` katman yine görüntü alanına göre konumlanıyor.
 * SSR'da `document` yok: hedef ilk boyamadan sonra bulunuyor.
 */
function usePortalHedefi(): HTMLElement | null {
  const [hedef, setHedef] = useState<HTMLElement | null>(null);
  useEffect(() => setHedef(document.querySelector<HTMLElement>('.panel') ?? document.body), []);
  return hedef;
}

function KapatDugmesi({ onKapat }: { onKapat: () => void }) {
  return (
    <button
      type="button"
      onClick={onKapat}
      aria-label="Kapat"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      ✕
    </button>
  );
}

export function Pencere({
  acik,
  onKapat,
  baslik,
  aciklama,
  children,
  altEylemler,
  genislik = 'orta',
}: {
  acik: boolean;
  onKapat: () => void;
  baslik: ReactNode;
  aciklama?: ReactNode;
  children?: ReactNode;
  /** Sağ altta: "Vazgeç" (ikincil) ve tek birincil. */
  altEylemler?: ReactNode;
  genislik?: 'dar' | 'orta' | 'genis';
}) {
  const hedef = usePortalHedefi();
  const kutu = useRef<HTMLDivElement>(null);
  const baslikId = useId();
  useKatman(acik, onKapat, kutu);
  if (!hedef) return null;
  const en = genislik === 'dar' ? 'max-w-[420px]' : genislik === 'genis' ? 'max-w-[760px]' : 'max-w-[560px]';
  return createPortal(
    <div
      inert={!acik}
      className={`panel-katman fixed inset-0 z-[70] grid place-items-center p-4 transition-[opacity,visibility] duration-200 motion-reduce:transition-none ${
        acik ? 'visible opacity-100' : 'invisible opacity-0'
      }`}
    >
      <div aria-hidden className="absolute inset-0 bg-black/40" onClick={onKapat} />
      <div
        ref={kutu}
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikId}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100vh-32px)] w-full ${en} flex-col overflow-hidden rounded-kart border border-line bg-surface text-ink shadow-acilir outline-none transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
          acik ? 'translate-y-0 scale-100' : 'translate-y-2.5 scale-[0.98]'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={baslikId} className="font-baslik m-0 text-[16px] font-bold">
              {baslik}
            </h2>
            {aciklama && <p className="m-0 mt-1 text-13 text-ink-muted">{aciklama}</p>}
          </div>
          <KapatDugmesi onKapat={onKapat} />
        </div>
        {children !== undefined && <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>}
        {altEylemler && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{altEylemler}</div>
        )}
      </div>
    </div>,
    hedef,
  );
}

export function YanPanel({
  acik,
  onKapat,
  baslik,
  children,
  altEylemler,
  genislik = 400,
}: {
  acik: boolean;
  onKapat: () => void;
  baslik: ReactNode;
  children?: ReactNode;
  /** Sağ altta: "Vazgeç" ve "Kaydet". */
  altEylemler?: ReactNode;
  /** Piksel; telefonda her zaman tam genişlik. */
  genislik?: number;
}) {
  const hedef = usePortalHedefi();
  const kutu = useRef<HTMLDivElement>(null);
  const baslikId = useId();
  useKatman(acik, onKapat, kutu);
  if (!hedef) return null;
  return createPortal(
    <div
      inert={!acik}
      className={`panel-katman fixed inset-0 z-[70] transition-[opacity,visibility] duration-200 motion-reduce:transition-none ${
        acik ? 'visible opacity-100' : 'invisible opacity-0'
      }`}
    >
      <div aria-hidden className="absolute inset-0 bg-black/30" onClick={onKapat} />
      <aside
        ref={kutu}
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikId}
        tabIndex={-1}
        style={{ width: `min(${genislik}px, 100vw)` }}
        className={`absolute inset-y-0 right-0 flex flex-col border-l border-line bg-surface text-ink shadow-acilir outline-none transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
          acik ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={baslikId} className="font-baslik m-0 text-[16px] font-bold">
            {baslik}
          </h2>
          <KapatDugmesi onKapat={onKapat} />
        </div>
        <div className="grid min-h-0 flex-1 content-start gap-3.5 overflow-auto p-5">{children}</div>
        {altEylemler && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            {altEylemler}
          </div>
        )}
      </aside>
    </div>,
    hedef,
  );
}
