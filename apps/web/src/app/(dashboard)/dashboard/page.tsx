import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';

interface RlsHealth {
  contextApplied: boolean;
  protectedTables: Array<{ table: string; policies: number }>;
  tablesWithoutRls: string[];
  healthy: boolean;
}

export const metadata = { title: 'Genel Bakış — Advetics' };

export default async function DashboardPage() {
  const session = await requireSession();
  const rls = await serverApiFetch<RlsHealth>('/health/rls').catch(() => null);

  const activeClient = session.memberships.find((m) => m.clientId === session.activeClientId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Merhaba, {session.user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {activeClient?.clientName
            ? `${activeClient.clientName} görünümündesiniz.`
            : 'Organizasyon geneli görünümdesiniz.'}
        </p>
      </div>

      {/* Modül 1 durum kartı */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold">Modül 1 — Kiracılık & Güvenlik</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Stat label="Organizasyon" value={session.organization.name} />
          <Stat label="Plan" value={session.organization.plan} />
          <Stat
            label="Rolünüz"
            value={session.isOrgAdmin ? 'Organizasyon yöneticisi' : 'Müşteri düzeyi erişim'}
          />
          <Stat label="Erişilebilir müşteri" value={String(session.memberships.length)} />
        </dl>
      </section>

      {/* RLS sağlık kartı — bu kart bilerek kullanıcıya görünür.
          RLS'in sessizce devre dışı kalması, bu üründeki en pahalı hatadır. */}
      <section
        className={`rounded-xl border p-5 ${
          rls?.healthy
            ? 'border-emerald-200 bg-emerald-50/50'
            : 'border-amber-300 bg-amber-50/60'
        }`}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              rls?.healthy ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          Veritabanı satır güvenliği (RLS)
        </h2>

        {rls ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-[var(--text-muted)]">
              {rls.protectedTables.length} tablo politika ile korunuyor · Bağlam{' '}
              {rls.contextApplied ? 'uygulanıyor' : 'UYGULANMIYOR'}
            </p>
            {rls.tablesWithoutRls.length > 0 && (
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-amber-900">
                Korumasız tablo: <strong>{rls.tablesWithoutRls.join(', ')}</strong> —
                {' '}<code className="text-xs">pnpm db:rls</code> çalıştırın.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-amber-800">
            Durum okunamadı. API çalışıyor mu?
          </p>
        )}
      </section>

      {/* Yol haritası */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold">Yol haritası</h2>
        <ol className="mt-4 space-y-2.5 text-sm">
          <RoadmapItem n={1} title="Auth + multi-tenant iskelet + RLS" done />
          <RoadmapItem n={2} title="Platform bağlantıları (Meta & Google OAuth)" />
          <RoadmapItem n={3} title="Sync worker'ları + Unified Dashboard" />
          <RoadmapItem n={4} title="Ads Explorer" />
          <RoadmapItem n={5} title="Kurallar Motoru" />
          <RoadmapItem n={6} title="White-Label Raporlama" />
          <RoadmapItem n={7} title="Auto-Boost (Meta)" />
          <RoadmapItem n={8} title="Toplu Kampanya Oluşturucu" />
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function RoadmapItem({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? 'bg-[var(--brand-primary)] text-white'
            : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span className={done ? 'font-medium' : 'text-[var(--text-muted)]'}>{title}</span>
    </li>
  );
}
