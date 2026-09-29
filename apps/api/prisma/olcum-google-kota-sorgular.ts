/**
 * ═══ GOOGLE KOTASI NEREYE GİDİYOR — SORGULAR VE HESAP ═══
 *
 * Soru (2026-09-29): 3A Makina'da "Resource has been exhausted". Kotayı
 * TEKRAR DENEMELER mi yiyor, yoksa gerçekten FAZLA İSTEK mi atıyoruz?
 * Düzeltme bu ölçülmeden yazılmıyor, çünkü iki cevabın düzeltmesi zıt:
 * birincisi tekrar denemeyi kısmak, ikincisi iş hacmini azaltmak.
 *
 * NEDEN `sync_jobs`, `api_usage_log` DEĞİL: Google sağlayıcısı
 * `onRateLimit` çağırmıyor, yani Google isteği o tabloya HİÇ yazılmıyor
 * (ilk sorgu bunu da ölçüyor). Elimizdeki tek iz iş satırları.
 *
 * KÖR NOKTA — AÇIKÇA: `api_calls_used` YALNIZCA BAŞARILI işte yazılıyor
 * (`markSucceeded`). Düşen bir denemenin kaç çağrı harcadığı kayıtlı değil.
 * Bu yüzden düşen denemelerin maliyeti, AYNI İŞ TÜRÜNÜN başarılı işlerinin
 * ortalamasıyla TAHMİN ediliyor ve çıktıda "tahmin" diye yazıyor. Bir
 * deneme kotaya çarptığı anda düştüyse gerçek maliyeti ortalamadan AZDIR;
 * yani tahmin tekrar denemenin payını ÜSTTEN sınırlıyor. Aynı yönde ikinci
 * bir şişme var: `attempts` kota bekçisi işi platforma HİÇ gitmeden geri
 * çevirdiğinde de artıyor (`processAccountJob` sayacı bekçiden ÖNCE
 * artırıyor). `hataKodu` sorgusu bu reddin payını ayrıca gösteriyor.
 *
 * Sorgular burada, çalıştırıcı `olcum-google-kota.ts`de: test her sorguyu
 * gerçek şemada koşturuyor (`olcum-google-kota.spec.ts`) — elle yazılmış
 * bir kolon adı üretimde ilk satırda patlardı.
 *
 * `$1` = gün sayısı. Bütün sorgular yalnızca OKUYOR.
 */

/** Google hesabına bağlı iş satırları, son `$1` gün. */
const GOOGLE_ISLERI = `
  SELECT j.*, a.name AS hesap_adi, c.name AS musteri_adi
  FROM sync_jobs j
  JOIN ad_accounts a ON a.id = j.ad_account_id
  LEFT JOIN clients c ON c.id = j.client_id
  WHERE a.platform = 'google'
    AND j.created_at >= now() - make_interval(days => $1::int)`;

/** Kota hatası: sınıflandırıcı `rate_limited` yazıyor; mesaj eski satırlar için yedek. */
const KOTA_HATASI = `(j.error_code = 'rate_limited' OR j.error_message ILIKE '%exhausted%')`;

export interface Sorgu {
  ad: string;
  sql: string;
}

export const SORGULAR = {
  telemetri: {
    ad: 'api_usage_log içinde Google satırı (0 bekleniyor: sağlayıcı yazmıyor)',
    sql: `SELECT COUNT(*)::int AS satir
          FROM api_usage_log
          WHERE platform = 'google' AND created_at >= now() - make_interval(days => $1::int)`,
  },
  envanter: {
    ad: 'Google hesapları',
    sql: `SELECT COUNT(*)::int AS toplam,
                 COUNT(*) FILTER (WHERE client_id IS NOT NULL)::int AS atanmis,
                 COUNT(*) FILTER (WHERE client_id IS NOT NULL AND sync_enabled)::int AS izlenen
          FROM ad_accounts WHERE platform = 'google'`,
  },
  isTuru: {
    ad: 'İş türü × durum',
    sql: `SELECT j.job_type::text AS tur, j.status::text AS durum,
                 COUNT(*)::int AS adet,
                 COALESCE(SUM(j.attempts), 0)::int AS deneme,
                 COALESCE(SUM(GREATEST(j.attempts - 1, 0)), 0)::int AS ek_deneme,
                 COALESCE(SUM(j.api_calls_used), 0)::int AS cagri,
                 COUNT(*) FILTER (WHERE ${KOTA_HATASI})::int AS kota_hatasi
          FROM (${GOOGLE_ISLERI}) j
          GROUP BY 1, 2 ORDER BY 1, 2`,
  },
  hataKodu: {
    ad: 'Son hata kodu (kota bekçisinin reddi ÇAĞRI HARCAMAZ, platform reddi harcar)',
    sql: `SELECT COALESCE(j.error_code, '(yok)') AS kod, j.status::text AS durum, COUNT(*)::int AS adet
          FROM (${GOOGLE_ISLERI}) j
          WHERE j.status <> 'succeeded'
          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12`,
  },
  mesajlar: {
    ad: 'Kota hatası mesajları (rakamlar # ile gruplandı)',
    sql: `SELECT regexp_replace(LEFT(j.error_message, 400), '[0-9]+', '#', 'g') AS mesaj,
                 COUNT(*)::int AS adet
          FROM (${GOOGLE_ISLERI}) j
          WHERE ${KOTA_HATASI}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
  },
  saat: {
    ad: 'Kota hatası: gün × saat (İstanbul)',
    sql: `SELECT to_char(COALESCE(j.started_at, j.created_at) AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS gun,
                 EXTRACT(HOUR FROM COALESCE(j.started_at, j.created_at) AT TIME ZONE 'Europe/Istanbul')::int AS saat,
                 COUNT(*)::int AS adet
          FROM (${GOOGLE_ISLERI}) j
          WHERE ${KOTA_HATASI}
          GROUP BY 1, 2 ORDER BY 1, 2`,
  },
  hesap: {
    ad: 'Hesap başına (en çok iş açan 12)',
    sql: `SELECT j.hesap_adi AS hesap, COALESCE(j.musteri_adi, '-') AS musteri,
                 COUNT(*)::int AS adet,
                 COALESCE(SUM(j.attempts), 0)::int AS deneme,
                 COALESCE(SUM(j.api_calls_used), 0)::int AS cagri,
                 COUNT(*) FILTER (WHERE ${KOTA_HATASI})::int AS kota_hatasi
          FROM (${GOOGLE_ISLERI}) j
          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12`,
  },
} satisfies Record<string, Sorgu>;

export interface IsTuruSatiri {
  tur: string;
  durum: string;
  adet: number;
  deneme: number;
  ek_deneme: number;
  cagri: number;
  kota_hatasi: number;
}

export interface TurTahmini {
  tur: string;
  /** Başarılı işlerin ölçülen çağrısı. */
  olculen: number;
  /** Başarılı iş başına ortalama; başarılı iş yoksa `null` = tahmin edilemiyor. */
  ortalama: number | null;
  /** Kayda geçmeyen denemelerin tahmini çağrısı (düşen işler + başarılıların ek denemeleri). */
  kayitsiz: number | null;
  /** Kayıtsız denemelerin sayısı — tahminin dayandığı şey. */
  kayitsizDeneme: number;
}

/**
 * Tür başına ölçülen + tahmini çağrı.
 *
 * Başarılı bir işin `attempts > 1` olması, ÖNCEKİ denemelerin düştüğü ve
 * onların çağrısının kayda geçmediği demek: `api_calls_used` yalnızca son,
 * başarılı denemenin sayısı. O ek denemeler de kayıtsız sayılıyor.
 */
export function turTahminleri(satirlar: IsTuruSatiri[]): TurTahmini[] {
  const turler = [...new Set(satirlar.map((s) => s.tur))].sort();
  return turler.map((tur) => {
    const buTur = satirlar.filter((s) => s.tur === tur);
    const basarili = buTur.filter((s) => s.durum === 'succeeded');
    const basariliAdet = basarili.reduce((t, s) => t + s.adet, 0);
    const olculen = basarili.reduce((t, s) => t + s.cagri, 0);
    const ortalama = basariliAdet > 0 ? olculen / basariliAdet : null;
    const kayitsizDeneme =
      basarili.reduce((t, s) => t + s.ek_deneme, 0) +
      buTur.filter((s) => s.durum !== 'succeeded').reduce((t, s) => t + s.deneme, 0);
    return {
      tur,
      olculen,
      ortalama,
      kayitsiz: ortalama === null ? null : Math.round(kayitsizDeneme * ortalama),
      kayitsizDeneme,
    };
  });
}
