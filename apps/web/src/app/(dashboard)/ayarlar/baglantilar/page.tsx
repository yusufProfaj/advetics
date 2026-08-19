import type { ConnectionSummary, ProviderAvailability } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { ConnectButtons } from '@/components/connect-buttons';
import { ConnectionCard } from '@/components/connection-card';
import { CallbackBanner } from '@/components/callback-banner';
import { WorkspaceSecici } from '@/components/workspace-secici';

export const metadata = { title: 'Platform Bağlantıları — Advetics' };

export default async function ConnectionsPage() {
  const session = await requireSession();

  /**
   * ═══ WORKSPACE SEÇİMİ ÖN KOŞUL ═══
   *
   * Bu sayfa iki kez model değiştirdi ve ikisinin de sebebi yazılı:
   *
   *   1. En başta "önce bir müşteri seç" diyordu. O model aynı Meta kimliğini
   *      müşteri başına yeniden yetkilendirmeyi gerektiriyordu ve platform her
   *      yetkilendirmede öncekinin token'ını geçersiz kıldığı için
   *      bağlantıları KOPARIYORDU.
   *   2. Sonra bağlantı ajansa kuruldu, hesaplar havuza düştü ve bu ekran
   *      hepsini birden gösteriyordu. Ama havuz görünümü şunu üretiyordu:
   *      ekranda ONLARCA müşterinin hesabı yan yana duruyor ve hangisinin
   *      kime ait olduğu ancak satır satır okunarak anlaşılıyordu.
   *
   * Bugünkü model: bağlantı WORKSPACE'e kuruluyor ve her workspace KENDİ
   * platform hesabıyla bağlanıyor — yani 1'deki token çakışması oluşmuyor.
   * Sayfa da buna göre daraltıldı: seçili workspace'in bağlantıları.
   *
   * SEÇİM YOKSA LİSTE HİÇ ÇEKİLMİYOR. Boş bir liste gösterip "bir müşteri
   * seç" demek, kullanıcıya bağlantı olmadığını düşündürürdü; iki hâl aynı
   * ekrana çıkardı.
   */
  const clientId = session.activeClientId;
  const clientName =
    session.availableClients.find((c) => c.id === clientId)?.name ?? null;

  if (!clientId) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Platform Bağlantıları</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Bağlantılar workspace bazında kuruluyor.
          </p>
        </div>
        <WorkspaceSecKapisi clients={session.availableClients} />
      </div>
    );
  }

  const [availability, connections] = await Promise.all([
    serverApiFetch<ProviderAvailability[]>('/connections/availability').catch(() => []),
    serverApiFetch<ConnectionSummary[]>(
      `/connections?clientId=${encodeURIComponent(clientId)}`,
    ).catch(() => []),
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
          <strong className="text-ink">{clientName}</strong> workspace’i için aktif
          bağlantılar. Başka bir workspace için üst bardan müşteriyi değiştir.
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
            Bağlantı bu workspace’e kurulur. Her workspace KENDİ Meta/Google
            hesabıyla bağlanmalı — aynı hesabı ikinci bir workspace’e bağlamak
            platformda ilk bağlantının token’ını geçersiz kılardı ve sistem
            bunu reddediyor.
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
          {/* BOŞ LİSTENİN SEBEBİ YAZILI: "bağlantı yok" ile "yanlış workspace'e
              bakıyorsun" farklı iki iş ve ikisi de boş liste olarak görünür. */}
          <p className="text-sm font-medium text-ink">
            {clientName} için henüz bağlantı yok
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-muted">
            Yukarıdan Meta ya da Google Ads hesabını bağla. Bağlantı kurulduğunda
            o hesabın reklam hesapları ve sayfaları doğrudan bu workspace’e
            yazılır.
          </p>
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

/**
 * WORKSPACE SEÇME KAPISI.
 *
 * Üst bardaki değiştirici zaten var ama buraya bir liste daha konuyor ve
 * sebebi şu: kullanıcı menüden "Platform Bağlantıları"na tıklayıp boş bir
 * ekranla karşılaşıyor ve yapması gerekenin ÜST BARA gitmek olduğunu
 * bilmiyor. Yapılacak işi ekranın ortasında göstermek, kullanıcıyı bir
 * denetim aramaya göndermekten iyi.
 *
 * BUNLAR BAĞLANTI DEĞİL, ÜST BARDAKİ DEĞİŞTİRİCİYİ ÇAĞIRAN DÜĞMELER — aksi
 * hâlde adrese `?musteri=` yazan ikinci bir denetim doğardı ve o çakışma bu
 * projede zaten bir kez yaşandı (üst bar bir müşteri yazarken gövde
 * başkasının verisini gösteriyordu).
 */
function WorkspaceSecKapisi({
  clients,
}: {
  clients: Array<{ id: string; name: string }>;
}) {
  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-8 text-center">
        <p className="text-sm font-medium text-ink">Henüz müşteri yok</p>
        <p className="mt-1.5 text-xs text-ink-muted">
          Bağlantı bir workspace’e kuruluyor. Önce Ayarlar → Müşteriler’den bir
          müşteri ekle.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink">Önce bir workspace seç</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Platform bağlantıları workspace bazında tutuluyor: bağladığın hesabın
        reklam hesapları ve sayfaları doğrudan seçtiğin müşteriye yazılıyor.
      </p>
      <WorkspaceSecici clients={clients} />
    </div>
  );
}
