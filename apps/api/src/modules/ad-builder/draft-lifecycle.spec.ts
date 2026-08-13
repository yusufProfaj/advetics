import { describe, expect, it } from 'vitest';
import { adDraftInputSchema } from '@advetics/shared';

/**
 * Taslak yaşam döngüsü — ADIM SIRASI İLE ŞEMANIN UYUMU.
 *
 * NEDEN BU TEST VAR: sihirbazda görseller 3. adım, metinler 4. adım. Görsel
 * eklemek bir taslak gerektiriyor (dosya taslağa bağlanıyor) ve taslak
 * kaydedilirken şema doğrulanıyor.
 *
 * Şema `primaryText`'i zorunlu tuttuğu sürece 3. ADIM HİÇ ÇALIŞMIYOR:
 * kullanıcı görseli bırakıyor, sunucu "Ana metin boş olamaz" diyor. Bu
 * üretimde bir süre böyle kaldı ve fark edilmedi — çünkü hata mesajı formun
 * en altında beliriyordu ve testler yalnızca dolu girdiyle çalışıyordu.
 *
 * Buradaki iddia basit ama kırılması kolay: TASLAK EKSİK OLABİLİR, YAYIN
 * OLAMAZ. Biri metni yeniden zorunlu yaparsa bu test düşer.
 */

const base = {
  clientId: '11111111-1111-1111-1111-111111111111',
  adAccountId: '22222222-2222-2222-2222-222222222222',
  socialProfileId: '33333333-3333-3333-3333-333333333333',
  goal: 'form' as const,
  name: 'Yaz kampanyası',
  dailyBudget: '200',
};

describe('taslak şeması adım sırasına uyuyor', () => {
  it('METİNSİZ taslak geçerli — görseller metinlerden önceki adımda', () => {
    const parsed = adDraftInputSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.primaryText).toBe('');
  });

  it('boş dize açıkça verilse de geçerli', () => {
    // Arayüz `primaryText.trim()` gönderiyor ve 3. adımda bu boş dize.
    expect(adDraftInputSchema.safeParse({ ...base, primaryText: '' }).success).toBe(true);
  });

  it('kampanya adı HÂLÂ zorunlu — görsellerden ÖNCEKİ adımda soruluyor', () => {
    /**
     * Ad 2. adımda, görseller 3. adımda: kullanıcı görsele geldiğinde adı
     * çoktan yazmış oluyor. Bunu da gevşetmek, adsız taslakların listeyi
     * doldurması demek olurdu.
     */
    expect(adDraftInputSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('web sitesi hedefinde adres HÂLÂ zorunlu — o da 2. adımda', () => {
    expect(
      adDraftInputSchema.safeParse({ ...base, goal: 'website' }).success,
    ).toBe(false);
  });

  it('metin sınırı korunuyor', () => {
    expect(
      adDraftInputSchema.safeParse({ ...base, primaryText: 'a'.repeat(2001) }).success,
    ).toBe(false);
  });
});
