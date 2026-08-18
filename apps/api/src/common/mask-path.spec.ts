import { describe, expect, it } from 'vitest';
import { maskPath } from './mask-path';

/**
 * LOG'DA SIR KALMAMALI.
 *
 * Hata filtresi her istekte yolu yazıyor; sunucu 11+ üretim sitesiyle
 * paylaşımlı ve DEPLOYMENT.md operatöre `pm2 logs` demeyi öğretiyor. Adresinde
 * belirteç taşıyan bir uç nokta, maskeleme olmadan ilk günden sızar.
 */
describe('maskPath', () => {
  it('KRİTİK: YouTube geri çağrı belirteci MASKELENİYOR', () => {
    expect(maskPath('/api/webhooks/youtube/s3cr3t-t0k3n-abc')).toBe(
      '/api/webhooks/youtube/***',
    );
  });

  it('belirteçten SONRAKİ yol korunuyor — hangi uca geldiği görünsün', () => {
    expect(maskPath('/api/webhooks/youtube/tok3n/ping')).toBe(
      '/api/webhooks/youtube/***/ping',
    );
  });

  it('KRİTİK: SORGU DİZESİ tamamen düşürülüyor', () => {
    /*
     * WebSub doğrulaması `hub.verify_token` gibi değerleri sorguda taşıyor.
     * Hangi anahtarın sır olduğunu listeye bağlamak, listeye eklenmeyen bir
     * anahtarın sessizce sızması demekti.
     */
    expect(maskPath('/api/webhooks/youtube/tok3n?hub.verify_token=gizli')).toBe(
      '/api/webhooks/youtube/***?***',
    );
  });

  it('sorgunun VARLIĞI korunuyor — parametreli istek olduğu görünsün', () => {
    expect(maskPath('/api/boosts/posts?clientId=123')).toBe('/api/boosts/posts?***');
  });

  it('sırsız yol AYNEN kalıyor — sorun giderme bozulmuyor', () => {
    expect(maskPath('/api/boosts/manual')).toBe('/api/boosts/manual');
    expect(maskPath('/api/connections/targeting/locations')).toBe(
      '/api/connections/targeting/locations',
    );
  });

  it('boş belirteç maskelenmeye çalışılmıyor', () => {
    expect(maskPath('/api/webhooks/youtube/')).toBe('/api/webhooks/youtube/');
  });

  it('kök ve boş girdi çökertmiyor', () => {
    expect(maskPath('/')).toBe('/');
    expect(maskPath('')).toBe('');
  });
});
