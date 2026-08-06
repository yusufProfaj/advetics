import { describe, expect, it } from 'vitest';
import { bucketsFromRaw, emptyCounts, roundCounts, sumBuckets } from './conversion-buckets';

/**
 * Dönüşüm kovası çözümleyicisi.
 *
 * NEDEN BU TEST VAR: referans raporun en ayırt edici sütunu bu. Müşteriye
 * gönderilen belgede "Form: 187" ve "Mesaj: 102" ayrı yazıyor ve bu sayılar
 * yanlış olursa müşteri ajansa yanlış bilgiyle gidiyor. Kaynak veri de
 * sözleşmesiz: Meta aksiyon dizisinde onlarca tür var, `value` string ve
 * kesirli olabiliyor.
 */

describe('bucketsFromRaw', () => {
  it('form ve mesaj aksiyonlarını AYRI kovalara koyar', () => {
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'lead', value: '12' },
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' },
      ],
    });
    expect(counts.form).toBe(12);
    expect(counts.message).toBe(3);
    expect(counts.purchase).toBe(0);
  });

  it('aynı kovaya düşen farklı türleri toplar', () => {
    // Meta lead'i iki ayrı türde bildirebiliyor (anlık form vs pixel).
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'lead', value: '10' },
        { action_type: 'offsite_conversion.fb_pixel_lead', value: '5' },
      ],
    });
    expect(counts.form).toBe(15);
  });

  it('KESİRLİ atıf değerlerini korur', () => {
    // Meta bir dönüşümü iki reklama 0.5/0.5 dağıtabiliyor. Ara toplamda
    // yuvarlamak hata biriktirir.
    const counts = bucketsFromRaw({
      actions: [{ action_type: 'lead', value: '0.5' }],
    });
    expect(counts.form).toBeCloseTo(0.5, 6);
  });

  it('bilinmeyen aksiyon türünü SAYMAZ', () => {
    // Sayfa beğenisi ve video görüntüleme dönüşüm değil; toplamı şişirmek
    // müşteriye olmayan bir başarı göstermek olur.
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'like', value: '500' },
        { action_type: 'video_view', value: '9000' },
        { action_type: 'lead', value: '2' },
      ],
    });
    expect(counts.form).toBe(2);
    expect(counts.message).toBe(0);
    expect(counts.purchase).toBe(0);
  });

  it('satın alma kovası ayrı', () => {
    const counts = bucketsFromRaw({
      actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' }],
    });
    expect(counts.purchase).toBe(4);
    expect(counts.form).toBe(0);
  });

  describe('dayanıklılık — bozuk satır raporu düşürmemeli', () => {
    it('null, undefined ve ilkel tiplerde sıfır döner', () => {
      for (const value of [null, undefined, 'metin', 42, true, []]) {
        expect(bucketsFromRaw(value)).toEqual(emptyCounts());
      }
    });

    it('actions dizisi değilse sıfır döner', () => {
      expect(bucketsFromRaw({ actions: 'bozuk' })).toEqual(emptyCounts());
      expect(bucketsFromRaw({ actions: { lead: 5 } })).toEqual(emptyCounts());
    });

    it('action_type eksik girdileri atlar', () => {
      const counts = bucketsFromRaw({
        actions: [{ value: '10' }, { action_type: 'lead', value: '3' }],
      });
      expect(counts.form).toBe(3);
    });

    it('sayısal olmayan value girdisini atlar', () => {
      const counts = bucketsFromRaw({
        actions: [
          { action_type: 'lead', value: 'çok' },
          { action_type: 'lead', value: '7' },
        ],
      });
      expect(counts.form).toBe(7);
    });

    it('value eksikse sıfır sayar', () => {
      expect(bucketsFromRaw({ actions: [{ action_type: 'lead' }] }).form).toBe(0);
    });
  });
});

describe('sumBuckets', () => {
  it('gün gün gelen sayıları toplar', () => {
    const total = sumBuckets([
      { form: 5, message: 2, purchase: 0 },
      { form: 3, message: 1, purchase: 1 },
    ]);
    expect(total).toEqual({ form: 8, message: 3, purchase: 1 });
  });

  it('boş listede sıfır', () => {
    expect(sumBuckets([])).toEqual(emptyCounts());
  });
});

describe('roundCounts', () => {
  it('kesirli toplamı TEK KEZ yuvarlar', () => {
    // Kesirli atıf 12.0000001 gibi değerler üretiyor; müşteriye
    // "12,0000001 form" göstermek anlamsız.
    expect(roundCounts({ form: 12.4, message: 2.6, purchase: 0.5 })).toEqual({
      form: 12,
      message: 3,
      purchase: 1,
    });
  });

  it('kesirli değerler toplandıktan SONRA yuvarlanıyor', () => {
    // Üç kez 0.4 = 1.2 → 1. Her adımda yuvarlamak 0 verirdi.
    const total = sumBuckets([
      { form: 0.4, message: 0, purchase: 0 },
      { form: 0.4, message: 0, purchase: 0 },
      { form: 0.4, message: 0, purchase: 0 },
    ]);
    expect(roundCounts(total).form).toBe(1);
  });
});
