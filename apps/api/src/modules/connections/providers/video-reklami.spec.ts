import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ VİDEO REKLAMI — CANLIDA DOĞRULANAMAYAN KARARLAR ═══
 *
 * Meta'nın reklam videosu yolu görselinkinden ÜÇ noktada ayrılıyor ve
 * üçünde de yanlış yapmanın belirtisi sessiz:
 *
 *   1. Yükleme `/advideos`, multipart ve alan adı `source` — görselin
 *      form-encoded base64 yolu burada çalışmıyor.
 *   2. Yükleme 200 dönse bile video HAZIR DEĞİL: Meta asenkron işliyor ve
 *      kreatif hemen kurulursa "still being processed" ile reddediliyor.
 *   3. Kreatif `link_data` değil `video_data` kuruyor; ikisini birden
 *      göndermek "Invalid parameter".
 *
 * Canlı çağrı yapan bir test yok ve olamaz; kararlar kaynak taramasıyla
 * kilitleniyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * Gövdeyi SÜSLÜ PARANTEZ SAYARAK çıkarıyor.
 *
 * Sabit uzunluklu bir dilim komşu metodun içine taşıyor ve "şu çağrı var"
 * iddiası, çağrı SİLİNDİĞİNDE de komşudan eşleşerek geçiyor. Bitiş
 * işaretine (bir sonraki metodun adı) çapalamak da kırılgan: ad değişince
 * dilim boşalıyor ve "yasak dizge yok" her zaman doğru oluyor.
 */
function govde(bas: string): string {
  const i = KAYNAK.indexOf(bas);
  expect(i, `${bas} bulunamadı — tarama boşa düştü`).toBeGreaterThan(-1);

  // GÖVDENİN AÇILIŞI SATIR SONUNDAKİ SÜSLÜ PARANTEZ. İmzadaki ilk `{`
  // parametre nesnesine ait (`params: { name: string; ... }`) ve onu saymaya
  // başlamak gövdeyi imzanın ortasında bitiriyor.
  const acilis = KAYNAK.indexOf('{\n', i);
  let derinlik = 0;
  for (let k = acilis; k < KAYNAK.length; k += 1) {
    if (KAYNAK[k] === '{') derinlik += 1;
    else if (KAYNAK[k] === '}') {
      derinlik -= 1;
      if (derinlik === 0) return KAYNAK.slice(i, k + 1);
    }
  }
  throw new Error(`${bas} gövdesi kapanmıyor — tarama boşa düştü`);
}

describe('tarama boşa düşmüyor', () => {
  it('üç gövde de yakalandı', () => {
    expect(KAYNAK).toContain('async uploadAdVideo(');
    expect(KAYNAK).toContain('private async videoHazirBekle(');
    expect(KAYNAK).toContain('function buildCreativeSpec(');
  });
});

describe('yükleme', () => {
  const YUKLE = () => govde('async uploadAdVideo(');

  it('KRİTİK: `/advideos` ucuna gidiyor — `/adimages` DEĞİL', () => {
    expect(YUKLE()).toContain('/advideos');
    expect(YUKLE()).not.toContain('/adimages');
  });

  it('KRİTİK: multipart ve alan adı `source`', () => {
    /*
     * Görselde kullandığımız form-encoded base64 video ucunda çalışmıyor.
     * Alan adı `source` — Meta'nın belgelediği tek ad.
     */
    expect(YUKLE()).toContain("form.append('source'");
    expect(YUKLE()).toContain('new FormData()');
  });

  it('KRİTİK: Content-Type ELLE VERİLMİYOR', () => {
    /*
     * `FormData` sınırı (boundary) kendisi ekliyor; elle yazılan bir başlık
     * onu geçersiz kılıyor ve Meta "geçersiz istek" diyor — mesaj hangi
     * baytın yanlış olduğunu söylemiyor.
     */
    expect(YUKLE()).not.toContain("'Content-Type': 'multipart");
  });

  it('başlık gönderiliyor', () => {
    // Meta boş başlıkta isteği reddediyor.
    expect(YUKLE()).toContain("form.append('title'");
  });

  it('KRİTİK: zaman aşımı yükseltilmiş', () => {
    // 200 MB'lık bir dosya varsayılan 30 saniyede bitmiyor.
    expect(YUKLE()).toContain('timeoutMs: 600_000');
  });
});

describe('işlenmeyi bekleme', () => {
  const BEKLE = () => govde('private async videoHazirBekle(');

  it('KRİTİK: `video_status` okunuyor', () => {
    expect(BEKLE()).toContain('status?.video_status');
    expect(BEKLE()).toContain("durum === 'ready'");
  });

  it('KRİTİK: İŞLEME HATASI KALICI olarak fırlatılıyor', () => {
    /*
     * Aynı bozuk dosyayı tekrar beklemek bir şeyi değiştirmiyor ve tekrar
     * denenebilir saymak, kotayı boşa harcayan bir döngü açardı.
     */
    expect(BEKLE()).toContain("durum === 'error'");
    expect(BEKLE()).toContain("'permanent'");
  });

  it('KRİTİK: DURUM OKUNAMAZSA yayın ENGELLENMİYOR', () => {
    /*
     * `status` alanı Meta'nın reklam videosu kılavuzunda belgelenmiyor.
     * Okunamamasını arıza saymak, işlenmesi bitmiş bir videoyu boşuna
     * reddetmek olurdu; Meta hazır değilse kendi mesajıyla reddediyor.
     */
    expect(BEKLE()).toContain('hazir: false, not:');
    expect(BEKLE()).toContain('doğrulanamadı');
  });

  it('KRİTİK: SONSUZA KADAR BEKLENMİYOR', () => {
    expect(BEKLE()).toContain('VIDEO_ISLEME_SINIRI_MS');
    expect(KAYNAK).toContain('const VIDEO_ISLEME_SINIRI_MS = 120_000;');
  });

  it('üstel geri çekilme var', () => {
    // İki saniyede bir sormak, uzun videoda onlarca gereksiz çağrı demek.
    expect(BEKLE()).toContain('Math.min(bekleme * 2,');
  });
});

describe('kreatif', () => {
  const KREATIF = () => govde('function buildCreativeSpec(');

  it('KRİTİK: video varsa `video_data` kuruluyor ve görsel yolu ÇALIŞMIYOR', () => {
    /*
     * Meta tek kreatifte hem video hem görsel kabul etmiyor; ikisini birden
     * göndermek "Invalid parameter" ile dönüyor.
     */
    const k = KREATIF();
    expect(k).toContain('if (req.video) {');
    expect(k).toContain('video_data: {');
    // Video dalı ERKEN dönüyor: görsel dalına hiç düşmüyor.
    expect(k.indexOf('if (req.video) {')).toBeLessThan(k.indexOf('if (req.images.length <= 1'));
  });

  it('KRİTİK: `image_url` VERİLMİYOR — küçük resmi Meta üretiyor', () => {
    /*
     * Küçük resim için ayrı bir uç var (`/{video_id}/thumbnails`) ama o uç
     * Meta'nın reklam videosu kılavuzunda belgelenmiyor. Belgelenmemiş bir
     * uçtan okunan adresi kreatife yazmak, bir gün sessizce küçük resimsiz
     * reklam üretmek olurdu.
     */
    const k = KREATIF();
    const videoDali = k.slice(k.indexOf('if (req.video) {'), k.indexOf('if (req.images.length <= 1'));
    expect(videoDali).not.toContain('image_url');
    expect(videoDali).not.toContain('image_hash');
  });

  it('KRİTİK: WhatsApp CTA değeri video dalında da doğru', () => {
    // `{ link }` vermek butonu tarayıcıya yönlendirebiliyor.
    const k = KREATIF();
    const videoDali = k.slice(k.indexOf('if (req.video) {'), k.indexOf('if (req.images.length <= 1'));
    expect(videoDali).toContain("{ app_destination: 'WHATSAPP' }");
  });
});
