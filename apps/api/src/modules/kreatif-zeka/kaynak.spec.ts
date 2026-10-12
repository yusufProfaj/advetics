import { describe, expect, it } from 'vitest';
import { KAYNAK_ANAHTARI_DESENI } from '@advetics/shared';
import { gorselBoyutu } from './gorsel-boyutu';
import { kreatifKaynagi } from './kaynak';
import { png } from '../../../test/kreatif-tohum';

/**
 * Kaynak anahtarı ve kapsam: platform aynasının GERÇEK biçimleri
 * (`mapMetaCreativeFields` raw = creative nesnesi; Google raw = ad nesnesi).
 */

const ID = '00000000-0000-4000-8000-0000000000aa';
const k = (o: Partial<Parameters<typeof kreatifKaynagi>[0]>) =>
  kreatifKaynagi({ creativeId: ID, platform: 'meta', creativeType: null, raw: {}, assetUrls: null, kanal: 'OUTCOME_SALES', hesapExternalId: 'act_123', ...o });

describe('Meta', () => {
  it('KRİTİK: image_hash HESAPLA birlikte anahtar (hash hesap başına), act_ öneki atılıyor', () => {
    const r = k({ raw: { object_story_spec: { link_data: { image_hash: 'ABCDEF12' } } } });
    expect(r).toEqual({ tur: 'gorsel', kaynakAnahtari: 'meta:img:123:abcdef12', bicim: 'gorsel', kismi: null });
    expect(KAYNAK_ANAHTARI_DESENI.test((r as { kaynakAnahtari: string }).kaynakAnahtari)).toBe(true);
  });

  it('asset_feed_spec görseli; video kapağı; karuselde ilk kart', () => {
    expect(k({ raw: { asset_feed_spec: { images: [{ hash: 'a1b2c3d4' }] } } })).toMatchObject({ kaynakAnahtari: 'meta:img:123:a1b2c3d4' });
    expect(k({ raw: { object_story_spec: { video_data: { video_id: '998877' } } } })).toMatchObject({ kaynakAnahtari: 'meta:vid:998877', bicim: 'video', kismi: 'video_kapagi' });
    expect(
      k({ raw: { object_story_spec: { link_data: { child_attachments: [{ image_hash: 'aaaa1111' }, { image_hash: 'bbbb2222' }] } } } }),
    ).toMatchObject({ kaynakAnahtari: 'meta:img:123:aaaa1111', bicim: 'karusel', kismi: 'ilk_kart' });
  });

  it('gönderi tabanlı kreatif (kimlik yok) kreatif kimliğine düşüyor; desene uymayan hash yazılmıyor', () => {
    expect(k({ raw: { object_story_id: '1_2' } })).toMatchObject({ kaynakAnahtari: `kreatif:${ID}` });
    expect(k({ raw: { object_story_spec: { link_data: { image_hash: 'xyz!' } } } })).toMatchObject({ kaynakAnahtari: `kreatif:${ID}` });
  });
});

describe('Google ve LinkedIn', () => {
  it('arama reklamı metin_reklami; görselsiz görüntülü gorsel_yok; LinkedIn platform_disi', () => {
    expect(k({ platform: 'google', creativeType: 'RESPONSIVE_SEARCH_AD', kanal: 'SEARCH' })).toMatchObject({ tur: 'kalici', neden: 'metin_reklami' });
    expect(k({ platform: 'google', creativeType: 'RESPONSIVE_DISPLAY_AD', kanal: 'DISPLAY' })).toMatchObject({ tur: 'kalici', neden: 'gorsel_yok' });
    expect(k({ platform: 'linkedin' })).toMatchObject({ tur: 'kalici', neden: 'platform_disi' });
  });

  it('KRİTİK: kaynak ADI adres sayılmıyor; varlık kimliği anahtara giriyor', () => {
    // Kaynak adı asset_urls'e yazılmış olsa bile süzgeç onu eliyor (CLAUDE.md, AdImageAsset.asset).
    expect(k({ platform: 'google', kanal: 'DISPLAY', assetUrls: ['customers/1/assets/5'] })).toMatchObject({ neden: 'gorsel_yok' });
    expect(
      k({
        platform: 'google',
        kanal: 'DEMAND_GEN',
        assetUrls: ['https://tpc.googlesyndication.com/simgad/9'],
        raw: { demandGenMultiAssetAd: { marketingImages: [{ asset: 'customers/1/assets/42' }] } },
      }),
    ).toMatchObject({ tur: 'gorsel', kaynakAnahtari: 'google:asset:42' });
  });
});

describe('görsel boyutu (en-boy KESİN alanı)', () => {
  it('PNG', () => {
    expect(gorselBoyutu(png(1080, 1350), 'png')).toEqual({ genislik: 1080, yukseklik: 1350 });
  });

  it('JPEG: SOF0 işaretçisi, DHT (C4) atlanıyor', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x74, 0x04, 0xb0, 0x03, 0, 0, 0, 0, 0, 0]);
    expect(gorselBoyutu(b, 'jpg')).toEqual({ genislik: 1200, yukseklik: 628 });
  });

  it('WebP VP8X', () => {
    const b = new Uint8Array(30);
    b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    // genişlik-1 = 1079 (0x437), yükseklik-1 = 1919 (0x77f), 24 bit küçük uçlu.
    b.set([0x37, 0x04, 0x00, 0x7f, 0x07, 0x00], 24);
    expect(gorselBoyutu(b, 'webp')).toEqual({ genislik: 1080, yukseklik: 1920 });
  });

  it('bozuk başlık null (tahmin edilmiyor)', () => {
    expect(gorselBoyutu(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'jpg')).toBeNull();
  });
});
