import type { KaynakPaketi } from './kaynak';

/**
 * ═══ PAKET A'YA YENİ SAĞLIK KONTROLLERİ ═══
 *
 * Paket A (`sinyal/saglik.ts`, commit 5ca8fd1, bu dalda yok) dört kontrolü
 * "verisi depoda yok" diye `SAGLIK_DISARIDA`ya koydu ve MIMARI Ç-2 kararı
 * "Paket F tabloya yazmaya başlarsa kontroller o tablodan eklenir; ikinci
 * okuyucu yazılmaz" dedi. Bu liste o bağın tek kaydı.
 *
 * Paket A'nın koduna burada DOKUNULMUYOR (iki dal ayrı). İki paket birleşince
 * Ajan 2: (1) `ga4_anahtar_etkinlik_yok` kodunu `SAGLIK_DISARIDA`dan çıkarıp
 * `SAGLIK_KONTROLLERI`ne taşır, (2) aşağıdaki yeni kodları ekler. Ajan 4
 * `PAKET_A_DISARIDAN_TASINAN` ile `SAGLIK_DISARIDA`yı karşılaştıran testi
 * yazar: taşınan kod iki listede birden durursa ekran onu hem "kontrol
 * ediliyor" hem "kontrol edilmiyor" diye yazar.
 */

/** Paket A'nın `SAGLIK_DISARIDA` listesinden F'nin verisiyle hesaplanabilir olanlar. */
export const PAKET_A_DISARIDAN_TASINAN = ['ga4_anahtar_etkinlik_yok'] as const;

/**
 * Paket A'nın dışarıda bıraktığı ve F'nin de ÇÖZMEDİĞİ kodlar — açıkça.
 * Sessiz kalmasın: "F gelince hepsi çözülür" sanılmasın.
 */
export const PAKET_A_DISARIDA_KALAN = {
  meta_kitle_kucuk: 'Meta özel kitlesi bir veri kaynağı değil; reklam hesabının kendi verisi (ayrı iş).',
  donusum_islemi_pasif: 'Google dönüşüm işlemi Google Ads verisi; Ölçüm modülünün saklamasına bağlı.',
  pmax_varlik_eksik: 'Öğe grubu Google Ads yapı verisi; senkronizasyonun öğe gruplarını çekmesine bağlı.',
} as const;

export const KAYNAK_SAGLIK_KONTROLLERI = [
  'ga4_anahtar_etkinlik_yok',
  'ga4_veri_gelmiyor',
  'takip_acigi',
  'utm_eksik',
  'search_console_yok',
  'urun_onaysiz',
] as const;
export type KaynakSaglikKontrolu = (typeof KAYNAK_SAGLIK_KONTROLLERI)[number];

export interface KaynakSaglikTanimi {
  ad: string;
  paket: KaynakPaketi;
  seviye: 'account' | 'campaign' | 'workspace';
  /** Verinin depodaki yeri. */
  kaynak: string;
  kosul: string;
}

export const KAYNAK_SAGLIK_TANIMI: Record<KaynakSaglikKontrolu, KaynakSaglikTanimi> = {
  ga4_anahtar_etkinlik_yok: {
    ad: 'Analytics\'te anahtar etkinlik yok',
    paket: 'F1',
    seviye: 'workspace',
    kaynak: 'veri_kaynaklari.yapi (kaynak_yapi işinin yazdığı keyEvents listesi, Admin API)',
    kosul: 'GA4 kaynağı etkin, yapı işi son 36 saatte başarıyla koştu ve anahtar etkinlik listesi BOŞ. Yapı koşmadıysa kontrol SUSAR (bilinmeyen = yok değil).',
  },
  ga4_veri_gelmiyor: {
    ad: 'Analytics veri almıyor',
    paket: 'F1',
    seviye: 'workspace',
    kaynak: 'ga4_gunluk + insights_daily',
    kosul: 'Son 3 tam günde (işlenme gecikmesi dışında) reklam tıklaması ≥ 100 ama GA4 oturumu 0. Sitede etiket kırık ya da kaldırılmış.',
  },
  takip_acigi: {
    ad: 'Platform ile site dönüşümleri tutmuyor',
    paket: 'F1',
    seviye: 'campaign',
    kaynak: 'ga4_anahtar_etkinlik_gunluk + insights_daily (eşleme sorgu anında, esleme.ts)',
    kosul: 'Son 14 günde takipAcigi() etiketi platform_fazla, site_fazla ya da site_hic_gormuyor. veri_yetersiz SİNYAL ÜRETMEZ.',
  },
  utm_eksik: {
    ad: 'Reklam bağlantılarında kampanya etiketi yok',
    paket: 'F1',
    seviye: 'account',
    kaynak: 'ga4_gunluk (ücretli Meta/LinkedIn trafiği, kampanya "(not set)")',
    kosul: 'Son 14 günde ücretli Meta ya da LinkedIn oturumlarının %30\'undan fazlasında kampanya etiketi yok. Google otomatik etiketlemeyle eşlendiği için Google bu kontrole girmez.',
  },
  search_console_yok: {
    ad: 'Search Console bağlı değil',
    paket: 'F2',
    seviye: 'workspace',
    kaynak: 'veri_kaynaklari (tur=search_console yok) + workspace\'te etkin Google arama kampanyası',
    kosul: 'Workspace\'te arama kampanyası harcıyor ama Search Console kaynağı yok. Arama kampanyası yoksa uyarı yok (her workspace\'te duran uyarı okunmaz hâle gelir).',
  },
  urun_onaysiz: {
    ad: 'Reklamdaki ürünler onaysız',
    paket: 'F3',
    seviye: 'workspace',
    kaynak: 'urun_katalogu.durum + urun_performansi_gunluk (son 7 gün harcaması olan ürünler)',
    kosul: 'Son 7 günde reklam harcaması almış ürünlerden en az biri katalogda reddedilmiş. Harcamasız ürün sayılmaz.',
  },
};
