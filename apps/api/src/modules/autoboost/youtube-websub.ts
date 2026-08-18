import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * YOUTUBE WEBSUB (PubSubHubbub) — SAF MANTIK.
 *
 * Bu uç KİMLİK DOĞRULAMASIZ ve internete açık; tetiklediği şey sonunda PARA
 * HARCAYAN bir reklam yayını. Karar mantığı bu yüzden saf fonksiyonlarda:
 * gerçek HTTP olmadan sınanabilsin.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ÜÇ SESSİZ ÖLÜM YOLU VAR ve üçü de burada karşılanıyor
 * ─────────────────────────────────────────────────────────────────────────
 *  1. KİRALAMA DOLUYOR ve hub haber vermiyor (azami ~10 gün).
 *  2. `hub.mode=denied` — kiralamadan çok daha hızlı bir ölüm yolu ve
 *     işlenmesi spesifikasyonda MUST.
 *  3. YENİLEME İŞİNİN KENDİSİ tek noktalı arıza: BullMQ tekrarlı işi
 *     sessizce ölürse bildirim durur ve panelde "hiç video gelmiyor" görünür.
 *     Karşılığı `bildirimGecikmesiUyarisi` — ölü adam düğmesi.
 *
 * HUB ADRESİ SABİT. YouTube feed'i `Link:` başlığında hub'ı ilan etmiyor,
 * yani WebSub keşfi imkânsız.
 */
export const YOUTUBE_HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';

/** Kanalın Atom feed'i — `hub.topic` bu biçimde olmak zorunda. */
export function youtubeTopicUrl(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
}

// -----------------------------------------------------------------------------
// Doğrulama el sıkışması
// -----------------------------------------------------------------------------

/**
 * Hub'ın GET ile gelen doğrulama isteğine ne cevap verileceği.
 *
 * `denied` İŞLENİYOR ve bu maddenin atlanması aboneliğin sessizce bitmesi
 * demek: hub aboneliği reddettiğinde bunu GET ile bildiriyor ve cevabı
 * umursamıyor. Bizim tarafta kayıt "abone" kalırsa panel hiçbir sorun
 * göstermez, video bildirimi de hiç gelmez.
 */
export type WebSubVerification =
  | { action: 'challenge'; challenge: string; leaseSeconds: number | null }
  | { action: 'unsubscribed' }
  | { action: 'denied'; reason: string }
  | { action: 'reject'; reason: string };

export function decideWebSubVerification(params: {
  mode?: string;
  topic?: string;
  challenge?: string;
  leaseSeconds?: string;
  reason?: string;
  /** Bu geri çağrı adresinin bağlı olduğu kanalın beklenen konu adresi. */
  expectedTopic: string;
}): WebSubVerification {
  const { mode, topic, challenge, expectedTopic } = params;

  /*
   * REDDEDİLME ÖNCE KONTROL EDİLİYOR. `denied` modunda hub `hub.challenge`
   * göndermiyor; challenge kontrolü öne alınsaydı reddedilme "geçersiz istek"
   * gibi görünür ve sebebi kaydedilmezdi.
   */
  if (mode === 'denied') {
    return { action: 'denied', reason: params.reason ?? 'hub sebep bildirmedi' };
  }

  /*
   * KONU EŞLEŞMESİ ZORUNLU. Eşleşmezse başkası bizim geri çağrı adresimizi
   * kullanarak kendi kanalını abone ettirebilirdi — sonra o kanalın videoları
   * bizim müşterimizin kuyruğuna düşerdi.
   */
  if (topic !== expectedTopic) {
    return { action: 'reject', reason: 'konu adresi bu geri çağrıya ait değil' };
  }

  if (mode === 'unsubscribe') return { action: 'unsubscribed' };

  if (mode !== 'subscribe') {
    return { action: 'reject', reason: `bilinmeyen mod: ${mode ?? 'yok'}` };
  }

  if (!challenge) {
    return { action: 'reject', reason: 'hub.challenge yok' };
  }

  /*
   * `hub.lease_seconds` GELMEYEBİLİR. Spesifikasyon MUST diyor ama Google'ın
   * uyduğu ölçülmedi. Gelmezse `null` dönüyor ve çağıran KISA bir varsayılana
   * düşüyor — "süresiz" varsaymak, yenilemeyi hiç yapmamak demek olurdu.
   */
  const lease = Number(params.leaseSeconds);
  return {
    action: 'challenge',
    challenge,
    leaseSeconds: Number.isFinite(lease) && lease > 0 ? Math.floor(lease) : null,
  };
}

// -----------------------------------------------------------------------------
// Kiralama yenileme
// -----------------------------------------------------------------------------

/**
 * `hub.lease_seconds` gelmediğinde kullanılacak süre.
 *
 * KISA TUTULUYOR (1 gün). Uzun bir varsayılan, gerçek kiralama daha kısaysa
 * aboneliğin yenilenmeden ölmesi demek — ve ölüm sessiz. Fazladan yenileme
 * yalnızca birkaç HTTP isteği maliyeti.
 */
export const VARSAYILAN_KIRALAMA_SN = 86_400;

/** Hub'ın kabul ettiği azami süre; daha fazlasını istemek anlamsız. */
export const AZAMI_KIRALAMA_SN = 864_000;

/**
 * Yenileme ne zaman yapılmalı?
 *
 * SÜRENİN %80'İNDE. Tam dolum anında yenilemek, ağ hatası ya da kuyruk
 * gecikmesi durumunda aboneliğin ölmesi demek; %80 üç ayrı deneme için yer
 * bırakıyor.
 */
export function yenilemeZamani(dogrulandiAt: Date, leaseSeconds: number | null): Date {
  const sure = leaseSeconds && leaseSeconds > 0 ? leaseSeconds : VARSAYILAN_KIRALAMA_SN;
  return new Date(dogrulandiAt.getTime() + Math.floor(sure * 0.8) * 1000);
}

/**
 * ÖLÜ ADAM DÜĞMESİ — aboneliğin sessizce ölüp ölmediğini söyler.
 *
 * NEDEN GEREKLİ: yenileme işinin kendisi tek noktalı arıza. BullMQ tekrarlı
 * işi kaybolursa (Redis temizlenir, worker yeniden kurulur) yenileme durur,
 * kiralama dolar ve bildirim biter. Hiçbir hata kaydı oluşmaz; panelde
 * yalnızca "hiç video gelmiyor" görünür ve sebebi aranırken YouTube'da,
 * kanalda, izinlerde aranır.
 *
 * Ayrıca hub'ın kendisi bir risk: `pubsubhubbub.appspot.com` bir YouTube API
 * uç noktası değil, Google'ın ücretsiz bir App Engine uygulaması ve YouTube'un
 * kullanımdan kaldırma politikasının kapsamında DEĞİL. Kapanırsa haber
 * verilmeyebilir; bu kontrol onu da yakalar.
 */
export function abonelikSagligi(params: {
  now: Date;
  verifiedAt: Date | null;
  leaseSeconds: number | null;
}): { ok: boolean; message: string | null } {
  if (!params.verifiedAt) {
    return {
      ok: false,
      message:
        'YouTube bildirim aboneliği hiç doğrulanmadı. Kanal bağlandıysa abonelik ' +
        'kurulmamış demektir — yeni videolar kuyruğa düşmez.',
    };
  }

  const sonGecerlilik = new Date(
    params.verifiedAt.getTime() +
      (params.leaseSeconds && params.leaseSeconds > 0
        ? params.leaseSeconds
        : VARSAYILAN_KIRALAMA_SN) *
        1000,
  );

  if (params.now > sonGecerlilik) {
    return {
      ok: false,
      message:
        `YouTube bildirim aboneliğinin süresi ${sonGecerlilik.toLocaleDateString('tr-TR')} ` +
        'tarihinde doldu ve yenilenmedi. Yeni videolar kuyruğa DÜŞMÜYOR. ' +
        'Kanalı yeniden izlemeye alarak abonelik kurulabilir.',
    };
  }

  return { ok: true, message: null };
}

// -----------------------------------------------------------------------------
// İmza
// -----------------------------------------------------------------------------

/**
 * WebSub imzası — META'NINKİNDEN FARKLI ve tek fonksiyonla yapılamaz.
 *
 *   Meta   : `X-Hub-Signature-256`, HMAC-SHA256, gövde JSON
 *   WebSub : `X-Hub-Signature`,     HMAC-SHA1,   gövde Atom XML
 *
 * ALGORİTMA BAŞLIKTAN OKUNUYOR, SABİT VARSAYILMIYOR. Biçim `<alg>=<hex>` ve
 * hub sürümüne göre `sha1` dışında bir değer gönderebiliyor; sabit varsaymak,
 * geçerli bir imzayı geçersiz saymak (özellik hiç çalışmaz) ya da tersi
 * demektir.
 *
 * İMZA YOKSA `'imzasız'` DÖNÜYOR, "geçerli" DEĞİL. Google'ın hub'ının YouTube
 * konularında `hub.secret`'ı dikkate almama ihtimali var ve o durumda başlık
 * hiç gelmiyor. Kararı çağıran veriyor: geri çağrı adresindeki tahmin
 * edilemez belirteç ve kanal kimliği eşleşmesi ikinci savunma hattı olarak
 * duruyor — imzanın yokluğu tek başına kabul sebebi değil.
 */
export type ImzaSonucu = 'gecerli' | 'gecersiz' | 'imzasiz';

export function verifyWebSubSignature(params: {
  header: string | undefined;
  rawBody: Buffer;
  secret: string;
}): ImzaSonucu {
  if (!params.header) return 'imzasiz';

  const [alg, hex] = params.header.split('=');
  if (!alg || !hex) return 'gecersiz';

  let beklenen: Buffer;
  try {
    beklenen = createHmac(alg, params.secret).update(params.rawBody).digest();
  } catch {
    // Bilinmeyen algoritma — uydurulmuş bir başlıkla HMAC kurmaya çalışmak
    // hata fırlatıyor ve bu, geçersiz imzadır.
    return 'gecersiz';
  }

  let gelen: Buffer;
  try {
    gelen = Buffer.from(hex, 'hex');
  } catch {
    return 'gecersiz';
  }

  /*
   * SABİT SÜREDE KARŞILAŞTIRMA. `===` ile karşılaştırmak, saldırganın imzayı
   * bayt bayt bulmasına imkân veren bir zamanlama kanalı açar. Uzunluk
   * kontrolü ayrı: `timingSafeEqual` farklı uzunlukta hata fırlatıyor.
   */
  if (beklenen.length !== gelen.length) return 'gecersiz';
  return timingSafeEqual(beklenen, gelen) ? 'gecerli' : 'gecersiz';
}

// -----------------------------------------------------------------------------
// Atom gövdesi
// -----------------------------------------------------------------------------

export interface YouTubeBildirimi {
  videoId: string;
  channelId: string;
  title: string | null;
  publishedAt: Date | null;
  /** Yayın mı güncelleme mi — ikisi ayırt edilmezse aynı video ikinci kez işlenir. */
  guncelleme: boolean;
}

/**
 * Atom bildirimini ayrıştırır.
 *
 * XML AYRIŞTIRICI KULLANILMIYOR ve bu bilinçli: gövde Google'ın ürettiği
 * sabit şemalı, küçük bir Atom belgesi ve tek bir bağımlılık eklemek —
 * hele XXE saldırılarına açık genel amaçlı bir ayrıştırıcı — bu uç için
 * gereğinden fazla yüzey açardı. Aranan dört alan sabit etiketlerde.
 *
 * SİLME BİLDİRİMİ DE GELİYOR (`at:deleted-entry`) ve `entry` taşımıyor;
 * `null` dönüyor.
 */
export function parseYouTubeFeed(xml: string): YouTubeBildirimi | null {
  const videoId = etiket(xml, 'yt:videoId');
  const channelId = etiket(xml, 'yt:channelId');
  if (!videoId || !channelId) return null;

  const published = etiket(xml, 'published');
  const updated = etiket(xml, 'updated');

  /*
   * YAYIN İLE GÜNCELLEME AYIRT EDİLİYOR.
   *
   * Hub, videonun BAŞLIĞI değiştiğinde de bildirim gönderiyor ve gövde ilk
   * yayındakiyle neredeyse aynı. Ayırt edilmezse aynı video için ikinci bir
   * kart düşer — kuyruktaki tekillik kısıtı onu yakalıyor ama sebebi
   * kaydedilmeden. Burada işaretlenmesi, çağıranın "bu yeni değil" diyebilmesi
   * için.
   *
   * Ölçüt: `updated` ile `published` arasında bir dakikadan fazla fark varsa
   * güncelleme. Eşitlik aranmıyor çünkü Google ikisini aynı olayda saniye
   * farkıyla üretebiliyor.
   */
  const p = published ? new Date(published) : null;
  const u = updated ? new Date(updated) : null;
  const guncelleme =
    p !== null && u !== null && !Number.isNaN(+p) && !Number.isNaN(+u)
      ? +u - +p > 60_000
      : false;

  return {
    videoId,
    channelId,
    title: etiket(xml, 'title'),
    publishedAt: p && !Number.isNaN(+p) ? p : null,
    guncelleme,
  };
}

/** İlk eşleşen etiketin metni. Öznitelikler yok sayılıyor. */
function etiket(xml: string, ad: string): string | null {
  const m = new RegExp(`<${ad}(?:\\s[^>]*)?>([\\s\\S]*?)</${ad}>`).exec(xml);
  if (!m?.[1]) return null;
  return m[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** YouTube küçük resmi — Atom gövdesinde YOK, kimlikten türetiliyor. */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
