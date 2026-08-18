import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * WEBSUB GERİ ÇAĞRI BELİRTECİ — türetiliyor, SAKLANMIYOR.
 *
 * ═══ NEDEN BÖYLE ═══
 *
 * Geri çağrı adresi (`/api/webhooks/youtube/<belirteç>`) tahmin edilemez bir
 * belirteç taşıyor ve o belirteç, isteği gönderebilmenin şartı — yani bir
 * kimlik bilgisi. Güvenlik incelemesi düz metin saklamanın iki sonucunu
 * gösterdi: her veritabanı dökümü canlı bir sır taşır ve sızdığında iptal
 * yolu yoktur.
 *
 * ÇÖZÜM: belirteç ana şifreleme anahtarından ve satırdaki NONCE'tan
 * türetiliyor. Veritabanında yalnızca SHA-256 özeti var ve onun tek işi gelen
 * istekteki belirteçten aboneliği BULMAK.
 *
 *   · Döküm ele geçse → özetten belirteç üretilemez.
 *   · Sızıntı şüphesi → nonce yenilenir, eski adres ANINDA ölür.
 *
 * HMAC KULLANILIYOR, düz özet değil: `sha256(profileId + nonce)` olsaydı
 * ikisini bilen herkes belirteci üretebilirdi ve ikisi de sır değil (profil
 * kimliği panelde, nonce dökümde).
 */

/** Farklı amaçlar için AYRI türetme etiketleri — anahtar yeniden kullanılmıyor. */
const ETIKET_CALLBACK = 'advetics:websub:callback:v1';
const ETIKET_SECRET = 'advetics:websub:hubsecret:v1';

/**
 * Yeni nonce. Rotasyon bunu değiştirmekten ibaret.
 *
 * 32 bayt: tahmin edilemezlik için fazlasıyla yeterli ve base64url'de 43
 * karakter, yani adres okunabilir kalıyor.
 */
export function newTokenNonce(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Geri çağrı belirteci.
 *
 * `base64url` — adres bileşeni olacağı için `+`, `/` ve `=` kullanılamaz;
 * base64 kullanılsaydı belirteç yolda kaçış (encoding) gerektirir ve bir
 * yerde kaçırılmadığında istek sessizce eşleşmezdi.
 */
export function deriveCallbackToken(params: {
  masterKey: Buffer;
  socialProfileId: string;
  nonce: string;
}): string {
  return createHmac('sha256', params.masterKey)
    .update(`${ETIKET_CALLBACK}|${params.socialProfileId}|${params.nonce}`)
    .digest('base64url');
}

/**
 * Hub'a verilecek `hub.secret` — imzanın anahtarı.
 *
 * GERİ ÇAĞRI BELİRTECİNDEN FARKLI TÜRETİLİYOR. Aynı değer kullanılsaydı,
 * adresi gören (log, proxy, tarayıcı geçmişi) imza anahtarını da bilirdi ve
 * imza katmanı tamamen çökerdi.
 *
 * WebSub 0.4 secret'ın 200 BAYTTAN KISA olmasını şart koşuyor; 32 baytlık
 * HMAC çıktısı base64url'de 43 karakter — sınırın çok altında.
 */
export function deriveHubSecret(params: {
  masterKey: Buffer;
  socialProfileId: string;
  nonce: string;
}): string {
  return createHmac('sha256', params.masterKey)
    .update(`${ETIKET_SECRET}|${params.socialProfileId}|${params.nonce}`)
    .digest('base64url');
}

/**
 * Veritabanında saklanan özet — aramanın anahtarı.
 *
 * DÜZ SHA-256 YETERLİ ve bcrypt/argon gerekmez: belirteç 256 bitlik rastgele
 * bir değer, yani sözlük ya da kaba kuvvet saldırısına açık değil. Parolalarda
 * yavaş özet gerekiyor çünkü onlar düşük entropili; burada durum farklı ve
 * yavaş özet her istekte gereksiz gecikme demek olurdu.
 */
export function hashCallbackToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
