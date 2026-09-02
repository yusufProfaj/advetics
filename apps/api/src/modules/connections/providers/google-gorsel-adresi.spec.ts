import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  GoogleProvider,
  gorselKaynakAdlari,
  varlikKimligi,
  KAYNAK_ADI_PARCASI,
} from './google.provider';

/**
 * ═══ GOOGLE GÖRÜNTÜLÜ REKLAMIN GÖRSEL ADRESİ ═══
 *
 * CANLIDA GÖRÜLEN HÂL: Google görüntülü reklamlarının görseli ne panelde ne
 * rapor PDF'inde çıkıyordu ve PDF dipnotunda "görseli alınamadı" yazıyordu —
 * yani YANLIŞ bir sebeple.
 *
 * KÖK SEBEP: `responsive_display_ad.marketing_images` bir adres döndürmüyor.
 * Her eleman `AdImageAsset` ve okunan `asset` alanı bir kaynak adı:
 * `customers/1234567890/assets/98765`. O değer de bir string olduğu için
 * `asset_urls`'e yazılıyor, `imageUrl`e geçiyor ve TRUTHY oluyordu; rapor
 * "görseli var ama indirilemedi" dalına giriyor, metin önizlemesine hiç
 * ulaşmıyor ve dipnottaki sayaç şişiyordu.
 *
 * `fetch` global olarak yamanıyor: `platformFetch` içeride onu çağırıyor ve
 * sağlayıcıya dışarıdan bir getirici verilemiyor.
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

function provider(): GoogleProvider {
  const config = {
    platforms: {
      google: {
        clientId: 'c',
        clientSecret: 's',
        developerToken: 'd',
        apiVersion: 'v20',
      },
    },
  };
  return new GoogleProvider(config as never);
}

const CTX = { accessToken: 'T', accountExternalId: '1234567890' };

const KAYNAK = 'customers/1234567890/assets/98765';
const ADRES = 'https://tpc.googlesyndication.com/simgad/98765';

/** Görüntülü reklam taşıyan `ad_group_ad` satırı. */
function displayAdSatiri(assetKaynaklari: string[] = [KAYNAK]): unknown {
  return {
    adGroupAd: {
      adGroup: 'customers/1234567890/adGroups/55',
      status: 'ENABLED',
      ad: {
        id: '777',
        name: 'Görüntülü',
        type: 'RESPONSIVE_DISPLAY_AD',
        responsiveDisplayAd: {
          headlines: [{ text: 'Başlık' }],
          descriptions: [{ text: 'Açıklama' }],
          marketingImages: assetKaynaklari.map((asset) => ({ asset })),
        },
      },
    },
  };
}

/** Arama reklamı — görsel varlığı YOK. */
const ARAMA_SATIRI = {
  adGroupAd: {
    adGroup: 'customers/1234567890/adGroups/55',
    status: 'ENABLED',
    ad: {
      id: '888',
      type: 'RESPONSIVE_SEARCH_AD',
      responsiveSearchAd: {
        headlines: [{ text: 'Arama başlığı' }],
        descriptions: [{ text: 'Arama açıklaması' }],
      },
    },
  },
};

/**
 * `fetchStructure` sırayla kampanya → ad group → reklam sorgusu atıyor;
 * sonrasında (ve YALNIZCA gerekiyorsa) `asset` sorgusu geliyor.
 *
 * Sorgu METNİNDEN hangi kaynağın istendiği okunuyor: çağrı SIRASINA göre
 * ayırmak, sorgu eklenip çıktığında testi sessizce yanlış yere bakar hâle
 * getirirdi.
 */
function sunucu(
  assetYaniti: unknown,
  adSatirlari: unknown[] = [displayAdSatiri()],
  assetDurumu = 200,
) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const sorgu = String(JSON.parse(String(init?.body ?? '{}')).query ?? '');
    if (sorgu.includes('FROM asset')) return YANIT(assetYaniti, assetDurumu);
    if (sorgu.includes('FROM ad_group_ad')) return YANIT({ results: adSatirlari });
    return YANIT({ results: [] });
  });
}

/**
 * Google'ın gerçek hata gövdesi.
 *
 * `asset` kaynağına erişim ayrı bir izin gerektirebiliyor ve bu, canlıda
 * karşılaşılması en olası hâl. Hatanın ham `Error` olarak fırlatılması
 * (ağ kopması) `platformFetch` içinde "Ağ hatası"na dönüşüyor ve platformun
 * KENDİ CÜMLESİNİ taşıyıp taşımadığımızı sınamıyor — asıl mesele o.
 */
const IZIN_HATASI = {
  error: {
    code: 403,
    status: 'PERMISSION_DENIED',
    message: "User doesn't have permission to access customer.",
  },
};

/** Sunucunun gördüğü GAQL sorguları. */
function sorgular(f: ReturnType<typeof sunucu>): string[] {
  return f.mock.calls.map((c) => String(JSON.parse(String(c[1]?.body ?? '{}')).query ?? ''));
}

const ASSET_YANITI = {
  results: [
    {
      asset: {
        resourceName: KAYNAK,
        imageAsset: { fullSize: { url: ADRES } },
      },
    },
  ],
};

let orijinalFetch: typeof fetch;

beforeEach(() => {
  orijinalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = orijinalFetch;
  vi.restoreAllMocks();
});

describe('gorselKaynakAdlari', () => {
  it('görüntülü reklamın pazarlama görsellerini SIRAYLA veriyor', () => {
    const ad = {
      responsiveDisplayAd: {
        marketingImages: [{ asset: 'a' }, { asset: 'b' }],
      },
    };
    expect(gorselKaynakAdlari(ad)).toEqual(['a', 'b']);
  });

  it('arama reklamında boş — görseli yok ve olmayacak', () => {
    expect(gorselKaynakAdlari({ responsiveSearchAd: { headlines: [] } })).toEqual([]);
  });

  it('bozuk eleman tüm listeyi düşürmüyor', () => {
    // Tek bozuk eleman yüzünden reklamın DİĞER görsellerini kaybetmek,
    // düzeltilen hatanın küçük bir kopyası olurdu.
    const ad = {
      responsiveDisplayAd: {
        marketingImages: [null, { asset: '' }, { asset: 'a' }],
      },
    };
    expect(gorselKaynakAdlari(ad)).toEqual(['a']);
  });
});

describe('varlikKimligi', () => {
  it('kaynak adından kimliği çıkarıyor', () => {
    expect(varlikKimligi(KAYNAK)).toBe('98765');
  });

  it('KRİTİK: beklenen kalıba uymayan değer SORGUYA GİRMİYOR', () => {
    /*
     * Kimlik GAQL metnine gömülüyor ve GAQL'in bağlı parametresi YOK.
     * "Platformdan geldi" güvenli demek değil: kalıba uymayan her değer
     * `null` dönmeli, yoksa sorgu metnine ne geldiği bize kalmıyor.
     */
    expect(varlikKimligi("customers/1/assets/1') OR 1=1 --")).toBeNull();
    expect(varlikKimligi('customers/1/assets/abc')).toBeNull();
    expect(varlikKimligi('customers/1/adGroups/2')).toBeNull();
    expect(varlikKimligi('98765')).toBeNull();
  });
});

describe('fetchStructure — görsel adresi', () => {
  it('KRİTİK: `assetUrls`e KAYNAK ADI değil GERÇEK ADRES yazılıyor', async () => {
    const f = sunucu(ASSET_YANITI);
    globalThis.fetch = f as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    expect(yapi.creatives).toHaveLength(1);
    expect(yapi.creatives[0]!.assetUrls).toEqual([ADRES]);
  });

  it('KRİTİK: adres çözülemezse kaynak adı YAZILMIYOR', async () => {
    /*
     * Yarım bir değer, hiç değer olmamasından kötü: kaynak adı `imageUrl`e
     * sızdığı anda rapor "görseli alınamadı" diyor ve metin önizlemesine hiç
     * ulaşmıyor. `undefined` gören rapor doğru dala giriyor.
     */
    const f = sunucu({ results: [] });
    globalThis.fetch = f as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    expect(yapi.creatives[0]!.assetUrls).toBeUndefined();
  });

  it('KRİTİK: ADRES OLMAYAN bir değer platformdan gelse de yazılmıyor', async () => {
    /*
     * Google bir gün bu alana adres olmayan bir şey koyarsa, hata yine
     * "kaynak adı adres sanıldı" hatasının aynısı olurdu.
     *
     * İKİ İDDİA ŞART VE İKİNCİSİ MUTASYONLA ÖĞRENİLDİ. Yalnızca `assetUrls`
     * boş mu diye bakmak, HARİTAYA giren değerin kontrolünü silen bir
     * mutasyonu kaçırıyordu: `mapGoogleCreative`in daraltma süzgeci onu yine
     * eliyor ve test yeşil kalıyordu. Sayaç notu haritanın İÇİNE bakıyor —
     * "1/1 çözüldü" derse harita çöp taşıyor demek ve o çöp bir gün başka bir
     * okuyucuya gider.
     */
    const f = sunucu({
      results: [
        {
          asset: {
            resourceName: KAYNAK,
            imageAsset: { fullSize: { url: KAYNAK } },
          },
        },
      ],
    });
    globalThis.fetch = f as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    expect(yapi.creatives[0]!.assetUrls).toBeUndefined();
    expect(yapi.notes?.join(' ')).toContain('0/1');
  });

  it('KRİTİK: kaynak adı YOKSA `asset` sorgusu HİÇ ATILMIYOR', async () => {
    /*
     * ÖNCE KONTROL, SONRA ÇAĞRI. Hesapların çoğu yalnızca arama reklamı
     * taşıyor; onlarda bu sorgu bedava değil, kotadan yeniyor. CLAUDE.md'de
     * kayıtlı kalıcı kilit, bağımlı bir işin ön koşulunun kotasını yemesiyle
     * oluşmuştu — maliyeti sıfır olan bir ret o zinciri koruyor.
     */
    const f = sunucu(ASSET_YANITI, [ARAMA_SATIRI]);
    globalThis.fetch = f as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    expect(sorgular(f).some((q) => q.includes('FROM asset'))).toBe(false);
    // Kampanya + ad group + reklam = üç sorgu, fazlası yok.
    expect(f).toHaveBeenCalledTimes(3);
    expect(yapi.apiCalls).toBe(3);
    /*
     * VE NOT DA YAZILMIYOR. Erken dönüş silinirse sorgu yine atılmıyor
     * (kimlik listesi boş) ama arama-only her hesapta "0 kaynak adının
     * kimliği okunamadı" gibi anlamsız bir not beliriyor. Her taramada duran
     * bir not okunmaz hâle gelir ve gerçek bir uyarı onun içinde kaybolur —
     * bu iddia da mutasyonla eklendi.
     */
    expect(yapi.notes).toBeUndefined();
  });

  it('KRİTİK: `asset` sorgusu YAPI TARAMASINI düşürmüyor', async () => {
    /*
     * Kampanya/ad group/reklam satırları her şeyin ön koşulu: metrikler
     * bunlara bağlanıyor ve yapı koşmazsa metrik işi satır çekip hiçbirini
     * yazamıyor. Kozmetik bir görsel adresi için o zinciri kaybetmek,
     * kazandığından çok kaybettirir.
     */
    const f = sunucu(IZIN_HATASI, [displayAdSatiri()], 403);
    globalThis.fetch = f as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    expect(yapi.ads).toHaveLength(1);
    expect(yapi.creatives[0]!.assetUrls).toBeUndefined();
    // Metin alanları etkilenmiyor: reklamın NE DEDİĞİ hâlâ raporda.
    expect(yapi.creatives[0]!.headline).toBe('Başlık');
  });

  it('KRİTİK: hata SESSİZ değil — PLATFORMUN CÜMLESİ `notes`e geçiyor', async () => {
    /*
     * Tek iz worker log'u olsaydı kimse bakmazdı. `notes` senkron durumu
     * ekranında `sync_jobs.note` olarak görünüyor.
     *
     * Ve orada "görsel adresi alınamadı" yazması YETMİYOR: bu projede bir
     * turu kaybettiren cümle tam olarak sebebi yutan cümleydi. İzin hatası
     * ile kota hatasının yapılacak işi farklı.
     */
    globalThis.fetch = sunucu(IZIN_HATASI, [displayAdSatiri()], 403) as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    expect(yapi.notes?.join(' ')).toContain("User doesn't have permission");
  });

  it('KRİTİK: SESSİZ KESME YOK — kaçının çözüldüğü yazılıyor', async () => {
    /*
     * "0/2" ile "2/2" arasındaki fark, sorgunun canlıda gerçekten
     * çalışıp çalışmadığını ilk bakışta söylüyor: bu satır aynı zamanda
     * doğrulama aracı. Sorgunun dönüş biçimi forum kayıtlarından yazıldı,
     * resmi bir referans sayfasından değil.
     */
    const ikinci = 'customers/1234567890/assets/11111';
    globalThis.fetch = sunucu(ASSET_YANITI, [
      displayAdSatiri([KAYNAK, ikinci]),
    ]) as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    expect(yapi.notes?.join(' ')).toContain('1/2');
    // Çözülen adres yine de yazılıyor: yarısını kaybetmek için sebep yok.
    expect(yapi.creatives[0]!.assetUrls).toEqual([ADRES]);
  });

  it('hepsi çözüldüyse NOT YAZILMIYOR — her taramada duran not okunmaz olur', async () => {
    globalThis.fetch = sunucu(ASSET_YANITI) as unknown as typeof fetch;
    const yapi = await provider().fetchStructure(CTX);
    expect(yapi.notes).toBeUndefined();
  });

  it('KRİTİK: sorgu kaynak adlarıyla SÜZÜLÜYOR — hesabın tüm görselleri değil', async () => {
    /*
     * Süzgeçsiz bir `FROM asset` sorgusu hesaba bir kez yüklenmiş HER
     * görseli döndürür; kullandığımız birkaç tanesi için binlercesini
     * çekmek hem boşuna hem de sayfalamayı büyütüyor.
     */
    const f = sunucu(ASSET_YANITI);
    globalThis.fetch = f as unknown as typeof fetch;

    await provider().fetchStructure(CTX);

    const assetSorgusu = sorgular(f).find((q) => q.includes('FROM asset'));
    expect(assetSorgusu, 'asset sorgusu atılmadı — tarama boşa düştü').toBeDefined();
    expect(assetSorgusu).toContain('asset.id IN (98765)');
    expect(assetSorgusu).toContain('asset.image_asset.full_size.url');
  });

  it('KRİTİK: aynı görsel iki reklamda kullanılıyorsa BİR KEZ soruluyor', async () => {
    const f = sunucu(ASSET_YANITI, [displayAdSatiri([KAYNAK, KAYNAK])]);
    globalThis.fetch = f as unknown as typeof fetch;

    await provider().fetchStructure(CTX);

    expect(sorgular(f).find((q) => q.includes('FROM asset'))).toContain('IN (98765)');
  });

  it('KRİTİK: uzun liste PARÇALANIYOR ve her parça `apiCalls`a sayılıyor', async () => {
    /*
     * Kimlikler sorgu METNİNE gömülüyor; sınırsız bir liste sorguyu
     * şişiriyor. Sayılmayan bir çağrı ise kota bekçisinin kendi ürettiği
     * trafiği görmemesi demek — bekçi varmış gibi görünüp korumayan bir
     * kurulum, hiç olmamasından kötü.
     */
    const kaynaklar = Array.from(
      { length: KAYNAK_ADI_PARCASI + 1 },
      (_, i) => `customers/1234567890/assets/${1000 + i}`,
    );
    const f = sunucu({ results: [] }, [displayAdSatiri(kaynaklar)]);
    globalThis.fetch = f as unknown as typeof fetch;

    const yapi = await provider().fetchStructure(CTX);

    const assetSorgulari = sorgular(f).filter((q) => q.includes('FROM asset'));
    expect(assetSorgulari).toHaveLength(2);
    // Üç yapı sorgusu + iki parça.
    expect(yapi.apiCalls).toBe(5);
  });
});
