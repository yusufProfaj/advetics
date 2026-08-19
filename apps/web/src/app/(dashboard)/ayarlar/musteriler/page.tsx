import Link from 'next/link';
import type { ConnectionSummary, SpecialAdCategory } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { ClientCreateForm } from '@/components/tenancy/client-create-form';
import { ClientActions } from '@/components/tenancy/client-actions';
import { SpecialCategoryPicker } from '@/components/tenancy/special-category-picker';
import {
  ClientAssets,
  type ClientAdAccount,
  type ClientProfile,
  type PoolItem,
} from '@/components/tenancy/client-assets';

export const metadata = { title: 'Müşteriler — Advetics' };

/**
 * Müşteriler — kurulumun İLK adımı.
 *
 * Sıra şöyle işliyor ve kenar çubuğu da bu sırada:
 *
 *   1. Müşteri aç            ← burası
 *   2. Reklam hesabını bağla (Platform Bağlantıları)
 *   3. Ekibi yetkilendir     (Ekip & Yetkiler)
 *
 * Bir müşteri = bir şirket. Şirketin BİRDEN ÇOK reklam hesabı olabiliyor ve
 * bu istisna değil kural: portföyde Özemeksan'ın iki Google, Maxra'nın iki
 * Meta + iki Google hesabı var. Bu yüzden ekran "müşteri başına tek hesap"
 * varsayan bir düzen kurmuyor; sayılar hep "kaç hesap" diye gösteriliyor.
 */
interface ClientRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  reportingCurrency: string;
  status: string;
  createdAt: string;
  /** Meta özel reklam kategorileri — beyan edilmezse politika ihlali. */
  specialAdCategories?: SpecialAdCategory[];
  _count: { adAccounts: number; memberships: number };
  /** Bu müşteriye ATANMIŞ hesaplar — izlemede olup olmadıkları alan içinde. */
  adAccounts: ClientAdAccount[];
  socialProfiles: ClientProfile[];
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  archived: 'Arşivlendi',
};

export default async function ClientsPage() {
  const session = await requireSession();

  /**
   * HAVUZ DA ÇEKİLİYOR — atama buradan yapılabilsin diye.
   *
   * `/connections` parametresiz çağrıldığında atanmamış hesap ve sayfaları da
   * döndürüyor, ama yalnızca org yöneticisine: RLS havuz satırlarını başkasına
   * göstermiyor. Yani müşteri düzeyindeki bir kullanıcı için bu liste zaten
   * boş dönüyor ve arayüz de atama kontrollerini göstermiyor.
   */
  const [clients, connections] = await Promise.all([
    serverApiFetch<ClientRow[]>('/clients').catch(() => []),
    session.isOrgAdmin
      ? serverApiFetch<ConnectionSummary[]>('/connections').catch(() => [])
      : Promise.resolve([]),
  ]);

  const pool: PoolItem[] = [
    ...connections
      .flatMap((c) => c.adAccounts)
      .filter((a) => a.clientId === null)
      .map((a) => ({
        id: a.id,
        name: a.name,
        externalId: a.externalId,
        kind: 'ad_account' as const,
        isManager: a.isManager,
      })),
    ...connections
      .flatMap((c) => c.socialProfiles)
      .filter((p) => p.clientId === null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        externalId: p.externalId,
        kind: 'social_profile' as const,
      })),
  ];

  const totalAccounts = clients.reduce((sum, c) => sum + c._count.adAccounts, 0);
  const totalWatched = clients.reduce(
    (sum, c) => sum + c.adAccounts.filter((a) => a.syncEnabled).length,
    0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Müşteriler</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Her müşteri bir şirkettir; bir şirketin birden çok reklam hesabı olabilir.
          Önce müşteriyi açın, sonra hesaplarını bağlayın, en son ekibi yetkilendirin.
        </p>
      </div>

      {/*
        TOPLAM HER ZAMAN YAZILI. Kaç müşteri listelendiği ve hesapların kaçının
        izlendiği görünmezse, hesabı bağlı ama izlemeye açılmamış bir müşteri
        "veri gelmiyor" diye okunur ve sebebi hiçbir ekranda yazmaz.
      */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
        <span>
          <strong>{clients.length}</strong> müşteri
        </span>
        <span className="text-ink-muted">
          <strong className="text-ink">{totalAccounts}</strong> reklam hesabı
        </span>
        <span className="text-ink-muted">
          <strong className="text-ink">{totalWatched}</strong> tanesi izlemede
        </span>
      </div>

      <ClientCreateForm />

      {clients.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Henüz müşteri yok</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
            İlk müşteriyi yukarıdan ekleyin. Reklam hesapları müşteriye bağlanıyor,
            bu yüzden müşteri olmadan hesap bağlanamıyor.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {clients.map((client) => {
            const watched = client.adAccounts.filter((a) => a.syncEnabled).length;
            const total = client._count.adAccounts;

            return (
              <li
                key={client.id}
                className="rounded-xl border border-line bg-surface p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-ink">{client.name}</h2>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{client.slug}</p>
                  </div>
                  {client.status !== 'active' && (
                    <span className="shrink-0 rounded bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                      {STATUS_LABEL[client.status] ?? client.status}
                    </span>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-ink-muted">Reklam hesabı</dt>
                    <dd className="mt-0.5 font-semibold text-ink">
                      {total === 0 ? (
                        <span className="text-ink-muted">yok</span>
                      ) : (
                        <>
                          {watched}
                          <span className="font-normal text-ink-muted"> / {total} izlemede</span>
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Ekip</dt>
                    <dd className="mt-0.5 font-semibold text-ink">
                      {/*
                        SAYI BAĞLANTI: her müşteri ayrı bir workspace ve
                        kendi erişim listesi var. Ajans ekibi ekranı müşteri
                        hesaplarını bilerek dışarıda bırakıyor, dolayısıyla
                        onların yönetileceği tek yer burası.
                      */}
                      <Link
                        href={`/ayarlar/musteriler/${client.id}/ekip`}
                        className="text-brand-strong hover:underline"
                      >
                        {client._count.memberships}
                        <span className="font-normal text-ink-muted"> kişi</span>
                      </Link>
                    </dd>
                  </div>
                </dl>

                {/*
                  İki uyarı da SESSİZ KALMASI en kolay durumları anlatıyor:
                  hesabı olmayan müşteri hiç veri getirmez, hesabı bağlı ama
                  izlemeye açılmamış müşteri de getirmez — ikisi panelde
                  birebir aynı görünür ("veri yok"), sebepleri farklıdır.
                */}
                {total === 0 && (
                  <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                    Atanmış reklam hesabı yok — bu müşteride hiç veri görünmeyecek.
                  </p>
                )}
                {total > 0 && watched === 0 && (
                  <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                    {total} hesap atanmış ama hiçbiri izlemede değil — veri çekilmiyor.
                  </p>
                )}

                <ClientAssets
                  clientId={client.id}
                  clientName={client.name}
                  adAccounts={client.adAccounts}
                  profiles={client.socialProfiles}
                  pool={pool}
                  canManage={session.isOrgAdmin}
                />

                {/* ÖZEL KATEGORİ BEYANI MÜŞTERİ KARTINDA: bir emlak firması
                    her kampanyasında emlakçı ve kampanya başına sormak bir gün
                    unutulacağı anlamına gelir. */}
                <SpecialCategoryPicker
                  clientId={client.id}
                  value={client.specialAdCategories ?? []}
                  canManage={session.isOrgAdmin}
                />

                <ClientActions
                  clientId={client.id}
                  clientName={client.name}
                  accountCount={total}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
