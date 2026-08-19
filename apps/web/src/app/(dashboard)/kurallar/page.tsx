import Link from 'next/link';
import {
  ACTION_LABELS,
  METRIC_META,
  OPERATOR_LABELS,
  OUTCOME_LABELS,
  RULE_LEVEL_LABELS,
  WINDOW_LABELS,
  type ActionOutcome,
  type RuleActionRecord,
  type RuleRecord,
  type RuleRunRecord,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { NewRuleButton, RuleControls } from '@/components/rules/rule-controls';

export const metadata = { title: 'Kurallar — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Modül 5 — Kural motoru.
 *
 * SAYFANIN TAŞIDIĞI TEK MESAJ: bu kurallar müşterinin hesabında gerçekten iş
 * yapıyor. Prova/canlı ayrımı listede en görünür şey; kuralın koşulu düz
 * Türkçe yazılı; son turda ne olduğu tek tık uzakta.
 *
 * Sebep, modülün temel asimetrisi: yanlış rapor düzeltilebilir, yanlış
 * durdurulan kampanyanın kaçırdığı satış geri gelmez.
 */
export default async function RulesPage({
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
        <p className="mt-2 text-sm text-ink-muted">Kurallar müşteri bazında tanımlanıyor.</p>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'rule.write');
  const canActivate = hasPermission(session, 'rule.activate');

  const [rules, connections] = await Promise.all([
    serverApiFetch<RuleRecord[]>(`/rules?clientId=${clientId}`).catch(() => null),
    // Hesap listesi BAĞLANTI üzerinden geliyor: ayrı bir uç nokta açmak,
    // aynı bilgiyi iki yerden servis etmek olurdu. Bağlantı özeti hesapları
    // zaten iç içe döndürüyor.
    serverApiFetch<Array<{ adAccounts: Array<{ id: string; name: string }> }>>(
      `/connections?clientId=${clientId}`,
    ).catch(() => []),
  ]);
  const accounts = connections.flatMap((c) => c.adAccounts ?? []);

  const openRuleId = first(params.kural);
  const detail = openRuleId
    ? await serverApiFetch<RuleRunRecord[]>(`/rules/${openRuleId}/runs`).catch(() => null)
    : null;
  const lastRun = detail?.[0];
  const actions = lastRun
    ? await serverApiFetch<RuleActionRecord[]>(`/rules/runs/${lastRun.id}/actions`).catch(
        () => null,
      )
    : null;

  const clientName = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Müşteri';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Kurallar</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {clientName} · saatte bir değerlendiriliyor
          </p>
        </div>
        {canWrite && <NewRuleButton clientId={clientId} accounts={accounts} />}
      </header>


      {rules === null ? (
        <Notice tone="error">Kurallar alınamadı.</Notice>
      ) : rules.length === 0 ? (
        <EmptyState canWrite={canWrite} />
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              clientId={clientId}
              accounts={accounts}
              canWrite={canWrite}
              canActivate={canActivate}
              open={r.id === openRuleId}
              runs={r.id === openRuleId ? detail : null}
              actions={r.id === openRuleId ? actions : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  clientId,
  accounts,
  canWrite,
  canActivate,
  open,
  runs,
  actions,
}: {
  rule: RuleRecord;
  clientId: string;
  accounts: Array<{ id: string; name: string }>;
  canWrite: boolean;
  canActivate: boolean;
  open: boolean;
  runs: RuleRunRecord[] | null;
  actions: RuleActionRecord[] | null;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{rule.name}</h2>
            <ModeChip dryRun={rule.dryRun} enabled={rule.enabled} />
          </div>

          {/* KURALIN NE YAPTIĞI DÜZ TÜRKÇE.
              JSON koşul dizisini göstermek, kuralı canlıya alacak kişiden
              onu okuyabilmesini beklemek olurdu. */}
          <p className="mt-1.5 text-sm text-ink-muted">{describe(rule)}</p>

          <p className="mt-1 text-[11px] text-ink-muted">
            {rule.adAccountName ?? 'Tüm hesaplar'} ·{' '}
            {rule.lastRunAt ? `son çalışma ${formatRelative(rule.lastRunAt)}` : 'henüz çalışmadı'}
            {rule.lastTriggeredAt && ` · son aksiyon ${formatRelative(rule.lastTriggeredAt)}`}
          </p>
        </div>

        <Link
          href={open ? '/kurallar' : `/kurallar?kural=${rule.id}`}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          {open ? 'Geçmişi gizle' : 'Geçmiş'}
        </Link>
      </div>

      {canWrite && (
        <div className="mt-3">
          <RuleControls
            rule={rule}
            clientId={clientId}
            accounts={accounts}
            canActivate={canActivate}
          />
        </div>
      )}

      {open && <RunHistory runs={runs} actions={actions} />}
    </section>
  );
}

function RunHistory({
  runs,
  actions,
}: {
  runs: RuleRunRecord[] | null;
  actions: RuleActionRecord[] | null;
}) {
  if (runs === null) return <p className="mt-4 text-xs text-ink-muted">Geçmiş alınamadı.</p>;
  if (runs.length === 0) {
    return <p className="mt-4 text-xs text-ink-muted">Bu kural henüz hiç çalışmadı.</p>;
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <h3 className="text-xs font-semibold text-ink">Son turlar</h3>
      <ul className="mt-2 space-y-1">
        {runs.slice(0, 5).map((run) => (
          <li key={run.id} className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
            <span>{formatRelative(run.startedAt)}</span>
            <span>·</span>
            <span>{run.evaluatedCount} varlık incelendi</span>
            <span>·</span>
            <span>{run.matchedCount} eşleşti</span>
            <span>·</span>
            <span className={run.actionCount > 0 ? 'font-medium text-ink' : ''}>
              {run.actionCount} aksiyon
            </span>
            {run.dryRun && <span className="text-ink-muted">(prova)</span>}
            {run.error && <span className="text-rose-700">hata: {run.error}</span>}
          </li>
        ))}
      </ul>

      {actions && actions.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold text-ink">Son turdaki kararlar</h3>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3">
                      <span className="font-medium text-ink">{a.entityName}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <OutcomeChip outcome={a.outcome} />
                    </td>
                    {/* GEREKÇE HER SATIRDA. "Kuralım neden bunu durdurdu"
                        ve "neden bunu atladı" aynı yerde cevaplanıyor. */}
                    <td className="py-1.5 text-ink-muted">{a.error ?? a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {actions !== null && actions.length === 0 && (
        <p className="mt-3 text-[11px] text-ink-muted">
          Son turda hiçbir varlık koşulu sağlamadı — kural çalıştı, yapacak bir şey bulamadı.
        </p>
      )}
    </div>
  );
}

function ModeChip({ dryRun, enabled }: { dryRun: boolean; enabled: boolean }) {
  if (!enabled) {
    return <Chip cls="bg-slate-100 text-slate-600 ring-slate-200">Kapalı</Chip>;
  }
  return dryRun ? (
    <Chip cls="bg-sky-50 text-sky-700 ring-sky-200">Prova</Chip>
  ) : (
    <Chip cls="bg-emerald-50 text-emerald-700 ring-emerald-200">Canlı</Chip>
  );
}

const OUTCOME_TONE: Record<ActionOutcome, string> = {
  applied: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  simulated: 'bg-sky-50 text-sky-700 ring-sky-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  skipped_cooldown: 'bg-slate-100 text-slate-600 ring-slate-200',
  skipped_guard: 'bg-slate-100 text-slate-600 ring-slate-200',
  skipped_stale_data: 'bg-amber-50 text-amber-800 ring-amber-200',
  skipped_no_budget: 'bg-amber-50 text-amber-800 ring-amber-200',
  skipped_capped: 'bg-amber-50 text-amber-800 ring-amber-200',
  skipped_noop: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function OutcomeChip({ outcome }: { outcome: ActionOutcome }) {
  return <Chip cls={OUTCOME_TONE[outcome]}>{OUTCOME_LABELS[outcome]}</Chip>;
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

/** Kuralı düz Türkçeye çevirir — kart başlığının altındaki cümle. */
function describe(rule: RuleRecord): string {
  const parts = rule.conditions.map(
    (c) =>
      `${METRIC_META[c.metric].label} ${OPERATOR_LABELS[c.operator]} ${c.value} (${WINDOW_LABELS[
        c.window
      ].toLowerCase()})`,
  );
  const joined = parts.join(rule.combinator === 'and' ? ' VE ' : ' VEYA ');
  const action =
    rule.action.type === 'adjust_budget'
      ? `bütçesini %${Math.abs(rule.action.percent)} ${rule.action.percent < 0 ? 'azalt' : 'artır'}`
      : ACTION_LABELS[rule.action.type].toLowerCase();
  return `${RULE_LEVEL_LABELS[rule.level]} bazında, ${joined} olanları ${action}.`;
}

function EmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz kural yok</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
        Kurallar reklam hesabını sürekli izler ve tanımladığın eşikler aşıldığında kampanyayı
        duraklatır, yeniden başlatır ya da bütçesini değiştirir.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
        Yeni kurallar <strong>prova modunda</strong> başlar: ne yapacaklarını gösterir ama
        hiçbir şeye dokunmazlar. Bir kuralı birkaç gün provada izleyip sonra canlıya almak
        önerilen yol.
      </p>
      {!canWrite && (
        <p className="mt-3 text-xs text-ink-muted">
          Kural oluşturmak için yetkin yok — yöneticinden `rule.write` izni isteyebilirsin.
        </p>
      )}
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
