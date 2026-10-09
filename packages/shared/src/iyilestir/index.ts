import { z } from 'zod';
import type { Platform } from '../constants/platforms';

/**
 * ═══ İYİLEŞTİR v1 + AI ASİSTAN v1 — SÖZLEŞME (Ajan 1 · Mimar, 2026-10-09) ═══
 *
 * Ayrıntı ve gerekçeler `docs/iyilestir/MIMARI.md`. Ajan 2 (API) ve Ajan 3
 * (panel) tip TANIMLAMAZ, buradan okur: iki tarafta ayrı yazılan bir öneri
 * tipi ilk alan eklemede ayrışır ve panel olmayan bir alanı gösterir.
 */

// ─── Öneri türleri ───────────────────────────────────────────────────────────

/**
 * v1 TÜRLERİ. Yeni tür eklemek: buraya ekle, üreticisini yaz, panelin
 * etiket tablosu (`ONERI_TURU_ETIKETI`) `Record` olduğu için derleme seni
 * oraya götürür.
 */
export const ONERI_TURLERI = ['kreatif_yorgunlugu', 'butce_artir', 'butce_azalt'] as const;
export type OneriTuru = (typeof ONERI_TURLERI)[number];

export const ONERI_TURU_ETIKETI: Record<OneriTuru, string> = {
  kreatif_yorgunlugu: 'Kreatif yorgunluğu',
  butce_artir: 'Bütçe',
  butce_azalt: 'Bütçe',
};

/** Önerinin dokunduğu varlık seviyesi; bütçe öneri bütçenin GERÇEKTEN durduğu seviyede. */
export const ONERI_SEVIYELERI = ['campaign', 'ad_group', 'ad'] as const;
export type OneriSeviyesi = (typeof ONERI_SEVIYELERI)[number];

// ─── Eşikler (ölçümden, MIMARI.md § Ölçüm) ──────────────────────────────────

/**
 * KREATİF YORGUNLUĞU EŞİKLERİ — canlı veriden (2026-10-09, Meta, reklam
 * seviyesi, iki haftada da ≥1.000 gösterimi olan 307 reklam): tıklama oranı
 * oranının (bu hafta / geçen hafta) ortancası 0,99, alt %10'u 0,66. Yani
 * %30'luk düşüş "olağan dalgalanma" değil, alt %10'luk dilim. Sıklık
 * artışıyla birlikte 22 reklam, son 7 günde 24.102 ₺ harcama.
 *
 * Eşiği değiştirirken ölçümü yeniden yap ve sayıyı buraya yaz: tahminle
 * değiştirilen eşik ya her reklamı yorgun ilan eder ya hiçbirini.
 */
export const YORGUNLUK = {
  /** Bu hafta tıklama oranı geçen haftanın bu oranının ALTINDA. */
  ctrOraniEnFazla: 0.7,
  /** Günlük sıklık geçen haftadan YÜKSEK olmalı (aynı kişilere tekrar gösterim). */
  siklikArtmali: true,
  /** İki haftada da en az bu kadar gösterim: az gösterimde oran gürültü. */
  enAzGosterim: 1000,
  /** Karşılaştırılan pencere (gün); bugün dâhil değil (eksik gün). */
  pencereGun: 7,
} as const;

/** Bütçe önerisi tek seferde en fazla bu oranda değiştirir (kullanıcı kararı, 2026-10-09). */
export const BUTCE_ADIMI_EN_FAZLA = 0.2;

// ─── Öneri ───────────────────────────────────────────────────────────────────

export interface OneriKaniti {
  etiket: string;
  /** Önceki pencerenin değeri (biçimlenmiş); yoksa tek değer gösterilir. */
  once: string | null;
  simdi: string;
  /** Rengi veren yön: iyi (yeşil), kötü (kırmızı), nötr. */
  yon: 'iyi' | 'kotu' | 'notr';
}

/** Kart üzerindeki mini grafik: iki seri, günlük, aynı uzunlukta. */
export interface OneriSerisi {
  adlar: [string, string];
  a: number[];
  b: number[];
}

export type OneriEylemi =
  | { tur: 'durdur' }
  | {
      tur: 'butce';
      /** Bütçe hangi seviyede duruyor (Meta CBO = campaign, ABO = ad_group; Google = campaign). */
      butceSeviyesi: 'campaign' | 'ad_group';
      butceTipi: 'daily' | 'lifetime';
      oncekiMikros: string;
      yeniMikros: string;
    };

export const ONERI_DURUMLARI = ['acik', 'uygulandi', 'yoksayildi'] as const;
export type OneriDurumu = (typeof ONERI_DURUMLARI)[number];

export interface Oneri {
  /**
   * KARARLI ANAHTAR: tür + varlık + hafta. Aynı öneri her istekte yeniden
   * HESAPLANIYOR (saklanmıyor); yalnız KARAR (uygulandı/yoksayıldı)
   * saklanıyor ve bu anahtarla eşleşiyor.
   */
  anahtar: string;
  tur: OneriTuru;
  platform: Platform;
  clientId: string;
  clientAdi: string;
  varlik: { seviye: OneriSeviyesi; id: string; ad: string; ustAd: string | null };
  baslik: string;
  /** Tek cümle neden; düz metin (HTML değil). */
  neden: string;
  kanitlar: OneriKaniti[];
  seri: OneriSerisi | null;
  /** Son 7 günde bu varlığa giden harcama (özet şeridindeki "etkilenen harcama"). */
  harcamaMikros: string;
  paraBirimi: string;
  /** `null` = yalnız bilgi (uygulanamaz); sebebi `kisit`ta. */
  eylem: OneriEylemi | null;
  kisit: string | null;
  durum: OneriDurumu;
  /** Uygulandıysa platformdan geri okunan değer ve zaman. */
  uygulama: UygulamaSonucu | null;
  /**
   * ONAY ÖZETİ: eylemin ve hedefin sha256'sı. Uygula isteği bunu taşır;
   * sunucu öneriyi YENİDEN hesaplayıp özet eşleşmezse reddeder. Ekran
   * açıkken veri değiştiyse (bütçe başkası tarafından değişti) eski
   * değerle uygulamak yerine "öneri değişti, yenile" denir.
   */
  ozet: string;
}

export interface OneriListesi {
  oneriler: Oneri[];
  /** Kesme sessiz değil: hesap başına ilk N öneri. */
  toplam: number;
  /** Okunamayan kaynaklar (platform/hesap) — boş liste "öneri yok" sanılmasın. */
  hatalar: string[];
  /** Bu ay uygulanan (karar tablosundan). */
  buAyUygulanan: number;
}

// ─── Uygula ──────────────────────────────────────────────────────────────────

export const oneriUygulaSchema = z.object({
  ozet: z.string().regex(/^[0-9a-f]{64}$/),
});
export type OneriUygulaGirdisi = z.infer<typeof oneriUygulaSchema>;

/**
 * "200 döndü" DOĞRULAMA DEĞİL (CLAUDE.md): yazdıktan sonra platformdan
 * GERİ okunur. `uyusmadi` = platform kabul etti ama okunan değer
 * istenenden farklı (ör. Meta bütçeyi yuvarladı); ekranda iki değer de
 * yazılır.
 */
export interface UygulamaSonucu {
  durum: 'dogrulandi' | 'uyusmadi';
  /** Platformdan okunan değer, biçimlenmiş ("Duraklatıldı", "600 ₺ / gün"). */
  platformDegeri: string;
  uygulayan: string;
  zaman: string;
}

// ─── AI Asistan ──────────────────────────────────────────────────────────────

/**
 * ASİSTAN ARAÇLARI. Hepsi OKUR, biri ÖNERİR; hiçbiri yazmaz. Yazma her
 * zaman kullanıcının onayladığı karttan, öneri uygulamasıyla AYNI yoldan.
 * `advcampaign_devret` reklam kurmaz: AdvCampaign'de hazır istekli oturum
 * açar, gönder düğmesine kullanıcı basar.
 */
export const ASISTAN_ARACLARI = [
  'metrik_ozeti',
  'gunluk_seri',
  'varlik_kirilimi',
  'donusum_detayi',
  'butce_temposu',
  'oneriler',
  'uygula_karti',
  'advcampaign_devret',
] as const;
export type AsistanAraci = (typeof ASISTAN_ARACLARI)[number];

export const asistanMesajSchema = z.object({
  metin: z.string().trim().min(1).max(2000),
});

export type AsistanParcasi =
  | { tur: 'metin'; metin: string }
  | { tur: 'arac'; arac: AsistanAraci; ozet: string }
  | { tur: 'uygula_karti'; oneri: Oneri }
  | { tur: 'devret'; istem: string; oturumId: string }
  | { tur: 'hata'; mesaj: string };

export interface AsistanMesaji {
  id: string;
  rol: 'kullanici' | 'asistan';
  parcalar: AsistanParcasi[];
  zaman: string;
}

export interface AsistanOturumu {
  id: string;
  clientId: string;
  mesajlar: AsistanMesaji[];
}
