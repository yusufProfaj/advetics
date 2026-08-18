import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  abonelikSagligi,
  BEKLEYEN_KART_TAVANI,
  decideRateLimit,
  SAATLIK_BILDIRIM_SINIRI,
  decideNotificationAccept,
  decideVideoBelongsToChannel,
  AZAMI_KIRALAMA_SN,
  decideWebSubVerification,
  parseYouTubeFeed,
  VARSAYILAN_KIRALAMA_SN,
  verifyWebSubSignature,
  yenilemeZamani,
  youtubeThumbnailUrl,
  youtubeTopicUrl,
  youtubeWatchUrl,
  YOUTUBE_HUB_URL,
} from './youtube-websub';

/**
 * YOUTUBE WEBSUB — bu uç kimlik doğrulamasız, internete açık ve tetiklediği
 * zincirin sonunda PARA HARCAYAN bir reklam yayını var.
 *
 * Testlerin tamamı iki soruya bakıyor:
 *   1. Sahte bir bildirim kabul edilebilir mi?
 *   2. Abonelik SESSİZCE ölebilir mi?
 *
 * İkincisi bu projede birincisi kadar önemli: sessizce ölen bir abonelik
 * panelde "hiç video gelmiyor" olarak görünür ve sebebi YouTube'da, kanalda,
 * izinlerde aranır — kodda hiçbir iz olmaz.
 */

const KANAL = 'UCBR8-60-B28hp2BmDPdntcQ';
const KONU = youtubeTopicUrl(KANAL);

describe('adresler', () => {
  it('KRİTİK: hub adresi SABİT — keşif imkânsız', () => {
    /*
     * YouTube feed'i `Link:` başlığında hub'ı ilan etmiyor, yani WebSub
     * keşfi yapılamıyor. Adresi keşfetmeye çalışan kod hiçbir zaman abone
     * olamaz ve bunu da sessizce yapar.
     */
    expect(YOUTUBE_HUB_URL).toBe('https://pubsubhubbub.appspot.com/subscribe');
  });

  it('konu adresi kanal kimliğinden kuruluyor', () => {
    expect(KONU).toBe(
      'https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCBR8-60-B28hp2BmDPdntcQ',
    );
  });

  it('küçük resim ve izleme adresi kimlikten türetiliyor', () => {
    // Atom gövdesinde küçük resim YOK; kartta göstermek için türetiliyor.
    expect(youtubeThumbnailUrl('abc123')).toContain('abc123');
    expect(youtubeWatchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
  });
});

describe('doğrulama el sıkışması', () => {
  const temel = { expectedTopic: KONU, topic: KONU };

  it('abonelik doğrulaması challenge’ı geri veriyor', () => {
    const k = decideWebSubVerification({
      ...temel,
      mode: 'subscribe',
      challenge: 'xyz',
      leaseSeconds: '432000',
    });
    expect(k).toEqual({ action: 'challenge', challenge: 'xyz', leaseSeconds: 432000 });
  });

  it('KRİTİK: `denied` İŞLENİYOR — sessizce ölmemesi gereken yol', () => {
    /*
     * Hub aboneliği reddettiğinde bunu GET ile bildiriyor ve cevabı
     * umursamıyor. İşlenmezse bizim tarafta kayıt "abone" kalır, panel
     * hiçbir sorun göstermez ve video bildirimi hiç gelmez. Kiralamanın
     * dolmasından çok daha hızlı bir ölüm yolu.
     */
    const k = decideWebSubVerification({
      ...temel,
      mode: 'denied',
      reason: 'topic fetch failed',
    });
    expect(k).toEqual({ action: 'denied', reason: 'topic fetch failed' });
  });

  it('`denied` KONU KONTROLÜNDEN ÖNCE — sebebi kaybolmuyor', () => {
    /*
     * `denied` modunda hub `hub.challenge` göndermiyor ve konuyu da farklı
     * biçimde verebiliyor. Konu kontrolü öne alınsaydı reddedilme "geçersiz
     * istek" gibi görünür ve gerçek sebep kaydedilmezdi.
     */
    const k = decideWebSubVerification({
      expectedTopic: KONU,
      topic: 'baska-konu',
      mode: 'denied',
      reason: 'unauthorized',
    });
    expect(k.action).toBe('denied');
  });

  it('KRİTİK: BAŞKA kanalın konusu REDDEDİLİYOR', () => {
    /*
     * Eşleşme aranmasaydı başkası bizim geri çağrı adresimizi kullanarak
     * KENDİ kanalını abone ettirebilirdi — sonra o kanalın videoları bizim
     * müşterimizin onay kuyruğuna düşerdi.
     */
    const k = decideWebSubVerification({
      expectedTopic: KONU,
      topic: youtubeTopicUrl('UCbaskasi'),
      mode: 'subscribe',
      challenge: 'xyz',
    });
    expect(k.action).toBe('reject');
  });

  it('abonelik iptali ayrı bir sonuç', () => {
    expect(decideWebSubVerification({ ...temel, mode: 'unsubscribe' }).action).toBe(
      'unsubscribed',
    );
  });

  it('challenge yoksa reddediliyor', () => {
    expect(decideWebSubVerification({ ...temel, mode: 'subscribe' }).action).toBe('reject');
  });

  it('bilinmeyen mod reddediliyor', () => {
    expect(decideWebSubVerification({ ...temel, mode: 'pubsub' }).action).toBe('reject');
  });

  it('KRİTİK: `hub.lease_seconds` GELMEZSE null — "süresiz" varsayılmıyor', () => {
    /*
     * Spesifikasyon MUST diyor ama Google'ın uyduğu ölçülmedi. Süresiz
     * varsaymak, yenilemeyi hiç yapmamak ve aboneliğin sessizce ölmesi demek.
     */
    const k = decideWebSubVerification({ ...temel, mode: 'subscribe', challenge: 'x' });
    expect(k).toEqual({ action: 'challenge', challenge: 'x', leaseSeconds: null });
  });

  it('bozuk lease değeri null sayılıyor', () => {
    for (const bozuk of ['abc', '-5', '0', '']) {
      const k = decideWebSubVerification({
        ...temel,
        mode: 'subscribe',
        challenge: 'x',
        leaseSeconds: bozuk,
      });
      expect(k.action === 'challenge' && k.leaseSeconds).toBeNull();
    }
  });
});

describe('kiralama yenileme', () => {
  const T0 = new Date('2026-08-18T12:00:00.000Z');

  it('KRİTİK: sürenin %80’inde yenileniyor', () => {
    /*
     * Tam dolum anında yenilemek, ağ hatası ya da kuyruk gecikmesinde
     * aboneliğin ölmesi demek. %80 üç ayrı deneme için yer bırakıyor.
     */
    // 10 gün = 864000 sn; %80'i 691200 sn = 8 gün
    expect(yenilemeZamani(T0, 864_000).toISOString()).toBe('2026-08-26T12:00:00.000Z');
  });

  it('KRİTİK: lease yoksa KISA varsayılana düşüyor, süresiz DEĞİL', () => {
    /*
     * Uzun bir varsayılan, gerçek kiralama daha kısaysa aboneliğin
     * yenilenmeden ölmesi demek — ve ölüm sessiz. Fazladan yenilemenin
     * maliyeti yalnızca birkaç HTTP isteği.
     */
    const t = yenilemeZamani(T0, null);
    expect(t.getTime()).toBeLessThan(T0.getTime() + AZAMI_KIRALAMA_SN * 1000);
    expect(t.getTime()).toBe(T0.getTime() + Math.floor(VARSAYILAN_KIRALAMA_SN * 0.8) * 1000);
  });

  it('varsayılan kiralama BİR GÜN — uzun tutulmuyor', () => {
    expect(VARSAYILAN_KIRALAMA_SN).toBe(86_400);
  });
});

describe('ölü adam düğmesi — abonelik sessizce öldü mü', () => {
  const NOW = new Date('2026-08-18T12:00:00.000Z');

  it('KRİTİK: hiç doğrulanmamış abonelik SORUNLU sayılıyor', () => {
    /*
     * Kanal bağlanmış ama abonelik hiç kurulmamışsa panel "izleniyor" der ve
     * hiç video gelmez. Bu, en sessiz arıza biçimi.
     */
    const s = abonelikSagligi({ now: NOW, verifiedAt: null, leaseSeconds: null });
    expect(s.ok).toBe(false);
    expect(s.message).toMatch(/hiç doğrulanmadı/);
  });

  it('KRİTİK: süresi dolmuş abonelik YAKALANIYOR', () => {
    /*
     * Yenileme işinin kendisi tek noktalı arıza: BullMQ tekrarlı işi
     * kaybolursa (Redis temizlenir, worker yeniden kurulur) yenileme durur,
     * kiralama dolar ve bildirim biter. Hiçbir hata kaydı oluşmaz.
     */
    const s = abonelikSagligi({
      now: NOW,
      verifiedAt: new Date('2026-08-01T12:00:00.000Z'),
      leaseSeconds: 432_000, // 5 gün — 2026-08-06'da doldu
    });
    expect(s.ok).toBe(false);
    expect(s.message).toMatch(/DÜŞMÜYOR/);
    // Mesaj YAPILACAK İŞİ de söylüyor: "sorun var" demek yetmiyor.
    expect(s.message).toMatch(/yeniden izlemeye/);
  });

  it('geçerli abonelik sağlıklı', () => {
    const s = abonelikSagligi({
      now: NOW,
      verifiedAt: new Date('2026-08-17T12:00:00.000Z'),
      leaseSeconds: 432_000,
    });
    expect(s).toEqual({ ok: true, message: null });
  });

  it('lease bilinmiyorsa KISA varsayılanla ölçülüyor', () => {
    // 2 gün önce doğrulanmış, lease bilinmiyor -> 1 günlük varsayılana göre
    // süresi dolmuş sayılıyor. Bilinmeyeni "uzun" saymak sessiz ölüme davet.
    const s = abonelikSagligi({
      now: NOW,
      verifiedAt: new Date('2026-08-16T12:00:00.000Z'),
      leaseSeconds: null,
    });
    expect(s.ok).toBe(false);
  });
});

describe('imza', () => {
  const SECRET = 'cok-gizli';
  const GOVDE = Buffer.from('<feed><yt:videoId>abc</yt:videoId></feed>');

  function imzala(alg: string, secret = SECRET, govde = GOVDE): string {
    return `${alg}=${createHmac(alg, secret).update(govde).digest('hex')}`;
  }

  it('geçerli SHA1 imzası kabul ediliyor', () => {
    expect(
      verifyWebSubSignature({ header: imzala('sha1'), rawBody: GOVDE, secret: SECRET }),
    ).toBe('gecerli');
  });

  it('KRİTİK: ALGORİTMA BAŞLIKTAN okunuyor — sha1 sabit varsayılmıyor', () => {
    /*
     * WebSub 0.4 sha1 diyor ama hub sürümüne göre başka bir değer
     * gönderebiliyor. Sabit varsaymak ya geçerli imzayı geçersiz sayar
     * (özellik hiç çalışmaz) ya da tersini yapar.
     */
    expect(
      verifyWebSubSignature({ header: imzala('sha256'), rawBody: GOVDE, secret: SECRET }),
    ).toBe('gecerli');
  });

  it('KRİTİK: YANLIŞ imza REDDEDİLİYOR', () => {
    expect(
      verifyWebSubSignature({
        header: imzala('sha1', 'yanlis-secret'),
        rawBody: GOVDE,
        secret: SECRET,
      }),
    ).toBe('gecersiz');
  });

  it('KRİTİK: GÖVDE DEĞİŞTİRİLİRSE imza tutmuyor', () => {
    // İmza ham gövde üzerinden; tek bayt değişse tutmamalı.
    expect(
      verifyWebSubSignature({
        header: imzala('sha1'),
        rawBody: Buffer.from('<feed><yt:videoId>XXX</yt:videoId></feed>'),
        secret: SECRET,
      }),
    ).toBe('gecersiz');
  });

  it('KRİTİK: imza YOKSA "gecerli" DEĞİL, "imzasiz"', () => {
    /*
     * Üç hâl ayrı tutuluyor. "Yoksa geçerli say" demek, ucu tamamen açmak;
     * "yoksa reddet" demek ise Google hub'ı hub.secret'ı dikkate almazsa
     * özelliğin hiç çalışmaması. Kararı çağıran veriyor ve ikinci savunma
     * hatları (belirteç + kanal eşleşmesi) orada devrede.
     */
    expect(
      verifyWebSubSignature({ header: undefined, rawBody: GOVDE, secret: SECRET }),
    ).toBe('imzasiz');
  });

  it('bozuk başlık biçimi geçersiz', () => {
    for (const bozuk of ['abc', 'sha1=', '=deadbeef', 'sha1']) {
      expect(
        verifyWebSubSignature({ header: bozuk, rawBody: GOVDE, secret: SECRET }),
      ).toBe('gecersiz');
    }
  });

  it('KRİTİK: uydurulmuş algoritma ÇÖKMÜYOR, geçersiz sayılıyor', () => {
    // Bilinmeyen algoritmayla HMAC kurmak hata fırlatıyor; yakalanmazsa uç
    // 500 döner ve hub teslimatı başarısız sayıp tekrar tekrar dener.
    expect(
      verifyWebSubSignature({ header: 'sihirli=deadbeef', rawBody: GOVDE, secret: SECRET }),
    ).toBe('gecersiz');
  });

  it('farklı uzunlukta imza ÇÖKMÜYOR', () => {
    // `timingSafeEqual` farklı uzunlukta hata fırlatıyor.
    expect(
      verifyWebSubSignature({ header: 'sha1=aabb', rawBody: GOVDE, secret: SECRET }),
    ).toBe('gecersiz');
  });
});

describe('Atom ayrıştırma', () => {
  const FEED = (over: { published?: string; updated?: string; title?: string } = {}) => `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>yt:video:VIDEO_ID</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>${KANAL}</yt:channelId>
    <title>${over.title ?? 'Yazlığınız Olsun'}</title>
    <published>${over.published ?? '2026-08-18T10:00:00+00:00'}</published>
    <updated>${over.updated ?? '2026-08-18T10:00:05+00:00'}</updated>
  </entry>
</feed>`;

  it('video ve kanal kimliğini çıkarıyor', () => {
    const b = parseYouTubeFeed(FEED());
    expect(b?.videoId).toBe('dQw4w9WgXcQ');
    expect(b?.channelId).toBe(KANAL);
    expect(b?.title).toBe('Yazlığınız Olsun');
    expect(b?.publishedAt?.toISOString()).toBe('2026-08-18T10:00:00.000Z');
  });

  it('KRİTİK: yeni yayın GÜNCELLEME sayılmıyor', () => {
    // Google ilk yayında `published` ve `updated` değerlerini saniye farkıyla
    // üretebiliyor; eşitlik aransaydı her yeni video "güncelleme" sanılırdı.
    expect(parseYouTubeFeed(FEED())?.guncelleme).toBe(false);
  });

  it('KRİTİK: BAŞLIK DEĞİŞİKLİĞİ güncelleme olarak işaretleniyor', () => {
    /*
     * Hub, videonun başlığı değiştiğinde de bildirim gönderiyor ve gövde ilk
     * yayındakiyle neredeyse aynı. Ayırt edilmezse aynı video için ikinci bir
     * kart denenir; kuyruktaki tekillik kısıtı onu yakalıyor ama SEBEBİ
     * kaydedilmeden — "neden kart gelmedi" sorusu cevapsız kalırdı.
     */
    const b = parseYouTubeFeed(
      FEED({ published: '2026-08-10T10:00:00+00:00', updated: '2026-08-18T10:00:00+00:00' }),
    );
    expect(b?.guncelleme).toBe(true);
  });

  it('KRİTİK: SİLME bildirimi null dönüyor', () => {
    // `at:deleted-entry` gövdesi `entry` taşımıyor; kimlik yoksa kart
    // üretilmemeli.
    const silme = `<?xml version='1.0'?><feed xmlns:at="http://purl.org/atompub/tombstones/1.0">
      <at:deleted-entry ref="yt:video:abc" when="2026-08-18T10:00:00+00:00"/></feed>`;
    expect(parseYouTubeFeed(silme)).toBeNull();
  });

  it('bozuk/boş gövde null dönüyor — çökmüyor', () => {
    expect(parseYouTubeFeed('')).toBeNull();
    expect(parseYouTubeFeed('<feed></feed>')).toBeNull();
    expect(parseYouTubeFeed('{"json":"degil"}')).toBeNull();
  });

  it('KRİTİK: XML varlıkları çözülüyor — başlık bozulmuyor', () => {
    // Türkçe başlıklarda tırnak ve & sık geçiyor; çözülmezse kart adında
    // ham varlık görünür.
    const b = parseYouTubeFeed(FEED({ title: 'Yaz &amp; Kış &quot;Fırsat&quot;' }));
    expect(b?.title).toBe('Yaz & Kış "Fırsat"');
  });

  it('öznitelikli etiket de okunuyor', () => {
    const xml = `<feed><yt:videoId>abc</yt:videoId><yt:channelId>UC1</yt:channelId>
      <title type="text">Başlık</title></feed>`;
    expect(parseYouTubeFeed(xml)?.title).toBe('Başlık');
  });
});

/**
 * KAYNAK TARAMASI — birim testinin göremediği tek şey.
 *
 * `timingSafeEqual` yerine `===` koymak BÜTÜN TESTLERDEN GEÇER: sonuç aynı,
 * değişen şey yalnızca karşılaştırmanın sabit sürede yapılıp yapılmadığı.
 * Zamanlama kanalı davranışsal bir testle ölçülemiyor, o yüzden kaynakta
 * kilitleniyor.
 */
describe('imza karşılaştırması SABİT SÜREDE — kaynakta kilitli', () => {
  const SOURCE = readFileSync(join(__dirname, 'youtube-websub.ts'), 'utf8');

  const GOVDE = (() => {
    const bas = SOURCE.indexOf('export function verifyWebSubSignature');
    if (bas < 0) throw new Error('verifyWebSubSignature bulunamadı — tarama boşa düşer');
    const i = SOURCE.indexOf('{', SOURCE.indexOf('): ImzaSonucu', bas));
    let d = 0;
    for (let j = i; j < SOURCE.length; j++) {
      if (SOURCE[j] === '{') d++;
      else if (SOURCE[j] === '}') {
        d--;
        if (d === 0) return SOURCE.slice(i, j + 1);
      }
    }
    throw new Error('gövde kapanmadı');
  })();

  it('tarama BOŞA DÜŞMÜYOR', () => {
    expect(GOVDE.length).toBeGreaterThan(300);
    expect(GOVDE).toContain('createHmac');
  });

  it('KRİTİK: `timingSafeEqual` kullanılıyor', () => {
    expect(GOVDE).toContain('timingSafeEqual');
  });

  it('KRİTİK: imza karşılaştırmasında `===` ya da `!==` YOK', () => {
    /*
     * Bayt bayt sızdıran bir karşılaştırma, saldırganın geçerli imzayı
     * bulmasına imkân verir. Uzunluk kontrolü ayrı ve `.length` üzerinden
     * yapılıyor — o gizli veri değil.
     */
    const imzaSatirlari = GOVDE.split('\n').filter(
      (l) => l.includes('beklenen') || l.includes('gelen'),
    );
    for (const satir of imzaSatirlari) {
      if (satir.includes('.length')) continue;
      expect(satir).not.toMatch(/[!=]==/);
    }
  });
});

/**
 * ÖĞREN-VE-KİLİTLE — güvenlik incelemesinin birinci bulgusunun karşılığı.
 *
 * İlk tasarımda imzasız bildirim koşulsuz kabul ediliyordu. İnceleme bunun
 * imza katmanını DEĞERSİZ kıldığını gösterdi: saldırganın imzayı atlatmak
 * için yapması gereken tek şey başlığı hiç göndermemek.
 */
describe('decideNotificationAccept', () => {
  it('geçerli imza kabul ediliyor ve KİLİT kuruluyor', () => {
    const k = decideNotificationAccept({ imza: 'gecerli', imzaDahaOnceGoruldu: false });
    expect(k).toEqual({ accept: true, imzaDurumu: 'gecerli', kilitle: true, uyari: null });
  });

  it('KRİTİK: YANLIŞ imza her zaman RED ve saldırı sinyali', () => {
    // Meşru bir hub yanlış imza üretmiyor.
    const k = decideNotificationAccept({ imza: 'gecersiz', imzaDahaOnceGoruldu: false });
    expect(k.accept).toBe(false);
    expect(!k.accept && k.saldiriSinyali).toBe(true);
  });

  it('İLK imzasız bildirim kabul ediliyor — özellik ilk günden kapanmıyor', () => {
    /*
     * Google hub'ının `hub.secret`'ı dikkate alıp almadığı ÖLÇÜLMEDİ. Baştan
     * zorunlu kılmak, imzalamıyorsa özelliğin hiç çalışmaması demekti.
     */
    const k = decideNotificationAccept({ imza: 'imzasiz', imzaDahaOnceGoruldu: false });
    expect(k.accept).toBe(true);
    expect(k.accept && k.kilitle).toBe(false);
  });

  it('KRİTİK: imzasız kabul KULLANICIYA SÖYLENİYOR', () => {
    // Bu kartın koruması yalnızca adresin gizli kalmasına dayanıyor ve
    // kullanıcı bunu bilmeli — "sessiz hata yok" kuralının güvenlik karşılığı.
    const k = decideNotificationAccept({ imza: 'imzasiz', imzaDahaOnceGoruldu: false });
    expect(k.accept && k.uyari).toMatch(/imzasız/i);
    expect(k.accept && k.uyari).toMatch(/gizli kalmasına/);
  });

  it('KRİTİK: KİLİT KURULDUKTAN SONRA imzasız bildirim REDDEDİLİYOR', () => {
    /*
     * BU TESTİN KORUDUĞU ŞEY DÜŞÜRME SALDIRISI. Hub imzalıyorsa, imzasız
     * gelen bir istek hub'dan gelmiş olamaz.
     */
    const k = decideNotificationAccept({ imza: 'imzasiz', imzaDahaOnceGoruldu: true });
    expect(k.accept).toBe(false);
    expect(!k.accept && k.reason).toMatch(/düşürme|downgrade/i);
  });

  it('KRİTİK: kilit sonrası imzasız istek SALDIRI SİNYALİ', () => {
    // Sessizce reddetmek, sızmış bir belirtecin haftalarca kullanılmasına
    // izin verirdi.
    const k = decideNotificationAccept({ imza: 'imzasiz', imzaDahaOnceGoruldu: true });
    expect(!k.accept && k.saldiriSinyali).toBe(true);
  });
});

/**
 * GÖVDE TETİKLEYİCİ, VERİ KAYNAĞI DEĞİL — incelemenin ikinci bulgusu.
 *
 * `channelId` bir sır değil (feed adresinde yazıyor), dolayısıyla gövdedeki
 * kanal kimliğini kontrol etmek savunma sayılmaz. Asıl açık `videoId`'nin hiç
 * doğrulanmamasıydı: belirteci bilen biri müşterinin bütçesiyle BAŞKASININ
 * videosunu tanıtabilirdi.
 */
describe('decideVideoBelongsToChannel', () => {
  const KANALIM = 'UCBR8-60-B28hp2BmDPdntcQ';

  it('kanal eşleşiyorsa geçiyor', () => {
    expect(
      decideVideoBelongsToChannel({
        apiChannelId: KANALIM,
        expectedChannelId: KANALIM,
        bulunamadi: false,
      }),
    ).toEqual({ ok: true });
  });

  it('KRİTİK: BAŞKA kanalın videosu REDDEDİLİYOR', () => {
    /*
     * Saldırı senaryosu: doğru channelId (herkese açık) + rakibin ya da
     * uygunsuz bir videonun kimliği. Panelde tanıdık görünen kart belirir,
     * kullanıcı onaylar, müşterinin bütçesiyle başkasının videosu tanıtılır.
     * Uygunsuz içerikte politika ihlali AJANSIN reklam hesabına işler.
     */
    const k = decideVideoBelongsToChannel({
      apiChannelId: 'UCbaskasi',
      expectedChannelId: KANALIM,
      bulunamadi: false,
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.saldiriSinyali).toBe(true);
  });

  it('KRİTİK: BULUNAMAYAN video REDDEDİLİYOR — "belki gecikmiştir" denmiyor', () => {
    /*
     * Geçirmek, uydurulmuş her kimliği kabul etmek demek. Gerçekten gecikme
     * varsa hub bildirimi tekrarlıyor ve ikinci turda bulunuyor.
     */
    const k = decideVideoBelongsToChannel({
      apiChannelId: null,
      expectedChannelId: KANALIM,
      bulunamadi: true,
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.saldiriSinyali).toBe(true);
  });

  it('kanal OKUNAMADIYSA reddediliyor ama saldırı sinyali DEĞİL', () => {
    // API kısmi cevap döndürmüş olabilir; bu bir arıza, saldırı değil.
    // İkisini ayırmak, gerçek saldırı sinyalinin gürültüde kaybolmamasını
    // sağlıyor.
    const k = decideVideoBelongsToChannel({
      apiChannelId: null,
      expectedChannelId: KANALIM,
      bulunamadi: false,
    });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.saldiriSinyali).toBe(false);
  });
});

/**
 * AKIŞ SINIRI — incelemenin dördüncü bulgusu.
 *
 * Kuyruktaki tekillik kısıtı yalnızca AYNI video kimliğini engelliyor.
 * Saldırgan her istekte farklı kimlik gönderirse kısıt hiç devreye girmiyor ve
 * müşterinin gerçek videosu sahte kartların içinde kayboluyor — özellik
 * sessizce işlevsiz kalıyor.
 */
describe('decideRateLimit', () => {
  it('normal akış geçiyor', () => {
    expect(decideRateLimit({ sonSaattekiKart: 2, bekleyenKart: 3 })).toEqual({ allow: true });
  });

  it('KRİTİK: saatlik sınır aşılınca REDDEDİLİYOR', () => {
    const k = decideRateLimit({
      sonSaattekiKart: SAATLIK_BILDIRIM_SINIRI,
      bekleyenKart: 0,
    });
    expect(k.allow).toBe(false);
  });

  it('KRİTİK: saatlik sınır aşımı SIZINTI SİNYALİ', () => {
    /*
     * Meşru bir kanal saatte 10 video yüklemiyor. Bu eşiğin aşılması,
     * bildirim adresinin başkasının eline geçtiğine dair en erken işaret;
     * sessizce atmak o işareti yok etmek olurdu.
     */
    const k = decideRateLimit({ sonSaattekiKart: 25, bekleyenKart: 0 });
    expect(!k.allow && k.sizintiSinyali).toBe(true);
    expect(!k.allow && k.reason).toMatch(/başkasının eline geçmiş/);
  });

  it('KRİTİK: bekleyen kart tavanı SIZINTI SİNYALİ DEĞİL', () => {
    /*
     * Bu genellikle kullanıcının kartları onaylamayı bıraktığı anlamına
     * geliyor, saldırı değil. İkisini aynı uyarıya bağlamak gerçek sinyali
     * gürültüde boğardı.
     */
    const k = decideRateLimit({ sonSaattekiKart: 0, bekleyenKart: BEKLEYEN_KART_TAVANI });
    expect(k.allow).toBe(false);
    expect(!k.allow && k.sizintiSinyali).toBe(false);
    expect(!k.allow && k.reason).toMatch(/onayla ya da reddet/);
  });

  it('saatlik sınır tavandan ÖNCE kontrol ediliyor', () => {
    // İkisi birden aşıldığında söylenmesi gereken şey sızıntı ihtimali;
    // "kartları onayla" mesajı asıl uyarıyı gizlerdi.
    const k = decideRateLimit({ sonSaattekiKart: 99, bekleyenKart: 99 });
    expect(!k.allow && k.sizintiSinyali).toBe(true);
  });

  it('sınırlar GERÇEK YÜKÜN çok üstünde — meşru kullanım etkilenmiyor', () => {
    // Bir kanal saatte 10 video yüklemiyor, bir müşteri 50 kart biriktirmiyor.
    expect(SAATLIK_BILDIRIM_SINIRI).toBeGreaterThanOrEqual(10);
    expect(BEKLEYEN_KART_TAVANI).toBeGreaterThanOrEqual(50);
  });
});
