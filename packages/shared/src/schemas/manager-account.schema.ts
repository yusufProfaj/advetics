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
