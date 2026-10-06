import Link from 'next/link';
import type { ClientPacing } from '@advetics/shared';
import { formatMoney } from '@/lib/format';
import { PacingBar, StatusChip } from '@/components/budget/pacing-bar';

/**
 * ═══ GENEL BAKIŞ'IN ÜSTÜNDE BU AYIN BÜTÇESİ ═══
 *
 * Kullanıcının isteği (2026-10-06): workspace'in aylık bütçesini Genel
 * Bakış'ın üst bandında görmek. Bütçe Marka Merkezi'ne taşındı ve oraya
 * gitmeden "bu ay ne kadarı harcandı, hızımız ne" sorusunun cevabı burada.
 * Kart tıklanınca Marka Merkezi › Aylık Bütçe açılıyor.
 *
 * ÜÇ HÂL AYRI YAZILIYOR: tanımlı, tanımsız ve "alınamadı". Üçünü aynı boş
 * kutuya çevirmek, bütçesi olan bir workspace'te "tanımlı değil" yazmak
 * demekti (CLAUDE.md: hatayı yutma).
 */
export function ButceKarti({
  veri,
  hata,
  href,
  ayAdi,
}: {
  veri: ClientPacing | null;
  hata: string | null;
  href: string;
  ayAdi: string;
}) {
  const kap =
    'group flex min-w-[15rem] max-w-sm flex-col gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-brand-soft';

  if (veri === null) {
    return (
      <Link href={href} className={kap}>
        <span className="text-xs font-semibold text-ink-muted">{ayAdi} bütçesi</span>
        <span className="text-sm text-danger-strong">Alınamadı{hata ? `: ${hata}` : ''}</span>
      </Link>
    );
  }

  const o = veri.overall;
  if (o.status === 'no_budget' || !o.budget) {
    return (
      <Link href={href} className={kap}>
        <span className="text-xs font-semibold text-ink-muted">{ayAdi} bütçesi</span>
        <span className="text-sm text-ink">
          Tanımlı değil ·{' '}
          <span className="font-semibold text-brand-strong group-hover:underline">Tanımla →</span>
        </span>
      </Link>
    );
  }

  /*
   * KARIŞIK PARA BİRİMİ TOPLANMIYOR: hesapların birimi farklıysa tek tutar
   * yazmak yanlış sayı göstermek olurdu (bütçe ekranındaki kuralın aynısı).
   */
  const birim = veri.currency;
  return (
    <Link href={href} className={kap}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-muted">{ayAdi} bütçesi</span>
        <StatusChip status={o.status} />
      </span>
      {birim ? (
        <span className="text-sm text-ink">
          <strong className="font-semibold tabular-nums">{formatMoney(o.spentMicros, birim)}</strong>
          <span className="text-ink-muted"> / {formatMoney(o.budget.amountMicros, birim)}</span>
        </span>
      ) : (
        <span className="text-sm text-warn-strong">Hesaplarda farklı para birimi var</span>
      )}
      <PacingBar pacing={o} compact />
    </Link>
  );
}
