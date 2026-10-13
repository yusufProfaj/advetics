import { z } from 'zod';
import { ALICI_UST_SINIRI } from '../alici-listesi';
import type { MetricTotals } from './metrics.schema';
import { PLATFORMS, type Platform } from '../constants/platforms';
import { formatDecimal, formatMoney, formatNumber, formatPercent } from '../format';
import type { TakipAcigiYaniti } from '../veri-kaynagi/takip-acigi';
import { SONUC_ETIKETLERI, type MetaOptimizasyonHedefi } from '../reklam/meta/niyetler';

/**
 * Modül 6 — White-label raporlama sözleşmeleri.
 *
 * Yapı, ajansın hâlihazırda elle hazırladığı rapordan çıkarıldı (Ege Birlik
 * Yapı, Temmuz 2026). Bu önemli: rapor formatı bizim icat ettiğimiz bir şey
 * değil, müşterinin alışkın olduğu ve onayladığı bir belge. Terminoloji de
 * oradan geliyor — CPA değil EBM, CTR değil TO.
 */

/**
 * Türkçe ajans terminolojisi.
 *
 * Panelde CPA/CPC/CTR kullanıyoruz çünkü orada izleyici reklam uzmanı. Raporda
 * izleyici MÜŞTERİ ve o kişi EBM/TBM/TO kısaltmalarını biliyor — Google Ads ve
 * Meta'nın Türkçe arayüzleri de bunları kullanıyor. Aynı metriğe iki ekranda
 * iki farklı ad vermek kafa karıştırıcı görünebilir ama izleyici farklı.
 *
 * Referans rapor her sayfada bu kısaltmaların TANIMINI dipnot olarak veriyor;
 * biz de veriyoruz.
 */
export const METRIC_LABELS = {
  spend: { label: 'Harcama', tr: 'Harcama' },
  impressions: { label: 'Gösterim', tr: 'Gösterim' },
  clicks: { label: 'Tıklama', tr: 'Tıklama' },
  /*
   * ERİŞİM DÖNEMİN TEKİL KİŞİ SAYISI, günlük satırlardan TÜRETİLMİYOR.
   * Bir süre günlük erişimlerin ortalaması basılıyordu ("*" ile); bu ne
   * dönemin kitlesi ne de bir günün: müşteriye ikisinin arasında uydurma
   * bir sayı gidiyordu. Değer rapor üretilirken Meta'dan dönemin tamamı
   * için okunuyor (`time_increment=all_days`); okunamazsa "okunamadı".
   */
  reach: {
    label: 'Erişim',
    tr: 'Erişim',
    hint: "Dönemde reklamı en az bir kez gören tekil kişi sayısı; Meta'dan dönemin tamamı için okunur. Google tekil erişim vermiyor.",
  },
  frequency: {
    label: 'Frekans',
    tr: 'Frekans',
    hint: 'Gösterim sayısının dönemin tekil erişimine bölümü: bir kişinin reklamı dönemde ortalama kaç kez gördüğü.',
  },
  cpm: {
    label: 'BGM',
    tr: 'Bin Gösterim Maliyeti',
    hint: 'Toplam harcamanın gösterim sayısına bölümünün 1000 katı: 1000 gösterimin maliyeti.',
  },
  /*
   * SONUÇ: kampanyanın KURULDUĞU hedefin sayısı. Erişim için kurulmuş bir
   * kampanyanın dönüşümü her gün 0 ve o 0 bir başarısızlık değil; satırda
   * yalnız "Dönüşüm 0" görünürse rapor çalışan bir kampanyayı boşa para
   * yakıyor gibi anlatır. Etiket rehberin sonuç sözlüğünden
   * (`SONUC_ETIKETLERI.REACH`), ikinci bir kopya yazılmıyor.
   */
  result: {
    label: 'Sonuç',
    tr: 'Sonuç',
    hint: `Kampanyanın kurulduğu hedefin sayısı: erişim için kurulmuş kampanyada ${SONUC_ETIKETLERI.REACH}, diğerlerinde dönüşüm. İki tür toplanamadığı için toplam satırı boş.`,
  },
  ctr: { label: 'TO', tr: 'Tıklama Oranı', hint: 'Tıklama sayısının gösterim sayısına bölümü.' },
  cpc: {
    label: 'Ort. TBM',
    tr: 'Tıklama Başına Maliyet',
    hint: 'Toplam harcamanın tıklama sayısına bölümü.',
  },
  cpa: {
    label: 'EBM',
    tr: 'Edinme Başına Maliyet',
    hint: 'Toplam harcamanın dönüşüm sayısına bölümü.',
  },
  conversions: { label: 'Dönüşüm', tr: 'Dönüşüm' },
} as const;

/**
 * Rapor bölümleri.
 *
 * Prisma enum'u OLARAK tanımlanmadı: hiçbir kolonun tipi değil, `sections`
 * JSONB dizisinin içeriği. Veritabanında karşılığı olmayan bir enum bildirmek
 * yanlış izlenim verirdi.
 */
export const REPORT_SECTIONS = [
  'cover',
  'summary',
  'meta_campaigns',
  'google_campaigns',
  'google_keywords',
  'google_search_terms',
  /*
   * ═══ DÖNÜŞÜM DETAYI ═══
   *
   * Raporda tek bir "Dönüşüm" sayısı vardı ve NEYİN kaç tane olduğu hiçbir
   * yerde yazmıyordu. Kullanıcının cümlesi: "dönüşümlerde ne olarak
   * adlandırdıysam 'whatsapp tıklaması' 'site içi telefon araması' gibi gibi
   * dönüşümleri raporda düzgün bir şekilde görebilmem lazım".
   *
   * KAMPANYA TABLOLARINDAN AYRI BİR BÖLÜM: kampanya tablosu "hangi kampanya
   * ne harcadı" sorusunu cevaplıyor, bu tablo o dönüşümlerin NE olduğunu.
   * Kampanya tablosuna sütun olarak eklemek, eylem sayısı kadar sütun
   * demekti ve her müşteride farklı bir tablo genişliği.
   */
  'conversion_detail',
  /*
   * ═══ SİTE VE DÖNÜŞÜM (Paket F1, docs/veri-kaynagi/MIMARI.md § 3.5) ═══
   *
   * Platformun saydığı dönüşüm ile sitenin (Analytics) gördüğü yan yana.
   * GA4 bir REKLAM PLATFORMU DEĞİL: `PLATFORM_SIRASI` döngüsü onu gezmez,
   * bölüm burada kendi koduyla duruyor ve PDF bölüm döngüsünde çiziliyor.
   * GA4 bağlı olmayan workspace'te bölüm HİÇ ÇİZİLMİYOR (`siteDonusumuCizilir`).
   */
  'site_conversion',
  /*
   * ═══ KİTLE KIRILIMLARI ═══
   *
   * Beş ayrı bölüm, tek bir "kitle" bölümü DEĞİL. Sebebi şablon: müşteri
   * hizmetleri raporunda yalnızca şehir isteniyor, performans raporunda saat
   * ve yerleşim. Tek bölüm olsaydı seçim "hepsi ya da hiçbiri" olurdu ve
   * kullanıcı istemediği üç tabloyu da taşımak zorunda kalırdı.
   *
   * İLGİ ALANI YOK: Meta'nın Ads Insights API'sinde ilgi alanı kırılımı
   * bulunmuyor (hedefleme girdisi, raporlanan boyut değil) ve Google'da
   * kısmi. Tek platformda yarım çalışan bir bölüm, raporda "Meta'da neden
   * boş" sorusunu doğurur.
   */
  /*
   * KİTLE ÖZETİ — kırılım TABLOLARINDAN önce, tek bakışta okunan sayfa.
   *
   * Tablolar "hangi kova ne kadar" sorusunu tam cevaplıyor ama beş tablo art
   * arda okunmuyor. Özet sayfası aynı veriyi halka grafiklerle veriyor:
   * gösterim ve tıklamanın cinsiyete ve yaşa göre dağılımı, üstte özet
   * kartları, altta günlük form eğrisi.
   *
   * TABLOLARIN YERİNE GEÇMİYOR, ÖNÜNE GEÇİYOR: grafik ORANI gösteriyor,
   * tablo SAYIYI. Müşteri ikisini de istiyor.
   */
  'audience_overview',
  'audience_age',
  'audience_gender',
  'audience_placement',
  'audience_hour',
  'audience_city',
  'top_ads',
  'closing',
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const SECTION_LABELS: Record<ReportSection, string> = {
  cover: 'Kapak',
  summary: 'Reklam Özet Raporu',
  meta_campaigns: 'Kampanyalar — Meta Ads',
  google_campaigns: 'Kampanyalar — Google Ads',
  google_keywords: 'Anahtar Kelime Performansı',
  google_search_terms: 'Arama Terimleri',
  conversion_detail: 'Dönüşüm Detayı',
  site_conversion: 'Site ve Dönüşüm',
  audience_overview: 'Kitle Özeti',
  audience_age: 'Yaş Dağılımı',
  audience_gender: 'Cinsiyet Dağılımı',
  audience_placement: 'Yerleşim ve Ağ',
  audience_hour: 'Saat Aralığı',
  audience_city: 'Şehir Dağılımı',
  top_ads: 'Öne Çıkan Reklamlar',
  closing: 'Kapanış',
};

/**
 * ADLANDIRILMIŞ DÖNÜŞÜM KOVALARI.
 *
 * Referans raporun Meta tablosunda "Form" ve "Mesaj" AYRI sütunlar — tek bir
 * "Dönüşüm" sayısı değil. Bir lead formu doldurmakla WhatsApp konuşması
 * başlatmak farklı işler ve müşteri ikisini ayrı görmek istiyor.
 *
 * `actionTypes` bir ÖNCELİK SIRASI, toplanacak liste DEĞİL. İlk DOLU olan
 * kazanıyor, diğerleri yok sayılıyor.
 *
 * NEDEN: Meta aynı olayı birden fazla aksiyon türü altında raporluyor. Canlı
 * hesapta ölçülen değerler (Ege Birlik Yapı, 1-6 Ağustos 2026):
 *
 *     lead                                        40
 *     onsite_conversion.lead_grouped              40   ← AYNI 40 lead
 *     onsite_conversion.messaging_conversation_started_7d   20
 *     onsite_conversion.total_messaging_connection          20   ← AYNI 20
 *     onsite_conversion.messaging_first_reply               19   ← BAŞKA olay
 *
 * İlk hâlinde bunlar TOPLANIYORDU ve rapor "Mesaj: 59" gösteriyordu — gerçek
 * sayı 20. Müşteriye üç kat konuşma raporlanıyordu.
 *
 * Kovalar `insights_daily.raw_metrics` içindeki ham aksiyon dizisinden sorgu
 * anında türetiliyor, kolonda saklanmıyor: bu liste bir KARAR ve değiştiğinde
 * 90 günlük veriyi yeniden çekmek gerekmesin.
 */
export const CONVERSION_BUCKETS = {
  form: {
    label: 'Form',
    hint: 'Anlık form ve web sitesi form gönderimleri.',
    /**
     * `lead` Meta'nın toplayıcı metriği: onsite (anlık form) + offsite (pixel)
     * lead'lerinin toplamı. Varsa tek başına doğru sayıyı veriyor; yoksa
     * bileşenlerine düşülüyor.
     */
    actionTypes: [
      'lead',
      'onsite_conversion.lead_grouped',
      'offsite_conversion.fb_pixel_lead',
      'leadgen_grouped',
      'onsite_conversion.lead_form_submit',
    ],
  },
  message: {
    label: 'Mesaj',
    hint: 'Başlatılan WhatsApp ve Messenger konuşmaları.',
    /**
     * "Başlatılan konuşma" ölçülen şey. `total_messaging_connection` aynı
     * değeri veriyor, `messaging_first_reply` ise SONRAKİ bir olay (kullanıcı
     * cevap verdi) — onu eklemek aynı konuşmayı iki kez saymak olur.
     */
    actionTypes: [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.total_messaging_connection',
    ],
  },
  purchase: {
    label: 'Satış',
    hint: 'Tamamlanan satın almalar.',
    /** `omni_purchase` kanallar arası toplayıcı; varsa en kapsayıcı olan o. */
    actionTypes: [
      'omni_purchase',
      'purchase',
      'offsite_conversion.fb_pixel_purchase',
      'onsite_conversion.purchase',
    ],
  },
  /*
   * ARAMA KOVALARI ("Beni telefonla arasınlar", Meta arama reklamı).
   *
   * ADLAR META'NIN EYLEM BAŞVURUSUNDAN (Ads Action Stats, 2026-10-12'de
   * okundu): `click_to_call_native_call_placed` "Calls Placed",
   * `click_to_call_native_20s_call_connect` "20s Calls Placed",
   * `click_to_call_call_confirm` "Estimated Call Confirmation Clicks".
   * Belge ilk ikisi için "yalnız seçili ülkelerde" diyor ve TÜRKİYE'DE
   * GELİP GELMEDİĞİ ÖLÇÜLMEDİ (`ARAMA_EYLEMLERI_OLCULMEDI`).
   *
   * `click_to_call_call_confirm` YEDEK: yapılan arama sayısı gelmeyen
   * ülkede tek sinyal, "Ara" onayına basanların TAHMİNİ. İpucu bunu açıkça
   * söylüyor; gelmiyorsa kova her raporda 0 yazıp çalışan reklamı
   * "arama yok" diye gösterirdi.
   *
   * 20 SN+ AYRI SATIR, toplanmaz: aynı aramanın uzun hâli. İkisini toplamak
   * 20 saniyeyi geçen her aramayı iki kez saymak olurdu.
   */
  calls: {
    label: 'Arama',
    hint: 'Reklamdaki Ara düğmesinden yapılan aramalar. Meta bu ülkede yapılan aramayı vermiyorsa Ara onayına basanların tahmini.',
    actionTypes: ['click_to_call_native_call_placed', 'click_to_call_call_confirm'],
  },
  calls20s: {
    label: '20 sn+ arama',
    hint: '20 saniyeden uzun süren aramalar (Arama sütununun içinde, ayrıca sayılmaz).',
    actionTypes: ['click_to_call_native_20s_call_connect'],
  },
  /*
   * GOOGLE ARAMA DÜĞMESİ TIKLAMASI. Meta eylemi DEĞİL: Google senkronu
   * `segments.click_type = CALLS` ile ayrı sorguda sayıp ham gövdeye
   * `callClicks` olarak yazıyor (google.provider.ts). Ad DÜRÜST: arama değil
   * düğmeye dokunma. Türkiye'de Google yönlendirme numarası olmadığı için
   * "reklamdan gelen arama" dönüşümü ölçülemeyebiliyor; ölçülebilen bu.
   * `actionTypes` BOŞ: Meta aksiyon dizisinde aranmaz.
   */
  callClicks: {
    label: 'Arama düğmesi tıklaması',
    hint: "Google reklamındaki numaraya dokunma sayısı. Görüşmenin yapıldığını göstermez; Google Türkiye'de aramayı ölçmüyor.",
    actionTypes: [] as readonly string[],
    hamAlan: 'callClicks',
  },
} as const;

/** Ham gövdedeki sayaçtan (aksiyon dizisinden DEĞİL) okunan kovalar. */
export const HAM_SAYAC_KOVALARI = ['callClicks'] as const;

/**
 * Sütunun hangi platformda dolu olabileceği; kova değilse `null`. Meta
 * kovaları Google'da, Google sayacı Meta'da HER ZAMAN 0: şablon ekranı bunu
 * söylüyor (0'ı "hiç gelmedi" diye okumasın).
 */
export function kovaPlatformu(k: string): 'meta' | 'google' | null {
  if ((HAM_SAYAC_KOVALARI as readonly string[]).includes(k)) return 'google';
  return k in CONVERSION_BUCKETS ? 'meta' : null;
}

/**
 * Arama kovalarının adları belgeden; Türkiye'deki hesaplarda Meta'nın
 * hangisini döndürdüğü canlı veride görülmedi. Yeni bir ad görülürse
 * `taninmayanAramaEylemleri` onu raporda söylüyor.
 */
export const ARAMA_EYLEMLERI_OLCULMEDI = false;
/*
 * ÖLÇÜLDÜ (2026-10-13, üretim `insights_daily`, Meta, son 365 gün, salt
 * okunur sorgu): Türkiye hesaplarında `click_to_call_native_call_placed`
 * (1.435 satır), `click_to_call_call_confirm` (1.344),
 * `click_to_call_native_20s_call_connect` (893) ve
 * `click_to_call_native_60s_call_connect` (338) GERÇEKTEN geliyor; kova
 * adları doğru. Aynı sorgu `call` geçen ama ARAMA OLMAYAN on binlerce
 * satır da gösterdi: `offsite_lead_add_20_s_calls` gibi Meta'nın "sonuç +
 * 20 sn arama" BİRLEŞİK sütunları (her pikselli hesapta var). Kaba
 * eşleşme bunları "tanınmayan arama" saydığı için neredeyse HER raporda
 * uyarı çıkacaktı — her raporda duran uyarı okunmaz ve gerçeğini gizler.
 */

/**
 * BİLİNEN AMA KOVAYA KONMAYAN arama eylemleri. 60 sn arama 20 sn'nin alt
 * kümesi; ayrı sütun açmak tabloyu kalabalıklaştırırdı. Listede olması
 * "tanınmayan" uyarısını susturuyor — bilerek bırakıldı.
 */
export const BILINEN_KOVASIZ_ARAMA_EYLEMLERI: readonly string[] = [
  'click_to_call_native_60s_call_connect',
  // `click_to_call_call_confirm`ın gruplanmış ikizi (üretimde aynı satır sayısı): ikinci kez sayılmaz.
  'call_confirm_grouped',
  // Messenger sohbetinden yapılan arama: arama reklamının "Ara" düğmesi değil.
  'onsite_conversion.messaging_user_call_placed',
];

/** Meta'nın "<sonuç> + 20 sn arama" birleşik sütunları: arama eylemi değil, toplam. */
const BIRLESIK_ARAMA_SUTUNU = /_add_20_s_calls$/;

/**
 * ARAMA GİBİ GÖRÜNEN AMA HİÇBİR KOVAYA DÜŞMEYEN eylem türleri. Meta adı
 * değiştirirse (ya da Türkiye'de başka bir ad döndürürse) kova SESSİZCE 0
 * kalırdı; bu liste raporda "tanınmayan arama sonucu" olarak görünür.
 * Eşleşme kaba (`call` geçen her tür): yanlış alarm, sessiz kayıptan ucuz.
 */
export function taninmayanAramaEylemleri(actionTypes: Iterable<string>): string[] {
  const bilinen = new Set<string>([
    ...Object.values(CONVERSION_BUCKETS).flatMap((k) => [...k.actionTypes] as string[]),
    ...BILINEN_KOVASIZ_ARAMA_EYLEMLERI,
  ]);
  const out = new Set<string>();
  for (const t of actionTypes) {
    if (/call/i.test(t) && !/call_to_action/i.test(t) && !BIRLESIK_ARAMA_SUTUNU.test(t) && !bilinen.has(t)) out.add(t);
  }
  return [...out].sort();
}

/** Google arama tıklaması alınamadığında Google tablosunun üstündeki not (panel ve PDF). */
export function aramaTiklamasiHataCumlesi(mesaj: string): string {
  return `Google arama düğmesi tıklaması bazı günler için alınamadı; o günler sayılmadı. Google'ın mesajı: ${mesaj.slice(0, 200)}`;
}

/**
 * Kampanya tablosunun ÜSTÜNDEKİ notlar: panel ve PDF AYNI listeyi okuyor
 * (ikinci bir kopya doğduğu anda biri unutulur). Eski veride alan yoksa boş.
 */
export function tabloNotlari(
  data: Pick<ReportData, 'unknownCallActions' | 'callClicksErrors'> &
    Partial<Pick<ReportData, 'videoMetricsErrors' | 'erisimHatalari'>>,
  bolum: 'meta_campaigns' | 'google_campaigns',
): string[] {
  const platform = bolum === 'meta_campaigns' ? 'meta' : 'google';
  const video = (data.videoMetricsErrors ?? []).filter((h) => h.platform === platform).map((h) => videoHataCumlesi(platform, h.mesaj));
  const erisim = (data.erisimHatalari ?? []).filter((h) => h.platform === platform).map((h) => erisimHataCumlesi(h.mesaj));
  return [
    ...(bolum === 'meta_campaigns'
      ? (data.unknownCallActions ?? []).map(taninmayanAramaCumlesi)
      : (data.callClicksErrors ?? []).map(aramaTiklamasiHataCumlesi)),
    ...video,
    ...erisim,
  ];
}

/** Dönem erişimi alınamadığında tablonun üstündeki not (panel ve PDF, tek yer). */
export function erisimHataCumlesi(mesaj: string): string {
  return `Dönemin tekil erişimi Meta'dan alınamadı; erişim ve frekans hücreleri "okunamadı" yazıyor, tahmin edilmiyor. Sebep: ${mesaj.slice(0, 200)}`;
}

/**
 * Kampanya tablosunun ALTINDAKİ erişim dipnotları (panel ve PDF, tek yer).
 * Yalnız tabloda erişim/frekans/sonuç sütunu varsa ve ilgili hâl görülürse.
 */
export function erisimDipnotlari(
  sutunlar: readonly string[],
  satirlar: readonly ReportCampaignRow[],
  toplam: RaporErisim,
): string[] {
  const erisimSutunu = sutunlar.some((k) => k === 'reach' || k === 'frequency' || k === 'result');
  if (!erisimSutunu) return [];
  const hepsi = [...satirlar.map((r) => r.erisim), toplam].filter((e): e is RaporErisim => !!e);
  const nedenler = new Set(hepsi.filter((e) => e.durum === 'desteklenmiyor' && e.neden).map((e) => e.neden!));
  return [...nedenler].map((n) => `${n}; bu hücreler boş bırakıldı, 0 yazılmadı.`);
}

/** Video ölçümü alınamadığında tablonun üstündeki not (panel ve PDF, tek yer). */
export function videoHataCumlesi(platform: 'meta' | 'google', mesaj: string): string {
  const ad = platform === 'meta' ? 'Meta' : 'Google';
  return `${ad} video izlenmesi bazı günler için alınamadı; o hücreler "okunamadı" yazıyor, 0 değil. ${ad}'ın mesajı: ${mesaj.slice(0, 200)}`;
}

/** Uyarının ekrandaki ve PDF'teki cümlesi (tek yer). */
export function taninmayanAramaCumlesi(tur: string): string {
  return `Meta'dan tanınmayan arama sonucu: ${tur}. Arama sütununa eklenmesi gerekiyor.`;
}

export type ConversionBucket = keyof typeof CONVERSION_BUCKETS;
export const CONVERSION_BUCKET_KEYS = Object.keys(CONVERSION_BUCKETS) as ConversionBucket[];

// -----------------------------------------------------------------------------
// Sorgu ve yanıt
// -----------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalı')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Geçersiz tarih');

export const reportQuerySchema = z
  .object({
    clientId: z.string().uuid(),
    from: isoDate,
    to: isoDate,
    /** Şablon verilmezse organizasyon varsayılanı kullanılıyor. */
    templateId: z.string().uuid().optional(),
    /*
     * VARSAYILAN ŞABLON KODU — `templateId`den AYRI bir alan.
     *
     * Üç varsayılan şablon kodda duruyor, veritabanında değil; onların bir
     * UUID'si yok. Aynı alanı paylaşsalardı `templateId`nin bazen UUID
     * bazen "google" olması gerekirdi ve doğrulama ikisini de kabul etmek
     * zorunda kalırdı — o da geçersiz bir UUID'nin sessizce "bilinmeyen
     * şablon" sayılması demekti.
     *
     * İkisi birden verilirse `templateId` KAZANIYOR: kullanıcının kendi
     * şablonu, varsayılan bir ön ayardan daha açık bir tercih.
     */
    sablon: z.enum(['genel', 'google', 'meta']).optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: 'Başlangıç tarihi bitiş tarihinden sonra olamaz',
    path: ['from'],
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const REPORT_SECTION_ENUM = z.enum(REPORT_SECTIONS);

/**
 * SEÇİLEBİLİR METRİKLER — `METRIC_LABELS` TEK KAYNAK.
 *
 * Ekrandaki seçim listesi, sunucudaki doğrulama ve belgedeki sütunlar aynı
 * listeden besleniyor. Üçünü ayrı yazmak, birinin güncellenmemesi hâlinde
 * ekranda seçilebilen ama rapora hiç çıkmayan bir metrik demek — ve
 * TypeScript bunu söylemiyor.
 */
export const METRIC_KEYS = Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>;
export type MetricKey = (typeof METRIC_KEYS)[number];
const METRIC_KEY_ENUM = z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]);

/**
 * DÖNÜŞÜM KOVALARI YALNIZCA META'DA VAR.
 *
 * Google `actions` dizisi döndürmüyor; form/mesaj dökümü orada YOK ve 0
 * yazmak "hiç form gelmedi" gibi okunur. Seçim ekranı bunu gizlemek yerine
 * sebebiyle söylemek zorunda.
 */
export const BUCKET_KEYS = ['form', 'message', 'purchase', 'calls', 'calls20s', 'callClicks'] as const;
export type BucketKey = (typeof BUCKET_KEYS)[number];

/**
 * BÖLÜM AYARLARI — `report_templates.options` JSONB'sinin şeması.
 *
 * Kolon migration'da ve Prisma'da baştan beri vardı, yorumu tam bu işi tarif
 * ediyordu ve TEK SATIR KOD onu okumuyordu. Artık okuyor.
 *
 * AYRIK BİRLEŞİM DEĞİL, BÖLÜM ANAHTARLI HARİTA: bölümlerin çoğu aynı iki
 * ayarı taşıyor (hangi metrikler, kaç satır) ve her biri için ayrı bir dal
 * yazmak, yeni bölüm eklendiğinde unutulacak bir yer daha demek.
 *
 * GÜVENLİ, ÇÜNKÜ OKURKEN ALAN ALAN EŞLENİYOR: JSONB olduğu gibi belgeye
 * geçmiyor. `auto_boost_presets.settings` deseni — bilinmeyen bir anahtarı
 * sessizce taşımak, ekranda "hazır" görünen bozuk bir kayıt üretir.
 */
/**
 * SÜTUN ANAHTARLARI — metrikler VE dönüşüm kovaları TEK LİSTEDE.
 *
 * İkisini ayrı alanlarda tutmak (`metrics` + `buckets`) kullanıcıya sütun
 * SIRASINI seçtirmiyordu: "Form"u "Tıklama"nın önüne almak imkânsız olurdu.
 * Tek sıralı liste hem seçimi hem sırayı taşıyor.
 */
/**
 * ═══ VİDEO SÜTUNLARI (video ölçümü, 2026-10-13) ═══
 *
 * "Video izlenme" iki platformda iki AYRI metriğin karşılığı ve ikisi de
 * platformun "nitelikli izlenme"si: Meta'da ThruPlay (videonun en az 15
 * saniyesi ya da tamamı), Google'da TrueView. 3 saniyelik OYNATMA burada
 * DEĞİL: bir süre ThruPlay yoksa oynatma aynı kolona düşüyordu ve aynı
 * sütunda iki farklı metrik karşılaştırılıyordu.
 *
 * ÇEYREKLER SAYI, ORAN DEĞİL: Meta kişi sayısı veriyor, Google oran
 * (gösterime göre); Google oranı senkronda o günün gösterimiyle çarpılıyor.
 * Sayı kampanyalar ve günler arasında TOPLANABİLİYOR, oran toplanamazdı.
 */
export const VIDEO_KEYS = ['videoViews', 'costPerView', 'videoP25', 'videoP50', 'videoP75', 'videoP100'] as const;
export type VideoKey = (typeof VIDEO_KEYS)[number];
export const VIDEO_LABELS: Record<VideoKey, string> = {
  videoViews: 'Video izlenme',
  costPerView: 'İzlenme başı maliyet',
  videoP25: '%25 izlenen',
  videoP50: '%50 izlenen',
  videoP75: '%75 izlenen',
  videoP100: 'Sonuna kadar izlenen',
};
/** Tabloda video sütunu varsa altına yazılan tanım (panel ve PDF, tek yer). */
export const VIDEO_DIPNOTU =
  "Video izlenme: Meta'da ThruPlay (videonun en az 15 saniyesi ya da tamamı), Google'da TrueView izlenmesi. 3 saniyelik oynatma sayılmaz. %25/%50/%75 ve sonuna kadar izlenen: videonun o noktasına kadar izlenme sayısı; Google'da oran ile gösterimden hesaplanır.";

export const COLUMN_KEYS = [...METRIC_KEYS, ...BUCKET_KEYS, ...VIDEO_KEYS] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

/** Sütun başlıkları — `METRIC_LABELS`, kova ve video etiketleri tek haritada. */
export const COLUMN_LABELS: Record<ColumnKey, string> = {
  ...(Object.fromEntries(
    METRIC_KEYS.map((k) => [k, METRIC_LABELS[k].label]),
  ) as Record<MetricKey, string>),
  ...(Object.fromEntries(
    BUCKET_KEYS.map((k) => [k, CONVERSION_BUCKETS[k].label]),
  ) as Record<BucketKey, string>),
  ...VIDEO_LABELS,
};

const COLUMN_KEY_ENUM = z.enum(COLUMN_KEYS as unknown as [ColumnKey, ...ColumnKey[]]);

/**
 * VARSAYILAN SÜTUNLAR — ŞABLON SEÇİM TAŞIMADIĞINDA.
 *
 * PAYLAŞILAN PAKETTE, çünkü iki ayrı yerde render ediliyor: panelin HTML
 * belgesi ve sunucunun PDF'i. İkisi ayrı listeye baksaydı aynı rapor iki
 * farklı sütun setiyle çıkardı ve farkı müşteriye giden belgede gören
 * olurdu — CLAUDE.md: "aynı şeyi üreten ikinci fonksiyon doğduğu anda
 * ayrışır."
 *
 * META'DA FORM/MESAJ VAR, GOOGLE'DA YOK: Google `actions` dizisi
 * döndürmüyor ve o sütunlar orada her zaman 0 çıkardı — "hiç form gelmedi"
 * gibi okunurdu.
 */
/*
 * GOOGLE VARSAYILANINDA ERİŞİM YOK: Google tekil erişim vermiyor ve sütun
 * her satırda 0 basıyordu (senkron 0 yazıyordu) — "kimseye ulaşmadı" gibi
 * okunan uydurma bir sıfır. Kullanıcı yine de seçerse hücre "—" ve dipnot
 * sebebini yazıyor.
 */
export const DEFAULT_COLUMNS = {
  meta_campaigns: ['spend', 'impressions', 'reach', 'clicks', 'form', 'message'],
  google_campaigns: ['spend', 'impressions', 'clicks', 'ctr', 'conversions'],
} as const satisfies Record<string, readonly string[]>;

export const sectionOptionsSchema = z.object({
  /**
   * Bu bölümde gösterilecek sütunlar, SIRASIYLA. Boş dizi = varsayılana dön.
   *
   * `undefined` ile boş dizi AYNI ŞEY DEĞİL: kullanıcı hepsini kaldırdıysa
   * bunu bir seçim olarak saklamak, bir dahaki açılışta boş bir tablo
   * göstermek olurdu. Boş kalan bölüm varsayılan sütunlarına dönüyor ve bu
   * ekranda yazılı.
   */
  metrics: z
    .array(COLUMN_KEY_ENUM)
    .max(COLUMN_KEYS.length)
    .refine((a) => new Set(a).size === a.length, 'Aynı sütun iki kez eklenemez')
    .optional(),
  /** Kaç satır gösterilecek (kampanya/kelime/reklam tabloları). */
  limit: z.number().int().min(1).max(100).optional(),
});
export type SectionOptions = z.infer<typeof sectionOptionsSchema>;

export const reportOptionsSchema = z.record(REPORT_SECTION_ENUM, sectionOptionsSchema);
export type ReportOptions = z.infer<typeof reportOptionsSchema>;

export const reportTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  title: z.string().trim().max(200).optional(),
  closingText: z.string().trim().max(2000).optional(),
  /** null = organizasyon varsayılanı. */
  clientId: z.string().uuid().nullable().optional(),
  /*
   * SIRA BURADA VE TEKRAR YASAK.
   *
   * Aynı bölüm iki kez yazılırsa React aynı `key` ile iki düğüm basıyor ve
   * belgede bölüm iki kez çıkıyor. Şema bunu reddediyor: `parseSections`
   * geçersizleri eliyor ama tekrarı elemiyordu.
   */
  sections: z
    .array(REPORT_SECTION_ENUM)
    .min(1)
    .max(REPORT_SECTIONS.length)
    .refine((a) => new Set(a).size === a.length, 'Aynı bölüm iki kez eklenemez'),
  options: reportOptionsSchema.optional(),
});
export type ReportTemplateInput = z.infer<typeof reportTemplateInputSchema>;

/** Şablon listesi satırı — düzenleme ekranı bunu okuyor. */
export interface ReportTemplateSummary {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  sections: ReportSection[];
  options: ReportOptions;
  title: string | null;
  closingText: string | null;
  updatedAt: string;
  /**
   * Bu şablondan üretilmiş AKTİF paylaşım linki sayısı.
   *
   * Silme uçtan `ON DELETE CASCADE` ile bu linkleri de siliyor. Sayıyı
   * göstermeden silme sormak, müşteriye gönderilmiş bir raporu haber
   * vermeden 404'e çevirmek olurdu.
   */
  shareCount: number;
}

export const shareInputSchema = z
  .object({
    /**
     * Şablon — VERİLMEZSE sunucu bulur ya da oluşturur.
     *
     * Zorunlu tutmak, ilk raporu göndermek isteyen kullanıcıyı önce şablon
     * oluşturmaya zorlardı. Varsayılan şablon tüm bölümleri içeriyor ve
     * sonradan düzenlenebiliyor.
     */
    templateId: z.string().uuid().optional(),
    clientId: z.string().uuid(),
    from: isoDate,
    to: isoDate,
    /** Gün cinsinden. Verilmezse süresiz. */
    expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'Geçersiz aralık', path: ['from'] });
export type ShareInput = z.infer<typeof shareInputSchema>;

/** Kova bazında dönüşüm sayıları. */
export type ConversionCounts = Record<ConversionBucket, number>;

export interface ReportCampaignRow extends MetricTotals {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  /**
   * DÖNEMİN TEKİL ERİŞİMİ VE FREKANSI — platformdan, dönemin tamamı için.
   *
   * Günlük satırlardan TÜRETİLMİYOR: toplamı aynı kişiyi her gün yeniden
   * sayar, ortalaması da ne dönemin kitlesi ne bir günün. Bir süre ortalama
   * basılıyordu ve 30 günlük raporda kampanyanın kitlesi olduğundan kat kat
   * küçük görünüyordu. Okunamadıysa `durum` söylüyor; sayı uydurulmuyor.
   */
  erisim: RaporErisim;
  /**
   * Kampanya ERİŞİM için kurulmuş (Meta reklam seti hedefi
   * `ERISIM_OPTIMIZASYON_HEDEFI`): sonucu erişilen kişi, dönüşüm değil.
   */
  erisimKampanyasi: boolean;
  conversionCounts: ConversionCounts;
  /**
   * VERİ KAPSAMASI — bu kampanyanın aralıkta kaç günü var.
   *
   * Yeni senkronize edilmiş bir kampanya aralığın yalnızca bir gününü
   * kapsayabiliyor. Rapor "1-6 Ağustos" derken o satır tek günü gösteriyor ve
   * müşteri bunu "bu kampanya neredeyse hiç harcamamış" diye okuyor — oysa
   * veri eksik. Farkı göstermeden rapor göndermek yanıltıcı olur.
   */
  dayCount: number;
  /** Video ölçümü (`VIDEO_KEYS`); video olmayan kampanyada izlenme 0 ya da null. */
  video: RaporVideo;
}

/**
 * ═══ DÖNEM ERİŞİMİ (erişim ölçümü düzeltmesi, 2026-10-13) ═══
 *
 * ÜÇ HÂL AYRI, çünkü üçünün okuyana söylediği iş farklı:
 *  · `olculdu`        platform dönemin tekil erişimini verdi;
 *  · `okunamadi`      platform veriyor ama bu rapor için alınamadı (kota,
 *                     token, platform hatası) — sebep tablonun üstünde;
 *  · `desteklenmiyor` platform tekil erişim VERMİYOR (Google) ya da hesaplar
 *                     arası tekilleştirilemiyor — hücre "—", dipnot sebebi.
 * Üçünü aynı boş hücreye ya da 0'a çevirmek, bu projenin baş belası olan
 * sessiz hatanın ta kendisi olurdu.
 */
export type ErisimDurumu = 'olculdu' | 'okunamadi' | 'desteklenmiyor';

export interface RaporErisim {
  /** Dönemin tekil erişimi. `durum !== 'olculdu'` ise null. */
  reach: number | null;
  /** Platformun bildirdiği dönem frekansı (satırda); toplamda hesaplanıyor. */
  frequency: number | null;
  durum: ErisimDurumu;
  /** `desteklenmiyor`/`okunamadi` için kısa sebep (dipnot ve not). */
  neden: string | null;
}

/**
 * Meta reklam seti hedefi: kampanya ERİŞİM için kurulmuş. Rehberin hedef
 * sözlüğüyle aynı tip (`MetaOptimizasyonHedefi`): yazım hatası derlemede
 * yakalanıyor.
 */
export const ERISIM_OPTIMIZASYON_HEDEFI = 'REACH' as const satisfies MetaOptimizasyonHedefi;

export function erisimYok(durum: Exclude<ErisimDurumu, 'olculdu'>, neden: string): RaporErisim {
  return { reach: null, frequency: null, durum, neden };
}

/** Google'ın tek cümlesi (dipnot, toplam ve hücre sebebi aynı yerden). */
export const GOOGLE_ERISIM_YOK = 'Google tekil erişim vermiyor';

/**
 * Erişim ve frekans hücresi — PANEL VE PDF AYNI FONKSİYONU çağırıyor.
 * "okunamadı" (alınamadı) ile "—" (platform vermiyor) ayrı; 0 ASLA
 * uydurulmuyor.
 */
export function erisimHucresi(k: 'reach' | 'frequency', e: RaporErisim | undefined): string {
  if (!e) return '—';
  if (e.durum === 'okunamadi') return 'okunamadı';
  if (e.durum === 'desteklenmiyor') return '—';
  if (k === 'reach') return formatNumber(e.reach);
  return e.frequency === null ? '—' : formatDecimal(e.frequency);
}

/**
 * Sonuç hücresi: erişim kampanyasında erişim (aynı biçimci, "okunamadı"
 * dahil), diğerlerinde dönüşüm sayısı.
 */
export function sonucHucresi(r: ReportCampaignRow): string {
  return r.erisimKampanyasi ? erisimHucresi('reach', r.erisim) : formatNumber(r.conversions);
}

/**
 * TOPLAM SATIRININ ERİŞİMİ: tablonun dönem erişimi (hesap seviyesi) ve
 * frekansı = toplam gösterim ÷ o erişim. Erişim okunamadıysa frekans da
 * okunamadı; bir paydayı tahmin etmek, kural motorunda frekansı pencere
 * uzunluğu kadar şişiren hatanın aynısını rapora taşımak olurdu.
 */
export function toplamFrekansi(impressions: number, e: RaporErisim): RaporErisim {
  if (e.durum !== 'olculdu' || e.reach === null || e.reach <= 0) return { ...e, frequency: null };
  return { ...e, frequency: impressions / e.reach };
}

/**
 * BİR KAMPANYANIN (ya da toplamın) VİDEO ÖLÇÜMÜ.
 *
 * `null` = HİÇ OKUNMADI (sorulmadı ya da platform reddetti), 0 = okundu ve
 * sıfır. İkisini aynı 0'a çevirmek, alınamayan bir ölçümü "kimse izlemedi"
 * diye müşteriye göndermek olurdu. `okunamadi` en az bir günde platformun
 * HATA verdiğini söylüyor: hücre o zaman "—" değil "okunamadı" yazıyor.
 */
export interface RaporVideo {
  izlenme: number | null;
  okunamadi: boolean;
  /** İzlenmenin OKUNDUĞU günlerin harcaması (izlenme başı maliyetin payı). */
  harcamaMicros: string;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p100: number | null;
}

/**
 * `insights_daily.raw_metrics.video` — iki platformda AYNI şekil (senkron
 * yazıyor, rapor okuyor). Çeyrekler SAYI. `oynatma` yalnız Meta'da (3 sn+);
 * Google'da karşılığı sorulmuyor ve `null`.
 */
export interface VideoHamOlcumu {
  oynatma: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p100: number | null;
}
/** Video ek sorgusu düşünce ham gövdeye yazılan hata anahtarı (Meta ve Google). */
export const VIDEO_HATA_ANAHTARI = 'videoMetricsError';

export function bosRaporVideo(): RaporVideo {
  return { izlenme: null, okunamadi: false, harcamaMicros: '0', p25: null, p50: null, p75: null, p100: null };
}

/** Okunamayanı "okunamadı", sorulmayanı "—", okunanı sayı olarak yazar. */
function videoSayisi(v: number | null, okunamadi: boolean): string {
  if (v === null) return okunamadi ? 'okunamadı' : '—';
  return formatNumber(v);
}

/**
 * Video sütununun hücre metni — PANEL VE PDF AYNI FONKSİYONU çağırıyor ve
 * TOPLAM satırı da aynı fonksiyondan (toplanmış `RaporVideo` ile) geçiyor.
 */
export function videoHucresi(k: VideoKey, v: RaporVideo, para: string | null): string {
  switch (k) {
    case 'videoViews':
      return videoSayisi(v.izlenme, v.okunamadi);
    case 'costPerView':
      if (v.izlenme === null) return videoSayisi(null, v.okunamadi);
      // Sıfır izlenmede maliyet TANIMSIZ (sonsuz değil): "—".
      if (v.izlenme === 0) return '—';
      return formatMoney(String((BigInt(v.harcamaMicros) * 1000n) / BigInt(Math.round(v.izlenme * 1000))), para);
    case 'videoP25':
      return videoSayisi(v.p25, v.okunamadi);
    case 'videoP50':
      return videoSayisi(v.p50, v.okunamadi);
    case 'videoP75':
      return videoSayisi(v.p75, v.okunamadi);
    case 'videoP100':
      return videoSayisi(v.p100, v.okunamadi);
  }
}

/** Satırların video ölçümünü toplar: null'lar atlanır, hepsi null ise null kalır. */
export function videoTopla(list: readonly RaporVideo[]): RaporVideo {
  const t = bosRaporVideo();
  let harcama = 0n;
  const ekle = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
  for (const v of list) {
    t.izlenme = ekle(t.izlenme, v.izlenme);
    t.okunamadi ||= v.okunamadi;
    harcama += BigInt(v.harcamaMicros);
    t.p25 = ekle(t.p25, v.p25);
    t.p50 = ekle(t.p50, v.p50);
    t.p75 = ekle(t.p75, v.p75);
    t.p100 = ekle(t.p100, v.p100);
  }
  t.harcamaMicros = harcama.toString();
  return t;
}

export function videoSutunuMu(k: string): k is VideoKey {
  return (VIDEO_KEYS as readonly string[]).includes(k);
}

/**
 * ═══ VİDEO SÜTUNLARI AYRI TABLODA (panel ve PDF, tek karar) ═══
 *
 * İlk denemede video sütunları kampanya tablosunun SONUNA ekleniyordu: altı
 * sütun daha binince PDF'te harcama "821,7…" diye kırpıldı — kırpılmış para
 * tutarı yanlış sayı göstermekle aynı şey (CLAUDE.md). Video ölçümü de
 * yalnız video kampanyasında anlamlı; arama kampanyasının satırında altı
 * "—" okunmuyor. Google Ads da video metriklerini ayrı sütun setinde
 * gösteriyor. Karar: ana tablo video sütunlarını TAŞIMAZ; seçilen video
 * sütunları altta, YALNIZ video ölçümü olan kampanyaların tablosunda.
 * Kaç kampanyanın gösterildiği yazılıyor (sessiz kesme yok).
 */
export function videoOlcumuVar(r: ReportCampaignRow): boolean {
  return (r.video?.izlenme ?? 0) > 0 || r.video?.okunamadi === true || (r.video?.p25 ?? 0) > 0;
}

/**
 * ═══ SONUÇ VE BGM DE AYRI TABLODA (video ile aynı gerekçe, ölçüldü) ═══
 *
 * İlk denemede erişim kampanyası olan raporda Sonuç ve BGM ana tabloya
 * ekleniyordu: varsayılan altı sütun + Frekans + Sonuç + BGM = dokuz ve
 * PDF'te altı haneli harcama "123.456…" diye KIRPILDI (test yakaladı).
 * İki sütun ayrı, dar bir tabloda ve satırın SONUÇ TÜRÜ de yazılıyor:
 * erişim kampanyasında "erişilen kişi", diğerlerinde "dönüşüm". Kaç
 * kampanyanın erişim için kurulduğu yazılıyor.
 */
export const SONUC_SUTUNLARI = ['result', 'cpm'] as const;
export type SonucSutunu = (typeof SONUC_SUTUNLARI)[number];
export function sonucSutunuMu(k: string): k is SonucSutunu {
  return (SONUC_SUTUNLARI as readonly string[]).includes(k);
}

/** Satırın sonuç türü (Sonuç tablosunun ikinci sütunu). */
export function sonucTuru(r: ReportCampaignRow): string {
  return r.erisimKampanyasi ? SONUC_ETIKETLERI.REACH : 'dönüşüm';
}

export function kampanyaTablolari(
  sutunlar: readonly ColumnKey[],
  satirlar: readonly ReportCampaignRow[],
): {
  ana: ColumnKey[];
  video: { sutunlar: VideoKey[]; satirlar: ReportCampaignRow[]; aciklama: string } | null;
  sonuc: { sutunlar: SonucSutunu[]; satirlar: ReportCampaignRow[]; aciklama: string } | null;
} {
  const ana = sutunlar.filter((k) => !videoSutunuMu(k) && !sonucSutunuMu(k));
  const sonucSutunlari = sutunlar.filter(sonucSutunuMu);
  const erisimSayisi = satirlar.filter((r) => r.erisimKampanyasi === true).length;
  const sonuc =
    sonucSutunlari.length === 0
      ? null
      : {
          sutunlar: sonucSutunlari,
          satirlar: [...satirlar],
          aciklama:
            erisimSayisi === 0
              ? `${satirlar.length} kampanya; hiçbiri erişim için kurulmamış, sonuç dönüşüm.`
              : `${satirlar.length} kampanyadan ${erisimSayisi} tanesi erişim için kurulmuş; onların sonucu ${SONUC_ETIKETLERI.REACH}, dönüşüm değil.`,
        };
  const videoSutunlari = sutunlar.filter(videoSutunuMu);
  if (videoSutunlari.length === 0) return { ana, video: null, sonuc };
  const videoSatirlari = satirlar.filter(videoOlcumuVar);
  const aciklama =
    videoSatirlari.length === 0
      ? 'Bu dönemde video ölçümü olan kampanya yok.'
      : `Video ölçümü olan ${videoSatirlari.length} kampanya (tablodaki ${satirlar.length} kampanyadan).`;
  return { ana, video: { sutunlar: videoSutunlari, satirlar: videoSatirlari, aciklama }, sonuc };
}

export interface ReportPlatformBlock extends MetricTotals {
  platform: Platform;
  label: string;
  currency: string | null;
  conversionCounts: ConversionCounts;
}

export interface ReportDailyPoint {
  date: string;
  conversionCounts: ConversionCounts;
  spendMicros: string;
}

/**
 * ═══ KIRILIM SATIRI — rapordaki kitle tabloları ═══
 *
 * Boyutun DEĞERİ ham geliyor ("25-34", "FEMALE", "instagram · feed", "14",
 * "Izmir") ve gösterimde çevriliyor. Ham saklamanın gerekçesi şemada:
 * Meta "unknown", Google "UNDETERMINED" diyor ve ikisi aynı şey değil —
 * yazma anında birleştirmek geri alınamaz bir kayıp.
 */
export interface ReportBreakdownRow {
  value: string;
  impressions: number;
  clicks: number;
  spendMicros: string;
  conversions: number;
  /** Bu satırın toplam harcamadaki payı, 0-100. Tabloda çubuk olarak çiziliyor. */
  sharePct: number;
}

export interface ReportBreakdownBlock {
  dimension: 'age' | 'gender' | 'placement' | 'hour' | 'city';
  rows: ReportBreakdownRow[];
  /**
   * Bu kırılımı VERMEYEN platformlar.
   *
   * Boş satır listesiyle AYNI ŞEY DEĞİL: "bu dönemde veri yok" ile "bu
   * platform bu kırılımı hiç vermiyor" farklı iki hâl ve ikincisi raporda
   * AÇIKÇA yazılmalı — aksi hâlde müşteri eksik veriyi ajansın hatası sanar.
   */
  unsupportedPlatforms: string[];
  /**
   * Kesilen satır sayısı. Sessiz kesme yok: 40 şehirden 10'u gösteriliyorsa
   * "diğer 30" satırı toplamı taşıyor, yoksa tablo toplamı ana rakamı
   * tutmuyor gibi görünürdü.
   */
  otherCount: number;
  otherSpendMicros: string;
}

export interface ReportData {
  client: { id: string; name: string };
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    footerText: string | null;
    hidePoweredBy: boolean;
  };
  title: string;
  closingText: string | null;
  from: string;
  to: string;
  sections: ReportSection[];
  /**
   * BÖLÜM AYARLARI — hangi metrik sütunları, kaç satır.
   *
   * Şablonda saklanıyordu ama belgeye HİÇ ULAŞMIYORDU: `build()` yalnızca
   * `sections` döndürüyordu ve seçilen metrikler sessizce yok sayılıyordu.
   * Bir ayarı kaydedip hiçbir yerde göremeyen kullanıcı, özelliğin bozuk
   * olduğunu değil kendi yaptığını yanlış yaptığını düşünüyor.
   */
  options: ReportOptions;
  /** Aralıktaki gün sayısı — kampanya kapsamasıyla karşılaştırmak için. */
  rangeDays: number;
  currency: string | null;
  /** Platform blokları + TOPLAM. */
  platforms: ReportPlatformBlock[];
  total: ReportPlatformBlock | null;
  metaCampaigns: ReportCampaignRow[];
  googleCampaigns: ReportCampaignRow[];
  /** Günlük dönüşüm serisi — grafiğin verisi. */
  daily: ReportDailyPoint[];
  /**
   * Kitle kırılımları — boyut başına bir blok.
   *
   * SEÇİLMEYEN BOYUT HİÇ ÜRETİLMİYOR: şablonda `audience_city` yoksa o sorgu
   * hiç koşmuyor. Hepsini üretip gösterimde elemek, beş sorgunun dördünü
   * boşa koşmak demekti.
   */
  breakdowns: ReportBreakdownBlock[];
  topAds: Array<{
    id: string;
    name: string;
    campaignName: string;
    /**
     * KREATİF GÖRSELİ — SAKLANMIŞ DEĞİL, TAZELENMİŞ ADRES.
     *
     * `creatives.asset_urls` içindeki Meta CDN adresi İMZALI ve süresi
     * doluyor; her Graph çağrısı YENİ bir adres üretiyor. Yapı taraması delta
     * çalıştığı için değişmemiş bir reklamın adresi aylarca tazelenmiyor ve
     * rapor üretilirken CDN 403 dönüyor. Belirtisi: müşteriye giden PDF'te
     * "görseli alınamadı (sunucu 403)" yazan on kutu.
     *
     * Bu alan `build()` içinde, transaction KAPANDIKTAN SONRA platformdan
     * tazeleniyor (bkz. `kreatif-adresi.service.ts`). Tazeleme düşerse
     * saklanmış adres kalıyor — çalışma ihtimali düşük ama sıfır değil ve
     * `null` yazmak "bu metin reklamı" ile karışırdı.
     */
    imageUrl: string | null;
    /**
     * TAZELEME BAŞARISIZSA SEBEBİ — `null` ise tazeleme sorunu yok.
     *
     * Sessiz kalmak, "reklamın görseli yok" ile "adresi yenileyemedik"i aynı
     * boş kutuya çevirirdi; ikisinin yapılacak işi farklı (biri normal, diğeri
     * bağlantı/kota sorunu).
     */
    imageUrlHatasi: string | null;
    /**
     * Platformdaki kreatif kimliği — taze adres bununla isteniyor.
     *
     * `null` olabilir: kreatifi silinmiş ya da hiç bağlanmamış reklamlar var
     * ve onlar için tazelenecek bir şey yok.
     */
    creativeExternalId: string | null;
    /** Hangi reklam hesabından — token ve bağlantı oradan bulunuyor. */
    adAccountId: string;
    headline: string | null;
    /**
     * METİN REKLAMI ÖNİZLEMESİ İÇİN — Google arama reklamının görseli YOK.
     *
     * Görselli reklamda kreatifi kreatifin kendisi anlatıyor; arama
     * reklamında anlatan şey METNİ. Yalnızca ad ve rakam göstermek, o
     * reklamın neye benzediğini raporu okuyandan gizliyordu — kutu boş
     * kalıyordu ve "burada bir görsel olacaktı" gibi duruyordu.
     */
    description: string | null;
    displayUrl: string | null;
    spendMicros: string;
    conversions: number;
    cpa: number | null;
    ctr: number | null;
    platform: (typeof PLATFORMS)[number];
  }>;
  /**
   * Bu dönemde HARCAMASI OLAN ama REKLAM SEVİYESİ verisi bulunmayan platformlar.
   *
   * NEDEN AYRI BİR ALAN: "Öne Çıkan Reklamlar" bölümü harcamaya göre
   * sıralıyor ve platform ayırmıyor. Bir platformun reklam satırı hiç yoksa
   * bölüm sessizce yalnızca diğerini gösteriyor — okuyan "Meta'nın öne çıkan
   * reklamı yokmuş" diye anlıyor, oysa doğrusu "Meta için o dönemde reklam
   * seviyesi veri HİÇ TOPLANMADI".
   *
   * Sebebi yapısal: 90 günlük ilk çekim (`initial_backfill`) bilerek YALNIZCA
   * kampanya seviyesinde koşuyor — ad seviyesinde 90 gün çekmek hesabın
   * kotasını saatlerce bloklar. Reklam seviyesi yalnızca gecelik iş (dün) ve
   * 7 günlük geri düzeltmeden geliyor. Yani hesap o dönemde gecelik
   * senkronize etmiyorsa, o dönemin reklam verisi hiçbir zaman gelmiyor.
   *
   * Boş dizi = eksik yok. Bölüm bu listeyi YAZMAK zorunda.
   */
  topAdsMissingPlatforms: Array<(typeof PLATFORMS)[number]>;
  /**
   * Meta ham `actions` dizisinde arama gibi görünen ama HİÇBİR kovaya
   * düşmeyen eylem türleri (`taninmayanAramaEylemleri`). Boş = sorun yok.
   * Kovanın adı yanlışsa Arama sütunu 0 yazar ve sebep hiçbir yerde
   * görünmezdi; bu liste Meta kampanya tablosunun ÜSTÜNDE yazılıyor.
   */
  unknownCallActions: string[];
  /**
   * Google arama düğmesi tıklaması sorgusunun hata mesajları (ham gövdedeki
   * `callClicksError`, ayrık). Boş = hata yok. Dolu iken sütun o günler için
   * 0 değil BİLİNMİYOR; not Google kampanya tablosunun ÜSTÜNDE yazılıyor.
   */
  callClicksErrors: string[];
  /**
   * Video ek ölçümünün hata mesajları (ham gövdedeki `videoMetricsError`,
   * platform başına ayrık). Boş = hata yok. Dolu iken ilgili hücreler
   * "okunamadı" yazıyor ve not tablonun ÜSTÜNDE (`tabloNotlari`).
   */
  videoMetricsErrors: Array<{ platform: 'meta' | 'google'; mesaj: string }>;
  /**
   * TABLONUN DÖNEM ERİŞİMİ (toplam satırı): platformun hesap seviyesi tekil
   * erişimi. Bütün platformlar için dolu (`PLATFORMS`'tan kuruluyor): elle
   * yazılmış bir platform listesi üçüncü platformu sessizce düşürür.
   */
  donemErisimi: Record<Platform, RaporErisim>;
  /**
   * Dönem erişimi alınamadığında SEBEPLER (platform başına ayrık, kısa).
   * Boş = hata yok. Dolu iken ilgili hücreler "okunamadı" ve not tablonun
   * ÜSTÜNDE (`tabloNotlari`): sebebi yazmayan "okunamadı" okuyanı tahmine
   * iter.
   */
  erisimHatalari: Array<{ platform: Platform; mesaj: string }>;
  /**
   * Anahtar kelime performansı.
   *
   * `null` "veri yok" DEĞİL, "bu yetenek henüz yok" demek: Google anahtar
   * kelime seviyesi senkronizasyonu yazılmadı ve Google Ads Basic Access onayı
   * bekleniyor. Boş dizi göstermek "anahtar kelimen yok" demek olurdu.
   */
  keywords: null | Array<{
    keyword: string;
    spendMicros: string;
    impressions: number;
    clicks: number;
    ctr: number | null;
    cpc: number | null;
  }>;
  /**
   * ARAMA TERİMLERİ — kullanıcının gerçekten YAZDIĞI sorgular.
   *
   * `keywords` bizim hedeflediğimiz şey; bu, kullanıcının yazdığı şey. Fark
   * paranın nereye gittiğini gösteriyor: geniş eşlemeli bir kelime hiç
   * istemediğimiz sorgulara da gösterim alabiliyor.
   *
   * `null` = bu müşteride Google bağlantısı yok (anahtar kelimeyle aynı
   * kural). Boş dizi = bağlantı var, o dönemde terim yok.
   */
  searchTerms: null | Array<{
    term: string;
    /** Terimi getiren anahtar kelime. */
    keyword: string | null;
    /**
     * ADDED | EXCLUDED | ADDED_EXCLUDED | NONE
     *
     * `NONE` = para harcıyor ama ne anahtar kelime ne negatif olarak
     * tanımlı. Raporda işaretleniyor: yapılacak iş tam da o satırlarda.
     */
    status: string;
    spendMicros: string;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number | null;
  }>;
  /**
   * ADLANDIRILMIŞ DÖNÜŞÜMLER.
   *
   * Google'da adlar KULLANICININ Google Ads'te verdiği adlar; Meta'da
   * tekilleştirilmiş kovalar (sebep: `donusum-detaylari.ts`). Fark
   * gizlenmiyor — her satır mecrasını taşıyor.
   *
   * `hatalar` BOŞ LİSTEDEN AYRI BİR ŞEY: "bu dönemde dönüşüm yok" ile
   * "Google detayı vermedi" farklı işler ve rapor müşteriye gidiyor.
   */
  conversionDetail: {
    rows: Array<{
      platform: (typeof PLATFORMS)[number];
      name: string;
      count: number;
      valueMicros: string;
    }>;
    errors: string[];
    /**
     * Aynı kapsamdaki TOPLAM dönüşüm — boş listenin üçüncü hâlini ayırt
     * etmek için (gerekçe: `MetricsConversionDetail.toplamDonusum`).
     */
    totalConversions: number;
  };
  /**
   * SİTE VE DÖNÜŞÜM (Paket F1). `null` = bölüm şablonda seçili değil (sorgu
   * koşmadı). Seçiliyse panel ucuyla AYNI üreticiden
   * (`takip-hesap.ts#takipAcigiYaniti`): ekran ile PDF ayrışmasın.
   */
  siteConversion: TakipAcigiYaniti | null;
  generatedAt: string;
}

/**
 * Şablondan gelen seçimi sütun listesine çevirir.
 *
 * Boş ya da tanınmayan seçim VARSAYILANA dönüyor: kullanıcıya boş bir tablo
 * göstermek, bir ayarı yanlış girdiğini anlamasının en zor yolu.
 *
 * PAYLAŞILAN, çünkü panel ve PDF aynı kararı vermek zorunda.
 */
export function resolveColumns(
  secim: readonly string[] | undefined,
  varsayilan: readonly string[],
  satirlar?: readonly ReportCampaignRow[],
): ColumnKey[] {
  const gecerli = (secim ?? []).filter((k): k is ColumnKey =>
    (COLUMN_KEYS as readonly string[]).includes(k),
  );
  if (gecerli.length > 0) return gecerli;
  const sutunlar = [...(varsayilan as readonly ColumnKey[])];
  // VERİYLE AÇILAN SÜTUNLAR yalnız varsayılan kullanılırken: kullanıcının
  // kendi seçimine sütun eklemek onun kararını ezmek olurdu.
  for (const k of VERIYLE_ACILAN_SUTUNLAR) {
    if (!sutunlar.includes(k) && (satirlar ?? []).some((r) => (r.conversionCounts[k] ?? 0) > 0)) sutunlar.push(k);
  }
  for (const k of veriyleAcilanVideoSutunlari(satirlar ?? [])) {
    if (!sutunlar.includes(k)) sutunlar.push(k);
  }
  for (const k of veriyleAcilanErisimSutunlari(satirlar ?? [])) {
    if (!sutunlar.includes(k)) sutunlar.push(k);
  }
  return sutunlar;
}

/**
 * ERİŞİM SÜTUNLARI DA VERİYLE AÇILIR (arama kovası deseni, yalnız
 * varsayılan kullanılırken):
 *  · Frekans: en az bir satırda dönem erişimi ÖLÇÜLDÜYSE. Google-only
 *    tabloda her satırı "—" olan bir sütun eklemek gürültü olurdu.
 *  · Sonuç ve BGM: en az bir satır ERİŞİM için kurulmuşsa. O kampanyanın
 *    sonucu erişilen kişi ve maliyet ölçüsü bin gösterim; ikisi gizli
 *    kalırsa satırda yalnız "Dönüşüm 0" görünür ve çalışan kampanya boşa
 *    para yakıyor gibi okunur. Her raporda açmak ise her müşteriye boş bir
 *    tablo eklemek olurdu. İkisi ana tabloda DEĞİL, ayrı tabloda
 *    (`kampanyaTablolari`): ana tabloya binince harcama kırpılıyordu.
 */
export function veriyleAcilanErisimSutunlari(satirlar: readonly ReportCampaignRow[]): MetricKey[] {
  const out: MetricKey[] = [];
  if (satirlar.some((r) => r.erisim?.durum === 'olculdu' && r.erisim.frequency !== null)) out.push('frequency');
  if (satirlar.some((r) => r.erisimKampanyasi === true)) out.push('result', 'cpm');
  return out;
}

/**
 * VİDEO SÜTUNLARI DA VERİYLE AÇILIR (arama kovasıyla aynı gerekçe): video
 * kampanyası olmayan raporda altı boş sütun; olan raporda ise kampanyanın
 * TEK sonucu (izlenme) gizli kalırdı. "Okunamadı" da açar: platform ölçümü
 * vermediyse bunu okuyanın görmesi gerekiyor, sütunu gizlemek o bilgiyi de
 * gizlerdi. Çeyrekler ancak çeyrek verisi varsa açılır.
 */
export function veriyleAcilanVideoSutunlari(satirlar: readonly ReportCampaignRow[]): VideoKey[] {
  const izlenme = satirlar.some((r) => (r.video?.izlenme ?? 0) > 0 || r.video?.okunamadi === true);
  if (!izlenme) return [];
  const ceyrek = satirlar.some((r) => (r.video?.p25 ?? 0) > 0);
  return ceyrek ? [...VIDEO_KEYS] : ['videoViews', 'costPerView'];
}

/**
 * ARAMA SÜTUNLARI VERİ VARSA KENDİLİĞİNDEN AÇILIR. Varsayılan Meta
 * sütunlarına sabit eklemek, arama reklamı olmayan her müşterinin raporuna
 * boş iki sütun koyardı; hiç eklememek ise "Beni arasınlar" kampanyasının
 * tek sonucunu (arama) rapordan GİZLERDİ — veri `raw_metrics`te durur ama
 * kullanılmazsa yoktur. Panel ve PDF bu listeyi AYNI fonksiyondan okuyor.
 */
export const VERIYLE_ACILAN_SUTUNLAR: readonly BucketKey[] = ['calls', 'calls20s', 'callClicks'];

/**
 * RAPOR MAİLİ GÖNDERİMİ.
 *
 * Gövde İSTEMCİDEN geliyor ve bu bilinçli: taslak sunucuda üretiliyor
 * (sayılar rapordan), ama anlatı kısmı veriden çıkarılamıyor ve gönderen
 * kişi göndermeden önce düzenliyor. Sunucu üretip doğrudan göndermek,
 * kimsenin okumadığı bir mail göndermek olurdu.
 *
 * GÖVDE TEMİZLENİYOR: kullanıcının düzenlediği HTML alıcının istemcisinde
 * açılıyor — imza ile aynı yüzey.
 */
export const reportSendSchema = z.object({
  clientId: z.string().uuid(),
  from: isoDate,
  to: isoDate,
  templateId: z.string().uuid().optional(),
  /*
   * ÖN AYAR KODU — `templateId` ile AYNI SORUNUN cevabı, farklı biçimde.
   *
   * `reportQuerySchema` bu ikiliyi baştan beri taşıyordu; burada YALNIZCA
   * `templateId` vardı ve sonucu şuydu: ekranda "Google Ads Şablonu" seçen
   * kullanıcı müşterisine GENEL raporu maille gönderiyordu. Hata da vermiyordu
   * — şablonsuz bir istek de geçerli bir istek ve sunucu varsayılanı üretiyor.
   * Gönderilen belge ekranda görülenden farklı ve bunu ancak alıcı görüyor.
   */
  sablon: z.enum(['genel', 'google', 'meta']).optional(),
  /**
   * ALICI LİSTESİ. Boşsa müşterinin kayıtlı adreslerine düşülüyor.
   *
   * DOĞRULAMA GİRİŞ ANINDA: her eleman ayrı ayrı adres olmak zorunda ve Zod
   * hatası hangi elemanın bozuk olduğunu söylüyor. Tek bir dizge alıp sunucuda
   * bölmek daha kolaydı ama hata mesajı "geçersiz alıcı" olurdu ve kullanıcı
   * beş adresten hangisinin bozuk olduğunu ekrandan bulamazdı.
   *
   * ÜST SINIR: bir rapor mailinin yirmiden fazla kişiye gitmesi neredeyse her
   * zaman yanlış listeyi yapıştırmaktan oluyor; kurumsal sağlayıcılar da çok
   * alıcılı mesajları spam sayıyor.
   */
  to_emails: z.array(z.string().trim().email()).max(ALICI_UST_SINIRI).optional(),
  subject: z.string().trim().min(1).max(300),
  html: z.string().min(1).max(200_000),
  /** PDF eki gitsin mi. Kapatmak, yalnızca özet göndermek isteyen için. */
  attachPdf: z.boolean().default(true),
});
export type ReportSendInput = z.infer<typeof reportSendSchema>;

export interface ReportMailDraft {
  subject: string;
  html: string;
  /**
   * Müşterinin kayıtlı alıcıları. BOŞ DİZİ olabilir — ekran bunu söylemeli.
   *
   * `null` yerine boş dizi: "adres tanımlı değil" tek bir hâl ve iki ayrı
   * gösterim (null / []) kuran her ekran birini unutuyordu.
   */
  defaultTo: string[];
  /** Gönderenin e-posta kimliği doğrulanmış mı. Değilse gönderim kapalı. */
  senderReady: boolean;
  senderEmail: string | null;
}

// -----------------------------------------------------------------------------
// Kampanya tablosu — TOPLAM SATIRI
//
// TOPLAMLAR PANELDE VE PDF'TE AYNI YERDEN GELMEK ZORUNDA. Panelin kendi
// toplam fonksiyonları vardı, PDF'in ise HİÇ toplam satırı yoktu: aynı rapor
// ekranda toplamlı, müşteriye giden belgede toplamsız çıkıyordu ve iki
// gösterim arasında bağ kuran hiçbir şey yoktu.
//
// Sütun eklenip toplamı eklenmediğinde tablo sessizce kayıyor ve TypeScript
// hiçbir şey demiyor — `Record<ColumnKey, …>` bunu derleme hatasına çeviriyor.
// -----------------------------------------------------------------------------

/**
 * `erisim` ZORUNLU PARAMETRE: tablonun dönem erişimi (toplam satırı) satır
 * toplamından türetilemiyor ve varsayılanı olsaydı çağıranın onu unutması
 * hem derlemede hem testte sessiz kalırdı (rapor eki bütçesi dersi).
 */
export function sumRows(
  rows: ReportCampaignRow[],
  erisim: RaporErisim,
): MetricTotals & { counts: ConversionCounts; video: RaporVideo; erisim: RaporErisim } {
  let impressions = 0;
  let clicks = 0;
  let spend = 0n;
  let conversions = 0;
  let value = 0n;
  const counts: ConversionCounts = { form: 0, message: 0, purchase: 0, calls: 0, calls20s: 0, callClicks: 0 };

  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    spend += BigInt(r.spendMicros);
    conversions += r.conversions;
    value += BigInt(r.conversionValueMicros);
    counts.form += r.conversionCounts.form;
    counts.message += r.conversionCounts.message;
    counts.purchase += r.conversionCounts.purchase;
    counts.calls += r.conversionCounts.calls;
    counts.calls20s += r.conversionCounts.calls20s;
    counts.callClicks += r.conversionCounts.callClicks;
  }

  const spendUnits = Number(spend) / 1_000_000;
  const valueUnits = Number(value) / 1_000_000;

  return {
    impressions,
    clicks,
    spendMicros: spend.toString(),
    conversions,
    conversionValueMicros: value.toString(),
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? spendUnits / clicks : null,
    cpm: impressions > 0 ? (spendUnits / impressions) * 1000 : null,
    cpa: conversions > 0 ? spendUnits / conversions : null,
    roas: spendUnits > 0 && valueUnits > 0 ? valueUnits / spendUnits : null,
    counts,
    // Eski kayıtta (video alanı yok) boş ölçüm: "—", 0 değil.
    video: videoTopla(rows.map((r) => r.video ?? bosRaporVideo())),
    erisim: toplamFrekansi(impressions, erisim),
  };
}

/**
 * Sütun başına TOPLAM biçimi. `null` = toplanamaz.
 *
 * `reach` SATIRLARDAN TOPLANMIYOR (aynı kişi iki kampanyayı da görmüş
 * olabilir); toplam satırı tablonun DÖNEM erişimini (hesap seviyesi,
 * platformdan) basıyor. Frekans = toplam gösterim ÷ o erişim.
 * `result` toplanamıyor: satırlarda iki farklı tür (erişilen kişi, dönüşüm).
 */
export const COLUMN_TOTALS: Record<
  ColumnKey,
  ((t: ReturnType<typeof sumRows>, currency: string | null) => string) | null
> = {
  spend: (t, m) => formatMoney(t.spendMicros, m, { decimals: 2 }),
  impressions: (t) => formatNumber(t.impressions),
  clicks: (t) => formatNumber(t.clicks),
  reach: (t) => erisimHucresi('reach', t.erisim),
  frequency: (t) => erisimHucresi('frequency', t.erisim),
  cpm: (t, m) => formatMoney(microsOf(t.cpm), m),
  result: null,
  ctr: (t) => formatPercent(t.ctr),
  cpc: (t, m) => formatMoney(microsOf(t.cpc), m),
  cpa: (t, m) => formatMoney(microsOf(t.cpa), m),
  conversions: (t) => formatNumber(t.conversions),
  form: (t) => formatNumber(t.counts.form),
  message: (t) => formatNumber(t.counts.message),
  purchase: (t) => formatNumber(t.counts.purchase),
  calls: (t) => formatNumber(t.counts.calls),
  calls20s: (t) => formatNumber(t.counts.calls20s),
  callClicks: (t) => formatNumber(t.counts.callClicks),
  // Video toplamı satırla AYNI biçimciden: "okunamadı" toplamda da görünür.
  videoViews: (t, m) => videoHucresi('videoViews', t.video, m),
  costPerView: (t, m) => videoHucresi('costPerView', t.video, m),
  videoP25: (t, m) => videoHucresi('videoP25', t.video, m),
  videoP50: (t, m) => videoHucresi('videoP50', t.video, m),
  videoP75: (t, m) => videoHucresi('videoP75', t.video, m),
  videoP100: (t, m) => videoHucresi('videoP100', t.video, m),
};

/** Ondalık birimden micros dizgesine — `formatMoney` micros bekliyor. */
function microsOf(v: number | null): string | null {
  return v === null ? null : String(Math.round(v * 1_000_000));
}


/**
 * ═══ VARSAYILAN ŞABLONLAR ═══
 *
 * Üçü de KODDA, veritabanında değil. Gerekçe: her organizasyona seed ile
 * yazılan üç satır, kullanıcı birini silince geri gelmeyen bir varsayılan
 * demekti — ve "Google şablonu nereye gitti" sorusunun cevabı hiçbir yerde
 * yazmazdı. Kodda duran şablon her zaman var; kullanıcının kendi şablonları
 * bunların YANINA ekleniyor.
 *
 * KIRILIMLAR PLATFORM ŞABLONLARINDA AÇIK, GENELDE KAPALI. Genel rapor
 * müşteriye giden özet: yaş ve saat tabloları onu üç sayfa uzatıyor ve
 * "reklamlarım ne yaptı" sorusunu cevaplamıyor. Kullanıcı isterse Rapor
 * Şablonları ekranından kendi şablonuna ekliyor — bölümler orada zaten
 * seçilebilir.
 */
export const VARSAYILAN_SABLONLAR = [
  {
    kod: 'genel',
    ad: 'Genel Rapor',
    aciklama: 'Meta ve Google birlikte — müşteriye giden özet.',
    sections: [
      'cover',
      'summary',
      'meta_campaigns',
      'google_campaigns',
      'google_keywords',
      'google_search_terms',
      'conversion_detail',
      'site_conversion',
      'top_ads',
      'closing',
    ],
  },
  {
    kod: 'google',
    ad: 'Google Ads Şablonu',
    aciklama: 'Yalnızca Google — anahtar kelime, arama terimi ve kitle kırılımları.',
    sections: [
      'cover',
      'summary',
      'google_campaigns',
      'google_keywords',
      'google_search_terms',
      'conversion_detail',
      'audience_overview',
      'audience_age',
      'audience_gender',
      'audience_placement',
      'audience_hour',
      'audience_city',
      'top_ads',
      'closing',
    ],
  },
  {
    kod: 'meta',
    ad: 'Meta Ads Şablonu',
    aciklama: 'Yalnızca Meta — yerleşim ve kitle kırılımları.',
    sections: [
      'cover',
      'summary',
      'meta_campaigns',
      'conversion_detail',
      'audience_overview',
      'audience_age',
      'audience_gender',
      'audience_placement',
      'audience_hour',
      'audience_city',
      'top_ads',
      'closing',
    ],
  },
] as const satisfies ReadonlyArray<{
  kod: string;
  ad: string;
  aciklama: string;
  sections: readonly ReportSection[];
}>;

export type VarsayilanSablonKodu = (typeof VARSAYILAN_SABLONLAR)[number]['kod'];

export function varsayilanSablon(kod: string | undefined | null) {
  return VARSAYILAN_SABLONLAR.find((s) => s.kod === kod) ?? VARSAYILAN_SABLONLAR[0];
}

/**
 * Şablon PLATFORMA daraltıyor mu.
 *
 * Google şablonunda Meta kampanyaları YOK ve bu yalnızca bölüm listesiyle
 * çözülmüyor: özet kartları, günlük seri ve kitle kırılımları da yalnızca o
 * platformu göstermeli. Aksi hâlde "Google Ads Şablonu" başlıklı raporun
 * özetinde Meta harcaması görünür ve tablolar toplamı tutmaz.
 */
export function sablonPlatformu(kod: string | undefined | null): Platform | null {
  /*
   * KOD LİSTEDEN ÇÖZÜLÜYOR, ELLE DALLANMIYOR.
   *
   * Burada iki `if` vardı ve üçüncü platform eklenince sessizce eskiyordu:
   * "LinkedIn Ads Şablonu" seçili bir raporun özetinde Meta ve Google
   * harcaması görünmeye devam ederdi — hata yok, yalnızca yanlış rapor.
   * Şablon kodu bir platform adıysa o platform, değilse null (Genel).
   */
  const eslesen = PLATFORMS.find((p) => p === kod);
  return eslesen ?? null;
}
