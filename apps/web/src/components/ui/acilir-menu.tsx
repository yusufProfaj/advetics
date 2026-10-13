'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

/**
 * ═══ TEK AÇILIR MENÜ (menü kararı 2026-10-14, `docs/marka/menu-sistemi.html`) ═══
 *
 * Kapsam seçici, "+ Oluştur", kullanıcı menüsü, bildirim zili ve satır ⋯
 * menüleri ayrı ayrı yazılmıştı: biri Esc ile kapanıyordu biri kapanmıyordu,
 * biri koşullu render edildiği için kapanırken bir karede yok oluyordu, hiçbiri
 * ok tuşlarıyla gezilmiyordu. Hepsi bu bileşenden geçer.
 *
 * DAVRANIŞ:
 * - Panel DOM'DA KALIR (CLAUDE.md §3): kapalıyken görünmez + `inert`, açılıp
 *   kapanma opaklık ve 4 piksellik kaymayla (0,14 sn). Hareket azaltılmışsa
 *   geçiş yok.
 * - Esc kapatır ve odağı tetiğe geri verir; dışarı tıklamak kapatır.
 * - ↓/↑ öğeler arasında gezer (Home/End uçlara); klavyeyle açılınca ilk öğe
 *   odaklanır.
 * - Bir öğe seçilince menü kendiliğinden kapanır (`MenuOgesi` bağlamdan
 *   kapatıcıyı alıyor).
 *
 * KONUM: tetiğe göre `absolute`, `fixed` DEĞİL. Kenar çubuğu ve üst bar
 * `backdrop-filter` taşıyor ve `fixed` bir çocuk onların kutusuna hapsolurdu
 * (`yukleniyor.tsx` "PORTAL ZORUNLU"); `absolute` zaten o kutuya göre
 * konumlanıyor, yani aynı hesap iki durumda da doğru.
 *
 * DENETİMLİ YA DA DENETİMSİZ: `acik` + `onAcikDegis` verilirse durum
 * çağıranın (kapsam seçici, geçiş sırasında menüyü kendisi kapatıyor);
 * verilmezse bileşen kendi durumunu tutar.
 */
interface Baglam {
  kapat: () => void;
}
const AcilirBaglam = createContext<Baglam | null>(null);

export interface TetikOzellikleri {
  ref: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-controls': string;
}

export function AcilirMenu({
  tetik,
  children,
  etiket,
  hizala = 'sol',
  yon = 'asagi',
  genislik = 'w-60',
  rol = 'menu',
  acik: disAcik,
  onAcikDegis,
  sinif = '',
}: {
  /** Tetik düğmesini çizer; verilen özellikleri `<button>`a yayar. */
  tetik: (o: TetikOzellikleri & { acik: boolean }) => ReactNode;
  children: ReactNode;
  /** Ekran okuyucu adı: "Oluştur", "Bildirimler". */
  etiket: string;
  hizala?: 'sol' | 'sag';
  yon?: 'asagi' | 'yukari';
  /** Tailwind genişlik sınıfı: `w-60`, `w-[340px]`, `w-full`. */
  genislik?: string;
  /** `menu` yalnız öğelerden oluşan listeler; zengin içerik (arama, bildirim listesi) `dialog`. */
  rol?: 'menu' | 'dialog';
  acik?: boolean;
  onAcikDegis?: (acik: boolean) => void;
  /** Kap öğesine ek sınıf (`w-full` gibi). */
  sinif?: string;
}) {
  const [icAcik, setIcAcik] = useState(false);
  const acik = disAcik ?? icAcik;
  const kutu = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tetikRef = useRef<HTMLButtonElement | null>(null);
  const klavyeyle = useRef(false);
  const kimlik = useId();

  const degistir = useCallback(
    (v: boolean) => {
      if (disAcik === undefined) setIcAcik(v);
      onAcikDegis?.(v);
    },
    [disAcik, onAcikDegis],
  );
  const kapat = useCallback(() => degistir(false), [degistir]);

  const ogeler = () =>
    Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!acik) return;
    function disari(e: MouseEvent) {
      if (kutu.current && !kutu.current.contains(e.target as Node)) degistir(false);
    }
    function tus(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        degistir(false);
        tetikRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', tus);
    /*
     * ARAMA KUTUSU VARSA her açılışta oraya (kapsam seçici: açan kişi bir ad
     * yazacak). Yoksa yalnız klavyeyle açılınca ilk öğeye; fareyle açılan
     * menüde odağı taşımak, tetiğin odak halkasını boşuna söndürürdü.
     * `autoFocus` kullanılamıyor: panel DOM'da kaldığı için sayfa açılır
     * açılmaz odağı çalardı.
     */
    const girdi = panel.current?.querySelector<HTMLInputElement>('input');
    if (girdi) {
      girdi.focus();
    } else if (klavyeyle.current) {
      const ilk = ogeler()[0] ?? panel.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]') ?? null;
      ilk?.focus();
    }
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', tus);
    };
  }, [acik, degistir]);

  function panelTus(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const liste = ogeler();
    if (liste.length === 0) return;
    e.preventDefault();
    const i = liste.indexOf(document.activeElement as HTMLElement);
    const j =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? liste.length - 1
          : e.key === 'ArrowDown'
            ? (i + 1) % liste.length
            : (i - 1 + liste.length) % liste.length;
    liste[j]?.focus();
  }

  const konum = [
    hizala === 'sag' ? 'right-0' : 'left-0',
    yon === 'yukari' ? 'bottom-full mb-1.5 origin-bottom' : 'top-full mt-1.5 origin-top',
  ].join(' ');

  return (
    <div ref={kutu} className={`relative ${sinif}`}>
      {tetik({
        acik,
        ref: (el) => {
          tetikRef.current = el;
        },
        onClick: () => {
          klavyeyle.current = false;
          degistir(!acik);
        },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            klavyeyle.current = true;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              degistir(true);
            }
          }
        },
        'aria-expanded': acik,
        'aria-haspopup': rol,
        'aria-controls': kimlik,
      })}
      <div
        ref={panel}
        id={kimlik}
        role={rol}
        aria-label={etiket}
        inert={!acik}
        onKeyDown={panelTus}
        className={`absolute z-40 ${konum} ${genislik} max-w-[calc(100vw-1.5rem)] rounded-[14px] border border-line bg-surface p-1.5 text-ink shadow-acilir transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none ${
          acik ? 'visible translate-y-0 opacity-100' : `invisible opacity-0 ${yon === 'yukari' ? 'translate-y-1' : '-translate-y-1'}`
        }`}
      >
        <AcilirBaglam.Provider value={{ kapat }}>{children}</AcilirBaglam.Provider>
      </div>
    </div>
  );
}

/** Menünün içindeki kapatıcı: zengin içerikte (bildirim bağlantısı) seçimden sonra kapatmak için. */
export function useAcilirMenuKapat(): () => void {
  return useContext(AcilirBaglam)?.kapat ?? (() => undefined);
}

const OGE =
  'flex w-full min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] font-semibold no-underline outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken';

/**
 * Menü öğesi: ikon + ad (+ bir satır açıklama) (+ sağda gri ipucu).
 * Tehlikeli eylem (Arşivle, Çıkış) EN ALTTA, ayraçtan sonra ve kırmızı.
 */
export function MenuOgesi({
  ikon,
  children,
  aciklama,
  ip,
  tehlike = false,
  secili = false,
  href,
  onClick,
  devreDisi = false,
}: {
  ikon?: ReactNode;
  children: ReactNode;
  aciklama?: ReactNode;
  ip?: ReactNode;
  tehlike?: boolean;
  secili?: boolean;
  href?: string;
  onClick?: () => void;
  devreDisi?: boolean;
}) {
  const kapat = useAcilirMenuKapat();
  const sinif = `${OGE} ${tehlike ? 'text-danger-strong' : 'text-ink'} ${secili ? 'bg-vurgu' : ''} ${
    devreDisi ? 'cursor-not-allowed opacity-40 hover:bg-transparent' : ''
  }`;
  const ic = (
    <>
      {ikon && (
        <span aria-hidden className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center ${tehlike ? '' : 'text-ink-muted'}`}>
          {ikon}
        </span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate">{children}</span>
        {aciklama && <small className="block text-[11.5px] font-normal text-ink-muted">{aciklama}</small>}
      </span>
      {ip && <span className="ml-auto shrink-0 text-12 font-normal text-ink-soluk">{ip}</span>}
      {secili && (
        <svg viewBox="0 0 24 24" aria-hidden className="ml-1 h-4 w-4 shrink-0 text-brand-strong" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12l5 5 9-10" />
        </svg>
      )}
    </>
  );
  if (href && !devreDisi) {
    return (
      <Link
        href={href}
        role="menuitem"
        aria-current={secili ? 'true' : undefined}
        className={sinif}
        onClick={() => {
          onClick?.();
          kapat();
        }}
      >
        {ic}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={devreDisi || undefined}
      className={sinif}
      onClick={() => {
        if (devreDisi) return;
        onClick?.();
        kapat();
      }}
    >
      {ic}
    </button>
  );
}

export function MenuAyraci() {
  return <div role="separator" className="mx-1 my-1.5 h-px bg-line" />;
}

export function MenuBasligi({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1.5 pt-2.5 text-11 font-bold uppercase leading-none tracking-[0.08em] text-ink-soluk">
      {children}
    </div>
  );
}

/** Üst çubuğun ve ⋯ menülerinin yuvarlak ikon tetiği (36 piksel). */
export const IKON_TETIK =
  'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-expanded:bg-surface-sunken aria-expanded:text-ink';
