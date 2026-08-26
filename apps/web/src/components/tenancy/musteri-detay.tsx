'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * ═══ MÜŞTERİ DETAY PENCERESİ ═══
 *
 * Müşteri kartı her şeyi birden gösteriyordu: bağlı varlıkların tam listesi,
 * her birinin yanında açılır kutu ve iki eylem, özel reklam kategorisi,
 * havuzdan atama satırı. Üç sütunlu ızgarada her kart yarım ekran kaplıyor ve
 * sekiz müşteri dört ekran kaydırma demek — "hangi müşteride ne var"
 * sorusuna bakışta cevap veren bir liste olmaktan çıkmıştı.
 *
 * Kart artık YALNIZCA sayıları taşıyor (kaç varlık bağlı, kaçı izlemede, ekip
 * kaç kişi); geri kalan her şey bu pencerede.
 *
 * PORTAL ZORUNLU. Pencere bir kartın içinden açılıyor ve o kart ızgara
 * hücresinin içinde; ayrıca üst bardaki kardeşi `backdrop-blur` yüzünden
 * başlığın kutusuna hapsolmuştu. `fixed` konumlu bir öğe, `transform`,
 * `filter` ya da `backdrop-filter` taşıyan HERHANGİ bir atadan etkileniyor;
 * ağaçtan çıkmak tek güvenilir yol.
 */
export function MusteriDetay({
  acik,
  onKapat,
  baslik,
  altBaslik,
  children,
}: {
  acik: boolean;
  onKapat: () => void;
  baslik: string;
  altBaslik: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onKapat();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [acik, onKapat]);

  if (!acik) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={baslik}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onKapat();
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-semibold uppercase text-white">
              {baslik.slice(0, 2)}
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink">{baslik}</h2>
              <p className="text-xs text-ink-muted">{altBaslik}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="rounded-lg px-2.5 py-1.5 text-xs text-ink-muted transition hover:bg-surface-muted hover:text-ink"
          >
            Kapat
          </button>
        </div>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Pencere içindeki bölüm başlığı — bölümler tek bir düzende dursun. */
export function DetayBolumu({
  baslik,
  sag,
  children,
}: {
  baslik: string;
  sag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {baslik}
        </h3>
        {sag}
      </div>
      {children}
    </section>
  );
}

/**
 * Etiket–değer satırı.
 *
 * BOŞ ALAN "—" BASIYOR, satırı gizlemiyor. Gizlemek, "bu müşterinin vergi
 * dairesi girilmemiş" ile "bu ekranda vergi dairesi diye bir alan yok"
 * hâllerini aynı boşluğa çeviriyor; oysa ilki doldurulacak bir eksik.
 */
export function DetaySatiri({ etiket, deger }: { etiket: string; deger: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <span className="text-xs text-ink-muted">{etiket}</span>
      <span className={`text-right text-xs ${deger ? 'text-ink' : 'text-ink-muted'}`}>
        {deger || '—'}
      </span>
    </div>
  );
}
