import { z } from 'zod';

/**
 * ═══ OKUMA API'Sİ — PLATFORM SAHİBİNİN YAPAY ZEKÂ KAPISI ═══
 *
 * Advetics'i işleten hesabın (`users.platform_admin`) verisini bir yapay
 * zekâ istemcisine (Claude, Cursor…) MCP sunucusu olarak açan anahtar.
 * Kullanıcının tarifi: "super admin için okuma API'si; yalnız o hesapla
 * girince ayarlarda kontrol paneli".
 *
 * YALNIZCA OKUMA ve bu bir sözleşme değil, YAPI: anahtar yalnızca
 * `@OkumaAnahtariyla()` ile işaretlenmiş uçlarda geçiyor ve o uçların
 * hiçbiri yazmıyor. "Her GET'e izin ver" denseydi bugün yan etkisi olan
 * GET'ler (OAuth dönüşü, PDF üretimi + denetim kaydı) ve yarın eklenecek
 * her GET sessizce anahtara açılırdı.
 *
 * ANAHTAR DÜZ METİN SAKLANMIYOR: SHA-256 özeti saklanıyor, düz hâli
 * kullanıcıya OLUŞTURULDUĞU AN bir kez gösteriliyor. Veritabanı sızsa bile
 * özetten anahtar geri üretilemez (256 bit rastgelelik, tuzsuz özet yeter;
 * parola değil, tahmin edilebilir değil).
 */

/**
 * Anahtarın öneki. Kimlik doğrulama bekçisi Bearer değerinin bu önekle
 * başlayıp başlamadığına bakarak JWT ile anahtarı AYIRIYOR — JWT `eyJ` ile
 * başlıyor, çakışma yok. Önek ayrıca sızıntı tarayıcılarının (GitHub secret
 * scanning) anahtarı tanımasını kolaylaştırıyor.
 */
export const OKUMA_ANAHTARI_ONEKI = 'adv_ro_';

/** Panelde gösterilen kısım: önek + ilk 6 karakter. Ayırt etmeye yeter, kullanmaya yetmez. */
export const OKUMA_ANAHTARI_GORUNEN_UZUNLUK = OKUMA_ANAHTARI_ONEKI.length + 6;

/** Bir kullanıcının aynı anda taşıyabileceği etkin anahtar sayısı. */
export const OKUMA_ANAHTARI_UST_SINIR = 10;

/**
 * GEÇERLİLİK SÜRESİ SEÇENEKLERİ (gün). `null` = süresiz.
 *
 * Süresiz seçenek KASITLI olarak var: anahtarı bir masaüstü istemcisinin
 * ayarına yazan kullanıcı, 90 günde bir sessizce ölen bir bağlantıyı
 * "yapay zekâ veriyi göremiyor" diye yaşar. Varsayılan yine de süreli (90);
 * süresizi seçmek bilinçli bir eylem.
 */
export const OKUMA_ANAHTARI_SURELERI = [30, 90, 365] as const;

export const okumaAnahtariOlusturSchema = z.object({
  ad: z.string().trim().min(1, 'Anahtara bir ad ver').max(80),
  gecerlilikGun: z
    .union([z.literal(30), z.literal(90), z.literal(365)])
    .nullable()
    .default(90),
});
export type OkumaAnahtariOlustur = z.infer<typeof okumaAnahtariOlusturSchema>;

export interface OkumaAnahtariOzeti {
  id: string;
  ad: string;
  /** `adv_ro_ab12cd` — anahtarın tamamı DEĞİL. */
  gorunenOnek: string;
  olusturulma: string;
  /** null = süresiz. */
  bitis: string | null;
  /** null = hiç kullanılmadı. Dakikada en çok bir kez güncelleniyor. */
  sonKullanim: string | null;
  sonKullanimIp: string | null;
  iptal: string | null;
  /** Sunucu hesaplıyor: panel saatine güvenmek, süresi dolmuşu "etkin" gösterebilirdi. */
  durum: 'etkin' | 'suresi_doldu' | 'iptal';
}

export interface OkumaAnahtariOlusturmaYaniti {
  ozet: OkumaAnahtariOzeti;
  /** DÜZ ANAHTAR — yalnızca bu yanıtta, bir kez. Sunucu bir daha üretemez. */
  anahtar: string;
}

/** MCP aracının panelde ve belgede gösterilen tanımı. */
export interface OkumaAraciTanimi {
  ad: string;
  baslik: string;
  aciklama: string;
}
