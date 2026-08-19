import type { ConnectionSummary, ProviderAvailability } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { ConnectButtons } from '@/components/connect-buttons';
import { ConnectionCard } from '@/components/connection-card';
import { CallbackBanner } from '@/components/callback-banner';

export const metadata = { title: 'Platform Bağlantıları — Advetics' };

export default async function ConnectionsPage() {
  const session = await requireSession();

  /**
   * MÜŞTERİ SEÇİMİ ARTIK ÖN KOŞUL DEĞİL.
   *
   * Bağlantı ajansa ait: Meta bir kez bağlanıyor, eriştiği bütün reklam
   * hesapları havuza düşüyor ve hangisinin hangi müşteriye ait olduğu bu
   * ekranda seçiliyor. Eskiden bu sayfa "önce bir müşteri seç" diyordu ve o
   * model aynı kimliği müşteri başına yeniden yetkilendirmeyi gerektirdiği
   * için bağlantıları koparıyordu.
   *
   * `/connections` müşteri parametresi OLMADAN çağrılıyor: hesapların tamamı,
   * atanmışı ve havuzdakiyle birlikte gelmeli.
   */
  const [availability, connections] = await Promise.all([
    serverApiFetch<ProviderAvailability[]>('/connections/availability').catch(() => []),
    serverApiFetch<ConnectionSummary[]>('/connections').catch(() => []),
  ]);

  const accounts = connections.flatMap((c) => c.adAccounts);
  const pooled = accounts.filter((a) => a.clientId === null).length;
  const assigned = accounts.length - pooled;

  // Sayfalar AYRI sayılıyor: reklam hesabı atamak lead formlarını çalıştırmıyor
  // ve tersi. Tek bir "atanmamış" sayısı, ikisinden hangisinin eksik olduğunu
  // gizlerdi.
  const pooledProfiles = connections
    .flatMap((c) => c.socialProfiles)
    .filter((p) => p.clientId === null).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Bağlantıları</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Meta ve Google Ads hesaplarını <strong>bir kez</strong> bağla; gelen reklam
          hesaplarını müşterilere ata ve hangilerinin izleneceğini seç.
        </p>
      </div>

      <CallbackBanner />

      {/* Bağlantı kurmak bütün müşterileri etkiliyor — API de bunu org
          yöneticisiyle sınırlıyor. Düğmeyi yetkisi olmayana göstermek,
          tıklayınca 403 almak demekti. */}
      {session.isOrgAdmin ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Yeni bağlantı</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Bağlantı ajansa kurulur, müşteriye değil. Aynı hesabı ikinci kez
            yetkilendirmek gerekmez.
          </p>
          <ConnectButtons
            availability={availability}
            activeClientId={session.activeClientId}
            activeClientName={
              session.availableClients.find((c) => c.id === session.activeClientId)?.name ?? null
            }
          />
        </section>
      ) : (
        <div className="rounded-xl border border-line bg-surface-muted p-5">
          <h2 className="text-sm font-semibold">Bağlantı kurma yetkisi yok</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Platform bağlantısı kurmak, kaldırmak ve hesapları müşterilere atamak
            organizasyon yöneticisinin işi. Aşağıdaki listeyi görebilirsin.
          </p>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-muted">Henüz bağlantı yok.</p>
        </div>
      ) : (
        <>
          {/* SESSİZ KESME YOK: kaç hesap havuzda bekliyor, sayıyla yazılıyor.
              Havuzdaki hesap senkronize edilmiyor ve bunu bilmeden "veri
              gelmiyor" diye aramak, bu üründeki en pahalı hata türü. */}
          {(pooled > 0 || pooledProfiles > 0) && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
              {pooled > 0 && (
                <p>
                  <strong>{pooled} reklam hesabı havuzda</strong> — hiçbir müşteriye
                  atanmamış. {assigned} hesap atanmış durumda. Atanmamış hesap
                  senkronize edilmez.
                </p>
              )}
              {pooledProfiles > 0 && (
                <p className={pooled > 0 ? 'mt-1.5' : undefined}>
                  <strong>{pooledProfiles} sayfa/Instagram hesabı havuzda</strong> —
                  atanmamış sayfadan gelen potansiyel müşteri kaydı yazılamaz.
                </p>
              )}
              <p className="mt-1.5 text-xs">Aşağıdan bir müşteriye ata.</p>
            </div>
          )}

          <div className="space-y-4">
            {connections.map((c) => (
              <ConnectionCard
                key={c.id}
                connection={c}
                clients={session.availableClients}
                canManage={session.isOrgAdmin}
              />
            ))}
          </div>
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
