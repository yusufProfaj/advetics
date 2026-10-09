/**
 * Yeni Reklam Oluştur modülünün NİYET KATALOĞU (TASARIM.md § 06.2).
 *
 * Katalog KAPALI ve tek kaynak burası. Her satır `objective`,
 * `optimization_goal`, `destination_type`, `promoted_object` ve CTA'yı
 * BİRLİKTE belirliyor: eski kodda `GOAL_SPEC` ile `objective-matrix` elle
 * ayrı tutuluyordu ve biri güncellenip diğeri unutulunca kampanya bir amaçla,
 * reklam seti başka bir hedefle kuruluyordu — Meta bunu çoğu zaman hata
 * vermeden "düzeltiyor". AI ve reçete yalnızca `NiyetKodu` seçer; Meta alan
 * adı ya da değeri ÜRETMEZ.
 *
 * `kanit: 'belge'` satırı Acemi'ye GÖSTERİLMEZ: değerler Meta'nın
 * dokümantasyonundan, ve bu projede belgeden yazılıp canlıda farklı çıkan
 * alanların listesi uzun (CLAUDE.md "Canlıda öğrenilen platform gerçekleri").
 * Canlı turda PAUSED kurulup geri okununca satır `canli` olur.
 */
import { z } from 'zod';

export const NIYET_KODLARI = [
  'FORM',
  'WHATSAPP',
  'SITE',
  'SATIS',
  'ONE_CIKAR',
  'IG_MESAJ',
  'TELEFON',
  'ERISIM',
  // AdvCampaign rehberi (2026-10-10): "Videom izlensin" Meta dalı.
  'VIDEO_IZLENME',
  'MESSENGER',
  'COK_KANAL_MESAJ',
  // Yalnız Gelişmiş'te açılanlar.
  'WHATSAPP_CAGRI',
  'SITE_MESAJ',
  'YEREL_YARICAP',
] as const;
export const niyetKoduSchema = z.enum(NIYET_KODLARI);
export type NiyetKodu = z.infer<typeof niyetKoduSchema>;

export type MetaOptimizasyonHedefi =
  | 'LEAD_GENERATION'
  | 'CONVERSATIONS'
  | 'LANDING_PAGE_VIEWS'
  | 'OFFSITE_CONVERSIONS'
  | 'QUALITY_CALL'
  | 'REACH'
  | 'THRUPLAY';

/**
 * `tur`: 1 = ilk tur (Acemi), 2-3 = sonraki turlar, `gelismis` = yalnız
 * Gelişmiş mod, `yonlendirme` = taslak açmaz (ONE_CIKAR → Akıllı Boost),
 * `kapali` yok — kapalı niyetler aşağıda ayrı listede, sebebiyle.
 */
export type NiyetTuru = 1 | 2 | 3 | 'gelismis' | 'yonlendirme';

export interface NiyetSatiri {
  kod: NiyetKodu;
  ekranAdi: string;
  /** Kartın altındaki "ne alacaksın" cümlesi. */
  neAlacaksin: string;
  tur: NiyetTuru;
  kanit: 'belge' | 'canli';
  /**
   * Yönlendirme satırında `null`: yeni modül o niyette Meta'ya HİÇ yazmaz
   * (karar 5, Akıllı Boost sınırı; C-20 §1a).
   */
  meta: {
    objective: string;
    optimizationGoal: MetaOptimizasyonHedefi;
    /** `null` = alan yok (ERISIM). Yazılmayan değil: niyette karşılığı yok. */
    destinationType: string | null;
    promotedObject: 'page_id' | 'pixel_id+custom_event_type' | null;
    cta: string;
    /** CTA `value` içinde `app_destination` gerekiyorsa. */
    appDestination?: 'WHATSAPP' | 'INSTAGRAM_DIRECT' | 'MESSENGER';
  } | null;
  /** Değeri canlıda ölçülmeden kesinleşmeyen alanlar (ekranda açılmaz). */
  canliOlculecek?: string[];
}

export const NIYET_KATALOGU: Record<NiyetKodu, NiyetSatiri> = {
  FORM: {
    kod: 'FORM',
    ekranAdi: 'Form doldursunlar',
    neAlacaksin: 'Adı ve telefonu olan form alırsın.',
    tur: 1,
    kanit: 'belge',
    // Form kimliği YALNIZ kreatifin call_to_action.value'sunda; ad set'in
    // promoted_object'ine konursa Meta reddediyor (13 Ağustos 5. hata).
    meta: {
      objective: 'OUTCOME_LEADS',
      optimizationGoal: 'LEAD_GENERATION',
      destinationType: 'ON_AD',
      promotedObject: 'page_id',
      cta: 'SIGN_UP',
    },
  },
  WHATSAPP: {
    kod: 'WHATSAPP',
    ekranAdi: "WhatsApp'tan yazsınlar",
    neAlacaksin: "WhatsApp'ına mesaj gelir.",
    tur: 1,
    kanit: 'belge',
    // Amaç LEADS: Advantage+ lead kampanya durumu ve mesajlaşmadan lead'e
    // geçiş yalnız bu amaçta var. Numara SORULMAZ, Meta sayfadan alıyor
    // (CLAUDE.md CTWA); bağlantı sabit.
    meta: {
      objective: 'OUTCOME_LEADS',
      optimizationGoal: 'CONVERSATIONS',
      destinationType: 'WHATSAPP',
      promotedObject: 'page_id',
      cta: 'WHATSAPP_MESSAGE',
      appDestination: 'WHATSAPP',
    },
    canliOlculecek: ['objective (LEADS ↔ ENGAGEMENT advantage_state_info karşılaştırması)'],
  },
  SITE: {
    kod: 'SITE',
    ekranAdi: 'Siteme gelsinler',
    neAlacaksin: 'Sitene gelen ziyaretçi alırsın.',
    tur: 1,
    kanit: 'belge',
    // destination_type SITE'de de AÇIKÇA WEBSITE: verilmezse Meta tahmin
    // ediyor ve boost'ta bu tahmin canlıda ret üretti.
    meta: {
      objective: 'OUTCOME_TRAFFIC',
      optimizationGoal: 'LANDING_PAGE_VIEWS',
      destinationType: 'WEBSITE',
      promotedObject: null,
      cta: 'LEARN_MORE',
    },
  },
  SATIS: {
    kod: 'SATIS',
    ekranAdi: 'Sitemden satış ya da kayıt gelsin',
    neAlacaksin: 'Sitende satış ya da kayıt alırsın.',
    tur: 1,
    kanit: 'belge',
    // objective olaya göre değişiyor (satış → SALES, kayıt → LEADS); burada
    // satış dalı duruyor, kayıt dalını derleyici custom_event_type'tan seçer.
    meta: {
      objective: 'OUTCOME_SALES',
      optimizationGoal: 'OFFSITE_CONVERSIONS',
      destinationType: 'WEBSITE',
      promotedObject: 'pixel_id+custom_event_type',
      cta: 'SHOP_NOW',
    },
  },
  ONE_CIKAR: {
    kod: 'ONE_CIKAR',
    ekranAdi: 'Paylaşımımı öne çıkar',
    neAlacaksin: "Instagram paylaşımlarını öne çıkarmak Akıllı Boost'ta yapılır.",
    tur: 'yonlendirme',
    kanit: 'canli',
    meta: null,
  },
  IG_MESAJ: {
    kod: 'IG_MESAJ',
    ekranAdi: "Instagram'dan mesaj atsınlar",
    neAlacaksin: 'Instagram mesaj kutuna mesaj gelir.',
    tur: 2,
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoal: 'CONVERSATIONS',
      destinationType: 'INSTAGRAM_DIRECT',
      promotedObject: 'page_id',
      cta: 'INSTAGRAM_MESSAGE',
      appDestination: 'INSTAGRAM_DIRECT',
    },
  },
  // Eski adı ARAMA'ydı: Google'ın "Arama kampanyası" (Search) ile aynı panelde
  // karışıyordu (SENTEZ S-08). Tablolar deploy edilmeden değişti, veri yok.
  TELEFON: {
    kod: 'TELEFON',
    ekranAdi: 'Beni telefonla arasınlar',
    neAlacaksin: 'Telefonun çalar.',
    tur: 2,
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_LEADS',
      optimizationGoal: 'QUALITY_CALL',
      destinationType: 'PHONE_CALL',
      promotedObject: 'page_id',
      cta: 'CALL_NOW',
    },
    canliOlculecek: ['objective (LEADS reddedilirse TRAFFIC)', 'promoted_object'],
  },
  ERISIM: {
    kod: 'ERISIM',
    ekranAdi: 'Daha çok kişi görsün',
    neAlacaksin: 'Bölgendeki insanlar reklamını görür.',
    tur: 2,
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_AWARENESS',
      optimizationGoal: 'REACH',
      destinationType: null,
      promotedObject: 'page_id',
      cta: 'LEARN_MORE',
    },
  },
  // Panel turu (A4, 2026-10-10): Meta video izlenmeyi iki yerde sunuyor
  // (Etkileşim › Reklamınızda › Video görüntüleme ve Bilinirlik › ThruPlay).
  // Etkileşim seçildi: Bilinirlik'te sıklık sınırı ve erişim odaklı teslim
  // devreye giriyor, "izlensin" isteyen kullanıcı izlenme sayısı bekliyor.
  VIDEO_IZLENME: {
    kod: 'VIDEO_IZLENME',
    ekranAdi: 'Videom izlensin',
    neAlacaksin: 'Videonu sonuna kadar izleyen kişiler.',
    tur: 2,
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoal: 'THRUPLAY',
      destinationType: 'ON_VIDEO',
      promotedObject: 'page_id',
      cta: 'LEARN_MORE',
    },
    canliOlculecek: ['destination_type (ON_VIDEO)', 'objective (ENGAGEMENT ↔ AWARENESS)'],
  },
  MESSENGER: {
    kod: 'MESSENGER',
    ekranAdi: "Messenger'dan yazsınlar",
    neAlacaksin: 'Facebook mesaj kutuna mesaj gelir.',
    tur: 3,
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoal: 'CONVERSATIONS',
      destinationType: 'MESSENGER',
      promotedObject: 'page_id',
      cta: 'MESSAGE_PAGE',
      appDestination: 'MESSENGER',
    },
  },
  COK_KANAL_MESAJ: {
    kod: 'COK_KANAL_MESAJ',
    ekranAdi: 'Nereden olursa yazsınlar',
    neAlacaksin: 'Hangi kanaldan kolaysa oradan mesaj gelir.',
    tur: 3,
    kanit: 'belge',
    // destination_type bağlı kanallardan türüyor (MESSAGING_*); sabit bir
    // değer yazmak tek kanala kilitlerdi. Derleyici kanal kümesinden kurar.
    meta: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoal: 'CONVERSATIONS',
      destinationType: 'MESSAGING_*',
      promotedObject: 'page_id',
      cta: 'kanal_basina',
    },
  },
  WHATSAPP_CAGRI: {
    kod: 'WHATSAPP_CAGRI',
    ekranAdi: "WhatsApp'tan yazsınlar ya da arasınlar",
    neAlacaksin: 'WhatsApp’tan mesaj ya da arama gelir.',
    tur: 'gelismis',
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoal: 'CONVERSATIONS',
      destinationType: 'WHATSAPP',
      promotedObject: 'page_id',
      cta: 'WHATSAPP_MESSAGE',
      appDestination: 'WHATSAPP',
    },
  },
  SITE_MESAJ: {
    kod: 'SITE_MESAJ',
    ekranAdi: 'Siteme gelsinler, isterlerse yazsınlar',
    neAlacaksin: 'Sitene ziyaretçi, isteyenden mesaj gelir.',
    tur: 'gelismis',
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_TRAFFIC',
      optimizationGoal: 'LANDING_PAGE_VIEWS',
      destinationType: 'WEBSITE',
      promotedObject: null,
      cta: 'LEARN_MORE',
    },
  },
  YEREL_YARICAP: {
    kod: 'YEREL_YARICAP',
    ekranAdi: 'Mağazamın çevresindekiler görsün',
    neAlacaksin: 'Mağazanın çevresindeki insanlar reklamını görür.',
    tur: 'gelismis',
    kanit: 'belge',
    meta: {
      objective: 'OUTCOME_AWARENESS',
      optimizationGoal: 'REACH',
      destinationType: null,
      promotedObject: 'page_id',
      cta: 'LEARN_MORE',
    },
  },
};

/**
 * Arayüzde HİÇ görünmeyen niyetler. Silinmiyor, sebebiyle duruyor: AI "bu
 * neden yok" sorusuna kayıttan cevap versin. Yazma kodu ve canlı doğrulaması
 * olmayan bir seçeneği göstermek çalışmayan bir yolu açmak olur.
 */
export const KAPALI_NIYETLER: ReadonlyArray<{ ad: string; sebep: string }> = [
  { ad: 'Profil ziyareti', sebep: 'API erişimi Meta tarafında sınırlı.' },
  { ad: 'Messenger lead ve abonelik', sebep: 'Yazma kodu ve canlı doğrulama yok.' },
  { ad: 'Etkinlik', sebep: 'Yazma kodu ve canlı doğrulama yok.' },
  { ad: 'Katalog satışı', sebep: 'Katalog izni App Review kapsamından çıkarıldı (C-49).' },
  { ad: 'Dinamik kreatif', sebep: 'Kavram modeliyle çakışıyor; yazma kodu yok.' },
  { ad: 'Partnership', sebep: 'Yazma kodu ve canlı doğrulama yok.' },
  { ad: 'Omnichannel', sebep: 'Yazma kodu ve canlı doğrulama yok.' },
  { ad: 'Uygulama içi olay', sebep: 'Workspace’lerde mobil uygulama yok.' },
];

/**
 * Acemi'de gösterilecek niyetler: yalnız ilk tur, canlıda doğrulanmış ve
 * yönlendirme kartı. `belge` satırı süzülüyor — canlı tur bitmeden bu liste
 * yalnızca ONE_CIKAR döndürür ve bu BİLEREK: boş bir sayfa, çalışmayan bir
 * düğmeden iyidir.
 */
export function acemiNiyetleri(): NiyetSatiri[] {
  return NIYET_KODLARI.map((k) => NIYET_KATALOGU[k]).filter(
    (n) => n.tur === 'yonlendirme' || (n.tur === 1 && n.kanit === 'canli'),
  );
}

/**
 * Sonuç etiketi `objective`'ten DEĞİL `optimization_goal`'dan türer.
 * WhatsApp niyeti OUTCOME_LEADS ile kuruluyor ama Meta'nın saydığı şey sohbet
 * başlangıcı; "potansiyel müşteri" yazmak müşteriye lead aldığını söyler,
 * oysa elinde yalnız mesaj var.
 */
export const SONUC_ETIKETLERI: Record<MetaOptimizasyonHedefi, string> = {
  LEAD_GENERATION: 'form',
  CONVERSATIONS: 'sohbet başlatan kişi',
  LANDING_PAGE_VIEWS: 'sayfa görüntüleme',
  OFFSITE_CONVERSIONS: 'dönüşüm',
  REACH: 'erişilen kişi',
  QUALITY_CALL: 'arama',
  THRUPLAY: 'video izlenmesi',
};

/** OFFSITE_CONVERSIONS'ta etiket olaydan gelir; sözlük kapalı. */
export const OLAY_ETIKETLERI: Record<string, string> = {
  PURCHASE: 'satın alma',
  COMPLETE_REGISTRATION: 'kayıt',
  LEAD: 'başvuru',
  ADD_TO_CART: 'sepete ekleme',
};

export function sonucEtiketi(hedef: MetaOptimizasyonHedefi, olay?: string): string {
  if (hedef === 'OFFSITE_CONVERSIONS' && olay) {
    // Bilinmeyen olayda genel ada düş — olay kodunu ekrana basmak
    // ("COMPLETE_REGISTRATION") arayüz diline aykırı.
    return OLAY_ETIKETLERI[olay] ?? SONUC_ETIKETLERI.OFFSITE_CONVERSIONS;
  }
  return SONUC_ETIKETLERI[hedef];
}
