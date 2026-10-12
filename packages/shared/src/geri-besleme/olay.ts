import { teslimSonucu } from '../sinyal/durum';
import { META_ASAMA_OLAY_ADI, type GeriBeslemeAsamasi } from './asama';

/**
 * ═══ GERİ BESLEME OLAYI: DURUM MAKİNESİ + META İSTEĞİ (Paket E) ═══
 *
 * Bir satır = bir lead'in bir aşamasının bir platforma bildirimi
 * (`geri_besleme_olaylari`, MIMARI § 2). Satır bir NİYET kaydı; gerçek,
 * platformun cevabı. Bu dosyadaki her karar saf ve testte çalıştırılarak
 * kilitli (`apps/api/src/modules/geri-besleme/sozlesme.spec.ts`).
 *
 * İKİ AYRI "OLMADI" VAR VE EKRANDA İKİSİ AYRI YAZILIR (brief'in açık isteği):
 *
 * - `eslesmedi`: platform olayı ALDI ama kişiyi/tıklamayı bulamadı (Google
 *   `CLICK_NOT_FOUND`). Yapılacak iş yok, ekranda "Meta/Google bu kişiyi
 *   reklamla eşleştiremedi" yazar. Yeniden denemek aynı sonucu verir.
 * - `reddedildi` / `vazgecildi` / `suresi_doldu`: olay platforma HİÇ
 *   ULAŞMADI. Yapılacak iş var (ayar, izin, süre) ve ekranda sebebi yazar.
 *
 * İkisini aynı "gönderilemedi" kutusuna koymak, ajansı çalışan bir kurulumu
 * bozmaya ya da bozuk bir kurulumu çalışıyor sanmaya gönderir.
 */
export const GERI_BESLEME_OLAY_DURUMLARI = [
  'bekliyor',
  'basarisiz',
  'iletildi',
  'eslesmedi',
  'reddedildi',
  'vazgecildi',
  'suresi_doldu',
  'iptal',
] as const;
export type GeriBeslemeOlayDurumu = (typeof GERI_BESLEME_OLAY_DURUMLARI)[number];

/**
 * SON durumlar: gönderim kuyruğu bunlara bir daha dokunmaz. İlerleme ve
 * kapsama sayan HER yer bu listeyi okur (CLAUDE.md "bir durum enum'ından
 * ikisini saymak kalanları sonsuza kadar açık bırakıyor").
 */
export const GERI_BESLEME_SON_DURUMLAR: readonly GeriBeslemeOlayDurumu[] = [
  'iletildi',
  'eslesmedi',
  'reddedildi',
  'vazgecildi',
  'suresi_doldu',
  'iptal',
];

/** Platforma ULAŞAN son durumlar (kapsama sayımı bunları sayar). */
export const GERI_BESLEME_ULASAN_DURUMLAR: readonly GeriBeslemeOlayDurumu[] = ['iletildi', 'eslesmedi'];

/** Platforma ulaşmayan ve yapılacak iş olan son durumlar (uyarı bunlardan). */
export const GERI_BESLEME_SORUNLU_DURUMLAR: readonly GeriBeslemeOlayDurumu[] = ['reddedildi', 'vazgecildi', 'suresi_doldu'];

export const GERI_BESLEME_OLAY_DURUM_ADI: Record<GeriBeslemeOlayDurumu, string> = {
  bekliyor: 'Gönderilecek',
  basarisiz: 'Tekrar denenecek',
  iletildi: 'İletildi',
  eslesmedi: 'İletildi, eşleşmedi',
  reddedildi: 'Platform reddetti',
  vazgecildi: 'Gönderilemedi',
  suresi_doldu: 'Süresi geçti',
  iptal: 'Geri alındı',
};

/**
 * Geçişi tetikleyen olaylar ve KİMİN yazdığı:
 * - `kabul`, `eslesmedi`, `gecici_hata`, `olay_hatasi` (gönderim işi, platform cevabından)
 * - `sure_doldu` (gönderim işi, ÇAĞRIDAN ÖNCE: 7 gün kuralı)
 * - `geri_alindi` (lead durum güncellemesi, `asamaPlani().iptal`)
 * - `yeniden_istendi` (`asamaPlani().yenidenAc` ya da kullanıcının "Tekrar dene"si, `lead.write`)
 *
 * AYAR HATASI BURADA YOK. Token, izin, dataset erişimi gibi hatalar olayın
 * değil kurulumun hatası: satırları `reddedildi` yapmak, ayar düzelince
 * hepsini elle yeniden denetmek demek olurdu. Ayar hatasında satırlar
 * `bekliyor` kalır, deneme sayısı ARTMAZ ve ayar `hata`ya düşer
 * (`metaYanitSinifi` → `ayar_hatasi`).
 */
export const GERI_BESLEME_OLAY_GECISLERI_OLAYLARI = [
  'kabul',
  'eslesmedi',
  'gecici_hata',
  'olay_hatasi',
  'sure_doldu',
  'geri_alindi',
  'yeniden_istendi',
] as const;
export type GeriBeslemeGecisOlayi = (typeof GERI_BESLEME_OLAY_GECISLERI_OLAYLARI)[number];

/** Geçici hatada toplam deneme (ilk dahil). Pencere zaten 7 gün; bundan fazlası kotayı yer. */
export const GERI_BESLEME_EN_FAZLA_DENEME = 5;
/** Denemeler arası bekleme (dakika): 5, 30, 120, 360. */
export const GERI_BESLEME_BEKLEME_ARALIGI_DK: readonly number[] = [5, 30, 120, 360];

/**
 * Geçiş. `null` = olay o durumda anlamsız (çağıran satıra dokunmaz; kullanıcı
 * ucunda 409). `deneme` = bu geçişle birlikte YAPILMIŞ deneme sayısı.
 *
 * KRİTİK: `iletildi` ve `eslesmedi`den ÇIKIŞ YOK. Platforma ulaşmış bir olayı
 * "yeniden dene" ile bir daha göndermek, Meta'da aynı aşamanın iki kez
 * sayılması demek (aynı kaynaktan tekrar eden sunucu olayının
 * tekilleştirildiği belgede AÇIK DEĞİL, ölçüm listesi M-6).
 */
export function geriBeslemeGecisi(
  durum: GeriBeslemeOlayDurumu,
  olay: GeriBeslemeGecisOlayi,
  deneme = 0,
): GeriBeslemeOlayDurumu | null {
  const gonderilebilir = durum === 'bekliyor' || durum === 'basarisiz';
  switch (olay) {
    case 'kabul':
      return gonderilebilir ? 'iletildi' : null;
    case 'eslesmedi':
      return gonderilebilir ? 'eslesmedi' : null;
    case 'gecici_hata':
      if (!gonderilebilir) return null;
      return deneme >= GERI_BESLEME_EN_FAZLA_DENEME ? 'vazgecildi' : 'basarisiz';
    case 'olay_hatasi':
      return gonderilebilir ? 'reddedildi' : null;
    case 'sure_doldu':
      return gonderilebilir ? 'suresi_doldu' : null;
    case 'geri_alindi':
      return gonderilebilir ? 'iptal' : null;
    case 'yeniden_istendi':
      // Platforma ULAŞMAMIŞ son durumlardan geri dönüş. `suresi_doldu`
      // buradan dönebilir ama gönderim işi 7 gün kontrolünü yeniden yapar
      // ve satır aynı yere düşer; ekran düğmeyi o hâlde zaten göstermez.
      return durum === 'iptal' || durum === 'vazgecildi' || durum === 'reddedildi' ? 'bekliyor' : null;
  }
}

/** Bir sonraki deneme ne zaman (ms). Deneme bitti ise null. */
export function sonrakiDenemeMs(simdiMs: number, yapilanDeneme: number): number | null {
  if (yapilanDeneme >= GERI_BESLEME_EN_FAZLA_DENEME) return null;
  const dk = GERI_BESLEME_BEKLEME_ARALIGI_DK[Math.min(yapilanDeneme - 1, GERI_BESLEME_BEKLEME_ARALIGI_DK.length - 1)] ?? 5;
  return simdiMs + dk * 60_000;
}

// -----------------------------------------------------------------------------
// İdempotens
// -----------------------------------------------------------------------------

/**
 * Olay kimliği: Meta `event_id`, Google `transactionId`. DETERMİNİSTİK —
 * rastgele kimlik, ağ zaman aşımından sonraki yeniden denemeyi platformda
 * YENİ bir olay yapardı (cevap gelmedi ama olay ulaşmış olabilir).
 * Platform tekilleştirmesine YASLANMIYORUZ (bkz. M-6); asıl engel
 * veritabanındaki `(lead_id, platform, asama)` tekilliği. Kimlik ikinci
 * savunma hattı.
 *
 * Google `transactionId` ve Meta `event_id` için güvenli karakterler:
 * yalnız harf, rakam, tire. Uzunluk 64'ü geçmez.
 */
export function geriBeslemeOlayKimligi(leadId: string, asama: GeriBeslemeAsamasi): string {
  return `adv-${leadId}-${asama}`;
}

// -----------------------------------------------------------------------------
// Meta CRM (Conversion Leads) olayı
// -----------------------------------------------------------------------------

/**
 * Meta resmî belgesi (conversions-api/conversion-leads-integration/
 * payload-specification, 2026-10-12'de okundu):
 * - zorunlu: `event_name`, `event_time`, `action_source`, `user_data`,
 *   `custom_data.lead_event_source`, `custom_data.event_source`
 * - `action_source` = `system_generated`
 * - `custom_data.event_source` = `crm`. EKSİKSE olay kabul edilir, Events
 *   Manager'da GÖRÜNÜR ama Conversion Leads'e HİÇ GİRMEZ: sessiz hatanın
 *   tanımı. Sabit, kullanıcı değiştiremez.
 * - `event_time` en fazla 7 gün geçmiş; `lead_id` 15-17 hane, geçersizse
 *   olay reddedilir.
 */
export const META_CRM = {
  surum: 'v25.0',
  actionSource: 'system_generated',
  eventSource: 'crm',
  /** CRM aracının adı. Beyaz etiket: ajans değil ürün adı (rapor kapağı kuralı). */
  leadEventSource: 'Advetics',
  /** Belgenin sınırı 7 gün; bir saat pay: kuyruğun beklediği süre içinde sınırı aşmasın. */
  enEskiSn: 7 * 24 * 3600 - 3600,
  /**
   * Parti boyutu. Belge 1.000'e izin veriyor ama TEK geçersiz olay BÜTÜN
   * partiyi düşürüyor ("the whole batch will be discarded"). 50, kötü bir
   * olayın yarıçapını küçük tutar ve yarılamayı en çok 6 adımda tek olaya
   * indirir.
   */
  partiBoyutu: 50,
} as const;

/** 15-17 hane (belge). Baştaki sıfır yok: Meta kimlikleri sıfırla başlamaz. */
export function metaLeadIdGecerli(id: string): boolean {
  return /^[1-9]\d{14,16}$/.test(id);
}

/**
 * 7 gün kuralı ÇAĞRIDAN ÖNCE. Tek bir eski olay partinin TAMAMINI düşürür,
 * yani bu kontrol olay başına ve partiye girmeden yapılmalı; aksi hâlde
 * eski bir `ham_lead` her 5 dakikada bütün partiyi öldürür ve kalan 49
 * olay da `vazgecildi`ye kadar sürüklenir.
 */
export function metaPenceredeMi(olayZamaniSn: number, simdiMs: number): boolean {
  return Math.floor(simdiMs / 1000) - olayZamaniSn <= META_CRM.enEskiSn;
}

export interface MetaCrmOlayGirdisi {
  /** `leads.external_lead_id` — DİZE olarak taşınır, bkz. `metaGovdeMetni`. */
  leadId: string;
  asama: GeriBeslemeAsamasi;
  olayZamaniSn: number;
  olayKimligi: string;
}

/**
 * KİŞİSEL VERİ GİTMEZ (MIMARI Ç-8): `user_data` YALNIZ `lead_id` taşır.
 * Belgenin öncelik sırasında `lead_id` EN YÜKSEK ve tek başına yeterli;
 * Meta kişiyi zaten tanıyor (formu Meta'da doldurdu). Hash'li e-posta ya da
 * telefon eklemek eşleşmeyi artırmaz, KVKK yüzeyini artırır. Tip bilerek
 * dar: `em`/`ph` alanı eklemek derlemeyi kırar.
 */
export interface MetaCrmOlayi {
  event_name: string;
  event_time: number;
  action_source: 'system_generated';
  event_id: string;
  user_data: { lead_id: string };
  custom_data: { lead_event_source: string; event_source: 'crm' };
}

export function metaCrmOlayi(g: MetaCrmOlayGirdisi): MetaCrmOlayi {
  return {
    event_name: META_ASAMA_OLAY_ADI[g.asama],
    event_time: g.olayZamaniSn,
    action_source: 'system_generated',
    event_id: g.olayKimligi,
    user_data: { lead_id: g.leadId },
    custom_data: { lead_event_source: META_CRM.leadEventSource, event_source: 'crm' },
  };
}

/**
 * İstek gövdesi METİN olarak. `lead_id` belgenin örneğinde SAYI
 * (`"lead_id": 1234567890123456`) ama 17 haneli bir kimlik JavaScript
 * sayısına sığmıyor (2^53 ≈ 9,007e15): `Number('12345678901234567')`
 * 12345678901234568 olur ve Meta YANLIŞ kişiye ya da hiç kimseye bağlar,
 * hata vermeden. Kimlik dize olarak taşınır ve yalnız JSON METNİNDE tırnak
 * atılarak sayı literaline çevrilir; hiçbir adımda `Number()` görmez.
 * `sayiOlarak: false` dizeyi aynen bırakır (Meta'nın dizeyi kabul edip
 * etmediği ölçüm listesinde, M-3).
 *
 * `test_event_code` YOK ve OLAMAZ: Meta test olaylarını ATMIYOR, üretim
 * verisine işliyor (08-olcum § Tuzaklar 1). Kaynak taramasıyla kilitli.
 */
export function metaGovdeMetni(olaylar: readonly MetaCrmOlayi[], secenek: { sayiOlarak: boolean } = { sayiOlarak: true }): string {
  for (const o of olaylar) {
    if (!metaLeadIdGecerli(o.user_data.lead_id)) {
      throw new Error(`Geçersiz Meta lead kimliği: ${o.user_data.lead_id}`);
    }
  }
  const metin = JSON.stringify({ data: olaylar });
  return secenek.sayiOlarak ? metin.replace(/"lead_id":"(\d{15,17})"/g, '"lead_id":$1') : metin;
}

// -----------------------------------------------------------------------------
// Meta cevabı
// -----------------------------------------------------------------------------

export type MetaYanitSinifi =
  /** `events_received` gönderilenle aynı: hepsi `iletildi`. */
  | 'kabul'
  /** Ağ, 5xx, hız sınırı: deneme sayısı artar. */
  | 'gecici'
  /** Olayın içeriği geçersiz. Parti > 1 ise YARILA, tek olaysa `reddedildi`. */
  | 'olay_hatasi'
  /** Token, izin, dataset yok: satırlar `bekliyor` kalır, AYAR `hata`ya düşer. */
  | 'ayar_hatasi'
  /** 2xx ama `events_received` uyuşmuyor: "200 döndü doğrulama değil" — geçici say, not yaz. */
  | 'uyusmazlik';

export interface MetaYaniti {
  http: number | null;
  eventsReceived?: number | null;
  hataKodu?: number | null;
  hataAltKodu?: number | null;
}

/**
 * Meta hata kodları (Graph genel sözlüğü): 190 token geçersiz, 10 ve
 * 200-299 izin, 803 / 100+alt kod 33 "nesne yok ya da erişim yok" (dataset
 * paylaşılmamış), 4 / 17 / 32 / 613 / 80004 hız sınırı, 1 / 2 geçici.
 * 100 (Invalid parameter) olay içeriği. Kodu tanımadığımız 4xx `olay_hatasi`
 * sayılır: yarılama onu tek olaya indirir ve yalnız o olay `reddedildi`
 * olur; ayar hatası saymak BÜTÜN kuyruğu sonsuza kadar bekletirdi.
 *
 * HTTP sınıfı Paket A'nın `teslimSonucu`ndan (aynı 408/429/5xx kuralı;
 * ikinci bir HTTP sınıflandırıcısı doğduğu anda ayrışır).
 */
export function metaYanitSinifi(y: MetaYaniti, gonderilen: number): MetaYanitSinifi {
  const kod = y.hataKodu ?? null;
  if (kod === 190 || kod === 10 || kod === 803 || (kod !== null && kod >= 200 && kod <= 299)) return 'ayar_hatasi';
  if (kod === 100 && y.hataAltKodu === 33) return 'ayar_hatasi';
  if (kod === 1 || kod === 2 || kod === 4 || kod === 17 || kod === 32 || kod === 613 || kod === 80004) return 'gecici';
  const http = teslimSonucu(y.http);
  if (http === 'gecici_hata') return 'gecici';
  if (http === 'kalici_hata') return 'olay_hatasi';
  return y.eventsReceived === gonderilen ? 'kabul' : 'uyusmazlik';
}

/**
 * Yarılama. Durma koşulu UZUNLUK (CLAUDE.md "özyinelemenin durma koşulunu
 * sunum değişkenine bağlama": `Math.floor(1/2) = 0` ile aynı tek elemanlı
 * listeyi sonsuza çağırmak bellek taşmasıyla düşmüştü). Tek elemanlı liste
 * için `null`: çağıran olayı `reddedildi` yapar.
 */
export function partiyiYarila<T>(parti: readonly T[]): [T[], T[]] | null {
  if (parti.length <= 1) return null;
  const orta = Math.ceil(parti.length / 2);
  return [parti.slice(0, orta), parti.slice(orta)];
}

/**
 * Aynı lead'in aşamaları SIRAYLA gider (Meta: son aşamadan önce öncekiler
 * gönderilmiş olmalı). Bir aşama, aynı lead'in hunideki önceki aşamaları
 * platforma ulaşmışsa ya da AYNI partide öndeyse gönderilebilir. Önceki
 * aşama `reddedildi`/`suresi_doldu` ise sonraki yine gider: kilitlemek,
 * eski bir `ham_lead` yüzünden lead'in satış bilgisini hiç göndermemek
 * olurdu; Meta eksik aşamayla da öğreniyor, yalnız daha kötü.
 */
export function partiSirala<T extends { leadId: string; asama: GeriBeslemeAsamasi }>(olaylar: readonly T[]): T[] {
  const sira: Record<GeriBeslemeAsamasi, number> = { ham_lead: 0, ulasildi: 1, nitelikli: 2, satisa_dondu: 3, uygun_degil: 4 };
  return [...olaylar].sort((a, b) => (a.leadId === b.leadId ? sira[a.asama] - sira[b.asama] : a.leadId < b.leadId ? -1 : 1));
}
