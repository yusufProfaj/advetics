import { z } from 'zod';

/**
 * ═══ KAYNAK ÇAPASI — `Kaynakli<T>` ═══
 *
 * Pilot'un (AdvStrategy planı + AdvCampaign kurulumu + Pilot önerileri) tek
 * kuralı: EKRANDA GÖRÜNEN HER SAYININ BİR KAYNAĞI VAR. Plan hücresi, taslak
 * alanı ve öneri kartının ölçüsü aynı tipi taşır; kaynağı olmayan değer
 * şemadan geçmez (`kaynakliSchema`), yani veritabanından okunurken de,
 * API'ye yazılırken de reddedilir.
 *
 * NEDEN BU KADAR KATI: eski AdvCampaign'de `VARSAYILANSIZ_ALANLAR` kuralı
 * modelin bütçe/süre/konum UYDURMASINI engelliyordu (sunucu rakamın
 * kullanıcının cümlesinde geçtiğini doğruluyordu). Yeni akışta kullanıcı
 * rakamı hiç yazmıyor: rakam Aylık Bütçe'den, 90 günlük geçmişten ya da adlı
 * bir ajans sabitinden geliyor (Ç-1). Kaynak genişledi ama kural aynı: "bu
 * sayı nereden geldi?" sorusunun cevabı her hücrede YAZILI. Cevabı olmayan
 * bir sayı, müşterinin onayladığı ama kimsenin karar vermediği bir harcamadır.
 *
 * Kaynak `kimlik` alanı tıklanınca kaynağın kendisine gitmek için (Ajan 3,
 * "her rakamın yanında kaynak etiketi; tıklayınca kaynağın kendisi"): bir
 * satır kimliği (`monthly_budgets.id`, `audience_templates.id`) ya da bir
 * sabitin ADI (`META_KATMAN_PAYI_YUZ`). Sabitin DEĞERİ değil adı: değer
 * değişince eski planın kaynağı yeni değeri gösterip yalan söylerdi.
 */
export const KAYNAK_TURLERI = [
  /** `monthly_budgets` satırı (workspace geneli, `ad_account_id IS NULL`). */
  'aylik_butce',
  /** `insights_daily` hesap seviyesi toplamı, pencereli. */
  'gecmis_veri',
  /** `client_profiles` (Marka Merkezi): ana amaç, adres, yasal uyarı, özel kategori. */
  'marka_merkezi',
  /** `audience_templates` satırı. */
  'kitle_sablonu',
  /** `assets` + reklam seviyesi `insights_daily`: varlığın ölçülmüş performansı. */
  'varlik_performansi',
  /** `strateji_kelimeleri` (Keyword Planner yanıtı, çekim zamanıyla). */
  'kelime_fikri',
  /** `search_term_insights`. */
  'arama_terimi',
  /** Koddaki adlı bir ajans sabiti (K-06 sınıfı). `kimlik` = sabitin adı. */
  'sabit_kural',
  /** Bir kişinin açık kararı: panelde elle değişiklik ya da "değiştir" cümlesi. */
  'kullanici',
  /** Müşterinin (ya da müşteri adına ajansın) onayladığı plan sürümü. */
  'onayli_plan',
  /** Platformdan geri okunan değer (kurulumdan sonra, ya da öneri anında taze okuma). */
  'platform_okumasi',
  /** Workspace profili: bağlı sayfa/hesap gibi hazırlık bilgisi. */
  'workspace_profili',
  /**
   * Yapay zekânın yazdığı METİN. Sayı taşıyan hiçbir hücrede kabul edilmez
   * (`sayisalKaynakliSchema`): "yapay zekâ sayı üretmez" kuralının şemadaki
   * karşılığı.
   */
  'yz_metin',
] as const;
export type KaynakTuru = (typeof KAYNAK_TURLERI)[number];

/**
 * Sayı taşıyan hücrelerde YASAK kaynaklar. Liste tek elemanlı ama ayrı bir
 * sabit: yarın "yz_tahmin" gibi bir tür eklenirse onu buraya da yazmak,
 * yazmayı unutup sayıya izin vermekten ucuzdur (testte kilitli).
 */
export const SAYI_URETEMEYEN_KAYNAKLAR: readonly KaynakTuru[] = ['yz_metin'];

export interface Kaynak {
  tur: KaynakTuru;
  /** Satır kimliği ya da sabitin adı. BOŞ OLAMAZ: "bir yerden geldi" kaynak değil. */
  kimlik: string;
  /** Kaynağın okunduğu/yazıldığı an (ISO, sunucu saati). */
  zaman: string;
  /** Pencereli kaynaklarda (geçmiş veri, arama terimi) bakılan aralık. */
  pencere?: { from: string; to: string };
  /** Ekranda kaynak çipinin altında duran kısa cümle ("Meta payı %62 × yeni kitle %60"). */
  aciklama?: string;
}

export interface Kaynakli<T> {
  deger: T;
  kaynak: Kaynak;
}

/**
 * ═══ BOŞ HÜCRE NEDENİNİ SÖYLER (`emptyReason`) ═══
 *
 * Kaynağı olmayan alan UYDURULMAZ, boş kalır ve nedenini taşır. Nedenler
 * kapalı liste: her birinin ekrandaki "ne yapmalı" cümlesi farklı (Ajan 3)
 * ve tek bir "veri yok" hepsini aynı boş alana çevirirdi (CLAUDE.md
 * `.catch(() => [])` yasağının veri tarafı).
 */
export const BOS_NEDENLERI = [
  'aylik_butce_yok',
  'karisik_birim',
  'hesap_yok',
  'gecmis_yok',
  'donusum_yok',
  'kitle_yok',
  'varlik_yok',
  'kelime_yok',
  'ana_amac_yok',
  'niyet_derlenmiyor',
  'marka_profili_yok',
  'sayfa_yok',
  'adres_yok',
  'form_yok',
  'ozel_kategori_sorulmadi',
  'donem_gecti',
  'yz_yazmadi',
  /** Kullanıcı satırı plandan çıkardı; tutarı "dağıtılmamış"a döndü. */
  'kullanici_cikardi',
] as const;
export type BosNedeni = (typeof BOS_NEDENLERI)[number];

/** Dolu hücre kaynaklı değer taşır; boş hücre nedenini. Üçüncü hâl yok. */
export type Hucre<T> = ({ dolu: true } & Kaynakli<T>) | { dolu: false; emptyReason: BosNedeni };

export function dolu<T>(deger: T, kaynak: Kaynak): Hucre<T> {
  return { dolu: true, deger, kaynak };
}
export function bos<T = never>(emptyReason: BosNedeni): Hucre<T> {
  return { dolu: false, emptyReason };
}

// ─── Şemalar ────────────────────────────────────────────────────────────────

const tarihSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD olmalı');

export const kaynakSchema = z
  .object({
    tur: z.enum(KAYNAK_TURLERI),
    kimlik: z.string().trim().min(1, 'Kaynak kimliği boş olamaz').max(200),
    zaman: z.string().datetime({ offset: true }),
    pencere: z.object({ from: tarihSchema, to: tarihSchema }).optional(),
    aciklama: z.string().max(300).optional(),
  })
  .strict();

/**
 * Kaynaksız değeri REDDEDEN şema. `.strict()`: `{ deger }` tek başına ya da
 * `{ deger, kaynak: {} }` geçmez; `kaynak` alanı yoksa Zod "Required" der.
 */
export function kaynakliSchema<T extends z.ZodTypeAny>(deger: T) {
  return z.object({ deger, kaynak: kaynakSchema }).strict();
}

/** Sayı (ya da micros dizgesi) taşıyan hücre: yapay zekâ kaynağı kabul edilmez. */
export function sayisalKaynakliSchema<T extends z.ZodTypeAny>(deger: T) {
  return kaynakliSchema(deger).refine((v) => !SAYI_URETEMEYEN_KAYNAKLAR.includes(v.kaynak.tur), {
    message: 'Yapay zekâ sayı üretemez: bu hücrenin kaynağı yz_metin olamaz',
    path: ['kaynak', 'tur'],
  });
}

export function hucreSchema<T extends z.ZodTypeAny>(deger: T, secenek: { sayisal: boolean }) {
  const doluSchema = z
    .object({ dolu: z.literal(true), deger, kaynak: kaynakSchema })
    .strict()
    .refine((v) => !secenek.sayisal || !SAYI_URETEMEYEN_KAYNAKLAR.includes(v.kaynak.tur), {
      message: 'Yapay zekâ sayı üretemez: bu hücrenin kaynağı yz_metin olamaz',
      path: ['kaynak', 'tur'],
    });
  const bosSchema = z.object({ dolu: z.literal(false), emptyReason: z.enum(BOS_NEDENLERI) }).strict();
  return z.union([doluSchema, bosSchema]);
}

/** Micros DİZGE: JSON'da BigInt yok, `Number` 2^53 üstünde sessizce yuvarlanıyor. */
export const pilotMicrosSchema = z.string().regex(/^\d{1,18}$/, 'Tutar micros olarak tam sayı olmalı');

// ─── Yapay zekâ metni: sayı süzgeci ────────────────────────────────────────

/**
 * Metindeki sayıları rakam dizisine indirger: "120.000 ₺" → "120000",
 * "%62" → "62", "1,5" → "15". Ayraçları atmak bilinçli: modelin "120 bin"
 * yerine "120.000" ya da "120000" yazması aynı iddia.
 */
export function metindekiSayilar(metin: string): string[] {
  const bulunan = metin.match(/\d[\d.,]*\d|\d/g) ?? [];
  return bulunan.map((s) => s.replace(/[.,]/g, '').replace(/^0+(?=\d)/, ''));
}

/**
 * YAPAY ZEKÂ METNİ YENİ SAYI GETİREMEZ.
 *
 * Model yalnız metin yazar (gerekçe paragrafı, kampanya adı). Ama metin de
 * sayı taşıyabilir: "bu ay 150.000 TL ile 2.000 form bekliyoruz" cümlesi
 * plandaki hiçbir hücrede olmayan iki rakamı müşterinin önüne koyar ve
 * müşteri onu onaylar. Kural: metindeki her sayı, planın kendi sayılarından
 * biri olmak zorunda (`izinliSayilar` = plandaki tutarlar, yüzdeler, sonuç
 * tahminleri, tarihlerin parçaları). Dönüş boşsa metin kabul edilir; doluysa
 * hangi sayıların uydurulduğunu söyler ve metin YAZILMAZ.
 */
export function yzMetniDenetle(metin: string, izinliSayilar: readonly string[]): string[] {
  const izinli = new Set(izinliSayilar.flatMap((s) => metindekiSayilar(s)));
  return [...new Set(metindekiSayilar(metin).filter((s) => !izinli.has(s)))];
}
