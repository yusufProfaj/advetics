import type { ReactNode } from 'react';
import type { StratejiOlusturmaAdimi } from '@advetics/shared';
import { Dugme } from '@/components/ui/dugme';
import { rayParcalari } from './akis';

/**
 * ═══ ADIM ADIM AKIŞIN ÇERÇEVESİ (taslak `simulasyon.html`) ═══
 *
 * Üstte yedi parçalı ilerleme rayı, ortada TEK soru, altta yapışkan eylem
 * çubuğu (Geri · not · Devam). Google Ads'in kampanya kurulumu mantığı:
 * kullanıcı hangi adımda olduğunu ve kaç adım kaldığını her an görür.
 *
 * Çubuk `fixed` değil `sticky`: panelin kenar çubuğu açıkken sabit bir çubuk
 * onun üstüne binerdi. Ray parçasının dolması `motion-safe` altında; hareket
 * duyarlı kullanıcıda parça doğrudan dolu görünür.
 */
export function IlerlemeRayi({ adim }: { adim: StratejiOlusturmaAdimi }) {
  const parcalar = rayParcalari(adim);
  return (
    <nav aria-label="Strateji oluşturma adımları">
      <ol className="m-0 flex list-none gap-1.5 p-0">
        {parcalar.map((p, i) => (
          <li key={p.adim} className="min-w-0 flex-1" aria-current={p.hal === 'simdi' ? 'step' : undefined}>
            <span className="relative block h-1 overflow-hidden rounded-full bg-ink/10">
              <span
                className={`absolute inset-0 origin-left motion-safe:transition-transform motion-safe:duration-300 ${p.hal === 'simdi' ? 'scale-x-100 bg-brand' : p.hal === 'bitti' ? 'scale-x-100 bg-ink' : 'scale-x-0 bg-ink'}`}
              />
            </span>
            <span className={`mt-1.5 hidden truncate text-[11.5px] sm:block ${p.hal === 'sirada' ? 'text-ink-muted' : 'font-semibold text-ink'}`}>
              {i + 1} · {p.etiket}
            </span>
          </li>
        ))}
      </ol>
      <span className="mt-1.5 block text-[11.5px] font-semibold text-ink sm:hidden">
        {parcalar.findIndex((p) => p.hal === 'simdi') + 1} / {parcalar.length} · {parcalar.find((p) => p.hal === 'simdi')?.etiket}
      </span>
    </nav>
  );
}

/** Ekranın tek sorusu: küçük kırmızı üst başlık, büyük soru, bir satır açıklama. */
export function SoruBasligi({ ust, soru, aciklama }: { ust: string; soru: string; aciklama?: ReactNode }) {
  return (
    <header className="mb-6">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-brand-strong">{ust}</span>
      <h2 className="font-baslik m-0 mt-1.5 max-w-[24ch] text-2xl font-extrabold tracking-tight text-ink [text-wrap:balance] sm:text-[30px] sm:leading-tight">{soru}</h2>
      {aciklama && <p className="m-0 mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-muted">{aciklama}</p>}
    </header>
  );
}

/**
 * Alt eylem çubuğu. "Devam" KAPALIYSA nedeni notta yazar (giriş anında
 * doğrulama): kullanıcı düğmenin neden basılmadığını aramamalı.
 */
export function AltCubuk({
  geri,
  not,
  devam,
  ek,
}: {
  geri: { etiket?: string; onClick: () => void } | null;
  not?: ReactNode;
  devam: { etiket: string; onClick: () => void; kapali?: boolean; bekliyor?: boolean } | null;
  ek?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-8 border-t border-line bg-surface px-5 py-3 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-2.5">
        {geri && (
          <Dugme ton="ikincil" onClick={geri.onClick}>
            ← {geri.etiket ?? 'Geri'}
          </Dugme>
        )}
        {not && <span className="min-w-0 flex-1 text-[13px] text-ink-muted max-sm:order-last max-sm:basis-full">{not}</span>}
        {!not && <span className="flex-1" />}
        {ek}
        {devam && (
          <Dugme onClick={devam.onClick} disabled={devam.kapali} bekliyor={devam.bekliyor}>
            {devam.etiket}
          </Dugme>
        )}
      </div>
    </div>
  );
}

/** Büyük seçim kartı (giriş ve gönder ekranı): ikon karosu, başlık, açıklama, alt bilgi. */
export function BuyukKart({
  ikon,
  kirmizi = false,
  baslik,
  aciklama,
  altSol,
  altSag,
}: {
  ikon: 'rapor' | 'yeni';
  kirmizi?: boolean;
  baslik: string;
  aciklama: ReactNode;
  altSol: ReactNode;
  altSag: ReactNode;
}) {
  return (
    <span className="grid h-full content-start gap-3">
      <span className={`grid h-12 w-12 place-items-center rounded-xl text-white ${kirmizi ? 'bg-brand' : 'bg-[#302e2d]'}`} aria-hidden>
        {ikon === 'rapor' ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 18l6-6 4 4 6-8 M14 8h6v6" />
          </svg>
        )}
      </span>
      <span className="font-baslik text-[22px] font-bold text-ink">{baslik}</span>
      <span className="text-sm leading-relaxed text-ink-muted">{aciklama}</span>
      <span className="mt-auto flex justify-between gap-2.5 border-t border-line pt-3 text-[13px] text-ink-muted">
        <span className="min-w-0">{altSol}</span>
        <span className="shrink-0 font-bold text-ink">{altSag}</span>
      </span>
    </span>
  );
}

/** Büyük kartın tıklanabilir kabı: kenar koyulaşır, hafif kalkar (hareket yalnız `motion-safe`). */
export const BUYUK_KART_SINIFI =
  'block min-h-[15.5rem] rounded-2xl border border-line bg-surface p-6 text-left no-underline hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-safe:transition-[border-color,transform,box-shadow] motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] max-sm:min-h-0';

/** Kırmızı sol çizgili not kutusu (taslağın `.not-kutu`). */
export function NotKutusu({ children }: { children: ReactNode }) {
  return <div className="my-4 rounded-r-[10px] border-l-[3px] border-l-brand bg-ink/[0.04] px-3.5 py-3 text-sm text-ink">{children}</div>;
}
