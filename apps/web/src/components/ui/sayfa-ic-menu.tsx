'use client';

import { useSozluk } from '@/dil/saglayici';
import { uiSozlugu } from '@/dil/sozlukler/ui';
import Link from 'next/link';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * ═══ SAYFA İÇİ YAN MENÜ (kullanıcı kararı, 2026-10-14) ═══
 *
 * Sayfanın alt bölümleri (Reklam Yöneticisi seviyeleri, Marka Merkezi
 * Kurulum/Marka/Workspace bilgileri, Ayarlar sekmeleri…) üstte sekme olarak
 * DURMAZ; içeriğin solunda dikey liste olarak durur. Kullanıcının sözü:
 * *"sayfaların içerisinde de sidebar olmasını istiyorum, üst tarafta olması
 * tasarımı kötü yapıyor, kontrol karmaşık oluyor"*. Onaylı taslak:
 * `docs/marka/sayfa-taslaklari.html` (`.sayfa.yanli`).
 *
 * `Sekmeler` bileşeni yalnız YAN PANELİN içinde (ör. kural düzenleyici
 * Kural · Geçmiş) kalır; sayfa düzeyinde bölüm geçişi her zaman bu bileşen.
 *
 * DÜZEN: masaüstünde 212px sol sütun, kaydırırken yerinde kalır; seçili öğe
 * gri zemin + solda kırmızı çizgi (ana menünün kırmızı zemininden ayrışsın
 * diye). Telefonda (<900px) liste yatay haplara döner; seçili hap siyah.
 * Sayı ya da kırmızı nokta (eksik var) satırın sağında.
 *
 * KLAVYE: ↑/↓ komşu öğeye geçer (dikey sekme deseni); telefonda ←/→ da çalışır.
 */
export interface IcMenuOgesi {
  deger: string;
  etiket: ReactNode;
  /** Verilirse öğe bir bağlantıdır: bölüm adreste taşınıyorsa geri tuşu çalışsın. */
  href?: string;
  /** Sağda küçük sayı ("Kampanyalar 18"). */
  sayi?: number;
  /** Sağda kırmızı nokta: bu bölümde eksik ya da sorun var. */
  uyari?: boolean;
  /** Kullanılamayan bölüm: soluk ve tıklanmaz; nedeni `title`a yazılır. */
  kapaliNedeni?: string;
}

const OGE =
  'relative flex items-center justify-between gap-2 rounded-alan px-3 py-2.5 text-left text-13 no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ' +
  'max-[899px]:shrink-0 max-[899px]:whitespace-nowrap max-[899px]:rounded-full max-[899px]:py-2';

export function SayfaIcMenu({
  ogeler,
  secili,
  onSec,
  etiket,
}: {
  ogeler: IcMenuOgesi[];
  secili: string;
  onSec?: (deger: string) => void;
  /** Ekran okuyucu adı: "Marka Merkezi bölümleri". */
  etiket: string;
}) {
  const d = useSozluk(uiSozlugu);
  const ref = useRef<HTMLDivElement>(null);
  function tus(e: KeyboardEvent<HTMLDivElement>) {
    const ileri = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const geri = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    if (!ileri && !geri) return;
    const liste = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="tab"]:not([aria-disabled="true"])') ?? []);
    const i = liste.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    e.preventDefault();
    liste[(i + (ileri ? 1 : liste.length - 1)) % liste.length]?.focus();
  }
  return (
    <div
      ref={ref}
      role="tablist"
      aria-orientation="vertical"
      aria-label={etiket}
      onKeyDown={tus}
      className="flex flex-col gap-0.5 border-r border-line pr-2 min-[900px]:sticky min-[900px]:top-[76px] max-[899px]:flex-row max-[899px]:overflow-x-auto max-[899px]:border-b max-[899px]:border-r-0 max-[899px]:pb-2 max-[899px]:pr-0 [scrollbar-width:none]"
    >
      {ogeler.map((o) => {
        const acik = o.deger === secili;
        const kapali = Boolean(o.kapaliNedeni);
        const sinif = `${OGE} ${
          acik
            ? 'bg-surface-sunken font-bold text-ink min-[900px]:before:absolute min-[900px]:before:inset-y-2 min-[900px]:before:left-0 min-[900px]:before:w-[3px] min-[900px]:before:rounded-full min-[900px]:before:bg-brand max-[899px]:bg-ink max-[899px]:text-surface'
            : 'font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink'
        } ${kapali ? 'pointer-events-none opacity-40' : ''}`;
        const ic = (
          <>
            <span className="min-w-0">{o.etiket}</span>
            {o.uyari ? (
              <span aria-label={d.eksikVar} className="h-2 w-2 shrink-0 rounded-full bg-brand" />
            ) : o.sayi !== undefined ? (
              <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 text-11 font-bold tabular-nums text-ink-muted">
                {o.sayi}
              </span>
            ) : null}
          </>
        );
        const ortak = {
          role: 'tab' as const,
          'aria-selected': acik,
          'aria-disabled': kapali || undefined,
          title: o.kapaliNedeni,
          tabIndex: acik ? 0 : -1,
          className: sinif,
        };
        return o.href && !kapali ? (
          <Link key={o.deger} href={o.href} {...ortak} onClick={() => onSec?.(o.deger)}>
            {ic}
          </Link>
        ) : (
          <button key={o.deger} type="button" {...ortak} disabled={kapali} onClick={() => onSec?.(o.deger)}>
            {ic}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sayfa başlığının ALTINDA iki sütun: solda `SayfaIcMenu`, sağda içerik.
 * Başlık (`SayfaBasligi`) bunun DIŞINDA, tam genişlikte kalır.
 */
export function SayfaIcDuzen({ menu, children }: { menu: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-[212px_minmax(0,1fr)] min-[900px]:gap-7">
      <nav className="min-w-0 self-start min-[900px]:sticky min-[900px]:top-[76px]">{menu}</nav>
      <div className="grid min-w-0 content-start gap-5">{children}</div>
    </div>
  );
}
