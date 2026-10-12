/**
 * ═══ PERFORMANS ANOMALİSİ — YÖNTEM VE PARAMETRELER (B-1) ═══
 *
 * Gerekçe `docs/sinyal/MIMARI.md` § 6. İlk sürüm BİLEREK sade: haftanın aynı
 * günü, son `gecmisHafta` hafta, ortanca ± ölçekli MAD. Ortalama/standart
 * sapma kullanılmıyor: tek bir kampanya açılış günü ortalamayı ve sapmayı
 * birden şişirir ve sonraki altı hafta hiçbir şey alarm vermez. Ortanca ve
 * MAD tek aykırı günden etkilenmiyor.
 *
 * HAFTANIN AYNI GÜNÜ çünkü reklam hacmi haftalık döngülü (pazartesi ile
 * pazar aynı hesapta 2-3 kat farklı olabiliyor); son 7 günle kıyaslamak her
 * pazartesi "artış", her pazar "düşüş" alarmı verirdi.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ BÜTÜN SAYILAR CANLI VERİYLE ÖLÇÜLECEK (Ajan 5, "2 hafta sessiz koşum").│
 * │ Burada yazan değerler Orphex'in kullanıcıya yazdığı parametrelerden ve │
 * │ genel istatistik pratiğinden BAŞLANGIÇ; ölçümden sonra değeri ve        │
 * │ ölçümün kendisi (tarih, örneklem, yanlış alarm oranı) buraya yazılır.  │
 * │ Tahminle değiştirilen eşik ya her şeyi alarm yapar ya hiçbir şeyi      │
 * │ (İyileştir `YORGUNLUK` notu).                                          │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * PLATFORM ÇAĞRISI YOK: her girdi `insights_daily`den. Kota etkisi sıfır.
 */

export const ANOMALI = {
  /** Kaç haftalık geçmiş (haftanın aynı günü → en çok bu kadar nokta). ÖLÇÜLECEK. */
  gecmisHafta: 6,
  /** Bundan az geçmiş noktası varsa aralık hesaplanmaz ("geçmiş yetersiz"). */
  enAzGecmisNokta: 4,
  /** MAD → standart sapma eşdeğeri (normal dağılım için 1,4826). Sabit, ölçülmez. */
  madOlcegi: 1.4826,
  /** Beklenen aralığın genişliği: ortanca ± esikZ × ölçekli MAD. ÖLÇÜLECEK. */
  esikZ: 3,
  /** Bu kat ve üstü sapma "yüksek" önem. ÖLÇÜLECEK. */
  yuksekZ: 5,
  /**
   * Yayılımın tabanı, ortancanın oranı olarak. Geçmiş haftalar BİREBİR aynı
   * gelirse (sabit bütçe, tam harcama) MAD = 0 olur ve en küçük kıpırtı
   * sonsuz sapma sayılır. ÖLÇÜLECEK.
   *
   * `esikZ × enAzYayilimOrani` `enAzGoreliSapma`dan KÜÇÜK kalmalı (bugün
   * 3 × 0,05 = %15 < %30). Eşit ya da büyük olursa aralık dışına çıkan her
   * gözlem göreli eşiği zaten geçer ve o kontrol ölü kod olur: ilk yazımda
   * 0,1 idi ve sözleşme testi bunu yakaladı.
   */
  enAzYayilimOrani: 0.05,
  /**
   * İstatistiksel olarak anlamlı ama iş için önemsiz sapmayı ele: ortancadan
   * en az bu oranda uzaklaşmayan gözlem anomali sayılmaz. ÖLÇÜLECEK.
   */
  enAzGoreliSapma: 0.3,
  /**
   * DÜŞÜK HACİM EŞİKLERİ — GEÇMİŞİN ORTANCASINA bakılır, gözlenen güne
   * DEĞİL: gösterim sıfıra düştüğünde gözlenen hacim tanım gereği düşük ve
   * gözlenene bakan bir eşik en önemli düşüşü susturur. ÖLÇÜLECEK.
   */
  enAzGosterim: 1000,
  enAzTiklama: 30,
  enAzDonusum: 5,
  /**
   * DÖNÜŞÜM GECİKMESİ (gün). Dönüşüm metrikleri atıf penceresi yüzünden dün
   * için EKSİK geliyor ve `insights_backfill` son 7 günü her gece düzeltiyor.
   * "Dün dönüşüm %60 düştü" alarmı her sabah yanlış olurdu. Dönüşüm temelli
   * metrikler bu kadar gün geriden değerlendirilir; ekran bunu söyler
   * ("3 gün önceki veri"). ÖLÇÜLECEK (Meta/Google'da kaç günde oturuyor).
   */
  donusumGecikmesiGun: 3,
  /** Kapatılmış sinyal, sapma kapatma anındakinin bu katını geçerse yeniden açılır. ÖLÇÜLECEK. */
  kotulesmeKatsayisi: 1.5,
} as const;

/**
 * Anomali aranan seviyeler. Reklam seviyesi YOK: (1) satır sayısı 30 kat ve
 * gürültü onunla artıyor, (2) reklam seviyesi düşüşün en sık sebebi kreatif
 * yorgunluğu ve onu İyileştir öneri olarak ZATEN üretiyor (`YORGUNLUK`);
 * aynı olayı iki ekranda iki dille göstermek hangisinin doğru olduğu
 * sorusunu doğurur.
 */
export const ANOMALI_SEVIYELERI = ['account', 'campaign'] as const;
export type AnomaliSeviyesi = (typeof ANOMALI_SEVIYELERI)[number];

/**
 * KAPALI LİSTE. Yeni metrik: buraya ekle, `ANOMALI_METRIK_TANIMI` `Record`
 * olduğu için derleme seni tanıma götürür, sonra CHECK kısıtı (Ajan 2) ve
 * kısıt testi (Ajan 4) ayrışmayı yakalar.
 *
 * Türetilmiş metrikler (oranlar) SORGU ANINDA, gün toplamlarından
 * hesaplanır (CLAUDE.md: SUM/SUM, AVG(oran) değil).
 */
export const ANOMALI_METRIKLERI = [
  'harcama',
  'gosterim',
  'tiklama_orani',
  'tiklama_basi_maliyet',
  'donusum',
  'donusum_basi_maliyet',
] as const;
export type AnomaliMetrigi = (typeof ANOMALI_METRIKLERI)[number];

export type AnomaliYonu = 'artis' | 'dusus';

export interface AnomaliMetrikTanimi {
  /** Panel adı (Google Ads terimi, sade). */
  ad: string;
  /**
   * Hangi yönde sinyal üretilir. Yalnız KÖTÜ yön: "tıklama oranı arttı"
   * bir iş değil, bir haber; her iyi haberi kanala göndermek kötü haberi
   * gömer. Harcama iki yönde de iş: ani artış bütçe taşması, ani düşüş
   * yayının durması.
   */
  kotuYon: 'artis' | 'dusus' | 'iki_yon';
  /** Dönüşüme bağlı mı (gecikmeli değerlendirilir). */
  gecikmeli: boolean;
  /** Düşük hacim eşiği hangi sayıya bakar. */
  hacim: 'gosterim' | 'tiklama' | 'donusum';
  birim: 'para' | 'sayi' | 'oran';
}

export const ANOMALI_METRIK_TANIMI: Record<AnomaliMetrigi, AnomaliMetrikTanimi> = {
  harcama: { ad: 'Maliyet', kotuYon: 'iki_yon', gecikmeli: false, hacim: 'gosterim', birim: 'para' },
  gosterim: { ad: 'Gösterim', kotuYon: 'dusus', gecikmeli: false, hacim: 'gosterim', birim: 'sayi' },
  tiklama_orani: { ad: 'Tıklama oranı', kotuYon: 'dusus', gecikmeli: false, hacim: 'gosterim', birim: 'oran' },
  tiklama_basi_maliyet: { ad: 'Tıklama başı maliyet', kotuYon: 'artis', gecikmeli: false, hacim: 'tiklama', birim: 'para' },
  donusum: { ad: 'Dönüşüm', kotuYon: 'dusus', gecikmeli: true, hacim: 'donusum', birim: 'sayi' },
  donusum_basi_maliyet: { ad: 'Dönüşüm başı maliyet', kotuYon: 'artis', gecikmeli: true, hacim: 'donusum', birim: 'para' },
};

/** Hacim türü → eşik. */
export function hacimEsigi(hacim: AnomaliMetrikTanimi['hacim']): number {
  if (hacim === 'gosterim') return ANOMALI.enAzGosterim;
  if (hacim === 'tiklama') return ANOMALI.enAzTiklama;
  return ANOMALI.enAzDonusum;
}

function ortanca(degerler: readonly number[]): number {
  const s = [...degerler].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface BeklenenAralik {
  orta: number;
  /** Ölçekli MAD (tabanı uygulanmış). */
  yayilim: number;
  alt: number;
  ust: number;
  /** Kaç geçmiş noktadan hesaplandı (ekranda "son 6 pazartesi"). */
  nokta: number;
}

/**
 * Geçmiş değerlerden beklenen aralık. Yetersiz geçmişte `null` — tahmin
 * etmektense kısıtla (CLAUDE.md). Değeri olmayan gün (`null`: o gün hiç
 * satır yok ya da oranın paydası sıfır) noktaya SAYILMAZ; sıfıra çevirmek
 * oran metriklerinde uydurma bir "0" üretir.
 *
 * Alt sınır sıfırın altına inmez: negatif harcama beklemek anlamsız ve
 * ekranda "-1.200 ₺ ile 3.400 ₺ arası" yazmak güven kaybettirir.
 */
export function beklenenAralik(gecmis: ReadonlyArray<number | null>): BeklenenAralik | null {
  const d = gecmis.filter((x): x is number => x !== null && Number.isFinite(x));
  if (d.length < ANOMALI.enAzGecmisNokta) return null;
  const orta = ortanca(d);
  const mad = ortanca(d.map((x) => Math.abs(x - orta)));
  const yayilim = Math.max(mad * ANOMALI.madOlcegi, Math.abs(orta) * ANOMALI.enAzYayilimOrani);
  return {
    orta,
    yayilim,
    alt: Math.max(0, orta - ANOMALI.esikZ * yayilim),
    ust: orta + ANOMALI.esikZ * yayilim,
    nokta: d.length,
  };
}

/** Anomali DEĞİL sonucunun nedeni — boş liste neden boş (`emptyReason` deseni). */
export const ANOMALI_DEGIL_NEDENLERI = [
  'deger_yok',
  'gecmis_yetersiz',
  'hacim_dusuk',
  'aralik_icinde',
  'iyi_yon',
  'goreli_sapma_kucuk',
] as const;
export type AnomaliDegilNedeni = (typeof ANOMALI_DEGIL_NEDENLERI)[number];

export type AnomaliSonucu =
  | { anomali: false; neden: AnomaliDegilNedeni }
  | {
      anomali: true;
      yon: AnomaliYonu;
      aralik: BeklenenAralik;
      /** (gözlenen − orta) / yayılım; işaretli. */
      z: number;
      /** (gözlenen − orta) / orta; işaretli. Orta 0 ise `null`. */
      goreliSapma: number | null;
      onem: 'yuksek' | 'orta';
    };

export interface AnomaliGirdisi {
  metrik: AnomaliMetrigi;
  /** Gözlenen günün değeri; oranın paydası 0 ise `null`. */
  gozlenen: number | null;
  /** Haftanın aynı günü, en yeni önce ya da sonra fark etmez. */
  gecmis: ReadonlyArray<number | null>;
  /** Geçmiş günlerin hacim sayıları (gösterim/tıklama/dönüşüm; metriğin `hacim` türü). */
  gecmisHacim: ReadonlyArray<number>;
}

/**
 * Tek metrik, tek varlık, tek gün. SAF: hesaplama işi bunu çağırır, test
 * ÇALIŞTIRARAK sınar (kaynak taraması değil). Sıra önemli ve bilinçli:
 * önce veri var mı, sonra geçmiş yeterli mi, sonra hacim, sonra aralık,
 * sonra yön, en son göreli sapma. Ekrandaki "neden sinyal yok" cümlesi bu
 * sıradan gelir.
 */
export function anomaliDegerlendir(g: AnomaliGirdisi): AnomaliSonucu {
  if (g.gozlenen === null || !Number.isFinite(g.gozlenen)) return { anomali: false, neden: 'deger_yok' };
  const aralik = beklenenAralik(g.gecmis);
  if (!aralik) return { anomali: false, neden: 'gecmis_yetersiz' };
  const tanim = ANOMALI_METRIK_TANIMI[g.metrik];
  if (g.gecmisHacim.length === 0 || ortanca(g.gecmisHacim) < hacimEsigi(tanim.hacim)) {
    return { anomali: false, neden: 'hacim_dusuk' };
  }
  /*
   * TAM DURMA ARALIKTAN BAĞIMSIZ. Gürültülü bir seride (yayılım ortanın
   * üçte birinden büyük) alt sınır sıfıra kırpılıyor ve "gösterim sıfıra
   * düştü" ARALIK İÇİNDE sayılıyordu: en önemli düşüş, en gürültülü
   * hesapta hiç alarm vermezdi. Hacim eşiğini geçmiş bir varlıkta sıfır
   * gözlem, yönü düşüşe izin veren metrikte her zaman anomali ve yüksek önem.
   */
  if (g.gozlenen === 0 && aralik.orta > 0 && tanim.kotuYon !== 'artis') {
    return { anomali: true, yon: 'dusus', aralik, z: -aralik.orta / aralik.yayilim, goreliSapma: -1, onem: 'yuksek' };
  }
  if (g.gozlenen >= aralik.alt && g.gozlenen <= aralik.ust) return { anomali: false, neden: 'aralik_icinde' };
  const yon: AnomaliYonu = g.gozlenen > aralik.ust ? 'artis' : 'dusus';
  if (tanim.kotuYon !== 'iki_yon' && tanim.kotuYon !== yon) return { anomali: false, neden: 'iyi_yon' };
  const goreliSapma = aralik.orta === 0 ? null : (g.gozlenen - aralik.orta) / aralik.orta;
  if (goreliSapma !== null && Math.abs(goreliSapma) < ANOMALI.enAzGoreliSapma) {
    return { anomali: false, neden: 'goreli_sapma_kucuk' };
  }
  const z = (g.gozlenen - aralik.orta) / aralik.yayilim;
  return { anomali: true, yon, aralik, z, goreliSapma, onem: Math.abs(z) >= ANOMALI.yuksekZ ? 'yuksek' : 'orta' };
}

/**
 * Kapatılmış bir sinyal yeniden açılmalı mı? Yalnız AYNI YÖNDE ve
 * kapatma anındaki sapmanın `kotulesmeKatsayisi` katı ve üstünde.
 * Referans `null` ise (eski satır, sağlık kontrolü) kötüleşme yok.
 */
export function kotulestiMi(kapatmaZ: number | null, yeniZ: number): boolean {
  if (kapatmaZ === null || kapatmaZ === 0) return false;
  if (Math.sign(kapatmaZ) !== Math.sign(yeniZ)) return false;
  return Math.abs(yeniZ) >= Math.abs(kapatmaZ) * ANOMALI.kotulesmeKatsayisi;
}
