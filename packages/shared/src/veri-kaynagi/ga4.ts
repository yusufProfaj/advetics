/**
 * ═══ F1 · GA4 DATA API OKUMA ═══
 *
 * `POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport`,
 * izin `analytics.readonly` (bağlantıda zaten var: `GOOGLE_OLCUM_SCOPES`).
 * Boyut/metrik adları API şemasından doğrulandı (2026-10-12):
 * https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 *
 * İKİ RAPOR, İKİ TABLO — BİRLEŞTİRİLMEZ. Anahtar etkinlik kırılımı `eventName`
 * boyutuyla geliyor ve o boyut satırı ETKİNLİK BAŞINA ÇOĞALTIYOR: oturum
 * sayısı her etkinlik satırında tekrar eder. Ana rapora eklemek oturumu
 * etkinlik sayısı kadar katlar ve hiçbir hata düşmez (CLAUDE.md "SEGMENT
 * EKLEMEK SATIRI ÇOĞALTIYOR", Google dönüşüm eylemi dersiyle aynı). Etkinlik
 * raporu bu yüzden YALNIZ `keyEvents` seçer.
 *
 * `keyEvents:<olay>` SÖZDİZİMİ BELGEDE YOK (ölçüldü: şema yalnız
 * `sessionKeyEventRate:<olay>` tanıyor). Olay başına sayım `eventName`
 * boyutu + `keyEvents` metriğiyle alınır. Eski `conversions` adı şemada yok;
 * kullanılmaz.
 */

export const GA4_RAPORLARI = {
  /** Günlük trafik: kaynak/ortam/kampanya kırılımı. Tablo `ga4_gunluk`. */
  trafik: {
    boyutlar: [
      'date',
      'sessionSourceMedium',
      'sessionCampaignName',
      'sessionCampaignId',
      'sessionGoogleAdsCampaignId',
    ],
    metrikler: ['sessions', 'engagedSessions', 'totalUsers', 'keyEvents', 'totalRevenue', 'ecommercePurchases'],
  },
  /** Anahtar etkinlik kırılımı. Tablo `ga4_anahtar_etkinlik_gunluk`. YALNIZ keyEvents. */
  anahtarEtkinlik: {
    boyutlar: ['date', 'sessionSourceMedium', 'sessionCampaignName', 'sessionCampaignId', 'sessionGoogleAdsCampaignId', 'eventName'],
    metrikler: ['keyEvents'],
  },
  /** F3 için ürün geliri (item kapsamlı). Tablo `ga4_urun_gunluk`. Oturum boyutu YOK. */
  urun: {
    boyutlar: ['date', 'itemId', 'itemName'],
    metrikler: ['itemRevenue', 'itemsPurchased'],
  },
} as const;
export type Ga4RaporKodu = keyof typeof GA4_RAPORLARI;

/** API sınırı: istek başına en çok 9 boyut, 10 metrik. Tanım bu sınırda kalmalı. */
export const GA4_ISTEK_SINIRI = { boyut: 9, metrik: 10, satir: 250_000, varsayilanSatir: 10_000 } as const;

/**
 * Metrik toplanabilir mi?
 *
 * `totalUsers` TOPLANAMAZ: aynı kişi iki gün gelirse iki günlük satırların
 * toplamı onu iki kez sayar. Panel "dönem kullanıcısı" gösterecekse ya
 * dönemi tek istekte sorar ya da HİÇ göstermez; gün toplamını "kullanıcı"
 * diye yazmak sayıyı şişirir. v1: kullanıcı yalnız tek gün görünümünde.
 * Toplanamayan metriğin toplamı `null` (rapor sütunları deseni).
 */
export const GA4_METRIK_TANIMI: Record<string, { ad: string; toplanabilir: boolean; para: boolean }> = {
  sessions: { ad: 'Oturum', toplanabilir: true, para: false },
  engagedSessions: { ad: 'Etkileşimli oturum', toplanabilir: true, para: false },
  totalUsers: { ad: 'Kullanıcı', toplanabilir: false, para: false },
  keyEvents: { ad: 'Anahtar etkinlik', toplanabilir: true, para: false },
  totalRevenue: { ad: 'Gelir', toplanabilir: true, para: true },
  ecommercePurchases: { ad: 'Satın alma', toplanabilir: true, para: false },
  itemRevenue: { ad: 'Ürün geliri', toplanabilir: true, para: true },
  itemsPurchased: { ad: 'Satılan adet', toplanabilir: true, para: false },
};

/**
 * GA4'ün özel boyut değerleri. "(not set)" kampanya adı DEĞİL: eşlemeye
 * aday sayılmaz. "(other)" yüksek kardinalitede satırların toplandığı
 * kova: eşlenemez ve VARLIĞI rapora yazılır (`dataLossFromOtherRow`).
 */
export const GA4_OZEL_DEGERLER = ['(not set)', '(other)', '(direct)', '(none)', '(organic)', '(referral)', ''] as const;

export function ga4OzelDegerMi(v: string | null | undefined): boolean {
  return v == null || (GA4_OZEL_DEGERLER as readonly string[]).includes(v.trim());
}

/**
 * GA4 tarih boyutu `YYYYMMDD` dönüyor; depo `YYYY-MM-DD` dizgesi taşıyor
 * (Date'e çevirmek saat dilimi kayması). Biçim dışı değer SESSİZCE geçmez.
 */
export function ga4Tarih(ham: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(ham);
  if (!m) throw new Error(`Beklenmeyen GA4 tarih değeri: ${ham}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Metrik değeri dizge geliyor. Para metriği MÜLKÜN para biriminde ve
 * ondalıklı; depoya micros (BigInt) olarak yazılır. `parseFloat * 1e6`
 * kayan nokta artığı üretiyor ve `BigInt()` onu reddediyor (LinkedIn'de
 * yaşandı, `linkedin-para.ts`); burada da dizge üzerinden tam sayı.
 */
export function ga4ParaMikro(ham: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(ham.trim());
  if (!m) throw new Error(`Beklenmeyen GA4 para değeri: ${ham}`);
  if (m[4] !== undefined) {
    // Bilimsel gösterim (çok küçük/büyük değer): nadiren gelir; sayıya çevirip yuvarla.
    return BigInt(Math.round(Number(ham) * 1_000_000));
  }
  const kesir = (m[3] ?? '').padEnd(6, '0').slice(0, 6);
  const mutlak = BigInt(m[2]!) * 1_000_000n + BigInt(kesir);
  return m[1] === '-' ? -mutlak : mutlak;
}

/**
 * Yanıtın kalite bayrakları. Üçü de "sayı yanlış olabilir" demek ve üçü de
 * EKRANDA söylenir; işin notuna (`sync_jobs.note`) da yazılır.
 * Kaynak: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData
 */
export interface Ga4Kalite {
  /** "(other)" satırı oluştu: kampanyaların bir kısmı tek kovada. */
  digerSatiri: boolean;
  /** Google signals eşiklemesi: bazı satırlar gizlendi. */
  esiklendi: boolean;
  /** Örnekleme oranı (0-1), örnekleme yoksa null. */
  ornekleme: number | null;
}

export function ga4Kalite(meta: {
  dataLossFromOtherRow?: boolean;
  subjectToThresholding?: boolean;
  samplingMetadatas?: Array<{ samplesReadCount?: string; samplingSpaceSize?: string }>;
} | undefined): Ga4Kalite {
  const s = meta?.samplingMetadatas?.[0];
  const oku = Number(s?.samplesReadCount);
  const uzay = Number(s?.samplingSpaceSize);
  return {
    digerSatiri: meta?.dataLossFromOtherRow === true,
    esiklendi: meta?.subjectToThresholding === true,
    ornekleme: s && Number.isFinite(oku) && Number.isFinite(uzay) && uzay > 0 ? oku / uzay : null,
  };
}

/**
 * ═══ KOTA — MÜLKÜN KOTASI MÜŞTERİNİN DE KOTASI ═══
 *
 * GA4 Standard: mülk başına 200.000 jeton/gün, 40.000/saat, proje başına
 * mülk başına 14.000/saat, eşzamanlı 10 istek; gün Pasifik gece yarısında
 * sıfırlanıyor (https://developers.google.com/analytics/devguides/reporting/data/v1/quotas).
 * Mülk kotası PAYLAŞILIYOR: müşterinin Looker Studio panosu ve kendi
 * araçları aynı havuzdan yiyor. Geçmiş çekimiyle kotayı bitirmek müşterinin
 * panosunu kırar ve sebebi onun ekranında hiç görünmez. Bu yüzden her
 * istekte `returnPropertyQuota: true` ve kalan yüzdeye göre katman kesilir.
 * Reklam hesabının kota bekçisi (`quota-guard.service.ts`) hesap kimliğiyle
 * anahtarlı; kaynak için anahtar `kaynak:<tur>:<disKimlik>`.
 */
export const GA4_KOTA = {
  /** Günlük jetonun bu yüzdesi KALMADIYSA geçmiş çekimi durur. */
  gecmisIcinEnAzKalanYuzde: 50,
  /** Bunun altında günlük çekim de durur; yalnız kullanıcının bastığı "şimdi yenile". */
  gunlukIcinEnAzKalanYuzde: 20,
  /** Saatlik jeton için aynı kural (saatlik pencere daha dar). */
  saatlikEnAzKalanYuzde: 25,
  eszamanliEnFazla: 2,
} as const;

export type KotaKatmani = 'gecmis' | 'gunluk' | 'etkilesimli';

/**
 * Kota yanıtından (PropertyQuota) bu katmana izin var mı? Bilinmeyen
 * (ilk istek, alan dönmedi) = izin, ama işin notuna "kota bilinmiyor".
 */
export function ga4KotaIzni(
  katman: KotaKatmani,
  kota: { gunKalan?: number; gunToplam?: number; saatKalan?: number; saatToplam?: number } | null,
): { izin: boolean; neden: string | null } {
  if (katman === 'etkilesimli') return { izin: true, neden: null };
  if (!kota) return { izin: true, neden: null };
  const yuzde = (k?: number, t?: number) => (k === undefined || !t ? null : (k / t) * 100);
  const gun = yuzde(kota.gunKalan, kota.gunToplam);
  const saat = yuzde(kota.saatKalan, kota.saatToplam);
  const esik = katman === 'gecmis' ? GA4_KOTA.gecmisIcinEnAzKalanYuzde : GA4_KOTA.gunlukIcinEnAzKalanYuzde;
  if (gun !== null && gun < esik) return { izin: false, neden: `Analytics günlük kotasının %${Math.round(gun)}'i kaldı` };
  if (saat !== null && saat < GA4_KOTA.saatlikEnAzKalanYuzde) return { izin: false, neden: `Analytics saatlik kotasının %${Math.round(saat)}'i kaldı` };
  return { izin: true, neden: null };
}
