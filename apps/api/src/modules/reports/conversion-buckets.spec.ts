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

  it('REGRESYON: örtüşen türleri TOPLAMAZ, önceliklisini seçer', () => {
    // CANLI VERİDEN: Ege Birlik Yapı, 1-6 Ağustos 2026.
    //   lead                            40
    //   onsite_conversion.lead_grouped  40   ← AYNI 40 lead
    // İlk hâlinde toplanıyordu ve rapor 80 gösteriyordu.
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'lead', value: '40' },
        { action_type: 'onsite_conversion.lead_grouped', value: '40' },
      ],
    });
    expect(counts.form).toBe(40);
  });

  it('REGRESYON: mesaj ailesinde üçlü sayım yok', () => {
    // CANLI VERİDEN:
    //   messaging_conversation_started_7d      20
    //   total_messaging_connection             20   ← AYNI 20
    //   messaging_first_reply                  19   ← BAŞKA olay, dönüşüm değil
    // İlk hâlinde üçü toplanıp "Mesaj: 59" gösteriliyordu.
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '20' },
        { action_type: 'onsite_conversion.total_messaging_connection', value: '20' },
        { action_type: 'onsite_conversion.messaging_first_reply', value: '19' },
      ],
    });
    expect(counts.message).toBe(20);
  });

  it('öncelikli tür yoksa yedeğe düşer', () => {
    // `lead` gelmeyen bir hesapta onsite değeri kullanılıyor.
    const counts = bucketsFromRaw({
      actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '7' }],
    });
    expect(counts.form).toBe(7);
  });

  it('öncelikli tür SIFIRSA yedeğe düşer', () => {
    // Sıfır "dolu değil": dolu bir yedeği engellememeli.
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'lead', value: '0' },
        { action_type: 'offsite_conversion.fb_pixel_lead', value: '9' },
      ],
    });
    expect(counts.form).toBe(9);
  });

  it('aynı tür birden fazla girdi olarak gelirse toplanır', () => {
    // Meta atıf penceresine göre bölebiliyor; bu ikisi AYNI türün parçaları.
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'lead', value: '3' },
        { action_type: 'lead', value: '4' },
      ],
    });
    expect(counts.form).toBe(7);
  });

  it('KESİRLİ atıf değerlerini korur', () => {
    // Meta bir dönüşümü iki reklama 0.5/0.5 dağıtabiliyor. Ara toplamda
    // yuvarlamak hata biriktirir.
    const counts = bucketsFromRaw({
      actions: [{ action_type: 'lead', value: '0.5' }],
    });
    expect(counts.form).toBeCloseTo(0.5, 6);
  });

  it('CANLI ŞEKİL: tüm aksiyon türleriyle doğru sayılar', () => {
    // Ege Birlik Yapı hesabının gerçek aksiyon dizisi (kısaltılmış).
    // Doğru cevap: Form 40, Mesaj 20, Satış 0.
    const counts = bucketsFromRaw({
      actions: [
        { action_type: 'page_engagement', value: '9594' },
        { action_type: 'post_engagement', value: '9590' },
        { action_type: 'video_view', value: '6859' },
        { action_type: 'link_click', value: '2394' },
        { action_type: 'landing_page_view', value: '1231' },
        { action_type: 'onsite_conversion.lead_grouped', value: '40' },
        { action_type: 'lead', value: '40' },
        { action_type: 'onsite_conversion.total_messaging_connection', value: '20' },
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '20' },
        { action_type: 'onsite_conversion.messaging_first_reply', value: '19' },
        { action_type: 'offsite_conversion.fb_pixel_custom', value: '1' },
      ],
    });
    expect(counts).toEqual({ form: 40, message: 20, purchase: 0 });
    // Toplam dönüşüm 60 — rapordaki 153 değil.
    expect(counts.form + counts.message + counts.purchase).toBe(60);
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
