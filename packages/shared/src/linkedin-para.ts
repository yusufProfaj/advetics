/**
 * ═══ LINKEDIN PARAYI ONDALIK STRING İSTİYOR — micros DEĞİL, cent DEĞİL ═══
 *
 * Bu dosyanın tek sebebi bir sessiz hatayı imkânsız kılmak.
 *
 * Advetics parayı her yerde micros/BigInt tutuyor (`MICROS_PER_UNIT`), çünkü
 * Google Ads API micros kullanıyor ve Meta'yı da ona normalize ettik. LinkedIn
 * ÜÇÜNCÜ bir rejim: şemada tip `BigDecimal` ve açıklaması aynen *"The amount of
 * money as a real number string"*. Resmi örnekler `"amount": "18"` ve
 * `"amount": "30.0"`.
 *
 * ┌─ NEDEN BU HATA SESSİZ ─────────────────────────────────────────────────┐
 * │ 30 dolarlık günlük bütçe micros olarak 30000000. O değeri LinkedIn'in   │
 * │ `dailyBudget.amount` alanına yazarsan API onu GEÇERLİ BİR BigDecimal    │
 * │ sayar: hata yok, uyarı yok, 400 yok. Kampanya günde otuz milyon dolarlık│
 * │ bütçeyle açılır. Belirti yalnızca faturada görünür.                     │
 * │                                                                         │
 * │ Meta'da cent (100×), Google'da micros (1.000.000×), LinkedIn'de birim.  │
 * │ Üç ölçek, tek kod tabanı. Ölçeği çağrı noktasında elle çevirmek bu üçlü │
 * │ arasında er ya da geç karışır — o yüzden çevrim TEK yerde ve tipli.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Not: Bu değerler LinkedIn dokümanından okundu, CANLIDA DOĞRULANMADI —
 * uygulamanın onaylı ürünü henüz yok. İlk gerçek yazma çağrısı en küçük
 * bütçeyle yapılmalı ve sonuç Campaign Manager'dan GÖZLE doğrulanmalı.
 */

/**
 * Micros → LinkedIn'in beklediği ondalık string.
 *
 * @example linkedinTutar(30_000_000n) === '30.00'
 */
export function linkedinTutar(micros: bigint): string {
  if (micros < 0n) {
    throw new Error(`LinkedIn tutarı negatif olamaz: ${micros}`);
  }

  /*
   * TAM SAYI ARİTMETİĞİ — Number'a çevirip bölmek YOK.
   *
   * `Number(micros) / 1_000_000` büyük değerlerde hassasiyet kaybediyor ve
   * kayıp kuruşta değil, güvenilirlikte: aynı bütçe iki farklı çağrıda iki
   * farklı string üretebilir. BigInt bölmesi bunu tamamen kapatıyor.
   */
  const birim = micros / 1_000_000n;
  const kalan = micros % 1_000_000n;

  // İki ondalık yeterli: LinkedIn para birimi cinsinden tutar bekliyor ve
  // hiçbir para biriminde ikiden fazla anlamlı ondalık yok.
  const kurus = (kalan + 5_000n) / 10_000n; // yarıya yuvarlama
  if (kurus >= 100n) {
    return `${birim + 1n}.00`;
  }
  return `${birim}.${kurus.toString().padStart(2, '0')}`;
}

/**
 * LinkedIn'den GELEN tutarı micros'a çevirir.
 *
 * ÇIKIŞ YOLU DA TUZAKLI: `adAnalytics` maliyeti BEŞ ONDALIKLA döndürüyor —
 * resmi örnek `"costInLocalCurrency": "19.91833"`. `parseFloat` + çarpma
 * kayan nokta hatası üretiyor (19.91833 * 1e6 = 19918329.999999998), yani
 * kuruş sessizce kayıyor. String üzerinden tam sayı aritmetiği kullanılıyor.
 */
export function linkedinTutarMicros(tutar: string): bigint {
  const temiz = tutar.trim();
  if (!/^-?\d+(\.\d+)?$/.test(temiz)) {
    throw new Error(`LinkedIn tutarı sayı değil: ${JSON.stringify(tutar)}`);
  }

  const eksi = temiz.startsWith('-');
  /*
   * `split` sonucu `noUncheckedIndexedAccess` altında `string | undefined`.
   * Regex zaten biçimi doğruladı ama TypeScript'i buna ikna etmek yerine
   * varsayılan veriyoruz: cast atmak, regex bir gün gevşetilirse çalışma
   * anında patlayan bir yol bırakırdı.
   */
  const parcalar = (eksi ? temiz.slice(1) : temiz).split('.');
  const tam = parcalar[0] ?? '0';
  const ondalikHam = parcalar[1] ?? '';

  /*
   * Altı basamağa TAMAMLA ya da KIRP. LinkedIn beş ondalık gönderiyor, micros
   * altı basamak taşıyor; yedinci basamak gelirse (dokümanda yok ama gelirse)
   * atılıyor — micros'un altında saklayacak yerimiz yok.
   */
  const ondalik = ondalikHam.padEnd(6, '0').slice(0, 6);
  const micros = BigInt(tam) * 1_000_000n + BigInt(ondalik);
  return eksi ? -micros : micros;
}

/**
 * LinkedIn'in para nesnesi. `currencyCode` ZORUNLU ve HESABIN para birimiyle
 * eşleşmek zorunda — eşleşmezse LinkedIn isteği reddediyor, ki bu iyi haber:
 * sessiz olmayan tek para hatası bu.
 */
export interface LinkedInParaTutari {
  amount: string;
  currencyCode: string;
}

export function linkedinPara(micros: bigint, paraBirimi: string): LinkedInParaTutari {
  if (!/^[A-Z]{3}$/.test(paraBirimi)) {
    throw new Error(`Para birimi ISO 4217 olmalı (üç büyük harf): ${JSON.stringify(paraBirimi)}`);
  }
  return { amount: linkedinTutar(micros), currencyCode: paraBirimi };
}
