'use client';

import Link from 'next/link';
import type { Permission } from '@advetics/shared';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Kenar çubuğu gezinmesi.
 *
 * İstemci bileşeni çünkü aktif öğeyi `usePathname` ile belirliyor. Sunucuda
 * yapmak, her sayfa için ayrı prop geçirmek demek olurdu.
 *
 * Henüz yazılmamış modüller GÖRÜNÜR ama pasif: yol haritası kullanıcıya belli
 * olsun, tıklanınca 404 almasın. Rozet hangi modülde geleceğini söylüyor.
 */

export interface NavEntry {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Bu öğeyi açan modül numarası. */
  module: number;
  /**
   * Modül numarasını EZEN hazır bayrağı.
   *
   * Bir modül birden fazla ekran getiriyor ve hepsi aynı anda bitmiyor:
   * Modül 5'in bütçe tablosu hazır, kural motoru değil. Modül numarasına
   * bakmak ikisini birlikte açardı ve Kurallar linki 404 verirdi.
   */
  ready?: boolean;
  /**
   * Bu öğeyi görmek için gereken yetki. Verilmezse öğe HERKESE görünür.
   *
   * OPT-IN, opt-out DEĞİL: yetki anahtarı yazılmamış bir öğe eskisi gibi
   * görünmeye devam ediyor. Tersi — "yetki yoksa gizle" — menüdeki her
   * satırın doğru anahtarla eşleşmesini gerektirirdi ve bir tanesini
   * atlamak, ajans çalışanından çalışan bir ekranı SESSİZCE gizlerdi.
   *
   * Anahtar `packages/shared/src/auth/roles.ts` matrisinden geliyor —
   * backend guard'larıyla AYNI kaynak. CLAUDE.md'nin kuralı bu: ikisinin
   * ayrışması, kullanıcıya tıklayabildiği ama 403 alacağı bir bağlantı
   * göstermek demek.
   */
  perm?: Permission;
}

// Modül 6 (Raporlar) hazır. Kurallar (5), Auto-Boost (7) ve Toplu Oluşturucu
// (8) hâlâ pasif — Modül 5'in yalnızca bütçe tarafı açık, `ready` ile.
const READY_MODULES = new Set([1, 2, 3, 4, 6]);

/**
 * Açılır-kapanır menü bölümü.
 *
 * AÇIK/KAPALI DURUM TARAYICIDA SAKLANIYOR ama ilk render SUNUCUYLA AYNI
 * olmak zorunda: `localStorage` doğrudan `useState` başlangıcında okunursa
 * sunucu "açık", istemci "kapalı" render eder ve React hydration uyarısı
 * verip ağacı atar. Bu yüzden depo `useEffect` içinde okunuyor.
 *
 * AKTİF SAYFANIN BÖLÜMÜ HER ZAMAN AÇIK — saklanan durum ne olursa olsun.
 * Kapalı bir bölümün içindeki sayfada duruyor olmak, kullanıcının menüde
 * nerede olduğunu göremediği bir hâl demek: "buraya nereden geldim" sorusunun
 * cevabı ekranda olmalı.
 */
function bolumAnahtari(title: string): string {
  return `advetics.nav.${title}`;
}

export function NavSection({ title, items }: { title?: string; items: NavEntry[] }) {
  const pathname = usePathname();

  const icinde = items.some(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );

  const [acik, setAcik] = useState(true);
  useEffect(() => {
    if (!title) return;
    const kayit = window.localStorage.getItem(bolumAnahtari(title));
    if (kayit !== null) setAcik(kayit === '1');
  }, [title]);

  function degistir(): void {
    if (!title) return;
    const yeni = !acik;
    setAcik(yeni);
    window.localStorage.setItem(bolumAnahtari(title), yeni ? '1' : '0');
  }

  // Başlıksız bölüm katlanmıyor: katlama denetimi başlığın kendisi.
  const gorunur = !title || acik || icinde;

  return (
    <div>
      {title && (
        <button
          type="button"
          onClick={degistir}
          aria-expanded={gorunur}
          className="flex w-full items-center gap-1.5 rounded-lg px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-muted transition hover:text-ink"
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
              gorunur ? 'rotate-90' : ''
            }`}
          >
            <path
              d="M7.5 5l5 5-5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="truncate">{title}</span>
        </button>
      )}
      {/*
        AÇILMA `grid-template-rows` İLE, `max-height` İLE DEĞİL. max-height
        yaklaşımı içeriğin yüksekliğini önceden bilmeyi gerektiriyor: tahmini
        değer küçük kalırsa liste kırpılıyor, büyük kalırsa animasyon
        kapanışta duraksıyor. 0fr → 1fr geçişi gerçek yüksekliği kullanıyor.
      */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          gorunur ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const ready = item.ready ?? READY_MODULES.has(item.module);
          const active = ready && (pathname === item.href || pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              {ready ? (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? 'bg-brand-soft font-semibold text-brand'
                      : 'text-ink hover:bg-surface-muted'
                  }`}
                >
                  <Icon name={item.icon} active={active} />
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  title={`Modül ${item.module} kapsamında gelecek`}
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted opacity-55"
                >
                  <Icon name={item.icon} />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium">
                    M{item.module}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
        </div>
      </div>
    </div>
  );
}

/** 20×20 stroke ikonlar — dış bağımlılık eklemeden tutarlı bir set. */
const ICONS = {
  overview: 'M3 10.5 10 4l7 6.5M5.5 9v7h9V9',
  explorer: 'M4 15V8m4 7V5m4 10v-4m4 4V9',
  rules: 'M4 6h12M4 10h7M4 14h9M15.5 12.5 17 14l-1.5 1.5',
  budget: 'M3 16V9m4 7V5m4 11v-5m4 5V7M2.5 16h15',
  create: 'M10 4v12M4 10h12',
  health: 'M3 11h3l2-5 3 9 2-4h4',
  fatigue: 'M4 15c2-6 5-9 12-10M4 15h4M4 15v-4',
  abtest: 'M6 4v12M14 4v12M4 8h4M12 12h4',
  leads: 'M10 10a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5M4 16.5c0-2.5 2.7-4.5 6-4.5s6 2 6 4.5',
  forms: 'M5 3h10v14H5zM7.5 7h5M7.5 10h5M7.5 13h3',
  assets: 'M3.5 5.5h13v9h-13zM3.5 12l3.5-3.5 3 3 2.5-2.5 3.5 3.5M12 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  audience: 'M7 9a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5M3 16c0-2.2 1.8-4 4-4s4 1.8 4 4M13 8.5a2 2 0 1 0 0-4M13.5 12.5c1.7.4 3 1.8 3 3.5',
  knowledge: 'M5 4.5h7l3 3v8h-10zM5 8h6M5 11h6M5 14h4',
  reports: 'M5.5 3.5h6l3.5 3.5v9.5h-9.5zM11.5 3.5V7H15',
  boost: 'M10 3.5 4.5 12h4L8 16.5 15.5 8h-4z',
  bulk: 'M4 5.5h5v5H4zM11 5.5h5v5h-5zM4 12.5h5v3H4zM11 12.5h5v3h-5z',
  plug: 'M8 3v4M12 3v4M6.5 7h7v3a3.5 3.5 0 0 1-7 0zM10 13.5V17',
  team: 'M7.5 9a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5M3.5 16c0-2.2 1.8-4 4-4s4 1.8 4 4M13 7.5a2 2 0 1 0 0-4M13.5 12c1.7.4 3 1.9 3 3.7',
  clients: 'M4.5 16V6l4-2.5V16M4.5 16h11V9l-7-3M11 11h2M11 13.5h2',
  brand: 'M10 3.5 12 8l4.5.5-3.3 3.1.8 4.4L10 14l-4 2 .8-4.4L3.5 8.5 8 8z',
  audit: 'M10 4.5v11M4.5 10h11M6.5 6.5l7 7M13.5 6.5l-7 7',
} as const;

function Icon({ name, active }: { name: keyof typeof ICONS; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-brand' : 'text-ink-muted'}`}
    >
      <path
        d={ICONS[name]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
