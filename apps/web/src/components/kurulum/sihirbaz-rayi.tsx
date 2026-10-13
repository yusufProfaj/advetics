'use client';

import type { ReactNode } from 'react';
import type { IkonTuru } from './sihirbaz-akisi';

/**
 * ═══ SİHİRBAZIN RAYI VE DURUM İKONLARI (docs/kurulum-sihirbazi/taslak.html) ═══
 *
 * Onaylı taslağın sol sütunu: grup başlıkları (Şirket · Workspace), her
 * adım bir satır (ikon + ad + kısa sonuç), en altta "Son kontrol". Mobilde
 * AYNI liste katlanan bir özetin içinde (`<details>`): içerik DOM'dan
 * çıkmıyor, yalnız görünürlüğü değişiyor (CLAUDE.md tasarım kuralı).
 *
 * RENKLER YALNIZ KILAVUZDAN: beyaz, siyah (`ink`), gri, kırmızı (`brand`).
 * Yeşil YOK — "tamam" siyah dolu daire + beyaz tik. Şekil ve ad birlikte
 * anlam taşıyor; renk tek başına değil (renk körü kullanıcı "Sorun var"ı
 * ünlemden de okuyor).
 */

const TIK = (
  <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3">
    <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IKON_ADI: Record<IkonTuru | 'simdi' | 'yap' | 'no', string> = {
  tamam: 'Tamam',
  eksik: 'Eksik',
  kul: 'Senin işin',
  hata: 'Sorun var',
  bek: 'Sırada',
  dis: 'Kapsam dışı',
  bilinmiyor: 'Okunamadı',
  simdi: 'Şu an burada',
  yap: 'Yapılıyor',
  no: 'Henüz okunmadı',
};

export function DurumIkonu({ tur, numara, kucuk = false }: { tur: IkonTuru | 'simdi' | 'yap' | 'no'; numara?: ReactNode; kucuk?: boolean }) {
  const boyut = kucuk ? 'h-3.5 w-3.5 text-[9px]' : 'h-5 w-5 text-[11px]';
  const temel = `relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-baslik font-bold ${boyut}`;
  const sinif: Record<typeof tur, string> = {
    tamam: 'bg-ink text-surface',
    eksik: 'border-2 border-ink-muted',
    kul: 'border-2 border-ink',
    // `text-surface`: `tamam` gibi tema ile tersine döner (koyu temada beyaz zemin üstünde beyaz yazı kalmasın).
    hata: 'bg-brand text-surface',
    bek: 'border-2 border-dashed border-ink-muted',
    dis: 'border-2 border-line',
    bilinmiyor: 'border border-line text-ink-muted',
    simdi: 'border-2 border-brand',
    yap: 'animate-spin border-2 border-surface-sunken border-t-brand motion-reduce:animate-none',
    no: 'border border-line text-ink-muted',
  };
  return (
    <span className={`${temel} ${sinif[tur]}`} title={IKON_ADI[tur]} role="img" aria-label={IKON_ADI[tur]}>
      {tur === 'tamam' && TIK}
      {tur === 'hata' && '!'}
      {tur === 'kul' && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink" />}
      {tur === 'simdi' && <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />}
      {tur === 'dis' && <span aria-hidden className="absolute h-[22px] w-0.5 rotate-45 bg-ink-muted" />}
      {tur === 'bilinmiyor' && '?'}
      {tur === 'no' && numara}
    </span>
  );
}

export interface RaySatiri {
  kod: string;
  ad: string;
  alt: string | null;
  ikon: IkonTuru | 'simdi' | 'no';
  numara?: ReactNode;
  /** Kullanılmıyor / kapsam dışı: soluk + üstü çizili (gizlenmez — geri açılabilir). */
  soluk: boolean;
  href: string;
}

export interface RayGrubu {
  baslik: string;
  alt: string | null;
  satirlar: RaySatiri[];
}

/**
 * RAYIN LİSTESİ — masaüstünde sol sütun, mobilde katlanan özetin içi. İKİ
 * KEZ ÇİZİLİYOR (biri `lg:` altında gizli): taslakta da aynı liste iki
 * yerde, tek kaynaktan.
 *
 * SATIR BİR BAĞLANTI: orta tıkla yeni sekmede açılabiliyor; sol tık sayfayı
 * yenilemeden adımı değiştiriyor (`git`). Adres her geçişte güncelleniyor,
 * yani yenileme kullanıcıyı aynı adıma getiriyor.
 */
/*
 * SEÇİLİ SATIR SAYFA İÇİ YAN MENÜNÜN DİLİNDE (`SayfaIcMenu`): gri zemin +
 * solda kırmızı çizgi. Eskiden beyaz kart + gölge çizgisiydi ve panelin
 * diğer yan menülerinden ayrı bir dil konuşuyordu.
 */
const SECILI =
  'bg-surface-sunken before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand';

export function RayListesi({
  gruplar,
  son,
  aktif,
  git,
}: {
  gruplar: RayGrubu[];
  son: RaySatiri;
  aktif: string;
  git: (kod: string) => void;
}) {
  const satir = (s: RaySatiri) => (
    <li key={s.kod} className={s.soluk ? 'opacity-80' : ''}>
      <a
        href={s.href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          git(s.kod);
        }}
        aria-current={aktif === s.kod ? 'step' : undefined}
        className={`relative grid grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5 rounded-alan px-2.5 py-2 no-underline transition-colors duration-150 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
          aktif === s.kod ? SECILI : ''
        }`}
      >
        <DurumIkonu tur={s.ikon} numara={s.numara} />
        <span className="min-w-0">
          <span className={`block text-13 leading-tight ${s.soluk ? 'font-normal text-ink-muted line-through decoration-line' : 'font-semibold text-ink'}`}>{s.ad}</span>
          {s.alt && <span className="mt-px block truncate text-12 text-ink-muted">{s.alt}</span>}
        </span>
      </a>
    </li>
  );
  return (
    <>
      {gruplar.map((g) => (
        <div key={g.baslik}>
          <p className="mx-1.5 mb-1.5 mt-4 font-baslik text-11 font-bold uppercase tracking-[0.08em] text-ink-muted">
            {g.baslik}
            {g.alt && <span className="font-sans font-semibold normal-case tracking-normal"> · {g.alt}</span>}
          </p>
          <ol className="m-0 list-none p-0">{g.satirlar.map(satir)}</ol>
        </div>
      ))}
      <div className="mt-2.5 border-t border-line pt-2.5">
        <ol className="m-0 list-none p-0">{satir(son)}</ol>
      </div>
    </>
  );
}

/** Rayın başlığı ve ilerleme çubuğu: "8 / 12 tamam". */
export function RayBasligi({ tamam, toplam, metin }: { tamam: number; toplam: number; metin?: string }) {
  const yuzde = Math.round((tamam / Math.max(toplam, 1)) * 100);
  return (
    <>
      <div className="mx-1.5 mb-3.5 flex items-baseline justify-between">
        <h3 className="m-0 font-baslik text-15 font-bold text-ink">Adımlar</h3>
        <span className="font-baslik text-13 font-bold tabular-nums text-ink">
          {metin ?? (
            <>
              {tamam} / {toplam} <small className="font-sans text-12 font-normal text-ink-muted">tamam</small>
            </>
          )}
        </span>
      </div>
      {!metin && (
        <div
          className="mx-1.5 mb-1 h-1 overflow-hidden rounded bg-surface-sunken"
          role="progressbar"
          aria-label="Tamamlanan kurulum adımları"
          aria-valuemin={0}
          aria-valuemax={toplam}
          aria-valuenow={tamam}
        >
          <span className="block h-full rounded bg-ink transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${yuzde}%` }} />
        </div>
      )}
    </>
  );
}

/**
 * MASAÜSTÜ + MOBİL RAY. Mobilde katlanan özet: kapalıyken "Adım 8 / 12 ·
 * Dönüşüm ölçümü" ve sayaç; açılınca aynı liste. `<details>` içeriği DOM'da
 * tutuyor, açılış tarayıcının kendi davranışı (hareket yok).
 */
export function Ray({
  baslik,
  ozet,
  children,
}: {
  baslik: ReactNode;
  /** Mobil özet satırı (ikon + metin + sayaç). */
  ozet: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <aside aria-label="Kurulum adımları" className="hidden border-r border-line bg-surface px-3.5 py-5 lg:block">
        {baslik}
        {children}
      </aside>
      <details className="group border-b border-line bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
          {ozet}
        </summary>
        <nav aria-label="Kurulum adımları" className="px-2.5 pb-3">
          {children}
        </nav>
      </details>
    </>
  );
}
