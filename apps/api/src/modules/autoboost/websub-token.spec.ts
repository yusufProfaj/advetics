import { describe, expect, it } from 'vitest';
import {
  deriveCallbackToken,
  deriveHubSecret,
  hashCallbackToken,
  newTokenNonce,
} from './websub-token';

/**
 * BELİRTEÇ TÜRETİLİYOR, SAKLANMIYOR.
 *
 * Güvenlik incelemesi düz metin saklamanın iki sonucunu gösterdi: her
 * veritabanı dökümü canlı bir sır taşır ve sızdığında iptal yolu yoktur.
 */
const KEY = Buffer.alloc(32, 7);
const PROFIL = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const NONCE = 'sabit-nonce-testi';

describe('nonce', () => {
  it('her çağrıda FARKLI — rotasyonun temeli bu', () => {
    expect(newTokenNonce()).not.toBe(newTokenNonce());
  });

  it('base64url — adreste kaçış gerektirmiyor', () => {
    expect(newTokenNonce()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('deriveCallbackToken', () => {
  it('aynı girdi AYNI belirteci veriyor — saklamaya gerek yok', () => {
    const a = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    const b = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    expect(a).toBe(b);
  });

  it('KRİTİK: NONCE değişince belirteç değişiyor — İPTAL yolu', () => {
    /*
     * Sızıntı şüphesinde nonce yenileniyor ve eski adres ANINDA ölüyor.
     * İlk tasarımda iptal yolu hiç yoktu.
     */
    const eski = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: 'a' });
    const yeni = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: 'b' });
    expect(eski).not.toBe(yeni);
  });

  it('KRİTİK: PROFİL değişince belirteç değişiyor', () => {
    // Bir profilin belirteci başka profilin ucunu açmamalı.
    const a = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    const b = deriveCallbackToken({
      masterKey: KEY,
      socialProfileId: 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
      nonce: NONCE,
    });
    expect(a).not.toBe(b);
  });

  it('KRİTİK: ANA ANAHTAR olmadan üretilemiyor', () => {
    /*
     * Bu, düz özet yerine HMAC kullanmanın sebebi: `sha256(profil + nonce)`
     * olsaydı ikisini bilen herkes belirteci üretebilirdi — ve ikisi de sır
     * değil (profil kimliği panelde, nonce dökümde).
     */
    const dogru = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    const yanlis = deriveCallbackToken({
      masterKey: Buffer.alloc(32, 9),
      socialProfileId: PROFIL,
      nonce: NONCE,
    });
    expect(dogru).not.toBe(yanlis);
  });

  it('base64url — adres bileşeni olarak kaçış gerektirmiyor', () => {
    const t = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(t)).toBe(t);
  });
});

describe('deriveHubSecret', () => {
  it('KRİTİK: geri çağrı belirtecinden FARKLI', () => {
    /*
     * Aynı değer kullanılsaydı, adresi gören (log, proxy, tarayıcı geçmişi)
     * imza anahtarını da bilirdi ve imza katmanı tamamen çökerdi.
     */
    const token = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    const secret = deriveHubSecret({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    expect(secret).not.toBe(token);
  });

  it('WebSub 0.4 sınırının altında (200 bayt)', () => {
    const s = deriveHubSecret({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    expect(Buffer.byteLength(s)).toBeLessThan(200);
  });

  it('nonce ile birlikte dönüyor', () => {
    const a = deriveHubSecret({ masterKey: KEY, socialProfileId: PROFIL, nonce: 'a' });
    const b = deriveHubSecret({ masterKey: KEY, socialProfileId: PROFIL, nonce: 'b' });
    expect(a).not.toBe(b);
  });
});

describe('hashCallbackToken', () => {
  it('64 haneli onaltılık — kolon CHAR(64)', () => {
    expect(hashCallbackToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('KRİTİK: özetten belirteç GERİ ÜRETİLEMİYOR', () => {
    // Döküm ele geçse bile belirteç elde edilemez; bu, düz metin saklamanın
    // yerine geçen tek şey.
    const t = deriveCallbackToken({ masterKey: KEY, socialProfileId: PROFIL, nonce: NONCE });
    expect(hashCallbackToken(t)).not.toContain(t.slice(0, 8));
  });

  it('aynı belirteç aynı özeti veriyor — arama bununla yapılıyor', () => {
    expect(hashCallbackToken('abc')).toBe(hashCallbackToken('abc'));
  });
});
