import Link from 'next/link';
import {
  BOOST_METRIC_META,
  BOOST_STATUS_LABELS,
  MEDIA_TYPE_LABELS,
  type BoostRecord,
  type BoostRuleRecord,
  type BoostStatus,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatMoney, formatNumber, formatRelative } from '@/lib/format';
import {
  BoostDecision,
  CreateApprovedButton,
  RunBoostRuleButton,
} from '@/components/boost/boost-controls';
import { ManualBoost } from '@/components/boost/manual-boost';

export const metadata = { title: 'Auto-Boost — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Modül 7 — Auto-Boost.
 *
 * SAYFANIN TAŞIDIĞI TEK MESAJ: buradaki her onay PARA TAAHHÜDÜ. Onay bekleyen
 * adaylar en üstte, her birinin toplam maliyeti onay düğmesinin ÜZERİNDE
 * yazıyor ve kuralın o gönderiyi neden seçtiği okunabilir.
 *
 * Modül 5'ten farkı bu: orada karar harcamayı durduruyordu, burada başlatıyor.
 */
export default async function AutoBoostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
        <p className="mt-2 text-sm text-ink-muted">Auto-Boost müşteri bazında çalışıyor.</p>
      </div>
    );
  }

  const canApprove = hasPermission(session, 'boost.approve');
  const canWrite = hasPermission(session, 'boost.write');

  const [boosts, rules] = await Promise.all([
    serverApiFetch<BoostRecord[]>(`/boosts?clientId=${clientId}`).catch(() => null),
    serverApiFetch<BoostRuleRecord[]>(`/boosts/rules?clientId=${clientId}`).catch(() => null),
  ]);

  // Para birimi hesaptan geliyor; adayların hepsi aynı müşterinin hesapları.
  const currency = 'TRY';
  const candidates = boosts?.filter((b) => b.status === 'candidate') ?? [];
  const others = boosts?.filter((b) => b.status !== 'candidate') ?? [];
  const pendingTotal = candidates.reduce((a, b) => a + BigInt(b.totalBudgetMicros), 0n);

  const clientName = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Müşteri';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Auto-Boost</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {clientName} · günde iki kez değerlendiriliyor
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {canApprove && <CreateApprovedButton clientId={clientId} />}
        </div>
      </header>


      {session.availableClients.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {session.availableClients.map((c) => (
            <Link
              key={c.id}
              href={`/auto-boost?musteri=${c.id}`}
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

      {/*
        ELLE BOOST BU SAYFADA, ayrı bir sayfada değil — kural yolu ve elle yol
        aynı işin iki üreticisi ve ayırmak "hangi ekrandan hangisi açılıyordu"
        sorusunu üretirdi.

        AMA BAŞLIK SATIRININ İÇİNDE DEĞİL, ALTINDA. İlk yazımda başlığın düğme
        satırındaydı ve dört adımlı form iki düğmenin yanına flex öğesi olarak
        giriyordu: satırdaki gönderi metni nowrap olduğu için formun min-content
        genişliği 1142px'e çıkıyor, flex öğesi de `min-width:auto` yüzünden o
        genişliğin altına küçülemiyordu. Ölçülen sonuç 1280px ekranda 153px
        yatay BELGE taşmasıydı ve kenar çubuğu sticky yalnızca dikey
        sabitlediği için sağa kaydırınca sol kenar ekrandan çıkıyordu —
        kullanıcıya "metinler soldan kesilmiş" görünüyordu.
      */}
      <ManualBoost clientId={clientId} canPublish={canApprove} />

      {boosts === null ? (
        <Notice tone="error">Boost verisi alınamadı.</Notice>
      ) : (
        <>
          {candidates.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">
                  {candidates.length} gönderi onay bekliyor
                </h2>
                {/* TOPLAM TAAHHÜT ÜSTTE. Tek tek onaylarken kaç para
                    bağlandığını görmek, her karardan sonra hesap yapmaktan
                    daha güvenilir. */}
                <span className="text-sm text-ink-muted">
                  toplam {formatMoney(pendingTotal.toString(), currency)}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {candidates.map((b) => (
                  <BoostCard key={b.id} boost={b} currency={currency} canApprove={canApprove} />
                ))}
              </div>
            </section>
          )}

          {rules !== null && (
            <RuleList rules={rules} currency={currency} canWrite={canWrite} />
          )}

          {others.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
                Geçmiş
              </h2>
              <div className="divide-y divide-line/60">
                {others.map((b) => (
                  <div key={b.id} className="p-4">
                    <BoostCard boost={b} currency={currency} canApprove={false} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {boosts.length === 0 && rules?.length === 0 && <EmptyState />}
        </>
      )}
    </div>
  );
}

function BoostCard({
  boost,
  currency,
  canApprove,
}: {
  boost: BoostRecord;
  currency: string | null;
  canApprove: boolean;
}) {
  const p = boost.post;
  return (
    <div className="flex flex-wrap gap-3 rounded-xl bg-surface p-3 sm:flex-nowrap">
      {p.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.thumbnailUrl}
          alt=""
          loading="lazy"
          /* Beyaz etiket alan adını Meta'ya sızdırmamak için — kreatif
             kartında baştan beri var, burada eksikti. */
          referrerPolicy="no-referrer"
          className="h-24 w-24 shrink-0 rounded-lg bg-surface-sunken object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-[11px] text-ink-muted">
          {MEDIA_TYPE_LABELS[p.mediaType]}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={boost.status} />
          <span className="text-[11px] text-ink-muted">
            {p.socialProfileName} · {formatRelative(p.publishedAt)}
          </span>
          {p.permalink && (
            <a
              href={p.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-brand hover:underline"
            >
              Gönderiyi aç
            </a>
          )}
        </div>

        {p.message && (
          <p className="mt-1 line-clamp-2 text-sm text-ink">{p.message}</p>
        )}

        {/* ORGANİK PERFORMANS — onay kararının dayanağı.
            Kuralın gerekçesi tek bir metriği anıyor; burada tam tablo var
            ki onaylayan kişi kuralın kararını doğrulayabilsin. */}
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
          <Stat label={BOOST_METRIC_META.reach.label} value={formatNumber(p.reach)} />
          <Stat label={BOOST_METRIC_META.engagements.label} value={formatNumber(p.engagements)} />
          <Stat
            label={BOOST_METRIC_META.engagement_rate.label}
            value={
              p.engagementRate === null
                ? '—'
                : `%${p.engagementRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
            }
          />
          <Stat label="Yorum" value={formatNumber(p.comments)} />
          <Stat label="Paylaşım" value={formatNumber(p.shares)} />
        </dl>

        <p className="mt-1.5 text-[11px] text-ink-muted">
          <span className="font-medium text-ink">Seçilme sebebi:</span> {boost.reason}
          {boost.boostRuleName && ` (${boost.boostRuleName})`}
        </p>

        {/*
          BÜTÇE KİPE GÖRE YAZILIYOR.

          Toplam bütçeli boost'ta (elle boost — K18) günlük bütçe diye bir sayı
          YOK: Meta parayı eşit bölmüyor ve "—/gün × 5 gün" yazmak kullanıcıya
          hesaplanabilir bir şey varmış izlenimi verirdi.
        */}
        <p className="mt-1 text-[11px] text-ink-muted">
          {boost.budgetMode === 'lifetime' ? (
            <>
              <strong className="text-ink">
                {formatMoney(boost.totalBudgetMicros, currency)}
              </strong>{' '}
              toplam · {boost.durationDays} gün
            </>
          ) : (
            <>
              {formatMoney(boost.dailyBudgetMicros, currency)}/gün × {boost.durationDays} gün
              ={' '}
              <strong className="text-ink">
                {formatMoney(boost.totalBudgetMicros, currency)}
              </strong>
            </>
          )}{' '}
          · {boost.adAccountName}
        </p>

        {boost.error && (
          <p className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
            {boost.error}
          </p>
        )}

        {canApprove && (
          <div className="mt-2.5">
            <BoostDecision boost={boost} currency={currency} />
          </div>
        )}
      </div>
    </div>
  );
}

function RuleList({
  rules,
  currency,
  canWrite,
}: {
  rules: BoostRuleRecord[];
  currency: string | null;
  canWrite: boolean;
}) {
  if (rules.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
        Boost kuralları
      </h2>
      <div className="divide-y divide-line/60">
        {rules.map((r) => {
          const cap = BigInt(r.monthlyCapMicros);
          const used = BigInt(r.committedThisMonthMicros);
          const pct = cap > 0n ? Number((used * 100n) / cap) : 0;
          return (
            <div key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-ink">{r.name}</h3>
                {!r.enabled && <Chip cls="bg-slate-100 text-slate-600 ring-slate-200">Kapalı</Chip>}
                {r.autoApprove && (
                  // OTOMATİK ONAY GÖRÜNÜR OLMALI: bu kural insan onayı
                  // beklemeden para taahhüt ediyor.
                  <Chip cls="bg-amber-50 text-amber-800 ring-amber-200">Otomatik onay</Chip>
                )}
              </div>

              <p className="mt-1 text-sm text-ink-muted">{describe(r)}</p>

              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[11px] text-ink-muted">
                  <span>
                    Aylık tavan: {formatMoney(r.committedThisMonthMicros, currency)} /{' '}
                    {formatMoney(r.monthlyCapMicros, currency)}
                  </span>
                  <span>%{pct}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>

              <p className="mt-1.5 text-[11px] text-ink-muted">
                {r.socialProfileName ?? 'Tüm profiller'} ·{' '}
                {r.lastRunAt ? `son çalışma ${formatRelative(r.lastRunAt)}` : 'henüz çalışmadı'}
              </p>

              {canWrite && (
                <div className="mt-2">
                  <RunBoostRuleButton ruleId={r.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function describe(r: BoostRuleRecord): string {
  const parts = r.conditions.map(
    (c) =>
      `${BOOST_METRIC_META[c.metric].label} ${c.operator === 'gte' ? '≥' : '>'} ${c.value}${
        BOOST_METRIC_META[c.metric].unit === 'percent' ? '%' : ''
      }`,
  );
  const joined = parts.join(r.combinator === 'and' ? ' VE ' : ' VEYA ');
  return `${r.minPostAgeHours}–${r.maxPostAgeHours} saatlik gönderilerden ${joined} olanları ${r.durationDays} gün boost et.`;
}

const STATUS_TONE: Record<BoostStatus, string> = {
  candidate: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-sky-50 text-sky-700 ring-sky-200',
  rejected: 'bg-slate-100 text-slate-600 ring-slate-200',
  creating: 'bg-sky-50 text-sky-700 ring-sky-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function StatusChip({ status }: { status: BoostStatus }) {
  return <Chip cls={STATUS_TONE[status]}>{BOOST_STATUS_LABELS[status]}</Chip>;
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-ink-muted">{label}:</span>{' '}
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz boost kuralı yok</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
        Auto-Boost, iyi giden organik gönderileri bulup reklama çevirir. Kural gönderiyi
        seçer, sen onaylarsın, sistem kampanyayı açar.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
        Her aday <strong>onay bekler</strong> ve onay düğmesinde taahhüt edilecek toplam
        tutar yazar. Kuralın aylık bir harcama tavanı var; tavan dolduğunda yeni aday
        üretilmez.
      </p>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'error'
      ? 'bg-rose-50 text-rose-800 ring-rose-200'
      : 'bg-amber-50 text-amber-900 ring-amber-200';
  return <div className={`rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${cls}`}>{children}</div>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
