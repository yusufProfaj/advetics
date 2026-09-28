import type { SessionResponse } from '@advetics/shared';

/**
 * ═══ WORKSPACE BAZINDA ÇALIŞAN SAYFA HANGİ WORKSPACE'İ GÖSTERİYOR ═══
 *
 * On üç sayfa bu çözümü ELLE yazıyordu ve hepsinde aynı son dal vardı:
 * `session.availableClients[0]?.id`. Üst barda "şirket geneli" seçili
 * olan kullanıcı Raporlar'a, Kurallar'a, Bütçe'ye girdiğinde listedeki
 * İLK workspace SESSİZCE açılıyordu. Üst bar bir şey, sayfa başka bir şey
 * söylüyordu; kullanıcı bir workspace'in kuralını düzenlerken şirketin
 * geneline baktığını sanıyordu. Bilgi Bankası bu hatayı kendi başına
 * görüp kapatmıştı (`bilgi-bankasi/workspace-secici.tsx`); diğer on iki
 * sayfa aynı dalı taşımaya devam ediyordu.
 *
 * SIRA: URL, sonra üst bardaki seçim, sonra HİÇBİR ŞEY. URL önce geliyor
 * çünkü Genel Bakış'tan gelen bağlantılar (`?musteri=`) belirli bir
 * workspace'i hedefliyor. Listenin ilk satırı bir seçim DEĞİL; seçim
 * yoksa sayfa bunu söylüyor ve seçimi yerinde yaptırıyor
 * (`WorkspaceGerekli`).
 */
export function sayfaWorkspaceId(
  session: Pick<SessionResponse, 'activeClientId'>,
  musteriParam: string | undefined,
): string | null {
  return musteriParam ?? session.activeClientId ?? null;
}

/** Seçim ekranının ihtiyaç duyduğu her şey — oturumdan tek yerde türetilir. */
export interface WorkspaceSecimVerisi {
  workspaceler: Array<{ id: string; name: string }>;
  sirketAdi: string;
  /**
   * Workspace oluşturabilecek kişiye Kurulum Sihirbazı'nı göster,
   * oluşturamayana "yöneticine sor" de. Yetkisi olmayan birine çalışmayan
   * bir bağlantı göstermek, onu kapalı bir kapıya göndermek demek.
   */
  kurulumGorunur: boolean;
}

export function workspaceSecimVerisi(session: SessionResponse): WorkspaceSecimVerisi {
  const sirketAdi = session.tumSirketler
    ? 'Tüm şirketler'
    : (session.managerAccount?.organizations.find((o) => o.id === session.activeOrganizationId)
        ?.name ?? session.organization.name);
  return {
    // Arşivlenmiş workspace seçilebilir bir hedef değil.
    /*
     * TÜRKÇE SIRA. Liste veritabanının sırasıyla geliyordu ve canlıda
     * "Çizgi Medikal" "Coordinat Yapı"dan önce duruyordu: 54 workspace'lik
     * listede aranan ad beklenen yerde değildi. `localeCompare('tr')` Ç'yi
     * C'den sonra, İ'yi I'dan sonra koyuyor.
     */
    workspaceler: session.availableClients
      .filter((c) => c.status === 'active')
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    sirketAdi,
    kurulumGorunur: session.permissions.includes('client.write'),
  };
}
