import { PLATFORMS, PLATFORM_KISA_ADLARI, type Platform } from './constants/platforms';

/**
 * ═══ KİTLE KIRILIMI HER PLATFORMDA YOK ═══
 *
 * Meta ve Google yaş, cinsiyet, yerleşim, saat ve şehir kırılımı veriyor.
 * LinkedIn VERMİYOR: pivot listesinde yaş, cinsiyet ve saat HİÇ YOK; onların
 * yerinde şirket, sektör, ünvan, kıdem ve şirket büyüklüğü var — kırılım B2B.
 *
 * ┌─ BU EKSİKLİK "HENÜZ TOPLANMADI" DEĞİL ────────────────────────────────┐
 * │ Rapordaki Kitle Özeti sayfası, yaş ve cinsiyet boşsa şunu yazıyordu:   │
 * │ "Kitle verisi henüz toplanmadı. Kırılımlar gecelik güncellemeyle       │
 * │ geliyor."                                                              │
 * │                                                                        │
 * │ LinkedIn raporunda o cümle YALAN olurdu: veri toplanmadığı için değil, │
 * │ o boyut PLATFORMDA OLMADIĞI için boş. Ve bu yalan müşteriye giden      │
 * │ belgede duruyor — ajans "yarın gelir" diye bekler, hiç gelmez.         │
 * │                                                                        │
 * │ Bu depoda adı konmuş kural: BOŞ LİSTE NEDENİNİ SÖYLESİN. "Sayfa        │
 * │ atanmamış", "izleme kapalı" ve "süpürme koşmadı" üçü de boş liste      │
 * │ olarak görünüyordu ama üçünün yapılacak işi farklıydı.                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * KARAR (kullanıcı, 2026-09-07): LinkedIn için sayfa HİÇ ÇİZİLMİYOR.
 * Yanlış sebep söyleyen boş bir sayfa, olmayan bir sayfadan kötü.
 */

/**
 * Kitle kırılımı SUNAN platformlar.
 *
 * `PLATFORMS`tan TÜRETİLİYOR — elle yazılan ikinci bir liste, dördüncü
 * platform eklendiğinde sessizce eskirdi. Buraya bir platform eklemek,
 * `insight_breakdowns` tarafında onun kırılımlarının GERÇEKTEN toplandığını
 * doğrulamak demek.
 */
export const KIRILIM_SUNMAYAN_PLATFORMLAR: readonly Platform[] = ['linkedin'];

export function platformKirilimSunuyorMu(platform: Platform): boolean {
  return !KIRILIM_SUNMAYAN_PLATFORMLAR.includes(platform);
}

export const KIRILIM_SUNAN_PLATFORMLAR: readonly Platform[] =
  PLATFORMS.filter(platformKirilimSunuyorMu);

/** Kitle bölümü çizilecek mi, çizilecekse bir uyarı taşıyacak mı. */
export type KitleBolumuKarari =
  | {
      ciz: false;
      /** Neden çizilmediği — log ve teşhis için; belgeye BASILMIYOR. */
      sebep: string;
    }
  | {
      ciz: true;
      /**
       * Sayfanın üstünde duracak uyarı. `null` ise uyarı yok.
       *
       * KARMA RAPORDA UYARI ZORUNLU: sayfa Meta ve Google'ı çiziyor, LinkedIn
       * harcaması o dağılımın DIŞINDA kalıyor. Bunu söylememek, kırılım
       * toplamının ana rakamı tutmamasını açıklanamaz bırakırdı — ve bu
       * projede "sessiz kesme yok" kuralının tam konusu.
       */
      not: string | null;
    };

/**
 * Raporun kapsadığı platformlara göre kitle bölümünün kaderini belirler.
 *
 * SAF FONKSİYON ve bu bilinçli: kararı PDF çizicisinin ve panel bileşeninin
 * İÇİNE gömmek, ikisinin ayrışması demekti — bu depoda rapor PDF'i ile panel
 * tam olarak böyle ayrıştı ve fark yalnızca müşteriye giden belgeyi ekranla
 * yan yana koyunca görünüyordu. Ayrıca panelde bileşen render eden bir test
 * altyapısı yok (`vitest.config.ts` bunu bilinçli reddediyor), yani karar
 * dışarıda olmazsa sınanamıyor.
 */
export function kitleBolumuKarari(platformlar: readonly Platform[]): KitleBolumuKarari {
  /*
   * HİÇ PLATFORM YOKSA ÇİZ. Bu "dönemde harcama yok" hâli ve mevcut boş kutu
   * davranışı doğru: "kitle verisi henüz toplanmadı" o durumda gerçekten
   * doğru cümle. Burada `ciz: false` döndürmek, veri bekleyen bir raporda
   * sayfayı sessizce kaybettirirdi.
   */
  if (platformlar.length === 0) return { ciz: true, not: null };

  const sunmayanlar = platformlar.filter((p) => !platformKirilimSunuyorMu(p));
  if (sunmayanlar.length === 0) return { ciz: true, not: null };

  const adlar = sunmayanlar.map((p) => PLATFORM_KISA_ADLARI[p]).join(' ve ');

  /*
   * HEPSİ SUNMUYORSA SAYFA HİÇ ÇİZİLMİYOR. Kullanıcının kararı ve gerekçesi:
   * yanlış sebep söyleyen boş bir sayfa, olmayan bir sayfadan kötü.
   */
  if (sunmayanlar.length === platformlar.length) {
    return { ciz: false, sebep: `${adlar} kitle kırılımı sunmuyor` };
  }

  /*
   * KARMA RAPOR: sayfa çiziliyor ama DIŞARIDA KALANI SÖYLÜYOR.
   *
   * Bunu yazmamak, kırılım dağılımının özet kartlarıyla tutmamasını
   * açıklanamaz bırakırdı — okuyan ya toplamanın yanlış olduğunu sanır ya da
   * farkı hiç görmez. İkisi de bu depoda bir hata türü.
   */
  const kalanlar = platformlar
    .filter(platformKirilimSunuyorMu)
    .map((p) => PLATFORM_KISA_ADLARI[p])
    .join(' ve ');

  return {
    ciz: true,
    not: `${adlar} kitle kırılımı sunmuyor — aşağıdaki dağılım yalnızca ${kalanlar} verisini kapsıyor.`,
  };
}
