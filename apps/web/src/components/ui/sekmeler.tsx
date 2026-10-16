'use client';

import Link from 'next/link';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * ═══ SEKMELER VE BÖLÜMLÜ SEÇİCİ (referans "05 · Sekme, rozet, form") ═══
 *
 * Panelde altı sekme biçimi vardı: alt çizgili, hap, kutulu, gri zeminli…
 * Kullanıcı aynı işi (sayfa içinde bölüm değiştirmek) her ekranda başka bir
 * kontrolle yapıyordu. İki kontrol kaldı ve işleri ayrı:
 *
 * - `Sekmeler`: sayfanın İÇERİK bölümleri (Kampanyalar · Setler · Reklamlar).
 *   Alt çizgili; seçili sekme siyah yazı + KIRMIZI alt çizgi. Bağlantı da
 *   olabilir (`href`): bölüm adreste taşınıyorsa geri tuşu çalışsın.
 * - `BolumluSecici`: aynı verinin iki-dört GÖRÜNÜMÜ (Bu ay · 30 gün · Özel).
 *   Gri hap içinde hap seçenekler.
 *
 * KLAVYE: sekmelerde ←/→ komşu sekmeye geçer (WAI-ARIA sekme deseni);
 * yalnız fareyle çalışan bir sekme çubuğu klavye kullanıcısına kapalıdır.
 */
export interface SekmeSecenegi {
  deger: string;
  etiket: ReactNode;
  /** Verilirse sekme bir bağlantıdır (adres taşınan bölüm). */
  href?: string;
  /** Etiketin yanında küçük sayı: "Reklamlar 12". */
  sayi?: number;
  /**
   * Kullanılamayan sekme: soluk, tıklanmaz, NEDENİ `title`da (Reklam
   * Yöneticisi "Kampanyalar" sekmesi workspace seçilmeden). Gizlemek,
   * kullanıcıya düzeyin varlığını saklardı.
   */
  kapaliNedeni?: string;
}

const SEKME =
  'relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-[13.5px] font-bold no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand';

export function Sekmeler({
  secenekler,
  secili,
  onSec,
  etiket,
}: {
  secenekler: SekmeSecenegi[];
  secili: string;
  onSec?: (deger: string) => void;
  /** Ekran okuyucu adı: "Reklam düzeyi". */
  etiket: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function tus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ogeler = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const i = ogeler.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    e.preventDefault();
    const j = (i + (e.key === 'ArrowRight' ? 1 : ogeler.length - 1)) % ogeler.length;
    ogeler[j]?.focus();
  }
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={etiket}
      onKeyDown={tus}
      className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]"
    >
      {secenekler.map((s) => {
        const acik = s.deger === secili;
        const sinif = `${SEKME} ${acik ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`;
        const ic = (
          <>
            {s.etiket}
            {s.sayi !== undefined && (
              <span className="rounded-full bg-surface-sunken px-1.5 text-11 font-bold tabular-nums text-ink-muted">
                {s.sayi}
              </span>
            )}
          </>
        );
        if (s.kapaliNedeni) {
          return (
            <span
              key={s.deger}
              role="tab"
              aria-selected={false}
              aria-disabled
              title={s.kapaliNedeni}
              className={`${SEKME} cursor-not-allowed border-transparent text-ink-muted opacity-50`}
            >
              {ic}
            </span>
          );
        }
        return s.href ? (
          <Link
            key={s.deger}
            href={s.href}
            role="tab"
            aria-selected={acik}
            tabIndex={acik ? 0 : -1}
            className={sinif}
            onClick={() => onSec?.(s.deger)}
          >
            {ic}
          </Link>
        ) : (
          <button
            key={s.deger}
            type="button"
            role="tab"
            aria-selected={acik}
            tabIndex={acik ? 0 : -1}
            className={sinif}
            onClick={() => onSec?.(s.deger)}
          >
            {ic}
          </button>
        );
      })}
    </div>
  );
}

export function BolumluSecici<D extends string>({
  secenekler,
  secili,
  onSec,
  etiket,
}: {
  secenekler: Array<{ deger: D; etiket: ReactNode }>;
  secili: D;
  onSec: (deger: D) => void;
  etiket: string;
}) {
  return (
    /*
      SIĞMAZSA KENDİ İÇİNDE KAYAR: seçici inline-flex ve seçenekler nowrap;
      Bağlantılar'da yedi kanal 1280 px'te sayfayı 214 px taşırıyordu (canlı
      denetim). max-w-full + min-w-0 kabın genişliğini aşmasını engelliyor,
      kalan kısım yana kayıyor.
    */
    <div role="group" aria-label={etiket} className="inline-flex min-w-0 max-w-full overflow-x-auto rounded-full bg-surface-sunken p-[3px] [scrollbar-width:none]">
      {secenekler.map((s) => {
        const acik = s.deger === secili;
        return (
          /*
            gap-1.5: düğme inline-flex ve etiketteki her düğüm AYRI flex öğesi;
            flex öğesinin sonundaki boşluk atılıyor. "Tümü <span>21</span>"
            ekranda "Tümü21" çıkıyordu (canlı denetim, Varlıklar).
          */
          <button
            key={s.deger}
            type="button"
            aria-pressed={acik}
            onClick={() => onSec(s.deger)}
            className={`inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-bold transition-colors ${
              acik ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {s.etiket}
          </button>
        );
      })}
    </div>
  );
}
