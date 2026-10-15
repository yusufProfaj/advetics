'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * ═══ ETKİN SATIR GÖRÜNÜR ALANDA ═══
 *
 * 800 piksel yükseklikte menü kayıyor ve son bölüm (Base) ekranın altında
 * kalıyordu; o bölümdeki bir sayfadayken etkin satır alt kenardaki solmanın
 * ALTINDA duruyordu (canlı denetim): kullanıcı nerede olduğunu menüde
 * göremiyordu. Adres değişince etkin satır (`aria-current="page"`) en yakın
 * kenara kaydırılıyor; `scroll-pb-8` solmanın yüksekliği kadar pay bırakıyor.
 * `block: 'nearest'`: satır zaten görünürse menü KIPIRDAMIYOR.
 */
export function etkinSatiriGoster(kap: HTMLElement | null): void {
  const satir = kap?.querySelector<HTMLElement>('[aria-current="page"]');
  satir?.scrollIntoView({ block: 'nearest' });
}

export function KaydirilanMenu({ className, onClick, children }: { className: string; onClick?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const yol = usePathname();
  useEffect(() => {
    etkinSatiriGoster(ref.current);
  }, [yol]);
  return (
    <nav ref={ref} aria-label="Ana menü" className={className} onClick={onClick}>
      {children}
    </nav>
  );
}
