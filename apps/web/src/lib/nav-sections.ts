import type { Permission } from '@advetics/shared';
import type { NavEntry } from '@/components/nav';
import { VARLIK_YOLLARI } from '@/components/marka-merkezi/varliklar';

/**
 * Kenar çubuğu — KATLANABİLİR bölümler.
 *
 * Bu yapı iki kez değişti ve ikisinin de sebebi ölçüldü:
 *
 *   1. Önce yedi bölüm ve 23 öğe vardı; 7'sinin EKRANI YOKTU (soluk,
 *      tıklanamaz) ve "Bilgi Bankası" iki kez geçiyordu. Ölü satırlar
 *      çıkarıldı ve iki düz gruba indirildi.
 *   2. İki düz grup fazla uzundu: 12 satır tek blokta, hiçbir gruplama
 *      olmadan. Bölümler geri geldi ama artık KATLANABİLİR — kullanıcı
 *      kullanmadığı bölümü kapatıyor ve kapalı kalıyor.
 *
 * İLK BÖLÜM BAŞLIKSIZ ve bu kasıtlı: en sık açılan iki ekran katlanamaz
 * olmalı. Bir başlık altına koymak, onları kapatılabilir yapardı.
 *
 * AYARLAR bölümü yalnızca yönetim yetkisi olanlara görünüyor; süzgeç
 * `visibleSections` içinde ve bölüm boşalırsa başlığı da basılmıyor.
 */
/** Kenar çubuğunda tek satıra inen bölümün adı. */
export const AYARLAR_BOLUMU = 'Ayarlar';

/**
 * Ayarlar sekmelerindeki KISA ad. Menü etiketi sayfa başlığıyla aynı kalıyor
 * (`nav-sections.spec.ts`); sekme çubuğunda "Platform Bağlantıları ·
 * Senkronizasyon Durumu · E-posta Ayarları" yan yana sığmıyor ve "Ayarlar"
 * sekmesinin içinde "Ayarları" demek tekrar.
 */
export const AYAR_KISA_AD: Record<string, string> = {
  '/ayarlar/baglantilar': 'Bağlantılar',
  '/ayarlar/senkronizasyon': 'Senkronizasyon',
  '/ayarlar/e-posta': 'E-posta',
  '/ayarlar/ekip': 'Ekip',
};

export const SECTIONS: Array<{ title?: string; items: NavEntry[] }> = [
  {
    // BAŞLIKSIZ — katlanamaz. Günlük iş burada başlıyor.
    items: [
      { href: '/dashboard', label: 'Genel Bakış', icon: 'overview', module: 1, perm: 'insights.read' },
    ],
  },
  {
    title: 'Reklamlar',
    items: [
      /*
       * ═══ MÜŞTERİ HESABI YALNIZCA ÜÇ EKRAN GÖRÜYOR ═══
       *
       * Kullanıcının tanımı: "müşteri = sadece genel bakış, reklam keşfi ve
       * raporlar; reklam kısmını göremez". Bu yüzden Reklamlar ve Base
       * bölümlerinin HER satırı bir yetki taşıyor — yetkisiz satır herkese
       * görünüyor (süzme opt-in) ve müşteri hesabı Kurallar'ı, Aylık
       * Bütçe'yi, Akıllı Boost'u menüde görürdü. `nav-sections.spec.ts`
       * müşteri hesabının gördüğü etiketleri TAM LİSTE olarak kilitliyor.
       */
      /*
       * AKILLI BOOST REKLAMLARIN İLK SATIRI VE ÖNE ÇIKARILMIŞ (2026-09-30).
       * Başlıksız bölümde Genel Bakış'ın yanındaydı; kullanıcının isteği
       * reklamların altına alınması ve alt satırlar arasında DAHA BELİRGİN
       * olması. İşi de bir reklam işi: gönderi reklama çevriliyor.
       * `vurgu` yalnızca görünüş; yetki (`boost.read`) aynen duruyor.
       */
      {
        href: '/auto-boost',
        label: 'Akıllı Boost',
        icon: 'boost',
        module: 7,
        ready: true,
        perm: 'boost.read',
        vurgu: 'Otomatik',
      },
      { href: '/ads-explorer', label: 'Reklam Keşfi', icon: 'explorer', module: 4, perm: 'insights.read' },
      /*
       * ADVCAMPAIGN — reklam kurmanın TEK yolu (kullanıcı kararı
       * 2026-10-07). Eski Reklam Oluştur, AI Asistan ve Toplu Oluştur
       * kaldırıldı; eski adresler buraya yönlendiriyor. `bulk.write`:
       * sayfanın kendi kapısıyla aynı anahtar, ayrışırsa menüde görünüp
       * açılmayan bir satır olur.
       */
      {
        href: '/reklam',
        label: 'AdvCampaign',
        icon: 'create',
        module: 4,
        ready: true,
        perm: 'bulk.write',
      },
      { href: '/kurallar', label: 'Kurallar', icon: 'rules', module: 5, ready: true, perm: 'rule.read' },
      /*
       * `budget.write`, `budget.read` DEĞİL. Müşteri hesabı `budget.read`
       * taşıyor — Genel Bakış'taki bütçe tüketimi o yetkiyle okunuyor ve o
       * bilgi kendisine ait. Ama bu ekran bütçe BELİRLEME yeri; okuma
       * yetkisiyle açmak müşteriyi kaydedemeyeceği bir forma götürürdü.
       */
      // AYLIK BÜTÇE BASE'E TAŞINDI (2026-10-06): Marka Merkezi › Aylık Bütçe.
    ],
  },
  {
    title: 'Raporlar',
    items: [
      /*
       * ═══ RAPORLARIN TEK GİRİŞİ ═══
       *
       * Burada üç bağlantı vardı: Raporlar, Rapor Şablonları, Faturalar.
       * Üçü de AYNI belgenin parçasıydı ve ayrı sayfalara bölünmeleri gerçek
       * bir hata üretiyordu: kullanıcı şablonunu ayrı sayfada düzenleyip
       * rapora dönüyor, seçiciden bir ön ayar seçiyor ve düzenlemesi
       * kayboluyordu (seçici yalnızca ön ayarları tanıyordu, kayıtlı
       * şablonları değil). Fatura da rapor mailinin EKİ — tek tüketicisi
       * rapor ekranı.
       *
       * Üçü artık `/raporlar` içinde: şablon seçicide hem ön ayarlar hem
       * kayıtlı şablonlar, faturalar da sekme olarak. Yetki süzgeci
       * kaybolmadı, sayfanın İÇİNE taşındı — `report.write` şablon
       * düzenlemeyi, `report.share` fatura sekmesini açıyor.
       */
      { href: '/raporlar', label: 'Raporlar', icon: 'reports', module: 6, perm: 'report.read' },
      {
        href: '/potansiyel-musteriler',
        label: 'Potansiyel Müşteriler',
        icon: 'leads',
        module: 4,
        ready: true,
        perm: 'lead.read',
      },
    ],
  },
  {
    /*
     * "KÜTÜPHANE" DEĞİL "BASE" (kullanıcı kararı, 2026-10-06). Tek kapı
     * Marka Merkezi: Bilgi Bankası ayrı satırdı ve aynı workspace profilinin
     * yarısını gösteriyordu; içeriği Marka Merkezi › Marka'ya taşındı ve
     * eski adres oraya yönleniyor (`bolumler.ts`).
     */
    title: 'Base',
    items: [
      /*
       * MARKA MERKEZİ KÜTÜPHANENİN BAŞINDA. Workspace'in kurulum durumu,
       * bağlantıları ve (sonraki bölümlerde) marka, varlık, kitle ve koruma
       * kuralları burada toplanıyor; aşağıdaki satırlar oraya taşındıkça
       * kalkacak (`docs/BASE-PLANI.md`).
       *
       * İZİN `client.write`, `client.read` DEĞİL: müşteri hesabı
       * `client.read` taşıyor ve menüsü kullanıcının kararıyla üç ekranla
       * sınırlı ("müşteri = sadece genel bakış, reklam keşfi ve raporlar").
       */
      {
        href: '/marka-merkezi',
        label: 'Marka Merkezi',
        icon: 'brand',
        module: 1,
        ready: true,
        perm: 'client.write',
        // Varlık ekranları menüden kalkıp buraya indi (Bölüm 3); oradayken
        // bu satır seçili görünsün.
        ekYollar: [...VARLIK_YOLLARI, '/kutuphane/bilgi-bankasi', '/butce'],
      },
      /*
       * GÖRSEL ARŞİVİ, KREATİFLER VE FORMLAR BURADA DEĞİL — Marka Merkezi'nin
       * "Varlıklar" bölümünde (BASE-PLANI Bölüm 3). Sayfalar ve adresleri
       * aynen duruyor; yalnızca menü satırları kalktı.
       *
       * YETKİ KAYBI YOK: üç ekran `bulk.read` istiyor ve bu yetkiyi taşıyan
       * her rol (`admin`, `ad_manager`) Marka Merkezi'nin `client.write`ını
       * da taşıyor. Override ile yalnızca `bulk.read` bırakılmış biri için
       * bağlantılar erişilebilir kalıyor ama menüden değil — kabul edilmiş
       * bir kenar durumu (`nav-sections.spec.ts` rol matrisini kilitliyor).
       */
    ],
  },
  {
    /*
     * AJANS İŞİ. `client.read` KULLANILMIYOR: client_viewer'da var (kendi
     * müşterisini okuyabilmeli), ayırt eden şey yönetim yetkisi.
     *
     * KENAR ÇUBUĞUNDA TEK SATIR, SAYFADA SEKME (2026-09-30). Bu bölüm
     * yedi satırdı ve menünün yarısını kaplıyordu; kullanıcının isteği
     * *"sidebar'ı sadeleştirebildiğin kadar sadeleştir"*. Liste YETKİNİN
     * TEK KAYNAĞI olarak burada duruyor (rol matrisi testleri bunu
     * kilitliyor); kenar çubuğu bölümü tek bir "Ayarlar" satırına
     * indiriyor (`kenarBolumleri`), `ayarlar/layout.tsx` aynı süzülmüş
     * listeyi sekme olarak çiziyor. İki ayrı liste yazmak, bir sayfanın
     * menüde görünüp sekmede görünmemesi demekti.
     *
     * "Kurulum Sihirbazı" bu bölümden KALKTI: oluşturma düğmeleri zaten
     * Şirketler ve Üst Hesaplar sayfasında ve sihirbaz oradan açılıyor.
     */
    title: AYARLAR_BOLUMU,
    items: [
      {
        /*
         * WORKSPACE'LER AYRI BİR SATIR DEĞİL — ŞİRKETLER'İN İÇİNDE.
         *
         * "Şirketler" ve "Workspace'ler" yan yana iki satırdı ve menünün
         * kendisi hiyerarşiyi yanlış anlatıyordu: workspace şirketin
         * İÇİNDE, kardeşi değil. Yan yana dururken kullanıcı workspace
         * listesine bakarken hangi şirkette olduğunu ekrandan okuyamıyordu.
         * `/ayarlar/musteriler` yönlendiriyor (yer imleri ve panel içi
         * bağlantılar için); alt yolları yerinde duruyor.
         *
         * `org.write` ile kapalı — bu ekran bir kullanıcının ERİŞEBİLDİĞİ
         * ŞİRKET KÜMESİNİ değiştiriyor, yani izolasyonun sınırını.
         * `client.write` (workspace açma) yetmez: `ad_manager` onu taşıyor
         * ama şirket açamamalı. Workspace bölümü bu sayfanın İÇİNDE ve
         * kendi yetkisini ayrıca kontrol ediyor.
         */
        href: '/ayarlar/ust-hesap',
        // Workspace ekip/kanal alt sayfaları Şirketler sekmesinin altında.
        ekYollar: ['/ayarlar/musteriler'],
        label: 'Şirketler',
        icon: 'clients',
        module: 1,
        ready: true,
        perm: 'org.write',
      },
      {
        /*
         * ÜST HESAPLAR — ŞİRKETLER'DEN AYRI SATIR.
         *
         * İkisi farklı kapsam: "Şirketler" bir üst hesabın ALTINI yönetiyor,
         * bu satır hesapların KENDİSİNİ (ad, paket, ekip büyüklüğü, silme,
         * yeni hesap). Aynı sayfada toplamak, aktif olmayan bir hesabı
         * düzenlemek için önce ona geçmeyi zorunlu kılıyordu.
         *
         * `org.write` — Şirketler ile aynı anahtar ve aynı gerekçe: bu ekran
         * bir kullanıcının ERİŞEBİLDİĞİ ŞİRKET KÜMESİNİ değiştiriyor.
         * Platform sahibi burada bütün hesapları görüyor; ayrım sunucuda.
         */
        href: '/ayarlar/ust-hesaplar',
        label: 'Üst Hesaplar',
        icon: 'clients',
        module: 1,
        ready: true,
        perm: 'org.write',
        ustHesapUyeligi: true,
      },
      {
        href: '/ayarlar/baglantilar',
        label: 'Platform Bağlantıları',
        icon: 'plug',
        module: 2,
        ready: true,
        perm: 'connection.read',
      },
      {
        /*
         * TEŞHİS EKRANI AYARLAR ALTINDA ve `connection.read` ile kapalı.
         * `insights.read` ile açmak client_viewer'a da gösterirdi: bu ekran
         * platformun ham hata mesajlarını (subcode, fbtrace) basıyor ve o
         * müşteri tarafına ait bir bilgi değil.
         */
        href: '/ayarlar/senkronizasyon',
        label: 'Senkronizasyon Durumu',
        icon: 'sync',
        module: 3,
        ready: true,
        perm: 'connection.read',
      },
      {
        /*
         * `report.share` İLE KAPALI — yönetim izniyle DEĞİL.
         *
         * Bu ekran "başkasının ayarı" kavramı taşımıyor: herkes yalnızca
         * kendi satırını görüyor (RLS). O yüzden yönetici iznine bağlamak
         * yanlış olurdu — danışmanın kendi imzasını düzenlemesi yöneticiye
         * bağlanırdı.
         *
         * Ama izinsiz de bırakılamıyor: `client_viewer` (müşteri hesabı)
         * rapor GÖNDERMİYOR, yalnızca okuyor. İzinsiz bırakmak ona hem bu
         * ekranı hem de tamamı ajans işi olan "Ayarlar" başlığını
         * gösteriyordu — `nav-sections.spec.ts` bunu yakaladı.
         *
         * `report.share` tam olarak "rapor gönderebilir" demek ve e-posta
         * kimliği de onun için gerekiyor.
         */
        href: '/ayarlar/e-posta',
        label: 'E-posta Ayarları',
        icon: 'mail',
        module: 6,
        ready: true,
        perm: 'report.share',
      },
      {
        href: '/ayarlar/ekip',
        label: 'Ekip & Yetkiler',
        icon: 'team',
        module: 1,
        ready: true,
        perm: 'user.read',
      },
    ],
  },
];

/**
 * Kullanıcının GÖREBİLECEĞİ bölümler.
 *
 * AYRI BİR DOSYADA ve saf: layout bir sunucu bileşeni ve içindeki bir diziyi
 * sınamak için bütün ağacı render etmek gerekirdi. Menü görünürlüğü bir
 * YETKİ kararı ve yetki kararları sınanmadan yazılmamalı.
 *
 * Boş kalan bölüm HİÇ DÖNMÜYOR — başlığı tek başına basmak, kullanıcıya
 * içine giremeyeceği bir kategori göstermek olurdu.
 */
export function visibleSections(
  permissions: readonly Permission[],
  /*
   * ZORUNLU PARAMETRE, VARSAYILANSIZ. Varsayılanı `false` olsaydı onu
   * geçirmeyi unutan bir çağıran ajans yöneticisinden "Üst Hesaplar"ı
   * sessizce gizlerdi; `true` olsaydı müşteri adminine geri getirirdi.
   * İkisi de derlemede görünmezdi.
   */
  baglam: { ustHesapGorunur: boolean },
): Array<{ title?: string; items: NavEntry[] }> {
  const izinli = new Set(permissions);
  const gorunur = (i: NavEntry): boolean =>
    (!i.perm || izinli.has(i.perm)) && (!i.ustHesapUyeligi || baglam.ustHesapGorunur);
  return SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.filter(gorunur).map((i) =>
      /*
       * ALT ÖĞELER DE SÜZÜLÜYOR. Kendi `perm`i olmayan alt öğe üstünkini
       * devralıyor (üst zaten süzüldü); kendi anahtarı varsa ayrıca
       * kontrol ediliyor. Süzmeyi atlamak, üst satırı gören ama alt
       * satırında 403 alan bir kullanıcı üretirdi.
       */
      i.children ? { ...i, children: i.children.filter(gorunur) } : i,
    ),
  })).filter((s) => s.items.length > 0);
}

/**
 * Kenar çubuğunun çizeceği hâl: Ayarlar bölümü AYRI dönüyor, kenar çubuğu
 * onu en altta tek satır olarak gösteriyor. Görünür ayar sayfası yoksa
 * (müşteri hesabı) satır hiç çizilmiyor: tıklayınca 403 veren bir kapı
 * göstermek, rol matrisinin önlemek istediği şeyin ta kendisi.
 */
export function kenarBolumleri(bolumler: Array<{ title?: string; items: NavEntry[] }>): {
  bolumler: Array<{ title?: string; items: NavEntry[] }>;
  ayarlar: NavEntry[];
} {
  return {
    bolumler: bolumler.filter((b) => b.title !== AYARLAR_BOLUMU),
    ayarlar: bolumler.find((b) => b.title === AYARLAR_BOLUMU)?.items ?? [],
  };
}
