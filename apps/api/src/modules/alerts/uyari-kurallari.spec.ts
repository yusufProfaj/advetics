import { describe, expect, it } from 'vitest';
import {
  BAYAT_ESIGI_SAAT,
  TOKEN_UYARI_GUNU,
  googleHesapDurumu,
  hesapUyarilari,
  hesapsizMusteriUyarisi,
  metaHesapDurumu,
  siralaUyarilari,
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

describe('bağlantı', () => {
  it('bağlantı aktif değilse yeniden yetki uyarısı', () => {
    const [u] = hesapUyarilari(hesap({ connectionStatus: 'expired' }), SIMDI);
    expect(u?.kod).toBe('baglanti_yetki_istiyor');
    expect(u?.eylem?.href).toBe('/ayarlar/baglantilar');
  });

  it('token süresi DOLMUŞSA error, DOLMAK ÜZEREYSE warn', () => {
    /*
     * İkisini aynı şiddetle göstermek "bugün hallet" ile "bu hafta hallet"i
     * aynı yapardı ve bant her gün aynı kırmızıyı gösterirdi — okunmaz hâle
     * gelen bir uyarı, olmayan bir uyarıyla aynı.
     */
    const dolmus = hesapUyarilari(
      hesap({ connectionTokenExpiresAt: new Date(SIMDI.getTime() - GUN) }),
      SIMDI,
    )[0];
    const yaklasan = hesapUyarilari(
      hesap({ connectionTokenExpiresAt: new Date(SIMDI.getTime() + 3 * GUN) }),
      SIMDI,
    )[0];
    expect(dolmus?.siddet).toBe('error');
    expect(yaklasan?.siddet).toBe('warn');
    expect(yaklasan?.baslik).toContain('3 gün');
  });

  it('eşiğin ötesindeki token uyarı üretmiyor', () => {
    const uzak = new Date(SIMDI.getTime() + (TOKEN_UYARI_GUNU + 5) * GUN);
    expect(hesapUyarilari(hesap({ connectionTokenExpiresAt: uzak }), SIMDI)).toEqual([]);
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

describe('hesapsız müşteri', () => {
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
    const baglanti = hesapUyarilari(hesap({ connectionStatus: 'expired' }), SIMDI)[0]!;
    expect(siralaUyarilari([baglanti, odeme]).map((u) => u.kod)).toEqual([
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
