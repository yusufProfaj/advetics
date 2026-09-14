import { z } from 'zod';
import { MANAGER_PAKETLERI } from '../constants/paketler';
import type { ManagerPaket } from '../constants/paketler';
import { UST_HESAP_ROLLERI, type Role } from '../auth/roles';
import { emailSchema, passwordSchema } from './auth.schema';

/**
 * ÜST HESAP (Google MCC karşılığı) şemaları.
 *
 * Hiyerarşi: Üst Hesap → Şirket → Workspace → Reklam Hesabı → Kampanya.
 */

export const createManagerAccountSchema = z.object({
  name: z.string().trim().min(2, 'Üst hesap adı en az 2 karakter olmalı').max(120),
  /**
   * SATILAN PAKET — yalnızca PLATFORM SAHİBİ seçebiliyor.
   *
   * Kendi ajansını kuran bir org yöneticisi burayı göndermiyor ve
   * `baslangic` düşüyor; gönderse bile sunucu YOK SAYIYOR. Aksi hâlde
   * kullanıcı kendi paketini uca elle istek atarak yükseltirdi — satılan
   * bir ürünün sınırı, satın alanın elinde olamaz.
   */
  paket: z.enum(MANAGER_PAKETLERI).optional(),
});
export type CreateManagerAccountInput = z.infer<typeof createManagerAccountSchema>;

/**
 * Aktif üst hesabı düzenler.
 *
 * `paket` yine yalnızca PLATFORM SAHİBİNDE geçiyor — `create` ile aynı
 * gerekçe: satılan bir ürünün sınırı satın alanın elinde olamaz. Başkası
 * gönderirse sunucu YOK SAYMIYOR, REDDEDİYOR: yok saymak, "paketi
 * değiştirdim" sanan bir kullanıcıya sessizce eski paketi bırakmak olurdu.
 */
export const updateManagerAccountSchema = z.object({
  name: z.string().trim().min(2, 'Üst hesap adı en az 2 karakter olmalı').max(120).optional(),
  paket: z.enum(MANAGER_PAKETLERI).optional(),
});
export type UpdateManagerAccountInput = z.infer<typeof updateManagerAccountSchema>;

/**
 * Üst hesabın altına YENİ bir şirket açar.
 *
 * VAR OLAN bir şirketi bağlamak BİLEREK YOK: o şirketin kendi kullanıcıları
 * ve kendi verisi var; "şu şirketi üst hesabıma ekle" diyebilmek, bir
 * kullanıcının başkasının şirketini kendi erişim listesine yazması demekti.
 * Devir gerekiyorsa iki tarafın da onayını isteyen ayrı bir akış gerekir.
 */
export const createManagedOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Şirket adı en az 2 karakter olmalı').max(120),
});
export type CreateManagedOrganizationInput = z.infer<typeof createManagedOrganizationSchema>;

/**
 * VAR OLAN bir workspace'i başka bir şirkete taşır.
 *
 * Şirket AÇMAK ile workspace TAŞIMAK farklı işler: birincisi boş bir kap
 * yaratıyor, ikincisi 30 tabloda `org_id` güncelliyor. Aynı uçta toplamak,
 * "şirket ekle" düğmesinin bir gün veri taşımaya başlaması demekti.
 */
export const moveWorkspaceSchema = z.object({
  clientId: z.string().uuid(),
  /** Hedef şirket. Kaynak şirket workspace'in kendisinden okunuyor. */
  organizationId: z.string().uuid(),
});
export type MoveWorkspaceInput = z.infer<typeof moveWorkspaceSchema>;

/** Üst hesap ağacı — panelin okuduğu şekil. */
export interface ManagerAccountTree {
  id: string;
  name: string;
  slug: string;
  /** Satılan paket — kısıtlar `PAKET_SINIRLARI` içinde. */
  paket: ManagerPaket;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    /**
     * Şirketin workspace'leri — arşivlenmişler HARİÇ.
     *
     * SAYI DEĞİL LİSTE: ekranda "3 workspace" yazıp içini göstermemek,
     * kullanıcının hangi müşterinin nerede olduğunu bulmak için her şirkete
     * tek tek geçmesi demekti. Sayı listeden türetiliyor — iki alanı ayrı
     * göndermek, birinin diğerini tutmadığı bir hâl üretir.
     */
    workspaces: Array<{ id: string; name: string; status: string }>;
    /** Kullanıcının EV şirketi mi. */
    isHome: boolean;
  }>;
}

/**
 * ═══ ŞİRKET SİLME ÖZETİ — NE GİDECEĞİ ÖNCE YAZILIYOR ═══
 *
 * `organizations` satırını silmek OTUZ tabloda cascade tetikliyor:
 * workspace'ler, reklam hesapları, KULLANICILAR, kampanyalar ve bütün
 * metrik geçmişi. Geri alma yolu yok — Meta 37 aylık sınıra takılıyor ve
 * Google'da yeniden çekmek kota harcıyor.
 *
 * Bu yüzden silme İKİ ADIM: önce ne gideceği sayılıyor, sonra siliniyor.
 * "Emin misiniz?" diye sorup ne gideceğini söylememek, bu depoda
 * `reset-clients`in yarım kalıp metrik verisini götürmesiyle aynı sınıf
 * hata — pahalı yarısı yapılır, kullanıcı ne kaybettiğini sonra öğrenir.
 */
export interface SirketSilmeOzeti {
  organizationId: string;
  name: string;
  /** Silinecek workspace adları — SAYI DEĞİL AD: "3 workspace" kimseye ne kaybedeceğini söylemiyor. */
  workspaceAdlari: string[];
  /** Bu şirkete ait reklam hesabı sayısı. Silinince metrik geçmişleri de gidiyor. */
  reklamHesabi: number;
  /** `users.org_id` bu şirket olan kullanıcılar — silinince GİRİŞ YAPAMAZLAR. */
  kullanici: number;
  /** Metrik satırı olan gün sayısı. 0 = kaybedilecek ölçüm yok. */
  metrikGunu: number;
  /**
   * Silme kullanıcının ADINI YAZMASINI istiyor mu.
   *
   * Boş bir şirket (yanlışlıkla açılmış bir test kaydı) için tek tık
   * yeterli; içinde veri olan bir şirkette aynı kolaylık, kazara yapılan
   * ve geri alınamayan bir silme demek.
   */
  adOnayiGerekli: boolean;
  /**
   * Silme MÜMKÜN DEĞİLSE sebebi. `null` = silinebilir.
   *
   * Düğmeyi sessizce kapatmak yerine sebep yazılıyor: kapalı bir düğme
   * "neden" sorusunu ekranda bırakıyor ve kullanıcı onu aramaya gidiyor.
   */
  engel: string | null;
}

export interface SilmeYaniti {
  silindi: true;
  /** Silinen şirketin adı — ekranda "X silindi" demek için. */
  name: string;
}

/**
 * Şirket silme isteği.
 *
 * `onayAdi` yalnızca `adOnayiGerekli` olan şirketlerde zorunlu ve sunucu
 * bunu KENDİ kontrol ediyor: paneldeki kontrol bir kolaylık, kapı değil.
 */
export const deleteOrganizationSchema = z.object({
  onayAdi: z.string().trim().max(120).optional(),
});
export type DeleteOrganizationInput = z.infer<typeof deleteOrganizationSchema>;

/** Üst hesap değiştirme. */
export const switchManagerAccountSchema = z.object({
  managerAccountId: z.string().uuid(),
});
export type SwitchManagerAccountInput = z.infer<typeof switchManagerAccountSchema>;

/**
 * ═══ ÜST HESAP EKİBİ — hesabı yönetecek kişiler ═══
 *
 * Bir üst hesap kurulduğunda tek üyesi kurucusuydu ve ikinci bir kişi
 * eklemenin YOLU YOKTU: ne uç ne ekran. Satılan bir hesabın sahibine
 * "hesabın hazır" demek, içine girebilen tek kişi platform sahibiyken
 * anlamsızdı. Kullanıcının cümlesi: *"o üst hesaba bir yetki atamamız
 * lazım (kişi hesabı eklememiz lazım ki yönetebilsin)"*.
 *
 * Roller `UST_HESAP_ROLLERI`nden: Yönetici ya da Reklam Yöneticisi. Müşteri
 * hesabı burada OLAMAZ — sınırı tek workspace, üst hesap ise bütün
 * şirketler.
 *
 * KİŞİ YOKSA OLUŞUYOR, VARSA YALNIZCA ÜYELİK EKLENİYOR — `createMember` ile
 * aynı kural: var olan kullanıcının parolasına dokunulmuyor. Bu yüzden
 * `fullName` ve `password` isteğe bağlı; kullanıcı yoksa sunucu ikisini de
 * ZORUNLU sayıyor ve eksikse açıkça söylüyor.
 */
export const ustHesapUyesiEkleSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120).optional(),
  password: passwordSchema.optional(),
  role: z.enum(UST_HESAP_ROLLERI as [Role, ...Role[]]),
});
export type UstHesapUyesiEkleInput = z.infer<typeof ustHesapUyesiEkleSchema>;

export const ustHesapUyesiGuncelleSchema = z.object({
  role: z.enum(UST_HESAP_ROLLERI as [Role, ...Role[]]),
});
export type UstHesapUyesiGuncelleInput = z.infer<typeof ustHesapUyesiGuncelleSchema>;

/** Üst hesap ekibinin bir satırı — panelin okuduğu şekil. */
export interface UstHesapUyesi {
  /** `manager_memberships.id` — rol değiştirme ve kaldırma bunu hedefliyor. */
  id: string;
  userId: string;
  email: string;
  fullName: string;
  status: string;
  lastLoginAt: string | null;
  role: Role;
  /** Bu kişi bağlamdaki kullanıcı mı — kendi yetkisini değiştiremez. */
  kendisi: boolean;
}

export interface UstHesapUyesiEklemeYaniti {
  uyelik: UstHesapUyesi;
  /** false => kullanıcı zaten vardı; yazılan parola KULLANILMADI. */
  created: boolean;
}

/**
 * ═══ ÜST HESAP LİSTESİ — "hangi hesaplar var" ═══
 *
 * `SessionResponse.secilebilirUstHesaplar` SEÇİCİNİN listesi: geçilebilecek
 * yerler, ağırlıklarıyla. Yönetim ekranı başka bir soru soruyor — "bu hesap
 * ne kadar dolu, kim yönetiyor, silinebilir mi" — ve oturum yanıtını her
 * sayfa yüklemesinde bu alanlarla şişirmenin anlamı yok.
 */
export interface UstHesapOzeti {
  id: string;
  name: string;
  slug: string;
  paket: ManagerPaket;
  status: 'active' | 'suspended';
  sirketSayisi: number;
  workspaceSayisi: number;
  /** Üst hesap ekibindeki kişi sayısı (`manager_memberships`). */
  uyeSayisi: number;
  createdAt: string;
  /** Kullanıcının EV şirketi bu hesabın altında mı — silinemez olmasının sebebi. */
  evHesabi: boolean;
  /** Şu an bu hesapta mı. */
  aktif: boolean;
}

/**
 * ═══ ÜST HESAP SİLME ÖZETİ — ne gideceği ÖNCE yazılıyor ═══
 *
 * Üst hesabı silmek ALTINDAKİ HER ŞİRKETİ siliyor ve her şirket otuz tabloda
 * cascade tetikliyor: workspace'ler, reklam hesapları, KULLANICILAR ve bütün
 * metrik geçmişi. Şirket silmedeki gerekçenin aynısı, bir kat yukarıda.
 *
 * ŞİRKETLERİ BIRAKMAK SEÇENEK DEĞİL: `organizations.manager_account_id`
 * `ON DELETE SET NULL` taşıyor, yani hesabı silip şirketleri bırakmak onları
 * hiçbir üst hesabın altında OLMAYAN, seçicide görünmeyen, kimsenin
 * geçemediği yetim kayıtlara çevirirdi — sessiz hatanın tarifi.
 */
export interface UstHesapSilmeOzeti {
  managerAccountId: string;
  name: string;
  /** Silinecek şirket adları — SAYI DEĞİL AD. */
  sirketAdlari: string[];
  workspaceSayisi: number;
  reklamHesabi: number;
  /** Bu hesabın şirketlerine bağlı kullanıcılar — silinince GİRİŞ YAPAMAZLAR. */
  kullanici: number;
  metrikGunu: number;
  adOnayiGerekli: boolean;
  /** `null` = silinebilir. Doluysa sebep ekranda yazıyor, düğme sessizce kapanmıyor. */
  engel: string | null;
}

export const deleteManagerAccountSchema = z.object({
  onayAdi: z.string().trim().max(120).optional(),
});
export type DeleteManagerAccountInput = z.infer<typeof deleteManagerAccountSchema>;

export interface UstHesapSilmeYaniti {
  silindi: true;
  name: string;
  /** Silinen şirket sayısı — ekranda "X ve 3 şirketi silindi" demek için. */
  sirketSayisi: number;
  /** Silinen hesap AKTİF hesap mıydı — panel tam sayfa yenilemek zorunda. */
  aktifti: boolean;
}
