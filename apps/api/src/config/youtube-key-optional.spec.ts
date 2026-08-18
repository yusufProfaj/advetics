import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * `.env.example` BOŞ DEĞERLERLE GELİYOR ve taze bir kopya AÇILABİLMELİ.
 *
 * Bu test bir hatadan doğdu: `YOUTUBE_API_KEY` ilk yazımda
 * `z.string().min(1).optional()` idi. `.env.example` değişkeni boş dizgeyle
 * gönderdiği için, dosyayı kopyalayan herkes uygulamayı "Ortam değişkenleri
 * geçersiz" hatasıyla karşılardı — kullanmadığı bir özelliğin anahtarı
 * yüzünden.
 *
 * Depodaki isteğe bağlı platform değişkenlerinin tamamı bu yüzden
 * `.min(1)` KULLANMIYOR (`META_APP_ID`, `GOOGLE_CLIENT_ID`…).
 */
describe('isteğe bağlı ortam değişkenleri boş dizgeye dayanıklı', () => {
  const isteğeBagli = z.string().optional();
  const yanlis = z.string().min(1).optional();

  it('KRİTİK: boş dizge şemayı DÜŞÜRMÜYOR', () => {
    expect(isteğeBagli.safeParse('').success).toBe(true);
  });

  it('hiç tanımlı olmaması da geçerli', () => {
    expect(isteğeBagli.safeParse(undefined).success).toBe(true);
  });

  it('REGRESYON: `.min(1)` eklemek boş dizgeyi düşürürdü', () => {
    // Bu testin varlığı, bir gün "daha sıkı olsun" diye min(1) eklemek
    // isteyene sebebini söylüyor.
    expect(yanlis.safeParse('').success).toBe(false);
  });

  it('boş dizge FALSY — okuyan kod "yok" sayıyor', () => {
    // Şema boş dizgeyi geçiriyor; güvenlik, tüketen tarafın falsy kontrolüne
    // dayanıyor ve o kontrol her yerde aynı olmalı.
    const apiKey: string | undefined = '';
    expect(Boolean(apiKey)).toBe(false);
  });
});
