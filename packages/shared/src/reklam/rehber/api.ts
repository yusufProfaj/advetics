/**
 * Rehber uçlarının istek/cevap tipleri. Panel ve API aynı tipi okuyor;
 * ayrı yazılsaydı bir alan eklenip öbür tarafta unutulduğunda TypeScript
 * susardı (`ReklamTaslakKaydi` ile aynı gerekçe).
 *
 * Uçlar (docs/advcampaign/MIMARI-REHBER.md § 3):
 *   GET  /reklam/rehber/hazirlik?clientId=       → RehberHazirligi     bulk.read
 *   GET  /reklam/rehber/youtube-videolari?clientId=&kanalId= → YoutubeVideoListesi bulk.read
 *   GET  /reklam/rehber/form-sablonlari?clientId=&sayfaId=  → RehberFormListesi  bulk.read (Meta'dan, seçili sayfa)
 *   GET  /reklam/rehber/pikseller?clientId=&adAccountId=   → RehberPikselListesi bulk.read (Meta'dan, seçili hesap)
 *   GET  /reklam/rehberler?clientId=              → RehberListesi       bulk.read
 *   POST /reklam/rehberler {clientId}             → RehberKaydi         bulk.write
 *   GET  /reklam/rehberler/:id                    → RehberKaydi         bulk.read
 *   PUT  /reklam/rehberler/:id                    → RehberKaydi         bulk.write (409 = sürüm eski)
 *   POST /reklam/rehberler/:id/konum-esle         → RehberKaydi         bulk.write (Google karşılığı)
 *   POST /reklam/rehberler/:id/anahtar-kelime-oner → AnahtarKelimeOnerisi bulk.write
 *   POST /reklam/rehberler/:id/metin-oner {MetinOnerIstegi} → MetinOnerisi bulk.write (REHBERE YAZMAZ, sürüm artmaz; görsele özel sonuç önbelleğe)
 *   POST /reklam/rehberler/:id/prova              → RehberProvaSonucu   bulk.write
 *   GET  /reklam/rehberler/:id/prova              → RehberProvaSonucu | null bulk.read (son prova; sayfa yenilenince kaybolmasın)
 *   POST /reklam/rehberler/:id/yayinla {ozet}     → RehberYayinDurumu   bulk.publish
 *   GET  /reklam/rehberler/:id/yayin              → RehberYayinDurumu   bulk.read
 *   POST /reklam/rehberler/:id/arsivle            → RehberKaydi         bulk.write
 */
import { z } from 'zod';
import type { YayinDurumu } from '../yayin';
import type { RehberPlatformu } from './amaclar';
import type { RehberAlanlari } from './alanlar';
import type { RehberEksigi } from './eksikler';
import type { KararSatiri } from './kararlar';
import type { UyumBulgusu } from './uyum';

/**
 * Rehberin KENDİ durumu dar: kullanıcının işini anlatıyor. Platformdaki
 * kurulumun ayrıntısı her platformun `yayin` satırında (22 durumlu makine);
 * ikisini tek kolonda birleştirmek, iki platformun ayrı ilerlemesini tek
 * değere sıkıştırırdı (biri yayında, öbürü düştü = hangi durum?).
 */
export const REHBER_DURUMLARI = ['taslak', 'yayinda', 'arsivlendi'] as const;
export type RehberDurumu = (typeof REHBER_DURUMLARI)[number];

export interface RehberKaydi {
  id: string;
  clientId: string;
  durum: RehberDurumu;
  /** İyimser kilit; her kayıtta bir artar. */
  surum: number;
  alanlar: RehberAlanlari;
  eksikler: RehberEksigi[];
  kararlar: KararSatiri[];
  /** Türetilmiş platform taslakları (prova/yayın anında oluşur). */
  metaTaslakId: string | null;
  googleTaslakId: string | null;
  /** Prova ve yayın bu özete bağlanır; alan değişirse prova bayatlar. */
  icerikOzeti: string;
  updatedAt: string;
}

export interface RehberOzeti {
  id: string;
  amac: string | null;
  durum: RehberDurumu;
  platformlar: Record<RehberPlatformu, boolean>;
  eksikSayisi: number;
  /**
   * Yayınlanmış rehberde her platformun SON yayın durumu (taslakta boş).
   * Rehberin kendi `durum`u "Vazgeç ve arşivle"den sonra da `yayinda`
   * kalıyor; liste yalnız onu okuyunca arşivlenen reklam "Yayında" görünüyordu.
   */
  /** `sebep`: kaydı olmayan platformun başlamama sebebi (yoksa null). */
  yayinlar: Array<{ platform: RehberPlatformu; durum: YayinDurumu | null; sebep: string | null }>;
  updatedAt: string;
}

/** Liste kesilirse ekranda "N / toplam" yazılabilsin (sessiz kesme yok). */
export interface RehberListesi {
  satirlar: RehberOzeti[];
  toplam: number;
}

export interface AnahtarKelimeOnerisi {
  satirlar: Array<{ metin: string; aylikArama: number | null; rekabet: 'dusuk' | 'orta' | 'yuksek' | null }>;
  /** Google'ın önerdiği toplam fikir sayısı (sessiz kesme yok: "5 / 214"). */
  toplam: number;
  /** Boşsa NEDENİ: "hesap atanmamış", "Google kota", "eşleşme yok" ayrı iş. */
  bosNeden: string | null;
}

export interface MetinOnerisi {
  /** Öneri `ai_onerisi` kaynağıyla döner; kullanıcı kabul edince `kullanici` olur. */
  anaMetin: string;
  basliklar: string[];
  aciklamalar: string[];
  /** Google Arama görünen yolu (en çok 2 parça, 15 karakter); doğrulanamayan parça atılır, boşsa gönderilmez. */
  gorunenYol: string[];
  /** Model ne bilmiyordu (örn. "fiyat verilmedi, fiyat yazmadım"), atılan görsel ve satırlar. */
  notlar: string[];
  /** Görsele özel istek: sonuç bu görsel + amaç için daha önce yazılmıştı, yapay zekâya gidilmedi. */
  onbellekten: boolean;
  /** Modele giden görsel sayısı (atlananlar notlarda). */
  gorselSayisi: number;
}

/**
 * Metin önerisi isteği (Dalga 2).
 *
 * `varlikId` verilirse öneri O GÖRSEL için (rehber medyasındaki varlık;
 * video için kapağı gider) ve sonuç görselin içerik özeti + amaçla saklanır.
 * Verilmezse ortak metin: rehberin ilk üç görseli gider, önbellek yok.
 *
 * `mod`:
 * - `yeni`: görsele özel istekte önbellek varsa ONU döndürür (görsel
 *   bırakıldığında otomatik istek; aynı görsel ikinci kez para harcamasın).
 * - `yeniden_yaz`: önbelleği atlar, öncekinden FARKLI bir varyant ister.
 * - `buna_gore`: kullanıcının yazdığı metin isteme girer ("buna göre yeniden
 *   yaz"). ÇAPA YALNIZ BURADA: normal öneride kullanıcının metnini isteme
 *   koymak, modeli her seferinde aynı metne bağlıyordu (teşhis 2026-10-12).
 *
 * `tekrarEtme`: ekrandaki önceki öneri; model bunları TEKRAR ETMEMELİ.
 */
export const metinOnerIstegiSchema = z.object({
  varlikId: z.string().uuid().optional(),
  mod: z.enum(['yeni', 'yeniden_yaz', 'buna_gore']).default('yeni'),
  tekrarEtme: z.array(z.string().max(2200)).max(30).optional(),
});
export type MetinOnerIstegi = z.input<typeof metinOnerIstegiSchema>;

export type PlatformProvaSonucu =
  | { tur: 'gecti'; zaman: string; not: string | null }
  /** Meta provası kuyrukta: panel `GET /prova` ile yoklar. "Yapılmadı" demek yanlış bilgi olurdu. */
  | { tur: 'bekliyor'; zaman: string }
  | { tur: 'reddetti'; zaman: string; mesajlar: string[] }
  | { tur: 'yapilmadi'; sebep: string };

export interface RehberProvaSonucu {
  icerikOzeti: string;
  meta: PlatformProvaSonucu | null;
  google: PlatformProvaSonucu | null;
}

export interface PlatformYayinOzeti {
  platform: RehberPlatformu;
  taslakId: string;
  yayinId: string | null;
  durum: YayinDurumu | null;
  sebep: string | null;
  /** Platformdaki kampanya kimliği (Reklam Yöneticisi bağlantısı için). */
  kampanyaKimligi: string | null;
  /** `deneme` açılışında duraklatılmış kalır; ekranda "Duraklatılmış kuruldu". */
  duraklatilmisKalacak: boolean;
}

export interface RehberYayinDurumu {
  rehberId: string;
  platformlar: PlatformYayinOzeti[];
  uyum: { tur: 'gecti' } | { tur: 'durdu'; bulgular: UyumBulgusu[] } | null;
}

export const rehberOlusturSchema = z.object({
  clientId: z.string().uuid(),
  /** "Aynı içerikle yeniden kur": verilirse alanlar bu rehberden kopyalanır (`kopyalanacakAlanlar`). */
  kaynakRehberId: z.string().uuid().optional(),
});
export const rehberYayinlaSchema = z.object({
  /** Kullanıcının onay penceresinde gördüğü içeriğin özeti; uyuşmazsa 409. */
  icerikOzeti: z.string().regex(/^[0-9a-f]{64}$/),
});
export const anahtarKelimeOnerSchema = z.object({
  /** Boşsa site adresi ve başlıklardan tohum üretilir. */
  tohumlar: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
});
