import type { GecisYazani, PilotPlanDurumu } from './plan';

/**
 * ═══ TOPLU KURULUM — SATIR BAŞINA DURUM ═══
 *
 * Onaylı planın her satırı bir kurulum satırı olur (`pilot_kurulum_satirlari`).
 * Plan durumu (`kuruluyor → kuruldu | kismen_kuruldu`) bu satırların
 * SAYIMINDAN türer — elle yazılmaz.
 *
 * SAYIM BÜTÜN SON DURUMLARI KAPSAR. Strateji/senkron dersi: ilerleme
 * `succeeded + failed` sayıyordu, `cancelled` hiç sayılmıyordu ve tek satır
 * çubuğu kalıcı durduruyordu. Sınıf tablosu `satisfies Record<…>`: yeni bir
 * durum eklenip sınıfı yazılmazsa DERLEME kırılır.
 *
 * Akış (Meta, gerçek kip): taslak → prova → kuruluyor (PAUSED) → geri_okundu_ayni
 *   → aciliyor → acildi. Google (K-02): … → geri_okundu_ayni → duraklatilmis_kuruldu.
 * Test kipi: … → geri_okundu_ayni → test_kipinde_kuruldu (açılmaz).
 * Kapalı kip: taslak → kurulmadi_kapali (platforma hiç gidilmez).
 */
export const KURULUM_SATIR_DURUMLARI = [
  'taslak',
  'prova',
  'prova_dustu',
  'kuruluyor',
  /** Platform kabul etti ama kaydımız yazılamadı: YENİDEN DENENMEZ (mükerrer kampanya = para). */
  'kayit_belirsiz',
  'geri_okundu_ayni',
  'fark_var',
  'aciliyor',
  'acildi',
  'duraklatilmis_kuruldu',
  'test_kipinde_kuruldu',
  'kurulmadi_kapali',
  'dustu',
] as const;
export type KurulumSatirDurumu = (typeof KURULUM_SATIR_DURUMLARI)[number];

export interface KurulumSinifi {
  /** Satır bitti mi (plan sayımına girer). */
  son: boolean;
  /** Son durumsa: başarı mı. Son değilse `null`. */
  basarili: boolean | null;
  /** Bu durumdan çıkışı kim yazar (son durumda `yeniden_dene` ile ajans). */
  cikisYazani: readonly GecisYazani[];
}

export const KURULUM_SINIFI = {
  taslak: { son: false, basarili: null, cikisYazani: ['worker'] },
  prova: { son: false, basarili: null, cikisYazani: ['worker'] },
  prova_dustu: { son: true, basarili: false, cikisYazani: ['ajans'] },
  kuruluyor: { son: false, basarili: null, cikisYazani: ['worker'] },
  // Uzlaştırma (etiketle arama) worker'ın; bulunamazsa ajans karar verir.
  kayit_belirsiz: { son: true, basarili: false, cikisYazani: ['worker', 'ajans'] },
  geri_okundu_ayni: { son: false, basarili: null, cikisYazani: ['worker'] },
  fark_var: { son: true, basarili: false, cikisYazani: ['ajans'] },
  aciliyor: { son: false, basarili: null, cikisYazani: ['worker'] },
  acildi: { son: true, basarili: true, cikisYazani: [] },
  duraklatilmis_kuruldu: { son: true, basarili: true, cikisYazani: [] },
  test_kipinde_kuruldu: { son: true, basarili: true, cikisYazani: [] },
  // Test kipi başarılı bir PROVA: plan `kuruldu` olur ama `yayin_kipi = 'test'`
  // planda yazılı ve ekran "test kipinde kuruldu, açılmadı" der.
  // Kapalı kipte HİÇBİR ŞEY kurulmadı: başarı saymak planı "kuruldu"
  // gösterirdi. Başarısız sayılır, plan `kismen_kuruldu`da durur ve ajans uyum
  // bağlandıktan sonra `yeniden_dene` ile provaya gönderir.
  kurulmadi_kapali: { son: true, basarili: false, cikisYazani: ['ajans'] },
  dustu: { son: true, basarili: false, cikisYazani: ['ajans'] },
} as const satisfies Record<KurulumSatirDurumu, KurulumSinifi>;

export const KURULUM_GECISLERI: Readonly<Record<KurulumSatirDurumu, readonly KurulumSatirDurumu[]>> = {
  taslak: ['prova', 'kurulmadi_kapali', 'dustu'],
  prova: ['kuruluyor', 'prova_dustu'],
  prova_dustu: ['prova'],
  kuruluyor: ['geri_okundu_ayni', 'fark_var', 'kayit_belirsiz', 'dustu'],
  kayit_belirsiz: ['geri_okundu_ayni', 'dustu'],
  // `dustu` (2026-10-08): takılmış satırın son durumu. Nesneler PAUSED kurulu
  // ve geri okunmuş; "Şimdi kur" işçinin `devam` yolundan kaldığı yerden açar.
  geri_okundu_ayni: ['aciliyor', 'duraklatilmis_kuruldu', 'test_kipinde_kuruldu', 'dustu'],
  fark_var: ['prova'],
  aciliyor: ['acildi', 'dustu'],
  acildi: [],
  duraklatilmis_kuruldu: [],
  test_kipinde_kuruldu: [],
  kurulmadi_kapali: ['prova'],
  dustu: ['prova'],
};

export interface KurulumSatiri {
  anahtar: string;
  platform: 'meta' | 'google';
  ad: string;
  durum: KurulumSatirDurumu;
  /** Düşen/farklı satırda PLATFORMUN KENDİ mesajı; "beklenmeyen hata" yazılmaz. */
  platformMesaji: string | null;
  /** Geri okumada farklı çıkan alanlar (`fark_var`). */
  farklar: Array<{ alan: string; beklenen: string; okunan: string }>;
  guncellendi: string;
}

export interface KurulumOzeti {
  toplam: number;
  suruyor: number;
  basarili: number;
  basarisiz: number;
  /** Bütün satırlar son durumdaysa planın yeni durumu; sürüyorsa `null`. */
  planHedefi: Extract<PilotPlanDurumu, 'kuruldu' | 'kismen_kuruldu'> | null;
}

export function kurulumOzeti(satirlar: ReadonlyArray<{ durum: KurulumSatirDurumu }>): KurulumOzeti {
  let suruyor = 0;
  let basarili = 0;
  let basarisiz = 0;
  for (const s of satirlar) {
    const c: KurulumSinifi = KURULUM_SINIFI[s.durum];
    if (!c.son) suruyor++;
    else if (c.basarili) basarili++;
    else basarisiz++;
  }
  const planHedefi = suruyor > 0 || satirlar.length === 0 ? null : basarisiz === 0 ? 'kuruldu' : 'kismen_kuruldu';
  return { toplam: satirlar.length, suruyor, basarili, basarisiz, planHedefi };
}

export function kurulumGecisiIzinliMi(nereden: KurulumSatirDurumu, nereye: KurulumSatirDurumu): boolean {
  return KURULUM_GECISLERI[nereden].includes(nereye);
}

// ─── Takılan satır ve `kuruluyor` planından çıkış (B-4, 2026-10-08) ─────────

/** Son olmayan (işçinin üzerinde çalıştığı) durumlar; tip `KURULUM_SINIFI`ndan türer. */
export type KurulumAraDurumu = {
  [K in KurulumSatirDurumu]: (typeof KURULUM_SINIFI)[K]['son'] extends false ? K : never;
}[KurulumSatirDurumu];

export const KURULUM_ARA_DURUMLARI = KURULUM_SATIR_DURUMLARI.filter((d): d is KurulumAraDurumu => !KURULUM_SINIFI[d].son);

/**
 * Bir ara satır en az bu kadar dakikadır kıpırdamıyorsa TAKILMIŞ sayılır.
 * İşçinin hesap yazıcı kilidi (`YAZICI_KILIT_MS`, 30 dk) bundan KISA
 * olmalı: kilidi hâlâ tutan canlı bir iş takılmış sayılırsa süpürme onun
 * altından satırı düşürür ve işçinin bir sonraki geçişi iyimser kilide
 * çarpar (ya da daha kötüsü, açılan kampanya düşmüş bir satıra bağlı kalır).
 */
export const TAKILMA_ESIGI_DK = 45;

/**
 * Süpürmenin takılmış bir satırı YENİDEN KUYRUĞA ALMA hakkı. İşçinin `ara`
 * yolu kaldığı adımdan sürdürüyor (ve gönderilmiş ama yazılmamış POST
 * görürse `kayit_belirsiz` diyor); ama satırı her seferinde aynı sebeple
 * öldüren bir hata varsa sınırsız yeniden kuyruk, her 10 dakikada bir aynı
 * düşüş demek. Hak bitince satır son duruma iner ve karar insana geçer.
 * Sayaç `pilot_kurulum_satirlari.deneme` (Ajan 2: süpürme her yeniden
 * kuyrukta artırır).
 */
export const TAKILAN_SATIR_EN_COK_DENEME = 2;

/**
 * Takılan satırın İNDİĞİ son durum. Hepsi `basarili: false` ve hepsinin
 * ajans çıkışı var ("Şimdi kur"): işçinin yeniden deneme yolu nesneleri
 * okuyup karar veriyor (gönderilmiş/belirsiz nesne varsa `kilit` → yeniden
 * POST yok; kurulmuş nesne varsa `devam`). `satisfies Record`: yeni bir ara
 * durum eklenip buraya yazılmazsa DERLEME kırılır, sayım açık kalmaz.
 */
export const TAKILAN_SATIR_HEDEFI = {
  taslak: 'dustu',
  prova: 'prova_dustu',
  kuruluyor: 'dustu',
  geri_okundu_ayni: 'dustu',
  aciliyor: 'dustu',
} as const satisfies Record<KurulumAraDurumu, KurulumSatirDurumu>;

export const TAKILAN_SATIR_MESAJI =
  'Kurulum bu adımda yarıda kaldı ve kendiliğinden sürmedi. Meta Reklam Yöneticisi’nde bu kampanyaya bak; "Şimdi kur" kaldığı yerden dener, "Vazgeç" planı kapatır.';

function dakikaFarki(eski: string, simdi: string): number {
  return (Date.parse(simdi) - Date.parse(eski)) / 60_000;
}

export type TakilanSatirKarari =
  | { tur: 'dokunma' }
  | { tur: 'bekle' }
  | { tur: 'yeniden_kuyruk' }
  | { tur: 'dusur'; hedef: KurulumSatirDurumu; mesaj: string };

/**
 * Süpürmenin satır kararı (SAF). Son durumdaki satıra dokunulmaz (para
 * harcayan yeniden deneme insanın kararı). Ara durumda ve eşikten yaşlıysa
 * önce yeniden kuyruk, hak bitince son duruma iniş. Worker'ın `failed`
 * dinleyicisi NİHAİ düşüşte süpürmeyi beklemeden doğrudan `dusur` uygular
 * (hedef `TAKILAN_SATIR_HEDEFI`).
 */
export function takilanSatirKarari(
  s: { durum: KurulumSatirDurumu; guncellendi: string; supurmeDenemesi: number },
  simdi: string,
): TakilanSatirKarari {
  if (KURULUM_SINIFI[s.durum].son) return { tur: 'dokunma' };
  if (dakikaFarki(s.guncellendi, simdi) < TAKILMA_ESIGI_DK) return { tur: 'bekle' };
  if (s.supurmeDenemesi < TAKILAN_SATIR_EN_COK_DENEME) return { tur: 'yeniden_kuyruk' };
  return { tur: 'dusur', hedef: TAKILAN_SATIR_HEDEFI[s.durum as KurulumAraDurumu], mesaj: TAKILAN_SATIR_MESAJI };
}

export type KuruluyorPlanKarari =
  /** Eşikten genç bir ara satır var: canlı iş sürüyor, dokunma. */
  | { tur: 'suruyor' }
  /** Bütün satırlar son durumda ama plan hâlâ `kuruluyor`: sayım kaçmış, `planHedefi`ne yaz. */
  | { tur: 'sayimi_yenile'; hedef: 'kuruldu' | 'kismen_kuruldu' }
  /** Hiç satır açılmamış ve plan eşikten yaşlı: işçi satırları açmadan ölmüş. Plan işini yeniden kuyruğa al. */
  | { tur: 'satir_yok' }
  /** Son olmayan HER satır eşikten yaşlı: süpürme `takilanSatirKarari` uygular; ajans durdurabilir. */
  | { tur: 'takildi' };

/**
 * `kuruluyor` plan için TEK karar (SAF): süpürme bunu koşar, ajans ucunda
 * `takilan_kurulumu_durdur` YALNIZ `takildi`/`satir_yok` iken kabul edilir
 * ve panel düğmeyi yalnız o zaman çizer. İki ayrı kural yazılırsa düğme
 * görünür, uç reddeder (ya da tersi: canlı işin altından plan kayar).
 */
export function kuruluyorPlanKarari(g: {
  planGuncellendi: string;
  satirlar: ReadonlyArray<{ durum: KurulumSatirDurumu; guncellendi: string }>;
  simdi: string;
}): KuruluyorPlanKarari {
  if (g.satirlar.length === 0) return dakikaFarki(g.planGuncellendi, g.simdi) < TAKILMA_ESIGI_DK ? { tur: 'suruyor' } : { tur: 'satir_yok' };
  const ara = g.satirlar.filter((s) => !KURULUM_SINIFI[s.durum].son);
  if (ara.length === 0) {
    const o = kurulumOzeti(g.satirlar);
    return { tur: 'sayimi_yenile', hedef: o.planHedefi ?? 'kismen_kuruldu' };
  }
  return ara.every((s) => dakikaFarki(s.guncellendi, g.simdi) >= TAKILMA_ESIGI_DK) ? { tur: 'takildi' } : { tur: 'suruyor' };
}
