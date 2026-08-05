import type { ConnectionSummary, ProviderAvailability } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { ConnectButtons } from '@/components/connect-buttons';
import { ConnectionCard } from '@/components/connection-card';
import { CallbackBanner } from '@/components/callback-banner';

export const metadata = { title: 'Platform Bağlantıları — Advetics' };

export default async function ConnectionsPage() {
  const session = await requireSession();

  const [availability, connections] = await Promise.all([
    serverApiFetch<ProviderAvailability[]>('/connections/availability').catch(() => []),
    session.activeClientId
      ? serverApiFetch<ConnectionSummary[]>('/connections').catch(() => [])
      : Promise.resolve([]),
  ]);

  const activeClient = session.memberships.find((m) => m.clientId === session.activeClientId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Bağlantıları</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Meta ve Google Ads hesaplarını bağla, hangi reklam hesaplarının izleneceğini seç.
        </p>
      </div>

      <CallbackBanner />

      {/* Bağlantılar müşteri bazlıdır — seçim yapılmadan işlem yapılamaz. */}
      {!session.activeClientId ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-5">
          <h2 className="text-sm font-semibold">Önce bir müşteri seç</h2>
          <p className="mt-1.5 text-sm text-amber-900">
            Bağlantılar müşteri bazında kurulur — her müşterinin kendi Meta ve Google
            hesapları vardır. Üstteki seçiciden bir müşteri seç.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold">
              Yeni bağlantı{activeClient?.clientName ? ` — ${activeClient.clientName}` : ''}
            </h2>
            <ConnectButtons availability={availability} />
          </section>

          {connections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-sm text-ink-muted">
                Bu müşteri için henüz bağlantı yok. Yukarıdan başla.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map((c) => (
                <ConnectionCard key={c.id} connection={c} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Onay süreçleri koda paralel yürümek zorunda — bu yüzden panelde görünür. */}
      <section className="rounded-xl border border-line bg-surface-muted p-5">
        <h2 className="text-sm font-semibold">Platform onayları</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Bağlantılar teknik olarak hazır, ama platformlar üretim erişimi için onay ister.
          Bu süreçler 2–6 hafta sürüyor ve geliştirmeye paralel yürütülmeli.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            <strong>Meta App Review</strong> — <code className="text-xs">ads_management</code>,{' '}
            <code className="text-xs">ads_read</code>,{' '}
            <code className="text-xs">business_management</code>,{' '}
            <code className="text-xs">pages_read_engagement</code>,{' '}
            <code className="text-xs">instagram_manage_insights</code> · Business Verification
            ve ekran kaydı demo zorunlu
          </li>
          <li>
            <strong>Meta Tech Provider</strong> — müşteri hesaplarını yönetmek için gerekli
          </li>
          <li>
            <strong>Google Ads Developer Token</strong> — Basic Access onayı olmadan yalnızca
            test hesapları görünür
          </li>
        </ul>
      </section>
    </div>
  );
}
