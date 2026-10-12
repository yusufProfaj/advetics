/**
 * ═══ SAYI YASAĞI — yapay zekâ metninde uydurma sayı/oran olmasın ═══
 *
 * Model sayı ALMIYOR (sayılar sorgudan, şablonla giriyor); yine de "yüzde
 * otuz", "iki kat", "beşte biri" yazabiliyor ve uydurma bir oran müşteri
 * mailine ya da AdvCampaign'e gidiyor. Kreatif brief'i (Paket D) ve
 * haftalık özet yorumu (Paket B) bu TEK fonksiyonu çağırıyor: iki kopya
 * vardı ve ayrışmıştı (B "beşte biri"ni ve tam genişlik ％'yi geçiriyordu).
 */
/*
 * SAYI YAZIYLA DA GELEBİLİR (Ajan 4, Ö-2). Model "RAKAM YAZMA" talimatına
 * harfiyen uyup "yüzde otuz" ya da tam genişlikli "３０％" yazabiliyordu ve
 * ret yalnız ASCII `\d`'ye bakıyordu: uydurma oran brief'e ve AdvCampaign'e
 * giderdi. Üç kural:
 *  1. Her yazı sistemindeki rakam (`\p{Nd}`, u bayrağı) ve yüzde işareti.
 *  2. "yüzde" kelimesi: arkasından ne gelirse gelsin bir oran.
 *  3. Sayı kelimesi + ÇARPAN/ORAN bağlamı ("iki kat", "on kat daha",
 *     "otuz beş oranında", "dörtte bir").
 * DAR TUTULDU: "bir kişi", "birlikte", "ikinci el", "on plan" brief'in
 * olağan dili; sayı kelimesini tek başına yasaklamak her brief'i
 * reddederdi. Kelime sınırı harf sınıfıyla (`\b` Türkçe harfte çalışmıyor).
 */
const SAYI_KELIMESI = '(?:sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|yarım|çeyrek)';
const HARF_DISI_ONCE = '(?<!\\p{L})';
const HARF_DISI_SONRA = '(?!\\p{L})';
export const SAYI_KALIPLARI: RegExp[] = [
  /[\p{Nd}%％]/u,
  // "yüzde", "yüzdelik", "yüzdesi": arkasından ne gelirse gelsin oran.
  new RegExp(`${HARF_DISI_ONCE}yüzde\\p{L}*${HARF_DISI_SONRA}`, 'iu'),
  // "yarıdan fazla", "yarısından az": sayısız ama oran iddiası.
  new RegExp(`${HARF_DISI_ONCE}yarı(?:dan|sından)\\s+(?:fazla|az|çok)${HARF_DISI_SONRA}`, 'iu'),
  new RegExp(
    `${HARF_DISI_ONCE}${SAYI_KELIMESI}(?:\\s+${SAYI_KELIMESI})*\\s+(?:kat|katı|katına|katında|oranında|puan|puanlık)${HARF_DISI_SONRA}`,
    'iu',
  ),
  new RegExp(`${HARF_DISI_ONCE}${SAYI_KELIMESI}[’']?(?:te|ta|de|da)\\s+(?:bir|biri)${HARF_DISI_SONRA}`, 'iu'),
];

/** Metin bir sayı/oran taşıyor mu (rakam, yüzde ya da yazıyla çarpan). */
export function sayiTasiyor(metin: string): boolean {
  /*
   * TÜRKÇE KÜÇÜLTME ÖNCE (Ajan 4 yeniden kapı). `i`+`u` bayraklı aramada
   * büyük "İ" (U+0130) "i" ile eşleşmiyor: cümle başındaki "İki kat daha
   * fazla tıklama" ve "İKİ KAT" yasaktan geçiyordu. `tr` yerel ayarıyla
   * küçültülen metinde "İ" → "i", "I" → "ı" doğru düşüyor.
   *
   * "BİR KAT DAHA" DEYİM, ORAN DEĞİL: "bir kat daha sade" gibi bir cümle
   * reddedilince brief iki denemede üretilemiyor ve günlük hak yanıyordu.
   * Önünde başka bir sayı kelimesi yoksa ("yüz bir kat" değilse) çıkarılıyor;
   * "iki kat daha" yine yasak.
   */
  const kucuk = metin
    .toLocaleLowerCase('tr')
    .replace(new RegExp(`(?<!${SAYI_KELIMESI}\\s+)${HARF_DISI_ONCE}bir\\s+kat\\s+daha${HARF_DISI_SONRA}`, 'gu'), ' ');
  return SAYI_KALIPLARI.some((r) => r.test(kucuk));
}
