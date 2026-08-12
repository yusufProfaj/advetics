import { z } from 'zod';

/**
 * Potansiyel müşteriler (Lead CRM).
 *
 * BU MODÜLÜN TEMEL GERÇEĞİ: KAÇAN LEAD SESSİZDİR.
 *
 * Bir reklam yayında, bütçe harcanıyor, form dolduruluyor — ama kayıt bize
 * ulaşmazsa hiçbir yerde hata görünmüyor. Panel "0 potansiyel müşteri" diyor
 * ve bu ya "kimse doldurmadı" ya da "sistem çalışmıyor" demek; ikisi
 * birbirinden ayırt edilemiyor.
 *
 * Bu yüzden tasarımın merkezinde İKİ AYRI YOL var:
 *
 *   1. WEBHOOK — anlık. Meta form doldurulduğunda haber veriyor.
 *   2. MUTABAKAT TARAMASI — periyodik. Her formun kayıtlarını Meta'dan
 *      okuyup bizde olmayanları alıyor.
 *
 * İkincisi yedek değil, ZORUNLU: Meta webhook teslimini garanti etmiyor.
 * Sunucumuz bir dakika yanıt vermezse o bildirim kayboluyor ve bir daha
 * gelmiyor.
 */

// -----------------------------------------------------------------------------
// Durum hattı
// -----------------------------------------------------------------------------

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; hint: string; tone: 'neutral' | 'active' | 'good' | 'bad' }
> = {
  new: { label: 'Yeni', hint: 'Henüz aranmadı.', tone: 'neutral' },
  contacted: { label: 'Arandı', hint: 'İletişim kuruldu, sonuç belli değil.', tone: 'active' },
  qualified: { label: 'Nitelikli', hint: 'Gerçekten ilgili — takip ediliyor.', tone: 'active' },
  won: { label: 'Kazanıldı', hint: 'Satışa dönüştü.', tone: 'good' },
  lost: { label: 'Kaybedildi', hint: 'İlgilenmiyor ya da ulaşılamadı.', tone: 'bad' },
};

/**
 * Kaydın bize hangi yoldan ulaştığı.
 *
 * TEŞHİS İÇİN TUTULUYOR, merak için değil. Bir müşterinin kayıtlarının
 * tamamı `reconcile` ile geliyorsa webhook o sayfa için çalışmıyor demektir —
 * ve bu, aksi hâlde fark edilmesi imkânsız bir arıza. Panelde bu oran
 * gösteriliyor.
 */
export const LEAD_SOURCES = ['webhook', 'reconcile', 'manual'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

// -----------------------------------------------------------------------------
// Kayıt
// -----------------------------------------------------------------------------

/** Formdaki tek bir sorunun cevabı. */
export interface LeadField {
  /** Meta'nın alan adı: `full_name`, `email`, `phone_number`, özel sorularda anahtar. */
  name: string;
  /** Kullanıcıya gösterilecek etiket — formdan geliyor. */
  label: string;
  value: string;
}

export interface LeadRecord {
  id: string;
  clientId: string;
  /** Meta'daki kayıt kimliği — mükerrer engelinin dayanağı. */
  externalLeadId: string;

  leadFormId: string | null;
  leadFormName: string | null;
  socialProfileName: string | null;

  /**
   * Kampanya atıfı — Meta'nın verdiği kadarıyla.
   *
   * `ad_id` her zaman geliyor; kampanya/ad set kimlikleri gelmiyor ve bizim
   * `ads` tablomuzdan çözülüyor. Reklam henüz senkronize edilmemişse
   * boş kalıyor ve sonraki senkronizasyonda dolmuyor — atıf kaydın
   * oluştuğu andaki bilgiyle donuyor.
   */
  externalAdId: string | null;
  campaignName: string | null;

  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** Tüm alanlar — özel sorular dahil. */
  fields: LeadField[];

  status: LeadStatus;
  /** Ajansın kendi notu. Müşteriye gitmiyor. */
  note: string | null;
  source: LeadSource;

  /** Meta'da formun doldurulduğu an. `createdAt` bizim aldığımız an. */
  submittedAt: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Girdiler
// -----------------------------------------------------------------------------

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  note: z.string().trim().max(2000).optional(),
});
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

export const leadQuerySchema = z.object({
  clientId: z.string().uuid(),
  status: z.enum(LEAD_STATUSES).optional(),
  leadFormId: z.string().uuid().optional(),
  /** Ad, e-posta ya da telefonda arama. */
  search: z.string().trim().max(120).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Sayfa boyutu.
   *
   * SESSİZ KESME YOK: arayüz kaç kayıt gösterildiğini ve toplamın kaç
   * olduğunu yazıyor. "Son 50" göstermek, kullanıcının 51. kaydı hiç var
   * olmadığını sanması demek.
   */
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type LeadQuery = z.infer<typeof leadQuerySchema>;

export interface LeadListResult {
  rows: LeadRecord[];
  total: number;
  /** Durum başına sayı — hattın üstündeki rozetler. */
  byStatus: Record<LeadStatus, number>;
  /**
   * Kayıtların yüzde kaçı mutabakat taramasıyla geldi.
   *
   * Yüksekse webhook çalışmıyor demektir. Bu sayı olmadan arıza fark
   * edilemez: kayıtlar geliyor, yalnızca saatler geç geliyor.
   */
  reconciledRatio: number;
}
