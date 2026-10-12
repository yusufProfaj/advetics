/**
 * ═══ TANITIM SİTESİNİN BÜTÜN METNİ, TEK YERDE ═══
 *
 * Neden tek dosya: menü, alt bilgi, ana sayfadaki kartlar, özellik sayfasının
 * başlığı ve site haritası AYNI listeden okuyor. Menüde "İyileştirme" yazıp
 * sayfada "Optimizasyon" başlığı açmak (CLAUDE.md, "AYNI EKRANIN MENÜDE VE
 * SAYFADA İKİ AYRI ADI") kullanıcıya yanlış sayfaya düştüğünü düşündürüyor;
 * ad bir kez yazıldığında ikisi ayrışamıyor. `site-icerik.spec.ts` kilitliyor.
 *
 * Metinler JSX içinde değil burada, çünkü Türkçe metin kesme işaretiyle dolu
 * ve JSX gövdesinde `react/no-unescaped-entities` hatası üretiyor.
 *
 * YAZIM KURALLARI (kullanıcı kararı, 2026-10-12):
 *  · Okuyan reklamcılık bilmiyor. Terim gerekiyorsa yanında tek cümlelik
 *    açıklama var.
 *  · Uzun tire yok, kısa cümle.
 *  · YALNIZCA ÜRÜNÜN BUGÜN YAPTIĞI ŞEY anlatılıyor. Yapılmayan iş `yakinda`
 *    alanında ve sayfada "Yakında" rozetiyle duruyor. Müşteri sayısı, logo,
 *    yorum, sertifika, fiyat rakamı YOK: hiçbiri elimizde değil ve uydurulmuş
 *    bir güven işareti, ilk görüşmede çürüyen bir söz.
 *  · Rapor PDF'inin kapağında ajansın değil Advetics'in logosu basılıyor
 *    (CLAUDE.md). O yüzden "kendi logonuzla PDF" YAZILMIYOR; doğru cümle
 *    "panel logonuz ve renginizle açılır, PDF markanızın rengini taşır".
 */

/** Demo talebi. Form yazmak sunucuya yeni bir uç demekti; mailto bugün çalışıyor. */
export const DEMO_EPOSTA = 'hello@profaj.com';
export const DEMO_MAILTO =
  `mailto:${DEMO_EPOSTA}?subject=${encodeURIComponent('Advetics demo talebi')}` +
  `&body=${encodeURIComponent(
    'Merhaba,\n\nAdvetics demosu istiyorum.\n\n' +
      'Şirket adı:\n' +
      'Reklam verdiğimiz yerler (Meta, Google, LinkedIn):\n' +
      'Ajans mıyız, işletme mi:\n',
  )}`;

export interface Madde {
  baslik: string;
  metin: string;
}

export interface Ozellik {
  /** Adres: `/ozellikler/<slug>`. */
  slug: string;
  /** Menüdeki ad ve sayfanın üst başlığı. İkisi AYNI dizeden okunuyor. */
  ad: string;
  /** Paneldeki ekranın adı. Ziyaretçi demoda aynı adı görsün. */
  panelAdi: string;
  /** Kartlarda ve menü açıklamasında görünen tek cümle. */
  kisa: string;
  baslik: string;
  ozet: string;
  faydalar: Madde[];
  adimlar: Madde[];
  /** Ürünün YAPMADIĞI şeyler, açıkça. Söylenmezse ziyaretçi varsayar. */
  sinirlar?: string[];
  yakinda?: Madde[];
}

export const OZELLIKLER: Ozellik[] = [
  {
    slug: 'tek-panel',
    ad: 'Tek Panel',
    panelAdi: 'Genel Bakış, Reklam Yöneticisi, Potansiyel Müşteriler',
    kisa: 'Meta, Google ve LinkedIn reklamlarınız aynı ekranda, aynı dille.',
    baslik: 'Bütün reklamlarınız tek ekranda',
    ozet:
      'Facebook, Instagram, Google ve LinkedIn için ayrı ayrı panel açmanız gerekmez. ' +
      'Advetics hesaplarınızı bağlar ve rakamları aynı dille yan yana koyar.',
    faydalar: [
      {
        baslik: 'Ne kadar harcadığınızı tek bakışta görün',
        metin:
          'Genel Bakış, seçtiğiniz dönemde ne kadar harcadığınızı, kaç kişiye ulaştığınızı ' +
          've kaç sonuç aldığınızı tek sayfada gösterir.',
      },
      {
        baslik: 'Büyükten küçüğe inin',
        metin:
          'Reklam Yöneticisi şirketten başlar: hesap, kampanya, reklam. Her adımda bir ' +
          'alta inip hangi reklamın parayı harcadığını bulursunuz.',
      },
      {
        baslik: 'Reklamın kendisini görün',
        metin:
          'Rakamın yanında reklamın görselini ya da metnini görürsünüz. Hangi sayının ' +
          'hangi reklama ait olduğunu tahmin etmezsiniz.',
      },
      {
        baslik: 'Form dolduranlar tek listede',
        metin:
          'Meta reklamlarındaki formu dolduran kişiler Potansiyel Müşteriler ekranında ' +
          'toplanır. Onları platform platform dolaşıp aramazsınız.',
      },
    ],
    adimlar: [
      {
        baslik: 'Hesabınızı bağlayın',
        metin:
          'Meta, Google ya da LinkedIn hesabınızla giriş yapıp izin verirsiniz. ' +
          'Parolanızı Advetics ile paylaşmazsınız.',
      },
      {
        baslik: 'Hesabı şirkete atayın',
        metin:
          'Hangi reklam hesabının hangi şirkete ait olduğunu bir kez seçersiniz. ' +
          'Son 90 günün verisi o anda gelmeye başlar.',
      },
      {
        baslik: 'İzleyin',
        metin: 'Veri bundan sonra düzenli aralıklarla platformlardan kendiliğinden çekilir.',
      },
    ],
    sinirlar: ['LinkedIn reklamları izlenir ve raporlanır. LinkedIn için reklam kurma henüz yok.'],
  },
  {
    slug: 'reklam-kurma',
    ad: 'Reklam Kurma',
    panelAdi: 'AdvCampaign',
    kisa: 'Ne satmak istediğinizi anlatın. Kurulumu Advetics yapar, siz onaylarsınız.',
    baslik: 'Reklamı siz anlatın, kurulumu Advetics yapsın',
    ozet:
      'AdvCampaign sizinle konuşarak reklamınızı hazırlar. Kime gösterileceği, nerede ' +
      'çıkacağı ya da teklif gibi teknik ayarları sormaz, en uygun olanı kendisi seçer. ' +
      'Yayına almadan önce her şeyi size gösterir.',
    faydalar: [
      {
        baslik: 'Teknik soru yok',
        metin:
          'Kampanya amacı, yerleşim, teklif stratejisi gibi kavramları bilmeniz gerekmez. ' +
          'Size sorulan şey işinizle ilgili: ne satıyorsunuz, kime, hangi bütçeyle.',
      },
      {
        baslik: 'Görseliniz her yere uyar',
        metin:
          'Instagram hikâyesi dikey, akış kare görsel ister. Elinizdeki görselin eksik ' +
          'boyutlarını tamamlar, her yere doğru boyut gider.',
      },
      {
        baslik: 'Önce önizleme, sonra yayın',
        metin:
          'Reklamın nasıl görüneceğini yayından önce görürsünüz. Siz onaylamadan hiçbir ' +
          'şey yayına çıkmaz.',
      },
      {
        baslik: "Facebook, Instagram ve Google'da",
        metin:
          'Google tarafında üç yol var: Arama (Google\'da arayana çıkan metin reklamı), ' +
          'Demand Gen (YouTube ve Gmail gibi yerlerde görselli reklam) ve Performance Max ' +
          "(Google'ın bütün alanlarında tek kampanya). Hangisinin uygun olduğunu AdvCampaign önerir.",
      },
    ],
    adimlar: [
      {
        baslik: 'Anlatın',
        metin: 'Ürününüzü, kime satmak istediğinizi ve bütçenizi kendi cümlelerinizle yazın.',
      },
      {
        baslik: 'Görselinizi ekleyin',
        metin:
          'Kullanılamayacak bir görsel bıraktıysanız bunu bıraktığınız anda söyler, ' +
          'yayın sırasında değil.',
      },
      {
        baslik: 'Önizleyin',
        metin: 'Kurulacak kampanyayı ve reklamların görünüşünü kontrol edin.',
      },
      {
        baslik: 'Onaylayın',
        metin:
          'Onayınızla platformda kurulur. Kurulumdan sonra platformdaki hâl yeniden ' +
          'okunur ve onayladığınız hâlle karşılaştırılır.',
      },
    ],
    sinirlar: [
      'LinkedIn için reklam kurma yok. LinkedIn reklamları izlenir ve raporlanır.',
      'Reklam hesabına ödeme yöntemi eklemek platformun kendi ekranında yapılır.',
    ],
  },
  {
    slug: 'planlama',
    ad: 'Planlama',
    panelAdi: 'AdvStrategy, Aylık Bütçe',
    kisa: 'Ay başında plan, ay boyunca bütçe takibi. Öneriler geçmiş verinizden.',
    baslik: 'Ay başlamadan planınız hazır olsun',
    ozet:
      'AdvStrategy aylık reklam planınızı hazırlar ve bütçenin hangi platforma ne kadar ' +
      'gideceğini geçmiş sonuçlarınıza bakarak önerir. Aylık Bütçe ekranı ise ay boyunca ' +
      'harcamanın planın gerisinde mi önünde mi olduğunu gösterir.',
    faydalar: [
      {
        baslik: 'Bütçe nereye gitsin, önerisi hazır',
        metin:
          'Geçmişte hangi platformun size daha ucuza sonuç getirdiğine bakar ve bütçeyi ' +
          'buna göre bölmeyi önerir. Son karar sizin.',
      },
      {
        baslik: 'İnsanlar sizi hangi kelimeyle arıyor',
        metin:
          "Google'da işinizle ilgili hangi kelimelerin arandığını ve yaklaşık kaç kez " +
          "arandığını gösterir. Sayılar Google'ın verdiği yaklaşık değerlerdir.",
      },
      {
        baslik: 'Müşteri planı panelde onaylar',
        metin:
          'Ajanssanız planı mail ile gönderip cevap beklemezsiniz. Müşteriniz planı kendi ' +
          'panelinde görür ve onaylar. İsterseniz plan PDF olarak da iner.',
      },
      {
        baslik: 'Harcama temposu',
        metin:
          'Aylık Bütçe, ayın bu gününde bütçenin ne kadarının harcanmış olması gerektiğini ' +
          've gerçekte ne kadarının harcandığını yan yana gösterir.',
      },
    ],
    adimlar: [
      { baslik: 'Ayı ve bütçeyi girin', metin: 'Hangi ay için ve toplam ne kadar harcamak istediğinizi yazın.' },
      {
        baslik: 'Öneriye bakın',
        metin: 'Plan, bütçe dağılımı ve anahtar kelime önerileriyle gelir. İstediğinizi değiştirin.',
      },
      {
        baslik: 'Onaylayın',
        metin: 'Plan onaylanınca reklam kurulumuna doğrudan geçilir.',
      },
      { baslik: 'Takip edin', metin: 'Ay boyunca Aylık Bütçe ekranından harcamanın gidişine bakın.' },
    ],
  },
  {
    slug: 'akilli-boost',
    ad: 'Akıllı Boost',
    panelAdi: 'Akıllı Boost',
    kisa: "Instagram ve YouTube'daki yeni paylaşımınızı öne çıkarmayı önerir, onayınızla yayınlar.",
    baslik: 'Yeni paylaşımınız daha çok kişiye ulaşsın',
    ozet:
      "Instagram'a ya da YouTube'a yeni bir şey paylaştığınızda Akıllı Boost bunu görür ve " +
      'öne çıkarma önerisi hazırlar. Öne çıkarmak, paylaşımı küçük bir bütçeyle takipçiniz ' +
      'olmayan kişilere de göstermek demek. Siz onaylarsanız paylaşım reklama dönüşür.',
    faydalar: [
      {
        baslik: 'Takip etmenize gerek yok',
        metin: 'Yeni paylaşımlar düzenli olarak kontrol edilir. Her yeni paylaşım için bir öneri kartı oluşur.',
      },
      {
        baslik: 'Onaysız harcama yok',
        metin: 'Kart sizin onayınızı bekler. Siz onaylamadan para harcanmaz.',
      },
      {
        baslik: 'Ayarı bir kez yaparsınız',
        metin: 'Bütçe ve süre gibi ayarları bir kez belirlersiniz. Her öneri bu ayarla gelir.',
      },
      {
        baslik: 'Aynı içeriğe iki kampanya kurulmaz',
        metin:
          "Instagram paylaşımınız Facebook sayfanıza da düşüyorsa ikinci bir kart açılmaz. " +
          'Aynı içerik için iki kez para harcanmaz.',
      },
    ],
    adimlar: [
      { baslik: 'Hesabınızı bağlayın', metin: 'Instagram ya da YouTube hesabınızı şirketinize bağlayın.' },
      { baslik: 'Ayarınızı seçin', metin: 'Öne çıkarmada kullanılacak bütçeyi ve süreyi belirleyin.' },
      { baslik: 'Paylaşın', metin: 'Her zamanki gibi paylaşın. Öneri kartı kendiliğinden oluşur.' },
      { baslik: 'Onaylayın', metin: 'Kartı onaylayın, paylaşım reklam olarak yayına çıksın.' },
    ],
    sinirlar: [
      'Facebook sayfa paylaşımları için öneri kartı oluşmaz. Onları panelden elle öne çıkarabilirsiniz.',
    ],
  },
  {
    slug: 'iyilestirme',
    ad: 'İyileştirme',
    panelAdi: 'İyileştir, Kurallar',
    kisa: 'Neyin kötü gittiğini söyler, düzeltmeyi onayınızla yapar. Kurallar siz yokken de çalışır.',
    baslik: 'Ne yapmanız gerektiğini söyler, onayınızla yapar',
    ozet:
      'İyileştir ekranı reklamlarınıza bakar ve neyin düzeltilmesi gerektiğini sade bir ' +
      'dille yazar. Öneriyi beğenirseniz "Uygula" dersiniz: reklamı durdurmak ya da ' +
      'bütçeyi değiştirmek tek tıkla yapılır.',
    faydalar: [
      {
        baslik: 'Öneri ve Uygula düğmesi',
        metin:
          'Her öneri neden yapıldığını söyler. Uygula düğmesi değişikliği doğrudan ' +
          'platformda yapar, sizin platforma girmeniz gerekmez.',
      },
      {
        baslik: 'Kendi kurallarınız',
        metin:
          '"Bir reklam üç gün boyunca sonuç getirmezse durdur" gibi kurallar yazarsınız. ' +
          'Kurallar her saat kontrol edilir.',
      },
      {
        baslik: 'Yorulan reklamı fark eder',
        metin:
          'Aynı kişiler aynı reklamı çok sık görünce ilgi düşer. Advetics bunu Meta ' +
          'reklamlarında fark eder ve reklamı yenileme zamanının geldiğini söyler.',
      },
      {
        baslik: 'Asistana sorun',
        metin:
          '"Bu hafta neden daha pahalı?" gibi bir soruyu panelin içindeki yapay zekâ ' +
          'asistanına sorabilirsiniz.',
      },
    ],
    adimlar: [
      { baslik: 'Öneriyi okuyun', metin: 'Her öneri ne yapılacağını ve nedenini tek cümleyle yazar.' },
      { baslik: 'Uygulayın', metin: 'Beğendiğiniz öneriyi tek tıkla uygulayın, beğenmediğinizi geçin.' },
      { baslik: 'Kural kurun', metin: 'Sürekli tekrar eden işleri kurala çevirin, her saat kendiliğinden çalışsın.' },
    ],
    yakinda: [
      {
        baslik: 'Ani değişiklik uyarıları',
        metin: 'Harcama ya da sonuçlar beklenmedik biçimde değişince Slack, Teams ya da e-posta ile haber verme.',
      },
      {
        baslik: 'Hesap sağlık kontrolleri',
        metin: 'Ölçüm ya da hesap ayarlarında bir sorun olduğunda kendiliğinden uyarma.',
      },
      {
        baslik: 'Haftalık özet maili',
        metin: 'Haftanın nasıl geçtiğini ve neye bakmanız gerektiğini anlatan kısa bir mail.',
      },
      {
        baslik: 'Uygulanan önerinin etkisi',
        metin: 'Uyguladığınız bir öneriden sonra sonuçların nasıl değiştiğini ölçme.',
      },
      {
        baslik: 'Kreatif analizi',
        metin: 'Hangi görsel ve metnin neden daha iyi çalıştığını gösterme.',
      },
    ],
  },
  {
    slug: 'raporlama',
    ad: 'Raporlama',
    panelAdi: 'Raporlar',
    kisa: 'Markanızın renginde PDF rapor, zamanlanmış mail ve paylaşım bağlantısı.',
    baslik: 'Ay sonu raporu kendiliğinden hazır',
    ozet:
      'Raporlar ekranı seçtiğiniz dönemin raporunu hazırlar. PDF olarak indirirsiniz, ' +
      'bağlantı olarak paylaşırsınız ya da her hafta veya her ay kendiliğinden mail ile gider.',
    faydalar: [
      {
        baslik: 'Hazır şablonlar',
        metin:
          'Hazır şablonlardan birini seçin ya da bölümlerin sırasını değiştirip kendi ' +
          'şablonunuzu kaydedin.',
      },
      {
        baslik: 'Zamanlanmış mail',
        metin: 'Haftalık ya da aylık plan kurun. Rapor seçtiğiniz kişilere PDF eki ile kendiliğinden gider.',
      },
      {
        baslik: 'Paylaşım bağlantısı',
        metin: 'Raporu bir bağlantıyla paylaşın. Açan kişinin giriş yapması gerekmez.',
      },
      {
        baslik: 'Fatura ekleri',
        metin: 'Platform faturalarını o döneme ekleyin. Rapor maili faturalarla birlikte gider.',
      },
      {
        baslik: 'Markanızın rengi',
        metin: 'PDF raporlar markanızın rengini taşır. Panel de sizin logonuz ve renginizle açılır.',
      },
      {
        baslik: 'Reklamın ne dediği de raporda',
        metin:
          'En iyi reklamlar rakamlarıyla birlikte görünür: görselli reklamın görseli, ' +
          'arama reklamının metni.',
      },
    ],
    adimlar: [
      { baslik: 'Dönemi seçin', metin: 'Geçen ay, bu ay ya da istediğiniz iki tarih arası.' },
      { baslik: 'Şablonu seçin', metin: 'Raporda hangi bölümlerin hangi sırayla olacağını seçin.' },
      { baslik: 'Gönderin', metin: 'İndirin, bağlantıyı paylaşın ya da zamanlanmış maile bağlayın.' },
    ],
  },
  {
    slug: 'olcum-kurulumu',
    ad: 'Ölçüm Kurulumu',
    panelAdi: 'Marka Merkezi',
    kisa: 'Reklamdan gelen satışı ve formu doğru saymak için gereken kurulumu adım adım gösterir.',
    baslik: 'Reklamın getirdiği sonucu doğru sayın',
    ozet:
      'Bir reklamın işe yarayıp yaramadığını bilmek için sitenizde neyin "sonuç" sayılacağının ' +
      "kurulu olması gerekir. Marka Merkezi'ndeki kurulum rehberi neyin eksik olduğunu " +
      'gösterir ve tamamlamanıza yardım eder.',
    faydalar: [
      {
        baslik: 'Neyin eksik olduğunu görün',
        metin:
          'Meta Pixel, Google Ads dönüşümü, Google Tag Manager ve Google Analytics 4 için ' +
          'hangisinin kurulu, hangisinin eksik olduğu tek listede durur. Dördü de sitenize ' +
          'gelen kişinin reklamdan sonra ne yaptığını sayan araçlardır.',
      },
      {
        baslik: 'Her proje ayrı',
        metin:
          'Bir şirketin birden çok projesi varsa her projenin ölçümü ayrı tutulur. ' +
          'Rakamlar birbirine karışmaz.',
      },
      {
        baslik: 'Bir satış iki kez sayılmaz',
        metin:
          'Aynı türde zaten sayılan bir sonuç varsa yenisini açmaz. Çift sayım, reklamı ' +
          'olduğundan iyi gösterir.',
      },
      {
        baslik: 'Marka bilgileri tek yerde',
        metin:
          "Logo, iletişim bilgileri, kitleler ve görseller Marka Merkezi'nde durur. Reklam " +
          'kurarken buradan gelir, tekrar tekrar girmezsiniz.',
      },
    ],
    adimlar: [
      { baslik: 'Rehberi açın', metin: "Marka Merkezi'nin ilk bölümü kurulum rehberidir." },
      { baslik: 'Eksiklere bakın', metin: 'Hesaplar ve ölçüm araçları için neyin tamam, neyin eksik olduğunu görün.' },
      { baslik: 'Tamamlayın', metin: 'Rehberin gösterdiği adımlarla eksikleri kapatın, sonra doğrulayın.' },
    ],
    sinirlar: [
      'Reklam hesabı açmak ve ödeme yöntemi eklemek platformun kendi ekranında yapılır.',
      "Tag Manager'da başkasının hazırlayıp yayınlamadığı bir değişiklik varsa onu sizin yerinize yayına almaz.",
    ],
  },
  {
    slug: 'yapay-zeka-asistani',
    ad: 'Yapay Zekâ Asistanı',
    panelAdi: 'Asistan ve MCP bağlantısı',
    kisa: 'Reklamlarınız hakkında soru sorun, öneri alın. Claude gibi asistanları verinize bağlayın.',
    baslik: 'Reklamlarınıza soru sorun, cevap kendi verinizden gelsin',
    ozet:
      'Panelin içindeki asistana "bu ay en çok hangi reklam sonuç getirdi?" diye ' +
      'sorabilirsiniz. İsterseniz Claude gibi yapay zekâ asistanlarını da Advetics ' +
      'verinize bağlarsınız. Bu bağlantı yalnızca okur, değişiklik yapamaz.',
    faydalar: [
      {
        baslik: 'Sade soru, sade cevap',
        metin: 'Rapor okumayı bilmeniz gerekmez. Merak ettiğinizi kendi cümlenizle sorun.',
      },
      {
        baslik: 'Öneri alın',
        metin: 'Asistan neyin iyileştirilebileceğini önerir. Uygulamak yine sizin onayınızla olur.',
      },
      {
        baslik: 'Kendi asistanınızı bağlayın',
        metin:
          'Advetics, yapay zekâ asistanlarının veriye bağlanmak için kullandığı açık bir ' +
          'standardı (MCP) destekler. Claude gibi bir asistan raporlarınızı okuyabilir.',
      },
      {
        baslik: 'Bağlantı yalnızca okur',
        metin:
          'Bu bağlantı reklam açamaz, durduramaz, bütçe değiştiremez. Yalnızca okur.',
      },
    ],
    adimlar: [
      { baslik: 'Sorun', metin: 'Panelde asistanı açıp sorunuzu yazın.' },
      { baslik: 'Okuyun', metin: 'Cevap Advetics\'teki kendi verinizden gelir.' },
      { baslik: 'Karar verin', metin: 'Öneriyi uygulamak isterseniz onay yine sizde.' },
    ],
    sinirlar: [
      "Cevaplar Advetics'e gelmiş veriye dayanır. Platformda az önce yaptığınız bir değişiklik bir sonraki güncellemeye kadar cevaba yansımayabilir.",
    ],
  },
];

export interface Cozum {
  /** Adres: `/cozumler/<slug>`. */
  slug: string;
  ad: string;
  kisa: string;
  baslik: string;
  ozet: string;
  maddeler: Madde[];
  /** Bu kitle için öne çıkan özellik sayfaları (OZELLIKLER içindeki slug). */
  ozellikler: string[];
  senaryo: { baslik: string; adimlar: string[] };
}

export const COZUMLER: Cozum[] = [
  {
    slug: 'ajanslar',
    ad: 'Ajanslar',
    kisa: 'Bütün müşterileriniz tek panelde. Her müşteri yalnızca kendi alanını görür.',
    baslik: 'Bütün müşterileriniz tek panelde, her biri kendi alanında',
    ozet:
      'Advetics ajansınızın markasıyla açılan bir reklam paneli. Müşterilerinizin ' +
      'hesaplarını tek yerden yönetirsiniz, her müşteri yalnızca kendi panelini görür.',
    maddeler: [
      {
        baslik: 'Her müşteri ayrı',
        metin:
          'Bir müşterinin verisi diğerine görünmez. Bu ayrım ekranda değil, veritabanının ' +
          'kendisinde uygulanır.',
      },
      {
        baslik: 'Müşteri kendi panelini görür',
        metin:
          'Müşteriniz Genel Bakış, Reklam Yöneticisi, AdvStrategy ve Raporlar ekranlarını ' +
          'görür. Planı panelde onaylar, reklamlarda değişiklik yapamaz.',
      },
      {
        baslik: 'Bir kez bağlayın, hesapları dağıtın',
        metin:
          'Ajansınızın Meta ve Google bağlantısı bir kez kurulur. Hesapları müşterilere ' +
          'atarsınız, atadığınız anda veri gelmeye başlar.',
      },
      {
        baslik: 'Müşteri kendi hesabını da bağlayabilir',
        metin:
          'Reklam hesabını kendisi yönetmek isteyen müşteri kendi bağlantısını kurar. O ' +
          'hesaplar yalnızca onun şirketinde kalır.',
      },
      {
        baslik: 'Sizin markanız',
        metin: 'Panel logonuz ve renginizle açılır. PDF raporlar markanızın rengini taşır.',
      },
      {
        baslik: 'Ekip ve yetkiler',
        metin: 'Ekibinize rol verirsiniz. Kimin neyi ne zaman değiştirdiği kayıtlı kalır.',
      },
    ],
    ozellikler: ['tek-panel', 'planlama', 'raporlama', 'iyilestirme'],
    senaryo: {
      baslik: 'Örnek: on iki müşterisi olan bir ajansın ayı',
      adimlar: [
        "Ay başında her müşteri için AdvStrategy'de plan hazırlanır. Müşteri planı kendi panelinde onaylar.",
        'Onaylanan planın kampanyaları AdvCampaign ile kurulur.',
        'Ay boyunca İyileştir önerileri ve kurallar hesapları izler. Ekip yalnızca önerileri onaylar.',
        'Ay sonunda raporlar faturalarla birlikte müşterilere kendiliğinden mail ile gider.',
      ],
    },
  },
  {
    slug: 'isletmeler',
    ad: 'İşletmeler',
    kisa: 'Reklamdan anlamasanız da reklam verin. Teknik ayar yok, onay sizde.',
    baslik: 'Reklamdan anlamasanız da reklam verin',
    ozet:
      'Reklamınızı kendiniz görmek ve yönetmek istiyorsanız Advetics size teknik terimler ' +
      'yerine sade sorular sorar ve her önerisini sizin onayınıza sunar.',
    maddeler: [
      {
        baslik: 'Teknik ayar yok',
        metin:
          'Hedefleme, yerleşim, teklif gibi ayarları Advetics seçer. Size yalnızca işinizle ' +
          'ilgili sorular sorulur.',
      },
      {
        baslik: 'Ne kadar harcadığınızı bilin',
        metin:
          'Bu ay ne kadar harcandığını ve karşılığında kaç form, mesaj ya da satış geldiğini ' +
          'tek ekranda görürsünüz.',
      },
      {
        baslik: 'Size ne yapılacağını söyler',
        metin:
          'Sonuç getirmeyen reklamı durdurmayı, iyi gideni büyütmeyi önerir. Siz "Uygula" ' +
          'derseniz yapar.',
      },
      {
        baslik: 'Hesaplarınız sizde kalır',
        metin:
          'Reklam hesaplarınız sizin. Advetics onlara sizin izninizle bağlanır ve bağlantıyı ' +
          'istediğiniz zaman kaldırabilirsiniz.',
      },
    ],
    ozellikler: ['reklam-kurma', 'akilli-boost', 'iyilestirme', 'olcum-kurulumu'],
    senaryo: {
      baslik: 'Örnek: bir kafe sahibinin haftası',
      adimlar: [
        'Instagram hesabını Advetics\'e bağlar.',
        'Yeni menüsünü paylaşır. Akıllı Boost paylaşımı öne çıkarmayı önerir, o da onaylar.',
        'Hafta sonu kahvaltısını AdvCampaign\'e anlatır: "Kafeme yakın oturanlara hafta sonu kahvaltısını göster."',
        'Birkaç gün sonra İyileştir, sonuç getirmeyen bir reklamı durdurmayı önerir. Tek tıkla uygular.',
      ],
    },
  },
];

export interface Entegrasyon {
  ad: string;
  alt?: string;
  ne: string;
}

export const ENTEGRASYON_GRUPLARI: { baslik: string; aciklama: string; ogeler: Entegrasyon[] }[] = [
  {
    baslik: 'Reklam platformları',
    aciklama: 'Reklam hesaplarınız bu platformlarda. Advetics onlara sizin izninizle bağlanır.',
    ogeler: [
      {
        ad: 'Meta',
        alt: 'Facebook ve Instagram',
        ne: 'İzleme, raporlama, reklam kurma, paylaşım öne çıkarma ve form kayıtları.',
      },
      {
        ad: 'Google Ads',
        alt: 'Arama, YouTube, Gmail ve daha fazlası',
        ne: 'İzleme, raporlama, reklam kurma ve anahtar kelime araştırması.',
      },
      { ad: 'LinkedIn Ads', ne: 'İzleme ve raporlama.' },
      { ad: 'YouTube', ne: 'Yeni videolarınız için öne çıkarma önerisi (Akıllı Boost).' },
    ],
  },
  {
    baslik: 'Ölçüm',
    aciklama: 'Reklamdan sonra sitenizde ne olduğunu sayan araçlar. Kurulum rehberi bunları kontrol eder.',
    ogeler: [
      { ad: 'Meta Pixel', ne: "Sitenize gelenlerin ne yaptığını Meta'ya bildirir." },
      { ad: 'Google Ads dönüşümleri', ne: "Satış ya da form gibi sonuçları Google Ads'e bildirir." },
      { ad: 'Google Tag Manager', ne: 'Sitenizdeki ölçüm kodlarını tek yerden yönetir.' },
      { ad: 'Google Analytics 4', ne: 'Sitenizin ziyaretçi istatistikleri.' },
    ],
  },
  {
    baslik: 'Yapay zekâ',
    aciklama: 'Verinizi okuyabilen asistanlar. Bağlantı salt okunurdur.',
    ogeler: [{ ad: 'MCP', alt: 'Claude ve benzeri asistanlar', ne: 'Reklam verinizi yalnızca okuma izniyle paylaşır.' }],
  },
];

/** Bugün OLMAYAN bağlantılar. Sayfada "Yakında" başlığı altında, ayrı durur. */
export const YAKINDA_ENTEGRASYONLAR: string[] = [
  'Google Search Console',
  'Google Analytics 4 raporları',
  'Google Merchant Center',
  'Meta Katalog',
  'Shopify',
  'ikas',
  'Ticimax',
  'Slack bildirimleri',
  'Microsoft Teams bildirimleri',
];

/** Ana sayfadaki "nasıl çalışır" senaryoları. Açıkça ÖRNEK; gerçek müşteri değil. */
export const SENARYOLAR: { kim: string; dert: string; cozum: string; ozellik: string }[] = [
  {
    kim: 'Bir kafe sahibi',
    dert: 'Instagram\'da paylaşıyor ama takipçisi dışında kimse görmüyor.',
    cozum: 'Akıllı Boost her yeni paylaşım için öneri hazırlıyor. O yalnızca onaylıyor.',
    ozellik: 'akilli-boost',
  },
  {
    kim: 'Bir emlak ofisi',
    dert: "Google'da \"satılık daire\" arayanlara görünmek istiyor ama reklam panelinden korkuyor.",
    cozum:
      'Ne sattığını AdvCampaign\'e anlatıyor, arama reklamı kuruluyor. Form dolduranlar Potansiyel Müşteriler listesine düşüyor.',
    ozellik: 'reklam-kurma',
  },
  {
    kim: 'Bir reklam ajansı',
    dert: 'Her ay sonu on ayrı panelden rakam toplayıp rapor hazırlıyor.',
    cozum: 'Raporlar kendiliğinden mail ile gidiyor. Ekip zamanını rapora değil iyileştirmeye ayırıyor.',
    ozellik: 'raporlama',
  },
];

export interface GuvenlikMaddesi extends Madde {
  /** Teknik okuyucu için tek satır. Ziyaretçinin çoğu okumayacak; yine de doğru olmalı. */
  teknik: string;
}

export const GUVENLIK: GuvenlikMaddesi[] = [
  {
    baslik: 'Her şirketin verisi ayrı',
    metin:
      'Bir şirketin reklam verisi başka bir şirkete görünmez. Bu kural yalnızca ekranda ' +
      'değil, verinin durduğu veritabanının kendisinde uygulanır. Ekranda bir hata olsa ' +
      'bile veritabanı başka şirketin satırını vermez.',
    teknik: 'PostgreSQL satır düzeyi güvenlik (RLS).',
  },
  {
    baslik: 'Parolanızı istemiyoruz',
    metin:
      'Meta, Google ve LinkedIn hesaplarınız platformların kendi izin ekranıyla bağlanır. ' +
      'Parolanız Advetics\'e hiç gelmez. İzni platformun ayarlarından da geri alabilirsiniz.',
    teknik: 'OAuth ile yetkilendirme.',
  },
  {
    baslik: 'Bağlantı anahtarları şifreli',
    metin:
      'Platformların verdiği erişim anahtarları veritabanına şifrelenerek yazılır. Düz ' +
      'metin olarak saklanmaz.',
    teknik: 'Erişim belirteçleri şifreli kolonlarda.',
  },
  {
    baslik: 'Yapay zekâ bağlantısı yalnızca okur',
    metin:
      'Claude gibi bir asistanı verinize bağladığınızda asistan reklam açamaz, durduramaz, ' +
      'bütçe değiştiremez.',
    teknik: 'MCP bağlantısı salt okunur.',
  },
  {
    baslik: 'Herkes yalnızca işine yarayanı görür',
    metin:
      'Ekibinize ve müşterilerinize rol verirsiniz. Müşteri hesabı reklamları görür ama ' +
      'değiştiremez.',
    teknik: 'Rol tabanlı yetki.',
  },
  {
    baslik: 'Kim neyi değiştirdi, kayıtlı',
    metin: 'Panelden yapılan değişiklikler kimin, ne zaman yaptığıyla birlikte kaydedilir.',
    teknik: 'Denetim kaydı.',
  },
];

export const FIYAT_SORULARI: Madde[] = [
  {
    baslik: 'Fiyat neye göre değişiyor?',
    metin:
      'Kaç şirketi ve reklam hesabını yöneteceğinize, ajans mı işletme mi olduğunuza ve ne ' +
      'kadar destek istediğinize göre. Kısa bir görüşmede ihtiyacınızı anlayıp teklif veriyoruz.',
  },
  {
    baslik: 'Reklam bütçem Advetics üzerinden mi ödeniyor?',
    metin:
      'Hayır. Reklam harcamanızı Meta, Google ve LinkedIn\'e kendi hesabınızdan ödersiniz. ' +
      'Advetics bu ödemeye aracılık etmez.',
  },
  {
    baslik: 'Hesaplarım bana mı ait kalıyor?',
    metin:
      'Evet. Reklam hesaplarınız sizin. Bağlantıyı kaldırdığınızda Advetics hesaplarınıza ' +
      'erişemez.',
  },
  {
    baslik: 'Önce görebilir miyim?',
    metin:
      'Evet. Demo görüşmesinde mevcut hesaplarınızı bağlayıp kendi rakamlarınızla gösteriyoruz.',
  },
];

/** Adres yardımcıları: bağlantılar elle birleştirilmesin (CLAUDE.md, "BAĞLANTIYI ELLE BİRLEŞTİRME"). */
export const ozellikAdresi = (slug: string) => `/ozellikler/${slug}`;
export const cozumAdresi = (slug: string) => `/cozumler/${slug}`;

export function ozellikBul(slug: string): Ozellik | undefined {
  return OZELLIKLER.find((o) => o.slug === slug);
}

export function cozumBul(slug: string): Cozum | undefined {
  return COZUMLER.find((c) => c.slug === slug);
}

/**
 * Tanıtım sitesinin bütün sayfaları. Site haritası, middleware'in herkese
 * açık listesi ve testler bunu okuyor: yeni sayfa eklenip buraya yazılmazsa
 * `site-icerik.spec.ts` düşüyor.
 */
export const SITE_SAYFALARI: { yol: string; oncelik: number }[] = [
  { yol: '/', oncelik: 1 },
  { yol: '/ozellikler', oncelik: 0.9 },
  ...OZELLIKLER.map((o) => ({ yol: ozellikAdresi(o.slug), oncelik: 0.8 })),
  ...COZUMLER.map((c) => ({ yol: cozumAdresi(c.slug), oncelik: 0.8 })),
  { yol: '/entegrasyonlar', oncelik: 0.7 },
  { yol: '/fiyatlandirma', oncelik: 0.7 },
  { yol: '/guvenlik', oncelik: 0.6 },
  { yol: '/demo', oncelik: 0.7 },
];

/** Üst menünün tek seviyeli bağlantıları. Etiketler sayfa başlıklarıyla AYNI. */
export const UST_MENU: { href: string; etiket: string }[] = [
  { href: '/entegrasyonlar', etiket: 'Entegrasyonlar' },
  { href: '/fiyatlandirma', etiket: 'Fiyatlandırma' },
  { href: '/guvenlik', etiket: 'Güvenlik' },
];
