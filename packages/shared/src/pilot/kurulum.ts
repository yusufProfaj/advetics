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
  geri_okundu_ayni: ['aciliyor', 'duraklatilmis_kuruldu', 'test_kipinde_kuruldu'],
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
