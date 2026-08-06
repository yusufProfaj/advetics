import { describe, expect, it } from 'vitest';
import { normalizeError } from './http';

/**
 * Hata normalleştirme testleri.
 *
 * NEDEN BU TEST VAR: canlı Meta API'sinden gelen ilk gerçek hata
 * `sync_jobs.error_message` kolonuna "Invalid parameter" olarak yazıldı ve
 * hangi parametrenin reddedildiğini öğrenmenin YOLU YOKTU. Meta bu bilgiyi
 * yan alanlarda veriyor (`error_user_title`, `error_data`, `fbtrace_id`);
 * mesaja katılmazsa ham gövde `detail.raw` içinde gömülü kalıyor ve teşhis
 * için erişilebilir değil.
 *
 * Bir hata mesajının değeri, onu okuyan kişinin ne yapacağını bilmesidir.
 */

function metaError(error: Record<string, unknown>, status = 400): PlatformError {
  return normalizeError('meta', new Response(JSON.stringify({ error }), { status }), { error });
}
type PlatformError = ReturnType<typeof normalizeError>;

describe('normalizeError — Meta', () => {
  it('kod 100 mesajını yan alanlarla zenginleştirir', () => {
    const err = metaError({
      message: 'Invalid parameter',
      type: 'OAuthException',
      code: 100,
      error_subcode: 1487749,
      error_user_title: 'Geçersiz effective_status değeri',
      error_data: { blame_field_specs: [['effective_status']] },
      fbtrace_id: 'AbCdEf123',
    });

    // Ham mesaj tek başına işe yaramaz; her ipucu mesajda olmalı.
    expect(err.message).toContain('Invalid parameter');
    expect(err.message).toContain('Geçersiz effective_status değeri');
    expect(err.message).toContain('effective_status');
    expect(err.message).toContain('subcode=1487749');
    expect(err.message).toContain('fbtrace=AbCdEf123');
  });

  it('yan alan yoksa mesajı bozmaz', () => {
    const err = metaError({ message: 'Bir şey ters gitti', code: 100 });
    expect(err.message).toBe('Bir şey ters gitti');
  });

  it('aynı metni iki kez eklemez', () => {
    const err = metaError({
      message: 'Kota doldu',
      code: 17,
      error_user_title: 'Kota doldu',
    });
    expect(err.message.match(/Kota doldu/g)).toHaveLength(1);
  });

  it('ham gövdeyi detail.raw içinde saklar', () => {
    const err = metaError({ message: 'x', code: 100, fbtrace_id: 'T1' });
    expect(JSON.stringify(err.detail?.raw)).toContain('T1');
  });

  it('token hatasını invalid_token olarak sınıflar', () => {
    expect(metaError({ message: 'token süresi doldu', code: 190 }).kind).toBe('invalid_token');
  });

  it('kota hatalarını rate_limited olarak sınıflar ve retry edilebilir işaretler', () => {
    for (const code of [4, 17, 32, 613, 80004]) {
      const err = metaError({ message: 'kota', code });
      expect(err.kind, `kod ${code}`).toBe('rate_limited');
      expect(err.retryable).toBe(true);
    }
  });

  it('bilinmeyen kodu permanent sayar — retry kotayı boşa harcamaz', () => {
    const err = metaError({ message: 'Invalid parameter', code: 100 });
    expect(err.kind).toBe('permanent');
    expect(err.retryable).toBe(false);
  });
});

describe('normalizeError — Google', () => {
  const googleError = (status: string, code = 400) =>
    normalizeError(
      'google',
      new Response(JSON.stringify({ error: { message: 'hata', status } }), { status: code }),
      { error: { message: 'hata', status } },
    );

  it('RESOURCE_EXHAUSTED rate_limited olur', () => {
    const err = googleError('RESOURCE_EXHAUSTED', 429);
    expect(err.kind).toBe('rate_limited');
    expect(err.retryable).toBe(true);
  });

  it('UNAUTHENTICATED invalid_token olur', () => {
    expect(googleError('UNAUTHENTICATED', 401).kind).toBe('invalid_token');
  });

  it('PERMISSION_DENIED permission_denied olur ve retry EDİLMEZ', () => {
    const err = googleError('PERMISSION_DENIED', 403);
    expect(err.kind).toBe('permission_denied');
    expect(err.retryable).toBe(false);
  });
});
