import type { BudgetPacing, PacingStatus } from '@advetics/shared';

/**
 * Bütçe tüketim çubuğu.
 *
 * İKİ BİLGİ AYNI ÇUBUKTA: harcanan oran (dolgu) ve ayın geçen oranı (dikey
 * çizgi). Tek başına "bütçenin %60'ı harcandı" bir şey söylemiyor — ayın
 * %20'sindeysek felaket, %90'ındaysak fazlasıyla iyi. Karşılaştırma noktası
 * çubuğun İÇİNDE olmalı; iki ayrı sayı olarak vermek okuyucudan çıkarma
 * yapmasını istemek olurdu.
 */

const TONE: Record<PacingStatus, { bar: string; chip: string; label: string }> = {
  under: { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-200', label: 'Yavaş' },
  on_track: {
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    label: 'Hedefte',
  },
  over: { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 ring-amber-200', label: 'Hızlı' },
  exhausted: { bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200', label: 'Doldu' },
  no_budget: {
    bar: 'bg-slate-300',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
    label: 'Bütçe yok',
  },
};

export function StatusChip({ status }: { status: PacingStatus }) {
  const t = TONE[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.chip}`}
    >
      {t.label}
    </span>
  );
}

export function PacingBar({ pacing, compact = false }: { pacing: BudgetPacing; compact?: boolean }) {
  const spent = pacing.spentRatio;
  const tone = TONE[pacing.status];

  // Dolgu %100'de duruyor ama AŞIM GİZLENMİYOR: çubuk tamamen dolduğunda
  // üstüne çapraz tarama biniyor. Çubuğu taşırmak düzeni bozardı, aşımı hiç
  // göstermemek ise asıl bilgiyi saklamak olurdu.
  const fill = spent === null ? 0 : Math.min(spent, 1) * 100;
  const overflow = spent !== null && spent > 1;

  return (
    <div className={compact ? 'w-full min-w-[140px]' : 'w-full'}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={`h-full rounded-full transition-[width] ${tone.bar}`}
          style={{ width: `${fill}%` }}
        />
        {overflow && (
          <div
            className="absolute inset-0 rounded-full opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,.9) 3px 6px)',
            }}
          />
        )}

        {/* AYIN GEÇEN ORANI — hedef çizgisi.
            Çubuğun 0 ve 100'e yapışık hâlleri görünmez oluyor; %1'lik bir
            kenar payı çizginin hep okunmasını sağlıyor. */}
        {pacing.elapsedRatio > 0 && (
          <div
            className="absolute top-0 h-full w-px bg-ink/60"
            style={{ left: `${Math.min(Math.max(pacing.elapsedRatio * 100, 1), 99)}%` }}
            title={`Ayın %${Math.round(pacing.elapsedRatio * 100)}'i geçti`}
          />
        )}
      </div>

      {!compact && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
          <span>
            {spent === null ? '—' : `%${(spent * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} harcandı`}
          </span>
          <span>Ayın %{Math.round(pacing.elapsedRatio * 100)}&apos;i geçti</span>
        </div>
      )}
    </div>
  );
}

/**
 * Sapma rozeti — "hedefin kaç puan üstünde".
 *
 * Yüzde DEĞİL PUAN farkı gösteriliyor: "%15 hızlı" belirsiz (neyin %15'i?),
 * "hedefin 15 puan üstünde" tek bir anlama geliyor.
 */
export function PaceDelta({ pacing }: { pacing: BudgetPacing }) {
  if (pacing.paceDelta === null) return <span className="text-ink-muted">—</span>;
  const points = pacing.paceDelta * 100;
  // ±0,5 puanın altı gürültü; işaretli göstermek yanlış bir kesinlik verirdi.
  if (Math.abs(points) < 0.5) return <span className="text-ink-muted">hedefte</span>;
  const sign = points > 0 ? '+' : '−';
  return (
    <span className={points > 0 ? 'text-amber-700' : 'text-sky-700'}>
      {sign}
      {Math.abs(points).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan
    </span>
  );
}
