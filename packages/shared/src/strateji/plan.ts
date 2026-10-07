import { z } from 'zod';
import { monthSchema } from '../schemas/budget.schema';

/**
 * ═══ ADVSTRATEGY — AYLIK MEDYA PLANI ═══
 *
 * Bu dosya Ajan 1'in (Mimar) sözleşmesi. Ajan 2 (API) ve Ajan 3 (panel) tip
 * TANIMLAMAZ, buradan okur (CLAUDE.md "Geliştirme düzeni"). Gerekçeler ve
 * veri modeli: `docs/advstrategy/MIMARI.md`.
 *
 * PLATFORMLAR KASITLI OLARAK DAR. Kullanıcı kararı: modül Meta ve Google için
 * açık. `PLATFORMS`tan türetmek LinkedIn'i otomatik içeri alır ve plan
 * AdvCampaign'e aktarılamayan bir satır üretirdi (AdvCampaign LinkedIn'e
 * yazmıyor). `DRAFT_PLATFORMS` ile aynı sınıf: genişletmek, çalışmayan bir
 * seçeneği ekranda göstermek olurdu.
 */
export const STRATEJI_PLATFORMLARI = ['meta', 'google'] as const;
export const stratejiPlatformuSchema = z.enum(STRATEJI_PLATFORMLARI);
export type StratejiPlatformu = z.infer<typeof stratejiPlatformuSchema>;

/**
 * ═══ DURUM MAKİNESİ ═══
 *
 *   taslak ──onaya_gonder──► onayda ──onayla──► onaylandi ──aktar──► aktarildi
 *     ▲                        │                    │
 *     └──────geri_cek──────────┘                    │
 *   (her durumdan, aktarildi hariç) ──iptal──► iptal
 *
 * SON DURUMLAR: `aktarildi`, `iptal`. İkisinden çıkış yok ve olmamalı.
 *
 * NEDEN `iptal` VAR: `(client_id, donem)` için "açık plan" tekil indeksi
 * kuruluyor (aynı ay için iki canlı plan = hangisinin müşteriye gittiği
 * belirsiz). Kısmi tekil indeks + çıkışı olmayan durum = KALICI KİLİT
 * (CLAUDE.md, boost `active` dersi). İndeksin yüklemi `taslak`, `onayda`,
 * `onaylandi`yi kapsar; `iptal` ve `aktarildi` o ayı yeni plana açar.
 *
 * ONAYDAYKEN DÜZENLEME YOK. Müşterinin onayladığı belge ile ajansın sonradan
 * değiştirdiği belge ayrışırdı ve aktarılan plan müşterinin görmediği plan
 * olurdu. Düzenlemek için `geri_cek` (onayda → taslak) ve sürüm artar.
 */
export const PLAN_DURUMLARI = ['taslak', 'onayda', 'onaylandi', 'aktarildi', 'iptal'] as const;
export const planDurumuSchema = z.enum(PLAN_DURUMLARI);
export type PlanDurumu = z.infer<typeof planDurumuSchema>;

export const PLAN_SON_DURUMLARI: readonly PlanDurumu[] = ['aktarildi', 'iptal'];

export const PLAN_EYLEMLERI = ['onaya_gonder', 'geri_cek', 'onayla', 'aktar', 'iptal'] as const;
export type PlanEylemi = (typeof PLAN_EYLEMLERI)[number];

/**
 * Tek doğru geçiş tablosu. Servis, panel düğmeleri ve testler bunu okur;
 * düğmenin görünürlüğü ile sunucunun kabulü ayrışırsa kullanıcı tıklayıp
 * ret alır.
 */
export const PLAN_GECISLERI: Record<PlanEylemi, { kaynak: readonly PlanDurumu[]; hedef: PlanDurumu }> = {
  onaya_gonder: { kaynak: ['taslak'], hedef: 'onayda' },
  geri_cek: { kaynak: ['onayda'], hedef: 'taslak' },
  onayla: { kaynak: ['onayda'], hedef: 'onaylandi' },
  aktar: { kaynak: ['onaylandi'], hedef: 'aktarildi' },
  iptal: { kaynak: ['taslak', 'onayda', 'onaylandi'], hedef: 'iptal' },
};

export function gecisMumkunMu(durum: PlanDurumu, eylem: PlanEylemi): boolean {
  return PLAN_GECISLERI[eylem].kaynak.includes(durum);
}

/** Yalnız `taslak` düzenlenebilir (yukarıdaki "onaydayken düzenleme yok"). */
export function duzenlenebilirMi(durum: PlanDurumu): boolean {
  return durum === 'taslak';
}

/**
 * ═══ HUNİ KATMANI ═══
 *
 * Brief: "Meta bütçesinin %70'i soğuk kitle, %30'u retargeting". Üç katman,
 * çünkü sıcak kitle (etkileşim kurmuş ama siteye gelmemiş) ile yeniden
 * pazarlama (siteye gelmiş) Meta'da farklı özel kitle türleri.
 */
export const HUNI_KATMANLARI = ['soguk', 'sicak', 'yeniden_pazarlama'] as const;
export const huniKatmaniSchema = z.enum(HUNI_KATMANLARI);
export type HuniKatmani = z.infer<typeof huniKatmaniSchema>;

export const HUNI_ETIKETLERI: Record<HuniKatmani, string> = {
  soguk: 'Yeni kitle',
  sicak: 'Etkileşim kuranlar',
  yeniden_pazarlama: 'Siteyi ziyaret edenler',
};

/**
 * Para MICROS ve STRING (JSON'da BigInt yok, `Number` 2^53 üstünde kayıp).
 * Girdi tarafında kullanıcının yazdığı tutar `tutarAyristir` ile çözülür;
 * şema yalnızca biçimi tutar.
 */
export const microsSchema = z.string().regex(/^\d{1,18}$/, 'Tutar micros olarak tam sayı olmalı');

export const planOlusturSchema = z.object({
  clientId: z.string().uuid(),
  /** Planın ayı. `YYYY-MM` STRING; Date'e çevirmek saat dilimi kayması üretir. */
  donem: monthSchema,
  /** Kullanıcının yazdığı tutar ("200000" / "200.000,50"); sunucu çözer. */
  toplamButce: z.string().trim().min(1, 'Toplam bütçe gerekli'),
  /**
   * Para birimi. Verilmezse workspace'in hesaplarından ÇÖZÜLÜR; hesaplar
   * karışık birim taşıyorsa sunucu reddeder ve bunu söyler (kur çevrimi yok).
   */
  paraBirimi: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'ISO 4217 kodu olmalı')
    .optional(),
  not: z.string().trim().max(1000).optional(),
});
export type PlanOlusturGirdisi = z.infer<typeof planOlusturSchema>;

/**
 * Bütün düzenleme uçları (dağılım, matris, kelimeler) bu sürümü gövdede
 * taşır; uyuşmazsa 409. İki kişi aynı planı açıp kaydederse ikincinin
 * yazdığı, birincinin hiç görmediği bir planı EZERDİ.
 */
export const surumSchema = z.number().int().positive();

export interface PlanOzeti {
  id: string;
  clientId: string;
  donem: string;
  durum: PlanDurumu;
  /** Her `geri_cek` ve taslak düzenlemesinde artar; PDF ve onay bu sürüme bağlı. */
  surum: number;
  toplamButceMicros: string;
  paraBirimi: string;
  /** Dağıtılmış (platform satırlarının) toplamı. Toplamdan az olabilir, fazla OLAMAZ. */
  dagitilanMicros: string;
  /**
   * ONAYLAYANIN ROLÜ SAKLANIYOR. Müşterisi panele hiç girmeyen workspace'te
   * onay yalnız müşteriye bırakılsaydı plan `onayda`da kalıcı kilitlenirdi;
   * o yüzden ajans da onaylayabiliyor. Ama "müşteri onayladı" ile "ajans
   * müşteri adına onayladı" aynı belge değil: ekran ve PDF bunu ayrı yazar.
   */
  onaylayan: { userId: string; ad: string | null; rol: 'musteri' | 'ajans'; zaman: string } | null;
  aktarim: AktarimSonucu | null;
  not: string | null;
  olusturuldu: string;
  guncellendi: string;
}

/**
 * ═══ AKTARIM (Ç-2 kararı) ═══
 *
 * Onaylı plan platforma YAZMAZ. AdvCampaign'de matris satırı başına hazır
 * doldurulmuş bir oturum açar; yayın oradaki onay kartı + prova ile.
 *
 * ATLANAN SATIR SAYILIR VE NEDENİ YAZILIR. Sessiz kesme yok: "12 satırdan 9'u
 * aktarıldı" ekranda, kalan üçünün nedeniyle.
 */
export const AKTARIM_ATLAMA_NEDENLERI = [
  /** AdvCampaign bu niyeti henüz derlemiyor (`DERLENEN_NIYETLER`). */
  'niyet_desteklenmiyor',
  /** Google yazma kapısı kapalı (AdvCampaign K-02). */
  'platform_kapali',
  /** Kitle şablonu ya da varlık plan onaylandıktan sonra silinmiş. */
  'kaynak_silinmis',
  'butce_sifir',
] as const;
export type AktarimAtlamaNedeni = (typeof AKTARIM_ATLAMA_NEDENLERI)[number];

export interface AktarimSonucu {
  zaman: string;
  aktarilan: Array<{ matrisSatiriId: string; oturumId: string }>;
  atlanan: Array<{ matrisSatiriId: string; neden: AktarimAtlamaNedeni }>;
}
