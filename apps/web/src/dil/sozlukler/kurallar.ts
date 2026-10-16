import { ikiDil } from '@advetics/shared';

/**
 * KURALLAR (İyileştir › Kurallar): tablo ve yan panel
 * (`components/rules/rule-controls.tsx`), düzenleyici (`rule-editor.tsx`) ve
 * sunucuda çizilen liste/geçmiş (`kurallar-icerik.tsx`).
 *
 * Koşul, metrik, operatör, pencere, seviye ve aksiyon adları shared'dan
 * geliyor (`METRIC_META`, `OPERATOR_LABELS`, `WINDOW_LABELS`,
 * `RULE_LEVEL_LABELS`, `ACTION_LABELS`, `OUTCOME_LABELS`,
 * `KANAL_DURUM_ADI`): D4'te çevrilecek. Bu yüzden cümle ÇERÇEVESİ burada,
 * parçalar orada. Kullanıcının yazdığı kural adı çevrilmez. Kural özetinde
 * (`aciklamaCumlesi`, `ozetCumlesi`) İngilizce çerçeve eylemi sona koyuyor;
 * Türkçedeki "… olanları durdur" sırası İngilizcede kurulmuyor.
 */
export const kurallarSozlugu = ikiDil(
  {
    // ─── Ortak ───
    sayfaBasligi: 'Kurallar',
    yeniKural: 'Yeni kural',
    vazgec: 'Vazgeç',
    kaydet: 'Kaydet',
    kapat: 'Kapat',
    sil: 'Sil',
    gecmis: 'Geçmiş',
    duzenle: 'Düzenle',
    kural: 'Kural',
    tumHesaplar: 'Tüm hesaplar',
    provaModu: 'prova modunda',

    // ─── Liste (sunucu) ───
    hesapOkunamadi: 'Reklam hesapları okunamadı.',
    hesapOkunamadiGovde: (mesaj: string) =>
      `${mesaj} Yeni kuralda hesap seçilemez; kural bütün hesaplara uygulanır.`,
    kurallarAlinamadi: 'Kurallar alınamadı.',
    bosBaslik: 'Bu workspace’te kural yok',
    bosNeden1: (clientAdi: string) =>
      `Kurallar ${clientAdi} hesabını sürekli izler ve tanımladığın eşikler aşıldığında kampanyayı duraklatır, yeniden başlatır ya da bütçesini değiştirir. Yeni kurallar`,
    bosNeden2: ' başlar: ne yapacaklarını gösterir ama hiçbir şeye dokunmazlar.',
    bosYazabilir: 'Başlıktaki “Yeni kural” ile ilkini kur.',
    bosYazamaz: 'Kural oluşturmak için yetkin yok; yöneticinden rule.write izni isteyebilirsin.',
    henuzCalismadi: 'henüz çalışmadı',
    sonAksiyon: (zaman: string) => `son aksiyon ${zaman}`,
    ve: ' VE ',
    veya: ' VEYA ',
    butceAzalt: (yuzde: number) => `bütçesini %${yuzde} azalt`,
    butceArtir: (yuzde: number) => `bütçesini %${yuzde} artır`,
    /** Tablo satırının altındaki düz cümle. */
    aciklamaCumlesi: (seviye: string, kosul: string, eylem: string) =>
      `${seviye} bazında, ${kosul} olanları ${eylem}.`,

    // ─── Geçmiş paneli (sunucu) ───
    gecmisAlinamadi: 'Geçmiş alınamadı.',
    hicCalismadiBaslik: 'Bu kural henüz hiç çalışmadı',
    hicCalismadiNeden:
      'Kurallar saatte bir değerlendiriliyor; ilk tur bittiğinde burada görünür. Beklemeden görmek için “Şimdi çalıştır”.',
    sonTurlar: 'Son turlar',
    prova: '(prova)',
    hataOn: 'hata:',
    varlikIncelendi: 'varlık incelendi',
    eslesti: 'eşleşti',
    rozetHata: 'Hata',
    aksiyonSayisi: (n: number) => `${n} aksiyon`,
    aksiyonYok: 'Aksiyon yok',
    turSiniri: (toplam: number) => `Son 5 tur gösteriliyor, toplam ${toplam}.`,
    sonTurdakiKararlar: 'Son turdaki kararlar',
    kararlarAlinamadi: 'Son turun kararları alınamadı.',
    sonTurYok: 'Son tur bulunamadı.',
    kararYokBaslik: 'Hiçbir varlık koşulu sağlamadı',
    kararYokNeden: 'Kural çalıştı, yapacak bir şey bulamadı.',
    kolonVarlik: 'Varlık',
    kolonSonuc: 'Sonuç',
    kolonGerekce: 'Gerekçe',

    // ─── Tablo ───
    tabloEtiketi: 'Otomatik kurallar',
    kolonMod: 'Mod',
    kolonHesap: 'Hesap',
    kolonSonCalisma: 'Son çalışma',
    kolonEylemler: 'Eylemler',
    saatteBir: 'Saatte bir değerlendiriliyor',
    modEtiketi: 'Kural modu',
    modTumu: 'Tümü',
    modCanli: 'Canlı',
    modProva: 'Prova',
    modKapali: 'Kapalı',
    suzgecBosBaslik: 'Bu süzgeçte kural yok',
    suzgecBosNeden: (n: number) => `${n} kuralın hiçbiri bu modda değil. “Tümü”ne dönünce hepsi görünür.`,
    tumunuGoster: 'Tümünü göster',
    yeniKuralNotu: 'Yeni kurallar prova modunda başlar; hiçbir şeye dokunmaz.',
    panelEtiketi: 'Kural paneli',
    gecmisYukleniyor: 'Geçmiş yükleniyor',

    // ─── İşlem sonuçları ───
    islemBasarisiz: 'İşlem başarısız.',
    calistirSonucu: (eslesen: number, aksiyon: number, prova: boolean) =>
      `${eslesen} varlık koşulu sağladı · ${aksiyon} aksiyon${
        prova ? ' (prova: hiçbir şeye dokunulmadı)' : ' uygulandı'
      }`,
    provayaAlindi: 'Kural provaya alındı.',
    canliyaAlindi: 'Kural canlıya alındı.',
    silindi: 'Kural silindi.',

    // ─── Onay penceresi ───
    silBaslik: 'Kural silinsin mi?',
    canliBaslik: 'Kural canlıya alınsın mı?',
    canliyaAlOnay: 'Anladım, canlıya al',
    silGovde: 'silinecek ve bir daha çalışmayacak. Bu geri alınamaz.',
    canliUyari: 'Bu kural workspace’in hesabında gerçekten çalışacak.',
    canliYon1: 'Bundan sonra saatlik değerlendirmede eşleşen varlıklara',
    canliYon2: ' uygulanacak. Önce “Şimdi çalıştır” ile provada ne olacağını görmeni öneririm.',
    eylemAdi: {
      pause: 'duraklatma',
      resume: 'yeniden başlatma',
      adjust_budget: 'bütçe değişikliği',
      notify: 'bildirim',
    },
    islemYapilamadi: 'İşlem yapılamadı.',

    // ─── Satır eylemleri ───
    simdiCalistir: 'Şimdi çalıştır',
    eylemleriMenu: (ad: string) => `${ad} eylemleri`,
    digerEylemler: (ad: string) => `${ad}: diğer eylemler`,
    canliyaAl: 'Canlıya al',
    provayaAl: 'Provaya al',

    // ─── Düzenleyici ───
    canliKuralBaslik: 'Bu kural canlı.',
    canliKuralGovde:
      'Koşulu ya da aksiyonu değiştirirsen kural provaya döner ve yeniden canlıya alman gerekir.',
    kuralAdi: 'Kural adı',
    kuralAdiOrnek: 'EBM koruması',
    reklamHesabi: 'Reklam hesabı',
    hesapOkunamadiAlan: (mesaj: string) =>
      `Reklam hesapları okunamadı: ${mesaj} Kural bütün hesaplara uygulanır.`,
    kayitliHesap: 'Kayıtlı hesap',
    seviye: 'Seviye',
    birlesim: 'Koşullar nasıl birleşsin',
    birlesimVe: 'Hepsi sağlanmalı (VE)',
    birlesimVeya: 'Biri yeterli (VEYA)',
    kosullar: 'Koşullar',
    kosulMetrik: (n: number) => `Koşul ${n} metriği`,
    kosulKarsilastirma: (n: number) => `Koşul ${n} karşılaştırması`,
    kosulDeger: (n: number) => `Koşul ${n} değeri`,
    kosulPencere: (n: number) => `Koşul ${n} zaman penceresi`,
    kaldir: 'Kaldır',
    kosulEkle: '+ Koşul ekle',
    butceSeviyeHatasi:
      'Bütçe tüketimi koşulu yalnızca kampanya seviyesinde kullanılabilir: bütçe kampanya/hesap seviyesinde tanımlı, tek bir reklamın bütçe tüketimi yok.',
    aksiyon: 'Aksiyon',
    degisim: 'Değişim (%)',
    butceTavani: 'Bütçe tavanı (opsiyonel)',
    butceTavaniIpucu: 'Artış kuralında tavan koymazsan bütçe her turda büyümeye devam eder.',
    tavanYok: 'boş = tavan yok',
    bildirimNereye: 'Bildirim nereye gitsin?',
    kanallarOkunuyor: 'Kanallar okunuyor…',
    kanalOkunamadi: (mesaj: string, secim: number) =>
      `Bildirim kanalları alınamadı: ${mesaj} Kuralın kayıtlı kanal seçimi (${secim}) değiştirilmeden korunur.`,
    sunucuyaUlasilamadi: 'Sunucuya ulaşılamadı.',
    kanalYokBaslik: 'Bu workspace’te bildirim kanalı yok.',
    kanalYokGovde:
      'Kural çalışır ve eşleşmeleri kural geçmişine yazar, ama kimseye haber gitmez.',
    kanalEkle: 'Kanal ekle',
    kanalKayip: (n: number) => `${n} seçili kanal artık yok (silinmiş); kaydedince kuraldan çıkar.`,
    kanalSecilmedi: 'Kanal seçilmedi: eşleşmeler yalnız kural geçmişine yazılır.',
    guvenlikEsikleri: 'Güvenlik eşikleri',
    enAzGosterim: 'En az gösterim',
    enAzTiklama: 'En az tıklama',
    enAzGun: 'Pencerede en az kaç gün veri',
    beklemeSuresi: 'Bekleme süresi (dk)',
    azamiAksiyon: 'Tek turda azami aksiyon',
    esikAciklamasi:
      'Örneklem eşikleri kuralın gürültüyle tetiklenmesini engelliyor: 3 tıklama almış bir reklamın EBM’si sonsuzdur ve eşik olmadan durdurulur. Bekleme süresi aynı varlığın açılıp kapanmasını engelliyor; Meta böyle bir reklamı öğrenme aşamasına geri atıyor.',
    ozetBaslik: 'Bu kural şunu yapacak',
    kaydedilemediBaslik: 'Kural kaydedilemedi.',
    kaydedilemedi: 'Kural kaydedilemedi.',
    provaNotu1: 'Yeni kurallar',
    provaNotu2: ' başlar: ne yapacaklarını gösterir ama hiçbir şeye dokunmazlar. Canlıya almak ayrı bir yetki gerektiriyor.',
    ozetDuraklat: 'duraklat',
    ozetBaslat: 'yeniden başlat',
    ozetBildir: 'yalnızca bildir',
    /** Düzenleyicinin düz cümle özeti. */
    ozetCumlesi: (seviye: string, kosul: string, eylem: string) =>
      `${seviye} bazında, ${kosul} olan varlıkları ${eylem}.`,
  },
  {
    sayfaBasligi: 'Rules',
    yeniKural: 'New rule',
    vazgec: 'Cancel',
    kaydet: 'Save',
    kapat: 'Close',
    sil: 'Delete',
    gecmis: 'History',
    duzenle: 'Edit',
    kural: 'Rule',
    tumHesaplar: 'All accounts',
    provaModu: 'dry-run mode',

    hesapOkunamadi: 'Could not read ad accounts.',
    hesapOkunamadiGovde: (mesaj: string) =>
      `${mesaj} You can’t pick an account for a new rule; it will apply to all accounts.`,
    kurallarAlinamadi: 'Could not load rules.',
    bosBaslik: 'No rules in this workspace',
    bosNeden1: (clientAdi: string) =>
      `Rules keep watching the ${clientAdi} account and pause, resume or change the budget of a campaign when your thresholds are crossed. New rules start in`,
    bosNeden2: ': they show what they would do but touch nothing.',
    bosYazabilir: 'Use “New rule” in the header to set up your first one.',
    bosYazamaz: 'You can’t create rules. Ask your admin for the rule.write permission.',
    henuzCalismadi: 'not run yet',
    sonAksiyon: (zaman: string) => `last action ${zaman}`,
    ve: ' AND ',
    veya: ' OR ',
    butceAzalt: (yuzde: number) => `decrease the budget by ${yuzde}%`,
    butceArtir: (yuzde: number) => `increase the budget by ${yuzde}%`,
    aciklamaCumlesi: (seviye: string, kosul: string, eylem: string) =>
      `At ${seviye} level, when ${kosul}: ${eylem}.`,

    gecmisAlinamadi: 'Could not load history.',
    hicCalismadiBaslik: 'This rule has not run yet',
    hicCalismadiNeden:
      'Rules are evaluated every hour; the first run will show up here when it finishes. To see it now, use “Run now”.',
    sonTurlar: 'Recent runs',
    prova: '(dry run)',
    hataOn: 'error:',
    varlikIncelendi: 'items checked',
    eslesti: 'matched',
    rozetHata: 'Error',
    aksiyonSayisi: (n: number) => `${n} ${n === 1 ? 'action' : 'actions'}`,
    aksiyonYok: 'No actions',
    turSiniri: (toplam: number) => `Showing the last 5 runs, ${toplam} in total.`,
    sonTurdakiKararlar: 'Decisions in the last run',
    kararlarAlinamadi: 'Could not load the last run’s decisions.',
    sonTurYok: 'No last run found.',
    kararYokBaslik: 'No item met the condition',
    kararYokNeden: 'The rule ran and found nothing to do.',
    kolonVarlik: 'Item',
    kolonSonuc: 'Result',
    kolonGerekce: 'Reason',

    tabloEtiketi: 'Automated rules',
    kolonMod: 'Mode',
    kolonHesap: 'Account',
    kolonSonCalisma: 'Last run',
    kolonEylemler: 'Actions',
    saatteBir: 'Evaluated every hour',
    modEtiketi: 'Rule mode',
    modTumu: 'All',
    modCanli: 'Live',
    modProva: 'Dry run',
    modKapali: 'Off',
    suzgecBosBaslik: 'No rules match this filter',
    suzgecBosNeden: (n: number) =>
      `None of the ${n} ${n === 1 ? 'rule is' : 'rules are'} in this mode. Go back to “All” to see everything.`,
    tumunuGoster: 'Show all',
    yeniKuralNotu: 'New rules start in dry-run mode and touch nothing.',
    panelEtiketi: 'Rule panel',
    gecmisYukleniyor: 'Loading history',

    islemBasarisiz: 'The action failed.',
    calistirSonucu: (eslesen: number, aksiyon: number, prova: boolean) =>
      `${eslesen} ${eslesen === 1 ? 'item' : 'items'} met the condition · ${aksiyon} ${
        aksiyon === 1 ? 'action' : 'actions'
      }${prova ? ' (dry run: nothing was touched)' : ' applied'}`,
    provayaAlindi: 'Rule switched to dry run.',
    canliyaAlindi: 'Rule is now live.',
    silindi: 'Rule deleted.',

    silBaslik: 'Delete this rule?',
    canliBaslik: 'Make this rule live?',
    canliyaAlOnay: 'I understand, make it live',
    silGovde: 'will be deleted and will never run again. This can’t be undone.',
    canliUyari: 'This rule will really run on the workspace’s account.',
    canliYon1: 'From now on, the hourly check will apply this action to matching items:',
    canliYon2: '. We suggest using “Run now” first to see what would happen in dry run.',
    eylemAdi: {
      pause: 'pause',
      resume: 'resume',
      adjust_budget: 'budget change',
      notify: 'notification',
    },
    islemYapilamadi: 'The action could not be completed.',

    simdiCalistir: 'Run now',
    eylemleriMenu: (ad: string) => `${ad} actions`,
    digerEylemler: (ad: string) => `${ad}: more actions`,
    canliyaAl: 'Make live',
    provayaAl: 'Switch to dry run',

    canliKuralBaslik: 'This rule is live.',
    canliKuralGovde:
      'If you change the condition or the action, the rule goes back to dry run and you need to make it live again.',
    kuralAdi: 'Rule name',
    kuralAdiOrnek: 'CPA guard',
    reklamHesabi: 'Ad account',
    hesapOkunamadiAlan: (mesaj: string) =>
      `Could not read ad accounts: ${mesaj} The rule will apply to all accounts.`,
    kayitliHesap: 'Saved account',
    seviye: 'Level',
    birlesim: 'How conditions combine',
    birlesimVe: 'All must match (AND)',
    birlesimVeya: 'Any one is enough (OR)',
    kosullar: 'Conditions',
    kosulMetrik: (n: number) => `Condition ${n} metric`,
    kosulKarsilastirma: (n: number) => `Condition ${n} comparison`,
    kosulDeger: (n: number) => `Condition ${n} value`,
    kosulPencere: (n: number) => `Condition ${n} time window`,
    kaldir: 'Remove',
    kosulEkle: '+ Add condition',
    butceSeviyeHatasi:
      'The budget spent condition only works at campaign level: the budget is set on the campaign or account, so a single ad has no budget spent.',
    aksiyon: 'Action',
    degisim: 'Change (%)',
    butceTavani: 'Budget cap (optional)',
    butceTavaniIpucu: 'If you set no cap on an increase rule, the budget keeps growing every run.',
    tavanYok: 'empty = no cap',
    bildirimNereye: 'Where should the notification go?',
    kanallarOkunuyor: 'Loading channels…',
    kanalOkunamadi: (mesaj: string, secim: number) =>
      `Could not load notification channels: ${mesaj} The rule’s saved channel selection (${secim}) is kept unchanged.`,
    sunucuyaUlasilamadi: 'Could not reach the server.',
    kanalYokBaslik: 'This workspace has no notification channel.',
    kanalYokGovde: 'The rule runs and writes matches to its history, but nobody is notified.',
    kanalEkle: 'Add channel',
    kanalKayip: (n: number) =>
      `${n} selected ${n === 1 ? 'channel no longer exists (deleted)' : 'channels no longer exist (deleted)'}; ${
        n === 1 ? 'it is' : 'they are'
      } removed from the rule when you save.`,
    kanalSecilmedi: 'No channel selected: matches are only written to the rule history.',
    guvenlikEsikleri: 'Safety thresholds',
    enAzGosterim: 'Minimum impressions',
    enAzTiklama: 'Minimum clicks',
    enAzGun: 'Minimum days with data in the window',
    beklemeSuresi: 'Cooldown (min)',
    azamiAksiyon: 'Max actions per run',
    esikAciklamasi:
      'Sample thresholds stop the rule from firing on noise: an ad with 3 clicks has an infinite CPA and would be paused without a threshold. The cooldown stops the same item from being switched on and off; Meta puts such an ad back into the learning phase.',
    ozetBaslik: 'This rule will do the following',
    kaydedilemediBaslik: 'Could not save the rule.',
    kaydedilemedi: 'Could not save the rule.',
    provaNotu1: 'New rules start in',
    provaNotu2: ': they show what they would do but touch nothing. Making a rule live needs a separate permission.',
    ozetDuraklat: 'pause',
    ozetBaslat: 'resume',
    ozetBildir: 'notify only',
    ozetCumlesi: (seviye: string, kosul: string, eylem: string) =>
      `At ${seviye} level, when ${kosul}: ${eylem}.`,
  },
);
