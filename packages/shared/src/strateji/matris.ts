import { z } from 'zod';
import { niyetKoduSchema, type NiyetKodu } from '../reklam/meta/niyetler';
import { huniKatmaniSchema, stratejiPlatformuSchema, surumSchema, type HuniKatmani, type StratejiPlatformu } from './plan';

/**
 * ═══ BİLEŞEN 3 — KİTLE × KREATİF MATRİSİ ═══
 *
 * "Kim ne görecek": Base'teki kitle şablonu (`audience_templates`) ×
 * varlıklar (`assets`) × platform × bütçe. Matris AdvCampaign'e aktarımın
 * BİRİMİ: her satır bir oturum olur (Ç-2).
 *
 * NİYET SATIRDA. AdvCampaign kapalı bir niyet listesiyle çalışıyor
 * (`NIYET_KODLARI`); satırın niyeti olmazsa aktarılan oturum ilk soruyu
 * "ne istiyorsun?" diye baştan sorardı ve plan boşa giderdi. Liste AYNI
 * kaynaktan: ikinci bir niyet listesi doğduğu anda ayrışır.
 *
 * KİTLE ŞABLONU İSTEĞE BAĞLI, GOOGLE ARAMADA YOK. Arama kampanyası kitleyi
 * kelimeden alıyor; Google satırında `kitleSablonuId` `null` olabilir ve o
 * satır kelime grubuna bağlanır (`kelimeGrubu`).
 */
export const MATRIS_SATIR_SINIRI = 30;
/** Tek satırda en çok varlık: AdvCampaign'in medya sınırıyla aynı mertebe. */
export const MATRIS_VARLIK_SINIRI = 10;

export const matrisSatiriGirdiSchema = z
  .object({
    platform: stratejiPlatformuSchema,
    katman: huniKatmaniSchema,
    niyet: niyetKoduSchema,
    kitleSablonuId: z.string().uuid().nullable(),
    /** Google arama satırında: kelime grubunun adı (`strateji_kelimeleri.grup`). */
    kelimeGrubu: z.string().trim().max(80).nullable(),
    varlikIdleri: z.array(z.string().uuid()).max(MATRIS_VARLIK_SINIRI),
    tutar: z.string().trim().min(1),
    not: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.platform === 'google' || v.kitleSablonuId !== null, {
    message: 'Meta satırında kitle seçilmeli',
    path: ['kitleSablonuId'],
  })
  .refine((v) => new Set(v.varlikIdleri).size === v.varlikIdleri.length, {
    message: 'Aynı görsel iki kez eklenemez',
    path: ['varlikIdleri'],
  });

export const matrisKaydetSchema = z.object({
  surum: surumSchema,
  satirlar: z.array(matrisSatiriGirdiSchema).max(MATRIS_SATIR_SINIRI),
});
export type MatrisKaydetGirdisi = z.infer<typeof matrisKaydetSchema>;

export interface MatrisSatiri {
  id: string;
  platform: StratejiPlatformu;
  katman: HuniKatmani;
  niyet: NiyetKodu;
  /**
   * Kitle ve varlık ADLARI satırda taşınıyor ama `null` olabilir: şablon
   * plan yazıldıktan sonra silinmişse. Ekran "silinmiş kitle" yazar; boş
   * hücre "kitle seçilmemiş" diye okunurdu.
   */
  kitle: { id: string; ad: string | null } | null;
  kelimeGrubu: string | null;
  varliklar: Array<{ id: string; ad: string | null; kucukResimAdresi: string | null }>;
  tutarMicros: string;
  not: string | null;
}

/**
 * Matris bütçesi dağılımla TUTARLI olmak zorunda: bir (platform, katman)
 * hücresindeki satırların toplamı, dağılımdaki o hücrenin tutarını aşamaz.
 * Aşan satır, müşterinin onayladığı bölüşümü delen bir harcama planı.
 *
 * SAF FONKSİYON: hem servis (kayıtta ret) hem panel (yazarken uyarı) aynı
 * kuralı koşar. İki ayrı yazılırsa ekran "tamam" deyip sunucu reddeder.
 */
export function matrisButceDenetimi(
  dagilim: ReadonlyArray<{ platform: StratejiPlatformu; katman: HuniKatmani; tutarMicros: bigint }>,
  matris: ReadonlyArray<{ platform: StratejiPlatformu; katman: HuniKatmani; tutarMicros: bigint }>,
): Array<{ platform: StratejiPlatformu; katman: HuniKatmani; dagilimMicros: bigint; matrisMicros: bigint; asimMicros: bigint }> {
  const anahtar = (p: string, k: string) => `${p}:${k}`;
  const hedef = new Map<string, bigint>();
  for (const d of dagilim) hedef.set(anahtar(d.platform, d.katman), d.tutarMicros);
  const kullanilan = new Map<string, { platform: StratejiPlatformu; katman: HuniKatmani; toplam: bigint }>();
  for (const m of matris) {
    const k = anahtar(m.platform, m.katman);
    const v = kullanilan.get(k) ?? { platform: m.platform, katman: m.katman, toplam: 0n };
    v.toplam += m.tutarMicros;
    kullanilan.set(k, v);
  }
  const asimlar: ReturnType<typeof matrisButceDenetimi> = [];
  for (const [k, v] of kullanilan) {
    // Dağılımda olmayan hücre = SIFIR bütçe. Sessizce serbest saymak, plana
    // bütçesi hiç ayrılmamış bir kampanya sokmak olurdu.
    const d = hedef.get(k) ?? 0n;
    if (v.toplam > d) {
      asimlar.push({ platform: v.platform, katman: v.katman, dagilimMicros: d, matrisMicros: v.toplam, asimMicros: v.toplam - d });
    }
  }
  return asimlar;
}
