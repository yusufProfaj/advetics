import { describe, expect, it } from 'vitest';
import type { BoostRequest, BoostSource } from '../provider.types';
import {
  buildBoostAdSetParams,
  instagramCreativeBody,
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
