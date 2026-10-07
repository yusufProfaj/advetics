import type { StratejiPlatformu } from './plan';

/**
 * ═══ BİLEŞEN 4 — SEKTÖREL TAKVİM VE SEZON ═══
 *
 * UYDURMA YÜZDE YOK (Ç-4). Brief'in örneği "Anneler Günü haftası TBM %30
 * artması bekleniyor" ve o sayının bir kaynağı yok: depoda sektör benchmark'ı
 * yok, Google Trends'in genel kullanıma açık resmî API'si yok. İki kaynak var
 * ve ikisi de satırda yazılı:
 *
 *   · `ozel_gunler` tablosu — ELLE tutulan takvim (sektör × tarih × ad),
 *     her satırın `kaynak` sütunu var. Müşteriye bağlı değil.
 *   · Workspace'in KENDİ geçmişi — aynı hesabın geçen yıl aynı haftasındaki
 *     TBM / BGBM değişimi (`insights_daily`). Geçmiş yoksa yüzde YOK ve uyarı
 *     "geçen yıl bu dönemde veri yok" der.
 *
 * Sektör `client_profiles.sektor` (serbest metin, VARCHAR 120). Eşleşme
 * TAHMİN EDİLMEZ: takvim satırı kendi sektör anahtarını taşır ve eşleşme
 * küçük harfe indirilmiş tam eşitlik; eşleşmeyen workspace yalnız genel
 * günleri görür ve ekran bunu söyler ("sektörünüz için özel gün tanımlı değil").
 */
export const SEZON_KAYNAKLARI = ['ozel_gun', 'gecen_yil'] as const;
export type SezonKaynagi = (typeof SEZON_KAYNAKLARI)[number];

/** Sektörden bağımsız günler (Black Friday, yılbaşı...) bu anahtarla tutulur. */
export const GENEL_SEKTOR = '*';

export interface OzelGun {
  id: string;
  sektor: string;
  ad: string;
  /** `YYYY-MM-DD` STRING. */
  baslangic: string;
  bitis: string;
  /** Satırın nereden geldiği; ekranda gösterilir. */
  kaynak: string;
}

export interface SezonUyarisi {
  kaynak: SezonKaynagi;
  /** Uyarının ilgili olduğu pencere. */
  baslangic: string;
  bitis: string;
  baslik: string;
  /** `gecen_yil` kaynağında dolu; `ozel_gun`da her zaman `null` (yüzde uydurulmaz). */
  gecenYil: {
    platform: StratejiPlatformu;
    metrik: 'cpc' | 'cpm';
    /** Önceki 4 haftanın ortalamasına göre değişim, yüzde. */
    degisimYuzde: number;
    /** Hesaplamanın dayandığı gün sayısı; az günle yüzde gösterilmez. */
    gunSayisi: number;
  } | null;
}

/**
 * Geçen yıl kıyası için en az gün sayısı. Altında yüzde yazılmaz: iki günün
 * oynaklığı "TBM %80 artıyor" gibi bir uyarı üretir ve müşteriyi yanlış
 * bütçe kararına iter.
 */
export const SEZON_EN_AZ_GUN = 5;

export type SezonBosNedeni = 'sektor_yok' | 'gun_yok' | 'gecmis_yok';
