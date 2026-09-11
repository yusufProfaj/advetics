import { z } from 'zod';

/**
 * ÜST HESAP (Google MCC karşılığı) şemaları.
 *
 * Hiyerarşi: Üst Hesap → Şirket → Workspace → Reklam Hesabı → Kampanya.
 */

export const createManagerAccountSchema = z.object({
  name: z.string().trim().min(2, 'Üst hesap adı en az 2 karakter olmalı').max(120),
});
export type CreateManagerAccountInput = z.infer<typeof createManagerAccountSchema>;

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
