'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface SuzgecSecenegi {
  href: string;
  ad: string;
  /** Seçeneğin kaç kayıt taşıdığı; yoksa basılmıyor. */
  sayi?: number;
  aktif: boolean;
  ton?: 'tehlike';
  /** Sağda küçük bir ek (ör. sıralama yönü). */
  ek?: string;
}

/**
 * ═══ SÜZGEÇ: ETİKETLİ AÇILIR MENÜ ═══
 *
 * Reklam Keşfi'nde hesap, durum, kampanya ve sıralama dört satır ÇİP
 * olarak duruyordu; uzun hesap ve kampanya adları satırları ikiye üçe
 * bölüyor ve süzgeç kutusu ilk ekranın yarısını kaplıyordu. Artık her boyut
 * tek düğme: `Etiket: seçili değer ▾`. Seçenekler, sayılarıyla, açılır
 * listede. Bağlantılar yine sunucuda kuruluyor (`linkWith`), yani adres
 * süzgeci taşımaya devam ediyor; bu bileşen yalnızca aç/kapa ve arama.
 *
 * ETİKET KALDI: düğme "Tümü" dediğinde neyin tümü olduğu yazmalı. Eski
 * düzenin "etiketsiz dört satır aynı çipe benziyordu" dersi aynen geçerli.
 *
 * ARAMA ÇOK SEÇENEKTE: kırk kampanyalık bir listede kaydırarak aramak
 * yerine yazılıyor. SESSİZ KESME YOK: liste kesilmiyor, kaydırılıyor ve
 * arama sonucu "3 / 43" diye kaç tanesinin göründüğünü yazıyor.
 */
export function SuzgecMenusu({
  etiket,
  deger,
  secili,
  secenekler,
  aramaEsigi = 10,
}: {
  etiket: string;
  /** Düğmede görünen seçili değerin adı. */
  deger: string;
  /** Varsayılandan farklı bir seçim var mı (düğme vurgulanıyor). */
  secili: boolean;
  secenekler: SuzgecSecenegi[];
  aramaEsigi?: number;
}) {
  const [acik, setAcik] = useState(false);
  const [ara, setAra] = useState('');
  const kap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!acik) return;
    const disari = (e: PointerEvent) => {
      if (kap.current && !kap.current.contains(e.target as Node)) setAcik(false);
    };
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAcik(false);
    };
    document.addEventListener('pointerdown', disari);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('pointerdown', disari);
      document.removeEventListener('keydown', tus);
    };
  }, [acik]);

  // Menü her açılışta boş aramayla başlıyor: önceki aramayla açılan liste,
  // aranan seçeneği "yok" gibi gösterirdi.
  useEffect(() => {
    if (acik) setAra('');
  }, [acik]);

  const aramali = secenekler.length > aramaEsigi;
  const gorunen = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr-TR');
    return q ? secenekler.filter((s) => s.ad.toLocaleLowerCase('tr-TR').includes(q)) : secenekler;
  }, [ara, secenekler]);

  return (
    <div ref={kap} className="relative">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
        aria-haspopup="menu"
        aria-controls={menuId}
        className={`flex max-w-[15rem] items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs transition ${
          secili
            ? 'border-brand/40 bg-brand-soft text-brand-strong'
            : 'border-line bg-surface text-ink hover:bg-surface-muted'
        }`}
      >
        <span className={secili ? 'text-brand-strong/80' : 'text-ink-muted'}>{etiket}:</span>
        <span className="min-w-0 truncate font-medium" title={deger}>
          {deger}
        </span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-transform ${acik ? 'rotate-180' : ''}`}>
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {acik && (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-30 mt-1.5 flex max-h-[22rem] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {aramali && (
            <div className="border-b border-line p-2">
              <input
                autoFocus
                type="search"
                value={ara}
                onChange={(e) => setAra(e.target.value)}
                placeholder={`${etiket} ara…`}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
              />
              <p className="mt-1 px-0.5 text-[11px] text-ink-muted">
                {gorunen.length} / {secenekler.length} gösteriliyor
              </p>
            </div>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto p-1">
            {gorunen.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-ink-muted">“{ara}” ile eşleşen yok.</li>
            ) : (
              gorunen.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    role="menuitem"
                    aria-current={s.aktif ? 'true' : undefined}
                    onClick={() => setAcik(false)}
                    title={s.ad}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                      s.aktif ? 'bg-brand-soft font-semibold text-brand-strong' : 'hover:bg-surface-muted'
                    } ${s.ton === 'tehlike' && !s.aktif ? 'text-danger-strong' : s.aktif ? '' : 'text-ink'}`}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden>
                      {s.aktif && (
                        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                          <path d="M4.5 10.5 8 14l7.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.ad}</span>
                    {s.ek && <span className="shrink-0 text-ink-muted">{s.ek}</span>}
                    {s.sayi !== undefined && (
                      <span className="shrink-0 tabular-nums text-ink-muted">{s.sayi}</span>
                    )}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
