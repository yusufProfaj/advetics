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
export const KITLE_SINIRLARI = { ad: 80, konum: 25 } as const;

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
  varsayilan: boolean;
  updatedAt: string;
}

export interface KitleSablonuListesi {
  items: KitleSablonuRecord[];
  varsayilanId: string | null;
}

/** "İzmir, Manisa · 25-45 yaş · Kadın" — ekran ve kontrol listesi aynı cümleyi kuruyor. */
export function kitleOzeti(k: Pick<KitleHedefi, 'locations' | 'ageMin' | 'ageMax' | 'genders'>): string {
  const yas = k.ageMax >= 65 ? `${k.ageMin}+ yaş` : `${k.ageMin}-${k.ageMax} yaş`;
  const parcalar = [konumMetni(k.locations), yas];
  if (k.genders !== 'all') parcalar.push(CINSIYET[k.genders] ?? k.genders);
  return parcalar.join(' · ');
}
