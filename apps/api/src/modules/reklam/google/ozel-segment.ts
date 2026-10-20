/**
 * ═══ ARAMA KELİMESİ ÖZEL SEGMENTİ (hedef kitleler 2. parça, MIMARI Ç4) ═══
 *
 * Kayıtlı Google kitlesinin arama kelimeleri Google'da bir özel segment
 * (`CustomAudience`, tür SEARCH: "bu kelimeleri Google'da arayan kişiler")
 * olarak kuruluyor ve reklam grubu kitlesine segment olarak bağlanıyor.
 *
 * ATOMİK İSTEĞİN DIŞINDA: `GoogleAdsService.Mutate`in işlem listesinde
 * özel segment işlemi YOK; segment `customAudiences:mutate` ile yayından
 * ÖNCE kuruluyor. Silme yok (kurulum düşerse hesapta para harcamayan bir
 * segment kalır ve bir sonraki yayın onu bulup kullanır).
 *
 * YENİDEN KULLANILIR, ÇOĞALMAZ: ad İÇERİKTEN türüyor (sıralı ve tekil
 * kelimelerin özeti). Aynı kelimelerle ikinci yayın aynı adı arar ve
 * bulduğunu kullanır; kitlenin kelimeleri değişirse ad değişir ve yeni
 * segment kurulur (eski kampanyanın segmenti sessizce değişmez, Ç6).
 *
 * PROVA HESABA YAZMAZ: segment yoksa provada yalnız `validateOnly` ile
 * denetlenir; atomik prova segmentsiz kurulur ve not bunu söyler
 * (`derle-google.ts` `googleKitlesiCoz`).
 *
 * CANLIDA ÖLÇÜLMEDİ: `type: SEARCH`, `members[].keyword` ve `custom_audience`
 * GAQL alanları v25 başvurusundan. MIMARI § 5 ölçüm 2 bunu soruyor.
 */
import { createHash } from 'node:crypto';

/** Adın öneki: Google Ads'te Advetics'in kurduğu segment olduğu okunsun. */
export const OZEL_SEGMENT_ONEKI = 'ADV arama kelimeleri';

/**
 * Kelime kümesinin kararlı adı. Girdi zaten sıralı ve tekil
 * (`googleRehberKitlesi`); burada yeniden sıralanıyor ki başka bir çağıran
 * aynı küme için farklı ad üretmesin.
 */
export function ozelSegmentAdi(kelimeler: readonly string[]): string {
  const kume = [...new Set(kelimeler)].sort();
  const ozet = createHash('sha256').update(kume.join('\n')).digest('hex').slice(0, 16);
  return `${OZEL_SEGMENT_ONEKI} ${ozet}`;
}

/**
 * Var olan segmenti arayan sorgu. Ad yalnız önek + onaltılık özet, tırnak
 * taşımıyor; yine de biçim denetleniyor (sorguya dışarıdan dize girmesin).
 * KALDIRILMIŞ segment kullanılmaz: ona bağlanan kitle Google'da boş kalır.
 */
export function ozelSegmentSorgusu(ad: string): string {
  if (!/^ADV arama kelimeleri [0-9a-f]{16}$/.test(ad)) throw new Error('Özel segment adı beklenen biçimde değil.');
  return `SELECT custom_audience.resource_name, custom_audience.name, custom_audience.status FROM custom_audience WHERE custom_audience.name = '${ad}' AND custom_audience.status = 'ENABLED'`;
}

export interface OzelSegmentGovdesi {
  operations: Array<{ create: Record<string, unknown> }>;
  validateOnly: boolean;
}

export function ozelSegmentGovdesi(kelimeler: readonly string[], validateOnly: boolean): OzelSegmentGovdesi {
  if (kelimeler.length === 0) throw new Error('Kelimesiz özel segment kurulmaz.');
  return {
    operations: [
      {
        create: {
          name: ozelSegmentAdi(kelimeler),
          // AÇIKÇA SEARCH: varsayılan `AUTO` Google'ın türü kendisinin
          // seçmesi demek; kitle formu "bu kelimeleri ARAYAN kişiler" diyor.
          type: 'SEARCH',
          description: 'Advetics kayıtlı kitlesinin arama kelimeleri',
          members: [...new Set(kelimeler)].sort().map((keyword) => ({ memberType: 'KEYWORD', keyword })),
        },
      },
    ],
    validateOnly,
  };
}

export interface OzelSegmentPortu {
  rehberAra<T>(ctx: unknown, sorgu: string): Promise<T[]>;
  ozelSegmentMutate(ctx: unknown, govde: OzelSegmentGovdesi): Promise<Array<{ resourceName?: string }>>;
}

export type OzelSegmentSonucu = { kaynak: string } | { provada: true };

/**
 * Segmenti bul ya da kur. `prova`: yoksa KURMA, yalnız doğrula. Gerçek
 * kurulumda kaynak adı dönmezse HATA: "200 döndü" doğrulama değil ve
 * segmentsiz kitle kullanıcının seçtiğinin yarısı olurdu.
 */
export async function ozelSegmentHazirla(port: OzelSegmentPortu, ctx: unknown, kelimeler: readonly string[], prova: boolean): Promise<OzelSegmentSonucu> {
  const ad = ozelSegmentAdi(kelimeler);
  const bulunan = await port.rehberAra<{ customAudience?: { resourceName?: string; name?: string; status?: string } }>(ctx, ozelSegmentSorgusu(ad));
  const kaynak = bulunan.map((r) => r.customAudience).find((c) => c?.name === ad && c.status === 'ENABLED')?.resourceName;
  if (kaynak) return { kaynak };
  const yanit = await port.ozelSegmentMutate(ctx, ozelSegmentGovdesi(kelimeler, prova));
  if (prova) return { provada: true };
  const yeni = yanit[0]?.resourceName;
  if (!yeni || !/^customers\/\d+\/customAudiences\/\d+$/.test(yeni)) throw new Error('Google özel segmenti kurdu ama kaynak adını döndürmedi.');
  return { kaynak: yeni };
}
