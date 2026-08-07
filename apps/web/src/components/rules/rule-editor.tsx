'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ACTION_LABELS,
  METRIC_META,
  OPERATOR_LABELS,
  RULE_ACTIONS,
  RULE_LEVELS,
  RULE_LEVEL_LABELS,
  RULE_METRICS,
  RULE_OPERATORS,
  RULE_WINDOWS,
  WINDOW_LABELS,
  type RuleCondition,
  type RuleRecord,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Kural düzenleyici.
 *
 * TASARIM KARARI: kuralın ne yapacağı düz Türkçe bir cümle olarak ekranda
 * duruyor ve girdilerle birlikte güncelleniyor. Sebep, bu modülün temel
 * asimetrisi: anlamadığı bir kuralı canlıya alan kişi müşterinin
 * kampanyalarını durdurabilir. Formu doldurabilmek yeterli değil, ne
 * yazdığını okuyabilmek gerekiyor.
 */

const EMPTY_CONDITION: RuleCondition = {
  metric: 'cpa',
  operator: 'gt',
  value: 250,
  window: 'last_7d',
};

export function RuleEditor({
  clientId,
  accounts,
  existing,
  onDone,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string }>;
  existing?: RuleRecord;
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(existing?.name ?? '');
  const [adAccountId, setAdAccountId] = useState(existing?.adAccountId ?? '');
  const [level, setLevel] = useState<RuleRecord['level']>(existing?.level ?? 'campaign');
  const [combinator, setCombinator] = useState<'and' | 'or'>(existing?.combinator ?? 'and');
  const [conditions, setConditions] = useState<RuleCondition[]>(
    existing?.conditions ?? [EMPTY_CONDITION],
  );
  const [actionType, setActionType] = useState<RuleRecord['action']['type']>(
    existing?.action.type ?? 'pause',
  );
  const [percent, setPercent] = useState(
    existing?.action.type === 'adjust_budget' ? String(existing.action.percent) : '-20',
  );
  const [maxBudget, setMaxBudget] = useState(
    existing?.action.type === 'adjust_budget' && existing.action.maxBudget !== undefined
      ? String(existing.action.maxBudget)
      : '',
  );
  const [minImpressions, setMinImpressions] = useState(
    String(existing?.guard.minImpressions ?? 1000),
  );
  const [minClicks, setMinClicks] = useState(String(existing?.guard.minClicks ?? 20));
  const [minDaysWithData, setMinDaysWithData] = useState(
    String(existing?.guard.minDaysWithData ?? 0),
  );
  const [cooldownMinutes, setCooldownMinutes] = useState(
    String(existing?.cooldownMinutes ?? 1440),
  );
  const [maxActionsPerRun, setMaxActionsPerRun] = useState(
    String(existing?.maxActionsPerRun ?? 20),
  );

  const budgetConditionAtWrongLevel =
    level !== 'campaign' && conditions.some((c) => c.metric === 'budget_spent_ratio');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const action =
        actionType === 'adjust_budget'
          ? {
              type: 'adjust_budget' as const,
              percent: Number(percent),
              ...(maxBudget.trim() ? { maxBudget: Number(maxBudget) } : {}),
            }
          : { type: actionType };

      const body = {
        name: name.trim(),
        clientId,
        adAccountId: adAccountId || null,
        level,
        conditions,
        combinator,
        action,
        guard: {
          minImpressions: Number(minImpressions),
          minClicks: Number(minClicks),
          minSpend: 0,
          minDaysWithData: Number(minDaysWithData),
        },
        cooldownMinutes: Number(cooldownMinutes),
        maxActionsPerRun: Number(maxActionsPerRun),
        maxDataAgeHours: existing?.maxDataAgeHours ?? 36,
        enabled: existing?.enabled ?? true,
      };

      if (existing) {
        await apiFetch(`/rules/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/rules', { method: 'POST', body: JSON.stringify(body) });
      }
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kural kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  function patchCondition(index: number, patch: Partial<RuleCondition>): void {
    setConditions((cs) => cs.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">
        {existing ? 'Kuralı düzenle' : 'Yeni kural'}
      </h2>

      {existing && !existing.dryRun && (
        // CANLI BİR KURALI DÜZENLEMEK ONU PROVAYA DÖNDÜRÜYOR. Sunucu bunu
        // koşul ya da aksiyon değiştiğinde yapıyor; kullanıcı bunu kaydettikten
        // SONRA öğrenmemeli.
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          Bu kural <strong>canlı</strong>. Koşulu ya da aksiyonu değiştirirsen kural provaya
          döner ve yeniden canlıya alman gerekir.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Kural adı">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="EBM koruması"
            className={inputCls}
          />
        </Field>

        <Field label="Reklam hesabı">
          <select
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            className={inputCls}
          >
            <option value="">Tüm hesaplar</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Seviye">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as RuleRecord['level'])}
            className={inputCls}
          >
            {RULE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {RULE_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Koşullar nasıl birleşsin">
          <select
            value={combinator}
            onChange={(e) => setCombinator(e.target.value as 'and' | 'or')}
            className={inputCls}
          >
            <option value="and">Hepsi sağlanmalı (VE)</option>
            <option value="or">Biri yeterli (VEYA)</option>
          </select>
        </Field>
      </div>

      {/* Koşullar */}
      <div className="mt-5">
        <p className={labelCls}>Koşullar</p>
        <div className="mt-1.5 space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={c.metric}
                onChange={(e) =>
                  patchCondition(i, { metric: e.target.value as RuleCondition['metric'] })
                }
                className={`${inputCls} w-auto`}
                title={METRIC_META[c.metric].hint}
              >
                {RULE_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_META[m].label}
                  </option>
                ))}
              </select>

              <select
                value={c.operator}
                onChange={(e) =>
                  patchCondition(i, { operator: e.target.value as RuleCondition['operator'] })
                }
                className={`${inputCls} w-auto`}
              >
                {RULE_OPERATORS.map((o) => (
                  <option key={o} value={o}>
                    {OPERATOR_LABELS[o]}
                  </option>
                ))}
              </select>

              <input
                type="text"
                inputMode="decimal"
                value={String(c.value)}
                onChange={(e) =>
                  patchCondition(i, { value: Number(e.target.value.replace(',', '.')) || 0 })
                }
                className={`${inputCls} w-24`}
              />

              <select
                value={c.window}
                onChange={(e) =>
                  patchCondition(i, { window: e.target.value as RuleCondition['window'] })
                }
                className={`${inputCls} w-auto`}
              >
                {RULE_WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {WINDOW_LABELS[w]}
                  </option>
                ))}
              </select>

              {conditions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}
                  className="rounded-lg px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                >
                  Kaldır
                </button>
              )}
            </div>
          ))}
        </div>

        {conditions.length < 5 && (
          <button
            type="button"
            onClick={() => setConditions((cs) => [...cs, EMPTY_CONDITION])}
            className="mt-2 rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:bg-surface-sunken"
          >
            + Koşul ekle
          </button>
        )}

        {budgetConditionAtWrongLevel && (
          <p className="mt-2 text-xs text-rose-700">
            Bütçe tüketimi koşulu yalnızca kampanya seviyesinde kullanılabilir — bütçe
            kampanya/hesap seviyesinde tanımlı, tek bir reklamın bütçe tüketimi yok.
          </p>
        )}
      </div>

      {/* Aksiyon */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Aksiyon">
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as RuleRecord['action']['type'])}
            className={inputCls}
          >
            {RULE_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>

        {actionType === 'adjust_budget' && (
          <>
            <Field label="Değişim (%)">
              <input
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="-20"
                className={inputCls}
              />
            </Field>
            <Field label="Bütçe tavanı (opsiyonel)">
              <input
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="boş = tavan yok"
                className={inputCls}
              />
              {/* Yüzdesel artışın bileşik etkisi hızlı: günde %20 artan bir
                  bütçe bir haftada 3,5 katına çıkıyor. */}
              <p className="mt-1 text-[11px] text-ink-muted">
                Artış kuralında tavan koymazsan bütçe her turda büyümeye devam eder.
              </p>
            </Field>
          </>
        )}
      </div>

      {/* Korumalar */}
      <details className="mt-5 rounded-lg border border-line">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink">
          Güvenlik eşikleri
        </summary>
        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
          <Field label="En az gösterim">
            <input
              type="number"
              value={minImpressions}
              onChange={(e) => setMinImpressions(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="En az tıklama">
            <input
              type="number"
              value={minClicks}
              onChange={(e) => setMinClicks(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Pencerede en az kaç gün veri">
            <input
              type="number"
              value={minDaysWithData}
              onChange={(e) => setMinDaysWithData(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Bekleme süresi (dk)">
            <input
              type="number"
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Tek turda azami aksiyon">
            <input
              type="number"
              value={maxActionsPerRun}
              onChange={(e) => setMaxActionsPerRun(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <p className="border-t border-line px-3 py-2 text-[11px] text-ink-muted">
          Örneklem eşikleri kuralın gürültüyle tetiklenmesini engelliyor: 3 tıklama almış bir
          reklamın EBM&apos;si sonsuzdur ve eşik olmadan durdurulur. Bekleme süresi aynı
          varlığın açılıp kapanmasını engelliyor — Meta böyle bir reklamı öğrenme aşamasına
          geri atıyor.
        </p>
      </details>

      {/* Kuralın düz Türkçe özeti */}
      <div className="mt-5 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs text-ink">
        <span className="font-medium">Bu kural şunu yapacak: </span>
        {summarize({ level, conditions, combinator, actionType, percent })}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !name.trim() || budgetConditionAtWrongLevel}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Vazgeç
        </button>
      </div>

      <p className="mt-3 text-[11px] text-ink-muted">
        Yeni kurallar <strong>prova modunda</strong> başlar: ne yapacaklarını gösterir ama
        hiçbir şeye dokunmazlar. Canlıya almak ayrı bir yetki gerektiriyor.
      </p>
    </div>
  );
}

/**
 * Kuralı düz Türkçeye çevirir.
 *
 * Formu doldurabilmek, kuralın ne yaptığını anlamak demek değil. Bu cümle
 * kullanıcının yazdığını okumasını sağlıyor — canlıya alma kararı bunun
 * üzerine veriliyor.
 */
function summarize(p: {
  level: RuleRecord['level'];
  conditions: RuleCondition[];
  combinator: 'and' | 'or';
  actionType: RuleRecord['action']['type'];
  percent: string;
}): string {
  const parts = p.conditions.map(
    (c) =>
      `${METRIC_META[c.metric].label} ${OPERATOR_LABELS[c.operator]} ${c.value} (${WINDOW_LABELS[c.window].toLowerCase()})`,
  );
  const joined = parts.join(p.combinator === 'and' ? ' VE ' : ' VEYA ');

  const action =
    p.actionType === 'adjust_budget'
      ? `bütçesini %${Math.abs(Number(p.percent) || 0)} ${Number(p.percent) < 0 ? 'azalt' : 'artır'}`
      : p.actionType === 'pause'
        ? 'duraklat'
        : p.actionType === 'resume'
          ? 'yeniden başlat'
          : 'yalnızca bildir';

  return `${RULE_LEVEL_LABELS[p.level]} bazında, ${joined} olan varlıkları ${action}.`;
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wide text-ink-muted';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`${labelCls} mb-1`}>{label}</span>
      {children}
    </label>
  );
}
