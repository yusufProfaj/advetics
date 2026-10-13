import type { ReactNode } from 'react';

/**
 * ═══ DURUM ROZETİ VE NOKTASI (referans "07 · Durum rozeti") ═══
 *
 * YEŞİL YALNIZ BURADA (kullanıcı kararı 2026-10-09, 2026-10-14): yayında =
 * yeşil nokta. Duraklatıldı = gri KARE nokta, taslak = gri yuvarlak nokta,
 * hata = kırmızı nokta + kırmızı yazı. Renk tek başına anlam taşımıyor:
 * şekil ve metin her zaman yanında (renk körü kullanıcı "Duraklatıldı" ile
 * "Taslak"ı nokta biçiminden ayırıyor).
 */
export type DurumHali = 'ok' | 'dur' | 'taslak' | 'hata';

const NOKTA: Record<DurumHali, string> = {
  ok: 'rounded-full bg-ok',
  dur: 'rounded-[2px] bg-ink-soluk',
  taslak: 'rounded-full bg-ink-soluk',
  hata: 'rounded-full bg-danger',
};

export function DurumNoktasi({ hal, etiket }: { hal: DurumHali; etiket?: string }) {
  return (
    <i
      aria-hidden={etiket ? undefined : true}
      aria-label={etiket}
      role={etiket ? 'img' : undefined}
      className={`inline-block h-[7px] w-[7px] shrink-0 ${NOKTA[hal]}`}
    />
  );
}

/**
 * Bekleyen iş sayısı (menü satırı, bildirim zili): kırmızı hap, beyaz kalın
 * rakam. 99'u aşan sayı "99+": dar bir rozette dört basamak satırı kırıyordu.
 */
export function SayiRozeti({ sayi, etiket, className = '' }: { sayi: number; etiket?: string; className?: string }) {
  return (
    <span
      aria-label={etiket}
      className={`inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-[6px] py-0.5 text-11 font-bold leading-none text-white ${className}`}
    >
      {sayi > 99 ? '99+' : sayi}
    </span>
  );
}

export function Rozet({ hal, children, title }: { hal: DurumHali; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-12 font-bold ${
        hal === 'hata'
          ? 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-danger-strong'
          : 'border-line-strong text-ink'
      }`}
    >
      <DurumNoktasi hal={hal} />
      {children}
    </span>
  );
}
