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

/**
 * ═══ KABUL EDİLEN FATURA BİÇİMLERİ ═══
 *
 * PDF ve ZIP. Ekran görüntüsü (JPEG/PNG) HÂLÂ REDDEDİLİYOR ve bu karar
 * değişmedi: fatura resmi bir belge, müşteriye giden pakete bir telefon
 * fotoğrafı koymak onu belge olmaktan çıkarır.
 *
 * ZIP NEDEN EKLENDİ: platformlar dönem faturalarını çoğu zaman tek tek PDF
 * yerine tek bir arşiv olarak indirtiyor; ajans onu açıp tek tek yüklemek
 * zorunda kalıyordu.
 *
 * ┌─ BİÇİM GÖVDEDEN ANLAŞILIYOR, UZANTIDAN DEĞİL ─────────────────────────┐
 * │ Tarayıcı `content-type`ı uzantıdan TAHMİN ediyor: `.pdf` uzantılı bir  │
 * │ JPEG "application/pdf" olarak geliyor. Aynı ders raporun kreatif       │
 * │ görsellerinde de yaşandı — biçim sihirli baytlardan okunuyor.          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ZIP'İN NE İÇERDİĞİ KONTROL EDİLMİYOR ve edilemez: sunucu arşivi AÇMIYOR.
 * DOCX/XLSX de aslında birer ZIP, yani sihirli bayt "bu bir fatura paketi"
 * demiyor. Açmamak bilinçli — açmak zip-bomb ve yol kaçışı (Zip Slip) gibi
 * bütün bir saldırı sınıfını içeri alırdı. Ne yüklendiğinin sorumluluğu
 * yükleyende ve dosya müşteriye AYNEN gidiyor.
 */
export const FATURA_TURLERI = [
  {
    mime: 'application/pdf',
    uzanti: 'pdf',
    etiket: 'PDF',
    /** `%PDF-` */
    imza: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  {
    mime: 'application/zip',
    uzanti: 'zip',
    etiket: 'ZIP',
    /**
     * `PK\x03\x04` — yerel dosya başlığı.
     *
     * ZIP'in iki varyantı daha var: `PK\x05\x06` (BOŞ arşiv) ve `PK\x07\x08`
     * (çok parçalı). İkisi de burada YOK ve bu bilinçli: boş bir arşiv fatura
     * değil, çok parçalı bir arşivin tek parçası da tek başına açılamıyor.
     * İkisini de kabul etmek, müşteriye açılamayan bir ek göndermek olurdu.
     */
    imza: [0x50, 0x4b, 0x03, 0x04],
  },
] as const;

export type FaturaTuru = (typeof FATURA_TURLERI)[number]['mime'];

/**
 * KABUL EDİLMEYEN ama TANINAN imzalar — yalnızca hata mesajını yazmak için.
 *
 * TEK YERDE: bu baytlar hem `faturaRetSebebi` içinde hem testlerde geçiyordu
 * ve elle iki kez yazılmıştı. Biri güncellenip diğeri unutulsaydı test
 * geçmeye devam eder, kullanıcı yanlış hata mesajını okurdu.
 */
export const TANINAN_IMZALAR = {
  /** `PK\x05\x06` — BOŞ arşiv (yalnızca EOCD kaydı). */
  zipBos: [0x50, 0x4b, 0x05, 0x06],
  /** `PK\x07\x08` — çok parçalı arşivin bir parçası. */
  zipParcali: [0x50, 0x4b, 0x07, 0x08],
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
} as const;

/** Panelin `accept` özniteliği ve kullanıcıya gösterilen liste. */
export const FATURA_KABUL = FATURA_TURLERI.map((t) => `.${t.uzanti}`).join(',');
export const FATURA_ETIKETLERI = FATURA_TURLERI.map((t) => t.etiket).join(' veya ');

/**
 * Gövdenin ilk baytlarından biçimi anlar. `null` = kabul edilen bir biçim değil.
 *
 * `content-type`a ve uzantıya BAKMIYOR — ikisi de kullanıcının tarayıcısından
 * geliyor ve ikisi de yanlış olabiliyor.
 */
export function faturaTuruAnla(bytes: Uint8Array): (typeof FATURA_TURLERI)[number] | null {
  for (const tur of FATURA_TURLERI) {
    if (bytes.length < tur.imza.length) continue;
    if (tur.imza.every((b, i) => bytes[i] === b)) return tur;
  }
  return null;
}

/**
 * REDDEDİLEN DOSYA İÇİN AÇIKLAYICI SEBEP.
 *
 * "Bu dosya kabul edilmiyor" tek başına kullanıcıyı ne yapacağını bilmez
 * bırakıyor. Boş bir arşiv ile bir ekran görüntüsü iki AYRI hata ve ikisinin
 * yapılacak işi farklı: biri yanlış dosyayı indirmiş, diğeri arşivi yanlış
 * oluşturmuş.
 */
export function faturaRetSebebi(bytes: Uint8Array): string {
  const basliyor = (imza: readonly number[]): boolean =>
    bytes.length >= imza.length && imza.every((b, i) => bytes[i] === b);

  /*
   * ZIP'in ÜÇ imzası var ve ikisi bizim için geçersiz. Ayırt etmek şart:
   * "PK" ile başlayan bir dosyaya "ZIP değil" demek, kullanıcının doğru
   * dosyayı yüklediğini sanıp aynı hatayı tekrarlaması demekti.
   */
  if (basliyor(TANINAN_IMZALAR.zipBos)) {
    return 'Arşiv BOŞ — içinde dosya yok. Faturayı yeniden indirip tekrar dene.';
  }
  if (basliyor(TANINAN_IMZALAR.zipParcali)) {
    return (
      'Bu, çok parçalı bir arşivin tek parçası ve tek başına açılamıyor. ' +
      'Arşivi tek dosya olarak yeniden oluştur.'
    );
  }
  // Ekran görüntüsü en sık yapılan hata; adını koymak en hızlı çözüm.
  if (basliyor(TANINAN_IMZALAR.jpeg) || basliyor(TANINAN_IMZALAR.png)) {
    return (
      'Bu bir görsel (ekran görüntüsü). Fatura resmi bir belge — platformun ' +
      `indirdiği ${FATURA_ETIKETLERI} dosyasını yükle.`
    );
  }
  return `Yalnızca ${FATURA_ETIKETLERI} kabul ediliyor ve dosya ikisine de benzemiyor.`;
}

/**
 * Dosya üst sınırı.
 *
 * Fatura PDF'leri tipik olarak 100 KB altında ama ARŞİVLER değil: platformun
 * bir dönem için paketlediği ZIP onlarca fatura taşıyabiliyor ve 10 MB gerçek
 * kullanımda yetmedi. Sınır AŞILDIĞINDA yükleme reddediliyor — sessizce
 * kırpmak bozuk bir dosya üretirdi.
 *
 * 20 MB, mail sağlayıcısının 25 MB'lık HAM sınırının altında kalacak şekilde
 * seçildi: tek bir faturanın yanına rapor PDF'i ve gövde de sığmalı.
 */
export const FATURA_MAX_BAYT = 20 * 1024 * 1024;

/**
 * BİR MAİLDEKİ TOPLAM EK BÜTÇESİ (ham bayt).
 *
 * Tek fatura varken bu sınıra gerek yoktu; artık bir rapora birden çok fatura
 * girebiliyor ve üç adet 10 MB'lık PDF maili sunucuda REDDETTİRİR. Reddedilen
 * bir mail "gönderildi" yazan bir akışın en pahalı hâli: kimse fark etmiyor.
 *
 * ┌─ ÖNCEKİ GEREKÇE YANLIŞTI, DÜZELTİLDİ ─────────────────────────────────┐
 * │ Burada 15 MB yazıyordu ve gerekçesi şuydu: "25 MB sınırı TELDEN GEÇEN  │
 * │ boyuta bakıyor, base64 ~%33 şişiriyor, o yüzden ham bütçe 15 olmalı".  │
 * │ Google'ın kendi dokümanı bunun TERSİNİ söylüyor: sınırlar "the total   │
 * │ size of the message content and attachments BEFORE ENCODING" için      │
 * │ yazılmış. Yani 25 MB HAM boyut; base64 şişmesini sağlayıcı zaten hesaba │
 * │ katıyor (Gmail SMTP'nin EHLO'da bildirdiği `SIZE` değeri de kabaca     │
 * │ 25 MB × 4/3 kadar). Kendi kendime koyduğum sınır gereksizce dardı ve    │
 * │ kullanıcının 10 MB'lık arşivi maile hiç girmiyordu.                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * 22 MB, 25'ten geriye rapor PDF'i ve gövde için pay bırakıyor. Bütçe artık
 * TOPLAM MESAJ bütçesi: çağıran, rapor PDF'inin boyutunu geçiriyor ve
 * faturalar kalandan yiyor — eskiden bütçe yalnızca faturaları sayıyordu ve
 * PDF'in payı hesaba hiç girmiyordu.
 *
 * SAĞLAYICI VARSAYIMI: 25 MB, Google Workspace'in standart sınırı. Farklı bir
 * SMTP sunucusu daha düşük bir sınır koyuyorsa mail reddedilir ve sebebi
 * `mailGonder`in fırlattığı hatada görünür — sessiz kalmaz.
 *
 * Sınıra takılan fatura SESSİZCE düşmüyor: hangisinin neden eklenmediği hem
 * denetim kaydına hem kullanıcıya yazılıyor.
 */
export const MAIL_EK_TOPLAM_SINIRI = 22 * 1024 * 1024;

/**
 * BİR DÖNEM + PLATFORM İÇİN EN FAZLA FATURA.
 *
 * Doğrulama GİRİŞ ANINDA: kullanıcı on birinci faturayı yüklemeye
 * çalıştığında reddediliyor, gönderim anında sessizce düşürülmüyor. CLAUDE.md
 * kuralı — "kullanıcı yüklediğinin kullanılamayacağını tıkladığında değil
 * bıraktığında öğrenmeli".
 *
 * On, iş gerçeğinden: bir ayda bir platformdan on ayrı fatura gelmesi zaten
 * olağandışı; daha yükseği yanlış müşteriye yükleme belirtisi.
 */
export const FATURA_MAX_ADET = 10;

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
  /**
   * `application/pdf` ya da `application/zip`.
   *
   * PANELDE GÖSTERİLİYOR: kullanıcı listede hangi satırın arşiv olduğunu
   * görebilmeli — bir ZIP'i açmadan içindekini bilemiyor ve maile giden şey o.
   */
  mimeType: string;
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
