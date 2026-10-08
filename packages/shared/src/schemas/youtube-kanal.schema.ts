import { z } from 'zod';

/**
 * ═══ YOUTUBE KANALINI BUL — ÖNERİ SÖZLEŞMESİ ═══
 *
 * Kanal eklemek adres yapıştırmayı gerektiriyordu. Kullanıcının isteği:
 * "şirketin ismini yazsam kanalları gösterse ya da kendisi bulsa, ben bu
 * deyip onaylasam". Öneri üç kaynaktan geliyor ve her önerinin NEDEN
 * önerildiği kartta yazıyor; isim benzerliği tek başına kanıt değil
 * (hayran kanalları, aynı adlı başka firmalar).
 *
 *   · site        workspace'in kendi sitesinde kanal bağlantısı ya da gömülü video
 *   · google_ads  workspace'in Google Ads hesabında reklamı yapılmış videolar
 *   · arama       YouTube'da isimle arama (kota pahalı: 100 birim)
 */
export const YOUTUBE_ONERI_KAYNAKLARI = ['site', 'google_ads', 'arama'] as const;
export type YoutubeOneriKaynagi = (typeof YOUTUBE_ONERI_KAYNAKLARI)[number];

export interface YoutubeKanalOnerisi {
  channelId: string;
  title: string;
  /** `@ad` biçiminde, yoksa null. */
  handle: string | null;
  thumbnailUrl: string | null;
  /** Kanal gizlediyse null — "0 abone" demek yanlış olurdu. */
  aboneSayisi: number | null;
  videoSayisi: number | null;
  /** Kanıtlar — en az bir tane. Sıra: site, google_ads, arama. */
  kaynaklar: Array<{ tur: YoutubeOneriKaynagi; aciklama: string }>;
  /**
   * Kanal panelde zaten var mı. `baska_workspacete` olan kanal bu ekrandan
   * EKLENEMİYOR: başka bir markanın kanalını sessizce taşımak, videolarının
   * yanlış panele düşmesi demek.
   */
  mevcut:
    | null
    | { durum: 'havuzda'; socialProfileId: string }
    | { durum: 'bu_workspacete'; socialProfileId: string }
    | { durum: 'baska_workspacete'; socialProfileId: string; workspaceAdi: string | null };
}

export interface YoutubeKanalOnerileri {
  oneriler: YoutubeKanalOnerisi[];
  /**
   * Her kaynağın NE OLDUĞU — boş liste nedenini söylemeli ("site yok",
   * "sitede bağlantı yok", "Google Ads hesabı yok", "sorgu düştü: …").
   */
  notlar: string[];
}

export const youtubeKanalAraSchema = z.object({
  q: z.string().trim().min(2, 'En az 2 karakter yaz').max(80, 'En fazla 80 karakter'),
  clientId: z.string().uuid().optional(),
});
export type YoutubeKanalAra = z.infer<typeof youtubeKanalAraSchema>;
