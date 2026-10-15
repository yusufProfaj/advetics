import type { ReactNode } from 'react';
import { UiMetni } from './ui-metni';
import { Dugme } from './dugme';

/**
 * ═══ SİHİRBAZ PARÇALARI (referans "07 · Sihirbaz", `docs/advstrategy/simulasyon.html`) ═══
 *
 * Panelde üç ayrı sihirbaz dili vardı (AdvStrategy'nin adım adım akışı,
 * AdvCampaign rehberi, kurulum) ve kullanıcı yalnız birini beğendi:
 * simülasyondaki "tek soru, büyük seçim, alt çubuk". Parçalar oradan
 * (`strateji/v2/akis-cerceve.tsx`) çıkarıldı ve adım türünden
 * bağımsızlaştırıldı. Oluşturma akışlarının HEPSİ bu iskeleti kullanır:
 * üstte ilerleme rayı, ortada tek soru, altta Geri · not · Devam.
 *
 * BİRİNCİL EYLEM ALT ÇUBUĞUN SAĞINDA, başka yerde kırmızı dolu düğme yok.
 */

export interface RayParcasi {
  anahtar: string;
  etiket: string;
  hal: 'bitti' | 'simdi' | 'sirada';
}

/**
 * Parçalı ilerleme rayı: biten adım SİYAH, şimdiki KIRMIZI, sıradaki gri.
 * Kullanıcı hangi adımda olduğunu ve kaç adım kaldığını her an görür.
 */
export function IlerlemeRayi({ parcalar, etiket }: { parcalar: RayParcasi[]; etiket?: string }) {
  const simdi = parcalar.findIndex((p) => p.hal === 'simdi');
  return (
    <nav aria-label={etiket}>
      {etiket === undefined && (
        <span className="sr-only">
          <UiMetni k="adimlar" />
        </span>
      )}
      <ol className="m-0 flex list-none gap-1.5 p-0">
        {parcalar.map((p, i) => (
          <li key={p.anahtar} className="min-w-0 flex-1" aria-current={p.hal === 'simdi' ? 'step' : undefined}>
            <span className="relative block h-1 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className={`absolute inset-0 origin-left motion-safe:transition-transform motion-safe:duration-300 ${
                  p.hal === 'simdi' ? 'scale-x-100 bg-brand' : p.hal === 'bitti' ? 'scale-x-100 bg-ink' : 'scale-x-0 bg-ink'
                }`}
              />
            </span>
            <span
              className={`mt-1.5 hidden truncate text-[11.5px] sm:block ${
                p.hal === 'sirada' ? 'text-ink-muted' : 'font-semibold text-ink'
              }`}
            >
              {i + 1} · {p.etiket}
            </span>
          </li>
        ))}
      </ol>
      {simdi >= 0 && (
        <span className="mt-1.5 block text-[11.5px] font-semibold text-ink sm:hidden">
          {simdi + 1} / {parcalar.length} · {parcalar[simdi]?.etiket}
        </span>
      )}
    </nav>
  );
}

/** Ekranın tek sorusu: kırmızı küçük harfli üst başlık ("3 / 7 · Bölge"), büyük soru, bir satır açıklama. */
export function Soru({ ust, soru, aciklama }: { ust: string; soru: string; aciklama?: ReactNode }) {
  return (
    <header className="mb-6">
      <span className="text-12 font-bold uppercase tracking-[0.08em] text-brand-strong">{ust}</span>
      <h2 className="font-baslik m-0 mt-1.5 max-w-[24ch] text-24 font-extrabold tracking-tight text-ink [text-wrap:balance] sm:text-[26px] sm:leading-tight">
        {soru}
      </h2>
      {aciklama && <p className="m-0 mt-2 max-w-[62ch] text-14 leading-relaxed text-ink-muted">{aciklama}</p>}
    </header>
  );
}

/**
 * Büyük seçim kartı (referans `.secim`): ikon karosu (gri; `kirmizi` ise
 * marka kırmızısı), 18 piksellik başlık, açıklama. Üzerine gelince kenar
 * siyaha döner ve iki piksel kalkar; seçiliyken kenar kırmızı.
 */
export function SecimKarti({
  ikon,
  kirmizi = false,
  baslik,
  aciklama,
  alt,
  secili = false,
  onClick,
  disabled,
}: {
  ikon: ReactNode;
  kirmizi?: boolean;
  baslik: ReactNode;
  aciklama: ReactNode;
  /** Kartın altında çizgiyle ayrılan bilgi satırı ("7 soru · ~5 dakika"). */
  alt?: ReactNode;
  secili?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={secili}
      className={`grid h-full content-start gap-2.5 rounded-kart border bg-surface p-[22px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 motion-safe:transition-[border-color,transform] motion-safe:duration-150 enabled:hover:border-ink motion-safe:enabled:hover:-translate-y-0.5 ${
        secili ? 'border-brand' : 'border-line'
      }`}
    >
      <span
        aria-hidden
        className={`grid h-11 w-11 place-items-center rounded-[12px] font-baslik text-15 font-extrabold text-white ${
          kirmizi ? 'bg-brand' : 'bg-[var(--gri)]'
        }`}
      >
        {ikon}
      </span>
      <span className="font-baslik text-18 font-bold text-ink">{baslik}</span>
      <span className="text-14 text-ink-muted">{aciklama}</span>
      {alt && <span className="mt-auto border-t border-line pt-3 text-13 text-ink-muted">{alt}</span>}
    </button>
  );
}

/** Büyük seçimlerin ızgarası: masaüstünde iki sütun, telefonda tek. */
export function BuyukSecim({ children, sutun = 2 }: { children: ReactNode; sutun?: 2 | 3 }) {
  return (
    <div className={`grid gap-4 ${sutun === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {children}
    </div>
  );
}

/**
 * Hap seçici: küçük seçeneklerin (bölge, yaş aralığı, ilgi alanı) tek ya
 * da çoklu seçimi. Seçili hap kırmızı çizgili ve açık kırmızı zeminli
 * (referans: "seçili durum kırmızı çizgi/zemin").
 */
export function HapSecici<D extends string>({
  secenekler,
  secili,
  onDegis,
  etiket,
}: {
  secenekler: Array<{ deger: D; etiket: ReactNode }>;
  secili: D[];
  onDegis: (deger: D) => void;
  etiket: string;
}) {
  return (
    <div role="group" aria-label={etiket} className="flex flex-wrap gap-2">
      {secenekler.map((s) => {
        const acik = secili.includes(s.deger);
        return (
          <button
            key={s.deger}
            type="button"
            aria-pressed={acik}
            onClick={() => onDegis(s.deger)}
            className={`inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-13 font-semibold transition-colors ${
              acik ? 'border-brand bg-vurgu text-ink' : 'border-line-strong bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            {s.etiket}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Alt eylem çubuğu: Geri SOLDA, not ORTADA, birincil SAĞDA. Yapışkan
 * (`sticky`), `fixed` değil: panelin kenar çubuğu açıkken sabit bir çubuk
 * onun üstüne binerdi. Telefonda iPhone'un ev çubuğunun altına düşmesin diye
 * güvenli alan dolgusu.
 *
 * "Devam" KAPALIYSA nedeni notta yazar (giriş anında doğrulama): kullanıcı
 * düğmenin neden basılmadığını aramamalı.
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
  /** Birincilin solunda ikincil eylem ("Taslağı kaydet"). */
  ek?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-8 border-t border-line bg-surface px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-2.5">
        {geri && (
          <Dugme ton="ikincil" onClick={geri.onClick}>
            ← {geri.etiket ?? 'Geri'}
          </Dugme>
        )}
        {not ? (
          <span className="min-w-0 flex-1 text-13 text-ink-muted max-sm:order-last max-sm:basis-full">{not}</span>
        ) : (
          <span className="flex-1" />
        )}
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
