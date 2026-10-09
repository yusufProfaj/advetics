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
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { hataMetni } from '@/lib/sayfa-yardimcilari';
import { NewRuleButton, RuleControls } from '@/components/rules/rule-controls';
import i from '@/components/taslak/iyilestir.module.css';
import s from '@/components/taslak/taslak.module.css';

export type KurallarSonucu = { durum: 'tamam'; kurallar: RuleRecord[] } | { durum: 'hata'; mesaj: string };

/**
 * ═══ KURALLAR — İYİLEŞTİR'İN ÜÇÜNCÜ SEKMESİ (2026-10-09) ═══
 *
 * Bu içerik `/kurallar` sayfasındaydı ve oradan TAŞINDI, yeniden yazılmadı
 * (PLAN.md): kural kartı, koşulun düz Türkçesi, geçmiş ve son turdaki
 * kararlar aynı. Değişen görünüş: taslaktaki tek kart + satırlar dili
 * (`.kural`, Canlı/Prova rozeti). `/kurallar` buraya yönleniyor.
 *
 * SAYFANIN TAŞIDIĞI TEK MESAJ: bu kurallar müşterinin hesabında gerçekten
 * iş yapıyor. Prova/canlı ayrımı listede en görünür şey; kuralın koşulu düz
 * Türkçe yazılı; son turda ne olduğu tek tık uzakta. Sebep modülün temel
 * asimetrisi: yanlış rapor düzeltilebilir, yanlış durdurulan kampanyanın
 * kaçırdığı satış geri gelmez.
 *
 * Kural listesi ÇAĞIRANDAN geliyor: sekme rozeti de aynı sayıyı gösteriyor
 * ve iki ayrı çağrı aynı ekranda iki farklı sayı gösterebilirdi.
 */
export async function KurallarIcerik({
  sonuc,
  clientId,
  clientAdi,
  canWrite,
  canActivate,
  acikKural,
  adres,
}: {
  sonuc: KurallarSonucu;
  clientId: string;
  clientAdi: string;
  canWrite: boolean;
  canActivate: boolean;
  acikKural: string | undefined;
  /** Geçmişi aç/kapa bağlantısı; sekme ve workspace parametresini taşıyan tek üretici. */
  adres: (kural: string | undefined) => string;
}) {
  /*
   * HESAP LİSTESİ HATASI YUTULMUYOR. Eski sayfa `.catch(() => [])` diyordu:
   * çağrı düşünce kural editörünün hesap seçicisi "hiç hesap yok" gibi boş
   * açılıyordu ve kullanıcı kuralı istemeden "Tüm hesaplar" için
   * kuruyordu. Şimdi sebep kartın üstünde yazıyor.
   */
  let hesapHatasi: string | null = null;
  const connections = await serverApiFetch<Array<{ adAccounts: Array<{ id: string; name: string }> }>>(
    `/connections?clientId=${clientId}`,
  ).catch((e: unknown) => {
    hesapHatasi = hataMetni(e);
    return [];
  });
  const accounts = connections.flatMap((c) => c.adAccounts ?? []);

  const detail = acikKural
    ? await serverApiFetch<RuleRunRecord[]>(`/rules/${acikKural}/runs`).catch(() => null)
    : null;
  const lastRun = detail?.[0];
  const actions = lastRun
    ? await serverApiFetch<RuleActionRecord[]>(`/rules/runs/${lastRun.id}/actions`).catch(() => null)
    : null;

  return (
    <>
      {hesapHatasi && (
        <div className={s.bildirim} role="status">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>Reklam hesapları okunamadı.</strong> {hesapHatasi} Yeni kuralda hesap seçilemez; kural bütün
            hesaplara uygulanır.
          </span>
        </div>
      )}
      <div className={s.kart}>
        <div className={s.kartUst}>
          <h2>Otomatik kurallar</h2>
          <span className={i.zaman}>{clientAdi} · saatte bir değerlendiriliyor</span>
          {canWrite && (
            <div className={i.yeniKural}>
              <NewRuleButton clientId={clientId} accounts={accounts} className={i.birincil} etiket="＋ Kural ekle" />
            </div>
          )}
        </div>
        {sonuc.durum === 'hata' ? (
          <p className={s.hataMetin} role="alert">
            Kurallar alınamadı. {sonuc.mesaj}
          </p>
        ) : sonuc.kurallar.length === 0 ? (
          <EmptyState canWrite={canWrite} />
        ) : (
          sonuc.kurallar.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              clientId={clientId}
              accounts={accounts}
              canWrite={canWrite}
              canActivate={canActivate}
              open={r.id === acikKural}
              runs={r.id === acikKural ? detail : null}
              actions={r.id === acikKural ? actions : null}
              href={adres(r.id === acikKural ? undefined : r.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function RuleRow({
  rule,
  clientId,
  accounts,
  canWrite,
  canActivate,
  open,
  runs,
  actions,
  href,
}: {
  rule: RuleRecord;
  clientId: string;
  accounts: Array<{ id: string; name: string }>;
  canWrite: boolean;
  canActivate: boolean;
  open: boolean;
  runs: RuleRunRecord[] | null;
  actions: RuleActionRecord[] | null;
  href: string;
}) {
  return (
    <section className={i.kural}>
      <div className={i.kuralSatir}>
        <div className={i.ad}>
          <b>{rule.name}</b>
          {/* KURALIN NE YAPTIĞI DÜZ TÜRKÇE. JSON koşul dizisini göstermek,
              kuralı canlıya alacak kişiden onu okuyabilmesini beklemek olurdu. */}
          <small>{describe(rule)}</small>
        </div>
        <ModeChip dryRun={rule.dryRun} enabled={rule.enabled} />
        <span className={i.zaman} style={{ marginLeft: 0 }}>
          {rule.adAccountName ?? 'Tüm hesaplar'} ·{' '}
          {rule.lastRunAt ? `son çalışma ${formatRelative(rule.lastRunAt)}` : 'henüz çalışmadı'}
          {rule.lastTriggeredAt && ` · son aksiyon ${formatRelative(rule.lastTriggeredAt)}`}
        </span>
        <Link href={href} className={i.gecmisBag} scroll={false}>
          {open ? 'Geçmişi gizle' : 'Geçmiş'}
        </Link>
      </div>

      {canWrite && (
        <div className={i.kuralIc}>
          <RuleControls rule={rule} clientId={clientId} accounts={accounts} canActivate={canActivate} />
        </div>
      )}

      {open && <RunHistory runs={runs} actions={actions} />}
    </section>
  );
}

function RunHistory({ runs, actions }: { runs: RuleRunRecord[] | null; actions: RuleActionRecord[] | null }) {
  if (runs === null) return <p className="mt-4 text-xs text-danger-strong">Geçmiş alınamadı.</p>;
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
            <span className={run.actionCount > 0 ? 'font-medium text-ink' : ''}>{run.actionCount} aksiyon</span>
            {run.dryRun && <span className="text-ink-muted">(prova)</span>}
            {run.error && <span className="text-danger-strong">hata: {run.error}</span>}
          </li>
        ))}
      </ul>
      {/* SESSİZ KESME YOK: beşten fazla tur varsa kaç tane olduğu yazıyor. */}
      {runs.length > 5 && <p className="mt-1 text-[11px] text-ink-muted">Son 5 tur gösteriliyor, toplam {runs.length}.</p>}

      {actions === null && <p className="mt-3 text-[11px] text-danger-strong">Son turun kararları alınamadı.</p>}

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
          Son turda hiçbir varlık koşulu sağlamadı. Kural çalıştı, yapacak bir şey bulamadı.
        </p>
      )}
    </div>
  );
}

/** Taslaktaki rozet: Canlı yeşil (durum göstergesi), Prova gri. */
function ModeChip({ dryRun, enabled }: { dryRun: boolean; enabled: boolean }) {
  if (!enabled) return <span className={`${i.mod} ${i.modKapali}`}>Kapalı</span>;
  return dryRun ? (
    <span className={`${i.mod} ${i.modDeneme}`}>Prova</span>
  ) : (
    <span className={`${i.mod} ${i.modCanli}`}>Canlı</span>
  );
}

const OUTCOME_TONE: Record<ActionOutcome, string> = {
  applied: 'bg-ok-soft text-ok-strong ring-ok/30',
  simulated: 'bg-info-soft text-info-strong ring-info/30',
  failed: 'bg-danger-soft text-danger-strong ring-danger/30',
  skipped_cooldown: 'bg-surface-sunken text-ink-muted ring-line',
  skipped_guard: 'bg-surface-sunken text-ink-muted ring-line',
  skipped_stale_data: 'bg-warn-soft text-warn-strong ring-warn/30',
  skipped_no_budget: 'bg-warn-soft text-warn-strong ring-warn/30',
  skipped_capped: 'bg-warn-soft text-warn-strong ring-warn/30',
  skipped_noop: 'bg-surface-sunken text-ink-muted ring-line',
};

function OutcomeChip({ outcome }: { outcome: ActionOutcome }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${OUTCOME_TONE[outcome]}`}
    >
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}

/** Kuralı düz Türkçeye çevirir — satırın altındaki cümle. */
function describe(rule: RuleRecord): string {
  const parts = rule.conditions.map(
    (c) =>
      `${METRIC_META[c.metric].label} ${OPERATOR_LABELS[c.operator]} ${c.value} (${WINDOW_LABELS[c.window].toLowerCase()})`,
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
    <div className="p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz kural yok</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
        Kurallar reklam hesabını sürekli izler ve tanımladığın eşikler aşıldığında kampanyayı duraklatır, yeniden
        başlatır ya da bütçesini değiştirir.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
        Yeni kurallar <strong>prova modunda</strong> başlar: ne yapacaklarını gösterir ama hiçbir şeye dokunmazlar. Bir
        kuralı birkaç gün provada izleyip sonra canlıya almak önerilen yol.
      </p>
      {!canWrite && (
        <p className="mt-3 text-xs text-ink-muted">
          Kural oluşturmak için yetkin yok; yöneticinden `rule.write` izni isteyebilirsin.
        </p>
      )}
    </div>
  );
}
