import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../../config/configuration';

/**
 * YouTube Data API — SADECE OKUMA, sadece doğrulama için.
 *
 * ═══ NEDEN VAR ═══
 *
 * Güvenlik incelemesinin ikinci kritik bulgusu: WebSub bildiriminin Atom
 * gövdesindeki `videoId` hiç doğrulanmıyordu. Başlık, küçük resim ve bağlantı
 * saldırganın verdiği kimlikten türetiliyordu; yani bildirim adresini ele
 * geçiren biri, müşterinin bütçesiyle BAŞKASININ videosunu tanıtabilirdi.
 * Uygunsuz içerik seçilirse politika ihlali ajansın reklam hesabına işler ve
 * zarar tek müşteriyle sınırlı kalmaz.
 *
 * Bu yüzden: ATOM GÖVDESİ TETİKLEYİCİ, VERİ KAYNAĞI DEĞİL. Kart açılmadan
 * önce video buradan okunuyor ve kanal eşleşmesi burada doğrulanıyor.
 *
 * OAUTH DEĞİL, API ANAHTARI. `videos.list` herkese açık veri okuyor ve
 * kullanıcı adına işlem yapmıyor. Yeni bir OAuth kapsamı eklemek canlı Google
 * Ads bağlantısının yeniden yetkilendirilmesini gerektirirdi ve bu projede
 * yeniden yetkilendirme daha önce bağlantıları koparmıştı.
 */

export interface YouTubeVideo {
  id: string;
  channelId: string;
  title: string;
  /** Yalnızca tekil video çağrısında dolu (`getVideo`); listede yok. */
  description?: string;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
}

/**
 * Sonuç ÜÇ HÂLLİ ve üçü ayrı iş.
 *
 * `bulunamadi` ile `hata` birbirine karıştırılmamalı: birincisi "bu kimlik
 * uydurma olabilir" (saldırı sinyali), ikincisi "biz okuyamadık" (arıza).
 * Tek bir `null` dönseydi, kota dolduğunda gelen her meşru bildirim saldırı
 * sayılırdı.
 */
export type YouTubeVideoSonucu =
  | { durum: 'bulundu'; video: YouTubeVideo }
  | { durum: 'bulunamadi' }
  | { durum: 'hata'; message: string };

/**
 * KANALIN SON VİDEOLARI — üçü de ayrı iş.
 *
 * `bos` ile `bulunamadi` ayrı: birincisi "kanal duruyor ama hiç video
 * yüklenmemiş" (yeni açılmış kanal), ikincisi "bu kimlikte kanal yok".
 * İkisini tek cevapta toplamak, panelde "kanal yanlış mı eklendi" sorusunu
 * cevapsız bırakırdı.
 */
export type YouTubeSonVideolarSonucu =
  | { durum: 'bulundu'; videolar: YouTubeVideo[] }
  | { durum: 'bulunamadi' }
  | { durum: 'hata'; message: string };

export interface YouTubeKanal {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface YouTubeKanalDetayi {
  channelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  aboneSayisi: number | null;
  videoSayisi: number | null;
}

const ANAHTAR_YOK = 'YOUTUBE_API_KEY tanımlı değil; YouTube sorgulanamıyor. Adımlar: docs/DEPLOYMENT.md §5c';

export type YouTubeKanalSonucu =
  | { durum: 'bulundu'; kanal: YouTubeKanal }
  | { durum: 'bulunamadi' }
  | { durum: 'hata'; message: string };

@Injectable()
export class YouTubeApiService {
  private readonly logger = new Logger(YouTubeApiService.name);

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  /** Anahtar tanımlı mı — panelin "bu özellik kapalı" diyebilmesi için. */
  get enabled(): boolean {
    return Boolean(this.config.platforms.youtube.apiKey);
  }

  /**
   * Kanalı çözer — kimlikten ya da tanıtıcıdan.
   *
   * `forHandle` PARAMETRESİ AYRI: kanal kimliği ile tanıtıcı farklı alanlara
   * gidiyor ve birini diğerinin yerine göndermek boş sonuç veriyor — hata
   * değil, BOŞ LİSTE. Yani karıştırılırsa "kanal bulunamadı" gibi görünür ve
   * kullanıcı yapıştırdığı adresi suçlar.
   */
  async getChannel(
    girdi: { kind: 'id'; channelId: string } | { kind: 'handle'; handle: string },
  ): Promise<YouTubeKanalSonucu> {
    const key = this.config.platforms.youtube.apiKey;
    if (!key) {
      return {
        durum: 'hata',
        message:
          'YOUTUBE_API_KEY tanımlı değil; kanal doğrulanamıyor. ' +
          'Adımlar: docs/DEPLOYMENT.md §5c',
      };
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet');
    if (girdi.kind === 'id') url.searchParams.set('id', girdi.channelId);
    else url.searchParams.set('forHandle', `@${girdi.handle}`);
    url.searchParams.set('key', key);

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      return {
        durum: 'hata',
        message: `YouTube API'ye ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const govde = (await res.json().catch(() => null)) as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; thumbnails?: Record<string, { url?: string } | undefined> };
      }>;
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      const mesaj = govde?.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`YouTube kanal sorgusu ${res.status}: ${mesaj}`);
      return { durum: 'hata', message: `YouTube API: ${mesaj}` };
    }

    const item = govde?.items?.[0];
    // BOŞ LİSTE = KANAL YOK. Var olmayan kimlik/tanıtıcı için 404 değil, 200
    // ve boş `items` dönüyor.
    if (!item?.id) return { durum: 'bulunamadi' };

    return {
      durum: 'bulundu',
      kanal: {
        channelId: item.id,
        title: item.snippet?.title ?? item.id,
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
      },
    };
  }

  async getVideo(videoId: string): Promise<YouTubeVideoSonucu> {
    const key = this.config.platforms.youtube.apiKey;
    if (!key) {
      /*
       * ANAHTAR YOKSA "BULUNAMADI" DEĞİL "HATA". İkisini karıştırmak,
       * yapılandırma eksikliğini saldırı sinyaline çevirirdi ve gerçek
       * saldırı sinyali gürültüde kaybolurdu.
       */
      return {
        durum: 'hata',
        message:
          'YOUTUBE_API_KEY tanımlı değil; video doğrulanamıyor ve kart açılmıyor. ' +
          'Adımlar: docs/DEPLOYMENT.md §5c',
      };
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', videoId);
    url.searchParams.set('key', key);

    let res: Response;
    try {
      // ZAMAN AŞIMI ZORUNLU: bu çağrı webhook işleme yolunda ve takılı bir
      // istek, kuyruk işçisini süresiz bloke ederdi.
      res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      return {
        durum: 'hata',
        message: `YouTube API'ye ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const govde = (await res.json().catch(() => null)) as {
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          description?: string;
          channelId?: string;
          publishedAt?: string;
          thumbnails?: Record<string, { url?: string } | undefined>;
        };
      }>;
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      /*
       * GOOGLE'IN KENDİ MESAJI TAŞINIYOR. 403'ün üç ayrı sebebi var (API
       * etkin değil / IP kısıtı / API kısıtı) ve hangisi olduğunu yalnızca
       * Google'ın metni söylüyor. Kendi cümlemizle özetlemek bu projede
       * defalarca teşhisi yanlış yere götürdü.
       */
      const mesaj = govde?.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`YouTube API ${res.status}: ${mesaj}`);
      return { durum: 'hata', message: `YouTube API: ${mesaj}` };
    }

    const item = govde?.items?.[0];
    /*
     * BOŞ LİSTE = VİDEO YOK. YouTube var olmayan kimlik için 404 değil, 200
     * ve boş `items` döndürüyor; `res.ok` kontrolüne güvenmek uydurulmuş her
     * kimliği "bulundu" saymak olurdu.
     */
    if (!item?.snippet?.channelId) return { durum: 'bulunamadi' };

    const t = item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : null;

    return {
      durum: 'bulundu',
      video: {
        id: item.id ?? videoId,
        channelId: item.snippet.channelId,
        title: item.snippet.title ?? '',
        // AÇIKLAMA ZATEN YANITTA — `part=snippet` onu taşıyor. YouTube
        // reklamının açıklama metni buradan üretiliyor; ayrı bir çağrı yok.
        description: item.snippet.description ?? '',
        publishedAt: t && !Number.isNaN(+t) ? t : null,
        // Sırayla en iyisinden düşene: kart görselini elde edebildiğimiz
        // en yüksek çözünürlükte gösteriyoruz.
        thumbnailUrl:
          item.snippet.thumbnails?.maxres?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          null,
      },
    };
  }
  /**
   * KANALIN SON VİDEOLARI — kanal bir workspace'e atandığı anda çekiliyor.
   *
   * ═══ NEDEN GEREKLİ ═══
   *
   * YouTube tarafında kart YALNIZCA WebSub bildiriminden doğuyor, yani ilk
   * kart ancak kanal atandıktan SONRA yüklenen ilk videoda düşüyor. Haftada
   * bir video yükleyen bir kanalda bu, panelin bir hafta boyunca boş durması
   * demek ve kullanıcı bunu "çalışmıyor" diye okuyor — Instagram tarafında
   * bildirilen belirti birebir buydu.
   *
   * ═══ ARAMA DEĞİL, YÜKLEME OYNATMA LİSTESİ ═══
   *
   * `search.list` ile de son videolar alınabilirdi ama o çağrı 100 KOTA
   * BİRİMİ; burada iki çağrı toplam 2 birim tutuyor. Günlük kota 10.000 ve
   * `videos.list` her bildirimde çalışıyor — pahalı yolu seçmek, kotayı asıl
   * işi yapan çağrıdan çalmak olurdu.
   *
   * YÜKLEME LİSTESİ KİMLİĞİ SORULUYOR, TÜRETİLMİYOR. `UC…` → `UU…` dönüşümü
   * sahada çalışıyor ama Google bunu garanti etmiyor; garanti edilmeyen bir
   * kısayolun bozulduğu gün belirti yine "hiç kart gelmiyor" olurdu.
   *
   * SHORTS DA BU LİSTEDE. Yükleme oynatma listesi kısa videoları da taşıyor,
   * yani ayrı bir çağrıya gerek yok.
   */
  async listRecentVideos(channelId: string, limit: number): Promise<YouTubeSonVideolarSonucu> {
    const key = this.config.platforms.youtube.apiKey;
    if (!key) {
      return {
        durum: 'hata',
        message:
          'YOUTUBE_API_KEY tanımlı değil; kanalın son videoları çekilemiyor. ' +
          'Adımlar: docs/DEPLOYMENT.md §5c',
      };
    }

    // --- 1. Yükleme oynatma listesinin kimliği
    const kanalUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    kanalUrl.searchParams.set('part', 'contentDetails');
    kanalUrl.searchParams.set('id', channelId);
    kanalUrl.searchParams.set('key', key);

    const kanalGovde = await this.iste<{
      items?: Array<{
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }>;
    }>(kanalUrl);
    if (kanalGovde.durum !== 'bulundu') return kanalGovde;

    const liste = kanalGovde.govde.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!liste) return { durum: 'bulunamadi' };

    // --- 2. Listenin başı
    const videoUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    videoUrl.searchParams.set('part', 'snippet,contentDetails');
    videoUrl.searchParams.set('playlistId', liste);
    videoUrl.searchParams.set('maxResults', String(Math.min(Math.max(limit, 1), 50)));
    videoUrl.searchParams.set('key', key);

    const videoGovde = await this.iste<{
      items?: Array<{
        snippet?: {
          title?: string;
          channelId?: string;
          resourceId?: { videoId?: string };
          thumbnails?: Record<string, { url?: string } | undefined>;
        };
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
      }>;
    }>(videoUrl);
    if (videoGovde.durum !== 'bulundu') return videoGovde;

    const videolar: YouTubeVideo[] = [];
    for (const item of videoGovde.govde.items ?? []) {
      const id = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (!id) continue;

      /*
       * TARİH `contentDetails.videoPublishedAt`TAN OKUNUYOR.
       *
       * `snippet.publishedAt` videonun LİSTEYE EKLENDİĞİ an; yükleme
       * listesinde ikisi genelde aynı ama eski bir video yeniden
       * yayınlandığında ayrışıyor ve kart "bugün yayınlandı" derdi.
       */
      const t = item.contentDetails?.videoPublishedAt
        ? new Date(item.contentDetails.videoPublishedAt)
        : null;

      videolar.push({
        id,
        // Kanal kimliği listeden değil ÇAĞRIDAN geliyor: oynatma listesindeki
        // `snippet.channelId` listenin sahibini değil videonun kanalını
        // gösteriyor ve ikisi işbirliği videolarında ayrışabiliyor.
        channelId,
        title: item.snippet?.title ?? '',
        publishedAt: t && !Number.isNaN(+t) ? t : null,
        thumbnailUrl:
          item.snippet?.thumbnails?.maxres?.url ??
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
      });
    }

    return { durum: 'bulundu', videolar };
  }

  /**
   * ═══ KANAL AYRINTISI — KARTIN AYIRT EDİCİ İŞARETLERİ ═══
   *
   * "YouTube kanalını bul" önerilerinin kartında abone ve video sayısı
   * yazıyor: isim benzerliği tek başına kanıt değil ve aynı adlı hayran
   * kanalını firmanın kanalından ayıran şey bu sayılar. Tek istekte 50
   * kanala kadar, 1 kota birimi.
   *
   * Gizlenmiş abone sayısı `null` — "0 abone" yazmak yanlış bilgi olurdu.
   */
  async kanalDetaylari(ids: readonly string[]): Promise<
    | { durum: 'bulundu'; kanallar: YouTubeKanalDetayi[] }
    | { durum: 'hata'; message: string }
  > {
    if (ids.length === 0) return { durum: 'bulundu', kanallar: [] };
    const key = this.config.platforms.youtube.apiKey;
    if (!key) return { durum: 'hata', message: ANAHTAR_YOK };
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics');
    url.searchParams.set('id', [...new Set(ids)].slice(0, 50).join(','));
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', key);
    const r = await this.iste<{
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          customUrl?: string;
          thumbnails?: Record<string, { url?: string } | undefined>;
        };
        statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
      }>;
    }>(url);
    if (r.durum === 'hata') return r;
    return {
      durum: 'bulundu',
      kanallar: (r.govde.items ?? [])
        .filter((i): i is typeof i & { id: string } => Boolean(i.id))
        .map((i) => ({
          channelId: i.id,
          title: i.snippet?.title ?? i.id,
          handle: i.snippet?.customUrl
            ? i.snippet.customUrl.startsWith('@')
              ? i.snippet.customUrl
              : `@${i.snippet.customUrl}`
            : null,
          thumbnailUrl:
            i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? null,
          aboneSayisi:
            i.statistics?.hiddenSubscriberCount || i.statistics?.subscriberCount === undefined
              ? null
              : Number(i.statistics.subscriberCount),
          videoSayisi: i.statistics?.videoCount === undefined ? null : Number(i.statistics.videoCount),
        })),
    };
  }

  /**
   * ═══ İSİMLE KANAL ARAMA — PAHALI ═══
   *
   * `search.list` tek istekte 100 kota birimi; günlük varsayılan kota
   * 10.000, yani günde yaklaşık 100 arama ve aynı kota WebSub bildirimlerinin
   * video doğrulamasını da besliyor. Bu yüzden çağıran önbellek ve sınır
   * koyuyor (`YoutubeKanalBulService`); burada yalnızca kimlikler dönüyor,
   * ayrıntı ucuz `kanalDetaylari`ndan.
   *
   * Türkiye ve Türkçe öncelikli (`regionCode`, `relevanceLanguage`): yoksa
   * "Ege Birlik" araması dünya genelinde ilgisiz kanalları öne alıyor.
   */
  async kanalAra(q: string): Promise<{ durum: 'bulundu'; ids: string[] } | { durum: 'hata'; message: string }> {
    const key = this.config.platforms.youtube.apiKey;
    if (!key) return { durum: 'hata', message: ANAHTAR_YOK };
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'channel');
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('regionCode', 'TR');
    url.searchParams.set('relevanceLanguage', 'tr');
    url.searchParams.set('key', key);
    const r = await this.iste<{ items?: Array<{ id?: { channelId?: string }; snippet?: { channelId?: string } }> }>(url);
    if (r.durum === 'hata') return r;
    const ids = (r.govde.items ?? [])
      .map((i) => i.id?.channelId ?? i.snippet?.channelId ?? null)
      .filter((x): x is string => Boolean(x));
    return { durum: 'bulundu', ids: [...new Set(ids)] };
  }

  /**
   * Videoların KANALI — site gömülü videoları ve Google Ads'teki reklam
   * videoları için. 50 video tek istek, 1 birim. Bulunamayan (silinmiş,
   * gizli) video sonuçta yok; çağıran bunu sayıp söylüyor.
   */
  async videoKanallari(
    videoIds: readonly string[],
  ): Promise<{ durum: 'bulundu'; kanallar: Map<string, string> } | { durum: 'hata'; message: string }> {
    const kanallar = new Map<string, string>();
    const tekil = [...new Set(videoIds)];
    if (tekil.length === 0) return { durum: 'bulundu', kanallar };
    const key = this.config.platforms.youtube.apiKey;
    if (!key) return { durum: 'hata', message: ANAHTAR_YOK };
    for (let i = 0; i < tekil.length; i += 50) {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('id', tekil.slice(i, i + 50).join(','));
      url.searchParams.set('key', key);
      const r = await this.iste<{ items?: Array<{ id?: string; snippet?: { channelId?: string } }> }>(url);
      if (r.durum === 'hata') return r;
      for (const it of r.govde.items ?? []) {
        if (it.id && it.snippet?.channelId) kanallar.set(it.id, it.snippet.channelId);
      }
    }
    return { durum: 'bulundu', kanallar };
  }

  /** Eski `/user/AD` bağlantısı — `forUsername` ile çözülüyor (1 birim). */
  async kanalKullaniciAdiyla(ad: string): Promise<{ durum: 'bulundu'; channelId: string } | { durum: 'bulunamadi' } | { durum: 'hata'; message: string }> {
    const key = this.config.platforms.youtube.apiKey;
    if (!key) return { durum: 'hata', message: ANAHTAR_YOK };
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'id');
    url.searchParams.set('forUsername', ad);
    url.searchParams.set('key', key);
    const r = await this.iste<{ items?: Array<{ id?: string }> }>(url);
    if (r.durum === 'hata') return r;
    const id = r.govde.items?.[0]?.id;
    return id ? { durum: 'bulundu', channelId: id } : { durum: 'bulunamadi' };
  }

  /**
   * ORTAK İSTEK — iki çağrının da hata yolu AYNI olmak zorunda.
   *
   * Ayrı yazılsaydı biri Google'ın kendi mesajını taşır, diğeri "HTTP 403"
   * derdi; 403'ün üç ayrı sebebi var ve hangisi olduğunu yalnızca Google'ın
   * metni söylüyor.
   */
  private async iste<T>(
    url: URL,
  ): Promise<{ durum: 'bulundu'; govde: T } | { durum: 'hata'; message: string }> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      return {
        durum: 'hata',
        message: `YouTube API'ye ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const govde = (await res.json().catch(() => null)) as (T & {
      error?: { message?: string };
    }) | null;

    if (!res.ok || !govde) {
      const mesaj = govde?.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`YouTube API ${res.status}: ${mesaj}`);
      return { durum: 'hata', message: `YouTube API: ${mesaj}` };
    }

    return { durum: 'bulundu', govde };
  }
}
