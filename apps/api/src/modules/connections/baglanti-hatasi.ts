import { PlatformApiError, type PlatformErrorKind } from './provider.types';

/**
 * ═══ YETKİLENDİRME DÜŞTÜĞÜNDE KULLANICI NE YAPACAĞINI BİLMELİ ═══
 *
 * OAuth dönüşü başarısız olduğunda panel platformun HAM mesajını basıyordu.
 * Üretimde görülen hâli:
 *
 *   Bağlantı kurulamadı
 *   (#4) Application request limit reached · fbtrace=AuzMkXw_q6mdNlu1tKTE6O1
 *
 * Bu cümle doğru ama bu ürünün kullanıcısına hiçbir şey söylemiyor. Hedef
 * kullanıcı reklamcılık bilmiyor, Graph hata kodu hiç bilmiyor; gördüğü şey
 * "bir şey bozuldu" ve yapacağı şey ya tekrar tekrar denemek (kotayı daha da
 * yakıyor) ya da bağlantıyı KALDIRMAK — ki o, bu kod tabanında en pahalı
 * yanlış hamle.
 *
 * `err.kind` bu bilgiyi ZATEN taşıyor ve denetim kaydına da yazılıyordu; eksik
 * olan tek şey onu kullanıcıya çevirmekti. Kod 4 `rate_limited`, yani GEÇİCİ:
 * doğru davranış beklemek.
 *
 * PLATFORMUN KENDİ MESAJI SİLİNMİYOR, ÖNÜNE AÇIKLAMA EKLENİYOR. Ham metni
 * atmak teşhisi imkânsızlaştırır — `fbtrace` Meta'ya soru sorarken istenen
 * şeyin ta kendisi ve hangi kodun geldiği bizim için de tek ipucu.
 */
const ACIKLAMA: Record<PlatformErrorKind, string> = {
  /*
   * KOTA AJANSIN TAMAMI İÇİN ORTAK. Meta'da #4 uygulama düzeyinde: tek bir
   * reklam hesabı değil, o uygulamayla yapılan BÜTÜN çağrılar aynı havuzdan
   * yiyor. Yani gece senkronizasyonu ya da bir hesap taraması sürerken
   * yetkilendirmeye kalkmak düşüyor. Bunu söylememek, kullanıcıyı kendi
   * kurulumunda olmayan bir arızayı aramaya gönderiyor.
   */
  rate_limited:
    'Platformun istek kotası şu an dolu. Bu geçici — birkaç dakika bekleyip tekrar dene. ' +
    'Kota ajansın bütün hesapları için ortak, yani süren bir senkronizasyon da tüketmiş olabilir.',
  invalid_token:
    'Platform yetkilendirmeyi kabul etmedi. İzin ekranını baştan tamamlaman gerekiyor.',
  permission_denied:
    'Platform bu erişimi reddetti. Hesabın gerekli yetkiye sahip olduğundan emin ol.',
  transient: 'Platform geçici olarak yanıt veremedi. Birkaç dakika sonra tekrar dene.',
  /*
   * KALICI HATADA "TEKRAR DENE" DEMİYORUZ. Yanlış tavsiye, tavsiyesizlikten
   * kötü: kullanıcı beş kez dener, her seferinde aynı sonucu alır ve arızayı
   * kendi yaptığı bir şeyde arar.
   */
  permanent: 'Platform isteği reddetti; aynı istek yinelendiğinde de reddedilecek.',
};

/**
 * Yetkilendirme hatasını kullanıcının okuyabileceği bir cümleye çevirir.
 *
 * `PlatformApiError` olmayan hatalarda HAM METİN dönüyor: uydurulmuş bir
 * açıklama, bilinmeyen bir hatayı bilinen gibi gösterir.
 */
export function baglantiHatasiMetni(err: unknown): string {
  const ham = err instanceof Error ? err.message : String(err);
  if (!(err instanceof PlatformApiError)) return ham;
  return `${ACIKLAMA[err.kind]} · ${ham}`;
}
