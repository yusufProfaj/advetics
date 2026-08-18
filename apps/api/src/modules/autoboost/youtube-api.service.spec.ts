import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration';
import { YouTubeApiService } from './youtube-api.service';

/**
 * VİDEO DOĞRULAMASI — güvenlik incelemesinin ikinci bulgusunun karşılığı.
 *
 * Atom gövdesindeki `videoId` doğrulanmazsa, bildirim adresini ele geçiren
 * biri müşterinin bütçesiyle BAŞKASININ videosunu tanıtabiliyor. Bu servis
 * gövdeye güvenmeyip veriyi kaynağından alıyor.
 */

function svc(apiKey?: string): YouTubeApiService {
  return new YouTubeApiService({
    platforms: { youtube: { apiKey } },
  } as unknown as AppConfig);
}

const ORIJINAL = global.fetch;
afterEach(() => {
  global.fetch = ORIJINAL;
  vi.restoreAllMocks();
});

function fetchDondur(status: number, body: unknown): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('anahtar yoksa', () => {
  it('`enabled` false', () => {
    expect(svc().enabled).toBe(false);
    expect(svc('AIza-x').enabled).toBe(true);
  });

  it('KRİTİK: "bulunamadi" DEĞİL "hata" dönüyor', async () => {
    /*
     * İkisini karıştırmak, yapılandırma eksikliğini SALDIRI SİNYALİNE
     * çevirirdi ve gerçek saldırı sinyali gürültüde kaybolurdu.
     */
    const r = await svc().getVideo('abc');
    expect(r.durum).toBe('hata');
    expect(r.durum === 'hata' && r.message).toMatch(/YOUTUBE_API_KEY/);
  });

  it('hata mesajı YAPILACAK İŞİ söylüyor', async () => {
    const r = await svc().getVideo('abc');
    expect(r.durum === 'hata' && r.message).toMatch(/DEPLOYMENT/);
  });
});

describe('başarılı okuma', () => {
  beforeEach(() => {
    fetchDondur(200, {
      items: [
        {
          id: 'dQw4w9WgXcQ',
          snippet: {
            title: 'Yazlığınız Olsun',
            channelId: 'UCBR8-60-B28hp2BmDPdntcQ',
            publishedAt: '2026-08-18T10:00:00Z',
            thumbnails: {
              default: { url: 'd.jpg' },
              medium: { url: 'm.jpg' },
              high: { url: 'h.jpg' },
              maxres: { url: 'x.jpg' },
            },
          },
        },
      ],
    });
  });

  it('KRİTİK: kanal kimliği KAYNAKTAN geliyor, gövdeden değil', async () => {
    const r = await svc('AIza-x').getVideo('dQw4w9WgXcQ');
    expect(r.durum).toBe('bulundu');
    expect(r.durum === 'bulundu' && r.video.channelId).toBe('UCBR8-60-B28hp2BmDPdntcQ');
  });

  it('başlık ve tarih de kaynaktan — kart içeriği saldırganın elinde değil', async () => {
    const r = await svc('AIza-x').getVideo('dQw4w9WgXcQ');
    expect(r.durum === 'bulundu' && r.video.title).toBe('Yazlığınız Olsun');
    expect(r.durum === 'bulundu' && r.video.publishedAt?.toISOString()).toBe(
      '2026-08-18T10:00:00.000Z',
    );
  });

  it('en yüksek çözünürlüklü küçük resim seçiliyor', async () => {
    const r = await svc('AIza-x').getVideo('dQw4w9WgXcQ');
    expect(r.durum === 'bulundu' && r.video.thumbnailUrl).toBe('x.jpg');
  });

  it('yalnızca düşük çözünürlük varsa ona düşüyor', async () => {
    fetchDondur(200, {
      items: [{ id: 'v', snippet: { channelId: 'UC1', thumbnails: { default: { url: 'd.jpg' } } } }],
    });
    const r = await svc('AIza-x').getVideo('v');
    expect(r.durum === 'bulundu' && r.video.thumbnailUrl).toBe('d.jpg');
  });
});

describe('bulunamayan video', () => {
  it('KRİTİK: BOŞ LİSTE "bulunamadi" — 200 geldi diye "bulundu" sayılmıyor', async () => {
    /*
     * YouTube var olmayan kimlik için 404 değil, 200 ve boş `items`
     * döndürüyor. `res.ok` kontrolüne güvenmek, uydurulmuş HER kimliği
     * "bulundu" saymak olurdu — yani doğrulamayı tamamen etkisiz kılardı.
     */
    fetchDondur(200, { items: [] });
    expect((await svc('AIza-x').getVideo('uydurma')).durum).toBe('bulunamadi');
  });

  it('kanal kimliği OLMAYAN kayıt da bulunamadı sayılıyor', async () => {
    // Kısmi cevapla doğrulama yapılamaz; eksik veriyle kart açmak,
    // doğrulamayı atlamakla aynı şey.
    fetchDondur(200, { items: [{ id: 'v', snippet: { title: 'x' } }] });
    expect((await svc('AIza-x').getVideo('v')).durum).toBe('bulunamadi');
  });
});

describe('API hataları', () => {
  it('KRİTİK: GOOGLE’IN KENDİ MESAJI taşınıyor', async () => {
    /*
     * 403'ün üç ayrı sebebi var (API etkin değil / IP kısıtı / API kısıtı) ve
     * hangisi olduğunu yalnızca Google'ın metni söylüyor. Kendi cümlemizle
     * özetlemek bu projede defalarca teşhisi yanlış yere götürdü.
     */
    fetchDondur(403, { error: { message: 'YouTube Data API v3 has not been used in project…' } });
    const r = await svc('AIza-x').getVideo('v');
    expect(r.durum).toBe('hata');
    expect(r.durum === 'hata' && r.message).toContain('has not been used in project');
  });

  it('gövdesiz hatada HTTP kodu gösteriliyor', async () => {
    fetchDondur(500, null);
    const r = await svc('AIza-x').getVideo('v');
    expect(r.durum === 'hata' && r.message).toContain('500');
  });

  it('KRİTİK: ağ hatası "bulunamadi" DEĞİL "hata"', async () => {
    // Ağ arızasını saldırı sinyaline çevirmek, gerçek sinyali gürültüde
    // boğardı.
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;
    const r = await svc('AIza-x').getVideo('v');
    expect(r.durum).toBe('hata');
    expect(r.durum === 'hata' && r.message).toContain('ECONNRESET');
  });

  it('zaman aşımı sinyali VERİLİYOR — takılı istek işçiyi bloke etmesin', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    global.fetch = f as unknown as typeof fetch;
    await svc('AIza-x').getVideo('v');
    expect(f.mock.calls[0]![1]).toHaveProperty('signal');
  });
});
