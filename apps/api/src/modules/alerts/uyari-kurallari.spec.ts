import { describe, expect, it } from 'vitest';
import {
  BAYAT_ESIGI_SAAT,
  TOKEN_UYARI_GUNU,
  baglantiUyarilari,
  googleHesapDurumu,
  hesapUyarilari,
  hesapsizMusteriUyarisi,
  metaHesapDurumu,
  siralaUyarilari,
  type UyariBaglantisi,
  type UyariHesabi,
} from './uyari-kurallari';

/**
 * ═══ UYARI KURALLARI ═══
 *
 * Bir uyarı sisteminde iki hata türü var ve ikisi de sessiz:
 *   · ÜRETİLMEYEN uyarı — sorun var, ekranda yok. Hiç uyarı yazmamışla aynı.
 *   · UYDURULAN uyarı — sorun yok, ekranda var. Kullanıcıyı olmayan bir
 *     sorunu aramaya gönderiyor ve bir süre sonra bütün uyarılara güvenmeyi
 *     bıraktırıyor.
 *
 * Bu paket ikisini de yazıyor: her kural için "üretiliyor" ve "üretilmiyor"
 * hâlleri ayrı ayrı sınanıyor.
 */
const SIMDI = new Date('2026-08-27T12:00:00Z');
const SAAT = 3_600_000;
const GUN = 86_400_000;

function hesap(over: Partial<UyariHesabi> = {}): UyariHesabi {
  return {
    id: 'a1',
    name: 'Test Hesabı',
    platform: 'meta',
    status: 'active',
    syncEnabled: true,
    lastInsightsSyncAt: new Date(SIMDI.getTime() - SAAT),
    lastStructureSyncAt: new Date(SIMDI.getTime() - SAAT),
    updatedAt: new Date(SIMDI.getTime() - SAAT),
    raw: { account_status: 1 },
    clientId: 'c1',
    clientName: 'A Firması',
    connectionStatus: 'active',
    connectionTokenExpiresAt: null,
    ...over,
  };
}

const kodlar = (h: UyariHesabi): string[] => hesapUyarilari(h, SIMDI).map((u) => u.kod);

describe('sağlıklı hesap', () => {
  it('hiçbir uyarı üretmiyor', () => {
    // Uydurulan uyarıya karşı ilk savunma: her şey yolundayken bant BOŞ.
    expect(hesapUyarilari(hesap(), SIMDI)).toEqual([]);
  });
});

describe('ham platform durumunun okunması', () => {
  it('Meta sayısal kodu okunuyor — sayı da metin de', () => {
    expect(metaHesapDurumu({ account_status: 3 })).toBe(3);
    expect(metaHesapDurumu({ account_status: '3' })).toBe(3);
  });

  it('okunamayan ham yanıtta TAHMİN ETMİYOR', () => {
    /*
     * Yanlış bir ödeme uyarısı, kullanıcıyı olmayan bir borcu aramaya
     * gönderir. Değer yoksa `null` — varsayılan bir kod uydurmak yok.
     */
    expect(metaHesapDurumu(null)).toBeNull();
    expect(metaHesapDurumu({})).toBeNull();
    expect(metaHesapDurumu({ account_status: 'abc' })).toBeNull();
    expect(metaHesapDurumu('metin')).toBeNull();
    expect(googleHesapDurumu({ status: '' })).toBeNull();
    expect(googleHesapDurumu({})).toBeNull();
  });

  it('Google durumu büyük harfe çevriliyor', () => {
    expect(googleHesapDurumu({ status: 'suspended' })).toBe('SUSPENDED');
  });
});

describe('ödeme sorunu', () => {
  it.each([3, 8, 9])('Meta account_status=%i ödeme uyarısı üretiyor', (kod) => {
    const [u] = hesapUyarilari(hesap({ raw: { account_status: kod } }), SIMDI);
    expect(u?.kod).toBe('hesap_odeme_sorunu');
    expect(u?.siddet).toBe('error');
  });

  it('KRİTİK: 3 (bakiye ödenmemiş) ile 8/9 (ödeme bekliyor) FARKLI cümle yazıyor', () => {
    /*
     * İkisinin yapılacak işi farklı: birinde borç ödenecek, diğerinde ödeme
     * yöntemi güncellenecek. Tek cümleye indirmek, kullanıcıyı yanlış ekrana
     * gönderir.
     */
    const [borc] = hesapUyarilari(hesap({ raw: { account_status: 3 } }), SIMDI);
    const [bekliyor] = hesapUyarilari(hesap({ raw: { account_status: 9 } }), SIMDI);
    expect(borc!.detay).not.toBe(bekliyor!.detay);
    expect(borc!.detay).toContain('bakiye');
  });

  it('KRİTİK: 7 (risk incelemesi) ÖDEME uyarısı DEĞİL', () => {
    /*
     * Normalize edilmiş `status` 3, 7, 8 ve 9'u tek bir `paused` değerine
     * indiriyor. Ham yanıta bakmayan bir kural risk incelemesini "ödeme
     * sorunu" diye gösterirdi ve kullanıcı ödenecek bir borç arardı.
     */
    const [u] = hesapUyarilari(hesap({ raw: { account_status: 7 } }), SIMDI);
    expect(u?.kod).toBe('hesap_risk_incelemesi');
    expect(u?.siddet).toBe('warn');
  });

  it('Google SUSPENDED ödeme uyarısı üretiyor', () => {
    const [u] = hesapUyarilari(
      hesap({ platform: 'google', raw: { status: 'SUSPENDED' } }),
      SIMDI,
    );
    expect(u?.kod).toBe('hesap_odeme_sorunu');
  });

  it('Google ENABLED uyarı üretmiyor', () => {
    expect(hesapUyarilari(hesap({ platform: 'google', raw: { status: 'ENABLED' } }), SIMDI)).toEqual(
      [],
    );
  });

  it('ödeme uyarısı panelden çözülemiyor — eylem YOK', () => {
    // Panelde bir "çöz" düğmesi göstermek, tıklayınca hiçbir şey yapmayan bir
    // düğme demekti: ödeme platformun kendi arayüzünde yapılıyor.
    const [u] = hesapUyarilari(hesap({ raw: { account_status: 3 } }), SIMDI);
    expect(u?.eylem).toBeNull();
  });
});

describe('hesap kapalı', () => {
  it.each(['disabled', 'closed'])('%s durumu error üretiyor', (status) => {
    const [u] = hesapUyarilari(hesap({ status, raw: {} }), SIMDI);
    expect(u?.kod).toBe('hesap_platformda_kapali');
    expect(u?.siddet).toBe('error');
  });

  it('paused durumu TEK BAŞINA uyarı üretmiyor', () => {
    /*
     * `paused` aşırı yüklü: Google yönetici (MCC) hesapları da, Meta'nın
     * 3/7/8/9 kodları da buraya düşüyor. Ham yanıtta bir şey yoksa uyarı da
     * yok — yönetici hesabı için "reklamlar yayınlanmıyor" demek yanlış olurdu.
     */
    expect(hesapUyarilari(hesap({ status: 'paused', raw: {} }), SIMDI)).toEqual([]);
  });
});

/**
 * ═══ BAĞLANTI UYARILARI — BAĞLANTI BAŞINA BİR TANE ═══
 *
 * Bu kurallar önce `hesapUyarilari` içindeydi ve HER ATANMIŞ HESAP için bir
 * kopya üretiyordu. Ajansın TEK Meta bağlantısı onlarca hesaba hizmet
 * ediyor: tek bir süre uyarısı onlarca birebir aynı satır demekti, bant
 * `LIMIT` yüzünden gerçek uyarıları dışarı itiyordu ve gizleme anahtarı
 * hesap bazlı olduğu için biri kapatılınca diğerleri kalıyordu.
 * Kullanıcının gördüğü hâl: *"sürekli şimdi yetkilendir bildirimi gözüküp
 * duruyor."*
 */
function baglanti(over: Partial<UyariBaglantisi> = {}): UyariBaglantisi {
  return {
    id: 'c1',
    platform: 'meta',
    status: 'active',
    tokenExpiresAt: null,
    accountLabel: 'Profaj Meta',
    etkilenenHesap: 12,
    veriZamani: new Date(SIMDI.getTime() - SAAT),
    ...over,
  };
}

describe('bağlantı', () => {
  it('bağlantı aktif değilse yeniden yetki uyarısı', () => {
    const [u] = baglantiUyarilari(baglanti({ status: 'expired' }), SIMDI);
    expect(u?.kod).toBe('baglanti_yetki_istiyor');
    expect(u?.eylem?.href).toBe('/ayarlar/baglantilar');
  });

  it('token süresi DOLMUŞSA error, DOLMAK ÜZEREYSE warn', () => {
    /*
     * İkisini aynı şiddetle göstermek "bugün hallet" ile "bu hafta hallet"i
     * aynı yapardı ve bant her gün aynı kırmızıyı gösterirdi — okunmaz hâle
     * gelen bir uyarı, olmayan bir uyarıyla aynı.
     */
    const dolmus = baglantiUyarilari(
      baglanti({ tokenExpiresAt: new Date(SIMDI.getTime() - GUN) }),
      SIMDI,
    )[0];
    const yaklasan = baglantiUyarilari(
      baglanti({ tokenExpiresAt: new Date(SIMDI.getTime() + 3 * GUN) }),
      SIMDI,
    )[0];
    expect(dolmus?.siddet).toBe('error');
    expect(yaklasan?.siddet).toBe('warn');
    expect(yaklasan?.baslik).toContain('3 gün');
  });

  it('eşiğin ötesindeki token uyarı üretmiyor', () => {
    const uzak = new Date(SIMDI.getTime() + (TOKEN_UYARI_GUNU + 5) * GUN);
    expect(baglantiUyarilari(baglanti({ tokenExpiresAt: uzak }), SIMDI)).toEqual([]);
  });

  it('KRİTİK: uyarı AJANS seviyesinde — workspace/hesap kimliği taşımıyor', () => {
    /*
     * `clientId`/`adAccountId` null olmak zorunda: panel bandının gizleme
     * anahtarı `kod:adAccountId` ve hesap bazlı bir anahtar, "kapattım ama
     * geri geliyor" hâlinin ta kendisiydi. Tek satır = tek anahtar.
     */
    const [u] = baglantiUyarilari(baglanti({ status: 'needs_reauth' }), SIMDI);
    expect(u?.clientId).toBeNull();
    expect(u?.adAccountId).toBeNull();
  });

  it('KRİTİK: KAÇ HESABIN etkilendiği yazıyor', () => {
    // "Bir bağlantı koptu" ile "kırk hesabın verisi durdu" aynı aciliyette
    // değil ve farkı yalnızca bu sayı gösteriyor.
    const [u] = baglantiUyarilari(baglanti({ status: 'error', etkilenenHesap: 40 }), SIMDI);
    expect(u?.detay).toContain('40 hesabın');
  });

  it('KRİTİK: yaklaşan süre ELLE yetkilendirmeye ÇAĞIRMIYOR', () => {
    /*
     * Tazeleme eşiği uyarı penceresinden GENİŞ (10 gün > 7 gün), yani sistem
     * bu uyarı doğmadan önce denemiş oluyor. Metnin koşulsuz "bir dakikalık
     * iş" demesi, kullanıcıyı her gün gereksiz yere çağırmaktı.
     */
    const [u] = baglantiUyarilari(
      baglanti({ tokenExpiresAt: new Date(SIMDI.getTime() + 3 * GUN) }),
      SIMDI,
    );
    expect(u?.detay).toContain('kendi tazelemeye çalışıyor');
  });
});

describe('KRİTİK: hesap kuralları bağlantı hâlini TEKRARLAMIYOR', () => {
  /*
   * FİXTURE TETİKLENECEK BİR KURAL TAŞIMAK ZORUNDA — bu testi MUTASYON
   * yazdırdı. İlk yazımda yalnızca `connectionStatus: 'expired'` veriyordum
   * ve varsayılan fixture zaten hiç uyarı üretmiyordu: erken dönüşü
   * SİLDİĞİMDE de sonuç `[]` kalıyordu, yani iddia hiçbir şey tutmuyordu.
   *
   * `syncEnabled: false` eklenince fark ölçülebilir oluyor: erken dönüş
   * varsa `[]`, yoksa `hesap_izleme_kapali`.
   */
  it('bağlantı bozukken hesap seviyesinde HİÇ uyarı yok', () => {
    /*
     * Sebep bir üst seviyede bir kez söyleniyor. Burada da üretmek, tek bir
     * kopuk bağlantının onlarca "veri gelmiyor" satırı doğurması demekti —
     * hepsi doğru, hepsi aynı şeyi söylüyor.
     */
    expect(
      hesapUyarilari(hesap({ connectionStatus: 'expired', syncEnabled: false }), SIMDI),
    ).toEqual([]);
  });

  it('token uyarı penceresindeyken hesap seviyesinde HİÇ uyarı yok', () => {
    expect(
      hesapUyarilari(
        hesap({
          connectionTokenExpiresAt: new Date(SIMDI.getTime() + 3 * GUN),
          syncEnabled: false,
        }),
        SIMDI,
      ),
    ).toEqual([]);
  });

  it('BOŞA DÜŞME BEKÇİSİ: bağlantı sağlamken AYNI fixture uyarı üretiyor', () => {
    // Yukarıdaki iki iddia, `hesapUyarilari` her zaman boş dönseydi de
    // geçerdi — o hâlde bütün uyarı sistemi sessizce ölmüş olurdu.
    expect(hesapUyarilari(hesap({ syncEnabled: false }), SIMDI)[0]?.kod).toBe(
      'hesap_izleme_kapali',
    );
  });
});

describe('kurulum ve veri akışı', () => {
  it('izleme kapalıysa uyarı ve panelden çözülüyor', () => {
    const [u] = hesapUyarilari(hesap({ syncEnabled: false }), SIMDI);
    expect(u?.kod).toBe('hesap_izleme_kapali');
    expect(u?.eylem).not.toBeNull();
  });

  it('KRİTİK: "hiç gelmedi" ile "bayat" AYRI uyarılar', () => {
    /*
     * Birincisi kurulumun hiç tamamlanmadığı anlamına geliyor ve elle
     * tetiklemek çözüyor; ikincisi çalışan bir sistemin durduğu anlamına
     * geliyor. İkisini aynı cümleye indirmek, "atadım ama veri gelmiyor"
     * hâlinin sebebini gizlerdi.
     */
    expect(kodlar(hesap({ lastInsightsSyncAt: null }))).toEqual(['veri_hic_gelmedi']);
    const bayat = new Date(SIMDI.getTime() - (BAYAT_ESIGI_SAAT + 1) * SAAT);
    expect(kodlar(hesap({ lastInsightsSyncAt: bayat }))).toEqual(['veri_bayat']);
  });

  it('eşiğin altındaki gecikme uyarı üretmiyor', () => {
    const taze = new Date(SIMDI.getTime() - (BAYAT_ESIGI_SAAT - 1) * SAAT);
    expect(hesapUyarilari(hesap({ lastInsightsSyncAt: taze }), SIMDI)).toEqual([]);
  });
});

describe('öncelik: SEBEP yazılıyor, SONUÇ değil', () => {
  it('kapalı hesapta "veri gelmiyor" AYRICA yazılmıyor', () => {
    /*
     * Hesap platformda kapalıysa veri de gelmiyor ve ikisi de doğru — ama
     * ikincisi birincinin SONUCU. İkisini birden basmak sebebi gürültüye
     * boğuyor ve kullanıcı yanlış ekranda arıyor.
     */
    const k = kodlar(hesap({ status: 'disabled', raw: {}, lastInsightsSyncAt: null }));
    expect(k).toEqual(['hesap_platformda_kapali']);
  });

  it('ödeme sorunu bağlantı uyarısını da bastırıyor', () => {
    const k = kodlar(hesap({ raw: { account_status: 3 }, connectionStatus: 'expired' }));
    expect(k).toEqual(['hesap_odeme_sorunu']);
  });
});

describe('hesapsız workspace', () => {
  it('uyarı hesap satırı olmadan üretilebiliyor', () => {
    /*
     * Hesap döngüsünün üzerinden üretilemez: hiç hesabı olmayan müşterinin
     * hiç satırı yok ve sessizce uyarısız kalırdı — oysa "hiç veri
     * görünmüyor" hâllerinin en yaygın sebebi tam bu.
     */
    const u = hesapsizMusteriUyarisi({ id: 'c9', name: 'Yeni Firma' });
    expect(u.kod).toBe('musteride_hesap_yok');
    expect(u.adAccountId).toBeNull();
    expect(u.clientName).toBe('Yeni Firma');
  });
});

describe('sıralama', () => {
  it('error her zaman warn’un üstünde', () => {
    const sirali = siralaUyarilari([
      hesapsizMusteriUyarisi({ id: 'c1', name: 'A' }),
      hesapUyarilari(hesap({ raw: { account_status: 3 } }), SIMDI)[0]!,
    ]);
    expect(sirali[0]!.kod).toBe('hesap_odeme_sorunu');
  });

  it('KRİTİK: eşit şiddette sıra ALFABETİK DEĞİL, aciliyete göre', () => {
    /*
     * Alfabetik sıra "baglanti_yetki_istiyor"u "hesap_odeme_sorunu"nun üstüne
     * çıkarırdı; ikincisi reklamların şu anda durduğu anlamına geliyor.
     */
    const odeme = hesapUyarilari(hesap({ raw: { account_status: 3 } }), SIMDI)[0]!;
    const baglantiUyarisi = baglantiUyarilari(baglanti({ status: 'expired' }), SIMDI)[0]!;
    expect(siralaUyarilari([baglantiUyarisi, odeme]).map((u) => u.kod)).toEqual([
      'hesap_odeme_sorunu',
      'baglanti_yetki_istiyor',
    ]);
  });
});

describe('bayatlık görünür', () => {
  it('her hesap uyarısı verinin okunma anını taşıyor', () => {
    /*
     * Hesabın platformdaki durumu yalnızca hesap listesi tazelenirken
     * yazılıyor ve haftalarca eski kalabiliyor. Tarihi göstermeyen bir uyarı,
     * düzeltilmiş bir sorunu haftalarca ekranda tutar ve kullanıcı bütün
     * uyarılara güvenmeyi bırakır.
     */
    const [u] = hesapUyarilari(hesap({ raw: { account_status: 3 } }), SIMDI);
    expect(u?.veriZamani).toBe(new Date(SIMDI.getTime() - SAAT).toISOString());
  });
});
