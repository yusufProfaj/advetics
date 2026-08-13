import Link from 'next/link';
import {
  BULK_BATCH_STATUS_LABELS,
  BULK_ITEM_STATUS_LABELS,
  type BulkBatchDetail,
  type BulkBatchRecord,
  type BulkBatchStatus,
  type BulkItemStatus,
  type AssetListResult,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { BulkComposer, PublishButton } from '@/components/bulk/bulk-composer';

export const metadata = { title: 'Toplu Oluşturucu — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Modül 8 — Toplu Oluşturucu.
 *
 * SAYFANIN TAŞIDIĞI TEK MESAJ: sorunlar YAYINDAN ÖNCE görünür. Geçersiz
 * satırlar gerekçeleriyle listede duruyor, yayın düğmesi yalnızca geçerli
 * satır sayısını gösteriyor ve yayınlanan reklamlar duraklatılmış açılıyor.
 *
 * Bu modülün asıl değeri hız değil, 41. satırda patlamamak.
 */
export default async function BulkPage({
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
      </div>
    );
  }

  const canWrite = hasPermission(session, 'bulk.write');
  const canPublish = hasPermission(session, 'bulk.publish');

  const [batches, connections, library] = await Promise.all([
    serverApiFetch<BulkBatchRecord[]>(`/bulk?clientId=${clientId}`).catch(() => null),
    serverApiFetch<Array<{ adAccounts: Array<{ id: string; name: string }> }>>(
      `/connections?clientId=${clientId}`,
    ).catch(() => []),
    // Arşiv adları: yalnızca reklam görselleri. Logolar Meta reklamında
    // kullanılmıyor ve listede yer kaplamamalı.
    serverApiFetch<AssetListResult>(
      `/assets?clientId=${clientId}&kind=image&limit=200&offset=0`,
    ).catch(() => null),
  ]);
  const accounts = connections.flatMap((c) => c.adAccounts ?? []);

  const openId = first(params.parti);
  const detail = openId
    ? await serverApiFetch<BulkBatchDetail>(`/bulk/${openId}`).catch(() => null)
    : null;

  const clientName = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Müşteri';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Toplu Oluşturucu</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{clientName}</p>
        </div>
        {canWrite && accounts.length > 0 && (
          <BulkComposer
            clientId={clientId}
            accounts={accounts}
            assetNames={(library?.rows ?? []).map((a) => a.name)}
          />
        )}
      </header>

      {session.availableClients.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {session.availableClients.map((c) => (
            <Link
              key={c.id}
              href={`/toplu-olustur?musteri=${c.id}`}
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

      {batches === null ? (
        <Notice>Partiler alınamadı.</Notice>
      ) : batches.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              open={b.id === openId}
              detail={b.id === openId ? detail : null}
              canPublish={canPublish}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchCard({
  batch,
  open,
  detail,
  canPublish,
}: {
  batch: BulkBatchRecord;
  open: boolean;
  detail: BulkBatchDetail | null;
  canPublish: boolean;
}) {
  const ready = batch.counts.pending + batch.counts.failed;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{batch.name}</h2>
            <BatchChip status={batch.status} />
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            {batch.adAccountName} · {batch.itemCount} satır ·{' '}
            {batch.publishedAt
              ? `yayınlandı ${formatRelative(batch.publishedAt)}`
              : `oluşturuldu ${formatRelative(batch.createdAt)}`}
          </p>

          {/* DURUM ŞERİDİ — hangi satırın nerede olduğu tek bakışta. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(batch.counts) as BulkItemStatus[])
              .filter((s) => batch.counts[s] > 0)
              .map((s) => (
                <ItemChip key={s} status={s} count={batch.counts[s]} />
              ))}
          </div>
        </div>

        <Link
          href={open ? '/toplu-olustur' : `/toplu-olustur?parti=${batch.id}`}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          {open ? 'Gizle' : 'Satırları gör'}
        </Link>
      </div>

      {canPublish && ready > 0 && (
        <div className="mt-3">
          <PublishButton
            batchId={batch.id}
            readyCount={ready}
            invalidCount={batch.counts.invalid}
          />
        </div>
      )}

      {open && detail && <ItemTable detail={detail} />}
      {open && detail === null && (
        <p className="mt-3 text-xs text-ink-muted">Satırlar alınamadı.</p>
      )}
    </section>
  );
}

function ItemTable({ detail }: { detail: BulkBatchDetail }) {
  return (
    <div className="mt-4 overflow-x-auto border-t border-line pt-3">
      <table className="w-full min-w-[760px] text-xs">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-2 py-1.5 font-medium">#</th>
            <th className="px-2 py-1.5 font-medium">Reklam</th>
            <th className="px-2 py-1.5 font-medium">Durum</th>
            <th className="px-2 py-1.5 font-medium">Sorunlar</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item) => (
            <tr key={item.id} className="border-b border-line/60 last:border-0 align-top">
              <td className="px-2 py-2 text-ink-muted">{item.rowNumber}</td>
              <td className="px-2 py-2">
                <div className="font-medium text-ink">{item.name}</div>
                {item.headline && (
                  <div className="mt-0.5 max-w-[280px] truncate text-ink-muted">
                    {item.headline}
                  </div>
                )}
                {item.externalAdId && (
                  <div className="mt-0.5 text-[11px] text-ink-muted">
                    Meta ID: {item.externalAdId}
                  </div>
                )}
              </td>
              <td className="px-2 py-2">
                <ItemChip status={item.status} />
              </td>
              <td className="px-2 py-2">
                {/* SORUNLAR SATIRIN YANINDA ve gerekçeli. "Geçersiz" deyip
                    nedenini söylememek, kullanıcıyı tahminle düzeltmeye
                    zorlardı. */}
                {item.error && <p className="text-rose-700">{item.error}</p>}
                {item.issues.map((issue, i) => (
                  <p
                    key={i}
                    className={issue.severity === 'error' ? 'text-rose-700' : 'text-amber-700'}
                  >
                    {issue.message}
                  </p>
                ))}
                {!item.error && item.issues.length === 0 && (
                  <span className="text-ink-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BATCH_TONE: Record<BulkBatchStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  validated: 'bg-sky-50 text-sky-700 ring-sky-200',
  publishing: 'bg-sky-50 text-sky-700 ring-sky-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const ITEM_TONE: Record<BulkItemStatus, string> = {
  pending: 'bg-sky-50 text-sky-700 ring-sky-200',
  invalid: 'bg-rose-50 text-rose-700 ring-rose-200',
  publishing: 'bg-sky-50 text-sky-700 ring-sky-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function BatchChip({ status }: { status: BulkBatchStatus }) {
  return <Chip cls={BATCH_TONE[status]}>{BULK_BATCH_STATUS_LABELS[status]}</Chip>;
}

function ItemChip({ status, count }: { status: BulkItemStatus; count?: number }) {
  return (
    <Chip cls={ITEM_TONE[status]}>
      {count !== undefined && `${count} `}
      {BULK_ITEM_STATUS_LABELS[status]}
    </Chip>
  );
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

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz parti yok</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-ink-muted">
        Reklam metinlerini Excel veya Sheets&apos;te hazırla, buraya yapıştır. Her satır
        kaydedilirken doğrulanır: karakter sınırı, geçersiz URL, eksik görsel, bilinmeyen
        eylem düğmesi.
      </p>
      <p className="mx-auto mt-2 max-w-xl text-xs text-ink-muted">
        Yayınlamak ayrı bir adım ve reklamlar <strong>duraklatılmış</strong> açılır — 60
        reklamın hepsinin aynı anda harcamaya başlaması, yanlış bir satırı fark etmeden para
        yakmak olurdu.
      </p>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
      {children}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
