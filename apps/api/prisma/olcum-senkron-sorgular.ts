/**
 * ═══ SENKRONİZASYON DURUMU UCUNUN SORGULARI — ÖLÇÜLMEK İÇİN ═══
 *
 * `GET /sync/status` canlıda "Tüm şirketler" modunda 3,1-3,5 saniye sürüyor
 * ve soğuk başlangıçta Prisma'nın 5 saniyelik transaction sınırını aşıp 500
 * dönüyor (2026-09-28, 101 hesap, `sync_jobs` 293.501 satır). Yavaşlığın
 * HANGİ sorgudan geldiği ölçülmeden düzeltme yazılmıyor (CLAUDE.md: "aynı
 * SQL deseni bir sorguda arıza, diğerinde bedava").
 *
 * AYRI DOSYADA, çünkü sınanıyorlar: `olcum-senkron.spec.ts` hepsini PGlite
 * üzerinde çalıştırıyor ve her adayın bugünkü sorguyla BİREBİR AYNI sonucu
 * verdiğini kanıtlıyor. Farklı sonuç veren iki sorgunun süresini
 * karşılaştırmak hiçbir şey anlatmaz.
 *
 * SORGULAR `sync.controller.ts`TEN KOPYALANDI ve bu bir borç: Prisma'nın
 * `count({ where })` çağrılarının SQL karşılığı elle yazıldı. İkisi
 * ayrışırsa ölçüm başka bir sorgunun planını gösterir; her birinin hangi
 * çağrıdan geldiği yanında yazıyor.
 */
import { METRIK_ISLERI, isSayaclariSorgusu } from '../src/modules/sync/metrik-isleri';

/** `sync.controller.ts` içindeki `RECENT_JOB_LIMIT` ile AYNI olmak zorunda. */
export const SON_IS_LIMITI = 25;

const METRIK = METRIK_ISLERI.map((t) => `'${t}'`).join(', ');

export interface OlculenSorgu {
  ad: string;
  /** Bugün koşan hâl. */
  bugun: string[];
  /**
   * Aday. `null` = bu parça için aday yok, yalnızca bugünkü maliyeti
   * ölçülüyor. `anlamDegisiyor` = aday AYNI soruyu sormuyor; yalnızca
   * karşılaştırma için ölçülüyor ve uygulanmadan önce kullanıcıya sorulur.
   */
  aday: string[] | null;
  anlamDegisiyor?: true;
}

export function senkronSorgulari(): OlculenSorgu[] {
  return [
    {
      // `tx.syncJob.count()` × 4 → tek tarama, dört FILTER.
      ad: 'iş sayaçları',
      bugun: [
        'SELECT COUNT(*)::int AS n FROM sync_jobs',
        "SELECT COUNT(*)::int AS n FROM sync_jobs WHERE status = 'failed'",
        `SELECT COUNT(*)::int AS n FROM sync_jobs
          WHERE status = 'succeeded' AND rows_upserted = 0 AND job_type IN (${METRIK})`,
        "SELECT COUNT(*)::int AS n FROM sync_jobs WHERE status IN ('running', 'queued', 'throttled')",
      ],
      // Tek tarama, TÜM ZAMANLAR — aynı soruyu soruyor ve eşdeğerlik testi
      // bununla yapılıyor. 2026-09-28'de üretimde 457 ms; 2026-09-29'da
      // uygulama son 7 güne geçti (aşağıdaki parça).
      aday: [
        `SELECT COUNT(*)::int AS toplam,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS dusen,
                COUNT(*) FILTER (WHERE status = 'succeeded' AND rows_upserted = 0
                                   AND job_type IN (${METRIK}))::int AS bos,
                COUNT(*) FILTER (WHERE status IN ('running', 'queued', 'throttled'))::int AS kosan
           FROM sync_jobs`,
      ],
    },
    {
      // `sonIsSorgusu` — DISTINCT ON bütün tabloyu tarıyor. Aday: hesap ve
      // iş türü başına `(ad_account_id, job_type, created_at DESC)`
      // indeksinden TEK satır.
      //
      // ÖLÇÜLDÜ VE REDDEDİLDİ (2026-09-28, üretim): bugünkü DISTINCT ON 506
      // ms, bu aday 30 SANİYEYİ AŞTI ve zaman aşımına düştü. "İndeks
      // okuması taramadan hızlıdır" tahmini RLS altında tutmadı. Aday
      // ölçüm listesinde KALIYOR ki aynı fikir yeniden önerilirse sonucu
      // görülsün; uygulanmadı.
      ad: 'hesap başına son iş',
      bugun: [
        `SELECT DISTINCT ON (ad_account_id, job_type)
                id, job_type, status, ad_account_id, created_at
           FROM sync_jobs
          WHERE ad_account_id IS NOT NULL
          ORDER BY ad_account_id, job_type, created_at DESC`,
      ],
      aday: [
        `SELECT j.id, j.job_type, j.status, j.ad_account_id, j.created_at
           FROM ad_accounts a
          CROSS JOIN unnest(enum_range(NULL::"SyncJobType")) AS t(job_type)
          CROSS JOIN LATERAL (
                SELECT s.id, s.job_type, s.status, s.ad_account_id, s.created_at
                  FROM sync_jobs s
                 WHERE s.ad_account_id = a.id AND s.job_type = t.job_type
                 ORDER BY s.created_at DESC
                 LIMIT 1
          ) j
          WHERE a.client_id IS NOT NULL`,
      ],
    },
    {
      // `tx.syncJob.findMany({ orderBy: createdAt desc, take: 25 })`.
      ad: 'son işler listesi',
      bugun: [`SELECT id FROM sync_jobs ORDER BY created_at DESC LIMIT ${SON_IS_LIMITI}`],
      aday: null,
    },
    {
      // `tx.adAccount.findMany({ where: { clientId: { not: null } } })`.
      ad: 'atanmış hesaplar',
      bugun: [
        `SELECT a.id, a.name, a.platform, a.status, a.sync_enabled, a.connection_id, c.status AS client_status
           FROM ad_accounts a LEFT JOIN clients c ON c.id = a.client_id
          WHERE a.client_id IS NOT NULL
          ORDER BY a.platform, a.name`,
      ],
      aday: null,
    },
    {
      // Sayaçlar yalnızca son N gün. ANLAM DEĞİŞİYOR (tüm zamanlar → son N
      // gün) ve kullanıcı bunu 2026-09-29'da onayladı. ADAY = ÜRETİMDE
      // ÇALIŞAN SORGU: metin aynı fonksiyondan, ölçülen ile çalışan
      // ayrışamaz. 2026-09-28 ölçümü: 137 ms.
      ad: 'iş sayaçları (son 7 gün)',
      bugun: [],
      aday: [isSayaclariSorgusu().sql],
      anlamDegisiyor: true,
    },
  ];
}
