import type { ReactNode } from 'react';

/**
 * ═══ METRİK KUTULARI (referans "03 · Metrik + grafik") ═══
 *
 * Panelde altı ayrı istatistik kutusu vardı (Genel Bakış, Reklam
 * Yöneticisi, Bütçe, Raporlar, İyileştir, Akıllı Boost); boyları, sayının
 * yazı tipi ve "önceki döneme göre" satırının rengi ekrandan ekrana
 * değişiyordu. Tek kalıp: yan yana DÖRT kutu (telefonda 2×2), değer
 * Montserrat ve hizalı rakam, altında fark satırı.
 *
 * SERİ RENGİ ALTTA ÇİZGİ: en çok iki kutu grafikte çizilir; birincisi
 * KIRMIZI, ikincisi SİYAH. Seçili olmayan kutu düz.
 *
 * FARKIN RENGİ YÖNDEN DEĞİL ANLAMDAN: harcama artışı "kötü" değil, CPA
 * artışı kötü. Çağıran `hal` verir: `iyi` yeşil, `kotu` kırmızı, `notr`
 * gri. Yön oku metnin içinde.
 */
export interface MetrikKutusu {
  anahtar: string;
  ad: string;
  /** Biçimlenmiş değer: "48.210 ₺". */
  deger: ReactNode;
  fark?: { metin: ReactNode; hal: 'iyi' | 'kotu' | 'notr'; etiket?: string };
  /** Grafikte çizilen seri sırası: 1 kırmızı, 2 siyah. */
  seri?: 1 | 2;
  /** Ek açıklama satırı (gri). */
  ipucu?: ReactNode;
  /** Seçilemezse nedeni (title ve ekran okuyucu). */
  secilemezNedeni?: string;
}

const FARK: Record<'iyi' | 'kotu' | 'notr', string> = {
  iyi: 'text-ok',
  kotu: 'text-danger-strong',
  notr: 'text-ink-muted',
};

export function MetrikKutulari({
  kutular,
  onSec,
  cerceveli = true,
}: {
  kutular: MetrikKutusu[];
  /** Verilirse kutular düğme olur ve tıklanınca grafiğe seri ekler/çıkarır. */
  onSec?: (anahtar: string) => void;
  /** Kartın içinde üst şerit olarak kullanılırken `false` (dış çerçeve kartta). */
  cerceveli?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-2 overflow-hidden bg-surface min-[900px]:grid-cols-4 ${
        cerceveli ? 'rounded-kart border border-line' : 'border-b border-line'
      }`}
    >
      {kutular.map((k, i) => {
        const icerik = (
          <>
            <span className="text-[12.5px] font-semibold text-ink-muted">{k.ad}</span>
            <b className="font-baslik text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums text-ink">
              {k.deger}
            </b>
            {k.fark && (
              <small className={`text-12 ${FARK[k.fark.hal]}`} title={k.fark.etiket}>
                {k.fark.metin}
                {k.fark.etiket && <span className="sr-only">, {k.fark.etiket}</span>}
              </small>
            )}
            {k.ipucu && <small className="text-12 text-ink-muted">{k.ipucu}</small>}
          </>
        );
        /*
         * KENARLAR: masaüstünde sağ çizgi (sonuncu hariç), telefonda 2×2
         * ızgarada ikinci sütun sağ çizgisiz ve ilk satır alt çizgili.
         */
        const kenar = [
          i % 2 === 0 ? 'border-r' : 'max-[899px]:border-r-0 border-r',
          i === kutular.length - 1 ? 'min-[900px]:border-r-0' : '',
          i < 2 ? 'max-[899px]:border-b' : '',
        ].join(' ');
        const seri =
          k.seri === 1
            ? 'shadow-[inset_0_-3px_0_var(--brand-primary)]'
            : k.seri === 2
              ? 'shadow-[inset_0_-3px_0_var(--seri2)]'
              : '';
        const sinif = `relative grid content-start gap-1 border-line px-[18px] py-4 text-left ${kenar} ${seri}`;
        return onSec ? (
          <button
            key={k.anahtar}
            type="button"
            className={`${sinif} transition-colors hover:bg-surface-muted aria-disabled:cursor-default aria-disabled:hover:bg-transparent`}
            aria-pressed={k.seri !== undefined}
            aria-disabled={k.secilemezNedeni ? true : undefined}
            title={k.secilemezNedeni}
            onClick={() => !k.secilemezNedeni && onSec(k.anahtar)}
          >
            {icerik}
          </button>
        ) : (
          <div key={k.anahtar} className={sinif}>
            {icerik}
          </div>
        );
      })}
    </div>
  );
}
