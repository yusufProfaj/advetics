import { describe, expect, it } from 'vitest';
import {
  istanbulParcalari,
  raporPenceresi,
  siradakiCalisma,
  pencerelerIcin,
  raporPlaniInputSchema,
} from '@advetics/shared';

/**
 * ═══ ZAMANLANMIŞ RAPORUN İKİ SAF HESABI ═══
 *
 * İkisi de yanlış olduğunda HİÇBİR HATA VERMİYOR:
 *
 *   · `siradakiCalisma` yanlışsa rapor yanlış zamanda (ya da hiç) gider ve
 *     bunu ancak müşteri fark eder.
 *   · `raporPenceresi` yanlışsa müşteriye YANLIŞ DÖNEMİ kapsayan bir belge
 *     gider — sayılar doğru görünür, dönem değildir.
 *
 * `simdi` dışarıdan veriliyor: `Date.now()`a bağlı bir hesap sınanamazdı.
 */

/** Test okunurluğu için: İstanbul duvar saatinden mutlak an. Türkiye UTC+3. */
function ist(gunSaat: string): Date {
  return new Date(`${gunSaat}+03:00`);
}

describe('siradakiCalisma — haftalık', () => {
  const PZT_09 = { frequency: 'weekly' as const, dayOfWeek: 1, dayOfMonth: null, hour: 9 };

  it('KRİTİK: sonraki Pazartesi 09:00 İstanbul saatini veriyor', () => {
    // 2026-09-02 Çarşamba. Sonraki Pazartesi 2026-09-07.
    const sonuc = siradakiCalisma(PZT_09, ist('2026-09-02T10:00:00'));
    const p = istanbulParcalari(sonuc);
    expect([p.yil, p.ay, p.gun, p.saat]).toEqual([2026, 9, 7, 9]);
  });

  it('KRİTİK: aynı gün ve saat GEÇMİŞSE haftaya sarıyor — mükerrer gönderimin ilk savunması', () => {
    /*
     * Süpürme saatte bir koşuyor. Pazartesi 09:05'te koşan bir tur
     * `next_run_at`i AYNI Pazartesi 09:00'a yazsaydı, 10:05'teki tur onu
     * yine "zamanı gelmiş" görür ve müşteriye ikinci bir rapor giderdi.
     */
    const sonuc = siradakiCalisma(PZT_09, ist('2026-09-07T09:05:00'));
    const p = istanbulParcalari(sonuc);
    expect([p.yil, p.ay, p.gun]).toEqual([2026, 9, 14]);
  });

  it('KRİTİK: TAM zamanında koşarsa da ileri atlıyor (kesinlikle sonra)', () => {
    // Eşitliğe izin verilseydi aynı an tekrar seçilir ve sonsuz döngü olurdu.
    const sonuc = siradakiCalisma(PZT_09, ist('2026-09-07T09:00:00'));
    expect(sonuc.getTime()).toBeGreaterThan(ist('2026-09-07T09:00:00').getTime());
    expect(istanbulParcalari(sonuc).gun).toBe(14);
  });

  it('aynı gün ama saat HENÜZ GELMEMİŞSE bugünü seçiyor', () => {
    const sonuc = siradakiCalisma(PZT_09, ist('2026-09-07T08:00:00'));
    expect(istanbulParcalari(sonuc).gun).toBe(7);
  });

  it('Pazar (ISO 7) doğru eşleşiyor — 0/7 karışması klasik hata', () => {
    const paz = { frequency: 'weekly' as const, dayOfWeek: 7, dayOfMonth: null, hour: 8 };
    const sonuc = siradakiCalisma(paz, ist('2026-09-02T10:00:00'));
    const p = istanbulParcalari(sonuc);
    // 2026-09-06 Pazar
    expect([p.ay, p.gun, p.saat]).toEqual([9, 6, 8]);
  });

  it('KRİTİK: dönen an İstanbul 09:00 = UTC 06:00 — saat dilimi gerçekten uygulanıyor', () => {
    /*
     * Bu iddia olmadan, hesabın UTC'de yapılması testi geçerdi ve rapor
     * İstanbul'da 12:00'de giderdi. `sweep:account-status` ile aynı ders.
     */
    const sonuc = siradakiCalisma(PZT_09, ist('2026-09-02T10:00:00'));
    expect(sonuc.toISOString()).toBe('2026-09-07T06:00:00.000Z');
  });
});

describe('siradakiCalisma — aylık', () => {
  const AYIN_5I = { frequency: 'monthly' as const, dayOfWeek: null, dayOfMonth: 5, hour: 9 };

  it('bu ayın günü geçmemişse bu ayı seçiyor', () => {
    const sonuc = siradakiCalisma(AYIN_5I, ist('2026-09-02T10:00:00'));
    const p = istanbulParcalari(sonuc);
    expect([p.ay, p.gun]).toEqual([9, 5]);
  });

  it('KRİTİK: bu ayın günü geçmişse GELECEK aya atlıyor', () => {
    const sonuc = siradakiCalisma(AYIN_5I, ist('2026-09-06T10:00:00'));
    const p = istanbulParcalari(sonuc);
    expect([p.ay, p.gun]).toEqual([10, 5]);
  });

  it('KRİTİK: yıl sınırını geçiyor — Aralık’tan Ocak’a', () => {
    const sonuc = siradakiCalisma(AYIN_5I, ist('2026-12-10T10:00:00'));
    const p = istanbulParcalari(sonuc);
    expect([p.yil, p.ay, p.gun]).toEqual([2027, 1, 5]);
  });

  it('KRİTİK: 28. gün ŞUBAT’ta da var — üst sınırın sebebi bu', () => {
    /*
     * 29/30/31 her ayda yok. Şema 28'de kesiyor; bu test o sınırın
     * gerçekten güvenli olduğunu gösteriyor (2027 artık yıl değil).
     */
    const a28 = { frequency: 'monthly' as const, dayOfWeek: null, dayOfMonth: 28, hour: 9 };
    const sonuc = siradakiCalisma(a28, ist('2027-02-01T10:00:00'));
    const p = istanbulParcalari(sonuc);
    expect([p.yil, p.ay, p.gun]).toEqual([2027, 2, 28]);
  });
});

describe('raporPenceresi — müşteriye giden dönem', () => {
  const BUGUN = '2026-09-02'; // Çarşamba

  it('KRİTİK: son 7 gün DÜNDE bitiyor — bugün rapora girmiyor', () => {
    /*
     * Rapor bir BELGE ve müşteriye gidiyor; tamamlanmamış bir günü içine
     * almak, gün içinde değişecek rakamları göndermek demek.
     */
    expect(raporPenceresi('7g', BUGUN)).toEqual({ from: '2026-08-26', to: '2026-09-01' });
  });

  it('son 14 ve son 30 gün de dünde bitiyor', () => {
    expect(raporPenceresi('14g', BUGUN)).toEqual({ from: '2026-08-19', to: '2026-09-01' });
    expect(raporPenceresi('30g', BUGUN)).toEqual({ from: '2026-08-03', to: '2026-09-01' });
  });

  it('geçen ay TAM takvim ayı', () => {
    expect(raporPenceresi('gecen_ay', BUGUN)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('KRİTİK: bu ay DÜNE KIRPILIYOR — panelin yaptığı kırpmanın aynısı', () => {
    expect(raporPenceresi('bu_ay', BUGUN)).toEqual({ from: '2026-09-01', to: '2026-09-01' });
  });

  it('KRİTİK: ayın 1’inde "bu ay" NULL — dönem henüz başlamadı', () => {
    /*
     * `from` (ayın 1'i) `to`dan (dün = geçen ayın son günü) büyük oluyor.
     * Sunucuya göndermek doğrulama hatası, sessizce düzeltmek ise
     * kullanıcının seçmediği bir dönemi göndermek olurdu.
     */
    expect(raporPenceresi('bu_ay', '2026-09-01')).toBeNull();
  });

  it('bilinmeyen anahtar NULL — uydurma pencere yok', () => {
    expect(raporPenceresi('yok_boyle_bir_sey', BUGUN)).toBeNull();
  });
});

describe('sıklık × pencere uyumluluk matrisi', () => {
  it('KRİTİK: haftalıkta "geçen ay" YOK — aynı rapor ayda dört kez giderdi', () => {
    expect(pencerelerIcin('weekly').map((p) => p.key)).not.toContain('gecen_ay');
  });

  it('KRİTİK: aylıkta "bu ay" YOK — ayın 1’inde dönem boş çıkardı', () => {
    expect(pencerelerIcin('monthly').map((p) => p.key)).not.toContain('bu_ay');
  });

  it('KRİTİK: sunucu da uyumsuz kombinasyonu REDDEDİYOR — matris tavsiye değil', () => {
    /*
     * Arayüz uyumsuz seçeneği hiç göstermiyor ama uç doğrudan çağrılabiliyor.
     * Doğrulamayı yalnızca ekrana bırakmak matrisi bir tavsiyeye çevirirdi.
     */
    const sonuc = raporPlaniInputSchema.safeParse({
      clientId: '11111111-1111-1111-1111-111111111111',
      frequency: 'weekly',
      dayOfWeek: 1,
      hour: 9,
      rangeKey: 'gecen_ay',
    });
    expect(sonuc.success).toBe(false);
  });

  it('geçerli kombinasyon kabul ediliyor', () => {
    const sonuc = raporPlaniInputSchema.safeParse({
      clientId: '11111111-1111-1111-1111-111111111111',
      frequency: 'monthly',
      dayOfMonth: 5,
      hour: 9,
      rangeKey: 'gecen_ay',
    });
    expect(sonuc.success).toBe(true);
  });

  it('haftalık planda gün seçilmemişse reddediliyor', () => {
    const sonuc = raporPlaniInputSchema.safeParse({
      clientId: '11111111-1111-1111-1111-111111111111',
      frequency: 'weekly',
      hour: 9,
      rangeKey: '7g',
    });
    expect(sonuc.success).toBe(false);
  });

  it('KRİTİK: ayın 29’u REDDEDİLİYOR — Şubat’ta sessizce atlanırdı', () => {
    const sonuc = raporPlaniInputSchema.safeParse({
      clientId: '11111111-1111-1111-1111-111111111111',
      frequency: 'monthly',
      dayOfMonth: 29,
      hour: 9,
      rangeKey: 'gecen_ay',
    });
    expect(sonuc.success).toBe(false);
  });
});
