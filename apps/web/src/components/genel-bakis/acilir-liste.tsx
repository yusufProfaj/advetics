'use client';

import { useState, type ReactNode } from 'react';

/**
 * Kapalıyken bu kadar satır görünür; Google Ads'in teşhis kartı da kısa
 * açılıyor. Beşten üçe indi (kullanıcı, 2026-10-09: "daraltıp ayrı bir kart
 * yapıp küçült"): kart metriklerin üstünde duruyor ve her satır metrikleri
 * aşağı itiyordu.
 */
export const ILK_SATIR = 3;

/**
 * ═══ AÇILIR LİSTE: İLK SATIRLAR + "TÜMÜNÜ GÖSTER" ═══
 *
 * Canlı denetimde (2026-10-09) "tüm şirketler" kipinde bekleyen işler 24
 * satır çıktı ve metrikleri ekranın çok altına itti. Google'ın hesap teşhisi
 * kartı kısa açılıp gerisini istenince gösteriyor; burada da öyle.
 *
 * SESSİZ KESME YOK: kapalıyken "5 / 24 gösteriliyor" yazıyor.
 *
 * AÇIK HÂLDE KART BÜYÜMÜYOR: kalan satırlar kartın İÇİNDE kayıyor
 * (`max-h-60`). 24 satırı açmak sayfayı uzatıp metrikleri ekranın dışına
 * itiyordu; kaydırma kabı animasyonlu kabın İÇİNDE ki geçiş sırasında
 * kaydırma çubuğu belirip kaybolmasın.
 *
 * ANİMASYON: menünün kullandığı `grid-template-rows` 0fr → 1fr geçişi
 * (`nav.tsx`); `max-height` tahmini içeriği kırpar ya da kapanışta
 * duraksar. Satırlar DOM'da kalıyor, kapalıyken `inert`: gizli bir
 * bağlantıya klavyeyle düşülmüyor. `prefers-reduced-motion` altında geçiş yok.
 */
export function AcilirListe({ ilk, kalan, toplam }: { ilk: ReactNode; kalan: ReactNode; toplam: number }) {
  const [acik, setAcik] = useState(false);
  const gizli = toplam - ILK_SATIR;

  return (
    <>
      {ilk}
      {gizli > 0 && (
        <>
          <div
            className={`grid transition-[grid-template-rows] duration-[420ms] ease-[var(--ease-out)] motion-reduce:transition-none ${
              acik ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="overflow-hidden" inert={!acik}>
              <div className="max-h-60 overflow-y-auto overscroll-contain">{kalan}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-1.5 text-xs">
            <span className="tabular-nums text-ink-muted">
              {acik ? `${toplam} iş` : `${ILK_SATIR} / ${toplam} gösteriliyor`}
            </span>
            <button
              type="button"
              onClick={() => setAcik((v) => !v)}
              aria-expanded={acik}
              className="font-semibold text-brand-strong hover:underline"
            >
              {acik ? 'Daha az göster' : `Tümünü göster (${toplam})`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
