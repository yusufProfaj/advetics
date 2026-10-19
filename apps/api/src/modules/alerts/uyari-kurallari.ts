import {
  googleHesapDurumu,
  googleMusteriNumarasi,
  hesapOdemeKarari,
  hesaplarAdresi,
  metaHesapDurumu,
  odemeEkraniAdresi,
  type OdemeSebebi,
  platformBaglantilariAdresi,
  veriDurumuAdresi,
  type Platform,
  type Uyari,
} from '@advetics/shared';

/**
 * ═══ UYARI KURALLARI — SAF KARARLAR ═══
 *
 * Sorgudan AYRI duruyorlar ve bu bilinçli: her kural "şu satır şu hâldeyse şu
 * uyarı" biçiminde tek bir karar ve JSX'in ya da SQL'in içinde kaldığında
 * sınanacak bir yüzeyi olmuyor. Bir yetki/uyarı sisteminde en pahalı hata
 * SESSİZ olanı: gösterilmeyen bir uyarı, hiç yazılmamış uyarıyla aynı.
 *
 * HİÇBİR KURAL PLATFORM ÇAĞRISI GEREKTİRMİYOR. Hepsi veritabanında ZATEN
 * duran kolonlardan okunuyor.
 */

/** Kuralların okuduğu hesap satırı — çağıranın `select`'i bunu karşılamalı. */
export interface UyariHesabi {
  id: string;
  name: string;
  platform: Platform;
  /** Normalize edilmiş durum (`AdAccountStatus`). */
  status: string;
  syncEnabled: boolean;
  lastInsightsSyncAt: Date | null;
  lastStructureSyncAt: Date | null;
  updatedAt: Date;
  /** Ham platform yanıtı — normalize edilirken KAYBOLAN ayrım burada. */
  raw: unknown;
  /**
   * `ad_accounts.odeme_durumu` (Google ödeme okuması). ZORUNLU alan: seçmeyi
   * unutan bir çağıran Google'ın ödeme sorununu sessizce "bilinmiyor"a
   * düşürürdü; tip, select'e eklenmesini zorluyor.
   */
  odemeDurumu: unknown;
  /** Platformdaki hesap kimliği — ödeme ekranı bağlantısı ve metin için. */
  externalId: string;
  clientId: string | null;
  clientName: string | null;
  /**
   * `null` = bağlantı bu kapsamda GÖRÜNMÜYOR (başka şirketin kendi
   * bağlantısı). O zaman bağlantı seviyesinde tek bir uyarı da üretilemiyor
   * ve aşağıdaki "bağlantı bozuksa sus" kuralı UYGULANMIYOR: susmak, o
   * hesabın veri sorununu hiçbir yerde söylememek olurdu.
   */
  connectionStatus: string | null;
  connectionTokenExpiresAt: Date | null;
}

/*
 * ÖDEME KARARI SHARED'DA (`odeme-durumu.ts`): Reklam Yöneticisi'nin teslimat
 * sütunu ve Veri durumu satırı da aynı kararı okuyor. Burada ikinci bir
 * kopya, bandın "ödeme sorunu" derken kampanyanın "Yayında" demesi olurdu.
 * İki okuyucu (testler ve eski çağıranlar için) buradan da dışa açık.
 */
export { googleHesapDurumu, metaHesapDurumu };

const META_RISK_KODU = 7;

/** Metrik bu kadar süredir gelmiyorsa bayat sayılıyor. */
export const BAYAT_ESIGI_SAAT = 48;

/** Token bu kadar gün içinde doluyorsa uyarılıyor — dolduktan sonra değil. */
export const TOKEN_UYARI_GUNU = 7;

function taban(h: UyariHesabi): Omit<Uyari, 'kod' | 'siddet' | 'baslik' | 'detay' | 'eylem'> {
  return {
    clientId: h.clientId,
    clientName: h.clientName,
    adAccountId: h.id,
    adAccountName: h.name,
    platform: h.platform,
    // Hesabın platformdaki durumu yalnızca hesap listesi tazelenirken
    // yazılıyor; `updatedAt` o anı taşıyor ve bayatlık ekranda görünmeli.
    veriZamani: h.updatedAt.toISOString(),
  };
}

/*
 * ═══ UYARININ GÖTÜRDÜĞÜ YER — PANELİN ÜRETİCİSİNDEN ═══
 *
 * Burada `/ayarlar/baglantilar` ve `/ayarlar/senkronizasyon` ELLE yazılıydı.
 * Panelde sayfalar taşındı (Ayarlar ve Marka Merkezi sadeleştirme,
 * 2026-10-13): hesap ataması ve izleme artık workspace'in Kurulum'unda,
 * veri durumu Workspace bilgileri'nde. Elle yazılmış yol bildirim zilini
 * eski adrese, oradan bir yönlendirmeyle YANLIŞ workspace'e götürürdü
 * (eski Senkronizasyon ekranı adresteki değil OTURUMDAKİ workspace'i
 * okuyordu). Uyarı hangi workspace'e aitse bağlantı onu TAŞIYOR.
 *
 * BAĞLANTI uyarıları (yetki, token) workspace'e değil ajansa ait: onların
 * evi her zaman Ayarlar › Platform bağlantıları.
 */

/**
 * Ödeme uyarısının Türkçe metni — mail ve eski istemciler için.
 *
 * PANEL BU METNİ DEĞİL `odemeSebebi`ni okuyor ve iki dilli sözlükten
 * yazıyor (`genel-bakis.ts` › `odeme`). Mail ajansa Türkçe gidiyor; metin
 * burada kalmak zorunda. İki yerde de sebep başına ayrı cümle: "yöntem yok"
 * ile "bütçe bitti"nin yapılacak işi farklı.
 */
const ODEME_METNI: Record<OdemeSebebi, (no: string) => { baslik: string; detay: string }> = {
  meta_bakiye_odenmemis: () => ({
    baslik: 'Reklamlar yayınlanmıyor — ödeme sorunu',
    detay:
      'Hesabın ödenmemiş bakiyesi var. Meta Ads Manager’dan bakiyeyi ödeyin; reklamlar ödeme alınana kadar yayınlanmıyor.',
  }),
  meta_odeme_bekliyor: () => ({
    baslik: 'Reklamlar yayınlanmıyor — ödeme sorunu',
    detay:
      'Hesap ödeme bekliyor ya da ek süre kullanıyor. Meta Ads Manager’dan ödeme yöntemini güncelleyin.',
  }),
  google_hesap_askida: () => ({
    baslik: 'Reklamlar yayınlanmıyor — hesap askıya alınmış',
    detay:
      'Google hesabı askıya aldı; en sık sebebi ödemedir. Google Ads’te faturalandırma bölümünü kontrol edin.',
  }),
  google_odeme_yontemi_yok: (no) => ({
    baslik: 'Reklamlar yayınlanmıyor — ödeme yöntemi yok',
    detay: `Google Ads hesabında (${no}) geçerli bir ödeme ayarı yok. Google Ads’te Faturalandırma bölümünden ödeme yöntemi ekleyin.`,
  }),
  google_fatura_onay_bekliyor: (no) => ({
    baslik: 'Reklamlar yayınlanmıyor — ödeme ayarı onay bekliyor',
    detay: `Google Ads hesabının (${no}) ödeme ayarı ya da hesap bütçesi Google’ın onayını bekliyor. Faturalandırma bölümünden durumu kontrol edin.`,
  }),
  google_hesap_butcesi_bitti: (no) => ({
    baslik: 'Reklamlar yayınlanmıyor — hesap bütçesi doldu',
    detay: `Google Ads hesabının (${no}) hesap bütçesi tükendi. Faturalandırma bölümünden bütçeyi artırın ya da yeni bütçe ekleyin.`,
  }),
  google_hesap_butcesi_suresi_doldu: (no) => ({
    baslik: 'Reklamlar yayınlanmıyor — hesap bütçesinin süresi doldu',
    detay: `Google Ads hesabının (${no}) hesap bütçesinin bitiş tarihi geçti. Faturalandırma bölümünden yeni bütçe ekleyin.`,
  }),
};

/** Google ödeme okumasının anı; yoksa `null`. */
function odemeOkumaAni(h: UyariHesabi): string | null {
  const o = h.odemeDurumu;
  if (h.platform !== 'google' || o === null || typeof o !== 'object') return null;
  const okundu = (o as Record<string, unknown>).okundu;
  return typeof okundu === 'string' ? okundu : null;
}

/**
 * Bir reklam hesabının ürettiği uyarılar.
 *
 * SIRA ÖNEMLİ ve şu kurala göre: önce ŞU ANDA para/veri kaybettiren hâller,
 * sonra kurulum eksikleri. Bir hesap birden çok koşula takılabiliyor ve
 * hepsini birden basmak bandı okunmaz yapıyor — en ağırı yazılıyor.
 *
 * TEK HESAP TEK UYARI kuralı YOK ama pratikte ilk eşleşen dönülüyor: "hesap
 * kapatılmış" ile "veri gelmiyor" aynı anda doğru ve ikincisi birincinin
 * SONUCU. Sonucu ayrıca yazmak, sebebi gürültüye boğar.
 */
export function hesapUyarilari(h: UyariHesabi, simdi: Date): Uyari[] {
  const t = taban(h);

  // ── 1. Platform tarafındaki hâller — panelden çözülemiyor ──────────────
  const karar = hesapOdemeKarari(
    { platform: h.platform, raw: h.raw, odemeDurumu: h.odemeDurumu },
    simdi,
  );
  if (karar.durum === 'sorun') {
    const no = h.platform === 'google' ? googleMusteriNumarasi(h.externalId) : h.externalId;
    const metin = ODEME_METNI[karar.sebep](no);
    return [
      {
        ...t,
        // GOOGLE'DA VERİNİN ANI ÖDEME OKUMASININ ANI: `updatedAt` hesabın
        // herhangi bir kolonu yazılınca da ilerliyor ve bayat bir okumayı
        // taze gösterirdi.
        veriZamani: odemeOkumaAni(h) ?? t.veriZamani,
        kod: 'hesap_odeme_sorunu',
        siddet: 'error',
        baslik: metin.baslik,
        detay: metin.detay,
        eylem: null,
        odemeSebebi: karar.sebep,
        odemeAdresi: odemeEkraniAdresi(h.platform, h.externalId),
        odemeHesapNo: no,
      },
    ];
  }

  if (h.platform === 'meta' && metaHesapDurumu(h.raw) === META_RISK_KODU) {
    return [
      {
        ...t,
        kod: 'hesap_risk_incelemesi',
        siddet: 'warn',
        baslik: 'Hesap risk incelemesinde',
        detay:
          'Meta hesabı inceliyor. Ödemeyle ilgisi yok ve panelden yapılabilecek bir şey de yok — inceleme bitene kadar yayın durabilir.',
        eylem: null,
      },
    ];
  }

  if (h.status === 'disabled' || h.status === 'closed') {
    return [
      {
        ...t,
        kod: 'hesap_platformda_kapali',
        siddet: 'error',
        baslik:
          h.status === 'closed'
            ? 'Hesap platformda kapatılmış'
            : 'Hesap platformda devre dışı',
        detay:
          'Bu hesapta reklam yayınlanmıyor ve yeni veri gelmiyor. Panelden çözülemiyor — platformun kendi arayüzünden açılması gerekiyor.',
        eylem: null,
      },
    ];
  }

  /*
   * ── 2. BAĞLANTI HÂLLERİ BURADAN ÇIKTI — SEBEBİ GÜRÜLTÜYDÜ ────────────
   *
   * `connectionStatus` ve `connectionTokenExpiresAt` BAĞLANTIYA ait, hesaba
   * değil. Bu fonksiyon her ATANMIŞ HESAP için koşuyor ve ajansın TEK bir
   * Meta bağlantısı onlarca hesaba hizmet ediyor — yani tek bir süre uyarısı
   * onlarca birebir aynı satır üretiyordu.
   *
   * Bedeli üç katlıydı:
   *   · Bant 20 satırla sınırlı (`LIMIT`); kopyalar GERÇEK uyarıları
   *     (ödeme sorunu, veri gelmiyor) listenin dışına itiyordu.
   *   · Gizleme anahtarı `kod:adAccountId`; birini kapatmak diğerlerini
   *     kapatmıyordu ve uyarı "sürekli geri geliyor" gibi görünüyordu.
   *   · Aynı cümle onlarca kez okunuyordu — bu depoda "481 hesap
   *     izlenmiyor" sayacıyla aynı hata: uyarı okunmaz hâle geliyor.
   *
   * Artık `baglantiUyarilari()` bunu BAĞLANTI BAŞINA BİR KEZ üretiyor.
   *
   * BURADA SESSİZ KALMAK ŞART. Bağlantı bozukken hesabın kendi veri
   * uyarıları ("veri gelmiyor", "veri bayat") DOĞRU ama SEBEBİ aynı ve tek
   * bir kopuk bağlantı yine onlarca satır üretirdi. Sebep bir üst seviyede
   * bir kez söyleniyor.
   */
  if (h.connectionStatus !== null && h.connectionStatus !== 'active') return [];
  if (
    h.connectionTokenExpiresAt !== null &&
    (h.connectionTokenExpiresAt.getTime() - simdi.getTime()) / 86_400_000 <= TOKEN_UYARI_GUNU
  ) {
    return [];
  }

  // ── 3. Kurulum eksikleri ──────────────────────────────────────────────
  if (!h.syncEnabled) {
    return [
      {
        ...t,
        kod: 'hesap_izleme_kapali',
        siddet: 'warn',
        baslik: 'Hesap izlemede değil',
        detay:
          'Hesap workspace’e atanmış ama izleme kapalı: hiç veri çekilmiyor ve panelde bu hesabın harcaması görünmüyor.',
        eylem: { etiket: 'İzlemeyi aç', href: hesaplarAdresi(h.clientId) },
      },
    ];
  }

  // ── 4. Veri akışı ─────────────────────────────────────────────────────
  if (h.lastInsightsSyncAt === null) {
    /*
     * "HİÇ GELMEDİ" İLE "BAYAT" AYRI. Birincisi kurulumun hiç tamamlanmadığı
     * anlamına geliyor ve elle tetiklemek çözüyor; ikincisi çalışan bir
     * sistemin durduğu anlamına geliyor ve worker'a bakmak gerekiyor. İkisini
     * aynı cümleye indirmek, bu projede defalarca yaşanan "atadım, veri
     * gelmiyor" hâlinin sebebini gizlerdi.
     */
    return [
      {
        ...t,
        kod: 'veri_hic_gelmedi',
        siddet: 'error',
        baslik: 'Bu hesaptan hiç veri gelmedi',
        detay:
          'İzleme açık ama bugüne kadar tek bir metrik satırı yazılmadı. Workspace bilgileri › Veri durumu ekranından işin sonucuna bakın.',
        eylem: { etiket: 'Veri durumunu aç', href: veriDurumuAdresi(h.clientId) },
      },
    ];
  }

  const saat = (simdi.getTime() - h.lastInsightsSyncAt.getTime()) / 3_600_000;
  if (saat >= BAYAT_ESIGI_SAAT) {
    return [
      {
        ...t,
        kod: 'veri_bayat',
        siddet: 'warn',
        baslik: `Veri ${Math.floor(saat / 24)} gündür güncellenmedi`,
        detay:
          'Zamanlanmış güncelleme koşmuyor olabilir. Panel bu arada eski rakamları göstermeye devam ediyor — düşen bir harcama gerçek değil, durmuş bir senkronizasyon olabilir.',
        eylem: { etiket: 'Veri durumunu aç', href: veriDurumuAdresi(h.clientId) },
      },
    ];
  }

  return [];
}

/** Hiç hesabı olmayan müşteri — hesap satırı olmadığı için ayrı üretiliyor. */
export function hesapsizMusteriUyarisi(client: { id: string; name: string }): Uyari {
  return {
    kod: 'musteride_hesap_yok',
    siddet: 'warn',
    baslik: 'Workspace’e reklam hesabı atanmamış',
    detay:
      'Bu workspace’te hiçbir ekran veri göstermeyecek. Marka Merkezi › Kurulum’dan havuzdaki bir hesabı atayın.',
    clientId: client.id,
    clientName: client.name,
    adAccountId: null,
    adAccountName: null,
    platform: null,
    eylem: { etiket: 'Hesap ata', href: hesaplarAdresi(client.id) },
    veriZamani: null,
  };
}

/** Kuralların okuduğu bağlantı satırı. */
export interface UyariBaglantisi {
  id: string;
  platform: Platform;
  /** `active` | `needs_reauth` | `error` | `revoked` */
  status: string;
  tokenExpiresAt: Date | null;
  /** Yetkilendirmeyi yapan hesabın etiketi — hangi bağlantı olduğu belli olsun. */
  accountLabel: string | null;
  /** Bu bağlantıya bağlı ATANMIŞ hesap sayısı; uyarının ağırlığı bu. */
  etkilenenHesap: number;
  /** Verinin son okunma anı — bayatlık ekranda görünmek zorunda. */
  veriZamani: Date | null;
}

/**
 * ═══ BAĞLANTI UYARILARI — BAĞLANTI BAŞINA BİR TANE ═══
 *
 * Önce hesap kurallarının içindeydiler ve her atanmış hesap için bir kopya
 * üretiyorlardı; gerekçe `hesapUyarilari` içinde yazılı.
 *
 * `clientId` ve `adAccountId` NULL: bu uyarı bir müşteriye ait değil,
 * AJANSA ait. Panel bandı `null` müşteriyi ajans geneli olarak çiziyor ve
 * gizleme anahtarı (`kod:-`) tek bir satırı kapatınca hepsini kapatıyor —
 * çünkü artık gerçekten tek satır.
 */
export function baglantiUyarilari(b: UyariBaglantisi, simdi: Date): Uyari[] {
  const taban = {
    clientId: null,
    clientName: null,
    adAccountId: null,
    adAccountName: b.accountLabel,
    platform: b.platform,
    veriZamani: b.veriZamani?.toISOString() ?? null,
  };
  // KAÇ HESABIN ETKİLENDİĞİ YAZILIYOR: "bir bağlantı koptu" ile "kırk
  // hesabın verisi durdu" aynı aciliyette değil ve farkı yalnızca bu sayı
  // gösteriyor.
  const kapsam = `${b.etkilenenHesap} hesabın verisi bu bağlantıdan geliyor.`;

  if (b.status !== 'active') {
    return [
      {
        ...taban,
        kod: 'baglanti_yetki_istiyor',
        siddet: 'error',
        baslik: 'Platform bağlantısı yeniden yetki istiyor',
        detay: `Bağlantı kopmuş ve veri güncellenmiyor. ${kapsam} Ayarlar › Platform bağlantıları ekranından yeniden yetkilendirin.`,
        eylem: { etiket: 'Bağlantıyı onar', href: platformBaglantilariAdresi() },
      },
    ];
  }

  if (b.tokenExpiresAt === null) return [];
  const kalanGun = (b.tokenExpiresAt.getTime() - simdi.getTime()) / 86_400_000;
  if (kalanGun > TOKEN_UYARI_GUNU) return [];

  return [
    {
      ...taban,
      kod: 'baglanti_token_suresi',
      // SÜRESİ DOLMUŞSA `error`, DOLMAK ÜZEREYSE `warn`. İkisini aynı
      // şiddetle göstermek, "bugün hallet" ile "bu hafta hallet"i aynı
      // yapardı ve bant her gün aynı kırmızıyı gösterirdi.
      siddet: kalanGun <= 0 ? 'error' : 'warn',
      baslik:
        kalanGun <= 0
          ? 'Bağlantı yetkisinin süresi doldu'
          : `Bağlantı yetkisi ${Math.max(1, Math.ceil(kalanGun))} gün içinde doluyor`,
      detay:
        kalanGun <= 0
          ? `Veri çekimi durdu ve panel eski rakamları göstermeye devam ediyor. ${kapsam}`
          : /*
               ELLE YETKİLENDİRME İSTENMİYOR — SİSTEM ZATEN DENİYOR.
               Eşik uyarı penceresinden geniş (10 gün > 7 gün), yani tazeleme
               bu uyarı doğmadan önce denenmiş oluyor. Uyarı buna rağmen
               görünüyorsa tazeleme BAŞARISIZ demektir ve o zaman elle
               yetkilendirmek gerçekten gerekiyor. Metin bunu söylüyor;
               önceki hâli koşulsuz "bir dakikalık iş" diyordu ve kullanıcıyı
               her gün gereksiz yere çağırıyordu.
             */
            `Sistem yetkiyi kendi tazelemeye çalışıyor; bu uyarı duruyorsa deneme başarısız oluyor demektir. ${kapsam}`,
      eylem: { etiket: 'Yeniden yetkilendir', href: platformBaglantilariAdresi() },
    },
  ];
}

/**
 * Uyarıları ekrana basılacak sıraya koyar.
 *
 * `error` her zaman önce; eşitlikte kod alfabetik DEĞİL, sabit bir öncelik
 * listesine göre — alfabetik sıra "bağlantı" uyarısını "hesap kapalı"nın
 * üstüne çıkarırdı ve ikincisi daha acil.
 */
const ONCELIK: Record<string, number> = {
  hesap_odeme_sorunu: 0,
  hesap_platformda_kapali: 1,
  baglanti_yetki_istiyor: 2,
  veri_hic_gelmedi: 3,
  baglanti_token_suresi: 4,
  is_dusuyor: 5,
  // Meta'ya giden sinyal duruyor: para yakmıyor ama 7 gün dolunca sonuç bir
  // daha gönderilemiyor; bayat veriden önce.
  geri_besleme_dusuyor: 5.5,
  veri_bayat: 6,
  hesap_risk_incelemesi: 7,
  hesap_izleme_kapali: 8,
  musteride_hesap_yok: 9,
};

export function siralaUyarilari(uyarilar: Uyari[]): Uyari[] {
  return [...uyarilar].sort((a, b) => {
    if (a.siddet !== b.siddet) return a.siddet === 'error' ? -1 : 1;
    const fark = (ONCELIK[a.kod] ?? 99) - (ONCELIK[b.kod] ?? 99);
    if (fark !== 0) return fark;
    return (a.clientName ?? '').localeCompare(b.clientName ?? '', 'tr');
  });
}
