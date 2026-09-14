/**
 * ═══ KAYDIRMA FİLMİNİN SAF MATEMATİĞİ ═══
 *
 * Bu dosyanın ayrı durmasının sebebi test altyapısı: panelde bileşen render
 * eden bir koşum ortamı YOK (`vitest.config.ts` bunu bilerek reddediyor).
 * Bir effect'in içine yazılan eğri yalnızca kaynak taramasıyla sınanabilir ve
 * o tarama yanlış şeyi kilitleyebiliyor — CLAUDE.md'deki
 * `[taslakAnahtari, kodModu]` hatası tam olarak böyle doğdu: test yazılmıştı,
 * yanlış davranışı doğru sanıyordu. Buradaki her fonksiyon ÇALIŞTIRILARAK
 * sınanıyor (`film-matematigi.spec.ts`).
 *
 * Buradaki sayıların hiçbiri tahmin değil; hepsi `public/hero/hero.mp4`
 * dosyasından ölçüldü. Üretim brief'i ve ölçüm yöntemi ayrı belgede.
 */

/** Filmin ölçülen künyesi. Kaynak yeniden montajlanırsa burası da değişmeli. */
export const FILM = {
  /** `ffprobe` süresi 24,0417 sn; son karenin kesilmemesi için aşağı yuvarlandı. */
  sure: 24.0,
  kareEn: 1280,
  kareBoy: 720,
} as const;

/**
 * ═══ KAYDIRMA → VİDEO SANİYESİ ═══
 *
 * Eşleme DOĞRUSAL DEĞİL ve bu bilinçli. Hareketli bir kadrajı yavaş taramak
 * ağır çekim gibi görünüyor; kilitli bir kadrajı yavaş taramak doğal
 * görünüyor. Bu yüzden kamera hareketli olan ilk iki çekim kaydırmanın
 * %42'sini, kameranın kilitli olduğu son çekim %58'ini alıyor.
 *
 * Pay dağılımı keyfi değil, kare/piksel oranından çıktı: 500vh'lik bölümde
 * (900 px görünümde 3600 px yol) çekim 1 3,9 px/kare, çekim 2 4,8 px/kare,
 * çekim 3 8,7 px/kare düşüyor. Sayaç fazı en yavaş taranan yer olmalı.
 */
export const NOKTALAR: ReadonlyArray<{ s: number; t: number }> = [
  { s: 0.0, t: 0.0 }, // Çekim 1 — dağınık kartlar
  { s: 0.12, t: 4.67 }, // Çekim 2 — toplanma başlıyor
  { s: 0.42, t: 14.0 }, // Çekim 3 — kamera kilitlendi, kartlar sabit
  { s: 1.0, t: FILM.sure },
];

/*
 * `x <= 0` yazılmasının sebebi `-0`. `-0 < 0` FALSE, yani gevşek bir kırpma
 * `-0` döndürüyor ve o değer `Object.is` ile `0`a eşit değil. Videoya zarar
 * vermiyor ama testte ve karşılaştırmada sessizce şaşırtıyor.
 */
const kis = (x: number) => (x <= 0 ? 0 : x > 1 ? 1 : x);

/** Kaydırma ilerlemesinden (0..1) video saniyesi. */
export function videoSaniyesi(s: number): number {
  const p = kis(s);
  for (let i = 1; i < NOKTALAR.length; i++) {
    const a = NOKTALAR[i - 1]!;
    const b = NOKTALAR[i]!;
    if (p <= b.s) return a.t + ((p - a.s) / (b.s - a.s)) * (b.t - a.t);
  }
  return FILM.sure;
}

/**
 * ═══ SAYAÇLAR ÇEKİM 3'TEN ÖNCE AÇILMIYOR ═══
 *
 * Eşik 0,42 ve bu da ölçüldü: çekim 2'de kamera 5,5 sn'de yavaşlıyor AMA
 * klip sonuna kadar 16 piksel dikey kaymaya devam ediyor. Sayaçları orada
 * açmak, onları kartların üstünden kaydırırdı. Kartlar ancak çekim 3'ün ilk
 * karesinde (14,0 sn = kaydırmanın %42'si) piksel olarak kilitleniyor;
 * ölçülen kayma orada 0 px / 0 px.
 */
export const SAYAC_BASLANGICI = 0.42;

/**
 * Sayaç katmanının belirdiği aralık.
 *
 * PENCERE EŞİKTEN SONRA BAŞLIYOR, öncesinde değil. İlk hâli 0,36–0,44 idi ve
 * testi düşürdü: katman eşikte %75 opaklıkta kalıyordu, yani sayaçlar
 * kartlar HENÜZ KİLİTLENMEDEN yarı görünür oluyordu — çekim 2 boyunca kamera
 * 16 px kayıyor ve o kayma yarı saydam bir sayacın altında da sürüyor.
 * Katman ancak kartlar sabitlendikten SONRA beliriyor.
 */
export const SAYAC_GORUNME = { bas: SAYAC_BASLANGICI, son: 0.47 } as const;

export const HEDEFLER = {
  roas: { bas: 1.8, son: 4.7 },
  form: { bas: 0, son: 312 },
  mesaj: { bas: 0, son: 1284 },
} as const;

export type SayacAnahtari = keyof typeof HEDEFLER;

export const ETIKETLER: Record<SayacAnahtari, string> = {
  roas: 'ROAS',
  form: 'Form',
  /*
   * ÜÇÜNCÜ SAYAÇ "LEAD" DEĞİL "MESAJ".
   *
   * `CONVERSION_BUCKETS.form` zaten `lead` aksiyon tipini içeriyor
   * (packages/shared/src/schemas/report.schema.ts). İkisini ayrı sayaç yapmak
   * aynı sayıyı iki kez göstermek olurdu — ve ana sayfa ile rapor farklı
   * rakam söylerdi. Mesaj raporda ayrı duran gerçek bir kova.
   */
  mesaj: 'Mesaj',
};

/**
 * Sayaçların ilerlemesi (0..1).
 *
 * `easeOutQuad` kullanılıyor. Önce `easeOutCubic` denendi ve kaydırmanın
 * %70'inde doyuyordu: son üçte bir boyunca rakamlar kıpırdamıyor ve kaydırma
 * ölü hissettiriyordu.
 */
export function sayacIlerlemesi(s: number): number {
  const p = kis((s - SAYAC_BASLANGICI) / (1 - SAYAC_BASLANGICI));
  return 1 - (1 - p) * (1 - p);
}

/** Sayaç katmanının opaklığı — kartlar yerine oturmadan görünmemeli. */
export function sayacOpakligi(s: number): number {
  return kis((s - SAYAC_GORUNME.bas) / (SAYAC_GORUNME.son - SAYAC_GORUNME.bas));
}

/** Ham sayaç değerleri. */
export function sayacDegerleri(s: number): Record<SayacAnahtari, number> {
  const e = sayacIlerlemesi(s);
  return {
    roas: HEDEFLER.roas.bas + (HEDEFLER.roas.son - HEDEFLER.roas.bas) * e,
    form: Math.round(HEDEFLER.form.son * e),
    mesaj: Math.round(HEDEFLER.mesaj.son * e),
  };
}

/**
 * Ekrana yazılan dize.
 *
 * Biçim `tr-TR`: ondalık ayırıcı VİRGÜL, binlik ayırıcı NOKTA. `toFixed(1)`
 * kullanmak "4.7×" yazardı ve Türkçe bir arayüzde bu, binlik ayırıcıyla
 * karışan bir sayı demek.
 */
export function bicimle(anahtar: SayacAnahtari, deger: number): string {
  if (anahtar === 'roas') {
    return (
      deger.toLocaleString('tr-TR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + '×'
    );
  }
  return Math.round(deger).toLocaleString('tr-TR');
}

/**
 * ═══ SAYAÇLARIN ALTINDAKİ KARTIN ÖLÇÜLEN RENGİ ═══
 *
 * Tarayıcıda, filmin karesi canvas'a çizilip kart merkezinden okundu —
 * tahmin değil. Sayaç metninin rengi buna göre seçiliyor: metin temanın
 * değil, ÜSTÜNDE DURDUĞU YÜZEYİN dünyasına ait.
 *
 * İlk seçim `#6b7280` idi (`--text-muted`) ve ölçünce 2,94:1 çıktı — küçük
 * büyük harfli etiket için WCAG AA sınırının (4,5:1) epey altında. `#4b5563`
 * açık temada geçiyor ama koyu temadaki kısma ile 3,70'e düşüyordu.
 * `#374151` ikisinde de geçiyor.
 */
export const KART_RENGI = [207, 201, 191] as const;

/** Koyu temada videoya uygulanan kısma (`dark:brightness-90`). */
export const KOYU_TEMA_KISMA = 0.9;

/** Sayaç metni ve etiketi — tema belirteci DEĞİL, sabit değerler. */
export const SAYAC_RENKLERI = { deger: '#14161c', etiket: '#374151' } as const;

/**
 * ═══ KART KONUMLARI — POSTER KARESİNDEN ÖLÇÜLDÜ ═══
 *
 * Model kartları brief'in istediği "alt orta şeride" değil, panelin ortasına
 * koydu. Değerler kabartının ürettiği ince parlak pervazın gradyan
 * zirvelerinden okundu, gözle tahmin edilmedi: yanlış konumlanan bir sayaç
 * kartın yarısına oturuyor ve bu YALNIZCA canlıda, gerçek bir ekranda
 * görülüyor — geliştirirken kart görüntüsü arkada olduğu için fark edilmiyor.
 */
export const KARTLAR: ReadonlyArray<{
  anahtar: SayacAnahtari;
  x: number;
  y: number;
  en: number;
  boy: number;
}> = [
  { anahtar: 'roas', x: 272, y: 297, en: 220, boy: 269 },
  { anahtar: 'form', x: 522, y: 297, en: 231, boy: 269 },
  { anahtar: 'mesaj', x: 787, y: 297, en: 220, boy: 269 },
];

/** Sayaç kutusunun kart kenarına bırakacağı pay (film pikseli). */
export const KART_PAYI = 14;

/**
 * Kart kutusunu yüzdeye çevirir.
 *
 * YÜZDE ŞART, piksel değil: film kutusu görünüme göre ölçekleniyor ve sabit
 * piksel bir tek geliştirme ekranında doğru olurdu. Film 16:9 bir kutuda
 * `object-fit` KIRPMADAN duruyor (`contain` davranışı), yani buradaki yüzde
 * doğrudan kutunun yüzdesi — kırpma matematiği hiç girmiyor. Kırpsaydı bu
 * sayılar yalan söylerdi.
 */
export function kartKutusu(kart: (typeof KARTLAR)[number]): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const p = KART_PAYI;
  return {
    left: `${(((kart.x + p) / FILM.kareEn) * 100).toFixed(3)}%`,
    top: `${(((kart.y + p) / FILM.kareBoy) * 100).toFixed(3)}%`,
    width: `${(((kart.en - p * 2) / FILM.kareEn) * 100).toFixed(3)}%`,
    height: `${(((kart.boy - p * 2) / FILM.kareBoy) * 100).toFixed(3)}%`,
  };
}

/**
 * Yapışkan bölümün kaydırma ilerlemesi.
 *
 * `ust` bölümün görünüm üstüne göre konumu, `yukseklik` bölümün yüksekliği,
 * `gorunum` görünür alan yüksekliği. Yol, bölümün yapışkan çocuğu ekranda
 * kalırken kat edilen mesafe — yani `yukseklik - gorunum`.
 *
 * Yol sıfır ya da negatifse (bölüm görünümden kısa) ilerleme 0 dönüyor:
 * sıfıra bölmek `Infinity` üretir ve `currentTime`a `NaN` yazmak videoyu
 * SESSİZCE dondurur, hata vermez.
 */
export function bolumIlerlemesi(ust: number, yukseklik: number, gorunum: number): number {
  const yol = yukseklik - gorunum;
  if (yol <= 0) return 0;
  return kis(-ust / yol);
}
