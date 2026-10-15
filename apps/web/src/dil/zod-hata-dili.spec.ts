import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ingilizceZodHatalari, loginSchema, turkceZodHatalari } from '@advetics/shared';

/**
 * Zod hata haritaları dal dal eşli (`zod-turkce.ts`). Bir dal yalnız
 * Türkçeye eklenirse o hata İngilizce ekranda Zod'un ham mesajıyla çıkar;
 * burada her dal iki haritada da KENDİ cümlesini üretmeli.
 */
const ORNEKLER: [string, z.ZodTypeAny, unknown][] = [
  ['zorunlu', z.object({ a: z.string() }), {}],
  ['tür', z.string(), 5],
  ['e-posta', z.string().email(), 'x'],
  ['uuid', z.string().uuid(), 'x'],
  ['url', z.string().url(), 'x'],
  ['regex', z.string().regex(/^a$/), 'b'],
  ['kısa dizge 1', z.string().min(1), ''],
  ['kısa dizge 5', z.string().min(5), 'ab'],
  ['kısa dizi', z.array(z.number()).min(2), [1]],
  ['küçük sayı', z.number().min(3), 1],
  ['uzun dizge', z.string().max(1), 'ab'],
  ['uzun dizi', z.array(z.number()).max(1), [1, 2]],
  ['büyük sayı', z.number().max(1), 5],
  ['enum', z.enum(['a', 'b']), 'c'],
];

describe('zod hata dili', () => {
  it.each(ORNEKLER)('%s: iki haritada da kendi cümlesi', (_ad, sema, deger) => {
    const tr = sema.safeParse(deger, { errorMap: turkceZodHatalari });
    const en = sema.safeParse(deger, { errorMap: ingilizceZodHatalari });
    const ham = sema.safeParse(deger, { errorMap: (_i, c) => ({ message: c.defaultError }) });
    const [t, e, h] = [tr, en, ham].map((r) => (r.success ? '' : r.error.issues[0]!.message));
    expect(t).not.toBe('');
    expect(e).not.toBe(t);
    // İngilizce harita ham mesaja düşmemeli (dal eksik demektir), Türkçe zaten düşemez.
    expect(e).not.toBe(h);
  });

  it('giriş şemasında sabit Türkçe mesaj yok: hata dile göre', () => {
    const r = loginSchema.safeParse({ email: 'x', password: '' }, { errorMap: ingilizceZodHatalari });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toEqual(['Not a valid email address', 'Cannot be empty']);
    }
  });
});
