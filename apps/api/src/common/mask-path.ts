/**
 * LOG'A YAZILACAK YOLU MASKELER.
 *
 * NEDEN VAR: hata filtresi her istekte `req.originalUrl`'i log'a yazıyor ve
 * bu, adresinde SIR taşıyan bir uç nokta eklendiği anda o sırrı diske döker.
 * Advetics 1.0'ın YouTube bildirim ucu tam olarak öyle: geri çağrı adresi
 * tahmin edilemez bir belirteç taşıyor ve o belirteç, isteği gönderebilmenin
 * tek şartı.
 *
 * SIZINTI YOLU ÜÇ TANE VE ÜÇÜ DE GERÇEK:
 *   1. `pm2` log dosyaları — DEPLOYMENT.md sorun giderme adımı olarak
 *      `pm2 logs` çıktısına bakmayı söylüyor ve o çıktı bir sohbete
 *      yapıştırıldığı an belirteç dışarıdadır.
 *   2. nginx `access_log` her istekte tam yolu yazıyor ve sunucu 11+ üretim
 *      sitesiyle PAYLAŞIMLI.
 *   3. Hata izleri ve destek ekran görüntüleri.
 *
 * MASKELEME BURADA, ÇAĞIRANDA DEĞİL: log yazan her satırın bunu hatırlaması
 * gerekseydi bir gün biri unuturdu — ve unutulduğu yer tam olarak hata
 * yolunda, yani en çok log'a bakılan anda olurdu.
 */

/**
 * Adresinde sır taşıyan yol önekleri.
 *
 * Bir önek eklendiğinde ONDAN SONRAKİ İLK SEGMENT maskeleniyor. Tamamını
 * maskelemek de mümkündü ama o zaman log "hangi uca gelmiş" bilgisini de
 * kaybederdi ve sorun giderme imkânsızlaşırdı.
 */
const SIRLI_ONEKLER = ['/webhooks/youtube/'] as const;

export function maskPath(url: string): string {
  // Sorgu dizesi ayrı ele alınıyor: sır yolda ama sorguda da olabilir ve
  // ikisini tek düzenli ifadeyle yakalamak okunmaz olurdu.
  const [yol, sorgu] = url.split('?') as [string, string | undefined];

  let maskeli = yol;
  for (const onek of SIRLI_ONEKLER) {
    const i = maskeli.indexOf(onek);
    if (i < 0) continue;
    const bas = i + onek.length;
    const kalan = maskeli.slice(bas);
    // Yalnızca İLK segment maskeleniyor; sonrası (varsa) korunuyor.
    const son = kalan.indexOf('/');
    const segment = son < 0 ? kalan : kalan.slice(0, son);
    if (segment.length === 0) continue;
    maskeli = `${maskeli.slice(0, bas)}***${son < 0 ? '' : maskeli.slice(bas + son)}`;
  }

  /*
   * SORGU DİZESİ TAMAMEN DÜŞÜRÜLÜYOR — seçici davranılmıyor.
   *
   * WebSub doğrulaması `hub.challenge` ve `hub.verify_token` gibi değerleri
   * sorguda taşıyor; ikincisi bir sır. Hangi anahtarın sır olduğunu listeye
   * bağlamak, listeye eklenmeyen bir anahtarın sessizce sızması demekti.
   * Sorgunun VARLIĞI korunuyor ki log'da "parametreli istekti" görünsün.
   */
  if (sorgu === undefined) return maskeli;
  return `${maskeli}?***`;
}
