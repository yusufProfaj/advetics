import { z } from 'zod';

/**
 * ═══ ZAMANLANMIŞ RAPOR GÖNDERİMİ ═══
 *
 * `docs/DURUM.md` §4'te "planlanan ama yazılmayan" tabloda duran
 * `report_schedules` bu.
 *
 * SIKLIK VE PENCERE BAĞIMSIZ DEĞİL. Haftalık bir planlamaya "Geçen ay"
 * seçtirmek, aynı raporu ayda dört kez göndermek demek; aylık bir planlamaya
 * "Bu ay" seçtirmek ise ayın 1'inde HENÜZ BAŞLAMAMIŞ bir dönem demek
 * (`raporPenceresi` orada null dönüyor). İkisi de kullanıcının fark etmesi
 * zor, müşteriye yansıması kolay hatalar.
 *
 * CLAUDE.md'deki `objective-matrix` dersi birebir geçerli: "Arayüzde uyumsuz
 * seçenek hiç görünmüyor; sonradan uyarmak, kullanıcının o hatayı yapmasına
 * izin vermek demek." Bu yüzden matris İZİN VERİLENLER listesi olarak
 * yazıldı — bilinmeyen kombinasyon geçersiz.
 */

export const PLAN_SIKLIKLARI = ['weekly', 'monthly'] as const;
export type PlanSikligi = (typeof PLAN_SIKLIKLARI)[number];

export const SIKLIK_LABELS: Record<PlanSikligi, string> = {
  weekly: 'Haftada 1',
  monthly: 'Ayda 1',
};

/** Panelde gösterilen gün adları. 1 = Pazartesi (ISO). */
export const HAFTA_GUNLERI = [
  { no: 1, ad: 'Pazartesi' },
  { no: 2, ad: 'Salı' },
  { no: 3, ad: 'Çarşamba' },
  { no: 4, ad: 'Perşembe' },
  { no: 5, ad: 'Cuma' },
  { no: 6, ad: 'Cumartesi' },
  { no: 7, ad: 'Pazar' },
] as const;

/**
 * AYIN GÜNÜ 28'DE BİTİYOR — ve bu bir kısıt, sessiz bir kırpma değil.
 *
 * 29/30/31 her ayda bulunmuyor. "Ayın 31'i" seçen bir planlama Şubat'ta
 * ATLANIRDI ve kullanıcı raporun neden gelmediğini hiçbir ekranda göremezdi.
 * Alternatif "ayın son gününe kaydır" idi; o da kullanıcının seçmediği bir
 * güne sessizce geçmek olurdu.
 *
 * CLAUDE.md: "Tahmin etmektense kısıtla ... ve kısıtı kullanıcıya SÖYLE."
 * Arayüz 1–28 gösteriyor ve sebebini yazıyor.
 */
export const AYIN_GUNU_MAX = 28;

/**
 * ═══ SIKLIK × PENCERE UYUMLULUK MATRİSİ ═══
 *
 * `raporPenceresi()` (packages/shared/src/tarih.ts) bu anahtarları biliyor.
 * Buradaki liste onun ALT KÜMESİ: panelde seçilebilen her pencere planlamada
 * anlamlı değil.
 */
export const PLAN_PENCERELERI: Array<{
  key: string;
  label: string;
  siklik: readonly PlanSikligi[];
  /** Arayüzde pencerenin ne kapsadığını yazan cümle. */
  aciklama: string;
}> = [
  {
    key: '7g',
    label: 'Son 7 gün',
    siklik: ['weekly'],
    aciklama: 'Gönderim gününden önceki 7 tam gün',
  },
  {
    key: '14g',
    label: 'Son 14 gün',
    siklik: ['weekly'],
    aciklama: 'Gönderim gününden önceki 14 tam gün',
  },
  {
    key: '30g',
    label: 'Son 30 gün',
    siklik: ['weekly', 'monthly'],
    aciklama: 'Gönderim gününden önceki 30 tam gün',
  },
  {
    key: 'bu_ay',
    label: 'Bu ay (düne kadar)',
    // AYLIK YOK: ayın 1'inde koşarsa dönem henüz başlamamış olur.
    siklik: ['weekly'],
    aciklama: 'Ayın 1’inden düne kadar',
  },
  {
    key: 'gecen_ay',
    label: 'Geçen ay',
    // HAFTALIK YOK: aynı rapor ayda dört kez giderdi.
    siklik: ['monthly'],
    aciklama: 'Önceki takvim ayının tamamı',
  },
];

/** Bir sıklık için seçilebilir pencereler. */
export function pencerelerIcin(siklik: PlanSikligi): typeof PLAN_PENCERELERI {
  return PLAN_PENCERELERI.filter((p) => p.siklik.includes(siklik));
}

/** Sıklığın varsayılan penceresi — listedeki ilki. */
export function varsayilanPencere(siklik: PlanSikligi): string {
  return pencerelerIcin(siklik)[0]!.key;
}

const SAAT = z.number().int().min(0).max(23);

/**
 * Planlama girdisi.
 *
 * `superRefine` UYUMLULUĞU SUNUCUDA DA DAYATIYOR. Arayüz uyumsuz seçeneği
 * hiç göstermiyor ama uç doğrudan da çağrılabiliyor; doğrulamayı yalnızca
 * ekrana bırakmak, matrisi tavsiyeye çevirirdi.
 */
export const raporPlaniInputSchema = z
  .object({
    clientId: z.string().uuid(),
    frequency: z.enum(PLAN_SIKLIKLARI),
    /** weekly: 1–7 (ISO, 1 = Pazartesi). monthly'de yok sayılıyor. */
    dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    /** monthly: 1–28. weekly'de yok sayılıyor. */
    dayOfMonth: z.number().int().min(1).max(AYIN_GUNU_MAX).nullable().optional(),
    /** Europe/Istanbul saati. */
    hour: SAAT,
    rangeKey: z.string().min(1).max(20),
    templateId: z.string().uuid().nullable().optional(),
    /** Boşsa `clients.contact_email` kullanılıyor. */
    toEmail: z.string().email().max(255).nullable().optional(),
    attachPdf: z.boolean().default(true),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === 'weekly' && (v.dayOfWeek === null || v.dayOfWeek === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dayOfWeek'],
        message: 'Haftalık planlamada haftanın günü seçilmeli.',
      });
    }
    if (v.frequency === 'monthly' && (v.dayOfMonth === null || v.dayOfMonth === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dayOfMonth'],
        message: 'Aylık planlamada ayın günü seçilmeli.',
      });
    }
    const izinli = pencerelerIcin(v.frequency).map((p) => p.key);
    if (!izinli.includes(v.rangeKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rangeKey'],
        message:
          `"${v.rangeKey}" bu sıklıkla kullanılamıyor. ` +
          `${SIKLIK_LABELS[v.frequency]} için geçerli dönemler: ${izinli.join(', ')}.`,
      });
    }
  });

export type RaporPlaniInput = z.infer<typeof raporPlaniInputSchema>;

/** Son gönderim sonucu — panelde "neden gitmedi" sorusunun cevabı. */
export const PLAN_SONUCLARI = ['sent', 'failed', 'skipped'] as const;
export type PlanSonucu = (typeof PLAN_SONUCLARI)[number];

export const PLAN_SONUC_LABELS: Record<PlanSonucu, string> = {
  sent: 'Gönderildi',
  failed: 'Gönderilemedi',
  skipped: 'Atlandı',
};

export interface RaporPlaniOzeti {
  id: string;
  clientId: string;
  clientName: string | null;
  frequency: PlanSikligi;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
  rangeKey: string;
  templateId: string | null;
  toEmail: string | null;
  /** Alıcı boşsa müşterinin kayıtlı adresi — panelde gösterilecek. */
  cozulenAlici: string | null;
  attachPdf: boolean;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: PlanSonucu | null;
  lastError: string | null;
  lastSentTo: string | null;
  /** Planı kuran kişi — mail ONUN adresinden gidiyor. */
  createdByName: string | null;
  createdByEmail: string | null;
  /**
   * Gönderenin SMTP kimliği hazır mı (kayıtlı VE doğrulanmış).
   *
   * Plan kurulurken kontrol ediliyor ama sonradan bozulabiliyor: kimlik
   * silinebilir ya da ayar değişince `verified_at` NULL'a döner. Panel
   * bunu göstermezse plan "açık" görünüp hiç göndermez — bu projenin
   * klasik sessiz hatası.
   */
  senderReady: boolean;
}
