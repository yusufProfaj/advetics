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
  session: Pick<SessionResponse, 'activeClientId'> & {
    availableClients?: ReadonlyArray<{ id: string; status: string }>;
  },
  musteriParam: string | undefined,
): string | null {
  if (musteriParam ?? session.activeClientId) return musteriParam ?? session.activeClientId;
  /*
   * TEK WORKSPACE VARSA SEÇİM YOK, CEVAP VAR (canlı denetim, 2026-10-09):
   * Ege Birlik Yapı'nın tek workspace'i varken İyileştir "hangi workspace?"
   * diye soruyordu; Genel Bakış aynı hâlde workspace'i doğrudan gösteriyor.
   * Bu "listenin ilk satırına düşmek" DEĞİL: belirsizlik yalnız birden çok
   * etkin workspace varken var ve o zaman yine seçim istenir.
   */
  const etkin = (session.availableClients ?? []).filter((c) => c.status === 'active');
  return etkin.length === 1 ? etkin[0]!.id : null;
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

/**
 * ═══ ADRESTEKİ WORKSPACE ≠ OTURUMDAKİ WORKSPACE (Ajan 4, 2026-10-13) ═══
 *
 * Marka Merkezi ve Varlıklar workspace'i ADRESTEN okuyor (`?musteri=`) ve
 * bağlantıların çoğu adresle geliyor: bildirim zilinin "Hesap ata"sı,
 * Bağlantılar › İzlenen hesaplar'daki workspace adı, Varlıklar › Kitleler'in
 * "Kurulum'da değiştir"i. Ama veri RLS'ten OTURUMDAKİ seçimle geçiyor:
 * `app.can_access_client` seçili workspace varken YALNIZ onu açıyor. Yani
 * üstte A seçiliyken B'nin Marka Merkezi'ni açan kullanıcı başlıkta B'yi,
 * gövdede ise BOŞ kartlar görüyordu ("Atanmadı", boş marka bilgileri) —
 * hata yok, yanlış bir ekran. Kurulum yazmaları da reddediliyordu
 * ("önce üstten bu workspace'i seç") ve ekranda tıklanacak bir şey yoktu.
 *
 * Üç hâl:
 *  · `ayni`     — adres = seçim; normal ekran.
 *  · `secimYok` — üstte workspace seçili değil (şirket geneli) ve hedef bu
 *                 şirkette: okuma doğru (RLS seçim yokken bütün erişim
 *                 listesini açıyor), yazma seçim istiyor → uyarı + tek tık.
 *  · `farkli`   — üstte BAŞKA workspace seçili ya da hedef bu şirkette değil:
 *                 okuma yanlış/boş gelir → içerik ÇİZİLMEZ, tek tıkla geçiş.
 *
 * NEDEN OTOMATİK GEÇİŞ DEĞİL: seçim çerezde ve bütün sekmeleri etkiliyor.
 * Başka sekmede A ile çalışan kullanıcının seçimini bir bağlantı açtı diye
 * sessizce B'ye çevirmek, o sekmedeki bir sonraki yazmayı B'ye gönderirdi.
 * Geçiş açık bir tık.
 */
export type WorkspaceUyumu = 'ayni' | 'secimYok' | 'farkli';

export function workspaceUyumu(
  session: Pick<SessionResponse, 'activeClientId'> & {
    availableClients?: ReadonlyArray<{ id: string; status: string }>;
  },
  clientId: string,
): WorkspaceUyumu {
  if (session.activeClientId === clientId) return 'ayni';
  const buSirkette = (session.availableClients ?? []).some((c) => c.id === clientId && c.status === 'active');
  return session.activeClientId === null && buSirkette ? 'secimYok' : 'farkli';
}
