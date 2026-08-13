'use client';

import {
  SLOT_FIT_LABELS,
  ratioLabel,
  type AssetCoverage,
  type SlotFit,
} from '@advetics/shared';

/**
 * Yuva kapsama paneli.
 *
 * NE GÖSTERİYOR: yüklenen görsellerin platformun hangi yerlerini doldurduğunu
 * ve ne kadar kırpılacağını. İkisi de bugüne kadar görünmüyordu — kullanıcı
 * üç görsel yüklüyor, "tamam" görüyor ve reklamı Ads Manager'da yarısı
 * kesilmiş hâlde buluyordu.
 *
 * KIRPMA YÜZDESİ YAZILIYOR. "Kırpılabilir" demek bilgi değil; "%36'sı
 * kırpılacak" cümlesi kullanıcının başka bir görsel yükleyip yüklememeye
 * karar vermesini sağlıyor.
 */
export function CoveragePanel({ coverage }: { coverage: AssetCoverage[] }) {
  return (
    <div className="space-y-3">
      {coverage.map((c) => (
        <PlatformBlock key={c.platform} coverage={c} />
      ))}
    </div>
  );
}

function PlatformBlock({ coverage }: { coverage: AssetCoverage }) {
  const isGoogle = coverage.platform === 'google';
  const filled = coverage.slots.filter((s) => s.assetId !== null).length;

  return (
    <section className="rounded-lg border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">
          {isGoogle ? 'Google için hazırlık' : 'Meta yerleşimleri'}
        </h4>
        <span className="text-[11px] text-ink-muted">
          {filled} / {coverage.slots.length} yuva dolu
        </span>
      </div>

      {isGoogle && (
        /**
         * GOOGLE BLOĞU YAYINI ENGELLEMİYOR ve bunu açıkça yazıyoruz.
         *
         * Yoksa kullanıcı kırmızı bir uyarı görüp Meta reklamını yayınlamaktan
         * vazgeçer — yazılmamış bir özellik yüzünden çalışan bir akış durur.
         */
        <p className="mt-1 text-[11px] text-ink-muted">
          Bu bölüm Meta yayınını engellemiyor. Aynı görsellerle Google'a da
          çıkacaksan neyin eksik olduğunu şimdiden gösteriyor.
        </p>
      )}

      <ul className="mt-2 space-y-1">
        {coverage.slots.map((s) => (
          <li
            key={s.slot.key}
            className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink">
                {s.slot.label}
                <span className="ml-1.5 text-[10px] font-normal text-ink-muted">
                  {ratioLabel(s.slot.aspect)}
                </span>
              </p>
              <p className="truncate text-[10px] text-ink-muted">{s.slot.shownAt}</p>
            </div>

            <span className={`shrink-0 text-[10px] font-medium ${toneFor(s.fit)}`}>
              {s.assetId === null
                ? s.slot.required
                  ? 'Eksik'
                  : 'Boş'
                : s.fit === 'crop' || s.fit === 'heavy_crop'
                  ? // KIRPMA MİKTARI SAYIYLA. "Kırpılacak" tek başına karar
                    // verdirmiyor; yüzde verdiriyor.
                    `%${Math.round((1 - s.retained) * 100)} kırpılacak`
                  : s.lowResolution
                    ? 'Düşük çözünürlük'
                    : SLOT_FIT_LABELS[s.fit]}
            </span>
          </li>
        ))}
      </ul>

      {(coverage.blockers.length > 0 || coverage.warnings.length > 0) && (
        <ul className="mt-2 space-y-0.5">
          {coverage.blockers.map((b, i) => (
            <li key={`b-${i}`} className={isGoogle ? 'text-[11px] text-ink-muted' : 'text-[11px] text-rose-700'}>
              · {b}
            </li>
          ))}
          {coverage.warnings.map((w, i) => (
            <li key={`w-${i}`} className="text-[11px] text-ink-muted">
              · {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function toneFor(fit: SlotFit): string {
  switch (fit) {
    case 'exact':
      return 'text-emerald-700';
    case 'crop':
      return 'text-ink-muted';
    case 'heavy_crop':
      return 'text-amber-700';
    default:
      return 'text-rose-700';
  }
}
