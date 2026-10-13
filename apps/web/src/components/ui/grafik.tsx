'use client';

import { useEffect, useRef } from 'react';

/**
 * ═══ ÇİZGİ GRAFİK (referans "03 · Metrik + grafik") ═══
 *
 * Genel Bakış'taki elle çizilen grafikten (`taslak/genel-bakis-parcalari.tsx`
 * `Grafik`) çıkarıldı ve veri tipinden bağımsızlaştırıldı: o sürüm günlük
 * metrik noktasını kendisi okuyordu, bu sürüm hazır sayı dizisi alıyor.
 * Grafik kütüphanesi YOK: iki seri, ızgara ve tarih etiketi için 60 KB'lık
 * bir paket panelin her sayfasına binerdi.
 *
 * KURALLAR:
 * - En çok İKİ seri. Birincisi marka kırmızısı, ikincisi siyah (`--seri2`).
 * - Seriler AYRI ölçekte: harcama (₺) ve dönüşüm (adet) aynı eksende biri
 *   düz çizgiye ezilirdi. Sağdaki etiket hangi çizginin hangisi olduğunu
 *   söylüyor.
 * - Önceki dönem yalnız ilk seride ve KESİKLİ.
 * - DEGRADE DOLGU YOK (2026-10-14): eski grafikte çizginin altında marka
 *   tonlu bir degrade alan vardı; kılavuzda degrade yok.
 * - `null` değer çizgiyi KESER: veri olmayan günü sıfır gibi çizmek "o gün
 *   hiç harcanmadı" yalanını söylerdi.
 * - Çizgi soldan sağa çizilerek gelir; hareket azaltılmışsa doğrudan görünür.
 */
export interface GrafikSerisi {
  ad: string;
  degerler: Array<number | null>;
  /** Önceki dönem (yalnız ilk seride çizilir, kesikli). */
  onceki?: Array<number | null>;
}

const W = 760;
const SOL = 8;
const SAG = 70;
const UST = 8;
const ALT = 24;

export function Grafik({
  seriler,
  etiketler,
  yukseklik = 220,
  ariaEtiketi,
}: {
  seriler: GrafikSerisi[];
  /** X ekseni etiketleri; `degerler` ile aynı uzunlukta (ör. "3 Eki"). */
  etiketler: string[];
  yukseklik?: number;
  ariaEtiketi?: string;
}) {
  const H = yukseklik;
  const cizilen = seriler.slice(0, 2);
  const n = Math.max(0, ...cizilen.map((s) => s.degerler.length));
  const x = (i: number) => SOL + ((W - SOL - SAG) * i) / Math.max(1, n - 1);

  const yollar = cizilen.map((sr) => {
    const sayilar = [...sr.degerler, ...(sr.onceki ?? [])].filter((a): a is number => a !== null);
    const enCok = Math.max(1e-9, ...sayilar) * 1.1;
    const y = (a: number) => UST + (H - UST - ALT) * (1 - a / enCok);
    const yol = (dizi: Array<number | null>) => {
      let d = '';
      let kalem = false;
      dizi.slice(0, n).forEach((a, i) => {
        if (a === null) {
          kalem = false;
          return;
        }
        d += `${kalem ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`;
        kalem = true;
      });
      return d;
    };
    return { ad: sr.ad, ana: yol(sr.degerler), onceki: sr.onceki?.length ? yol(sr.onceki) : '' };
  });

  const etiketSayisi = Math.min(5, n);
  const etiketSirasi = Array.from({ length: etiketSayisi }, (_, i) =>
    Math.round((i * (n - 1)) / Math.max(1, etiketSayisi - 1)),
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label={ariaEtiketi ?? cizilen.map((s) => s.ad).join(' ve ')}
    >
      {[0, 1, 2, 3].map((i) => {
        const yy = UST + ((H - UST - ALT) * i) / 3;
        return <line key={i} x1={SOL} x2={W - SAG} y1={yy} y2={yy} stroke="var(--border)" strokeWidth={1} />;
      })}
      {etiketSirasi.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 6}
          fontSize={11}
          fill="var(--text-muted)"
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
        >
          {etiketler[i] ?? ''}
        </text>
      ))}
      {yollar.map((sr, si) => {
        const renk = si ? 'var(--seri2)' : 'var(--brand-primary)';
        return (
          <g key={sr.ad}>
            {si === 0 && sr.onceki && (
              <path d={sr.onceki} fill="none" stroke={renk} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.45} />
            )}
            <CizilenYol key={`${sr.ad}-${sr.ana.length}`} d={sr.ana} renk={renk} kalin={si === 0} />
            <text x={W - SAG + 8} y={si ? UST + 26 : UST + 10} fontSize={11} fontWeight={700} fill={renk}>
              {sr.ad.split(' ')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CizilenYol({ d, renk, kalin }: { d: string; renk: string; kalin: boolean }) {
  const ref = useRef<SVGPathElement>(null);
  useEffect(() => {
    const p = ref.current;
    if (!p || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const L = p.getTotalLength();
    p.style.strokeDasharray = `${L}`;
    p.style.strokeDashoffset = `${L}`;
    p.getBoundingClientRect();
    p.style.transition = 'stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)';
    p.style.strokeDashoffset = '0';
    const bitti = () => {
      p.style.strokeDasharray = 'none';
    };
    p.addEventListener('transitionend', bitti, { once: true });
    return () => p.removeEventListener('transitionend', bitti);
  }, [d]);
  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke={renk}
      strokeWidth={kalin ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
