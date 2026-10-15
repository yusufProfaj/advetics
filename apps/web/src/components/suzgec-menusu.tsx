'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSozluk } from '@/dil/saglayici';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';
import { AcilirMenu, MenuOgesi } from '@/components/ui/acilir-menu';

export interface SuzgecSecenegi {
  /** Bağlantı (süzgeç adreste) YA DA `onSec` (süzgeç ekranın durumunda). */
  href?: string;
  onSec?: () => void;
  ad: string;
  /** Seçeneğin kaç kayıt taşıdığı; yoksa basılmıyor. */
  sayi?: number;
  aktif: boolean;
  ton?: 'tehlike';
  /** Sağda küçük bir ek (ör. sıralama yönü). */
  ek?: string;
}

/**
 * ═══ SÜZGEÇ ÇİPİ: ETİKETLİ AÇILIR MENÜ (referans "04 · Tablo") ═══
 *
 * Reklam Keşfi'nde hesap, durum, kampanya ve sıralama dört satır ÇİP
 * olarak duruyordu; uzun hesap ve kampanya adları satırları ikiye üçe
 * bölüyor ve süzgeç kutusu ilk ekranın yarısını kaplıyordu. Her boyut tek
 * çip: `Etiket: seçili değer ▾`, tablonun üstündeki araç çubuğunda. Seçenekler
 * sayılarıyla açılır listede. Bağlantılar sunucuda kuruluyor (`linkWith`),
 * yani adres süzgeci taşımaya devam ediyor; bu bileşen yalnız aç/kapa ve arama.
 *
 * AÇILIR KATMAN ORTAK BİLEŞENDEN (`AcilirMenu`): eski sürüm listeyi koşullu
 * çiziyordu (`acik && …`) ve kapanırken bir karede yok oluyordu; ok
 * tuşlarıyla da gezilmiyordu (CLAUDE.md §3 "açılıp kapanan öğe DOM'dan
 * çıkmaz").
 *
 * ETİKET KALDI: çip "Tümü" dediğinde neyin tümü olduğu yazmalı.
 *
 * ARAMA ÇOK SEÇENEKTE: kırk kampanyalık bir listede kaydırarak aramak
 * yerine yazılıyor. SESSİZ KESME YOK: liste kesilmiyor, kaydırılıyor ve
 * arama sonucu "3 / 43" diye kaç tanesinin göründüğünü yazıyor.
 *
 * ✕ AYRI DÜĞME: varsayılandan farklı bir seçim varsa çipin sağında tek
 * tıkla kaldırılır (referanstaki "Durum: Yayında ✕"); menüyü açıp "Tümü"
 * aramak gerekmiyor.
 */
export function SuzgecMenusu({
  etiket,
  deger,
  secili,
  secenekler,
  aramaEsigi = 10,
  kaldirHref,
  onKaldir,
  ton,
}: {
  etiket: string;
  /** Çipte görünen seçili değerin adı. */
  deger: string;
  /** Varsayılandan farklı bir seçim var mı (✕ çıkıyor). */
  secili: boolean;
  secenekler: SuzgecSecenegi[];
  aramaEsigi?: number;
  /** ✕ bağlantısı (süzgeç adreste). */
  kaldirHref?: string;
  /** ✕ eylemi (süzgeç ekranın durumunda). */
  onKaldir?: () => void;
  /** `tehlike`: "Sorunlu" gibi dikkat isteyen çip, kırmızı yazı. */
  ton?: 'tehlike';
}) {
  const [ara, setAra] = useState('');
  const s = useSozluk(kabukSozlugu).suzgec;
  const aramali = secenekler.length > aramaEsigi;
  const gorunen = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr-TR');
    return q ? secenekler.filter((s) => s.ad.toLocaleLowerCase('tr-TR').includes(q)) : secenekler;
  }, [ara, secenekler]);

  const kaldirSinifi =
    '-ml-1 mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-12 text-ink-muted no-underline hover:bg-surface hover:text-ink';

  return (
    <span
      className="inline-flex max-w-full items-center rounded-full bg-surface-sunken text-ink"
    >
      <AcilirMenu
        etiket={etiket}
        rol={aramali ? 'dialog' : 'menu'}
        genislik="w-[min(22rem,calc(100vw-2rem))]"
        onAcikDegis={(a) => a && setAra('')}
        tetik={({ acik, ...o }) => (
          <button
            type="button"
            {...o}
            className={`inline-flex h-[30px] max-w-[17rem] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              ton === 'tehlike' && !secili ? 'text-danger-strong' : ''
            }`}
          >
            <span className="font-semibold text-ink-muted">{etiket}:</span>
            <b className="min-w-0 truncate" title={deger}>
              {deger}
            </b>
            <span aria-hidden className={`text-[10px] transition-transform motion-reduce:transition-none ${acik ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </button>
        )}
      >
        {aramali && (
          <div className="border-b border-line px-1 pb-2 pt-1">
            <input
              type="search"
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              placeholder={s.ara(etiket)}
              aria-label={s.ara(etiket)}
              className="h-8 w-full rounded-alan border border-line-strong bg-surface px-2.5 text-13 text-ink placeholder:text-ink-soluk"
            />
            <p className="mt-1 px-0.5 text-11 text-ink-muted">
              {s.gosteriliyor(gorunen.length, secenekler.length)}
            </p>
          </div>
        )}
        <div className="max-h-[20rem] overflow-y-auto pt-1">
          {gorunen.length === 0 ? (
            <p className="m-0 px-2.5 py-2 text-12 text-ink-muted">{s.eslesmeYok(ara)}</p>
          ) : (
            gorunen.map((s) => (
              <MenuOgesi
                key={s.href ?? s.ad}
                href={s.href}
                onClick={s.onSec}
                secili={s.aktif}
                tehlike={s.ton === 'tehlike'}
                ip={s.ek ?? (s.sayi !== undefined ? String(s.sayi) : undefined)}
              >
                <span title={s.ad}>{s.ad}</span>
              </MenuOgesi>
            ))
          )}
        </div>
      </AcilirMenu>
      {secili && kaldirHref && (
        <Link href={kaldirHref} aria-label={s.kaldir(etiket)} className={kaldirSinifi}>
          ✕
        </Link>
      )}
      {secili && !kaldirHref && onKaldir && (
        <button type="button" onClick={onKaldir} aria-label={s.kaldir(etiket)} className={kaldirSinifi}>
          ✕
        </button>
      )}
    </span>
  );
}

/**
 * ═══ BÖLÜMLÜ SEÇİCİ, BAĞLANTI OLARAK (BILESENLER "Grup 1 sapması") ═══
 *
 * `BolumluSecici` ile AYNI görünüş (gri hap içinde hap seçenekler) ama her
 * seçenek bir BAĞLANTI: Genel Bakış ve Reklam Galerisi'nde platform süzgeci
 * adreste taşınıyor ve sayfa sunucuda çiziliyor; `onSec` bir sunucu
 * bileşeninden verilemiyor. Ortak bileşen `href` almıyor, o yüzden bu küçük
 * yardımcı burada. Sınıflar `ui/sekmeler.tsx` `BolumluSecici`den birebir:
 * ortak bileşen değişirse burası da değişmeli.
 */
export function BolumluBaglantilar({
  secenekler,
  etiket,
}: {
  secenekler: Array<{ href: string; etiket: string; secili: boolean }>;
  etiket: string;
}) {
  return (
    <nav
      aria-label={etiket}
      className="inline-flex max-w-full overflow-x-auto rounded-full bg-surface-sunken p-[3px] [scrollbar-width:none]"
    >
      {secenekler.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={s.secili ? 'page' : undefined}
          className={`inline-flex h-[30px] items-center whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-bold no-underline transition-colors ${
            s.secili ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {s.etiket}
        </Link>
      ))}
    </nav>
  );
}

/**
 * ═══ SAYILI SEÇİM ÇİPİ (taslak `.cip.secim-cip`, BILESENLER "Grup 1 sapması") ═══
 *
 * Durum süzgeci: "Tümü 37 · Yeni 12 · Görüştük 9 …" tek sıra, seçili çip
 * SİYAH dolu. `Cip` uygulanmış bir süzgeci (✕ ile) gösteriyor, `BolumluSecici`
 * iki-dört görünüm arasında geçiyor; sayıları taşıyan beş-altı seçenekli
 * süzgeç ikisine de uymuyor ve ortak bileşende karşılığı yok.
 */
export function SecimCipi({
  secili,
  sayi,
  onClick,
  title,
  children,
}: {
  secili: boolean;
  sayi?: number;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={secili}
      title={title}
      onClick={onClick}
      className={`inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        secili ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {children}
      {sayi !== undefined && <span className="text-11 tabular-nums opacity-75">{sayi}</span>}
    </button>
  );
}

/** "1 - 25 / 118  ‹ ›" sayfalaması, BAĞLANTI olarak (sunucu sayfası; `SayfalamaCubugu` yalnız `onClick` alıyor). */
export function SayfalamaBaglantilari({
  bas,
  son,
  toplam,
  oncekiHref,
  sonrakiHref,
  sol,
}: {
  bas: number;
  son: number;
  toplam: number;
  oncekiHref: string | null;
  sonrakiHref: string | null;
  /** Solda duran not ya da bağlantı. */
  sol?: React.ReactNode;
}) {
  const s = useSozluk(kabukSozlugu).suzgec;
  const ok =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-ink no-underline transition-colors hover:bg-surface-sunken';
  return (
    <nav aria-label={s.sayfalama} className="flex flex-wrap items-center justify-end gap-4 px-4 py-2.5 text-[12.5px] text-ink-muted">
      {sol && <span className="mr-auto">{sol}</span>}
      <span className="tabular-nums">
        {toplam === 0 ? '0' : `${bas} - ${son}`} / {toplam}
      </span>
      {(oncekiHref || sonrakiHref) && (
        <span className="flex items-center gap-1">
          {oncekiHref ? (
            <Link href={oncekiHref} className={ok} aria-label={s.onceki}>
              ‹
            </Link>
          ) : (
            <span className={`${ok} opacity-40`} aria-hidden>
              ‹
            </span>
          )}
          {sonrakiHref ? (
            <Link href={sonrakiHref} className={ok} aria-label={s.sonraki}>
              ›
            </Link>
          ) : (
            <span className={`${ok} opacity-40`} aria-hidden>
              ›
            </span>
          )}
        </span>
      )}
    </nav>
  );
}
