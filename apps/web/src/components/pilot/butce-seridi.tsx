import type { PlanOnerisi } from '@advetics/shared';
import { KaynakCipi, BosHucre } from './kaynak-cipi';
import { para, payMetni, platformAdi, seritDilimleri, type SeritDilimi } from './hesap';

/**
 * ═══ BÜTÇE NEREYE GİDİYOR ═══
 *
 * Yığılmış yatay çubuk + lejant + platform gerekçeleri. Rakamlar şeridin
 * İÇİNDE değil lejantta: dar ekranda dilim metni kırpılıyor ve kırpılmış
 * bir tutar yanlış sayı göstermekle aynı şey (CLAUDE.md tablo dersi).
 * Şeritte yalnız ad var ve o da sığmazsa kesiliyor; tutar her zaman
 * lejantta tam.
 */
const KARISIM = [100, 72, 48] as const;

function dilimRengi(d: SeritDilimi): string {
  if (d.platform === 'dagitilmamis') return 'var(--surface-sunken)';
  const ana = d.platform === 'meta' ? 'var(--platform-meta)' : 'var(--platform-google)';
  const oran = KARISIM[Math.min(d.ton, KARISIM.length - 1)];
  return oran === 100 ? ana : `color-mix(in srgb, ${ana} ${oran}%, var(--surface))`;
}

export function ButceSeridi({ plan, clientId }: { plan: PlanOnerisi; clientId: string }) {
  const dilimler = seritDilimleri(plan);
  if (!plan.toplam.dolu) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <BosHucre neden={plan.toplam.emptyReason} clientId={clientId} />
      </div>
    );
  }
  const etiket = dilimler.map((d) => `${d.etiket} ${payMetni(d.payBaz)}`).join(', ');
  return (
    <div className="space-y-3">
      <div role="img" aria-label={etiket} className="flex h-10 gap-0.5 overflow-hidden rounded-lg">
        {dilimler.map((d) => (
          <div
            key={d.anahtar}
            className={`flex min-w-0 items-center overflow-hidden whitespace-nowrap px-2.5 text-xs font-semibold ${
              d.platform === 'dagitilmamis' ? 'text-ink-muted' : 'text-white'
            }`}
            style={{ flexGrow: Math.max(d.payBaz, 1), flexBasis: 0, background: dilimRengi(d) }}
          >
            <span className="truncate">{d.etiket}</span>
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
        {dilimler.map((d) => (
          <li key={d.anahtar} className="flex min-w-0 items-center gap-1.5">
            <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: dilimRengi(d) }} />
            <span>{d.etiket}</span>
            <b className="font-semibold tabular-nums text-ink">{para(d.micros, plan.paraBirimi)}</b>
          </li>
        ))}
      </ul>

      {plan.platformlar.length > 0 && (
        <ul className="space-y-2.5 pt-1">
          {plan.platformlar.map((p) => (
            <li key={p.platform} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <b className="font-baslik font-semibold text-ink">
                {platformAdi(p.platform)} {payMetni(p.payBaz.deger)}
              </b>
              <span className="min-w-0 text-ink-muted">{p.gerekce}</span>
              <KaynakCipi kaynak={p.payBaz.kaynak} clientId={clientId} />
            </li>
          ))}
        </ul>
      )}

      {/* Plana giremeyen platform SESSİZCE düşmez: nedeni ve ne yapılacağı yazılı (M-5). */}
      {plan.disaridaKalanlar.length > 0 && (
        <ul className="space-y-2 rounded-lg bg-surface-sunken px-4 py-3">
          {plan.disaridaKalanlar.map((d) => (
            <li key={d.platform} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <b className="font-semibold text-ink">{platformAdi(d.platform)} plana girmedi.</b>
              <BosHucre neden={d.neden} clientId={clientId} />
            </li>
          ))}
        </ul>
      )}

      {BigInt(plan.dagitilmamis.micros) > 0n && (
        <p className="text-sm text-ink-muted">
          <b className="font-semibold tabular-nums text-ink">{para(plan.dagitilmamis.micros, plan.paraBirimi)}</b> dağıtılmadı.{' '}
          {plan.dagitilmamis.nedenler.length > 0 && <BosHucre neden={plan.dagitilmamis.nedenler[0]!} clientId={clientId} kisa />}
        </p>
      )}
    </div>
  );
}
