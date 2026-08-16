/**
 * INSTAGRAM GÖNDERİSİ HENÜZ BOOST EDİLEMİYOR — geçici ve BİLEREK konulmuş engel.
 *
 * NEDEN VAR: `meta.provider.ts` içindeki `createBoost` reklamı
 * `object_story_id: "{sayfa}_{gönderi}"` ile kuruyor. Bu **Facebook sayfa
 * gönderisi** biçimi; Instagram için Meta ayrı alanlar istiyor. Yürütücü ise
 * profil türüne hiç bakmadan `social_profiles.external_id`'yi `pageExternalId`
 * diye geçiyordu — Instagram profilinde o değer SAYFA KİMLİĞİ DEĞİL, **IG
 * kullanıcı kimliği**. Yani Meta'ya `"<ig_user_id>_<ig_media_id>"` gidiyordu:
 * iki parçası da yanlış kimlik uzayından gelen bir kimlik.
 *
 * BU AÇIK ELLE BOOST'U BEKLEMİYORDU. Aday seçicide profil türü süzgeci yok ve
 * `social_profile_id` boş bırakılan bir kural müşterinin BÜTÜN profillerini
 * tarıyor. Organik senkronizasyon Instagram gönderilerini zaten çekiyor, yani
 * bugün kurulabilecek bir kural Instagram gönderisini aday yapabiliyordu.
 *
 * NEDEN ENGEL, NEDEN "DENEYİP GÖRELİM" DEĞİL: çağrının ne yapacağı canlıda
 * hiç denenmedi. İki ihtimalden biri gerçekleşir — Meta isteği reddeder
 * (görünür hata), ya da KABUL EDİP yanlış/boş bir reklam üretir. İkincisi bu
 * projenin baş belası olan sessiz hatanın ta kendisi: boost oluşur, para
 * harcar, kullanıcı yanlış gönderiyi öne çıkardığını hiçbir yerde göremez.
 * "Tahmin etmektense kısıtla" (CLAUDE.md §3) burada engel demek.
 *
 * NE ZAMAN KALKACAK: K17 kapandı ve Instagram dalının yazılmasına karar
 * verildi, ama alan adları canlıda tek bir gerçek çağrıyla doğrulanmadan
 * yazılmayacak. **Bu dosya o dal yazıldığında silinecek** — üç çağrı yeri de
 * derleyici tarafından gösterilecek.
 *
 * Ayrıntı: `docs/TASARIM-OLUSTUR.md` §7.2 ve K17.
 */

/** Boost yolunun tanıdığı profil türleri — `social_profiles.profile_type`. */
export type BoostProfileType = 'facebook_page' | 'instagram_business';

/**
 * KARŞILAŞTIRMA TEK YERDE. Üç çağrı noktasında `=== 'instagram_business'`
 * yazmak, bir gün birinde yazım hatası yapmak demek — ve o hata sessizce
 * `false` döner, yani engeli AÇAR. Engelin açılma yolu bir yazım hatası
 * olmamalı.
 */
export function isInstagramProfile(profileType: string): boolean {
  return profileType === 'instagram_business';
}

/**
 * Kullanıcıya görünen tek metin.
 *
 * Ne olduğunu VE ne yapılabileceğini söylüyor: "desteklenmiyor" tek başına
 * kullanıcıyı ekranda çözüm ararken bırakır.
 */
export const INSTAGRAM_BOOST_UNSUPPORTED =
  'Instagram gönderileri henüz öne çıkarılamıyor. Meta, Instagram gönderisi ' +
  'için Facebook sayfa gönderisinden farklı bir reklam yolu istiyor ve o yol ' +
  'henüz yazılmadı. Facebook sayfası gönderileri öne çıkarılabiliyor.';
