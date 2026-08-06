import { describe, expect, it } from 'vitest';
import { mapMetaCreativeFields } from './meta.provider';

/**
 * Meta creative eşleme testleri.
 *
 * NEDEN BU TEST VAR: bu eşleme İKİ KEZ yanlış çıktı ve her ikisinde de hata
 * ancak canlı hesapta görüldü — birim testi olmadığı için.
 *
 *   1. Yalnızca `object_story_spec.link_data` okunuyordu. Mevcut bir sayfa
 *      gönderisinden üretilmiş creative'lerde `object_story_spec` GELİYOR ama
 *      içinde sadece `page_id`/`instagram_user_id` var — `link_data` yok.
 *      Sonuç: 22 creative'in hepsinde hedef URL ve CTA boş.
 *   2. `asset_feed_spec` dizilerinden değer çekerken yalnızca `text` anahtarına
 *      bakılıyordu. `link_urls` girişleri `{website_url, display_url}`
 *      biçiminde, `call_to_action_types` ise düz string dizisi.
 *
 * Aşağıdaki şekiller CANLI YANITTAN alındı (Ege Birlik Yapı hesabı).
 */

describe('mapMetaCreativeFields', () => {
  describe('sayfa gönderisinden üretilmiş creative (asset_feed_spec)', () => {
    // Canlı veride görülen şekil: object_story_spec var ama link_data YOK.
    const raw = {
      id: '120212345678901234',
      object_type: 'SHARE',
      effective_object_story_id: '525143394526475_1836790531057275',
      object_story_spec: {
        page_id: '525143394526475',
        instagram_user_id: '17841400000000000',
      },
      asset_feed_spec: {
        titles: [{ text: 'Ailenize Yeni Bir Yuva' }],
        bodies: [{ text: 'Kuşadası Davutlar’da denize 800m…' }],
        descriptions: [{ text: 'Sadece 20 villa' }],
        link_urls: [
          { website_url: 'https://egebirlikyapi.com/garden-villas', display_url: 'egebirlikyapi.com' },
        ],
        call_to_action_types: ['LEARN_MORE'],
      },
      image_url: 'https://scontent.example/img.jpg',
    };

    it('REGRESYON: hedef URL `website_url` anahtarından okunur', () => {
      const c = mapMetaCreativeFields('cr1', raw);
      expect(c.destinationUrl).toBe('https://egebirlikyapi.com/garden-villas');
    });

    it('REGRESYON: CTA `call_to_action_types` düz string dizisinden okunur', () => {
      expect(mapMetaCreativeFields('cr1', raw).ctaType).toBe('LEARN_MORE');
    });

    it('görünen URL `display_url` anahtarından okunur', () => {
      expect(mapMetaCreativeFields('cr1', raw).displayUrl).toBe('egebirlikyapi.com');
    });

    it('başlık, metin ve açıklama `text` anahtarından okunur', () => {
      const c = mapMetaCreativeFields('cr1', raw);
      expect(c.headline).toBe('Ailenize Yeni Bir Yuva');
      expect(c.primaryText).toContain('Kuşadası Davutlar');
      expect(c.description).toBe('Sadece 20 villa');
    });

    it('link_data olmadan da çökmez', () => {
      expect(() => mapMetaCreativeFields('cr1', raw)).not.toThrow();
    });
  });

  describe('elle yazılmış link reklamı (object_story_spec.link_data)', () => {
    const raw = {
      object_type: 'LINK',
      object_story_spec: {
        page_id: '1',
        link_data: {
          name: 'Başlık',
          message: 'Birincil metin',
          description: 'Açıklama',
          link: 'https://example.com/urun',
          caption: 'example.com',
          picture: 'https://img.example/p.jpg',
          call_to_action: { type: 'SHOP_NOW' },
        },
      },
    };

    it('link_data alanlarını okur', () => {
      const c = mapMetaCreativeFields('cr2', raw);
      expect(c.headline).toBe('Başlık');
      expect(c.primaryText).toBe('Birincil metin');
      expect(c.description).toBe('Açıklama');
      expect(c.destinationUrl).toBe('https://example.com/urun');
      expect(c.displayUrl).toBe('example.com');
      expect(c.ctaType).toBe('SHOP_NOW');
      expect(c.assetUrls).toEqual(['https://img.example/p.jpg']);
    });
  });

  describe('eski tekil creative (düz alanlar)', () => {
    const raw = {
      object_type: 'PHOTO',
      title: 'Düz başlık',
      body: 'Düz metin',
      link_url: 'https://example.com',
      call_to_action_type: 'SIGN_UP',
      image_url: 'https://img/a.jpg',
      thumbnail_url: 'https://img/t.jpg',
    };

    it('düz alanları okur ve tüm görselleri toplar', () => {
      const c = mapMetaCreativeFields('cr3', raw);
      expect(c.headline).toBe('Düz başlık');
      expect(c.destinationUrl).toBe('https://example.com');
      expect(c.ctaType).toBe('SIGN_UP');
      expect(c.assetUrls).toEqual(['https://img/a.jpg', 'https://img/t.jpg']);
    });
  });

  describe('öne çıkarılmış video gönderisi (hiçbir yapı yok)', () => {
    // Canlı veride görülen şekil: yalnızca body ve post kimliği var.
    const raw = {
      object_type: 'VIDEO',
      body: 'Garden Villas projemiz…',
      effective_object_story_id: '525143394526475_891201850280872',
      thumbnail_url: 'https://img/thumb.jpg',
    };

    it('metni okur, olmayan alanlar undefined kalır', () => {
      const c = mapMetaCreativeFields('cr4', raw);
      expect(c.primaryText).toBe('Garden Villas projemiz…');
      // Boost reklamında hedef URL GERÇEKTEN yok — link gönderinin içinde.
      expect(c.destinationUrl).toBeUndefined();
      expect(c.headline).toBeUndefined();
      expect(c.ctaType).toBeUndefined();
      expect(c.creativeType).toBe('VIDEO');
    });
  });

  describe('dayanıklılık', () => {
    it('boş nesne çökmez', () => {
      const c = mapMetaCreativeFields('cr5', {});
      expect(c.externalId).toBe('cr5');
      expect(c.headline).toBeUndefined();
      expect(c.assetUrls).toBeUndefined();
    });

    it('dizideki ilk giriş boşsa sonrakine bakar', () => {
      // Dinamik creative'lerde ilk varyasyonun bir alanı boş olabiliyor.
      const c = mapMetaCreativeFields('cr6', {
        asset_feed_spec: {
          titles: [{ text: '   ' }, { text: 'Gerçek başlık' }],
          link_urls: [{ display_url: 'x.com' }, { website_url: 'https://x.com/a' }],
        },
      });
      expect(c.headline).toBe('Gerçek başlık');
      expect(c.destinationUrl).toBe('https://x.com/a');
    });

    it('yalnızca boşluktan oluşan değerler undefined olur', () => {
      const c = mapMetaCreativeFields('cr7', { title: '   ', body: '\n\t' });
      expect(c.headline).toBeUndefined();
      expect(c.primaryText).toBeUndefined();
    });

    it('düz alan varsa asset_feed_spec’e düşmez — öncelik sırası korunur', () => {
      const c = mapMetaCreativeFields('cr8', {
        title: 'Öncelikli',
        asset_feed_spec: { titles: [{ text: 'İkincil' }] },
      });
      expect(c.headline).toBe('Öncelikli');
    });

    it('ham gövdeyi olduğu gibi saklar', () => {
      const raw = { object_type: 'SHARE', tuhaf_alan: 42 };
      expect(mapMetaCreativeFields('cr9', raw).raw).toBe(raw);
    });
  });
});
