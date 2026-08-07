import { describe, expect, it } from 'vitest';
import { mapOrganicPost, stripPagePrefix } from './meta.provider';

/**
 * Organik gönderi eşlemesi.
 *
 * NEDEN AYRI TEST: Facebook ve Instagram AYNI kavramlar için farklı alan
 * adları kullanıyor ve içgörüler `{name, values:[{value}]}` şeklinde iç içe
 * bir dizide geliyor. Yanlış eşleme sessiz: gönderi kaydedilir, metrikleri
 * sıfır olur ve boost kuralı hiçbir gönderiyi seçmez. Ajans "otomasyon
 * çalışmıyor" der, sebebi görünmez.
 *
 * Bu proje aynı hatayı Modül 4'te yaşadı: `object_story_spec` mevcuttu ama
 * içeriği `asset_feed_spec` içindeydi ve reklam metinleri boş geliyordu.
 */

describe('stripPagePrefix', () => {
  it('birleşik kimlikten sayfa önekini ayıklıyor', () => {
    // `object_story_id` her zaman `<page>_<post>` istiyor. Önek zaten varsa
    // ikinci kez eklemek `<page>_<page>_<post>` üretir ve Meta bunu
    // "gönderi bulunamadı" diye reddeder — hangi kimliğin yanlış olduğunu
    // da söylemez.
    expect(stripPagePrefix('123_456', '123')).toBe('456');
  });

  it('önek yoksa olduğu gibi bırakıyor', () => {
    expect(stripPagePrefix('456', '123')).toBe('456');
  });

  it('BENZER ama farklı sayfa kimliğini kesmiyor', () => {
    // '1234_56' kimliği '123' sayfasına ait DEĞİL; alt çizgi kontrolü
    // olmasaydı '4_56' gibi bozuk bir kimlik üretilirdi.
    expect(stripPagePrefix('1234_56', '123')).toBe('1234_56');
  });
});

describe('mapOrganicPost — Facebook', () => {
  const fbRow = {
    id: '123_456',
    message: 'Yeni projemiz yayında',
    permalink_url: 'https://facebook.com/123_456',
    full_picture: 'https://cdn/pic.jpg',
    created_time: '2026-08-05T09:00:00+0000',
    attachments: { data: [{ media_type: 'photo' }] },
    shares: { count: 12 },
    likes: { summary: { total_count: 340 } },
    comments: { summary: { total_count: 27 } },
    insights: {
      data: [
        { name: 'post_impressions', values: [{ value: 18_500 }] },
        { name: 'post_impressions_unique', values: [{ value: 12_400 }] },
        { name: 'post_video_views', values: [{ value: 0 }] },
      ],
    },
  };

  it('tüm alanları doğru okuyor', () => {
    const post = mapOrganicPost(fbRow, false);
    expect(post).not.toBeNull();
    expect(post!.externalId).toBe('123_456');
    expect(post!.mediaType).toBe('photo');
    expect(post!.message).toBe('Yeni projemiz yayında');
    expect(post!.likes).toBe(340);
    expect(post!.comments).toBe(27);
    expect(post!.shares).toBe(12);
    expect(post!.impressions).toBe(18_500);
    expect(post!.reach).toBe(12_400);
  });

  it('İÇGÖRÜLER ADA GÖRE okunuyor, sıraya göre değil', () => {
    // Meta alan sırasını garanti etmiyor. Diziyi indeksle okumak, sıra
    // değiştiği gün erişimi gösterim sanmak demek — ve bu sessiz.
    const shuffled = {
      ...fbRow,
      insights: {
        data: [
          { name: 'post_video_views', values: [{ value: 5 }] },
          { name: 'post_impressions_unique', values: [{ value: 12_400 }] },
          { name: 'post_impressions', values: [{ value: 18_500 }] },
        ],
      },
    };
    const post = mapOrganicPost(shuffled, false);
    expect(post!.impressions).toBe(18_500);
    expect(post!.reach).toBe(12_400);
    expect(post!.videoViews).toBe(5);
  });

  it('video eki video olarak sınıflanıyor', () => {
    const post = mapOrganicPost(
      { ...fbRow, attachments: { data: [{ media_type: 'video' }] } },
      false,
    );
    expect(post!.mediaType).toBe('video');
  });

  it('eksik içgörü SIFIR sayılıyor, gönderi düşmüyor', () => {
    // Yeni bir gönderinin içgörüsü henüz gelmemiş olabilir. Gönderiyi
    // tamamen atlamak, birkaç saat sonra boost adayı olacak içeriği
    // görünmez kılardı.
    const post = mapOrganicPost({ ...fbRow, insights: undefined }, false);
    expect(post).not.toBeNull();
    expect(post!.impressions).toBe(0);
    expect(post!.reach).toBe(0);
  });
});

describe('mapOrganicPost — Instagram', () => {
  const igRow = {
    id: '17900000000000000',
    media_type: 'CAROUSEL_ALBUM',
    caption: 'Proje turu',
    permalink: 'https://instagram.com/p/abc',
    thumbnail_url: 'https://cdn/thumb.jpg',
    timestamp: '2026-08-05T09:00:00+0000',
    like_count: 890,
    comments_count: 45,
    insights: {
      data: [
        { name: 'impressions', values: [{ value: 42_000 }] },
        { name: 'reach', values: [{ value: 31_000 }] },
        { name: 'saved', values: [{ value: 210 }] },
      ],
    },
  };

  it('Instagram alan adlarını okuyor', () => {
    const post = mapOrganicPost(igRow, true);
    expect(post!.mediaType).toBe('carousel');
    expect(post!.message).toBe('Proje turu');
    expect(post!.likes).toBe(890);
    expect(post!.comments).toBe(45);
    expect(post!.saves).toBe(210);
    expect(post!.impressions).toBe(42_000);
    expect(post!.reach).toBe(31_000);
  });

  it('Instagram PAYLAŞIM raporlamıyor — sıfır', () => {
    // Ölçülmemiş olanı sıfır saymak bu projede raporlarda kaçınılan hata;
    // burada sıfır DOĞRU çünkü Instagram bu metriği hiç vermiyor ve
    // gönderiyi seçim ölçütünde paylaşım kullanmak Instagram'da anlamsız.
    expect(mapOrganicPost(igRow, true)!.shares).toBe(0);
  });

  it('Facebook KAYDETME raporlamıyor — sıfır', () => {
    const post = mapOrganicPost(
      { id: '1_2', created_time: '2026-08-05T09:00:00+0000', message: 'x' },
      false,
    );
    expect(post!.saves).toBe(0);
  });
});

describe('dayanıklılık — bozuk satır senkronizasyonu düşürmemeli', () => {
  it('kimliksiz satır atlanıyor', () => {
    expect(mapOrganicPost({ message: 'x' }, false)).toBeNull();
  });

  it('GEÇERSİZ TARİH atlanıyor', () => {
    // Tarihsiz bir gönderi yaş penceresine sokulamaz; `Invalid Date` ile
    // devam etmek, yaş hesabını NaN yapar ve tüm karşılaştırmalar false
    // döner — kural sessizce hiçbir şey seçmez.
    expect(mapOrganicPost({ id: '1', created_time: 'bozuk' }, false)).toBeNull();
    expect(mapOrganicPost({ id: '1' }, false)).toBeNull();
  });

  it('NEGATİF ve sayısal olmayan metrikler sıfırlanıyor', () => {
    const post = mapOrganicPost(
      {
        id: '1_2',
        created_time: '2026-08-05T09:00:00+0000',
        likes: { summary: { total_count: -5 } },
        comments: { summary: { total_count: 'çok' } },
        insights: { data: [{ name: 'post_impressions', values: [{ value: null }] }] },
      },
      false,
    );
    expect(post!.likes).toBe(0);
    expect(post!.comments).toBe(0);
    expect(post!.impressions).toBe(0);
  });

  it('içgörü dizisi değilse çökmüyor', () => {
    const post = mapOrganicPost(
      { id: '1_2', created_time: '2026-08-05T09:00:00+0000', insights: 'bozuk' },
      false,
    );
    expect(post!.impressions).toBe(0);
  });
});
