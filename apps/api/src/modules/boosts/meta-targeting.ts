import type { BoostLocation } from '@advetics/shared';

/**
 * Fonksiyonun GERÇEKTEN okuduğu alanlar.
 *
 * `ManualBoostTargeting` ya da ön ayar ayarının tamamını almıyor ve bu
 * kasıtlı: ikisi de `savedAudienceId` taşıyor ama bu fonksiyon onu HİÇ
 * okumuyor — kayıtlı kitle seçiliyse hedefleme nesnesi zaten hiç
 * yazılmıyor, kararı çağıran veriyor. Tam tipi almak, "kitle burada da
 * dikkate alınıyor" izlenimi verirdi.
 */
export interface MetaHedeflemeGirdisi {
  locations: BoostLocation[];
  ageMin: number;
  ageMax: number;
  genders: 'all' | 'male' | 'female';
}

/*
 * HEDEFLEME ÜRETİMİ TEK DOSYADA — VE BU DOSYA TAM OLARAK BU YÜZDEN VAR.
 *
 * Bu fonksiyon bir süre `boosts.service.ts` içinde yaşadı ve Bilgi Bankası
 * ön ayarı yolu (`autoboost-launch.service.ts`) KENDİ kopyasını yazdı. İki
 * kopya doğdukları anda AYRIŞMIŞTI ve ikisi de "çalışıyordu":
 *
 *   · Kopya `regions` ve `cities` kovalarına DÜZ STRING koyuyordu; Meta bu
 *     kovalarda `{ key: "..." }` nesnesi bekliyor. Yani ön ayarında il ya da
 *     şehir seçen bir müşterinin yayını ya reddedilecek ya da — daha
 *     kötüsü — alan görmezden gelinip ülke geneline çıkacaktı.
 *   · Kopya `age_max`'i HER ZAMAN gönderiyordu. Meta'da 65 "65 ve üzeri"
 *     demek ve alanı göndermek 65 yaş üstünü DIŞLIYOR.
 *
 * İkisi de sessiz: hata yok, log yok, yalnızca yanlış kitleye harcanan para.
 * Ayrı bir dosyada durmasının sebebi, ikinci bir kopyanın yazılmasını
 * zorlaştırmak.
 */

/**
 * Boost hedeflemesini META NESNESİNE çevirir.
 *
 * `goal-mapping.ts` içindeki `targetingFrom`'un boost karşılığı ve aynı iki
 * kuralı taşıyor:
 *
 *   · `age_max = 65` GÖNDERİLMİYOR. Meta'da 65 "65 ve üzeri" demek; alanı
 *     göndermek Ads Manager'da "18-65" yazdırıyor ve kullanıcı 66
 *     yaşındakilerin dışlandığını sanıyor.
 *   · Cinsiyet "hepsi" ise alan HİÇ gönderilmiyor. Boş dizi göndermek
 *     Meta'da "hiç kimse" demek.
 *
 * ÖZEL KATEGORİ KISITI BURADA UYGULANMIYOR — sağlayıcıda uygulanıyor
 * (`buildBoostAdSetParams`). İki yerde uygulamak, birinin bir gün
 * güncellenmemesi demek.
 */
export function metaTargetingFrom(t: MetaHedeflemeGirdisi): Record<string, unknown> {
  /**
   * LOKASYONLAR TÜRÜNE GÖRE AYRI KOVALARA. Canlıda iki hata birden verdi.
   *
   * Önce tür yoktu ve seçilen her şey şehir sanılıyordu. Kullanıcı "Türkiye"yi
   * seçtiğinde Meta `cities: [{key:"TR"}]` alıp reddetti: *"integer türü
   * bekleniyor, ancak TR değeriyle bir string türü alındı"* — şehir anahtarları
   * sayısal, ülke kodu iki harf. Bir il seçildiğinde de *"Şehir Hedeflemesi
   * Desteklenmiyor"* çıktı.
   *
   * ÜLKE GENELİ, LOKASYON SEÇİLDİYSE GÖNDERİLMİYOR — VE BU DAHA SİNSİ OLANI.
   * Meta bu kovaları BİRLEŞİM olarak uyguluyor: `countries:["TR"]` ile
   * `cities:[İzmir]` birlikte gönderilirse sonuç "Türkiye geneli VE İzmir",
   * yani Türkiye geneli. Panelde "İzmir" yazarken reklamın ülke geneline
   * gitmesi — hata vermeyen, yalnızca parayı yanlış yere harcayan tür.
   */
  const geo: Record<string, unknown> = {};
  const ulkeler = t.locations.filter((l) => l.type === 'country').map((l) => l.key);
  const iller = t.locations.filter((l) => l.type === 'region').map((l) => ({ key: l.key }));
  const sehirler = t.locations.filter((l) => l.type === 'city').map((l) => ({ key: l.key }));

  if (ulkeler.length > 0) geo.countries = ulkeler;
  if (iller.length > 0) geo.regions = iller;
  if (sehirler.length > 0) geo.cities = sehirler;
  // HİÇ LOKASYON SEÇİLMEDİYSE ülke geneli TR. Boş `geo_locations` göndermek
  // Meta'da "dünya geneli" demek ve bir Türkiye ajansı için en pahalı sessiz
  // hata olurdu.
  if (Object.keys(geo).length === 0) geo.countries = ['TR'];

  const out: Record<string, unknown> = {
    geo_locations: geo,
    age_min: t.ageMin,
  };
  if (t.ageMax < 65) out.age_max = t.ageMax;
  // Meta: 1 = erkek, 2 = kadın.
  if (t.genders === 'male') out.genders = [1];
  if (t.genders === 'female') out.genders = [2];
  return out;
}

/**
 * ═══ ADVANTAGE HEDEF KİTLESİ AÇIKÇA YAZILIYOR ═══
 *
 * CANLIDA ÖĞRENİLDİ. Meta ad set oluşturmayı şu hatayla reddetti:
 *
 *   "Advantage Hedef Kitlesi İşareti Gerekiyor · Reklam setinizi oluşturmak
 *    için Advantage hedef kitlesi özelliğini etkinleştirmeniz veya devre dışı
 *    bırakmanız gerekir. Bu, hedefleme özelliklerindeki targeting_automation
 *    alanında advantage_audience işaretini 1 veya 0 olarak ayarlayarak
 *    yapılabilir." (subcode 1870227)
 *
 * AMAÇLA (etkileşim / erişim / video görüntüleme) İLGİSİ YOK. Meta artık
 * ad set seviyesinde bu işaretin AÇIKÇA yazılmasını istiyor; hangi
 * `optimization_goal` ile gönderdiğimiz sonucu değiştirmiyor.
 *
 * ═══ DEĞER 0 — VE BU BİR KARAR ═══
 *
 * `1` Meta'ya "seçtiğim kitlenin DIŞINA da çık" demek. Kullanıcı bu ekranda
 * şehri ve yaş aralığını AÇIKÇA seçiyor; genişletmeye izin vermek, panelde
 * "İzmir, 26-65" yazarken paranın başka yere gitmesi olurdu — `geo_locations`
 * kovalarının birleşim olarak uygulanmasıyla aynı sınıf hata, ve o hata bu
 * projede bir kez yaşandı.
 *
 * ═══ VAR OLAN DEĞER EZİLMİYOR ═══
 *
 * Kayıtlı kitle seçildiğinde hedefleme nesnesi Meta'dan OLDUĞU GİBİ geliyor
 * (`getSavedAudienceTargeting`) ve kendi `targeting_automation` alanını
 * taşıyabiliyor. Onu ezmek, Ads Manager'da kurulmuş bir kararı panelin
 * sessizce geri alması demekti.
 *
 * CANLIDA HENÜZ DOĞRULANMADI: özel reklam kategorisi (konut/istihdam/kredi)
 * beyanı olan hesaplarda Meta'nın `0`ı kabul edip etmediği bilinmiyor.
 * Reddederse hata kullanıcıya OLDUĞU GİBİ çıkıyor ve burada okunacak.
 */
export function advantageIsaretiyle(
  targeting: Record<string, unknown>,
): Record<string, unknown> {
  const mevcut = targeting.targeting_automation;
  const otomasyon =
    typeof mevcut === 'object' && mevcut !== null && !Array.isArray(mevcut)
      ? (mevcut as Record<string, unknown>)
      : {};

  // ZATEN YAZILMIŞSA DOKUNULMUYOR — kayıtlı kitlenin kendi kararı geçerli.
  if ('advantage_audience' in otomasyon) return targeting;

  return {
    ...targeting,
    targeting_automation: { ...otomasyon, advantage_audience: 0 },
  };
}
