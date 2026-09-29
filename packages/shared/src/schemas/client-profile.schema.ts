import { z } from 'zod';
import { CAMPAIGN_GOALS, hedefAdresiGecerli, type CampaignGoal } from './ad-builder.schema';

/**
 * ═══ YAPILANDIRILMIŞ MARKA ALANLARI — SINIRLAR TEK YERDE ═══
 *
 * Panel sayaçları ve hata mesajları bu sabitten türüyor: "Üst sınır 10 MB"
 * elle yazılıyken sınır değişti ve ekran kullanıcıya yanlış sayı söyledi
 * (CLAUDE.md). Veritabanı kolon genişlikleri de bu sayılarla aynı; biri
 * değişirse migration da değişmeli (`marka-alanlari.spec.ts`).
 */
export const MARKA_SINIRLARI = {
  markaAdi: 120,
  sektor: 120,
  uslup: 500,
  kategori: { adet: 10, uzunluk: 80 },
  vaat: { adet: 8, uzunluk: 200 },
  sayfa: { adet: 20, ad: 60, url: 500 },
} as const;

/**
 * Sık kullanılan sayfa. Reklam Oluştur hedef adresi bu listeden seçiyor;
 * elle yazılan adresin yazım hatası yayına kadar kimsenin görmediği bir
 * hataydı.
 *
 * Doğrulama GİRİŞTE: adres kaydedilirken geçersizse kullanıcı o an öğreniyor,
 * reklamı yayınlarken değil. Yalnızca `http(s)`: `javascript:` ya da `mailto:`
 * bir reklamın hedefi olamaz.
 */
export const sikSayfaSchema = z.object({
  ad: z.string().trim().min(1, 'Sayfa adı boş olamaz').max(MARKA_SINIRLARI.sayfa.ad),
  url: z
    .string()
    .trim()
    .max(MARKA_SINIRLARI.sayfa.url)
    // Reklam taslağının kuralıyla AYNI fonksiyon: burada kabul edilen adres
    // orada reddedilmemeli.
    .refine(hedefAdresiGecerli, 'Geçerli bir adres değil — https:// ile başlayan tam adres yazın'),
});
export type SikSayfa = z.infer<typeof sikSayfaSchema>;

/** Aynı öğeyi iki kez kaydetmek, AI bağlamında aynı cümleyi iki kez tekrarlamak. */
const tekillik = <T>(anahtar: (x: T) => string, mesaj: string) =>
  (dizi: T[], zctx: z.RefinementCtx) => {
    const gorulen = new Set<string>();
    for (const x of dizi) {
      const k = anahtar(x).toLocaleLowerCase('tr');
      if (gorulen.has(k)) {
        zctx.addIssue({ code: z.ZodIssueCode.custom, message: `${mesaj}: ${anahtar(x)}` });
        return;
      }
      gorulen.add(k);
    }
  };

const kisaListe = (s: { adet: number; uzunluk: number }, ad: string) =>
  z
    .array(z.string().trim().min(1).max(s.uzunluk))
    .max(s.adet, `En fazla ${s.adet} ${ad}`)
    .superRefine(tekillik((x: string) => x, `Aynı ${ad} iki kez yazılmış`));

/**
 * Bilgi Bankası — müşterinin genel profili.
 *
 * `branding.schema.ts`teki (varsa) marka profiliyle KARIŞTIRILMASIN — o
 * ajansın beyaz etiket rapor markalaşması. Bu, müşterinin KENDİ profili.
 */
export const upsertClientProfileSchema = z.object({
  clientId: z.string().uuid(),
  hedefKitle: z.string().trim().max(2000).nullable().optional(),
  markaBilgileri: z.string().trim().max(2000).nullable().optional(),
  /**
   * "Bilgi Bankası" sekmesi.
   *
   * `clients.notes` DEĞİL: o alan ajans içi ("ekip içi") ve `client.read`
   * yetkisiyle MÜŞTERİNİN KENDİ hesabına da açık. Bilgi Bankası müşteri
   * profilinin parçası olduğu için burada duruyor — aynı sekme iki farklı
   * gizlilik seviyesine yazamaz.
   */
  bilgiBankasi: z.string().trim().max(2000).nullable().optional(),
  /**
   * Yalnızca BİÇİM doğrulaması. Varlığın HANGİ MÜŞTERİYE ait olduğu burada
   * bilinemiyor (`clientId` ayrı bir alan ve Zod alanlar arası kiracılık
   * bilgisi taşımıyor) — o kontrol `ClientProfileService.upsert` içinde,
   * veritabanına karşı yapılıyor. Buraya "uuid" yazıp doğrulanmış saymak,
   * başka bir müşterinin varlık kimliğini kabul etmek olurdu.
   */
  logoAssetId: z.string().uuid().nullable().optional(),

  // ─── Yapılandırılmış marka alanları ───
  markaAdi: z.string().trim().max(MARKA_SINIRLARI.markaAdi).nullable().optional(),
  sektor: z.string().trim().max(MARKA_SINIRLARI.sektor).nullable().optional(),
  urunKategorileri: kisaListe(MARKA_SINIRLARI.kategori, 'kategori').optional(),
  sikSayfalar: z
    .array(sikSayfaSchema)
    .max(MARKA_SINIRLARI.sayfa.adet, `En fazla ${MARKA_SINIRLARI.sayfa.adet} sayfa`)
    .superRefine(tekillik((x: SikSayfa) => x.url, 'Aynı adres iki kez eklenmiş'))
    .optional(),
  /**
   * Yalnızca sistemin KURABİLDİĞİ hedefler (`CAMPAIGN_GOALS`). Planda
   * "satış, bilinirlik" de vardı; Reklam Oluştur onları kuramıyor ve
   * seçtirmek çalışmayan bir seçeneği göstermek olurdu.
   */
  anaAmac: z.enum(CAMPAIGN_GOALS).nullable().optional(),
  uslup: z.string().trim().max(MARKA_SINIRLARI.uslup).nullable().optional(),
  vaatler: kisaListe(MARKA_SINIRLARI.vaat, 'vaat').optional(),
});

export type UpsertClientProfileInput = z.infer<typeof upsertClientProfileSchema>;

/**
 * Yapay zekânın ürettiği BİLGİ BANKASI TASLAĞI.
 *
 * KAYDEDİLMİŞ DEĞİL: uç bu nesneyi döndürüyor, veritabanına yazmıyor. Yapay
 * zekânın ürettiği ve gerçek bir işletmeyi anlatan metin, reklam metnini
 * besleyen bir kayda insan görmeden girmemeli. Kullanıcı ekranda görüyor,
 * düzeltiyor ve kendi kaydediyor.
 */
export interface BilgiBankasiTaslak {
  bilgiBankasi: string;
  hedefKitle: string;
  markaBilgileri: string;
  /*
   * Yapılandırılmış alanların ÖNERİSİ. Siteden okunamayan alan BOŞ döner,
   * doldurulmaz. Ana amaç ve sık sayfalar önerilmiyor: ilki bir iş kararı,
   * ikincisi gerçek adres ister ve modelin ürettiği bir adres uydurmadır.
   */
  markaAdi: string;
  sektor: string;
  urunKategorileri: string[];
  uslup: string;
  vaatler: string[];
  /** Hangi adresten okundu — taslağın dayanağı ekranda yazıyor. */
  kaynak: string;
}

export interface ClientProfileRecord {
  id: string;
  clientId: string;
  hedefKitle: string | null;
  markaBilgileri: string | null;
  bilgiBankasi: string | null;
  logoAssetId: string | null;
  markaAdi: string | null;
  sektor: string | null;
  urunKategorileri: string[];
  sikSayfalar: SikSayfa[];
  anaAmac: CampaignGoal | null;
  uslup: string | null;
  vaatler: string[];
  updatedAt: string;
}
