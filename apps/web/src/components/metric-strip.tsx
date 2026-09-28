import { DeltaRozeti } from '@/components/delta-rozeti';
import { Terim } from '@/components/ui/terim';
import type { TerimAnahtari } from '@/lib/terimler';

/**
 * İkincil metrik şeridi — kartların altında, daha sakin.
 *
 * DEĞİŞİM ROZETİ ARTIK ORTAK. Bu şerit "iyi mi kötü mü" kuralını KENDİ
 * içinde ikinci kez yazıyordu ve yönü YALNIZCA renkle söylüyordu: CPC
 * artışını gösteren kırmızı ok, renk körlüğünde yeşil oktan ayırt
 * edilemiyordu. Kural tek yerde (`delta-rozeti.tsx`) ve orada erişilebilir
 * bir etiket taşıyor; ikinci kopya, bir gün birinin güncellenmemesi demekti.
 *
 * ETİKET BİR TERİM: CTR ve CPC reklamcılık bilmeyen biri için iki harf
 * dizisi. Açıklaması tıklanınca açılıyor.
 */
export function MetricStrip({
  items,
}: {
  items: Array<{ terim: TerimAnahtari; value: string; change?: number | null; inverse?: boolean }>;
}) {
  return (
    <div className="flex flex-wrap divide-y divide-line rounded-xl border border-line bg-surface sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.terim} className="min-w-0 flex-1 basis-1/2 px-4 py-3 sm:basis-0">
          <p className="text-xs font-medium text-ink-muted">
            <Terim anahtar={item.terim} />
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-semibold tabular-nums text-ink">{item.value}</span>
            <DeltaRozeti change={item.change} inverse={item.inverse} />
          </div>
        </div>
      ))}
    </div>
  );
}
