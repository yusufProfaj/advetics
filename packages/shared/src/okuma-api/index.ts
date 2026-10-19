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

/**
 * YAZMA ANAHTARININ ÖNEKİ (2026-10-19, `docs/okuma-api/MCP-YAZMA-MIMARI.md`).
 * Ayrı önek: sızan bir anahtarın reklam açıp kapatabildiği, anahtarın
 * kendisine bakınca görünsün. Uzunluk okuma önekiyle AYNI, panelde görünen
 * kısım iki türde de aynı boyda.
 */
export const YAZMA_ANAHTARI_ONEKI = 'adv_rw_';

/**
 * Anahtarın yetkisi. `yazma` okumayı da kapsar. Yetki her istekte satırdan
 * okunur; anahtarın önekinden ÇIKARILMAZ (önek görüntü içindir, kapı satır).
 */
export const ANAHTAR_YETKILERI = ['okuma', 'yazma'] as const;
export type AnahtarYetkisi = (typeof ANAHTAR_YETKILERI)[number];

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

/**
 * YAZMA ANAHTARI SÜRESİZ OLAMAZ ve en çok 90 gün. Okuma anahtarının süresiz
 * seçeneğinin gerekçesi (sessizce ölen bağlantı) yazmada tersine dönüyor:
 * unutulmuş bir masaüstü ayarında yıllarca reklam açabilen bir anahtar
 * kalmamalı.
 */
export const YAZMA_ANAHTARI_SURELERI = [30, 90] as const;

export const okumaAnahtariOlusturSchema = z
  .object({
    ad: z.string().trim().min(1, 'Anahtara bir ad ver').max(80),
    gecerlilikGun: z
      .union([z.literal(30), z.literal(90), z.literal(365)])
      .nullable()
      .default(90),
    yetki: z.enum(ANAHTAR_YETKILERI).default('okuma'),
  })
  .refine((g) => g.yetki !== 'yazma' || (g.gecerlilikGun !== null && g.gecerlilikGun <= 90), {
    message: 'Yazma anahtarı en çok 90 gün geçerli olabilir',
    path: ['gecerlilikGun'],
  });
export type OkumaAnahtariOlustur = z.infer<typeof okumaAnahtariOlusturSchema>;

export interface OkumaAnahtariOzeti {
  id: string;
  ad: string;
  /** `adv_ro_ab12cd` — anahtarın tamamı DEĞİL. */
  gorunenOnek: string;
  yetki: AnahtarYetkisi;
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

/**
 * ═══ MCP ONAYI — PLATFORMA DOKUNAN HER İŞLEM İKİ ADIMLI ═══
 *
 * Kullanıcı kararı (2026-10-19): "şöyle yapacağım, onaylıyor musunuz?".
 * Araç önce ön kontrolü yapıp bir onay satırı açar ve PLATFORMA HİÇBİR ŞEY
 * YAZMAZ; işlem ancak `onayla(onay_kodu)` ile yapılır. Argümanlar sunucuda
 * saklı: onaydan sonra model bir rakamı değiştiremez.
 */
export const MCP_ONAY_ISLEMLERI = ['rehber_yayinla', 'varlik_durdur', 'varlik_etkinlestir', 'butce_degistir'] as const;
export type McpOnayIslemi = (typeof MCP_ONAY_ISLEMLERI)[number];

/**
 * `bekliyor` süresi dolunca da `bekliyor` kalır; süre `bitis`ten sunucuda
 * hesaplanır (zamanlanmış bir iş satırı kapatmasa da süresi geçmiş onay
 * uygulanamaz). `uygulaniyor`: onay alındı, platform çağrısı sürüyor ya da
 * yarıda kaldı; ikinci `onayla` onu yeniden çalıştırmaz.
 */
export const MCP_ONAY_DURUMLARI = ['bekliyor', 'uygulaniyor', 'uygulandi', 'basarisiz', 'vazgecildi'] as const;
export type McpOnayDurumu = (typeof MCP_ONAY_DURUMLARI)[number];

/** Onay kodunun geçerliliği (dakika). Kısa: eski bir özet bugünkü hesabın durumunu anlatmıyor olabilir. */
export const MCP_ONAY_SURESI_DK = 15;

/** MCP üzerinden yükleme jetonunun geçerliliği (dakika). */
export const MCP_YUKLEME_SURESI_DK = 15;

/** Yükleme ucunun jeton başlığı. Bearer DEĞİL: Bearer değeri JWT / anahtar bekçisine gider. */
export const MCP_YUKLEME_BASLIGI = 'x-advetics-yukleme';

/** Paneldeki "MCP etkinliği" satırı. */
export interface McpOnayOzeti {
  id: string;
  anahtarId: string;
  islem: McpOnayIslemi;
  /** Kullanıcıya gösterilen özet satırları ("Bütçe: 500 TL → 750 TL"). */
  ozet: string[];
  /** Sunucu hesaplıyor; `bekliyor` + süresi geçmiş = `suresi_doldu`. */
  durum: McpOnayDurumu | 'suresi_doldu';
  hata: string | null;
  olusturulma: string;
  bitis: string;
  kararZamani: string | null;
}

/** Panel listesinin cevabı; kesilirse `toplam` söyler (sessiz kesme yok). */
export interface McpOnayListesi {
  satirlar: McpOnayOzeti[];
  toplam: number;
}
