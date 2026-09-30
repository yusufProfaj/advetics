import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoBoostMecrasi } from '@advetics/shared';

/**
 * KART MECRASI PROFİL TÜRÜNDEN. `platform = meta` hem Instagram hem Facebook
 * sayfası demek; panel hepsini "Instagram" diye sayıyordu (2026-09-30).
 */
describe('autoBoostMecrasi', () => {
  it('KRİTİK: Facebook sayfası Facebook, Instagram Instagram', () => {
    expect(autoBoostMecrasi('meta', 'facebook_page')).toBe('facebook');
    expect(autoBoostMecrasi('meta', 'instagram_business')).toBe('instagram');
    expect(autoBoostMecrasi('google', 'youtube_channel')).toBe('youtube');
  });

  it('KRİTİK: profil görünmüyorsa (RLS) TAHMİN yok — Meta genel adı', () => {
    expect(autoBoostMecrasi('meta', null)).toBe('meta');
    expect(autoBoostMecrasi('meta', 'yeni_bir_tur')).toBe('meta');
  });

  it('YouTube kartı profil görünmese de YouTube (Google\'da tek mecra)', () => {
    expect(autoBoostMecrasi('google', null)).toBe('youtube');
  });
});

describe('okuma sorgusu profil türünü taşıyor', () => {
  const K = readFileSync(join(__dirname, 'autoboost-read.service.ts'), 'utf8');
  it('KRİTİK: SELECT de satır tipi de alanı taşıyor ($queryRaw denetimsiz)', () => {
    expect(K).toContain('sp.profile_type::text AS profile_type');
    expect(K).toContain('profile_type: string | null;');
    expect(K).toContain('mecra: autoBoostMecrasi(r.platform as AutoBoostPlatform, r.profile_type)');
  });
});
