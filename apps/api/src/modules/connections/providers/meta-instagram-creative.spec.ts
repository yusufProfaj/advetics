import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlatformApiError } from '../provider.types';
import type { BoostRequest, BoostSource } from '../provider.types';
import {
  buildBoostAdSetParams,
  decideInstagramCreativeCheck,
  instagramCreativeBody,
  labelBoostError,
  instagramPlacements,
} from './meta.provider';

/**
 * INSTAGRAM BOOST KREATİFİ — K17'nin alan seti.
 *
 * NEDEN BU TESTLER: buradaki her alan adı YANLIŞ OLABİLİRDİ ve yanlış olduğu
 * hiçbir yerde görünmezdi. Meta bir alanı kabul edip sessizce yok sayıyor; o
 * zaman boost oluşur, para harcar ve YANLIŞ gönderiyi gösterir. Alan seti iki
 * bağımsız kaynaktan çapraz doğrulandı ve yalnızca ikisinin de desteklediği
 * alanlar gönderiliyor.
 *
 * ÜÇ KİMLİK UZAYI VAR ve karıştırılması bu işin başlangıç noktasıydı:
 *
 *   · `object_id`                  → FACEBOOK SAYFA kimliği
 *   · `instagram_user_id`          → IG Business Account kimliği
 *   · `source_instagram_media_id`  → `/{ig-user}/media` → `id`
 *
 * Testler bu üçünün BİRBİRİNİN YERİNE geçmediğini kilitliyor.
 */

const IG: Extract<BoostSource, { surface: 'instagram' }> = {
  surface: 'instagram',
  pageExternalId: '345736801957026',
  instagramUserId: '17841457593418725',
  mediaExternalId: '17895695668004550',
  mediaType: 'photo',
};

describe('instagramCreativeBody', () => {
  it('KRİTİK: üç kimlik doğru alanlara yazılıyor', () => {
    const b = instagramCreativeBody(IG, 'Boost');
    expect(b.object_id).toBe('345736801957026');
    expect(b.instagram_user_id).toBe('17841457593418725');
    expect(b.source_instagram_media_id).toBe('17895695668004550');
  });

  it('KRİTİK: `object_id` SAYFA kimliği — IG hesabı ya da medya DEĞİL', () => {
    // Alanın genel tanımı "tanıtılan Facebook nesnesi" ve tam bu yüzden
    // karıştırılmaya açık. Instagram boost yolunda buraya sayfa yazılıyor.
    const b = instagramCreativeBody(IG, 'Boost');
    expect(b.object_id).not.toBe(IG.instagramUserId);
    expect(b.object_id).not.toBe(IG.mediaExternalId);
  });

  it('KRİTİK: `object_story_id` HİÇ gönderilmiyor', () => {
    // O biçim (`{sayfa}_{gönderi}`) Facebook sayfa gönderisine ait ve
    // Instagram medyasında geçersiz. Bu işin başlangıç hatası tam olarak
    // buydu: IG kullanıcı kimliği sayfa kimliği sanılıp o dizge kuruluyordu.
    expect(instagramCreativeBody(IG, 'Boost').object_story_id).toBeUndefined();
  });

  it('KRİTİK: `object_story_spec` HİÇ gönderilmiyor', () => {
    // `source_instagram_media_id` o nesnenin alan listesinde YOK — içine
    // yazmak imkânsız. `object_story_spec` sıfırdan yayınlanmamış gönderi
    // yaratma yolunun aracı; var olan gönderiyi boost etmenin değil.
    expect(instagramCreativeBody(IG, 'Boost').object_story_spec).toBeUndefined();
  });

  it('KALDIRILMIŞ ALAN ADLARI kullanılmıyor', () => {
    // `instagram_actor_id` v22.0'da kaldırıldı, `instagram_story_id` yerine
    // `source_instagram_media_id` geldi. Eski adlarla yazılan kod bugün
    // hiçbir sürümde çalışmıyor.
    const b = instagramCreativeBody(IG, 'Boost');
    expect(b.instagram_actor_id).toBeUndefined();
    expect(b.instagram_story_id).toBeUndefined();
    expect(b.legacy_instagram_media_id).toBeUndefined();
  });

  it('SALT OKUNUR alan POST edilmiyor', () => {
    // `effective_instagram_media_id` yalnızca GET'te dönüyor ve doğrulama
    // için okunuyor; göndermek geçersiz parametre demek.
    expect(
      instagramCreativeBody(IG, 'Boost').effective_instagram_media_id,
    ).toBeUndefined();
  });

  it('DOĞRULANMAMIŞ ALANLAR bilerek dışarıda', () => {
    /*
     * Üçü de tek kaynaktan geliyor ya da kaynağın kendisi "kanıtlayamadım"
     * diyor. `enroll_status` ayrıca OPT_IN olduğunda organik gönderinin
     * GÖRÜNÜMÜNÜ değiştiriyor ve boost'un amacı gönderiyi olduğu gibi öne
     * çıkarmak. Meta hata verirse OPT_OUT ile eklenecek.
     */
    const b = instagramCreativeBody(IG, 'Boost');
    expect(b.call_to_action).toBeUndefined();
    expect(b.degrees_of_freedom_spec).toBeUndefined();
    expect(b.instagram_permalink_url).toBeUndefined();
  });

  it('kreatif ADLANDIRILIYOR — Ads Manager’da bulunabilsin', () => {
    // Ad verilmezse Meta otomatik üretiyor ve aynı gönderiden çıkan beş
    // kreatif birbirinden ayırt edilemiyor.
    expect(instagramCreativeBody(IG, 'Boost — gönderi')).toMatchObject({
      name: 'Boost — gönderi — kreatif',
    });
  });
});

describe('instagramPlacements', () => {
  it('KRİTİK: yerleşim Instagram’a kilitli', () => {
    // IG medyasından üretilen kreatifin Facebook akışında karşılığı yok;
    // platform verilmezse Meta oraya da dağıtmayı deniyor.
    expect(instagramPlacements('photo').publisher_platforms).toEqual(['instagram']);
  });

  it('reel REELS yerleşimine, diğerleri AKIŞA gidiyor', () => {
    expect(instagramPlacements('reel').instagram_positions).toEqual(['reels']);
    expect(instagramPlacements('photo').instagram_positions).toEqual(['stream']);
    expect(instagramPlacements('video').instagram_positions).toEqual(['stream']);
    expect(instagramPlacements('carousel').instagram_positions).toEqual(['stream']);
  });

  it('KRİTİK: yerleşim BOŞ BIRAKILMIYOR', () => {
    // Boş bırakmak "bütün Instagram yerleşimleri" demek: akış fotoğrafı
    // Reels'te kırpılıp kötü görünüyor ve sebebi hiçbir yerde yazmıyor.
    const p = instagramPlacements('photo');
    expect(p.instagram_positions.length).toBeGreaterThan(0);
  });
});

describe('ad set — Instagram yerleşimi hedeflemeye giriyor', () => {
  const NOW = new Date('2026-08-17T12:00:00.000Z');

  function req(source: BoostSource): BoostRequest {
    return {
      adAccountExternalId: '123',
      source,
      budget: { mode: 'lifetime', totalMicros: 300_000_000n },
      durationDays: 5,
      objective: 'OUTCOME_ENGAGEMENT',
      currency: 'TRY',
      name: 'Boost',
    };
  }

  it('KRİTİK: Instagram boost’unda yerleşim hedefleme nesnesinde', () => {
    const p = buildBoostAdSetParams(req(IG), 'c-1', NOW);
    const t = JSON.parse(p.targeting!);
    expect(t.publisher_platforms).toEqual(['instagram']);
    expect(t.instagram_positions).toEqual(['stream']);
    // Lokasyon hedeflemesi KAYBOLMUYOR: yerleşim ona eklendi, onu değiştirmedi.
    expect(t.geo_locations).toEqual({ countries: ['TR'] });
  });

  it('KRİTİK: Facebook boost’unda yerleşim GÖNDERİLMİYOR', () => {
    // §3 — çalışan davranış bozulmuyor. Facebook yolunda yerleşim baştan beri
    // verilmiyordu ve verilmeye başlamak, bugün çalışan boost'ların dağıtımını
    // sessizce değiştirmek olurdu.
    const p = buildBoostAdSetParams(
      req({ surface: 'facebook_page', pageExternalId: 'page-1', postExternalId: 'post-1' }),
      'c-1',
      NOW,
    );
    const t = JSON.parse(p.targeting!);
    expect(t.publisher_platforms).toBeUndefined();
    expect(t.instagram_positions).toBeUndefined();
  });

  it('reel boost’u REELS yerleşimiyle gidiyor', () => {
    const p = buildBoostAdSetParams(req({ ...IG, mediaType: 'reel' }), 'c-1', NOW);
    expect(JSON.parse(p.targeting!).instagram_positions).toEqual(['reels']);
  });
});

/**
 * KREATİF DOĞRULAMASININ KARARI — K17'nin çekincesinin kod karşılığı.
 *
 * Canlıda tam olarak beklenen belirsizlik çıktı: gönderilen 18090331100389207,
 * Meta'nın `effective` olarak döndürdüğü 18117166231898791. İki ihtimal vardı
 * ve ayırt edilmeden karar verilemezdi — Meta başka bir gönderi mi kullandı,
 * yoksa `effective` alanı başka bir kimlik uzayında mı raporlanıyor.
 *
 * Karar bu yüzden BENZERİ BENZERLE karşılaştırıyor: `source_instagram_media_id`
 * yankısı aynı uzayda ve sorulan soruyu tam olarak cevaplıyor.
 */
describe('decideInstagramCreativeCheck', () => {
  const SENT = '18090331100389207';

  it('yankı BİREBİR eşleşiyorsa geçiyor', () => {
    expect(decideInstagramCreativeCheck({ sent: SENT, echo: SENT })).toEqual({
      verdict: 'ok',
    });
  });

  it('KRİTİK: yankı FARKLIYSA reddediyor — para harcanmıyor', () => {
    // Aynı alanı geri okumak aynı uzayda karşılaştırmak demek; farklıysa Meta
    // gerçekten başka bir medya kaydetmiş.
    const k = decideInstagramCreativeCheck({ sent: SENT, echo: '99999999999999999' });
    expect(k.verdict).toBe('reject');
    expect(k.verdict === 'reject' && k.message).toMatch(/YANLIŞ gönderiye bağlandı/);
  });

  it('KRİTİK: `effective` farkı ENGEL DEĞİL, uyarı', () => {
    /*
     * Canlıda görülen tam durum. Engel yapmak, çalışan bir yolu doğrulanmamış
     * bir varsayım (iki alanın aynı kimlik uzayında olduğu) yüzünden kapatmak
     * olurdu. Ama sessiz de kalmıyor: uyarı, gözle doğrulamanın neye bakacağını
     * söylüyor.
     */
    const k = decideInstagramCreativeCheck({
      sent: SENT,
      echo: SENT,
      effective: '18117166231898791',
    });
    expect(k.verdict).toBe('warn');
    expect(k.verdict === 'warn' && k.message).toMatch(/kimlik uzayı farkı/);
    expect(k.verdict === 'warn' && k.message).toMatch(/gözle doğrulanmalı/);
  });

  it('yankı HİÇ dönmezse uyarı — engel değil', () => {
    // `fields` ile istenmediğinde dönmüyor ve gecikmeli dolabiliyor; yokluğunu
    // "yanlış" saymak sebepsiz engel olurdu.
    const k = decideInstagramCreativeCheck({ sent: SENT });
    expect(k.verdict).toBe('warn');
    expect(k.verdict === 'warn' && k.message).toMatch(/doğrulama yapılamadı/);
  });

  it('KRİTİK: yankı yanlışsa `effective` doğru olsa bile REDDEDİYOR', () => {
    // Sıra önemli: yanlış kayıt, doğru görünen bir ikinci alanla aklanmıyor.
    expect(
      decideInstagramCreativeCheck({ sent: SENT, echo: 'baska', effective: SENT }).verdict,
    ).toBe('reject');
  });
});

/**
 * HEDEF TÜRÜ — boost'u öldüren eksik alan.
 *
 * İlk canlı deneme *"Eylem Çağrısı Gerekiyor · Kampanya amacınız için harici
 * bir internet sitesi URL'si gerekiyor"* (subcode 2446383) ile reddedildi.
 * Sebebi gönderdiğimiz yanlış bir değer DEĞİL, hiç göndermediğimiz bir alandı:
 * `destination_type` verilmediğinde Meta hedefi kendi çözüyor ve harici bir
 * siteye düşüyor. Boost'ta harici URL yok — kullanıcı var olan gönderiyi öne
 * çıkarıyor.
 *
 * Bu, CLAUDE.md'deki "platformun varsayılanına güvenme" kuralının birebir
 * karşılığı: alanı göndermemek, kararı hesabın ayarına bırakmak demek.
 */
describe('ad set — hedef türü', () => {
  const NOW = new Date('2026-08-17T12:00:00.000Z');

  function req(source: BoostSource): BoostRequest {
    return {
      adAccountExternalId: '123',
      source,
      budget: { mode: 'lifetime', totalMicros: 300_000_000n },
      durationDays: 5,
      objective: 'OUTCOME_ENGAGEMENT',
      currency: 'TRY',
      name: 'Boost',
    };
  }

  const FB: BoostSource = {
    surface: 'facebook_page',
    pageExternalId: 'page-1',
    postExternalId: 'post-1',
  };

  it('KRİTİK: Instagram boost’unda `destination_type: ON_POST` gidiyor', () => {
    expect(buildBoostAdSetParams(req(IG), 'c-1', NOW).destination_type).toBe('ON_POST');
  });

  it('KRİTİK: Facebook boost’unda DA gidiyor', () => {
    /*
     * Yerleşim kararının TERSİ ve bilinçli. Yerleşimde korunacak çalışan bir
     * davranış vardı; burada yok — Facebook boost'u aynı amacı ve aynı
     * optimizasyonu kullanıyor, yani App Review açıldığı gün aynı hataya
     * düşerdi ve hata ikinci kez baştan bulunurdu.
     */
    expect(buildBoostAdSetParams(req(FB), 'c-1', NOW).destination_type).toBe('ON_POST');
  });

  it('hedef, POST_ENGAGEMENT optimizasyonuyla birlikte gidiyor', () => {
    // İkisi bir arada anlamlı: "gönderinin üzerinde kal" + "etkileşime göre
    // optimize et". Biri değişirse diğeri de değişmek zorunda.
    const p = buildBoostAdSetParams(req(IG), 'c-1', NOW);
    expect(p.optimization_goal).toBe('POST_ENGAGEMENT');
    expect(p.destination_type).toBe('ON_POST');
  });

  it('KRİTİK: harici bir link ALANI HİÇ gönderilmiyor', () => {
    // Meta'nın mesajı "bir internet sitesi URL'si girin" diyor ama doğru çözüm
    // uydurma bir URL göndermek DEĞİL: o, kullanıcının gönderisini tanıtmak
    // yerine bir siteye trafik göndermek olurdu ve tıklayan kişi gönderiyi
    // hiç görmezdi.
    const p = buildBoostAdSetParams(req(IG), 'c-1', NOW);
    expect(p.link).toBeUndefined();
    expect(p.link_url).toBeUndefined();
  });
});

/**
 * HATA HANGİ ADIMDA ÇIKTI — teşhisi tahminden çıkarıyor.
 *
 * `destination_type` hatası tam bu yüzden ilk turda yanlış yere bağlandı:
 * Meta'nın metni "reklam kreatifi kısmında bir eylem çağrısı seçin" diyordu,
 * oysa eksik olan ad set alanıydı.
 */
describe('labelBoostError', () => {
  it('adım adı hata metninin ÖNÜNE geliyor', () => {
    const e = labelBoostError(
      'Ad set oluşturulurken',
      new PlatformApiError('meta', 'permanent', 'Invalid parameter'),
    );
    expect((e as Error).message).toBe('Ad set oluşturulurken: Invalid parameter');
  });

  it('KRİTİK: `kind` KORUNUYOR — kalıcı hata yeniden denenmiyor', () => {
    // `retryable` doğrudan `kind`'a bakıyor. Sarma sırasında `permanent`
    // kaybolsa boost sonsuza kadar yeniden denenirdi.
    const e = labelBoostError(
      'Reklam oluşturulurken',
      new PlatformApiError('meta', 'permanent', 'x'),
    ) as PlatformApiError;
    expect(e.kind).toBe('permanent');
    expect(e.retryable).toBe(false);

    const t = labelBoostError(
      'Reklam oluşturulurken',
      new PlatformApiError('meta', 'transient', 'y'),
    ) as PlatformApiError;
    expect(t.retryable).toBe(true);
  });

  it('KRİTİK: `detail` KORUNUYOR — subcode olmadan hata aranamıyor', () => {
    const e = labelBoostError(
      'Ad set oluşturulurken',
      new PlatformApiError('meta', 'permanent', 'x', { platformSubcode: 2446383 }),
    ) as PlatformApiError;
    expect(e.detail?.platformSubcode).toBe(2446383);
  });

  it('KRİTİK: platform hatası OLMAYAN hata OLDUĞU GİBİ geçiyor', () => {
    // Sarmak, üstteki `instanceof` ayrımlarını (örneğin transaction hatası)
    // bozardı — 6c'de tam o ayrım yüzünden kayıt `creating` bırakılıyor.
    const raw = new Error('Transaction already closed');
    expect(labelBoostError('Reklam oluşturulurken', raw)).toBe(raw);
  });
});

/**
 * KAYNAK TARAMASI — etiketin BAĞLANDIĞINI kilitliyor.
 *
 * `labelBoostError`'ın kendisi test edilmiş olması bir şey ifade etmiyor:
 * `createBoost` onu çağırmayı bırakırsa bütün birim testleri geçmeye devam
 * eder ve hata yine hangi adımda çıktığını söylemez. Bu boşluk mutasyonla
 * bulundu — etiketleme kaldırıldığında 27 testin hepsi geçiyordu.
 *
 * Tarama ayrıca ALTINCI ÇAĞRIYI da yakalıyor: biri boost'a yeni bir Meta
 * çağrısı ekleyip `adim`'i güncellemezse, o çağrının hatası önceki adımın
 * adıyla raporlanır — yanlış teşhis, hiç teşhis olmamasından kötü.
 */
describe('createBoost — adım etiketlemesi kaynakta bağlı', () => {
  const SOURCE = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');

  /** `createBoost` gövdesini SÜSLÜ PARANTEZ EŞLEŞTİREREK çıkarıyor. */
  const GOVDE = (() => {
    const imza = 'async createBoost(ctx: FetchContext, request: BoostRequest)';
    const bas = SOURCE.indexOf(imza);
    if (bas < 0) throw new Error('createBoost bulunamadı — tarama boşa düşer');
    let i = SOURCE.indexOf('{', bas);
    let derinlik = 0;
    for (let j = i; j < SOURCE.length; j++) {
      if (SOURCE[j] === '{') derinlik++;
      else if (SOURCE[j] === '}') {
        derinlik--;
        if (derinlik === 0) return SOURCE.slice(i, j + 1);
      }
    }
    throw new Error('createBoost gövdesi kapanmadı');
  })();

  it('tarama BOŞA DÜŞMÜYOR — gövde gerçekten yakalandı', () => {
    /*
     * Bu testin kendisi zorunlu. Daha önce bir kaynak taramasında dilim
     * metodu imzasından hemen sonra kesiyordu ve tarama HER ŞEYİ geçiriyordu.
     * Boş bir dilimde "yasak dizge yok" iddiası her zaman doğrudur.
     */
    expect(GOVDE.length).toBeGreaterThan(1200);
    expect(GOVDE).toContain('/campaigns');
    expect(GOVDE).toContain('/adsets');
    expect(GOVDE).toContain('/ads');
    expect(GOVDE).toContain('catch');
  });

  it('KRİTİK: hata `labelBoostError` ile fırlatılıyor', () => {
    expect(GOVDE).toContain('throw labelBoostError(adim, err)');
  });

  it('KRİTİK: ÇIPLAK `throw err` kalmadı', () => {
    // Geri alma bloğundan sonra çıplak fırlatmak, etiketi sessizce atlamak.
    expect(GOVDE).not.toMatch(/throw err\s*;/);
  });

  it('KRİTİK: her platform çağrısının ÖNÜNDE bir adım ataması var', () => {
    /*
     * Sayı karşılaştırması bilinçli: çağrı eklenip etiket eklenmediğinde
     * düşmesi gereken tek koruma bu. Beş çağrı var (kampanya, ad set,
     * kreatif, reklam, kampanyayı yayına alma) ve Instagram dalında bir de
     * doğrulama; ilk atama `try`'dan önce yapıldığı için `adim = ` sayısı
     * çağrı sayısına eşit ya da fazla olmak zorunda.
     */
    const cagri = (GOVDE.match(/await this\.graphPost|await this\.assertInstagramCreative/g) ?? [])
      .length;
    const etiket = (GOVDE.match(/adim = '/g) ?? []).length;
    expect(cagri).toBeGreaterThanOrEqual(5);
    expect(etiket).toBeGreaterThanOrEqual(cagri);
  });
});
