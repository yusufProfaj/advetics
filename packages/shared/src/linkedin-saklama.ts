/**
 * ═══ LINKEDIN VERİ SAKLAMA KISITLARI ═══
 *
 * Bu dosya bir HUKUKİ YORUMU koda çeviriyor ve bunu açıkça söylüyor. Aşağıdaki
 * kuralların bir kısmı LinkedIn'in Marketing API Program şartlarında AÇIKÇA
 * yazıyor; bir kısmı YORUM ve o ayrım her maddede işaretli.
 *
 * Neden bu ayrım önemli: "doküman öyle diyor" ile "belirsizlikte dar tarafta
 * duruyoruz" farklı iki gerekçe. Birincisi tartışılmaz, ikincisi bir gün
 * yeniden değerlendirilebilir — ve hangisi olduğunu bilmeden yeniden
 * değerlendiren kişi ya gereksiz yere kısıtlı kalır ya da gerçek bir şartı
 * ihlal eder.
 *
 * ┌─ İHLALİN HİÇBİR BELİRTİSİ YOK ────────────────────────────────────────┐
 * │ Saklama şartını aşmak teknik bir hata üretmiyor: veri gelmeye devam    │
 * │ ediyor, sorgular çalışıyor, panel doğru görünüyor. Arıza ancak bir      │
 * │ denetimde ya da doğrudan API erişiminin kaybıyla görünüyor — LinkedIn'in│
 * │ kendi ifadesiyle *"Failure to comply with the terms will result in loss │
 * │ of API access"*. Yani bu, bu depodaki "sessiz hata" sınıfının en pahalı │
 * │ üyesi: bedeli entegrasyonun TAMAMI.                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Reklam raporlama verisinin saklanabileceği azami süre.
 *
 * KAYNAK: AÇIK ŞART. LinkedIn'in Data Storage Requirements tablosu
 * "Advertising Accounts' Admin and Reporting Data" satırında izin verilen
 * saklama süresini bir yıl olarak veriyor.
 *
 * ADVETICS'İN MODELİYLE ÇELİŞİYOR: `insights_daily` ve `insight_breakdowns`
 * metrikleri SÜRESİZ tutuyor — Meta'da 37 aylık platform sınırı yüzünden
 * geçmişi kendimizde saklamak bilinçli bir karardı. LinkedIn satırları için o
 * karar geçerli DEĞİL ve bir süpürmenin bu satırları silmesi gerekiyor.
 *
 * BU SÜPÜRME HENÜZ YAZILMADI. Bugün zararsız çünkü LinkedIn verisi hiç
 * akmıyor; ilk veri akmadan ÖNCE yazılmak zorunda.
 */
export const LINKEDIN_RAPOR_SAKLAMA_GUN = 365;

/**
 * ═══ COĞRAFİ KIRILIM: URN SAKLA, ÇÖZÜLMÜŞ ADI SAKLAMA ═══
 *
 * KAYNAK: YORUM — açık şart DEĞİL.
 *
 * LinkedIn'in saklama tablosu "Standardized Data (industries, job functions,
 * degrees, skills, locations)" için süre sınırı koymuyor, AMA parantez içinde
 * Bing Maps kaynaklı lokasyon verisini bunun DIŞINDA tutup saklanamayacağını
 * söylüyor. Belirsiz olan şu: yasak ÇÖZÜLMÜŞ YER ADINI mı ("İstanbul")
 * kapsıyor, yoksa `urn:li:geo:103644278` + gösterim sayısı gibi ham bir
 * metrik satırını da mı? Doküman bu ayrımı YAPMIYOR ve aynı tablonun başka
 * bir satırı URN'ler için süre kısıtı olmadığını söylüyor.
 *
 * KARARIMIZ (kullanıcı onayı, 2026-09-07): dar tarafta duruyoruz.
 *
 *   · `insight_breakdowns.value` alanına URN yazılıyor (`urn:li:geo:...`).
 *     Bu bir kimlik, Bing'den gelen bir yer verisi değil — ve tablonun zaten
 *     kurulu deseni bu: değer HAM saklanıyor, çeviri GÖSTERİMDE yapılıyor
 *     (bkz. `schema.prisma` → `InsightBreakdown.value`).
 *   · Çözülmüş ad (Geo API'den gelen "İstanbul" dizesi) HİÇBİR YERE
 *     yazılmıyor: ne kolona, ne önbelleğe, ne log'a.
 *
 * ┌─ BUNUN BİR BEDELİ VAR VE GİZLENMİYOR ─────────────────────────────────┐
 * │ Ad rapor üretilirken çözülüyor, yani LinkedIn coğrafi kırılımı olan bir│
 * │ rapor AĞA BAĞIMLI hâle geliyor. CLAUDE.md tam bu sebeple rapor logosunu│
 * │ depoda tutuyor: "uzaktan çekmek belgenin üretimini ağa bağımlı yapardı │
 * │ ve adres cevap vermediğinde rapor logosuz çıkardı."                    │
 * │                                                                        │
 * │ Fark şu: logo İNDİRİLMEYEBİLİRDİ ve karar "depoda tut" oldu. Burada    │
 * │ saklamak seçenek değil. O yüzden çözüm BAŞARISIZ OLABİLİR ve            │
 * │ başarısızlık SESSİZ OLMAMALI — satır atılmıyor, URN'in kendisi         │
 * │ gösteriliyor ve neden çözülemediği yazılıyor. Satırı atmak, harcamanın │
 * │ bir kısmını rapordan sessizce düşürmek olurdu.                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const LINKEDIN_GEO_URN_ONEKI = 'urn:li:geo:';

export function linkedinGeoUrnMu(deger: string): boolean {
  return deger.startsWith(LINKEDIN_GEO_URN_ONEKI);
}

/**
 * Coğrafi kırılım satırının EKRANDA/BELGEDE görünecek hâli.
 *
 * `cozulen` rapor üretilirken Geo API'den gelen ad; `null` ise çözüm
 * yapılamadı (ağ, kota ya da kaldırılmış bir bölge).
 *
 * SATIR ASLA ATILMIYOR. Çözülemeyen bir bölgeyi listeden düşürmek, o bölgenin
 * harcamasını rapordan sessizce silmek demek — toplam tutmaz ve sebebi
 * hiçbir yerde yazmaz. Ham URN okunaksız ama DOĞRU, ve yanına sebebi
 * yazılıyor.
 */
export function linkedinGeoEtiketi(deger: string, cozulen: string | null): string {
  if (!linkedinGeoUrnMu(deger)) return deger;
  if (cozulen !== null && cozulen.trim() !== '') return cozulen;
  return `${deger} (bölge adı çözülemedi)`;
}
