import { z } from 'zod';
import { boostLocationSchema } from './boost.schema';
import { CINSIYET, konumMetni } from '../boost-hedefleme';

/**
 * ═══ KİTLE ŞABLONU (Marka Merkezi Bölüm 4) ═══
 *
 * Workspace'e ait, adı olan bir hedefleme: konum, yaş, cinsiyet. Konumlar
 * META anahtarları (coğrafi aramadan); Google'ın konum uzayı ayrı ve iki
 * uzayı birbirine çevirmek bir tahmin olurdu — şablon yalnızca Meta
 * reklamında kullanılıyor.
 *
 * Yayın yolunda Meta nesnesi TEK üreticiden çıkıyor (`meta-targeting.ts`);
 * bu şema yalnızca GİRDİYİ tanımlıyor.
 */
export const KITLE_SINIRLARI = { ad: 80, konum: 25, ilgi: 25 } as const;

export const kitleKonumuSchema = boostLocationSchema.extend({
  /** Ekranda gösterilen ad: "İzmir, Türkiye". Anahtar sayısal ve okunmuyor. */
  label: z.string().trim().min(1).max(200),
  /**
   * Konumun ülkesi. Aynı ülkeyi ve o ülkenin içindeki bir ili birlikte
   * seçmeyi yakalamak için gerekiyor (aşağıya bkz.).
   */
  countryCode: z.string().trim().length(2).nullable(),
});
export type KitleKonumu = z.infer<typeof kitleKonumuSchema>;

/**
 * İlgi alanı: yalnızca Meta kimliği ve ad. Kimlik SAYISAL — ad ile
 * uydurulmuş bir "ilgi" Meta'da hiçbir şeye karşılık gelmez.
 */
export const kitleIlgiSchema = z.object({
  id: z.string().regex(/^\d{1,25}$/, 'Geçersiz ilgi alanı kimliği'),
  name: z.string().trim().min(1).max(200),
});
export type KitleIlgi = z.infer<typeof kitleIlgiSchema>;

export const KITLE_CINSIYETLERI = ['all', 'male', 'female'] as const;

const kitleAlanlari = {
  name: z.string().trim().min(1, 'Şablon adı boş olamaz').max(KITLE_SINIRLARI.ad),
  locations: z
    .array(kitleKonumuSchema)
    .max(KITLE_SINIRLARI.konum, `En fazla ${KITLE_SINIRLARI.konum} konum`),
  // Meta reklam hedeflemesinde alt yaş 18; 65 "65 ve üzeri".
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  genders: z.enum(KITLE_CINSIYETLERI),
  /** Boş = ilgi daraltması yok. Birden çoksa "bunlardan biri" (birleşim). */
  interests: z
    .array(kitleIlgiSchema)
    .max(KITLE_SINIRLARI.ilgi, `En fazla ${KITLE_SINIRLARI.ilgi} ilgi alanı`)
    .default([]),
};

/**
 * ═══ ÜLKE + O ÜLKENİN İLİ = ÜLKE GENELİ ═══
 *
 * Meta konum kovalarını BİRLEŞİM olarak uyguluyor: "Türkiye + İzmir"
 * seçmek, reklamı Türkiye geneline çıkarıyor ve hiçbir hata vermiyor.
 * Kullanıcı "İzmir'e gösteriyorum" sanıyor. Bu yüzden aynı ülke ile o ülkenin
 * ili/şehri birlikte KAYDEDİLEMİYOR ve sebep yazıyor. Farklı ülkeler
 * (Almanya + İzmir) meşru: ikisi ayrı yerler.
 */
function konumCakismasi(
  locations: KitleKonumu[],
  zctx: z.RefinementCtx,
): void {
  const ulkeler = new Set(locations.filter((l) => l.type === 'country').map((l) => l.key));
  const icinde = locations.find(
    (l) => l.type !== 'country' && l.countryCode !== null && ulkeler.has(l.countryCode),
  );
  if (icinde) {
    zctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['locations'],
      message:
        `"${icinde.label}" zaten seçili ülkenin içinde. Meta ikisini birleştirip reklamı ülkenin ` +
        'tamamına gösterir; yalnızca il/şehir göstermek istiyorsan ülkeyi kaldır.',
    });
  }
  const gorulen = new Set<string>();
  for (const l of locations) {
    const k = `${l.type}:${l.key}`;
    if (gorulen.has(k)) {
      zctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locations'], message: `"${l.label}" iki kez seçilmiş.` });
      return;
    }
    gorulen.add(k);
  }
}

export const kitleSablonuInputSchema = z
  .object({ clientId: z.string().uuid(), ...kitleAlanlari })
  .superRefine((v, zctx) => {
    if (v.ageMin > v.ageMax) {
      zctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ageMin'], message: 'Alt yaş üst yaştan büyük olamaz' });
    }
    konumCakismasi(v.locations, zctx);
  });
export type KitleSablonuInput = z.infer<typeof kitleSablonuInputSchema>;

export const varsayilanKitleInputSchema = z.object({
  clientId: z.string().uuid(),
  /** `null` = varsayılan yok (Türkiye geneli, 18+). */
  sablonId: z.string().uuid().nullable(),
});

/**
 * Taslağa KOPYALANAN hedefleme. Şablona referans değil KOPYA: şablon
 * sonradan düzenlenirse kurulmuş bir taslağın kitlesi sessizce değişmemeli.
 * `sablonId` yalnızca "nereden geldi" bilgisi.
 */
export const kitleHedefiSchema = z
  .object({ sablonId: z.string().uuid().nullable(), ...kitleAlanlari })
  .superRefine((v, zctx) => {
    if (v.ageMin > v.ageMax) {
      zctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ageMin'], message: 'Alt yaş üst yaştan büyük olamaz' });
    }
    konumCakismasi(v.locations, zctx);
  });
export type KitleHedefi = z.infer<typeof kitleHedefiSchema>;

export interface KitleSablonuRecord {
  id: string;
  clientId: string;
  name: string;
  locations: KitleKonumu[];
  ageMin: number;
  ageMax: number;
  genders: (typeof KITLE_CINSIYETLERI)[number];
  interests: KitleIlgi[];
  varsayilan: boolean;
  updatedAt: string;
}

export interface KitleSablonuListesi {
  items: KitleSablonuRecord[];
  varsayilanId: string | null;
}

/** "İzmir, Manisa · 25-45 yaş · Kadın" — ekran ve kontrol listesi aynı cümleyi kuruyor. */
export function kitleOzeti(
  k: Pick<KitleHedefi, 'locations' | 'ageMin' | 'ageMax' | 'genders'> & { interests?: KitleIlgi[] },
): string {
  const yas = k.ageMax >= 65 ? `${k.ageMin}+ yaş` : `${k.ageMin}-${k.ageMax} yaş`;
  const parcalar = [konumMetni(k.locations), yas];
  if (k.genders !== 'all') parcalar.push(CINSIYET[k.genders] ?? k.genders);
  const ilgi = k.interests ?? [];
  if (ilgi.length > 0) {
    // SESSİZ KESME YOK: kaçının gizlendiği yazıyor.
    const adlar = ilgi.slice(0, 2).map((i) => i.name).join(', ');
    parcalar.push(`ilgi: ${adlar}${ilgi.length > 2 ? ` +${ilgi.length - 2}` : ''}`);
  }
  return parcalar.join(' · ');
}

// -----------------------------------------------------------------------------
// Doğal dilden kitle ÖNERİSİ (Bölüm 4c)
// -----------------------------------------------------------------------------

export const kitleOneriIstegiSchema = z.object({
  clientId: z.string().uuid(),
  /** "son bir ayda lüks araç arayan erkekler" */
  metin: z.string().trim().min(5, 'Kitleyi biraz daha anlat').max(500),
});
export type KitleOneriIstegi = z.infer<typeof kitleOneriIstegiSchema>;

/**
 * ÖNERİ, KAYIT DEĞİL. Yapay zekâ metni yapılandırıyor, sunucu her parçayı
 * Meta'nın kendi aramasıyla gerçek bir kimliğe çözüyor ve kullanıcı sonucu
 * formda görüp düzelterek kaydediyor. "AI çevirir ve pakete koyar" sessiz
 * bir tahmin olurdu: platform bir ilgiyi kabul edip görmezden gelebiliyor.
 *
 * EŞLEŞMEYEN VE UYGULANAMAYAN AYRI YAZIYOR: "son bir ayda" gibi bir zaman
 * kısıtı Meta ilgi hedeflemesinde yok; onu sessizce düşürmek, kullanıcının
 * kurduğunu sandığı kitleyi kurmamak olurdu.
 */
export interface KitleOnerisi {
  locations: KitleKonumu[];
  ageMin: number;
  ageMax: number;
  genders: (typeof KITLE_CINSIYETLERI)[number];
  interests: Array<KitleIlgi & { terim: string; audienceMin: number | null; audienceMax: number | null }>;
  /** Meta'da karşılığı bulunamayan terimler. */
  eslesmeyen: Array<{ terim: string; tur: 'konum' | 'ilgi' }>;
  /** Metinde olan ama Meta hedeflemesiyle kurulamayan kısımlar. */
  uygulanamayan: Array<{ ifade: string; sebep: string }>;
  /** Aramanın yapıldığı reklam hesabı. */
  hesapAdi: string;
}

