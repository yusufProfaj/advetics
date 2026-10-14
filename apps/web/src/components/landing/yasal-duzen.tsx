import Link from 'next/link';
import type { ReactNode } from 'react';

import { YASAL_BELGELER } from './site-icerik';
import { TanitimBasligi, UstBaslik } from './site-parcalari';

/**
 * ═══ YASAL SAYFA DÜZENİ ═══ (onaylı taslak, `.yasal`)
 *
 * Solda yapışkan "Bu sayfada" içindekiler ve "Yasal belgeler" menüsü,
 * sağda makale: üst başlık, başlık, son güncelleme, özet kutusu, bölümler.
 *
 * İÇİNDEKİLER VE BAŞLIKLAR TEK LİSTEDEN. Sayfa bölümlerini bir kez
 * tanımlıyor (`{ id, baslik }`), hem soldaki bağlantı hem `YasalBolum`un
 * başlığı onu okuyor. Ayrı yazılsalardı bir bölümün adı değişince
 * içindekiler eski adı gösterir ya da bağlantı boşa düşerdi.
 *
 * SUNUCU BİLEŞENİ, JAVASCRIPT YOK: Meta App Review ve Google OAuth
 * crawler'ları bu sayfaları okuyor ve metin HTML'de olmalı. Aktif bölümü
 * izleyen bir kaydırma takibi bilerek yazılmadı; bağlantılar düz çapa.
 */
export interface YasalBaslik {
  id: string;
  baslik: string;
}

export function YasalDuzen({
  yol,
  baslik,
  guncelleme,
  ozet,
  bolumler,
  ingilizce = true,
  children,
}: {
  /** Sayfanın kendi adresi: "Yasal belgeler" menüsünde işaretleniyor. */
  yol: string;
  baslik: string;
  guncelleme: string;
  ozet: ReactNode;
  bolumler: YasalBaslik[];
  /** Sayfanın sonunda `#english` bölümü var mı. */
  ingilizce?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="kap yasal">
      <nav aria-label="Bu sayfada">
        <span className="etiket">Bu sayfada</span>
        {bolumler.map((b) => (
          <a key={b.id} href={`#${b.id}`}>
            {b.baslik.replace(/^\d+\.\s*/, '')}
          </a>
        ))}
        {ingilizce && <a href="#english">English</a>}
        <div className="belgeler">
          <span className="etiket">Yasal belgeler</span>
          {YASAL_BELGELER.map((y) => (
            <Link key={y.href} href={y.href} aria-current={y.href === yol ? 'page' : undefined}>
              {y.etiket}
            </Link>
          ))}
        </div>
      </nav>
      <article>
        <UstBaslik>Yasal</UstBaslik>
        <TanitimBasligi boy="yasal">{baslik}</TanitimBasligi>
        <p className="tarih">
          Son güncelleme: {guncelleme}
          {ingilizce && (
            <>
              {' · '}
              <a href="#english">English</a>
            </>
          )}
        </p>
        <div className="ozet-kutu">
          <b>Kısaca:</b> {ozet}
        </div>
        {children}
      </article>
    </div>
  );
}

/** Bir bölüm: başlığı ve çapası içindekilerle AYNI nesneden. */
export function YasalBolum({ b, children }: { b: YasalBaslik; children: ReactNode }) {
  return (
    <section>
      <h2 id={b.id}>{b.baslik}</h2>
      {children}
    </section>
  );
}

/** İngilizce bölümün başlığı (`#english` çapası). */
export function IngilizceBaslik({ children }: { children: ReactNode }) {
  return (
    <h2 id="english" className="dil-basligi">
      {children}
    </h2>
  );
}

/** İngilizce bölümün alt başlığı: içindekilerde yer almıyor, tek "English" çapası yetiyor. */
export function YasalAltBolum({ baslik, children }: { baslik: string; children: ReactNode }) {
  return (
    <section>
      <h3>{baslik}</h3>
      {children}
    </section>
  );
}
