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
import { formKimligiSchema, hedefKonumSchema } from '../taslak-alanlari';
import { OZEL_KATEGORILER } from '../meta/hedefleme';
import { REHBER_AMAC_KODLARI } from './amaclar';
import { rehberFiyatListesiSchema, rehberPromosyonSchema } from './google-ogeler';

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

/**
 * GÖRSELE ÖZEL METİN (Dalga 2, yönetici kararı 2026-10-12). Bir fikir (set ya
 * da video) kendi başlığını ve ana metnini taşıyabilir; taşımıyorsa ortak
 * metin kullanılır (`turet.ts`). Sözleşmedeki EN DAR değişiklik: medya
 * öğesine isteğe bağlı alan. Ayrı bir rehber alanı açmak, medya silinince
 * metnin sahipsiz kalması ve iki listenin ayrışması demekti.
 *
 * `kaynak` ZORUNLU: kart "yapay zekâ yazdı" ile "sen yazdın"ı ayırt edebilsin.
 * `derleyici` = görsel bırakıldığında yapay zekânın yazdığı (izinli kaynak,
 * kullanıcı düzeltebilir); kullanıcı dokununca `kullanici`.
 *
 * Şema gevşek (ortak metinle aynı neden): sınır `rehberEksikleri`nde.
 */
export const medyaMetniSchema = z.object({
  anaMetin: z.string().max(5000).optional(),
  basliklar: z.array(z.string().max(200)).max(15).optional(),
  aciklamalar: z.array(z.string().max(300)).max(4).optional(),
  kaynak: z.enum(['derleyici', 'kullanici']),
});
export type MedyaMetni = z.infer<typeof medyaMetniSchema>;

export const rehberMedyasiSchema = z.object({
  /** Görsel arşivindeki varlık (Marka Merkezi › Varlıklar ya da bu rehberde yüklenen). */
  varlikId: z.string().uuid(),
  /** Video ise kapak karesi (tarayıcıda alınır; sunucuda video işlenmez). */
  kapakVarlikId: z.string().uuid().optional(),
  /**
   * BANNER SETİ: aynı numaralı görseller tek reklamın boyutları
   * (`banner-seti.ts`). Verilmezse görseller orana göre sırayla gruplanır;
   * kullanıcı bir görseli başka sete taşıyınca yazılır. İsteğe bağlı ve
   * varsayılansız: varsayılan değer kayıtlı rehberlerin özetini değiştirirdi.
   */
  setNo: z.number().int().min(1).max(5).optional(),
  /**
   * OTOMATİK BOYUT (kullanıcı kararı, 2026-10-12): bu görsel kullanıcının
   * attığı görselden (`kaynakVarlikId`) setin eksik boyutu için üretildi.
   * Ekranda "Üretildi" yazar; kullanıcı kaldırırsa yeniden üretilmez.
   * Derleyici için sıradan bir görsel: yerleşim kuralları aynı.
   */
  uretildi: z.literal(true).optional(),
  kaynakVarlikId: z.string().uuid().optional(),
  metin: medyaMetniSchema.optional(),
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
    /**
     * WhatsApp hattı, E.164 (Dalga 3). Arama numarasından AYRI: işletmenin
     * WhatsApp hattı başka bir numara olabiliyor. Sayfadan okunamıyor
     * (`whatsapp_number` boş, WABA izni yok), o yüzden açıkça soruluyor.
     */
    whatsappNumarasi: alan(z.string().max(20).nullable()),
    /** Satış amacı: Meta piksel kimliği (sayısal), seçili reklam hesabının pikselleri arasından. */
    pikselId: alan(z.string().regex(/^\d{1,30}$/).nullable()),
    /** Meta form kimliği (sayısal) ya da eski kayıtlarda `lead_forms.id` (`formKimligiSchema`). */
    formSablonuId: alan(formKimligiSchema.nullable()),
    medya: alan(z.array(rehberMedyasiSchema).max(10)),
    /** Google video reklamı YouTube'daki bir video ister (bağlı kanaldan seçilir). */
    youtubeVideo: alan(z.object({ videoId: z.string().max(20), baslik: z.string().max(200) }).nullable()),
    metin: alan(
      z.object({
        anaMetin: z.string().max(5000),
        basliklar: z.array(z.string().max(200)).max(15),
        aciklamalar: z.array(z.string().max(300)).max(4),
        /**
         * Google Arama GÖRÜNEN YOLU (`path1`/`path2`, parça başına en çok 15
         * karakter). İsteğe bağlı ve varsayılansız: boşsa Google'a HİÇ
         * gönderilmez ve kayıtlı rehberlerin özeti değişmez.
         */
        gorunenYol: z.array(z.string().max(40)).max(2).optional(),
        /**
         * Google Arama AÇIKLAMA METİNLERİ (CalloutAsset, ≤ 25, en çok 4).
         * Marka Merkezi'nde vaat yoksa yapay zekâ önerir, kullanıcı burada
         * görüp düzeltir. İsteğe bağlı: alan yokken eski rehberlerin özeti
         * değişmez. Kaynak önceliği `aciklamaMetniSec`.
         */
        aciklamaMetinleri: z.array(z.string().max(100)).max(4).optional(),
      }),
    ),
    anahtarKelimeler: alan(z.array(anahtarKelimeSchema).max(50)),
    /** micros DİZGE: JSON sayısı 2^53 üstünde sessizce yuvarlanıyor. */
    butce: alan(z.object({ tip: z.enum(['gunluk', 'toplam']), micros: z.string().regex(/^\d{1,18}$/) })),
    /** İki platform açıkken Meta'nın payı (yüzde); Google kalanı alır. */
    metaPayiYuzde: alan(z.number().int().min(10).max(90)),
    takvim: alan(z.object({ baslangic: tarih, bitis: tarih.nullable() })),
    /**
     * İSTEĞE BAĞLI Google Arama öğeleri (`google-ogeler.ts`): promosyon ve
     * fiyat listesi UYDURULAMAZ, yalnız kullanıcı yazarsa kurulur. Alan yok =
     * öğe yok; doluysa ve hatalıysa engel (kullanıcının yazdığını sessizce
     * atmak, "kampanyayı ekledim" diyeni yanıltırdı).
     */
    googlePromosyon: alan(rehberPromosyonSchema),
    googleFiyatListesi: alan(rehberFiyatListesiSchema),
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
 * ekranda yazıyor.
 *
 * PARA VE HUKUK ALANLARI (`butce`, `takvim`, `ekKategoriler`) bir süre
 * yalnız `kullanici` kabul ediyordu. Hazır workspace kararıyla (kullanıcı,
 * 2026-10-12: "kreatifi atsın, prova bitince reklam oluşsun") workspace
 * hazırlığının değerleri de geçiyor: bütçe workspace varsayılanı, kategori
 * hazırlıkta kullanıcının VERDİĞİ beyan, başlangıç yarın. Harcama yine
 * kullanıcının kararı: onay penceresi bütçeyi ve başlangıcı açıkça yazıyor
 * ve "Onayla" basılmadan hiçbir şey açılmıyor.
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
  ekKategoriler: ['kullanici', 'workspace_profili'],
  hedefAdres: ['kullanici', 'marka_merkezi', 'workspace_profili'],
  telefon: ['kullanici', 'marka_merkezi'],
  // Marka Merkezi'ndeki telefon önden doluyor; WhatsApp hattıyla aynı
  // olmayabilir, ekranda kaynağı yazıyor.
  whatsappNumarasi: ['kullanici', 'marka_merkezi'],
  // Hesapta TEK piksel varsa panel onu önerir (`derleyici`, "Önerilen").
  pikselId: ['kullanici', 'derleyici', 'workspace_profili'],
  // `derleyici`: görsel bırakıldığında yapay zekânın yazdığı metin ortak
  // metin boşken oraya da yazılıyor (Dalga 2). "Metin öner" düğmesinin
  // sonucu hâlâ `ai_onerisi` ve onay istiyor: kullanıcı onu İSTEDİ ama
  // okumadan "Kullan"a basmadı.
  metin: ['kullanici', 'marka_merkezi', 'derleyici'],
  anahtarKelimeler: ['kullanici'],
  butce: ['kullanici', 'workspace_profili'],
  metaPayiYuzde: ['kullanici', 'derleyici'],
  takvim: ['kullanici', 'derleyici'],
  // Para sözü: yalnız kullanıcı (müşteri adına indirim/fiyat vaadi).
  googlePromosyon: ['kullanici'],
  googleFiyatListesi: ['kullanici'],
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

/**
 * "AYNI İÇERİKLE YENİDEN KUR" — geri alınan ya da durmuş bir kurulumun
 * içeriği yeni taslağa taşınır. Son ekran bunu vaat ediyordu ("Aynı içerikle
 * yeni bir reklam açabilirsin") ama "Yeni reklam" BOŞ taslak açıyordu (canlı,
 * 2026-10-11) ve kullanıcı her şeyi baştan giriyordu. TAKVİM KOPYALANMAZ:
 * eski başlangıç geçmişte kalmış olabilir ve Meta geçmiş başlangıcı kurulum
 * anına çekiyor (N-09) — yeni tarih kullanıcıya bilerek seçtirilir. Geri
 * kalan her alan kaynağıyla (kullanıcı / derleyici) birlikte taşınır;
 * hesap ve varlık aitliği sunucuda yeniden denetlenir.
 */
export const KOPYALANMAYAN_ALANLAR = ['takvim'] as const satisfies ReadonlyArray<keyof RehberAlanlari>;
export function kopyalanacakAlanlar(a: RehberAlanlari): RehberAlanlari {
  const kopya: Record<string, unknown> = { ...a };
  for (const k of KOPYALANMAYAN_ALANLAR) delete kopya[k];
  return kopya as RehberAlanlari;
}
