import type { ManagerPaket } from '../constants/paketler';
import type { Permission, Role } from '../auth/roles';

/**
 * Kimliği doğrulanmış isteğin taşıdığı bağlam.
 *
 * Bu nesne hem uygulama katmanındaki guard'ları hem de PostgreSQL RLS
 * oturum değişkenlerini besler. İkisi aynı kaynaktan beslendiği için
 * "uygulama izin verdi ama DB reddetti" tutarsızlığı oluşmaz.
 */
export interface TenantContext {
  userId: string;
  orgId: string;

  /**
   * Kullanıcının erişebildiği client id'leri.
   * Org geneli erişimi olan roller (owner/admin) için bu liste org'daki
   * TÜM client'ları içerir — RLS `= ANY(...)` ile çalıştığı için
   * "hepsi" diye bir joker değer tanımlamıyoruz.
   */
  clientIds: string[];

  /** Aktif olarak seçili client (UI'daki client switcher). Org geneli görünümde null. */
  activeClientId: string | null;

  /**
   * Kullanıcının ÜST HESABI (Google MCC karşılığı) — yoksa null.
   *
   * `orgId` ile AYRI: orgId ŞU AN bakılan şirket, bu ise o şirketin (ve
   * kardeşlerinin) bağlı olduğu danışmanlık. RLS'te üst hesap tablolarının
   * TEK sınırı bu değer; onlar `org_id` taşımıyor çünkü var oluş sebepleri
   * birden çok organizasyonu bir arada tutmak.
   */
  managerAccountId: string | null;

  /**
   * ═══ PLATFORM SAHİBİ — ADVETICS'İ İŞLETEN TARAF ═══
   *
   * Üst hesabı SATAN taraf, henüz üyesi OLMADIĞI bir üst hesabı kurabilmeli
   * ve içine girebilmeli. Bu yetki bir organizasyonun da bir üst hesabın da
   * DIŞINDA — o yüzden `role` ya da `permissions` içinde değil.
   *
   * RLS'E GİRMİYOR ve bu kasıtlı: gücü politikalarda değil BAĞLAM
   * ÇÖZÜMÜNDE, yani hangi üst hesaba geçebileceğinde. Geçtikten sonra
   * `managerAccountId` normal bir değer ve otuz politika bugünkü gibi
   * çalışıyor. Politikaya dokunmayan bir yetki, izolasyonu delme riski
   * taşımıyor.
   */
  platformAdmin: boolean;

  /**
   * "TÜM ŞİRKETLER" MODU — üst hesabın altındaki her şirket tek pencerede.
   *
   * VARSAYILANI `false` ve RLS'te de öyle: `app.org_kapsaminda()` bayrak
   * kapalıyken `org_id = app.current_org_id()` diyor, yani davranış
   * bugünküyle birebir aynı. Bayrağı YALNIZCA sunucu yazıyor ve yalnızca
   * kullanıcının gerçekten bir üst hesabı varsa.
   *
   * Bu moddayken `activeClientId` daima `null`: mod bir GENEL BAKIŞ ve
   * bir workspace seçmek, o workspace'in şirketine geçmek demek.
   */
  tumSirketler: boolean;

  /** En yüksek yetkili rol. Birden fazla membership varsa en genişi seçilir. */
  role: Role;

  /** Org genelinde yetkili mi (owner/admin). RLS'te `is_org_admin` olarak set edilir. */
  isOrgAdmin: boolean;

  permissions: Permission[];
}

/**
 * BAĞLAMDAKİ ŞİRKET SEÇİMİ — `ctx.orgId` bunu TAŞIYAMIYOR.
 *
 * "Tüm şirketler" modunda `orgId` EV şirketi (yazma yolları oraya çivili)
 * ve mod ayrı bir bayrakta duruyor. `ctx.orgId`yi bir SEÇİM gibi geri
 * göndermek, modu sessizce düşürüyordu: `/auth/session` her çağrıldığında
 * bayrak `false` dönüyor, panel "Advetics" yazıyor ama veri ajans geneli
 * geliyordu — bu depoda bir kez "kritik veri güvenliği ihlali" olarak
 * bildirilen başlık≠gövde hâlinin aynısı.
 *
 * Dönüşüm TEK YERDE. İki uçta ayrı ayrı yazılsaydı biri güncellenip
 * diğeri unutulurdu ve fark yalnızca o uçtan gelen kullanıcıda görünürdü.
 */
export function orgSecimi(ctx: Pick<TenantContext, 'orgId' | 'tumSirketler'>): string {
  return ctx.tumSirketler ? 'all' : ctx.orgId;
}

/** Denetim kaydı için istek meta verisi. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface AuthenticatedUser {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  locale: string;
  status: 'active' | 'invited' | 'disabled';
}

export interface SessionResponse {
  user: AuthenticatedUser;
  organization: { id: string; name: string; slug: string; plan: string };
  memberships: Array<{
    id: string;
    clientId: string | null;
    clientName: string | null;
    role: Role;
  }>;
  activeClientId: string | null;
  permissions: Permission[];
  isOrgAdmin: boolean;
  /**
   * Kullanıcının seçebileceği müşteriler, isimleriyle.
   *
   * `memberships`ten TÜRETİLEMEZ: org geneli yetkili bir kullanıcının
   * (owner/admin) tek bir membership satırı vardır ve `clientId` null'dır.
   * Listeyi membership'lerden çıkarmak, yöneticiye boş bir seçici gösteriyordu
   * — müşteri seçilemediği için bağlantı kurmak imkânsız hâle geliyordu.
   */
  availableClients: Array<{ id: string; name: string; status: string }>;

  /**
   * ŞU AN SEÇİLİ şirket. `organization.id` ile aynı olmayabilir.
   *
   * `organization` kullanıcının EV şirketi (token da onu taşıyor);
   * bu alan üst hesap altında geçilen şirket. İkisini tek alanda tutmak,
   * panelin "hangi şirkettesin" ile "hangi şirkete aitsin" sorularını
   * ayırt edememesi demekti.
   */
  activeOrganizationId: string;

  /** "Tüm şirketler" görünümü açık mı — seçicinin işaretlediği satır. */
  tumSirketler: boolean;

  /**
   * Üst hesap (MCC) ve altındaki şirketler — yoksa null.
   *
   * Şirket değiştiricinin listesi bu. `memberships`ten TÜRETİLEMEZ: kardeş
   * şirketlerde kullanıcının hiç üyelik satırı yok.
   */
  managerAccount: {
    id: string;
    name: string;
    /** Satılan paket — kısıtlar `PAKET_SINIRLARI` içinde. */
    paket: ManagerPaket;
    organizations: Array<{ id: string; name: string; slug: string }>;
  } | null;

  /**
   * ═══ GEÇİLEBİLECEK ÜST HESAPLAR — SEÇİCİNİN LİSTESİ ═══
   *
   * Uzun süre bir kullanıcının TEK üst hesabı olabiliyordu (`@@unique
   * ([userId])`) ve liste diye bir şey gerekmiyordu. Advetics'i işleten
   * taraf üst hesap SATMAYA başlayınca kilidin şartı karşılandı: birden çok
   * üst hesap ve aralarında geçiş.
   *
   * LİSTE ÜYELİKLERDEN TÜRETİLMİYOR. Platform sahibi henüz ÜYESİ OLMADIĞI
   * bir üst hesaba da geçebiliyor — kurduğu hesaba girip ayarlayabilmesi
   * gerekiyor. Sunucu listeyi ona göre kuruyor; panel yalnızca çiziyor.
   *
   * TEK ELEMANLIYSA SEÇİCİ ÇİZİLMİYOR: geçilecek yer yokken bir açılır
   * kutu, kullanıcıyı olmayan bir özelliği aramaya gönderir.
   */
  secilebilirUstHesaplar: Array<{
    id: string;
    name: string;
    slug: string;
    paket: ManagerPaket;
    /** O üst hesabın altındaki şirket sayısı — seçicide ağırlığı gösteriyor. */
    sirketSayisi: number;
  }>;

  /** Advetics'i işleten taraf mı — üst hesap kurabiliyor ve hepsine geçebiliyor. */
  platformAdmin: boolean;

  /**
   * KULLANICININ GEÇEBİLECEĞİ BÜTÜN ŞİRKETLER — üst hesabı olmasa da.
   *
   * `managerAccount` ajans katmanını anlatıyor ve danışmanda `null` oluyor.
   * Ama danışman da birden çok şirkete yetkili olabiliyor: şirket seviyesi
   * yetki verildiğinde üyelik satırı O ŞİRKETTE açılıyor. Seçici yalnızca
   * `managerAccount`a bakarsa o şirketleri hiç göstermiyor — yetki
   * veriliyor, kullanıcı oraya GEÇEMİYOR.
   */
  erisilebilirSirketler: Array<{
    id: string;
    name: string;
    slug: string;
    /**
     * O ŞİRKETTE KULLANICININ ERİŞEBİLDİĞİ workspace'ler.
     *
     * Seçici üst hesabı olmayan kullanıcıda bu listeden besleniyor ve
     * eskiden yalnızca AKTİF şirketinkini biliyordu: diğer satırlar
     * "0 workspace · Bu şirkette workspace yok" yazıyordu. Bilgi eksikliği
     * değil YANLIŞ BİLGİ — workspace vardı, ekranda yok deniyordu.
     */
    workspaces: Array<{ id: string; name: string }>;
  }>;
}
