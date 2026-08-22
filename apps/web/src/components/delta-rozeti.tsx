import { formatPercent } from '@/lib/format';

/**
 * YÜZDE DEĞİŞİM ROZETİ — TEK TANIM.
 *
 * Aynı karar üç yerde birden veriliyordu: KPI kartı, ikincil şerit ve
 * (şimdi) kırılım tablosu. Karar iki parçalı ve ikisi de sessizce
 * bozulabiliyor:
 *
 *   1. `null` DEĞİŞİM GÖSTERİLMİYOR. "%0" yazmak "değişim yok" demek; oysa
 *      anlamı "karşılaştırma yapılamadı" (önceki dönem boş ya da sıfır).
 *   2. BAZI METRİKLERDE ARTIŞ KÖTÜDÜR. CPA yükseliyorsa kırmızı olmalı.
 *      Üçüncü bir kopya yazılsaydı, `inverse` kuralı bir yerde
 *      güncellenmeyince CPA artışı yeşil görünürdü — ve yeşil bir sayı
 *      kimseyi durdurmaz.
 */
export function DeltaRozeti({
  change,
  inverse = false,
  size = 'sm',
}: {
  change: number | null | undefined;
  /** Artışın KÖTÜ olduğu metrikler (CPA, CPC). */
  inverse?: boolean;
  size?: 'sm' | 'xs';
}) {
  if (change === null || change === undefined) return null;
  const good = inverse ? change < 0 : change > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
        size === 'xs' ? 'text-[10px]' : 'text-xs'
      } ${good ? 'text-emerald-600' : 'text-red-600'}`}
    >
      <Ok up={change > 0} />
      {formatPercent(Math.abs(change), 1)}
    </span>
  );
}

function Ok({ up }: { up: boolean }) {
  return (
    <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      <path d={up ? 'M5 1.5 L9 7 L1 7 Z' : 'M5 8.5 L1 3 L9 3 Z'} fill="currentColor" />
    </svg>
  );
}
