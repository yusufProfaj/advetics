/**
 * ═══ SİMÜLASYON MOTORU: ZAMANLAMA SAF FONKSİYONDA ═══
 *
 * Tanıtım sitesinin her bölümünde paneli taklit eden küçük bir sahne var:
 * imleç bir düğmeye gidiyor, tıklıyor, bir alan yazılıyor, bir bildirim
 * düşüyor. Taslakta (`docs/site/taslak.html` → `sahneKur`) bu iş DOM'u
 * doğrudan değiştiren bir `async` fonksiyonla yapılıyordu.
 *
 * Burada sahne BİR VERİ: başlangıç durumu + adım listesi. Bu dosya adım
 * listesini zamanlı bir KARE listesine çeviriyor; React bileşeni yalnız
 * kareyi çiziyor (`use-sahne.ts`). Ayrılmasının iki sebebi var:
 *
 *  1. Panelde bileşen render eden test altyapısı yok (`vitest.config.ts`
 *     bunu bilerek reddediyor). Effect içindeki zamanlama mantığı yalnız
 *     kaynak taramasıyla sınanabilirdi; burada çalıştırılarak sınanıyor
 *     (CLAUDE.md, "REACT EFFECT'İNİN İÇİNDEKİ KARAR TEST EDİLEMİYOR").
 *  2. Hareket azaltma tercihinde sahne doğrudan SON hâlde çiziliyor. Son
 *     hâl ayrı elle yazılsaydı adım listesi değişince ikisi ayrışırdı;
 *     `sonHal` aynı adımları katlayarak üretiyor.
 */

/** İmlecin gidip tıkladığı öğenin anahtarı (bileşende `h('anahtar')` ile bağlanıyor). */
export type Hedef = string;

/** Durumun dize alanları: yazma efekti yalnız bunlara uygulanabiliyor. */
export type DizeAlani<D> = { [K in keyof D]: D[K] extends string ? K : never }[keyof D];

export interface Adim<D> {
  /** Adımdan önce beklenecek süre (ms). */
  bekle?: number;
  /** İmleç bu hedefe gider. */
  fare?: Hedef;
  /** Hedefe varınca tıklasın mı (varsayılan evet). */
  tikla?: boolean;
  /** Harf harf yazma. */
  yaz?: { alan: DizeAlani<D>; metin: string; hiz?: number };
  /** Durum değişikliği (adımın SONUNDA uygulanır). */
  degis?: Partial<D>;
}

export interface Sahne<D> {
  ilk: D;
  adimlar: Adim<D>[];
}

export interface Kare<D> {
  /** Oynatma başından itibaren milisaniye. */
  t: number;
  d: D;
  /** İmlecin bulunduğu hedef; `null` = imleç gizli. */
  fare: Hedef | null;
  /** O anda basılı görünen hedef (küçülme efekti). */
  basili: Hedef | null;
  /** Her tıklamada artar: tık halkası bu sayıyla yeniden başlıyor. */
  tikNo: number;
  /** Yazılmakta olan alan (yanıp sönen yazı imleci). */
  yaziyor: string | null;
}

/** Taslaktaki sabitler: sahneye giriş, imlecin yolu ve basılı kalma süresi. */
export const ZAMAN = {
  giris: 250,
  fareYolu: 750,
  basiliKalma: 160,
  harf: 45,
} as const;

/**
 * Adım listesini kare listesine çevirir. Kareler ZAMANA GÖRE SIRALI ve her
 * kare TAM durumu taşıyor (fark değil): oynatıcı herhangi bir kareden
 * başlayabilir, iptal edilen bir oynatma yarım bir durum bırakmaz.
 */
export function zamanCizelgesi<D>(sahne: Sahne<D>): Kare<D>[] {
  const kareler: Kare<D>[] = [];
  let simdi: Kare<D> = { t: 0, d: sahne.ilk, fare: null, basili: null, tikNo: 0, yaziyor: null };
  const bas = (degisim: Partial<Kare<D>>) => {
    simdi = { ...simdi, ...degisim };
    kareler.push(simdi);
  };

  bas({ t: ZAMAN.giris });
  for (const a of sahne.adimlar) {
    if (a.bekle) bas({ t: simdi.t + a.bekle });
    if (a.fare) {
      // İmleç yola çıkıyor; varınca tıklıyor ve hedef kısa süre basılı kalıyor.
      bas({ fare: a.fare });
      if (a.tikla !== false) {
        bas({ t: simdi.t + ZAMAN.fareYolu, basili: a.fare, tikNo: simdi.tikNo + 1 });
        bas({ t: simdi.t + ZAMAN.basiliKalma, basili: null });
      } else {
        bas({ t: simdi.t + ZAMAN.fareYolu });
      }
    }
    if (a.yaz) {
      const { alan, metin } = a.yaz;
      const hiz = a.yaz.hiz ?? ZAMAN.harf;
      // `[...metin]`: Türkçe harf ve ₺ tek kod noktası ama emoji değil; dizinle
      // bölmek vekil çiftini ortadan kesip ekranda soru işareti çizerdi.
      const harfler = [...metin];
      bas({ d: { ...simdi.d, [alan]: '' }, yaziyor: String(alan) });
      harfler.forEach((_, i) => {
        bas({ t: simdi.t + hiz, d: { ...simdi.d, [alan]: harfler.slice(0, i + 1).join('') } });
      });
      bas({ yaziyor: null });
    }
    if (a.degis) bas({ d: { ...simdi.d, ...a.degis } });
  }
  // Sahne bitti: imleç kaybolur, son durum ekranda kalır.
  bas({ fare: null, basili: null, yaziyor: null });
  return kareler;
}

/** Bütün adımlar uygulanmış SON durum. Hareket azaltma tercihinde ilk ve tek kare bu. */
export function sonHal<D>(sahne: Sahne<D>): D {
  const kareler = zamanCizelgesi(sahne);
  return kareler[kareler.length - 1]!.d;
}

/** Sahnenin toplam süresi (ms). */
export function sahneSuresi<D>(sahne: Sahne<D>): number {
  const kareler = zamanCizelgesi(sahne);
  return kareler[kareler.length - 1]!.t;
}

/**
 * Sayaç eğrisi: taslaktaki `1 - (1 - p)^3` (hızlı başlayıp yavaşlıyor).
 * `p` 0..1 arasına kıstırılıyor; aşan bir zamanlayıcı hedefi geçen bir sayı
 * göstermesin.
 */
export function sayacDegeri(baslangic: number, hedef: number, p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return Math.round(baslangic + (hedef - baslangic) * (1 - Math.pow(1 - q, 3)));
}
