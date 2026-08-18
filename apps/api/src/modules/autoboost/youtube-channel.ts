/**
 * KULLANICININ YAPIŞTIRDIĞI ŞEYDEN KANAL KİMLİĞİ ÇIKARMA.
 *
 * ═══ NEDEN ELLE YAPIŞTIRMA ═══
 *
 * Bağlı kanalları otomatik listelemek YouTube Data API'nin OAuth kapsamını
 * (`youtube.readonly`) gerektiriyor ve o kapsam canlı Google Ads bağlantısının
 * YENİDEN YETKİLENDİRİLMESİ demek — CLAUDE.md'ye göre yeniden yetkilendirme
 * daha önce bağlantıları kopardı. Yapıştırma yolu aynı sonucu API ANAHTARIYLA
 * veriyor: kanal `channels.list` ile doğrulanıyor, herkese açık veri.
 *
 * KULLANICI NE YAPIŞTIRACAĞINI BİLMİYOR ve bilmesi de gerekmiyor. Sahadan
 * gelen biçimler:
 *
 *   UC1234567890abcdefghijkl              — ham kanal kimliği
 *   @kanaladi                             — tanıtıcı (handle)
 *   youtube.com/channel/UC12345…          — kanal adresi
 *   youtube.com/@kanaladi                 — tanıtıcı adresi
 *   youtube.com/c/OzelAd                  — eski özel adres
 *   youtube.com/user/EskiKullanici        — çok eski kullanıcı adresi
 *   .../@kanaladi/videos?foo=bar          — panelden kopyalanan hâli
 *
 * SON İKİSİ ÇÖZÜLEMİYOR ve bu bilinçli: `/c/` ve `/user/` yollarını kanala
 * çevirmenin API'de doğrudan karşılığı yok (`forUsername` yalnızca çok eski
 * hesaplarda çalışıyor ve çoğunda boş dönüyor). Tahmin etmek yerine
 * kullanıcıya NE YAPACAĞINI söylüyoruz — kanal sayfasındaki `@tanıtıcı`yı
 * yapıştırması yeterli.
 */

export type KanalGirdisi =
  | { kind: 'id'; channelId: string }
  | { kind: 'handle'; handle: string }
  | { kind: 'unsupported'; reason: string };

/** Kanal kimlikleri `UC` ile başlıyor ve 24 karakter. */
const KANAL_KIMLIGI = /^UC[A-Za-z0-9_-]{22}$/;

export function parseChannelInput(raw: string): KanalGirdisi {
  const girdi = raw.trim();
  if (!girdi) {
    return { kind: 'unsupported', reason: 'Kanal bağlantısı ya da kimliği boş.' };
  }

  // --- Ham kimlik
  if (KANAL_KIMLIGI.test(girdi)) return { kind: 'id', channelId: girdi };

  // --- Ham tanıtıcı
  if (girdi.startsWith('@')) {
    const h = girdi.slice(1).split(/[/?#]/)[0] ?? '';
    return h ? { kind: 'handle', handle: h } : { kind: 'unsupported', reason: 'Tanıtıcı boş.' };
  }

  /*
   * ADRES AYRIŞTIRMASI. Şema eksik yapıştırılabiliyor (`youtube.com/@x`), o
   * yüzden yoksa ekleniyor — `new URL` şemasız girdiyi reddediyor ve kullanıcı
   * hatayı kendi yazımında arardı.
   */
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(girdi) ? girdi : `https://${girdi}`);
  } catch {
    return {
      kind: 'unsupported',
      reason:
        'Anlaşılamadı. Kanal sayfasındaki adresi ya da @tanıtıcıyı yapıştır ' +
        '(örnek: @kanaladi).',
    };
  }

  if (!/(^|\.)youtube\.com$/i.test(url.hostname) && !/(^|\.)youtu\.be$/i.test(url.hostname)) {
    return { kind: 'unsupported', reason: 'Bu bir YouTube adresi değil.' };
  }

  // Boş segmentler atılıyor: sondaki eğik çizgi ya da çift çizgi kırmasın.
  const parcalar = url.pathname.split('/').filter(Boolean);
  const ilk = parcalar[0] ?? '';

  if (ilk === 'channel') {
    const id = parcalar[1] ?? '';
    return KANAL_KIMLIGI.test(id)
      ? { kind: 'id', channelId: id }
      : { kind: 'unsupported', reason: 'Adresteki kanal kimliği geçerli görünmüyor.' };
  }

  if (ilk.startsWith('@')) {
    const h = ilk.slice(1);
    return h ? { kind: 'handle', handle: h } : { kind: 'unsupported', reason: 'Tanıtıcı boş.' };
  }

  if (ilk === 'c' || ilk === 'user') {
    /*
     * ÇÖZÜLEMİYOR VE TAHMİN EDİLMİYOR. `forUsername` yalnızca çok eski
     * hesaplarda çalışıyor; çoğunda boş dönüyor ve "kanal bulunamadı" gibi
     * görünüyor — oysa sorun kullanıcının yapıştırdığı biçimde. Ne yapacağını
     * söylemek, yanlış bir tahminden iyi.
     */
    return {
      kind: 'unsupported',
      reason:
        'Bu eski biçimdeki adres kanala çevrilemiyor. Kanal sayfasını açıp ' +
        'adres çubuğundaki @tanıtıcıyı yapıştır (örnek: @kanaladi).',
    };
  }

  if (ilk === 'watch' || url.searchParams.has('v') || url.hostname.endsWith('youtu.be')) {
    // Sık yapılan karışıklık: video adresi yapıştırılıyor.
    return {
      kind: 'unsupported',
      reason: 'Bu bir VİDEO adresi. Kanalın adresini ya da @tanıtıcısını yapıştır.',
    };
  }

  return {
    kind: 'unsupported',
    reason:
      'Anlaşılamadı. Kanal sayfasındaki adresi ya da @tanıtıcıyı yapıştır ' +
      '(örnek: @kanaladi).',
  };
}
