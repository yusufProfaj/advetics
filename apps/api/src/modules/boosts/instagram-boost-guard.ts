/**
 * INSTAGRAM BOOST — artık destekleniyor, ama iki kısıtla.
 *
 * K17 kapandı ve Instagram dalı yazıldı: `object_story_id` Facebook sayfa
 * gönderisine ait; Instagram için ayrı bir `adcreatives` çağrısı ve kök
 * seviyede üç alan gerekiyor (`object_id`, `instagram_user_id`,
 * `source_instagram_media_id`). Bu dosya artık "Instagram yapılamaz" demiyor;
 * KALAN İKİ KISITI tek yerde tutuyor.
 *
 * ---
 *
 * KISIT 1 — ANA SAYFASI OLMAYAN INSTAGRAM SATIRI.
 *
 * Meta'da her reklam bir Facebook sayfasına bağlı ve Instagram satırındaki
 * `external_id` sayfa kimliği DEĞİL, IG kullanıcı kimliği. Sayfa kimliği
 * `social_profiles.parent_page_external_id`de duruyor ve o kolon bu satırlar
 * keşfedildikten SONRA eklendi — üretimdeki eski satırlarda NULL. NULL bir
 * değerle boost denemek, ya reddedilen ya da yanlış kimlikle oluşan bir reklam
 * demek. Çözüm kodda değil: bir kez "Hesapları yenile".
 *
 * KISIT 2 — KURAL YOLU HENÜZ INSTAGRAM'A AÇILMADI.
 *
 * Instagram yazma yolu canlıda henüz doğrulanmadı ve kural motoru OTOMATİK,
 * TEKRAR TEKRAR para harcıyor. Elle boost tek bir bilinçli tıklama, kural ise
 * günde iki kez kendi kendine çalışan bir motor: doğrulanmamış bir yazma
 * yolunu ilk kez otomasyona vermek, bu belgenin bütün teşhisine (§2) aykırı.
 *
 * Yani ayrım "Instagram desteklenmiyor" değil, "doğrulanmamış bir yol önce
 * ELLE denenir". İlk gerçek çağrı Ads Manager'da gözle doğrulandıktan sonra
 * bu kısıt kalkacak ve `assertProfile` ile aday seçicideki süzgeç silinecek.
 */

/** Boost yolunun tanıdığı profil türleri — `social_profiles.profile_type`. */
export type BoostProfileType = 'facebook_page' | 'instagram_business';

/**
 * KARŞILAŞTIRMA TEK YERDE. Beş çağrı noktasında `=== 'instagram_business'`
 * yazmak, bir gün birinde yazım hatası yapmak demek — ve o hata sessizce
 * `false` döner, yani Instagram satırını Facebook gibi işler. Kimlik
 * uzaylarının karıştığı yer tam olarak burası.
 */
export function isInstagramProfile(profileType: string): boolean {
  return profileType === 'instagram_business';
}

/**
 * Ana sayfası olmayan Instagram satırı — KISIT 1.
 *
 * Ne olduğunu VE ne yapılacağını söylüyor; "desteklenmiyor" tek başına
 * kullanıcıyı ekranda çözüm ararken bırakır.
 */
export const INSTAGRAM_PARENT_PAGE_MISSING =
  'Bu Instagram hesabının bağlı olduğu Facebook sayfası kayıtlarda yok. ' +
  'Platform Bağlantıları ekranından "Hesapları yenile" çalıştır — Meta’da her ' +
  'reklam bir Facebook sayfasına bağlı ve o bilgi yalnızca yenilemeyle geliyor.';

/**
 * Kural yolu Instagram'a kapalı — KISIT 2.
 *
 * Elle boost'ta bu mesaj GÖSTERİLMİYOR: orada Instagram çalışıyor.
 */
export const INSTAGRAM_RULE_UNSUPPORTED =
  'Kurallar henüz Instagram gönderilerini seçemiyor: Instagram yayın yolu ' +
  'canlıda ilk kez elle denenecek, çünkü kural motoru otomatik ve tekrar ' +
  'tekrar harcama yapıyor. Instagram gönderilerini şimdilik "Gönderi öne çıkar" ' +
  'ile elle öne çıkarabilirsin.';
