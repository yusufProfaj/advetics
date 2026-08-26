import { MusteriArama } from '@/components/tenancy/musteri-arama';
import { MusteriKarti } from '@/components/tenancy/musteri-karti';
import type { ConnectionSummary, SpecialAdCategory } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { ClientSetupWizard } from '@/components/tenancy/client-setup-wizard';
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
  /*
   * İLETİŞİM VE FİRMA ALANLARI — detay penceresi bunları gösteriyor.
   *
   * `serverApiFetch<T>` DENETİMSİZ bir dönüşüm: burada bir alan yazıp uçta
   * SELECT'e eklemeyi unutmak TypeScript'e hiçbir şey söyletmiyor, alan
   * `undefined` geliyor ve ekranda sessizce "—" oluyor. Uçtaki karşılığı
   * `clients.service.ts` içindeki `list()` seçimi.
   */
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  iban: string | null;
  notes: string | null;
}

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

  /*
   * GENİŞLİK 5xl'DEN 7xl'E. Kartlar iki kolonda 1024px'lik bir şeride
   * sıkışıyordu ve geniş ekranda içerik sayfanın ortasında dar bir sütun
   * olarak duruyordu. Kart içeriği (varlık listesi + açılır kutular) o
   * genişlikte satır satır kırılıyordu.
   *
   * ÜÇÜNCÜ KOLON YALNIZCA xl'DE (aşağıdaki ızgara): 1280px altında üç kart
   * yan yana konunca varlık satırlarındaki ad ve boost seçici yine kırılıyor.
   */
  return (
    <div className="mx-auto max-w-7xl space-y-6">
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
      {/*
        "YENİ MÜŞTERİ" SAYAÇ BANDININ İÇİNDE — altında ayrı bir satırda değil.
        Ayrı satırda dururken sağa yaslanmış tek bir düğme kendi başına bir
        şerit kaplıyordu ve bandın sağındaki boşluk boş duruyordu. Ekip
        ekranındaki "+ Kullanıcı ekle" ile aynı yer ve aynı desen.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
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
        <ClientSetupWizard connections={connections} />
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Henüz müşteri yok</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
            İlk müşteriyi yukarıdan ekleyin. Reklam hesapları müşteriye bağlanıyor,
            bu yüzden müşteri olmadan hesap bağlanamıyor.
          </p>
        </div>
      ) : (
        /*
          LİSTE ARAMA BİLEŞENİNE VERİLİYOR. Kart içeriği burada, SUNUCUDA
          kuruluyor; istemci yalnızca hangisinin görüneceğine karar veriyor.
          Kartları tamamen istemciye taşımak, içlerindeki sunucu tarafı
          çözümleri de taşımak olurdu.
        */
        <MusteriArama
          kartlar={clients.map((client) => ({
            id: client.id,
            ad: client.name,
            slug: client.slug,
            icerik: (
              <MusteriKarti
                client={client}
                canManage={session.isOrgAdmin}
                /*
                  YÖNETİM KONTROLLERİ SUNUCUDA KURULUYOR, PENCEREDE ÇİZİLİYOR.
                  Havuz (`pool`) ve oturumun yönetici olup olmadığı sunucu
                  tarafı bilgiler; kartı tamamen istemciye taşımak ikisini de
                  taşımak olurdu.
                */
                yonetim={
                  <div className="space-y-3">
                    <ClientAssets
                      clientId={client.id}
                      clientName={client.name}
                      adAccounts={client.adAccounts}
                      profiles={client.socialProfiles}
                      pool={pool}
                      canManage={session.isOrgAdmin}
                    />

                    {/* ÖZEL KATEGORİ BEYANI MÜŞTERİ DÜZEYİNDE: bir emlak
                        firması her kampanyasında emlakçı ve kampanya başına
                        sormak bir gün unutulacağı anlamına gelir. */}
                    <SpecialCategoryPicker
                      clientId={client.id}
                      value={client.specialAdCategories ?? []}
                      canManage={session.isOrgAdmin}
                    />

                    <ClientActions
                      clientId={client.id}
                      clientName={client.name}
                      accountCount={client._count.adAccounts}
                    />
                  </div>
                }
              />
            ),
          }))}
        />
      )}
    </div>
  );
}
