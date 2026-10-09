/**
 * Rehberin taşıdığı alanlar (`reklam_rehberi.alanlar`, JSONB).
 *
 * Rehber İKİ PLATFORMUN ORTAK GİRDİSİ; platforma özgü taslaklar
 * (`reklam_taslagi`, `platform = meta | google`) prova ve yayın anında
 * buradan TÜRETİLİYOR (`turet.ts`). Böylece mevcut Meta motoru, prova ve
 * değişmez sürüm zinciri olduğu gibi kalıyor; rehber yalnız kullanıcının
 * yarım bıraktığı işi saklıyor.
 *
 * Her alan `{deger, kaynak, kim, zaman}` (mevcut taslak deseni). Yapısal
 * alan yalnız izinli kaynakla derlenir: "Metin öner"in yazdığı metin
 * (`ai_onerisi`) kullanıcı onaylayana kadar bir karar değil.
 *
 * ŞEMA GEVŞEK, KONTROL `rehberEksikleri()`TE: şema sınırı aşan metni
 * reddetseydi kullanıcı yarım işini kaydedemezdi ve sayaç kırmızıya dönmek
 * yerine kayıt düşerdi.
 */
import { z } from 'zod';
import { ALAN_KAYNAKLARI, type AlanKaynagi } from '../taslak';
import { hedefKonumSchema } from '../taslak-alanlari';
import { OZEL_KATEGORILER } from '../meta/hedefleme';
import { REHBER_AMAC_KODLARI } from './amaclar';

const alan = <T extends z.ZodTypeAny>(deger: T) =>
  z.object({
    deger,
    kaynak: z.enum(ALAN_KAYNAKLARI),
    kim: z.string().uuid().nullable(),
    zaman: z.string().datetime({ offset: true }),
  });

const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD olmalı');

/**
 * Konum İKİ PLATFORMDA AYRI KİMLİK taşıyor: Meta'nın il/şehir anahtarı
 * Google'da geçmiyor (Google `geoTargetConstants/NNN` istiyor). Google
 * karşılığı sunucuda `geoTargetConstants:suggest` ile EŞLENİR ve buraya
 * yazılır; eşlenemeyen konum Google açıkken yayını durdurur. Eşlemeyi
 * tahmin etmek (en yakın adı seçmek) reklamı başka bir şehre götürürdü.
 */
export const rehberKonumuSchema = hedefKonumSchema.extend({
  google: z
    .object({
      /** `geoTargetConstants/2792` biçiminde kaynak adı. */
      kaynak: z.string().regex(/^geoTargetConstants\/\d+$/),
      ad: z.string().max(200),
    })
    .nullable()
    .optional(),
});
export type RehberKonumu = z.infer<typeof rehberKonumuSchema>;

export const rehberMedyasiSchema = z.object({
  /** Görsel arşivindeki varlık (Marka Merkezi › Varlıklar ya da bu rehberde yüklenen). */
  varlikId: z.string().uuid(),
  /** Video ise kapak karesi (tarayıcıda alınır; sunucuda video işlenmez). */
  kapakVarlikId: z.string().uuid().optional(),
});

export const anahtarKelimeSchema = z.object({
  metin: z.string().trim().min(1).max(80),
  /**
   * Keyword Planner'ın aylık arama sayısı (YUVARLANMIŞ kova değeri); elle
   * eklenen kelimede `null` = "ölçülmedi". Sıfır ile null ayrı: sıfır
   * "ölçüldü, kimse aramıyor".
   */
  aylikArama: z.number().int().nonnegative().nullable(),
});
export type AnahtarKelime = z.infer<typeof anahtarKelimeSchema>;

export const rehberAlanlariSchema = z
  .object({
    amac: alan(z.enum(REHBER_AMAC_KODLARI)),
    /** Rehberin önerisi `derleyici` kaynağıyla dolu gelir; kullanıcı değiştirirse `kullanici`. */
    platformlar: alan(z.object({ meta: z.boolean(), google: z.boolean() })),
    metaHesabiId: alan(z.string().uuid()),
    googleHesabiId: alan(z.string().uuid()),
    sayfaId: alan(z.string().uuid()),
    instagramId: alan(z.string().uuid().nullable()),
    youtubeKanaliId: alan(z.string().uuid().nullable()),
    konumlar: alan(z.array(rehberKonumuSchema).max(25)),
    enDusukYas: alan(z.number().int()),
    yasAraligi: alan(z.object({ min: z.number().int(), max: z.number().int() }).nullable()),
    /** Sorulmadı = alan yok; "Hayır, hiçbiri" = boş dizi (T-16: hiçbir şık seçili gelmez). */
    ekKategoriler: alan(z.array(z.enum(OZEL_KATEGORILER))),
    hedefAdres: alan(z.string().max(2000).nullable()),
    /** E.164 (`+905551234567`). */
    telefon: alan(z.string().max(20).nullable()),
    formSablonuId: alan(z.string().uuid().nullable()),
    medya: alan(z.array(rehberMedyasiSchema).max(10)),
    /** Google video reklamı YouTube'daki bir video ister (bağlı kanaldan seçilir). */
    youtubeVideo: alan(z.object({ videoId: z.string().max(20), baslik: z.string().max(200) }).nullable()),
    metin: alan(
      z.object({
        anaMetin: z.string().max(5000),
        basliklar: z.array(z.string().max(200)).max(15),
        aciklamalar: z.array(z.string().max(300)).max(4),
      }),
    ),
    anahtarKelimeler: alan(z.array(anahtarKelimeSchema).max(50)),
    /** micros DİZGE: JSON sayısı 2^53 üstünde sessizce yuvarlanıyor. */
    butce: alan(z.object({ tip: z.enum(['gunluk', 'toplam']), micros: z.string().regex(/^\d{1,18}$/) })),
    /** İki platform açıkken Meta'nın payı (yüzde); Google kalanı alır. */
    metaPayiYuzde: alan(z.number().int().min(10).max(90)),
    takvim: alan(z.object({ baslangic: tarih, bitis: tarih.nullable() })),
  })
  .partial()
  .strict();
export type RehberAlanlari = z.infer<typeof rehberAlanlariSchema>;
export type RehberAlanAdi = keyof RehberAlanlari;

/**
 * Yapısal alanların İZİNLİ kaynakları. `derleyici` = rehberin dolu getirdiği
 * öneri (platform seçimi, pay, yaş); ekranda "Önerilen" rozetiyle görünür ve
 * kullanıcı ona bakmadan geçebilir — bu bir karar olarak kabul ediliyor,
 * çünkü öneri platformun değil Advetics'in kuralından geliyor ve sebebi
 * ekranda yazıyor. Para ve hukuk alanlarında (`butce`, `takvim`,
 * `ekKategoriler`) yalnız kullanıcı.
 */
export const REHBER_IZINLI_KAYNAKLAR: Partial<Record<RehberAlanAdi, readonly AlanKaynagi[]>> = {
  amac: ['kullanici'],
  platformlar: ['kullanici', 'derleyici'],
  metaHesabiId: ['kullanici', 'workspace_profili'],
  googleHesabiId: ['kullanici', 'workspace_profili'],
  sayfaId: ['kullanici', 'workspace_profili'],
  instagramId: ['kullanici', 'workspace_profili'],
  youtubeKanaliId: ['kullanici', 'workspace_profili'],
  konumlar: ['kullanici', 'marka_merkezi'],
  enDusukYas: ['kullanici', 'derleyici'],
  ekKategoriler: ['kullanici'],
  hedefAdres: ['kullanici', 'marka_merkezi', 'workspace_profili'],
  telefon: ['kullanici', 'marka_merkezi'],
  metin: ['kullanici', 'marka_merkezi'],
  anahtarKelimeler: ['kullanici'],
  butce: ['kullanici'],
  metaPayiYuzde: ['kullanici', 'derleyici'],
  takvim: ['kullanici'],
};

/** Varsayılan Meta payı: ilk iki hafta eşit (REHBER-PLANI § 2, adım 5). */
export const VARSAYILAN_META_PAYI = 50;

/**
 * Güncelleme gövdesi: istemci yalnız DEĞİŞEN alanları gönderir ve her birinin
 * kaynağını söyler (hazırlıktan dolan konum `marka_merkezi`, rehberin önerisi
 * `derleyici`). `kim` ve `zaman`ı SUNUCU basar: istemcinin saati sürüme
 * yazılmaz. Alanı SİLMEK `sil: true` ile (platform kapatılınca hesabı
 * boşaltmak). `deger: null` silmek DEĞİL, değerin kendisi: Instagram'sız
 * sayfa ve "yaş aralığı yok" null DEĞER taşıyor ve önceki sürümde ikisi
 * "silindi" ile karışıyordu (Ajan 3 bulgusu).
 *
 * `surum` iyimser kilit: iki sekme aynı rehberi yazarsa ikincisi 409 alır ve
 * sessizce ezilmez. Sunucu birleşik sonucu `rehberAlanlariSchema` ile
 * doğrular; tanınmayan alan adı ret.
 */
export const rehberGuncelleSchema = z.object({
  surum: z.number().int().nonnegative(),
  degisiklikler: z
    .array(
      z.object({
        alan: z.string().max(40),
        deger: z.unknown(),
        kaynak: z.enum(ALAN_KAYNAKLARI),
        sil: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type RehberGuncelle = z.infer<typeof rehberGuncelleSchema>;

/** İstemcinin yazamayacağı kaynaklar: platformdan okunan değer yalnız sunucudan gelir. */
export const ISTEMCI_YAZAMAZ: readonly AlanKaynagi[] = ['meta_okumasi', 'recete'];
