import { z } from 'zod';
import type { GeriBeslemeAsamasi } from './asama';
import {
  GERI_BESLEME_OLAY_DURUMLARI,
  GERI_BESLEME_SON_DURUMLAR,
  GERI_BESLEME_SORUNLU_DURUMLAR,
  type GeriBeslemeOlayDurumu,
} from './olay';

/**
 * ═══ WORKSPACE AYARI, UYGUNLUK, ROZET, YANITLAR (Paket E) ═══
 *
 * Ayar workspace başına, platform başına tek satır (`geri_besleme_ayarlari`).
 * v1'de yalnız `meta` (Google: `google.ts`).
 */
export const GERI_BESLEME_PLATFORMLARI = ['meta'] as const;
export type GeriBeslemePlatformu = (typeof GERI_BESLEME_PLATFORMLARI)[number];

/**
 * AÇIK RIZA DEĞİL, AYDINLATMA ONAYI (MIMARI Ç-8). Platforma giden tek şey
 * Meta'nın KENDİ lead kimliği ve aşama adı; kişisel veri hash'li hâlde bile
 * gitmiyor. Yine de "bu kişinin satın alıp almadığı" bilgisi Meta'ya
 * aktarılıyor ve veri sorumlusu müşteri: etkinleştiren kişi formdaki
 * aydınlatma metninin bunu kapsadığını BİR KEZ onaylar, onay denetim
 * kaydına yazılır. Her lead'de sormak, özelliği kullanılmaz yapardı.
 *
 * `datasetId` SEÇİLİR, tahmin edilmez: varsayılan hazırlığın seçtiği piksel
 * (`workspace_hazirlama.piksel_id`) ekranda önden dolu gelir ama kayıt
 * kullanıcının onayıyla olur. Yanlış datasete giden CRM olayları başka bir
 * projenin Conversion Leads modelini eğitir ve sonradan geri alınamaz.
 */
export const geriBeslemeAyarSchema = z
  .object({
    clientId: z.string().uuid(),
    platform: z.enum(GERI_BESLEME_PLATFORMLARI),
    etkin: z.boolean(),
    datasetId: z.string().trim().regex(/^\d{5,20}$/, 'Veri kümesi kimliği yalnız rakam olmalı.').nullable(),
    aydinlatmaOnayi: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.etkin) return;
    if (!v.datasetId) ctx.addIssue({ code: 'custom', path: ['datasetId'], message: 'Açmak için bir Meta veri kümesi (piksel) seç.' });
    if (!v.aydinlatmaOnayi) {
      ctx.addIssue({ code: 'custom', path: ['aydinlatmaOnayi'], message: 'Formdaki aydınlatma metninin bu kullanımı kapsadığını onayla.' });
    }
  });
export type GeriBeslemeAyarGirdisi = z.infer<typeof geriBeslemeAyarSchema>;

export const GERI_BESLEME_AYAR_DURUMLARI = ['kapali', 'kurulum_eksik', 'hata', 'bekliyor', 'calisiyor'] as const;
export type GeriBeslemeAyarDurumu = (typeof GERI_BESLEME_AYAR_DURUMLARI)[number];

export const GERI_BESLEME_AYAR_DURUM_ADI: Record<GeriBeslemeAyarDurumu, string> = {
  kapali: 'Kapalı',
  kurulum_eksik: 'Kurulum eksik',
  hata: 'Gönderilemiyor',
  bekliyor: 'Açık, ilk gönderim bekleniyor',
  calisiyor: 'Çalışıyor',
};

/**
 * Ayarın durumu TÜRETİLİR, saklanmaz (kurulum modülü deseni). `sonAyarHatasi`
 * son gönderimin ayar hatası (token, izin, dataset erişimi); bir sonraki
 * BAŞARILI gönderim onu temizler.
 */
export function geriBeslemeAyarDurumu(a: {
  etkin: boolean;
  datasetId: string | null;
  baglantiGecerli: boolean;
  sonAyarHatasi: string | null;
  sonBasariliGonderim: string | null;
}): GeriBeslemeAyarDurumu {
  if (!a.etkin) return 'kapali';
  if (!a.datasetId || !a.baglantiGecerli) return 'kurulum_eksik';
  if (a.sonAyarHatasi) return 'hata';
  return a.sonBasariliGonderim ? 'calisiyor' : 'bekliyor';
}

// -----------------------------------------------------------------------------
// Uygunluk (Meta Conversion Leads ön koşulları)
// -----------------------------------------------------------------------------

/**
 * Meta resmî belgesi (conversions-api-crm-for-platforms, 2026-10-12): ayda
 * en az 200 lead, en az %60 lead kapsaması, optimize edilen aşama lead'den
 * sonraki 28 gün içinde ve dönüşüm oranı %1-40, en az iki aşama (ham dahil),
 * en az 7 gün veri. Bu koşullar GÖNDERİMİ ENGELLEMEZ: az lead'li hesapta da
 * olaylar raporlamaya ve Meta'nın lead kalitesi öğrenmesine yarıyor. Yalnız
 * "Meta'ya optimize ettir" önerisinin ne zaman yapılabileceğini söylüyor.
 * Sayılar ÖLÇÜLMEDİ, belgeden (MIMARI § 9 M-8).
 */
export const META_CONVERSION_LEADS = {
  aylikEnAzLead: 200,
  enAzKapsama: 0.6,
  enAzGun: 7,
  hedefAsamaEnGecGun: 28,
  hedefOranAlt: 0.01,
  hedefOranUst: 0.4,
} as const;

export const META_UYGUNLUK_EKSIKLERI = ['az_lead', 'dusuk_kapsama', 'kisa_veri', 'tek_asama'] as const;
export type MetaUygunlukEksigi = (typeof META_UYGUNLUK_EKSIKLERI)[number];

export const META_UYGUNLUK_EKSIK_ADI: Record<MetaUygunlukEksigi, string> = {
  az_lead: 'Son 30 günde 200’den az form dolduruldu. Meta bu sinyalle kampanyayı optimize etmek için ayda en az 200 istiyor.',
  dusuk_kapsama: 'Formların %60’ından azının sonucu işaretlendi. Sonucu bilinmeyen kişiyi Meta “olumsuz” sayabilir.',
  kisa_veri: 'Gönderim 7 günden kısa süredir açık.',
  tek_asama: 'Henüz yalnız “form dolduruldu” bildirildi. En az bir sonuç (ulaşıldı, ilgili, müşteri oldu) gerekiyor.',
};

export interface MetaUygunlukGirdisi {
  son30GunLead: number;
  /** Son 30 günün lead'lerinden en az bir İLERİ aşaması platforma ulaşanların oranı (0-1). */
  kapsama: number;
  acikGun: number;
  ileriAsamaSayisi: number;
}

export function metaUygunlukEksikleri(g: MetaUygunlukGirdisi): MetaUygunlukEksigi[] {
  const e: MetaUygunlukEksigi[] = [];
  if (g.son30GunLead < META_CONVERSION_LEADS.aylikEnAzLead) e.push('az_lead');
  if (g.kapsama < META_CONVERSION_LEADS.enAzKapsama) e.push('dusuk_kapsama');
  if (g.acikGun < META_CONVERSION_LEADS.enAzGun) e.push('kisa_veri');
  if (g.ileriAsamaSayisi === 0) e.push('tek_asama');
  return e;
}

// -----------------------------------------------------------------------------
// Lead satırındaki rozet
// -----------------------------------------------------------------------------

export const LEAD_ROZET_TURLERI = ['kapali', 'bekliyor', 'iletildi', 'eslesmedi', 'sorun', 'yok'] as const;
export type LeadRozetTuru = (typeof LEAD_ROZET_TURLERI)[number];

export interface LeadGeriBeslemeRozeti {
  tur: LeadRozetTuru;
  /** Kısa metin ("Meta’ya iletildi", "Gönderilemedi: izin yok"). */
  metin: string;
  /** Son aşama satırının ham durumu; ayrıntı penceresi için. */
  asamalar: Array<{ asama: GeriBeslemeAsamasi; durum: GeriBeslemeOlayDurumu; hata: string | null; zaman: string }>;
}

/**
 * ÖNCELİK: sorun > bekliyor > eşleşmedi > iletildi. Bir lead'in satış
 * aşaması düştüyse rozet "iletildi" diyemez çünkü ham_lead iletildi: en
 * kötü hâl görünmeli, yoksa kayıp sinyal başarı rozetinin altında kalır.
 * `iptal` rozet üretmez (kullanıcı geri aldı, yapılacak iş yok).
 */
export function leadRozetTuru(ayarEtkin: boolean, durumlar: readonly GeriBeslemeOlayDurumu[]): LeadRozetTuru {
  if (!ayarEtkin && durumlar.length === 0) return 'kapali';
  const gecerli = durumlar.filter((d) => d !== 'iptal');
  if (gecerli.length === 0) return ayarEtkin ? 'yok' : 'kapali';
  if (gecerli.some((d) => GERI_BESLEME_SORUNLU_DURUMLAR.includes(d))) return 'sorun';
  if (gecerli.some((d) => !GERI_BESLEME_SON_DURUMLAR.includes(d))) return 'bekliyor';
  if (gecerli.some((d) => d === 'eslesmedi')) return 'eslesmedi';
  // Buraya yalnız `iletildi` kalabilir. Sonda "sorun"a düşen bir yedek dal
  // yazılmadı: yukarıdaki sorun kontrolü silinse bile doğru cevabı veren bir
  // yedek, o kontrolün testini BOŞA düşürüyordu (mutasyonla görüldü).
  return 'iletildi';
}

// -----------------------------------------------------------------------------
// Uç yanıtları
// -----------------------------------------------------------------------------

export interface GeriBeslemeDatasetSecenegi {
  id: string;
  ad: string;
  /** Hazırlığın seçtiği piksel mi. */
  varsayilan: boolean;
  /** Meta `is_crm` (okunabildiyse). `null` = okunamadı, tahmin yok. */
  crm: boolean | null;
}

export interface GeriBeslemeAyari {
  clientId: string;
  platform: GeriBeslemePlatformu;
  etkin: boolean;
  datasetId: string | null;
  datasetAdi: string | null;
  durum: GeriBeslemeAyarDurumu;
  /** `durum`un nedeni, her hâlde dolu. Hata ise platformun cümlesi aynen. */
  neden: string;
  etkinlestiren: string | null;
  etkinlestirmeZamani: string | null;
  uygunlukEksikleri: MetaUygunlukEksigi[];
  sayilar: Record<GeriBeslemeOlayDurumu, number>;
  /** Dataset seçicisi; boşsa `secenekNotu` nedenini söyler. */
  secenekler: GeriBeslemeDatasetSecenegi[];
  secenekNotu: string | null;
}

export const GERI_BESLEME_BOS_NEDENLERI = ['ayar_kapali', 'lead_yok', 'gonderim_yok', 'suzgecte_yok'] as const;
export type GeriBeslemeBosNedeni = (typeof GERI_BESLEME_BOS_NEDENLERI)[number];

export const GERI_BESLEME_BOS_NEDEN_ADI: Record<GeriBeslemeBosNedeni, string> = {
  ayar_kapali: 'Lead sonuçlarını Meta’ya bildirme bu workspace’te kapalı.',
  lead_yok: 'Bu workspace’te henüz form kaydı yok.',
  gonderim_yok: 'Açık, ama henüz gönderilecek bir sonuç işaretlenmedi.',
  suzgecte_yok: 'Seçili süzgece uyan gönderim yok.',
};

export interface GeriBeslemeOlayi {
  id: string;
  leadId: string;
  leadAdi: string | null;
  platform: GeriBeslemePlatformu;
  asama: GeriBeslemeAsamasi;
  durum: GeriBeslemeOlayDurumu;
  deneme: number;
  olayZamani: string;
  sonrakiDeneme: string | null;
  gonderildi: string | null;
  /** Platformun cümlesi AYNEN (Türkçeye çevrilmiş özet değil). */
  hata: string | null;
  hataKodu: string | null;
}

export interface GeriBeslemeOlaylariYaniti {
  satirlar: GeriBeslemeOlayi[];
  toplam: number;
  sayilar: Record<GeriBeslemeOlayDurumu, number>;
  emptyReason: GeriBeslemeBosNedeni | null;
}

export const geriBeslemeOlayListeSchema = z.object({
  clientId: z.string().uuid(),
  durum: z.enum(GERI_BESLEME_OLAY_DURUMLARI).optional(),
  leadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type GeriBeslemeOlayListeSorgusu = z.infer<typeof geriBeslemeOlayListeSchema>;

export const geriBeslemeYenidenDeneSchema = z.object({
  clientId: z.string().uuid(),
  /** Boşsa workspace'in yeniden denenebilir bütün satırları (vazgecildi, reddedildi). */
  olayIdleri: z.array(z.string().uuid()).max(500).optional(),
});
export type GeriBeslemeYenidenDeneGirdisi = z.infer<typeof geriBeslemeYenidenDeneSchema>;

export interface GeriBeslemeYenidenDeneSonucu {
  kuyruga: number;
  /** 7 günü geçtiği için geri alınamayanlar AYRI sayılır, sessizce atlanmaz. */
  suresiGecen: number;
  /** Platforma ulaşmış (iletildi/eşleşmedi) olduğu için dokunulmayanlar. */
  zatenUlasan: number;
}

// -----------------------------------------------------------------------------
// Paket A ve uyarılarla bağ (Ajan 2 kendi commit'inde ekler, Ç-9)
// -----------------------------------------------------------------------------

/**
 * Gönderim düşerse ne olur. Üç kanal, ikisi v1:
 * - UYARI (`alerts`, istek anında, saklanmaz): `UYARI_KODLARI`na bu kod.
 *   Ayar `hata`daysa ya da son 24 saatte `vazgecildi`/`reddedildi` varsa.
 *   Uyarı modülü TEKNİK/HESAP hâli içindir (sinyal MIMARI Ç-3) ve bu tam o.
 * - BEKLEYEN İŞ (Genel Bakış): `BEKLEYEN_IS_TURLERI`na bu tür.
 * - BİLDİRİM KANALI (Slack/Teams/e-posta): v1 YOK, sinyal Ç-3'ün `uyari`
 *   olayı açıldığında onunla gelir (ikinci bir kanal olayı doğmasın).
 *
 * Şimdi eklemek `Record<UyariKodu, ...>` ve `Record<BekleyenIsTuru, ...>`
 * tüketicilerini (API + panel) kırardı; sinyal Ç-13 ile aynı desen.
 */
export const GERI_BESLEME_UYARI_KODU = 'geri_besleme_dusuyor' as const;
export const GERI_BESLEME_BEKLEYEN_IS = { tur: 'geri_besleme_sorunu', izin: 'lead.read' } as const;
