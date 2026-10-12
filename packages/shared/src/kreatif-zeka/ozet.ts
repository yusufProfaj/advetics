import { z } from 'zod';
import type { Permission } from '../auth/roles';
import type { Platform } from '../constants/platforms';
import type { BriefBosNedeni, KreatifBrief } from './brief';
import type { BekciRetNedeni, EtiketlenemezNedeni, GeciciNeden, IcerikDurumu } from './durum';
import type { EtiketAlani, KreatifEtiketleri } from './etiket';
import type { EtiketFarki, KreatifMetrigi } from './istatistik';
import type { KovaSonucu, PuanSonucu } from './puan';

/**
 * ═══ YANITLAR VE UÇLAR ═══
 *
 * Ekran İyileştir › Kreatifler (`?sekme=kreatifler`, MIMARI Ç-7). Uç
 * listesi tek kaynak; Ajan 4 controller'ı buna karşı tarar.
 */

/** Ekrandaki bir kreatif satırı. */
export interface KreatifSatiri {
  creativeId: string;
  /** Kreatifi kullanan en çok harcamalı reklam (ekranda ad ve bağlantı). */
  adId: string | null;
  adAdi: string | null;
  kampanyaAdi: string | null;
  platform: Platform;
  kumeAnahtari: string | null;
  /** İlk gösterim günü (`YYYY-MM-DD`); "yeni" bu günden sayılır. */
  ilkGosterim: string | null;
  yeni: boolean;
  gosterim: number;
  tiklama: number;
  donusum: number;
  harcamaMicros: string;
  paraBirimi: string;
  /** Ana metriğin verim değeri; ekran tersine çevirip gösterir. */
  anaMetrik: KreatifMetrigi | null;
  anaDeger: number | null;
  puan: PuanSonucu;
  /** Yalnız `yeni` satırlarda dolu. */
  kova: KovaSonucu | null;
  etiketDurumu: IcerikDurumu;
  etiketNedeni: EtiketlenemezNedeni | GeciciNeden | null;
  etiketler: KreatifEtiketleri | null;
  /** Video ve karuselde yalnız kapak ya da ilk kart etiketlendi: ekranda söylenir. */
  kismiEtiket: 'video_kapagi' | 'ilk_kart' | null;
  /** Görsel KULLANIM ANINDA tazelenir; liste yanıtında adres YOK (kreatif-adresi dersi). */
}

export interface EtiketFarkSatiri {
  alan: EtiketAlani;
  deger: string;
  karsi: string;
  metrik: KreatifMetrigi;
  fark: EtiketFarki;
  cumle: string;
}

export interface EtiketlemeOzeti {
  /** Pencerede harcaması olan, kümeye giren kreatif. */
  toplam: number;
  sayilar: Record<IcerikDurumu, number>;
  etiketlenemez: Partial<Record<EtiketlenemezNedeni, number>>;
  /** Bekleyen satırların son geçici hatası (ekranda "Gemini kotası dolu, yarın" gibi). */
  bekleyenNedenleri: Partial<Record<GeciciNeden, number>>;
  bugunKullanilan: number;
  gunlukSinir: number;
  buAyKullanilan: number;
  aylikSinir: number;
  /** Bekçi şu an reddediyorsa nedeni. */
  bekci: BekciRetNedeni | null;
  /** Son `creative_tags` işi (sync_jobs), notu aynen. */
  sonIs: { durum: string; zaman: string; not: string | null } | null;
}

export const KREATIF_BOS_NEDENLERI = [
  'hesap_yok',
  /** Pencerede harcaması olan kreatif yok. */
  'kreatif_yok',
  /** Kreatifler var, hepsi metin reklamı (Google arama). */
  'yalniz_metin',
  /** Etiketleme hiç koşmadı / sürüyor. */
  'etiket_bekliyor',
  'suzgec_bos',
] as const;
export type KreatifBosNedeni = (typeof KREATIF_BOS_NEDENLERI)[number];

export interface KumeOzeti {
  anahtar: string;
  ad: string;
  kreatif: number;
  anaMetrik: KreatifMetrigi;
  /** Dönüşüm amaçlı kümede dönüşüm az olduğu için tıklama oranına inildi. */
  metrikDusus: boolean;
}

export interface KreatifZekaYaniti {
  kumeler: KumeOzeti[];
  /** Seçili küme (sorgudan ya da en çok harcayan). */
  kume: string | null;
  satirlar: KreatifSatiri[];
  /** Süzgeçten sonra, kesmeden önce. Sessiz kesme yok. */
  toplam: number;
  kovaSayilari: Record<'iyi_gidiyor' | 'dikkat' | 'veri_yetersiz', number>;
  farklar: EtiketFarkSatiri[];
  etiketleme: EtiketlemeOzeti;
  emptyReason: KreatifBosNedeni | null;
  /** Kümenin son brief'i (varsa) ya da neden yok. */
  brief: KreatifBrief | null;
  briefBosNedeni: BriefBosNedeni | null;
  paraBirimi: string;
  /** Okunamayan kaynak; diğerleri yine döner. */
  hatalar: Array<{ kaynak: string; mesaj: string }>;
  pencereGun: number;
  uretildi: string;
}

export const KREATIF_SAYFA_BOYUTU = 50;

export const kreatifZekaSorgusuSchema = z.object({
  clientId: z.string().uuid(),
  kume: z.string().regex(/^(meta|google):[a-z_]+$/).optional(),
  gorunum: z.enum(['yeni', 'tumu']).default('yeni'),
  kova: z.enum(['iyi_gidiyor', 'dikkat', 'veri_yetersiz']).optional(),
  sayfa: z.coerce.number().int().min(1).max(1000).default(1),
});
export type KreatifZekaSorgusu = z.infer<typeof kreatifZekaSorgusuSchema>;

export const kreatifBriefIstegiSchema = z.object({
  clientId: z.string().uuid(),
  kume: z.string().regex(/^(meta|google):[a-z_]+$/),
});
export type KreatifBriefIstegi = z.infer<typeof kreatifBriefIstegiSchema>;

// ─── Uçlar ──────────────────────────────────────────────────────────────────

/**
 * İZİNLER (MIMARI Ç-9):
 * - Okuma `rule.read`: ekran İyileştir'in sekmesi, menü `rule.read`.
 * - Etiketlemeyi elle başlatma `rule.write`, `sync.trigger` DEĞİL: müşteri
 *   hesabı (`client_viewer`) `sync.trigger` taşıyor ("Şimdi güncelle") ve
 *   etiketleme Gemini'ye para harcatıyor; sözleşme testi bunu ilk koşumda
 *   yakaladı. Zaten kendiliğinden koşuyor; elle düğme yalnız ajansa.
 * - Brief üretme `rule.write`: para harcayan (Gemini) bir eylem ve
 *   müşteri hesabı İyileştir'i hiç görmüyor.
 * - AdvCampaign'e aktarım `bulk.write`: AdvCampaign sayfasının kapısıyla
 *   aynı (nav-sections); ayrışırsa düğme görünüp açılmayan bir sayfaya
 *   götürür.
 * PLATFORM ÇAĞRISI YALNIZ İŞTE (adres tazeleme) ve görsel ucunda; ikisi de
 * transaction DIŞINDA.
 */
export const KREATIF_ZEKA_SAYFA_IZNI: Permission = 'rule.read';

export const KREATIF_ZEKA_UCLARI = [
  { yontem: 'GET', yol: '/kreatif-zeka', izin: 'rule.read', ne: 'Kümeler, satırlar, kovalar, etiket farkları, etiketleme özeti' },
  { yontem: 'GET', yol: '/kreatif-zeka/kreatifler/:creativeId/gorsel', izin: 'rule.read', ne: 'Görseli kullanım anında tazeleyip akıtır (beyaz liste, boyut sınırı)' },
  { yontem: 'POST', yol: '/kreatif-zeka/etiketle', izin: 'rule.write', ne: 'Workspace hesapları için creative_tags işini kuyruğa alır' },
  { yontem: 'POST', yol: '/kreatif-zeka/brief', izin: 'rule.write', ne: 'Kümenin brief i (girdi aynıysa önbellekten)' },
  { yontem: 'POST', yol: '/kreatif-zeka/brief/:id/advcampaign', izin: 'bulk.write', ne: 'Brief ile AdvCampaign oturumu açar (hazir_istem)' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; ne: string }>;
