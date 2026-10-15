import { ikiDil } from '@advetics/shared';

/**
 * AYARLAR ÇERÇEVESİ (D2): kapsam satırı, sayfa iç menüsü, ortak hata
 * cümleleri, güncelle düğmesi, alıcı listesi, veri durumu ekranı ve
 * Ayarlar'ın lib yardımcıları. Sekme adları shared'da (`ayarSekmesiAdi`).
 */
export const ayarlarSozlugu = ikiDil(
  {
    kapsam: {
      onek: 'Kapsam: ',
      duzey: { ajans: 'Ajans', sirket: 'Şirket', kisi: 'Kişisel' },
      aciklama: {
        ajans: 'Bu ekrandaki değişiklik ajansın altındaki şirketleri etkiler.',
        sirket: 'Bu ekrandaki değişiklik şirketin tamamını etkiler.',
        kisi: 'Bu ekrandaki değişiklik yalnız seni etkiler.',
      },
      bolum: 'Ayarlar',
      bolumler: 'Ayarlar bölümleri',
    },
    ortak: {
      baglantiKurulamadi: 'Bağlantı kurulamadı',
      hesapAjansta: 'Hesap bağlamak için ajansınıza yazın.',
      hicGirisYok: 'Hiç giriş yapmadı',
      uzunSuredir: (gun: number) => `${gun} gündür giriş yok; ayrıldıysa erişimini kaldır`,
    },
    ekipSayfasi: {
      aciklama:
        'Danışmanlar şirketlere yetkilendirilir ve o şirketin bütün workspace’lerini görür. Müşteri hesapları tek bir workspace’e bağlı kalır.',
      ekipListesi: (h: string) => `Ekip listesi: ${h}`,
      workspaceListesi: (h: string) => `Workspace listesi: ${h}`,
      sirketListesi: (h: string) => `Şirket listesi: ${h}`,
      ikiAdimAyari: (h: string) => `İki adımlı doğrulama ayarı: ${h}`,
      bazilariOkunamadi: 'Bazı bölümler okunamadı',
      ikiAdim: 'İki adımlı doğrulama',
    },
    sirketlerSayfasi: {
      sirketSec: 'Workspace’leri görmek için bir şirket seç',
      tumSirketler: (yonetir: boolean) =>
        `Şu an bütün şirketleri birlikte görüyorsun. ${
          yonetir ? 'Soldaki listeden' : 'Üstteki seçiciden'
        } bir şirkete tıklamak seni o şirkete geçirir.`,
      yeniWorkspace: '+ Yeni workspace',
      aciklamaYonetici:
        'Soldan bir şirkete geç, sağda o şirketin workspace’lerini yönet. Bir workspace’in hesapları, markası ve bilgileri Marka Merkezi’nde.',
      aciklama: 'Bu şirketin workspace’leri. Bir workspace’in hesapları, markası ve bilgileri Marka Merkezi’nde.',
    },
    guncelle: {
      ilerlemeOkunamadi: 'İlerleme okunamadı.',
      baslatilamadi: 'Güncelleme başlatılamadı.',
      tazelik: (zaman: string, bayat: boolean) =>
        `Veriler ${zaman} güncellendi.${bayat ? ' Güncelleme durmuş olabilir.' : ''}`,
      hicCekilmedi: 'Veri henüz hiç çekilmedi.',
      araliGuncelleniyor: (aralik: string) => `${aralik} güncelleniyor`,
      hicGuncellenmedi: 'hiç güncellenmedi',
      tamamlanamadi: (n: number) => `${n} iş tamamlanamadı`,
      ayrinti: 'Ayrıntı',
      halaSuruyor: 'Hâlâ sürüyor. Veriler geldikçe bu ekrana yansır.',
      surerOkunamadi: (m: string) => `Güncelleme sürüyor, ilerleme okunamadı: ${m}`,
      guncelleniyor: 'Güncelleniyor…',
      guncelleniyorSayac: (biten: number, toplam: number) => `Güncelleniyor ${biten}/${toplam}`,
      kismen: 'Kısmen güncellendi',
      guncellendi: 'Güncellendi',
      guncelle: 'Güncelle',
    },
    alici: {
      gecersiz: (l: string) => `Geçerli bir e-posta değil: ${l}`,
      enFazla: (sinir: number, l: string) => `En fazla ${sinir} alıcı. Eklenmeyen: ${l}`,
      cikar: (adres: string) => `${adres} adresini çıkar`,
      ornek: 'ornek@firma.com',
      ekle: 'ekle…',
      sayac: (n: number) => `${n} alıcı · hepsi birbirinin adresini görecek`,
      bosOnce: 'Boş bırakılırsa ',
      bosSonra: ' adresine gönderilir.',
      aliciYok: 'Workspace’in kayıtlı rapor alıcısı yok: en az bir adres eklemelisin.',
    },
    senkron: {
      elenme: {
        syncDisabled: 'izleme kapalı',
        clientInactive: 'workspace aktif değil',
        connectionInactive: 'bağlantı yeniden yetki istiyor',
        accountStatus: 'hesabın platform durumu uygun değil',
      },
      isAdlari: {
        structure: 'Yapı taraması',
        insights_realtime: 'Metrik (bugün)',
        insights_backfill: 'Metrik (geçmiş)',
        initial_backfill: 'İlk geçmiş çekimi',
        organic_posts: 'Organik gönderiler',
        keyword_insights: 'Anahtar kelimeler',
        leads_reconcile: 'Potansiyel Müşteriler',
      } as Record<string, string>,
      reklamHesaplari: 'Reklam hesapları',
      hesapOzeti: (atanmis: number, izlenen: number) => `${atanmis} atanmış hesap · ${izlenen} tanesi izleniyor`,
      elenen: (l: string) => ` · elenen: ${l}`,
      hesapYok: 'Atanmış reklam hesabı yok',
      hesapYokNeden:
        'Bu workspace’e hiç reklam hesabı atanmamış. Kurulum’daki hesaplar bloğundan ata; atama izlemeyi de açıyor ve 90 günlük geçmişi kuyruğa alıyor.',
      isler: (gun: number) => `Son ${gun} günün senkronizasyon işleri`,
      gosteriliyor: (n: number, toplam: number) => `${n} / ${toplam} iş gösteriliyor`,
      isYok: 'Senkronizasyon işi yok',
      isYokNeden: (gun: number) =>
        `Son ${gun} günde hiç senkronizasyon işi kaydedilmemiş. Hesap yeni atandıysa işler birkaç dakika içinde görünür; görünmüyorsa senkronizasyon worker'ı çalışmıyor olabilir.`,
      is: 'İş',
      hesap: 'Hesap',
      durum: 'Durum',
      yazilanSatir: 'Yazılan satır',
      zaman: 'Zaman',
      izlenenHesap: 'İzlenen hesap',
      engelliHesap: 'Engelli hesap',
      dusenIs: (gun: number) => `Düşen iş · son ${gun} gün`,
      kuyrukta: (n: number) => `${n} iş hâlâ kuyrukta ya da koşuyor.`,
      bosIs: (gun: number) => `Başarılı ama boş iş · son ${gun} gün`,
      bosIsIpucu:
        'İş hatasız bitti ama tek satır yazmadı; genellikle yapı taraması metriklerden sonra koştuğu için.',
      yapi: (z: string) => `Yapı: ${z}`,
      metrik: (z: string) => `Metrik: ${z}`,
      zamanlanmisDegil: 'Zamanlanmış güncellemeye girmiyor.',
      satir: (n: number) => `${n} satır`,
      atildi: (n: number) => `${n} atıldı`,
      deneme: (n: number) => `${n}. deneme`,
      bosBasari: 'başarılı · 0 satır',
      hic: 'hiç',
    },
  },
  {
    kapsam: {
      onek: 'Scope: ',
      duzey: { ajans: 'Agency', sirket: 'Company', kisi: 'Personal' },
      aciklama: {
        ajans: 'Changes on this screen affect the companies under the agency.',
        sirket: 'Changes on this screen affect the whole company.',
        kisi: 'Changes on this screen affect only you.',
      },
      bolum: 'Settings',
      bolumler: 'Settings sections',
    },
    ortak: {
      baglantiKurulamadi: 'Could not connect',
      hesapAjansta: 'Contact your agency to connect an account.',
      hicGirisYok: 'Never signed in',
      uzunSuredir: (gun) => `No sign-in for ${gun} days; if they left, remove their access`,
    },
    ekipSayfasi: {
      aciklama:
        "Consultants are authorized for companies and see all of that company's workspaces. Client accounts stay tied to a single workspace.",
      ekipListesi: (h) => `Team list: ${h}`,
      workspaceListesi: (h) => `Workspace list: ${h}`,
      sirketListesi: (h) => `Company list: ${h}`,
      ikiAdimAyari: (h) => `Two-step verification setting: ${h}`,
      bazilariOkunamadi: 'Some sections could not be read',
      ikiAdim: 'Two-step verification',
    },
    sirketlerSayfasi: {
      sirketSec: 'Choose a company to see its workspaces',
      tumSirketler: (yonetir) =>
        `You are currently viewing all companies together. Clicking a company ${
          yonetir ? 'in the list on the left' : 'in the selector above'
        } switches you to that company.`,
      yeniWorkspace: '+ New workspace',
      aciklamaYonetici:
        "Switch to a company on the left and manage its workspaces on the right. A workspace's accounts, brand and details are in Brand Center.",
      aciklama: "This company's workspaces. A workspace's accounts, brand and details are in Brand Center.",
    },
    guncelle: {
      ilerlemeOkunamadi: 'Could not read progress.',
      baslatilamadi: 'Could not start the refresh.',
      tazelik: (zaman, bayat) => `Data refreshed ${zaman}.${bayat ? ' Refreshing may have stopped.' : ''}`,
      hicCekilmedi: 'No data has been pulled yet.',
      araliGuncelleniyor: (aralik) => `Refreshing ${aralik}`,
      hicGuncellenmedi: 'never refreshed',
      tamamlanamadi: (n) => `${n} job(s) could not finish`,
      ayrinti: 'Details',
      halaSuruyor: 'Still running. Data will appear on this screen as it arrives.',
      surerOkunamadi: (m) => `Refresh in progress, could not read progress: ${m}`,
      guncelleniyor: 'Refreshing…',
      guncelleniyorSayac: (biten, toplam) => `Refreshing ${biten}/${toplam}`,
      kismen: 'Partly refreshed',
      guncellendi: 'Refreshed',
      guncelle: 'Refresh',
    },
    alici: {
      gecersiz: (l) => `Not a valid email: ${l}`,
      enFazla: (sinir, l) => `At most ${sinir} recipients. Not added: ${l}`,
      cikar: (adres) => `Remove ${adres}`,
      ornek: 'name@company.com',
      ekle: 'add…',
      sayac: (n) => `${n} recipient(s) · everyone will see each other's address`,
      bosOnce: 'If left empty, it is sent to ',
      bosSonra: '.',
      aliciYok: 'The workspace has no saved report recipients: you must add at least one address.',
    },
    senkron: {
      elenme: {
        syncDisabled: 'tracking off',
        clientInactive: 'workspace not active',
        connectionInactive: 'connection needs reauthorization',
        accountStatus: "the account's platform status is not eligible",
      },
      isAdlari: {
        structure: 'Structure scan',
        insights_realtime: 'Metrics (today)',
        insights_backfill: 'Metrics (history)',
        initial_backfill: 'Initial history pull',
        organic_posts: 'Organic posts',
        keyword_insights: 'Keywords',
        leads_reconcile: 'Leads',
      },
      reklamHesaplari: 'Ad accounts',
      hesapOzeti: (atanmis, izlenen) => `${atanmis} assigned account(s) · ${izlenen} tracked`,
      elenen: (l) => ` · excluded: ${l}`,
      hesapYok: 'No assigned ad accounts',
      hesapYokNeden:
        'No ad account is assigned to this workspace. Assign one from the accounts block in Setup; assigning also turns on tracking and queues 90 days of history.',
      isler: (gun) => `Sync jobs of the last ${gun} days`,
      gosteriliyor: (n, toplam) => `Showing ${n} / ${toplam} jobs`,
      isYok: 'No sync jobs',
      isYokNeden: (gun) =>
        `No sync jobs were recorded in the last ${gun} days. If the account was just assigned, jobs appear within a few minutes; if they don't, the sync worker may not be running.`,
      is: 'Job',
      hesap: 'Account',
      durum: 'Status',
      yazilanSatir: 'Rows written',
      zaman: 'Time',
      izlenenHesap: 'Tracked accounts',
      engelliHesap: 'Blocked accounts',
      dusenIs: (gun) => `Failed jobs · last ${gun} days`,
      kuyrukta: (n) => `${n} job(s) still queued or running.`,
      bosIs: (gun) => `Succeeded but empty · last ${gun} days`,
      bosIsIpucu:
        'The job finished without errors but wrote no rows; usually because the structure scan ran after the metrics.',
      yapi: (z) => `Structure: ${z}`,
      metrik: (z) => `Metrics: ${z}`,
      zamanlanmisDegil: 'Not included in scheduled refreshes.',
      satir: (n) => (n === 1 ? '1 row' : `${n} rows`),
      atildi: (n) => `${n} skipped`,
      deneme: (n) => `attempt ${n}`,
      bosBasari: 'succeeded · 0 rows',
      hic: 'never',
    },
  },
);
