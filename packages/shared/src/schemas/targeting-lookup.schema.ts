import { z } from 'zod';

/**
 * HEDEFLEME ARAMALARI — platformdan okunan, bizde saklanmayan listeler.
 *
 * İki liste var ve ikisi de aynı sebeple TABLOYA YAZILMIYOR: ekran açılırken
 * çekiliyorlar. Yeni bir tablo `02_rls.sql` politika listesi ve
 * `pglite-harness.ts` TRUNCATE listesi demek (CLAUDE.md §3), oysa bu verinin
 * saklanması gereken bir yanı yok — kaynağı Meta ve orada değişiyor. Bayat
 * bir şehir listesi ya da silinmiş bir kitleyi öneren bir açılır liste,
 * saklamanın kazandıracağı hızdan pahalı.
 */

/**
 * Coğrafi hedefleme seçeneği.
 *
 * `cityKeys` alanı şemada BAŞTAN BERİ VARDI ve `targetingFrom` onu Meta'ya
 * çeviriyordu — ama onu dolduran hiçbir şey yoktu: ne arayüz, ne arama ucu.
 * "Lokasyon seç" bu liste olmadan bugünkü sabit `TR`'nin adının
 * değişmesinden ibaret kalırdı.
 */
export interface GeoLocationOption {
  /** Meta `key` — hedeflemeye giden değer bu. Şehirde sayısal, ülkede "TR". */
  key: string;
  /** city | region | country */
  type: string;
  name: string;
  /**
   * Listede gösterilecek TAM ad: "İzmir, İzmir, Türkiye".
   *
   * Yalnızca `name` göstermek yetmiyor: Meta'da aynı adı taşıyan birden fazla
   * yer var ve kullanıcı yanlışını ancak fatura geldiğinde fark eder.
   */
  label: string;
  countryCode: string | null;
}

/**
 * Ads Manager'da kurulmuş kayıtlı kitle.
 *
 * K16'nın (c) seçeneği. Panelde ilgi/davranış seçtirmiyoruz — hedef kullanıcı
 * o dili bilmiyor ve yanlış kullanıldığında erişimi sessizce öldürüyor. Ama
 * kayıtlı kitlede seçimi zaten AJANS yapmış oluyor ve seçim panelde değil
 * Meta'da kurulmuş.
 */
export interface SavedAudienceOption {
  id: string;
  name: string;
  /** Meta'nın tahmini kitle büyüklüğü. Vermezse null — sıfır DEĞİL. */
  approximateCount: number | null;
}

/**
 * Kitle listesi — BOŞ OLABİLİR VE BOŞLUK BİR CEVAPTIR.
 *
 * Ajans Ads Manager'da hiç kitle kurmamışsa liste boş dönüyor. Ekran boş bir
 * açılır liste göstermemeli: kullanıcı kendi kurulumunda bir şey eksik
 * olduğunu sanar. "Ads Manager'da kayıtlı kitle bulunamadı" yazmalı.
 */
export interface SavedAudienceList {
  items: SavedAudienceOption[];
  total: number;
}

export const geoSearchQuerySchema = z.object({
  /** Hangi reklam hesabının bağlantısı üzerinden sorulacak. */
  adAccountId: z.string().uuid(),
  /**
   * En az iki harf: tek harfle arama Meta'da yüzlerce sonuç döndürüyor ve
   * hiçbiri işe yaramıyor. Kotayı da boşuna yakıyor.
   */
  q: z.string().trim().min(2).max(80),
});
export type GeoSearchQuery = z.infer<typeof geoSearchQuerySchema>;

export const savedAudienceQuerySchema = z.object({
  adAccountId: z.string().uuid(),
});
export type SavedAudienceQuery = z.infer<typeof savedAudienceQuerySchema>;

/**
 * ═══ İLGİ ALANI (Meta `adinterest`) — Marka Merkezi Bölüm 4c ═══
 *
 * K16 bir süre "panelde ilgi/davranış seçtirmiyoruz" diyordu: hedef kullanıcı
 * o dili bilmiyor ve yanlış kullanım erişimi sessizce öldürüyor. Kullanıcı
 * doğal dilden kitle önerisini (BASE Bölüm 4) açıkça istedi ve karar
 * değişti; risk iki yolla yönetiliyor: her ilgi alanının Meta'daki kitle
 * büyüklüğü ekranda yazıyor ve ilgi alanları BİRLEŞİM olarak gidiyor
 * (`flexible_spec` içinde tek grup = "bunlardan biri"), kesişim değil.
 *
 * CANLIDA DOĞRULANMADI: yanıt biçimi Graph belgesinden. `meta-ilgi-kontrol`
 * betiği gerçek token'la tek bir arama yapıp ham alanları basıyor.
 */
export interface InterestOption {
  /** Meta kimliği — hedeflemeye giden değer. Ada göre değil buna göre tanınıyor. */
  id: string;
  name: string;
  /** "İlgi alanları > Araçlar > Lüks araçlar" — aynı adlı iki ilgiyi ayırt ediyor. */
  path: string[];
  /** Meta'nın tahmini kitle aralığı; vermezse null — sıfır DEĞİL. */
  audienceMin: number | null;
  audienceMax: number | null;
}

export const interestSearchQuerySchema = z.object({
  adAccountId: z.string().uuid(),
  q: z.string().trim().min(2).max(80),
});
export type InterestSearchQuery = z.infer<typeof interestSearchQuerySchema>;

/**
 * ═══ ÖZEL VE BENZER KİTLE (Meta `customaudiences`) — Bölüm 4b ═══
 *
 * Okuma: Ads Manager'da kurulmuş kitleler (site ziyaretçisi, müşteri
 * listesi, etkileşim, benzer). Kitle OLUŞTURMAK yazma yolu ve burada yok.
 *
 * REKLAM HESABINA BAĞLI. Bir hesabın kitle kimliği başka hesapta çalışmaz
 * (Meta `image_hash` ile aynı tuzak); şablon kitlenin hesabını saklıyor.
 *
 * CANLIDA DOĞRULANMADI: alan adları belgeden (`meta-ilgi-kontrol --ozel`).
 */
export interface CustomAudienceOption {
  id: string;
  name: string;
  /** `LOOKALIKE` → benzer; diğer bütün alt türler özel kitle. */
  tip: 'ozel' | 'benzer';
  /** Meta'nın ham alt türü: WEBSITE, CUSTOM, ENGAGEMENT, LOOKALIKE… */
  altTur: string | null;
  /** -1 = ölçülmemiş (pasif benzer kitle); null döner, sayı gibi gösterilmez. */
  sizeMin: number | null;
  sizeMax: number | null;
  /**
   * Yayına hazır mı: `delivery_status.code === 200`. `null` = Meta durumu
   * bildirmedi — "hazır" sayılmıyor, bilinmiyor.
   */
  hazir: boolean | null;
  /** Meta'nın kendi açıklaması ("Hedef kitle çok küçük" gibi). */
  durum: string | null;
}

export interface CustomAudienceList {
  items: CustomAudienceOption[];
  total: number;
}

export const customAudienceQuerySchema = z.object({
  adAccountId: z.string().uuid(),
});
export type CustomAudienceQuery = z.infer<typeof customAudienceQuerySchema>;

