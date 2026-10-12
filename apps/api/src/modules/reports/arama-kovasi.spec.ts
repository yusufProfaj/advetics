import { describe, expect, it } from 'vitest';
import {
  BILINEN_KOVASIZ_ARAMA_EYLEMLERI,
  CONVERSION_BUCKETS,
  DEFAULT_COLUMNS,
  kovaPlatformu,
  resolveColumns,
  taninmayanAramaEylemleri,
  type ReportCampaignRow,
} from '@advetics/shared';
import { bucketsFromRaw, emptyCounts } from './conversion-buckets';

/**
 * ARAMA KOVALARI — saf kurallar ("Beni telefonla arasınlar", 2026-10-12).
 * Adlar Meta'nın Ads Action Stats başvurusundan; Türkiye'de hangisinin
 * geldiği ÖLÇÜLMEDİ, bu yüzden tanınmayan arama eylemi raporda söyleniyor.
 */

describe('kova eşleme', () => {
  it('KRİTİK: yapılan arama öncelikli; yoksa Ara onayı; 20 sn ayrı kova', () => {
    const c = bucketsFromRaw({
      actions: [
        { action_type: 'click_to_call_call_confirm', value: '9' },
        { action_type: 'click_to_call_native_call_placed', value: '6' },
        { action_type: 'click_to_call_native_20s_call_connect', value: '4' },
      ],
    });
    expect(c.calls).toBe(6);
    expect(c.calls20s).toBe(4);
    expect(bucketsFromRaw({ actions: [{ action_type: 'click_to_call_call_confirm', value: '3' }] }).calls).toBe(3);
  });

  it('arama kovaları form/mesaj/satışı ETKİLEMİYOR (çakışan tür yok)', () => {
    const tumu = Object.values(CONVERSION_BUCKETS).flatMap((k) => [...k.actionTypes] as string[]);
    expect(new Set(tumu).size).toBe(tumu.length);
  });

  it('Google ham sayacı (`callClicks`) yalnız SAYIYSA okunur; hata gövdesi 0 kalır', () => {
    expect(bucketsFromRaw({ callClicks: 4 }).callClicks).toBe(4);
    expect(bucketsFromRaw({ callClicksError: 'x' }).callClicks).toBe(0);
    expect(emptyCounts()).toEqual({ form: 0, message: 0, purchase: 0, calls: 0, calls20s: 0, callClicks: 0 });
  });
});

describe('tanınmayan arama eylemi', () => {
  it('KRİTİK: call geçen ama kovada olmayan tür döner; bilinenler ve call_to_action dönmez', () => {
    expect(
      taninmayanAramaEylemleri([
        'click_to_call_native_call_placed',
        'click_to_call_native_20s_call_connect',
        'click_to_call_call_confirm',
        ...BILINEN_KOVASIZ_ARAMA_EYLEMLERI,
        'onsite_conversion.call_to_action_click',
        'lead',
        'click_to_call_callback_request',
        'click_to_call_callback_request',
      ]),
    ).toEqual(['click_to_call_callback_request']);
  });
});

describe('tanınmayan arama eylemi — üretim verisi (2026-10-13)', () => {
  /*
   * Üretimde ÖLÇÜLEN gerçek tür listesi (Meta, TR hesapları, 365 gün):
   * birleşik "+ 20 sn arama" sütunları her pikselli hesapta var ve arama
   * değil. Bunlar uyarı üretseydi neredeyse her rapor "tanınmayan arama
   * sonucu" derdi ve gerçek bir yeni ad o kalabalıkta kaybolurdu.
   */
  const URETIM = [
    'offsite_content_view_add_20_s_calls',
    'offsite_add_to_cart_add_20_s_calls',
    'offsite_purchase_add_20_s_calls',
    'offsite_lead_add_20_s_calls',
    'offsite_initiate_checkout_add_20_s_calls',
    'offsite_complete_registration_add_20_s_calls',
    'click_to_call_native_call_placed',
    'call_confirm_grouped',
    'click_to_call_call_confirm',
    'onsite_conversion.messaging_user_call_placed',
    'click_to_call_native_20s_call_connect',
    'offsite_search_add_20_s_calls',
    'click_to_call_native_60s_call_connect',
    'grouped_pixel_custom_conversions_add_20_s_calls',
    'custom_event_actions_add_20_s_calls',
  ];
  it('KRİTİK: üretimdeki bilinen türlerin HİÇBİRİ uyarı üretmez', () => {
    expect(taninmayanAramaEylemleri(URETIM)).toEqual([]);
  });
  it('gerçekten yeni bir ad hâlâ yakalanır', () => {
    expect(taninmayanAramaEylemleri([...URETIM, 'click_to_call_native_45s_call_connect'])).toEqual(['click_to_call_native_45s_call_connect']);
  });
});

describe('sütunlar', () => {
  const satir = (calls: number, callClicks = 0) => ({ conversionCounts: { ...emptyCounts(), calls, callClicks } }) as unknown as ReportCampaignRow;
  it('KRİTİK: arama verisi varsa varsayılan sütunlara eklenir, yoksa eklenmez', () => {
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir(3)])).toContain('calls');
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir(0)])).not.toContain('calls');
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.google_campaigns, [satir(0, 5)])).toContain('callClicks');
  });
  it('kullanıcının kendi seçimine sütun EKLENMEZ', () => {
    expect(resolveColumns(['spend', 'form'], DEFAULT_COLUMNS.meta_campaigns, [satir(3)])).toEqual(['spend', 'form']);
  });
  it('kovanın platformu: arama tıklaması Google, arama Meta, metrik hiçbiri', () => {
    expect(kovaPlatformu('callClicks')).toBe('google');
    expect(kovaPlatformu('calls')).toBe('meta');
    expect(kovaPlatformu('spend')).toBeNull();
  });
});
