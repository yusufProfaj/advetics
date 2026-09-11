import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  TUM_SIRKETLER,
  isOrgScopedRole,
  isOrgAdminRole,
  resolvePermissions,
  type Permission,
  type Role,
  type TenantContext,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { RequestActor } from '../../common/types/request';

/**
 * Rol genişliği sıralaması — en geniş yetki en başta.
 *
 * `Record<Role, number>` OLMASI ÖNEMLİ: yeni rol eklenince TypeScript burayı
 * derleme hatasıyla gösteriyor. Düz bir nesne ya da `Partial` olsaydı yeni
 * rol sessizce `undefined` sıralanır ve birden çok üyeliği olan kullanıcının
 * "en geniş rolü" rastgele seçilirdi.
 *
 * SIRA YETKİ KÜMELERİYLE TUTARLI OLMAK ZORUNDA. Analist ilk bakışta müşteri
 * hizmetlerinden "daha dar" duruyor (kampanya kurmuyor) ama yetki kümesi
 * onun ÜST KÜMESİ: `sync.trigger`, `bulk.write` ve `user.read` fazladan.
 * Sıralamayı sezgiyle vermek, iki üyeliği olan bir kullanıcının dar rolünü
 * "en geniş" seçtirir ve panelde eksik ekran olarak görünür.
 * `rol-yetkileri.spec.ts` sırayı kümelerle karşılaştırıyor.
 */
const ROLE_RANK: Record<Role, number> = {
  owner: 7,
  admin: 6,
  ad_manager: 5,
  manager: 4,
  analyst: 3,
  customer_service: 2,
  client_viewer: 1,
};

/** Sıralamayı testin okuyabilmesi için dışa açık. */
export const ROL_SIRASI: Readonly<Record<Role, number>> = ROLE_RANK;

export interface ResolvedIdentity {
  actor: RequestActor;
  context: TenantContext;
  memberships: Array<{
    id: string;
    clientId: string | null;
    clientName: string | null;
    role: Role;
  }>;
  /** Seçilebilir workspace'ler — org yöneticisi için org'daki tümü. */
  availableClients: Array<{ id: string; name: string; status: string }>;
  /**
   * Kullanıcının ÜST HESABI ve altındaki şirketler — yoksa null.
   *
   * `availableClients` ile aynı gerekçe: bu liste `memberships`ten
   * TÜRETİLEMEZ. Üst hesap altındaki kardeş şirketlerde kullanıcının hiç
   * `memberships` satırı YOK; yetkisi `ManagerMembership`ten geliyor.
   */
  managerAccount: {
    id: string;
    name: string;
    /** Bu üst hesap altında kullanıcının geçebileceği şirketler. */
    organizations: Array<{ id: string; name: string; slug: string }>;
  } | null;
  /**
   * Kullanıcının GEÇEBİLECEĞİ bütün şirketler ve oradaki workspace'leri.
   *
   * `managerAccount.organizations` ajans katmanını anlatıyor ve danışmanda
   * `null`; bu liste ise üyeliğin olduğu her şirketi taşıyor.
   */
  erisilebilirSirketler: Array<{
    id: string;
    name: string;
    slug: string;
    workspaces: Array<{ id: string; name: string }>;
  }>;
}

/**
 * Kullanıcının kimliğinden RLS bağlamını üretir.
 *
 * Bu, uygulama katmanı ile veritabanı katmanı arasındaki tek köprüdür:
 * burada hesaplanan `clientIds` ve `isOrgAdmin` değerleri, doğrudan
 * PostgreSQL oturum değişkenlerine yazılır ve tüm RLS politikalarını sürer.
 * Burada yapılan bir hata, veritabanı seviyesinde yanlış izolasyon demektir.
 *
 * PrismaAdminService kullanır — bağlamı kurmak için gereken okuma, bağlamın
 * kendisinden önce gelmek zorundadır (tavuk-yumurta).
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly db: PrismaAdminService) {}

  async resolve(
    userId: string,
    requestedClientId?: string | null,
    /**
     * Panelde seçili ŞİRKET (üst hesap altında geçiş yapılmışsa).
     *
     * `requestedClientId` ile AYNI GÜVEN SEVİYESİNDE: cookie'den geliyor,
     * yani kullanıcının elinde. Aşağıda veritabanından hesaplanan izin
     * listesine karşı doğrulanıyor; geçmezse EV organizasyonuna düşülüyor.
     * Bu değer `app.current_org_id()`yi sürüyor, yani BÜTÜN RLS'in sınırı —
     * doğrulamayı atlamak, cookie düzenleyerek başka bir şirketin verisini
     * okumak demekti.
     */
    requestedOrgId?: string | null,
  ): Promise<ResolvedIdentity> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        orgId: true,
        email: true,
        fullName: true,
        status: true,
        organization: { select: { status: true } },
        managerMemberships: {
          select: {
            id: true,
            role: true,
            managerAccountId: true,
            managerAccount: { select: { id: true, name: true, status: true } },
          },
        },
        memberships: {
          select: {
            id: true,
            /*
             * `orgId` OKUNMAK ZORUNDA. Bu sorgu org süzgeci TAŞIMIYOR ve
             * taşıyamaz (aktif şirket aşağıda hesaplanıyor). Tek org
             * varsayımında zararsızdı; üst hesap (MCC) katmanıyla bir
             * kullanıcının BİRDEN ÇOK şirkette üyeliği olabiliyor ve
             * hepsini birden bağlama koymak, başka şirketin workspace
             * kimliklerini `app.current_client_ids()`e yazmak demekti.
             */
            orgId: true,
            clientId: true,
            role: true,
            permissions: true,
            client: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı');
    if (user.status !== 'active') throw new UnauthorizedException('Hesabınız devre dışı');
    if (user.organization.status !== 'active') {
      throw new UnauthorizedException('Organizasyon askıya alınmış');
    }
    /*
     * ═══ ÜST HESAP (MCC) — KARDEŞ ŞİRKETLERE ERİŞİM ═══
     *
     * `user_id` tekil olduğu için en fazla bir satır var; `[0]` bir seçim
     * DEĞİL, şemanın garantisi (bkz. ManagerMembership).
     */
    const uyelik = user.managerMemberships[0] ?? null;

    /*
     * ROL ORG GENELİ OLMAK ZORUNDA. Kardeş şirkette kullanıcının hiç
     * `memberships` satırı YOK; org geneli olmayan bir rol orada SIFIR
     * workspace görür — yani "geçtim ama hiçbir şey yok" gibi görünen,
     * sebebi hiçbir ekranda yazmayan bir çıkmaz. Askıya alınmış üst hesap
     * da geçiş açmıyor.
     */
    const ustHesap =
      uyelik && uyelik.managerAccount.status === 'active' && isOrgScopedRole(uyelik.role as Role)
        ? uyelik
        : null;

    const kardesSirketler = ustHesap
      ? await this.db.organization.findMany({
          where: { managerAccountId: ustHesap.managerAccountId, status: 'active' },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, slug: true },
        })
      : [];

    /*
     * İZİN LİSTESİ VERİTABANINDAN HESAPLANIYOR, istekten değil. `activeOrgId`
     * bütün RLS politikalarının okuduğu `app.current_org_id()`yi sürüyor;
     * doğrulanmamış bir değer, cookie düzenleyerek başka bir şirketin
     * verisini okumak demekti. Ev organizasyonu HER ZAMAN listede — üst
     * hesabı olmayan kullanıcı için liste tek elemanlı ve davranış değişmiyor.
     */
    /*
     * ═══ ÜYELİĞİN OLDUĞU ŞİRKET DE ERİŞİLEBİLİR ═══
     *
     * Bu satır olmadan ŞİRKET SEVİYESİ YETKİ ÇALIŞMIYORDU ve arıza sessizdi.
     *
     * Danışmana "Sabancı şirketinin tamamına yetki" verildiğinde üyelik
     * satırı O ŞİRKETTE açılıyor (`baskaSirketeYetki`). Ama danışmanın üst
     * hesap üyeliği YOK — `kardesSirketler` boş — ve `users.org_id` hâlâ
     * ajans. Sonuç: `activeOrgId` eve düşüyor, üyelikler aktif şirkete
     * süzülüyor, Sabancı'daki satır süzgeçten ELENİYOR ve danışman ya
     * hiçbir şey göremiyor ya da "Bu şirkete erişim yetkiniz tanımlı değil"
     * ile 401 alıyor. Yetki veriliyor, hiçbir işe yaramıyor.
     *
     * ÜYELİK ZATEN YETKİNİN KENDİSİ: bir kullanıcının satırı olan şirkete
     * geçebilmesi bir genişletme değil, o satırın anlamı. Liste yine
     * VERİTABANINDAN hesaplanıyor, istekten değil.
     */
    const uyelikOrgIdleri = user.memberships.map((m) => m.orgId);
    const izinliOrgIdler = new Set<string>([
      user.orgId,
      ...kardesSirketler.map((o) => o.id),
      ...uyelikOrgIdleri,
    ]);

    /*
     * "TÜM ŞİRKETLER" MODU — üst hesabı OLANLARA açık, başkasına değil.
     *
     * Sentinel doğrulanmadan kabul edilseydi, üst hesabı olmayan bir
     * kullanıcı cookie'sine `all` yazarak modu açardı. Açsa bile RLS'teki
     * kapsam `app.ajans_org_idleri()` ile sınırlı ve o küme onun için tek
     * elemanlı — ama bir güvenlik kontrolünü "zaten diğer katman tutuyor"
     * diye atlamak, o katmanın bir gün değişmesine bahis oynamak demek.
     */
    const tumSirketler = requestedOrgId === TUM_SIRKETLER && ustHesap !== null;

    /*
     * TÜM ŞİRKETLER MODUNDA `orgId` EV ŞİRKETİ KALIYOR — ve bunun için
     * FAZLADAN BİR KOŞULA GEREK YOK.
     *
     * Sentinel (`'all'`) bir UUID değil, dolayısıyla `izinliOrgIdler`de
     * asla bulunamıyor ve ifade kendiliğinden ev şirketine düşüyor.
     * İlk yazımda burada ayrıca `tumSirketler ||` vardı; mutasyon testinde
     * onu kaldırmak HİÇBİR testi düşürmedi — çünkü hiçbir iş yapmıyordu.
     * Bir şeyi koruduğunu sandığın gereksiz bir koşul, bir sonraki
     * okuyucuya var olmayan bir kural anlatıyor.
     *
     * `ctx.orgId` yalnızca RLS'i sürmüyor; uygulama kodunda 21 yerde
     * `orgId: ctx.orgId` olarak YAZMA yollarını da besliyor. Okuma
     * kapsamını `app.tum_sirketler()` bayrağı genişletiyor; yazma hâlâ tek
     * bir şirkete çivili.
     */
    /*
     * ═══ EV ŞİRKETİNE DÜŞMEK YETMİYOR — ÜYELİĞİN OLDUĞU YERE DÜŞÜYOR ═══
     *
     * `user.orgId` kullanıcının AÇILDIĞI şirket; orada bir üyeliği olduğu
     * GARANTİ DEĞİL. Danışmana yalnızca bir MÜŞTERİ ŞİRKETİNDE yetki
     * verildiğinde (şirket seviyesi yetki üyelik satırını o şirkette
     * açıyor) ev şirketinde hiç satırı kalmıyor ve giriş şu hatayla
     * düşüyordu: "Bu şirkete erişim yetkiniz tanımlı değil".
     *
     * Kullanıcı yetkilendirilmiş ama İÇERİ GİREMİYOR — ve hata cümlesi
     * hangi şirketten bahsettiğini bile söylemiyor.
     *
     * SIRA: geçerli istek → üyeliğin olduğu ev şirketi → üyeliğin olduğu
     * HERHANGİ bir şirket → ev şirketi. Son dal yalnızca hiçbir üyelik
     * yokken çalışıyor ve orada zaten aşağıdaki kontrol devreye giriyor.
     *
     * ÜST HESABI OLAN İÇİN EV ŞİRKETİ ÖNCELİKLİ KALIYOR: ajans yöneticisi
     * kendi şirketinde üyelik satırı taşımasa bile (sentetik üyelik üst
     * hesap rolünden türüyor) oraya düşmeli — kardeş bir şirkete
     * atılması, her girişte başka bir yerde uyanması demekti.
     */
    const evdeUyelikVar = user.memberships.some((m) => m.orgId === user.orgId);
    const uyelikliOrg = user.memberships.find((m) => izinliOrgIdler.has(m.orgId))?.orgId;

    const varsayilanOrg =
      evdeUyelikVar || ustHesap !== null ? user.orgId : (uyelikliOrg ?? user.orgId);

    const activeOrgId =
      requestedOrgId && izinliOrgIdler.has(requestedOrgId) ? requestedOrgId : varsayilanOrg;

    /*
     * SEÇİCİNİN LİSTESİ — `managerAccount` TEK BAŞINA YETMİYOR.
     *
     * Üst hesabı olmayan bir danışman da birden çok şirkete yetkili
     * olabiliyor (yukarıdaki üyelik kuralı). O şirketleri seçicide
     * göstermezsek kullanıcı yetkisi olan bir yere GEÇEMİYOR — yetki
     * veriliyor, erişilemiyor.
     */
    /*
     * ═══ SEÇİCİDE GÖRÜNEN KÜME = GEÇİLEBİLEN KÜME ═══
     *
     * `izinliOrgIdler` EV ŞİRKETİNİ KOŞULSUZ taşıyor ve bu, `activeOrgId`
     * için güvenli bir son çare. Ama seçiciye olduğu gibi vermek, orada
     * üyeliği OLMAYAN bir kullanıcıya tıklanınca reddedilen bir satır
     * göstermek demekti — `assertOrgAccess` o şirketi kabul etmiyor.
     *
     * Seçilebilir küme: üst hesabın kardeşleri + ÜYELİĞİN OLDUĞU şirketler.
     * `assertOrgAccess` ile BİREBİR aynı kural; ikisinin ayrışması, ekranda
     * görünen ama açılmayan bir satır demek.
     */
    const secilebilirOrgIdler = new Set<string>([
      ...kardesSirketler.map((o) => o.id),
      ...uyelikOrgIdleri,
    ]);

    const erisilebilirSirketler = await this.db.organization.findMany({
      where: { id: { in: [...secilebilirOrgIdler] }, status: 'active' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });

    /*
     * ═══ HER ŞİRKETİN ERİŞİLEBİLİR WORKSPACE'LERİ ═══
     *
     * Seçici üst hesabı OLMAYAN kullanıcıda bu listeden besleniyor ve
     * eskiden yalnızca AKTİF şirketin workspace'lerini biliyordu: diğer
     * bütün satırlar "0 workspace · Bu şirkette workspace yok" yazıyordu.
     * Bu bir bilgi eksikliği değil, YANLIŞ BİLGİ — workspace vardı,
     * ekranda yok deniyordu.
     *
     * SORGU UCUZ: `clients` küçük bir tablo ve tek çağrı. Kırk dokuz
     * şirketli bir ajansta bile birkaç yüz satır.
     *
     * SÜZGEÇ ÜYELİĞE GÖRE: şirket geneli üyeliği olan o şirketin
     * HEPSİNİ görüyor, workspace bazlı üyeliği olan yalnızca kendi
     * satırlarını — `clientIds` hesabının aktif şirket dışına genişletilmiş
     * hâli ve aynı kuralı uyguluyor.
     */
    const erisimWorkspaceleri = await this.db.client.findMany({
      where: { orgId: { in: [...secilebilirOrgIdler] }, status: { not: 'archived' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, orgId: true },
    });

    const orgGeneliOlanlar = new Set(
      user.memberships
        .filter((m) => m.clientId === null && isOrgScopedRole(m.role as Role))
        .map((m) => m.orgId),
    );
    const uyelikliClientIdler = new Set(
      user.memberships.map((m) => m.clientId).filter((id): id is string => id !== null),
    );

    const sirketAgaci = erisilebilirSirketler.map((o) => ({
      ...o,
      workspaces: erisimWorkspaceleri
        .filter(
          (c) =>
            c.orgId === o.id &&
            (orgGeneliOlanlar.has(o.id) ||
              // ÜST HESAP ALTINDAKİ ŞİRKETTE org geneli erişim üst hesap
              // rolünden geliyor; ayrıca üyelik satırı olmayabiliyor.
              kardesSirketler.some((k) => k.id === o.id) ||
              uyelikliClientIdler.has(c.id)),
        )
        .map((c) => ({ id: c.id, name: c.name })),
    }));

    /*
     * HATA MESAJI ŞİRKETİN ADINI SÖYLÜYOR.
     *
     * "Bu şirkete erişim yetkiniz tanımlı değil" hangi şirketten
     * bahsettiğini söylemiyordu ve kullanıcı giriş ekranında kaldı:
     * yetkisi vardı, başka bir şirketteydi. Ad, sorunun nerede
     * aranacağını söylüyor.
     */
    const aktifSirketAdi =
      erisilebilirSirketler.find((o) => o.id === activeOrgId)?.name ?? activeOrgId;

    // EV organizasyonundaki üyeliğe bakılıyor: kullanıcı hiçbir yere
    // giremiyorsa oturum kurmanın anlamı yok.
    if (user.memberships.length === 0 && !ustHesap) {
      throw new UnauthorizedException('Hiçbir workspace’e erişim yetkiniz tanımlı değil');
    }

    /*
     * ÜYELİKLER AKTİF ŞİRKETE SÜZÜLÜYOR.
     *
     * `evdeMi` bayrağına bakmak YETMİYOR: şirketi AÇAN kişi orada gerçek bir
     * `owner` üyeliği alıyor (`manager-account.service.ts`), yani kardeş
     * şirkette de üyeliği olabiliyor. Süzmeden bırakmak iki yönde de
     * yanlıştı — A şirketindeyken B'nin workspace kimlikleri bağlama
     * giriyordu, ve B'ye geçince A'daki dar rol "en geniş rol" seçiminde
     * kazanabiliyordu.
     */
    const aktifOrgUyelikleri = user.memberships.filter(
      (m) =>
        m.orgId === activeOrgId &&
        // Arşivlenmiş workspace'ler erişim listesinden düşer.
        (m.clientId === null || m.client?.status !== 'archived'),
    );

    /*
     * ÜYELİK YOKSA üst hesap rolünden SENTETİK bir org geneli üyelik
     * türetiliyor. `clientId: null` olması kritik: aşağıdaki `orgScoped`
     * süzgeci tam olarak buna bakıyor ve org geneli erişim oradan doğuyor.
     *
     * GERÇEK ÜYELİK VARSA O KAZANIYOR: kendi şirketindeki dar bir rolü üst
     * hesap rolüyle genişletmek, kullanıcının kendi şirketinde beklemediği
     * bir yetki bulması demekti.
     */
    /*
     * ÜÇLÜ OPERATÖR DEĞİL AÇIK `if/else if/else` — TİP DARALTMASI İÇİN.
     *
     * Önce erken bir `if (... && !ustHesap) throw` + üçlü operatör vardı;
     * TypeScript o guard'ı üçlünün else dalına BAĞLAYAMIYOR ve `ustHesap!`
     * yazmak gerekiyordu. `!` o bilgiyi susturur: bir gün bu koşullardan
     * biri değişirse hata "null.id okunamıyor" gibi sebebi anlatmayan bir
     * çalışma anı hatasına dönerdi. Bu yapıda daraltma derleyicinin işi.
     */
    let scopedMemberships: typeof aktifOrgUyelikleri;
    if (tumSirketler && ustHesap) {
      /*
       * MOD, ÜST HESABIN GÖRÜNÜMÜ — rol de oradan geliyor. Ev şirketindeki
       * dar bir üyelik burada geçerli olsaydı, kullanıcı "tüm şirketler"
       * deyip yalnızca bir kısmını görürdü ve sebebi hiçbir ekranda
       * yazmazdı.
       */
      scopedMemberships = [
        {
          id: `manager:${ustHesap.id}`,
          orgId: activeOrgId,
          clientId: null,
          role: ustHesap.role,
          permissions: null,
          client: null,
        } as (typeof user.memberships)[number],
      ];
    } else if (aktifOrgUyelikleri.length > 0) {
      scopedMemberships = aktifOrgUyelikleri;
    } else if (ustHesap) {
      /*
       * ÜYELİK YOKSA üst hesap rolünden SENTETİK bir org geneli üyelik.
       * `clientId: null` olması kritik: aşağıdaki `orgScoped` süzgeci tam
       * olarak buna bakıyor ve org geneli erişim oradan doğuyor.
       */
      scopedMemberships = [
        {
          id: `manager:${ustHesap.id}`,
          orgId: activeOrgId,
          clientId: null,
          role: ustHesap.role,
          // Üst hesap üyeliği ince ayar TAŞIMIYOR: rol bir şirkette değil,
          // bir danışmanlığın ALTINDAKİ HEPSİNDE geçerli ve tek tek
          // istisna yazmanın yeri o şirketin kendi `memberships` satırı.
          permissions: null,
          client: null,
        } as (typeof user.memberships)[number],
      ];
    } else {
      // Ne aktif şirkette üyelik ne üst hesap: bağlam KURULAMAZ. Sessizce
      // boş bir oturum vermek yerine gürültülü patlamak doğru.
      throw new UnauthorizedException(
        `"${aktifSirketAdi}" şirketine erişim yetkiniz tanımlı değil`,
      );
    }

    const orgScoped = scopedMemberships.filter(
      (m) => m.clientId === null && isOrgScopedRole(m.role as Role),
    );

    /*
     * ORG GENELİ VERİ ERİŞİMİ İLE ORG YÖNETİCİLİĞİ AYRI.
     *
     * `orgScoped.length > 0` = org'daki bütün müşterilerin verisini görür.
     * `isOrgAdmin` = kullanıcı açar, üyelik verir, müşteri siler, bağlantı
     * koparır. Reklam yöneticisi birincisini taşıyor, ikincisini TAŞIMIYOR.
     * İkisini tek bayrakta tutmak, ajans genelinde çalışan bir role personel
     * hesabı açma yetkisi vermek demekti.
     */
    const hasOrgScope = orgScoped.length > 0;
    const isOrgAdmin = orgScoped.some((m) => isOrgAdminRole(m.role as Role));

    // Org geneli yetkili kullanıcılar için erişilebilir client listesini
    // AÇIKÇA genişletiyoruz. RLS'te "hepsi" anlamına gelen bir joker değer
    // tanımlamak, politikalarda kolayca yanlış yerde eşleşen bir kaçak yaratır.
    let clientIds: string[];
    let availableClients: Array<{ id: string; name: string; status: string }>;

    if (hasOrgScope) {
      const all = await this.db.client.findMany({
        /*
         * TÜM ŞİRKETLER MODUNDA bütün ajansın workspace'leri; aksi hâlde
         * AKTİF organizasyonunkiler (ev değil — kardeş şirkete geçen
         * kullanıcı o şirketin workspace'lerini görmek zorunda).
         */
        where: {
          orgId: tumSirketler ? { in: [...izinliOrgIdler] } : activeOrgId,
          status: { not: 'archived' },
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, status: true },
      });
      clientIds = all.map((c) => c.id);
      availableClients = all;
    } else {
      clientIds = scopedMemberships
        .map((m) => m.clientId)
        .filter((id): id is string => id !== null);
      availableClients = scopedMemberships
        .filter((m) => m.client !== null)
        .map((m) => ({
          id: m.client!.id,
          name: m.client!.name,
          status: m.client!.status,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    // Aktif müşteri seçimi: istenen değer daima erişim listesine karşı doğrulanır.
    // Doğrulamadan geçmeyen bir istek sessizce yok sayılır (403 değil), çünkü
    // bayat bir cookie yüzünden kullanıcıyı kilitlemenin anlamı yok.
    /*
     * TÜM ŞİRKETLER MODUNDA WORKSPACE SEÇİMİ YOK.
     *
     * Mod bir GENEL BAKIŞ; bir workspace seçmek, o workspace'in şirketine
     * geçmek demek ve o karar `switch-client` ucunda veriliyor. Seçimi
     * burada da geçerli saymak, `ctx.orgId` (ev şirketi) ile seçili
     * workspace'in şirketi farklı olduğunda yazma yollarını iki dünyaya
     * birden bakan bir hâle sokardı.
     */
    const activeClientId = tumSirketler
      ? null
      : requestedClientId && clientIds.includes(requestedClientId)
        ? requestedClientId
        : null;

    // Etkin rol ve yetkiler:
    //   - Bir müşteri seçiliyse, O müşteriye ait membership belirleyicidir.
    //   - Seçili değilse (org geneli görünüm) en geniş rol kullanılır.
    // Bu ayrım önemli: bir kullanıcı A müşterisinde manager, B'de analyst olabilir.
    const activeMembership = activeClientId
      ? scopedMemberships.find((m) => m.clientId === activeClientId)
      : undefined;

    const effective =
      activeMembership ??
      [...scopedMemberships].sort(
        (a, b) => ROLE_RANK[b.role as Role] - ROLE_RANK[a.role as Role],
      )[0];

    if (!effective) throw new UnauthorizedException('Geçerli bir yetki bulunamadı');

    const overrides = (effective.permissions ?? null) as Partial<
      Record<Permission, boolean>
    > | null;

    const permissions = [...resolvePermissions(effective.role as Role, overrides)];

    return {
      actor: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        fullName: user.fullName,
      },
      context: {
        userId: user.id,
        /*
         * AKTİF şirket — `actor.orgId` (EV şirketi) ile bilerek AYRI.
         * `JwtAuthGuard` token'daki org'u `actor.orgId` ile karşılaştırıyor;
         * buraya aktif değeri yazmak, kardeş şirkete geçen kullanıcının
         * her isteğini "Oturum geçersiz" ile düşürürdü.
         */
        orgId: activeOrgId,
        clientIds,
        activeClientId,
        managerAccountId: ustHesap?.managerAccountId ?? null,
        tumSirketler,
        role: effective.role as Role,
        isOrgAdmin,
        permissions,
      },
      memberships: scopedMemberships.map((m) => ({
        id: m.id,
        clientId: m.clientId,
        clientName: m.client?.name ?? null,
        role: m.role as Role,
      })),
      availableClients,
      erisilebilirSirketler: sirketAgaci,
      managerAccount: ustHesap
        ? {
            id: ustHesap.managerAccount.id,
            name: ustHesap.managerAccount.name,
            organizations: kardesSirketler,
          }
        : null,
    };
  }
}
