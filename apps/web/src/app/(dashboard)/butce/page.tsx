import Link from 'next/link';
import type { BudgetPacing, ClientPacing } from '@advetics/shared';
import { requireSession, hasPermission } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatDayLong, formatMoney } from '@/lib/format';
import { BudgetForm } from '@/components/budget/budget-form';
import { PaceDelta, PacingBar, StatusChip } from '@/components/budget/pacing-bar';

export const metadata = { title: 'Aylık Bütçe — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Modül 5 — Aylık bütçe tablosu.
 *
 * AY SEÇİMİ TAKVİMSEL, panelin kayan aralıkları gibi değil. Bütçe aylık
 * tanımlanan bir taahhüt: "son 30 gün bütçesi" diye bir şey yok.
 *
 * GELECEK AY DA SEÇİLEBİLİYOR. Ajans ayın 25'inde gelecek ayın bütçesini
 * planlıyor; yalnızca geçmişi göstermek aracı planlama için kullanılamaz
 * kılardı.
 *
 * İKİ SEVİYE AYNI SAYFADA: müşteri geneli şemsiye bütçe üstte, proje/hesap
 * bazlı bütçeler tabloda. Bir müşterinin birden fazla projesi olabiliyor ve
 * ajans hem toplamı hem kırılımı izliyor.
 */
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const months = selectableMonths();
  const selected = months.find((m) => m.key === first(params.ay)) ?? months.find((m) => m.current)!;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Bütçe müşteri bazında tanımlanıyor. Üstteki seçiciden bir müşteri seçin.
        </p>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'budget.write');
  const qs = new URLSearchParams({ clientId, month: selected.key });
  const data = await serverApiFetch<ClientPacing>(`/budgets/pacing?${qs}`).catch(() => null);

  const linkWith = (over: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      ay: selected.key,
      musteri: clientId,
      ...over,
    };
    for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
    return `/butce?${next}`;
  };

  const clientName =
    session.availableClients.find((c) => c.id === clientId)?.name ?? 'Müşteri';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Aylık Bütçe</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {clientName} · {selected.label}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {months.map((m) => (
            <Link
              key={m.key}
              href={linkWith({ ay: m.key })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                m.key === selected.key
                  ? 'bg-brand text-white'
                  : 'border border-line text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {m.short}
              {m.future && <span className="ml-1 opacity-60">plan</span>}
            </Link>
          ))}
        </div>
      </header>

      {session.availableClients.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {session.availableClients.map((c) => (
            <Link
              key={c.id}
              href={linkWith({ musteri: c.id })}
              className={`rounded-lg px-2.5 py-1 text-xs transition ${
                c.id === clientId
                  ? 'bg-surface-sunken font-medium text-ink'
                  : 'text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {data === null ? (
        <Notice tone="error">
          Bütçe verisi alınamadı. API çalışıyor mu? Sorun sürerse{' '}
          <code className="rounded bg-surface-sunken px-1">pm2 logs advetics-api</code> çıktısına
          bakın.
        </Notice>
      ) : (
        <>
          <Warnings pacing={data} />

          <OverallCard
            pacing={data.overall}
            clientId={clientId}
            month={selected.key}
            currency={data.currency}
            canWrite={canWrite}
            future={selected.future}
          />

          <AccountTable data={data} month={selected.key} canWrite={canWrite} />
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Uyarılar — veriyi olduğundan iyi göstermemek için
// -----------------------------------------------------------------------------

function Warnings({ pacing }: { pacing: ClientPacing }) {
  const o = pacing.overall;
  const notices: React.ReactNode[] = [];

  if (o.excludedCurrencies.length > 0) {
    notices.push(
      <Notice key="fx" tone="warn">
        <strong>Farklı para birimindeki harcama toplama dâhil edilmedi</strong> (
        {o.excludedCurrencies.join(', ')}). Kur çevrimi henüz yok; karışık bir toplamı bütçeyle
        karşılaştırmak yanıltıcı olurdu. O hesapları tabloda ayrı ayrı görebilirsin.
      </Notice>,
    );
  }

  // VERİ KAPSAMASI. Eksik gün, harcamayı olduğundan düşük gösteriyor ve
  // pacing "yavaş gidiyoruz" diyor. Bunu söylemeden bırakmak, ajansın
  // bütçeyi artırmasına yol açabilirdi.
  if (o.daysElapsed > 0 && o.daysWithData > 0 && o.daysWithData < o.daysElapsed) {
    notices.push(
      <Notice key="coverage" tone="warn">
        <strong>
          Eksik veri: {o.daysElapsed} günün {o.daysWithData} günü senkronize.
        </strong>{' '}
        Harcama ve tüketim oranı olduğundan düşük görünüyor. Eksik günler çekilene kadar bu
        sayfadaki hız yorumu güvenilir değil.
      </Notice>,
    );
  }

  if (o.alertTriggered && o.budget) {
    notices.push(
      <Notice key="alert" tone={o.status === 'exhausted' ? 'error' : 'warn'}>
        <strong>
          Uyarı eşiği aşıldı: bütçenin %
          {((o.spentRatio ?? 0) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
          &apos;i harcandı
        </strong>{' '}
        (eşik %{o.budget.alertThresholdPct}).
      </Notice>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="space-y-2">{notices}</div>;
}

// -----------------------------------------------------------------------------
// Müşteri geneli kart
// -----------------------------------------------------------------------------

function OverallCard({
  pacing,
  clientId,
  month,
  currency,
  canWrite,
  future,
}: {
  pacing: BudgetPacing;
  clientId: string;
  month: string;
  currency: string | null;
  canWrite: boolean;
  future: boolean;
}) {
  const cur = pacing.budget?.currency ?? currency;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Müşteri geneli</h2>
            <StatusChip status={pacing.status} />
          </div>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Tüm reklam hesaplarının toplamı
            {!future && (
              <> · {formatDayLong(pacing.throughDate)} tarihine kadar</>
            )}
          </p>
        </div>
        {canWrite && (
          <BudgetForm
            clientId={clientId}
            adAccountId={null}
            adAccountName={null}
            month={month}
            existing={pacing.budget}
            currency={cur}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-ink">
          {formatMoney(pacing.spentMicros, cur)}
        </span>
        {pacing.budget ? (
          <span className="text-sm text-ink-muted">
            / {formatMoney(pacing.budget.amountMicros, cur)}
          </span>
        ) : (
          <span className="text-sm text-ink-muted">harcandı · bütçe tanımlı değil</span>
        )}
      </div>

      <div className="mt-3">
        <PacingBar pacing={pacing} />
      </div>

      {pacing.budget && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat label="Kalan" value={formatMoney(pacing.remainingMicros, cur)} />
          <Stat
            label="Kalan gün"
            value={`${pacing.daysRemaining} / ${pacing.daysTotal}`}
          />
          <Stat
            label="Günlük harcanabilir"
            value={formatMoney(pacing.suggestedDailyMicros, cur)}
            hint="Kalan bütçe ÷ kalan gün"
          />
          <Stat
            label="Ay sonu tahmini"
            value={formatMoney(pacing.projectedMicros, cur)}
            hint="Bu hızla devam edilirse"
          />
        </dl>
      )}

      {pacing.budget?.note && (
        <p className="mt-3 text-xs text-ink-muted">{pacing.budget.note}</p>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt
        className="text-[11px] font-medium uppercase tracking-wide text-ink-muted"
        title={hint}
      >
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hesap tablosu
// -----------------------------------------------------------------------------

function AccountTable({
  data,
  month,
  canWrite,
}: {
  data: ClientPacing;
  month: string;
  canWrite: boolean;
}) {
  if (data.accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-muted">
        Bu müşteriye bağlı reklam hesabı yok.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Reklam hesabı bazında</h2>
        <span className="text-[11px] text-ink-muted">
          {data.accounts.length} hesap
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2 font-medium">Hesap</th>
              <th className="px-4 py-2 text-right font-medium">Bütçe</th>
              <th className="px-4 py-2 text-right font-medium">Harcanan</th>
              <th className="px-4 py-2 text-right font-medium">Kalan</th>
              <th className="px-4 py-2 font-medium">Tüketim</th>
              <th className="px-4 py-2 text-right font-medium">Sapma</th>
              <th className="px-4 py-2 text-right font-medium">Günlük</th>
              {canWrite && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => {
              const cur = a.budget?.currency ?? data.currency;
              return (
                <tr key={a.adAccountId} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{a.adAccountName}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <StatusChip status={a.status} />
                      {/* Bu hesabın kendi veri kapsaması — genel uyarı
                          hangi hesabın eksik olduğunu söylemiyor. */}
                      {a.daysElapsed > 0 && a.daysWithData < a.daysElapsed && (
                        <span
                          className="text-[11px] text-amber-700"
                          title={`${a.daysElapsed} günün ${a.daysWithData} günü senkronize`}
                        >
                          {a.daysWithData}/{a.daysElapsed} gün
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {a.budget ? formatMoney(a.budget.amountMicros, cur) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(a.spentMicros, cur)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(a.remainingMicros, cur)}
                  </td>
                  <td className="px-4 py-3">
                    <PacingBar pacing={a} compact />
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">
                    <PaceDelta pacing={a} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(a.suggestedDailyMicros, cur)}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <BudgetForm
                        clientId={data.clientId}
                        adAccountId={a.adAccountId}
                        adAccountName={a.adAccountName}
                        month={month}
                        existing={a.budget}
                        currency={cur}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-muted">
        Tüketim çubuğundaki dikey çizgi ayın geçen kısmını gösteriyor. Çubuk çizginin
        sağındaysa bütçe hedeften hızlı tüketiliyor. Hesaplar{' '}
        <strong>bugün hariç</strong>, dünün sonuna kadar olan veriyle hesaplanıyor — gün
        bitmeden gelen kısmi veri her sabah &quot;yavaş gidiyoruz&quot; dedirtirdi.
      </p>
    </section>
  );
}

// -----------------------------------------------------------------------------

function Notice({
  tone,
  children,
}: {
  tone: 'warn' | 'error';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'error'
      ? 'bg-rose-50 text-rose-800 ring-rose-200'
      : 'bg-amber-50 text-amber-900 ring-amber-200';
  return (
    <div className={`rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${cls}`}>{children}</div>
  );
}

interface MonthOption {
  key: string;
  label: string;
  short: string;
  current: boolean;
  future: boolean;
}

/**
 * Seçilebilir aylar: 4 geçmiş + içinde bulunulan + 1 gelecek.
 *
 * Gelecek ay DÂHİL çünkü bütçe planlama aracı: ajans ayın sonunda gelecek ayın
 * rakamını giriyor. Yalnızca geçmişi göstermek, aracı yalnızca rapor aracı
 * yapardı.
 *
 * `Date.UTC` ile hesaplanıyor — yerel `Date` kullanmak batıdaki bir sunucuda
 * ayın 1'inde bir önceki ayı "içinde bulunulan ay" gösterirdi.
 */
function selectableMonths(): MonthOption[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: MonthOption[] = [];

  for (let offset = -4; offset <= 1; offset++) {
    const d = new Date(Date.UTC(y, m + offset, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push({
      key,
      label: d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      short: d.toLocaleDateString('tr-TR', { month: 'short', timeZone: 'UTC' }),
      current: offset === 0,
      future: offset > 0,
    });
  }
  return out;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
