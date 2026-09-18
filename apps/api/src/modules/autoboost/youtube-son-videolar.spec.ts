import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration';
import { YouTubeApiService } from './youtube-api.service';

/**
 * ═══ KANALIN SON VİDEOLARI ═══
 *
 * Kanal bir workspace'e atandığında çekiliyor ve amacı tek: panel BUGÜN dolu
 * açılsın. Bunsuz ilk kart kanalın bir sonraki videosunu bekliyor.
 *
 * İKİ KARAR BURADA KİLİTLENİYOR ve ikisi de sessizce bozulabilir:
 *
 *   1. `search.list` DEĞİL `playlistItems.list`. İlki 100 kota birimi,
 *      ikincisi 1. Günlük kota 10.000 ve `videos.list` her bildirimde
 *      çalışıyor — pahalı yolu seçmek, kotayı asıl işi yapan çağrıdan
 *      çalmak olurdu. Hiçbir hata vermez, yalnızca bir gün "kota doldu".
 *   2. Tarih `contentDetails.videoPublishedAt`tan. `snippet.publishedAt`
 *      videonun LİSTEYE EKLENDİĞİ an ve eski bir video yeniden
 *      yayınlandığında ayrışıyor: kart "bugün yayınlandı" derdi.
 */
const config = {
  platforms: { youtube: { apiKey: 'test-key' } },
} as unknown as AppConfig;

let cagrilar: string[];

function yanitla(govdeler: Record<string, unknown>[]): void {
  let i = 0;
  vi.stubGlobal('fetch', async (url: unknown) => {
    cagrilar.push(String(url));
    const govde = govdeler[i] ?? {};
    i += 1;
    return new Response(JSON.stringify(govde), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

const KANAL_YANITI = {
  items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }],
};

beforeEach(() => {
  cagrilar = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('son videolar', () => {
  it('KRİTİK: `search` uç noktası KULLANILMIYOR — 100 kota birimi', async () => {
    yanitla([KANAL_YANITI, { items: [] }]);
    await new YouTubeApiService(config).listRecentVideos('UCx', 5);
    expect(cagrilar.some((u) => u.includes('/search'))).toBe(false);
    expect(cagrilar.some((u) => u.includes('/playlistItems'))).toBe(true);
  });

  it('KRİTİK: yükleme listesi kimliği SORULUYOR, kanal kimliğinden türetilmiyor', async () => {
    /*
     * `UC…` → `UU…` dönüşümü sahada çalışıyor ama Google garanti etmiyor;
     * garanti edilmeyen bir kısayolun bozulduğu gün belirti "hiç kart
     * gelmiyor" olurdu.
     */
    yanitla([KANAL_YANITI, { items: [] }]);
    await new YouTubeApiService(config).listRecentVideos('UCx', 5);
    expect(cagrilar[0]).toContain('/channels');
    expect(cagrilar[0]).toContain('part=contentDetails');
    expect(cagrilar[1]).toContain('playlistId=UUabc');
  });

  it('KRİTİK: tarih `videoPublishedAt`tan okunuyor', async () => {
    yanitla([
      KANAL_YANITI,
      {
        items: [
          {
            snippet: {
              title: 'Video',
              resourceId: { videoId: 'v1' },
              // LİSTEYE EKLENME ANI — kullanılmamalı.
              publishedAt: '2026-09-18T00:00:00Z',
              thumbnails: { high: { url: 'https://i.ytimg.com/v1.jpg' } },
            },
            contentDetails: { videoId: 'v1', videoPublishedAt: '2026-01-05T10:00:00Z' },
          },
        ],
      },
    ]);
    const sonuc = await new YouTubeApiService(config).listRecentVideos('UCx', 5);
    expect(sonuc.durum).toBe('bulundu');
    if (sonuc.durum !== 'bulundu') return;
    expect(sonuc.videolar[0]?.publishedAt?.toISOString()).toBe('2026-01-05T10:00:00.000Z');
  });

  it('istenen adet uca taşınıyor ve 50 ile sınırlı', async () => {
    // YouTube sayfa başına en fazla 50 döndürüyor; daha büyük bir sayı 400.
    yanitla([KANAL_YANITI, { items: [] }]);
    await new YouTubeApiService(config).listRecentVideos('UCx', 500);
    expect(cagrilar[1]).toContain('maxResults=50');
  });

  it('KRİTİK: yükleme listesi yoksa `bulunamadi` — `hata` DEĞİL', async () => {
    /*
     * İkisi ayrı iş: "kanal duruyor ama video yok" normal, "okuyamadık"
     * arıza. Tek cevapta toplamak, panelde "kanal yanlış mı eklendi"
     * sorusunu cevapsız bırakırdı.
     */
    yanitla([{ items: [] }]);
    const sonuc = await new YouTubeApiService(config).listRecentVideos('UCx', 5);
    expect(sonuc.durum).toBe('bulunamadi');
  });

  it('KRİTİK: Google’ın kendi mesajı taşınıyor', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 403 }),
    );
    const sonuc = await new YouTubeApiService(config).listRecentVideos('UCx', 5);
    expect(sonuc.durum).toBe('hata');
    if (sonuc.durum !== 'hata') return;
    expect(sonuc.message).toContain('API key not valid');
  });

  it('anahtar yoksa AÇIKÇA söylüyor', async () => {
    const sonuc = await new YouTubeApiService({
      platforms: { youtube: { apiKey: '' } },
    } as unknown as AppConfig).listRecentVideos('UCx', 5);
    expect(sonuc.durum).toBe('hata');
    if (sonuc.durum !== 'hata') return;
    expect(sonuc.message).toContain('YOUTUBE_API_KEY');
  });
});
