import { ikiDil } from '@advetics/shared';

/**
 * Panel kabuğu: kenar menüsünün sabit parçaları, kullanıcı menüsü, mobil
 * çekmece, "+ Oluştur", hata ve bulunamadı ekranları, yükleniyor, tema,
 * çıkış, süzgeç ve sayfalama, kapsam seçici, bildirim zili ve bekleyen
 * işler. Menü satırlarının adı `menu.ts`te.
 */
export const kabukSozlugu = ikiDil(
  {
    kenar: {
      hesabim: 'Hesabım',
      ikiAdim: 'İki adımlı giriş',
      tumSirketler: 'Tüm şirketler',
      guclendirildi: 'Advetics ile güçlendirilmiştir',
      ayarlar: 'Ayarlar',
      modulKapsami: (n: number) => `Modül ${n} kapsamında gelecek`,
      anaMenu: 'Ana menü',
    },
    olustur: {
      etiket: 'Oluştur',
      baslik: 'Ne oluşturalım?',
      reklam: 'Reklam',
      reklamAciklama: 'Yedi amaçtan biriyle, adım adım',
      strateji: 'Strateji',
      stratejiAciklama: 'Plan, rapor ve müşteri onayı',
      gonderi: 'Gönderi öne çıkar',
      gonderiAciklama: 'Instagram gönderisini boostla',
      kural: 'Kural',
      rapor: 'Rapor',
    },
    kullanici: {
      menu: 'Kullanıcı menüsü',
      verileriYenile: 'Verileri yenile',
      cikis: 'Çıkış yap',
      tema: 'Tema',
      temaSistem: 'Sistem',
      temaAcik: 'Açık',
      temaKoyu: 'Koyu',
    },
    mobil: {
      ac: 'Menüyü aç',
      kapat: 'Menüyü kapat',
      menu: 'Menü',
    },
    hata: {
      baslik: 'Bu ekran yüklenemedi',
      metin:
        'Sunucudan veri alınırken bir hata oluştu. Menüden başka bir ekrana geçebilir ya da tekrar deneyebilirsin.',
      kimlik: 'Hata kimliği:',
      tekrarDene: 'Tekrar dene',
      yukleniyor: 'Sayfa yükleniyor…',
      bulunamadi: 'Sayfa bulunamadı',
      bulunamadiMetin: 'Adres yanlış yazılmış ya da sayfa taşınmış olabilir.',
      genelBakisaDon: 'Genel Bakış’a dön',
    },
    genel: {
      yukleniyor: 'Yükleniyor',
      kaydirma: 'Tabloyu yana kaydırabilirsin',
      workspaceSecilemedi: 'Workspace seçilemedi.',
      aciliyor: 'açılıyor…',
      kapsamDegistirilemedi: 'Kapsam değiştirilemedi.',
    },
    suzgec: {
      ara: (etiket: string) => `${etiket} ara`,
      gosteriliyor: (n: number, toplam: number) => `${n} / ${toplam} gösteriliyor`,
      eslesmeYok: (ara: string) => `“${ara}” ile eşleşen yok.`,
      kaldir: (etiket: string) => `${etiket} süzgecini kaldır`,
      sayfalama: 'Sayfalama',
      onceki: 'Önceki sayfa',
      sonraki: 'Sonraki sayfa',
    },
  },
  {
    kenar: {
      hesabim: 'My account',
      ikiAdim: 'Two-step sign-in',
      tumSirketler: 'All companies',
      guclendirildi: 'Powered by Advetics',
      ayarlar: 'Settings',
      modulKapsami: (n) => `Coming with module ${n}`,
      anaMenu: 'Main menu',
    },
    olustur: {
      etiket: 'Create',
      baslik: 'What shall we create?',
      reklam: 'Ad',
      reklamAciklama: 'With one of seven goals, step by step',
      strateji: 'Strategy',
      stratejiAciklama: 'Plan, report and client approval',
      gonderi: 'Boost a post',
      gonderiAciklama: 'Boost an Instagram post',
      kural: 'Rule',
      rapor: 'Report',
    },
    kullanici: {
      menu: 'User menu',
      verileriYenile: 'Refresh data',
      cikis: 'Sign out',
      tema: 'Theme',
      temaSistem: 'System',
      temaAcik: 'Light',
      temaKoyu: 'Dark',
    },
    mobil: {
      ac: 'Open menu',
      kapat: 'Close menu',
      menu: 'Menu',
    },
    hata: {
      baslik: 'This screen could not be loaded',
      metin:
        'Something went wrong while getting data from the server. You can switch to another screen from the menu or try again.',
      kimlik: 'Error ID:',
      tekrarDene: 'Try again',
      yukleniyor: 'Loading page…',
      bulunamadi: 'Page not found',
      bulunamadiMetin: 'The address may be mistyped or the page may have moved.',
      genelBakisaDon: 'Back to Overview',
    },
    genel: {
      yukleniyor: 'Loading',
      kaydirma: 'You can scroll the table sideways',
      workspaceSecilemedi: 'Could not select the workspace.',
      aciliyor: 'opening…',
      kapsamDegistirilemedi: 'Could not change the scope.',
    },
    suzgec: {
      ara: (etiket) => `Search ${etiket}`,
      gosteriliyor: (n, toplam) => `Showing ${n} / ${toplam}`,
      eslesmeYok: (ara) => `Nothing matches “${ara}”.`,
      kaldir: (etiket) => `Remove the ${etiket} filter`,
      sayfalama: 'Pagination',
      onceki: 'Previous page',
      sonraki: 'Next page',
    },
  },
);
