import type { Platform, Uyari } from '@advetics/shared';

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
  clientId: string | null;
  clientName: string | null;
  connectionStatus: string;
  connectionTokenExpiresAt: Date | null;
}

/**
 * Meta'nın sayısal `account_status` değerini ham yanıttan okur.
 *
 * NEDEN HAM YANITTAN: `mapAccountStatus` 3, 7, 8 ve 9'u tek bir `paused`
 * değerine indiriyor ve o indirgeme tam da ayırt edilmesi gereken şeyi
 * kaybediyor — "bakiye ödenmemiş" (3) ile "risk incelemesinde" (7) aynı
 * satıra düşüyor, oysa birinde kullanıcı ödeme yapacak, diğerinde beklemekten
 * başka yapabileceği bir şey yok. Ham yanıt `ad_accounts.raw` içinde zaten
 * duruyor; ikinci bir platform çağrısı gerekmiyor.
 *
 * `null` = değer okunamadı. Tahmin etmiyoruz: yanlış bir ödeme uyarısı
 * kullanıcıyı olmayan bir borcu aramaya gönderir.
 */
export function metaHesapDurumu(raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>).account_status;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Google `customer.status` ham yanıttan — 'SUSPENDED', 'CANCELED', 'CLOSED'. */
export function googleHesapDurumu(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>).status;
  return typeof v === 'string' && v.trim() !== '' ? v.toUpperCase() : null;
}

/** Meta'da ÖDEME sorunu anlamına gelen kodlar. 7 (risk incelemesi) BURADA DEĞİL. */
const META_ODEME_KODLARI = new Set([3, 8, 9]);
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

const KANALLAR = '/ayarlar/baglantilar';

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
  if (h.platform === 'meta') {
    const kod = metaHesapDurumu(h.raw);
    if (kod !== null && META_ODEME_KODLARI.has(kod)) {
      return [
        {
          ...t,
          kod: 'hesap_odeme_sorunu',
          siddet: 'error',
          baslik: 'Reklamlar yayınlanmıyor — ödeme sorunu',
          detay:
            kod === 3
              ? 'Hesabın ödenmemiş bakiyesi var. Meta Ads Manager’dan bakiyeyi ödeyin; reklamlar ödeme alınana kadar yayınlanmıyor.'
              : 'Hesap ödeme bekliyor ya da ek süre kullanıyor. Meta Ads Manager’dan ödeme yöntemini güncelleyin.',
          eylem: null,
        },
      ];
    }
    if (kod === META_RISK_KODU) {
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
  }

  if (h.platform === 'google') {
    const durum = googleHesapDurumu(h.raw);
    if (durum === 'SUSPENDED') {
      return [
        {
          ...t,
          kod: 'hesap_odeme_sorunu',
          siddet: 'error',
          baslik: 'Reklamlar yayınlanmıyor — hesap askıya alınmış',
          detay:
            'Google hesabı askıya aldı; en sık sebebi ödemedir. Google Ads’te faturalandırma bölümünü kontrol edin.',
          eylem: null,
        },
      ];
    }
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

  // ── 2. Bağlantı hâlleri — panelden çözülüyor ──────────────────────────
  if (h.connectionStatus !== 'active') {
    return [
      {
        ...t,
        kod: 'baglanti_yetki_istiyor',
        siddet: 'error',
        baslik: 'Platform bağlantısı yeniden yetki istiyor',
        detay:
          'Bağlantı kopmuş; bu hesabın verisi güncellenmiyor. Platform Bağlantıları ekranından yeniden yetkilendirin.',
        eylem: { etiket: 'Bağlantıyı onar', href: KANALLAR },
      },
    ];
  }

  const sonGecerlilik = h.connectionTokenExpiresAt;
  if (sonGecerlilik !== null) {
    const kalanGun = (sonGecerlilik.getTime() - simdi.getTime()) / 86_400_000;
    if (kalanGun <= TOKEN_UYARI_GUNU) {
      return [
        {
          ...t,
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
            'Süre dolduğunda veri çekimi durur ve panel sessizce eski rakamları göstermeye devam eder. Yeniden yetkilendirmek bir dakikalık iş.',
          eylem: { etiket: 'Yeniden yetkilendir', href: KANALLAR },
        },
      ];
    }
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
          'Hesap müşteriye atanmış ama izleme kapalı: hiç veri çekilmiyor ve panelde bu hesabın harcaması görünmüyor.',
        eylem: { etiket: 'İzlemeyi aç', href: KANALLAR },
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
          'İzleme açık ama bugüne kadar tek bir metrik satırı yazılmadı. Senkronizasyon ekranından "Şimdi güncelle" deyip işin sonucuna bakın.',
        eylem: { etiket: 'Senkronizasyonu aç', href: '/ayarlar/senkronizasyon' },
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
        eylem: { etiket: 'Senkronizasyonu aç', href: '/ayarlar/senkronizasyon' },
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
    baslik: 'Müşteriye reklam hesabı atanmamış',
    detay:
      'Bu workspace’te hiçbir ekran veri göstermeyecek. Platform Bağlantıları ekranından havuzdaki bir hesabı atayın.',
    clientId: client.id,
    clientName: client.name,
    adAccountId: null,
    adAccountName: null,
    platform: null,
    eylem: { etiket: 'Hesap ata', href: KANALLAR },
    veriZamani: null,
  };
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
