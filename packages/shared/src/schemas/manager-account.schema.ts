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

/** Üst hesap ağacı — panelin okuduğu şekil. */
export interface ManagerAccountTree {
  id: string;
  name: string;
  slug: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    /** Bu şirketteki workspace sayısı — arşivlenmişler HARİÇ. */
    workspaceCount: number;
    /** Kullanıcının EV şirketi mi. */
    isHome: boolean;
  }>;
}
