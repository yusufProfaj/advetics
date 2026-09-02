import { z } from 'zod';

/**
 * ═══ PLATFORM FATURALARI — RAPORA EK RESMİ BELGE ═══
 *
 * Müşteri raporu alırken platformun kendi faturasını da aynı mailde görsün
 * diye. İstek birebir şuydu: "müşteri her şeyi tek pakette görsün."
 *
 * ═══ NEDEN ELLE YÜKLEME — API'DEN ÇEKİLEMİYOR ═══
 *
 * Otomatik çekmek denendi ve iki platformda da duvara çarptı:
 *
 * · GOOGLE: `InvoiceService.ListInvoices` gerçekten var ve dönen nesnede
 *   `pdf_url` alanı bulunuyor. Ama YALNIZCA AYLIK FATURALAMA (kredi hattı)
 *   olan hesaplarda çalışıyor. Kartla otomatik ödeme yapan hesapta çağrı
 *   `Cannot request invoices for a billing setup that is not on monthly
 *   invoicing` ile düşüyor. Resmi doküman ("otomatik kredi kartı ödemeleri
 *   bu programatik faturalama akışlarıyla uyumlu değil") ve Google ürün
 *   ekibinin forum yanıtı ("Automatic Payments is currently not supported
 *   by the API") ile iki kez doğrulandı.
 *
 * · META: `/{business-id}/business_invoices` yalnızca fatura KAYDINI
 *   (metadata) döndürüyor; PDF'e giden bir alan resmi dokümanda YOK.
 *   İnsanların kullandığı `act_<id>/transactions` ucu DOKÜMANTE DEĞİL —
 *   Ads Manager arayüzünün içsel çağrısı ve Meta haber vermeden
 *   kaldırabilir. Bu projede dokümante olmayan uca bağlanmak daha önce
 *   pahalıya patladı.
 *
 * Belgenin RESMİ olması şart olduğu için kendi ürettiğimiz bir harcama
 * dökümü de cevap değil: sayılar doğru olurdu ama muhasebeye gitmezdi ve
 * fatura yerine sunmak yanlış olurdu.
 *
 * Kalan tek dürüst yol: ajans faturayı platformdan indirip yüklüyor.
 */

export const FATURA_PLATFORMLARI = ['meta', 'google'] as const;
export type FaturaPlatformu = (typeof FATURA_PLATFORMLARI)[number];

export const FATURA_PLATFORM_ETIKETLERI: Record<FaturaPlatformu, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
};

/** Yalnızca PDF. Fatura resmi bir belge; ekran görüntüsü kabul edilmiyor. */
export const FATURA_MIME = 'application/pdf';

/**
 * Dosya üst sınırı.
 *
 * Fatura PDF'leri tipik olarak 100 KB altında; 10 MB fazlasıyla yeterli ve
 * paylaşımlı sunucuda disk dolmasına karşı bir tampon. Sınır AŞILDIĞINDA
 * yükleme reddediliyor — sessizce kırpmak bozuk bir PDF üretirdi.
 */
export const FATURA_MAX_BAYT = 10 * 1024 * 1024;

/**
 * Dönem — `YYYY-MM`.
 *
 * TARİH ARALIĞI DEĞİL AY SAKLANIYOR. Fatura bir aya ait; başlangıç/bitiş
 * tarihi tutmak, "1–31 Ağustos" ile "Ağustos" arasında hiçbir zaman
 * kullanılmayacak bir ayrım üretirdi ve eşleştirmeyi zorlaştırırdı.
 */
export const donemSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Dönem YYYY-MM biçiminde olmalı.');

export const faturaYuklemeSchema = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(FATURA_PLATFORMLARI),
  donem: donemSchema,
  /** Ajansın kendi notu — fatura numarası, tutar vb. Zorunlu değil. */
  aciklama: z.string().max(200).nullable().optional(),
});
export type FaturaYuklemeInput = z.infer<typeof faturaYuklemeSchema>;

export interface FaturaOzeti {
  id: string;
  clientId: string;
  clientName: string | null;
  platform: FaturaPlatformu;
  donem: string;
  fileName: string;
  byteSize: number;
  aciklama: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
}

/**
 * Bir rapor aralığının kapsadığı DÖNEMLER.
 *
 * SAF FONKSİYON ve sınanabilir: eşleştirme yanlış olduğunda hiçbir hata
 * düşmüyor, müşteriye YANLIŞ AYIN faturası gidiyor — ya da hiç gitmiyor.
 * İkisi de sessiz.
 *
 * AYIN BİR KISMINI KAPSAYAN RAPOR DA O AYI SAYIYOR. "1–15 Ağustos" raporu
 * Ağustos faturasını taşıyor: fatura ayın tamamına ait ve müşterinin eline
 * geçmesi gereken belge o. Alternatif (yalnızca tam ayları saymak) yarım
 * dönem raporlarında faturayı sessizce düşürürdü.
 *
 * Tarihler `YYYY-MM-DD` STRING ve karşılaştırma da öyle yapılıyor —
 * `Date`e çevirmek bu kod tabanında saat dilimi kayması üretiyor.
 */
export function kapsananDonemler(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let yil = Number(from.slice(0, 4));
  let ay = Number(from.slice(5, 7));
  const son = to.slice(0, 7);

  // 24 ay üst sınır: rapor aralığı sunucuda 400 günle sınırlı, yani en fazla
  // 14 dönem çıkabiliyor. Sınır bir güvenlik ağı — bozuk bir girdi sonsuz
  // döngüye çevirmesin.
  for (let i = 0; i < 24; i++) {
    const donem = `${yil}-${String(ay).padStart(2, '0')}`;
    out.push(donem);
    if (donem >= son) break;
    ay++;
    if (ay > 12) {
      ay = 1;
      yil++;
    }
  }
  return out;
}

/** `2026-08` → `Ağustos 2026`. */
const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
export function donemMetni(donem: string): string {
  const ay = Number(donem.slice(5, 7));
  return `${AYLAR[ay - 1] ?? donem} ${donem.slice(0, 4)}`;
}
