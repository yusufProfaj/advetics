import { MusteriArama } from '@/components/tenancy/musteri-arama';
import { MusteriKarti } from '@/components/tenancy/musteri-karti';
import type { ConnectionSummary, SpecialAdCategory } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, type SessionResponse } from '@/lib/session';
import { ClientSetupWizard } from '@/components/tenancy/client-setup-wizard';
import { ClientActions } from '@/components/tenancy/client-actions';
import { SpecialCategoryPicker } from '@/components/tenancy/special-category-picker';
import {
  ClientAssets,
  type ClientAdAccount,
  type ClientProfile,
  type PoolItem,
} from '@/components/tenancy/client-assets';

/**
 * ═══ ŞİRKETİN WORKSPACE'LERİ ═══
 *
 * Bu bölüm AYRI BİR SAYFAYDI (`/ayarlar/musteriler`) ve hiyerarşiyi
 * gizliyordu: kenar çubuğunda "Şirketler" ve "Workspace'ler" yan yana iki
 * satırdı, oysa workspace şirketin İÇİNDE. Kullanıcı workspace listesine
 * bakarken hangi şirkette olduğunu ekrandan okuyamıyordu.
 *
 * ARTIK ŞİRKET SAYFASININ İÇİNDE ve gösterdiği şey AKTİF ŞİRKETİN
 * workspace'leri. Bu bir arayüz tercihi değil, sınırın kendisi: `/clients`
 * ucu RLS ile aktif şirkete çivili (`app.org_kapsaminda`), yazma yolları da
 * öyle. Başka bir şirketin workspace'ini buradan düzenlemek, RLS'in ifade
 * EDEMEDİĞİ bir yazma olurdu — ekran o yüzden önce o şirkete geçiriyor.
 *
 * Bir workspace = bir şirketin bir markası/projesi. BİRDEN ÇOK reklam hesabı
 * olabiliyor ve bu istisna değil kural: portföyde Özemeksan'ın iki Google,
 * Maxra'nın iki Meta + iki Google hesabı var. Bu yüzden düzen "workspace
 * başına tek hesap" varsaymıyor; sayılar hep "kaç hesap" diye gösteriliyor.
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
  contactEmails: string[];
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  iban: string | null;
  notes: string | null;
}

/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı';
}

export async function WorkspaceBolumu({ session }: { session: SessionResponse }) {
  /*
   * OTURUM PROP OLARAK GELİYOR — burada YENİDEN ÇEKİLMİYOR.
   *
   * `requireSession()` her çağrıda `/auth/session`e gidiyor (yetkiler
   * bilerek taze okunuyor, JWT'ye gömülmüyor). Bu bölüm bir SAYFANIN İÇİNDE
   * render ediliyor ve o sayfa oturumu zaten çekmiş durumda; ikinci bir
   * çağrı aynı isteğe fazladan bir tur atmak olurdu.
   */

  /**
   * HAVUZ DA ÇEKİLİYOR — atama buradan yapılabilsin diye.
   *
   * `/connections` parametresiz çağrıldığında atanmamış hesap ve sayfaları da
   * döndürüyor, ama yalnızca org yöneticisine: RLS havuz satırlarını başkasına
   * göstermiyor. Yani müşteri düzeyindeki bir kullanıcı için bu liste zaten
   * boş dönüyor ve arayüz de atama kontrollerini göstermiyor.
   */
  /*
   * KAPILAR YETKİYE BAKIYOR, `isOrgAdmin`E DEĞİL.
   *
   * Uçlar `client.write` / `connection.manage` istiyor ve bu yetkiler artık
   * org yöneticisi olmayan bir role de (reklam yöneticisi) verilebiliyor.
   * `isOrgAdmin`e bakan bir ekran o rolde her düğmeyi gizler: API izin verir,
   * panel göstermez ve arada hiçbir hata mesajı olmaz.
   */
  const musteriYazabilir = hasPermission(session, 'client.write');
  const varlikAtayabilir = hasPermission(session, 'connection.manage');

  /*
   * HATA YUTULMUYOR — `.catch(() => [])` KALDIRILDI.
   *
   * İki uç da boş dizeye düşüyordu ve o desen bu depoda adı konmuş bir yasak
   * (CLAUDE.md): "henüz yok", "yüklenemedi" ve "yetkin yok" AYNI boş ekrana
   * çevriliyor. Ekip ekranında tam olarak bu oldu — liste boş göründü,
   * kullanıcı hiç kimsenin olmadığını sandı ve sebebi hiçbir yerde
   * yazmıyordu.
   *
   * `allSettled`: bir uç düşse de diğeri çalışmaya devam ediyor. Havuz
   * (`/connections`) alınamazsa workspace kartları YİNE listeleniyor,
   * yalnızca atama kontrolleri boş kalıyor ve sebebi ekranda yazıyor.
   */
  const [musteriSonuc, baglantiSonuc] = await Promise.allSettled([
    serverApiFetch<ClientRow[]>('/clients'),
    varlikAtayabilir
      ? serverApiFetch<ConnectionSummary[]>('/connections')
      : Promise.resolve<ConnectionSummary[]>([]),
  ]);

  const clients = musteriSonuc.status === 'fulfilled' ? (musteriSonuc.value ?? []) : [];
  const connections = baglantiSonuc.status === 'fulfilled' ? (baglantiSonuc.value ?? []) : [];

  const yuklemeHatalari = [
    musteriSonuc.status === 'rejected'
      ? `Workspace listesi: ${hataMetni(musteriSonuc.reason)}`
      : null,
    baglantiSonuc.status === 'rejected'
      ? `Bağlantı havuzu: ${hataMetni(baglantiSonuc.reason)}`
      : null,
  ].filter((x): x is string => x !== null);

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
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Workspace’ler</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Workspace, şirketin bir markası ya da projesi. Reklam hesapları workspace’e
          bağlanıyor: önce workspace’i açın, sonra hesaplarını bağlayın, en son ekibi
          yetkilendirin.
        </p>
      </div>

      {yuklemeHatalari.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {yuklemeHatalari.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
      )}

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
            <strong>{clients.length}</strong> workspace
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
          <p className="text-sm font-medium text-ink">Henüz workspace yok</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
            İlk workspace’i yukarıdan ekleyin. Reklam hesapları workspace’e bağlanıyor,
            bu yüzden workspace olmadan hesap bağlanamıyor.
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
                      canManage={varlikAtayabilir}
                    />

                    {/* ÖZEL KATEGORİ BEYANI MÜŞTERİ DÜZEYİNDE: bir emlak
                        firması her kampanyasında emlakçı ve kampanya başına
                        sormak bir gün unutulacağı anlamına gelir. */}
                    <SpecialCategoryPicker
                      clientId={client.id}
                      value={client.specialAdCategories ?? []}
                      canManage={musteriYazabilir}
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
    </section>
  );
}
