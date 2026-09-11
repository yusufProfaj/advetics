/**
 * ═══ METRİK SORGULARININ PLANINI ÜRETİMDE ÖLÇ ═══
 *
 * Ajans genel bakışının yavaşlığı üç turdur ÖLÇÜLMEDEN kapatılmaya
 * çalışıldı. `YavasIstekInterceptor` hangi UCUN yavaş olduğunu söyledi
 * (coverage 17,4 sn · summary 5,2 · organizations 4,0 · timeseries 3,4);
 * geriye NEDEN sorusu kaldı ve onun cevabı sorgu planında.
 *
 * ┌─ NEDEN AYRI BİR SCRIPT ───────────────────────────────────────────────┐
 * │ Elle `psql` açmak iki sebeple çalışmıyor:                              │
 * │                                                                       │
 * │  1. `sudo -u postgres psql` PAROLA SORUYOR ve komutlar `advetics`      │
 * │     kullanıcısıyla yazılıyor. Bu script `.env`teki `DATABASE_URL`u     │
 * │     kullanıyor — uygulamanın kendi kimliği, ek yetki yok.              │
 * │  2. RLS BAĞLAMI OLMADAN ÖLÇÜM YANILTICI. Politikalar sorguya yüklem    │
 * │     ekliyor ve planı DEĞİŞTİRİYOR; bağlamsız koşan bir `EXPLAIN`       │
 * │     üretimdekinden başka bir plan gösterir. Buradaki GUC'lar           │
 * │     `PrismaService.withTenant` ile BİREBİR aynı.                       │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * HİÇBİR ŞEY YAZMIYOR. Bütün iş tek bir transaction içinde ve sonunda
 * `ROLLBACK` var; `EXPLAIN ANALYZE` sorguyu GERÇEKTEN çalıştırıyor ama
 * buradakiler `SELECT`.
 *
 * Kullanım (advetics kullanıcısı, depo kökünde):
 *   pnpm --filter @advetics/api olcum-metrik -- --eposta=kisi@ornek.com
 *
 * E-posta verilmezse `.env`teki `SEED_ADMIN_EMAIL` kullanılıyor.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../../../.env') });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const EPOSTA =
  ARGV.find((a) => a.startsWith('--eposta='))?.slice('--eposta='.length) ??
  process.env.SEED_ADMIN_EMAIL;

/*
 * İKİ İSTEMCİ VE İKİSİ DE GEREKLİ.
 *
 * Kimliği çözmek için BYPASSRLS gerekiyor (kullanıcıyı bulmadan bağlam
 * kuramıyoruz — yumurta-tavuk). Ölçüm ise uygulamanın KENDİ rolüyle
 * yapılmak zorunda: migrator rolü RLS'i atlıyor ve onun planı üretimdeki
 * planı temsil etmiyor.
 */
const admin = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const uygulama = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

/** `metrics.service.ts` içindeki `TOTALS_LEVEL` ile AYNI olmak zorunda. */
const TOTALS_LEVEL = 'campaign';

function gun(gerideGun: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - gerideGun);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!EPOSTA) {
    throw new Error('E-posta verilmedi. --eposta=... geçir ya da .env içine SEED_ADMIN_EMAIL yaz.');
  }

  const kullanici = await admin.user.findFirst({
    where: { email: { equals: EPOSTA, mode: 'insensitive' } },
    select: { id: true, orgId: true },
  });
  if (!kullanici) throw new Error(`Kullanıcı bulunamadı: ${EPOSTA}`);

  const ustHesap = await admin.managerMembership.findUnique({
    where: { userId: kullanici.id },
    select: { managerAccountId: true },
  });

  /*
   * "TÜM ŞİRKETLER" KAPSAMI — en pahalı hâl ve ölçülmek istenen hâl.
   * Üst hesap yoksa kapsam kendi şirketi; script yine çalışıyor ama
   * ölçtüğü şey ajans görünümü olmuyor ve bunu SÖYLÜYOR.
   */
  const orgIdler = ustHesap
    ? (
        await admin.organization.findMany({
          where: { managerAccountId: ustHesap.managerAccountId, status: 'active' },
          select: { id: true },
        })
      ).map((o) => o.id)
    : [kullanici.orgId];

  const clientIdler = (
    await admin.client.findMany({
      where: { orgId: { in: orgIdler }, status: { not: 'archived' } },
      select: { id: true },
    })
  ).map((c) => c.id);

  console.log('═══ KAPSAM ═══');
  console.log(`kullanıcı      : ${EPOSTA}`);
  console.log(`üst hesap      : ${ustHesap ? 'VAR — ajans görünümü ölçülüyor' : 'YOK — yalnızca kendi şirketi'}`);
  console.log(`şirket sayısı  : ${orgIdler.length}`);
  console.log(`workspace      : ${clientIdler.length}`);

  const from = gun(30);
  const to = gun(1);

  /*
   * SORGULAR `metrics.service.ts`ten KOPYALANDI ve bu bir borç: ikisi
   * ayrışırsa ölçüm başka bir sorgunun planını gösterir. Servisi buradan
   * çağırmak Nest bağımlılık grafiğini ayağa kaldırmak demekti (bir ölçüm
   * aracı için fazla) — bunun yerine sorgular KISALTILMADAN, olduğu gibi
   * duruyor ve her biri hangi metottan geldiğini yazıyor.
   */
  const olcumler: Array<{ ad: string; sql: string }> = [
    {
      ad: 'coverage — MetricsService.coverage (TARİH SINIRI YOK)',
      sql: `
        SELECT MIN(date) AS en_eski, MAX(date) AS en_yeni
        FROM insights_daily
        WHERE entity_level = '${TOTALS_LEVEL}'::"EntityLevel"
          AND client_id = ANY($1::uuid[])
      `,
    },
    {
      ad: 'summary — MetricsService.summary (30 günlük pencere)',
      sql: `
        SELECT SUM(impressions) AS impressions,
               SUM(clicks) AS clicks,
               SUM(spend_micros) AS spend_micros,
               SUM(conversions) AS conversions,
               SUM(conversion_value_micros) AS conversion_value_micros
        FROM insights_daily
        WHERE date BETWEEN '${from}'::date AND '${to}'::date
          AND entity_level = '${TOTALS_LEVEL}'::"EntityLevel"
          AND client_id = ANY($1::uuid[])
      `,
    },
    {
      ad: 'organizations — MetricsService.byOrganization',
      sql: `
        SELECT cl.org_id, i.platform, i.currency,
               SUM(i.spend_micros) AS spend_micros
        FROM insights_daily i
        JOIN clients cl ON cl.id = i.client_id
        WHERE i.date BETWEEN '${from}'::date AND '${to}'::date
          AND i.entity_level = '${TOTALS_LEVEL}'::"EntityLevel"
          AND cl.status <> 'archived'
          AND i.client_id = ANY($1::uuid[])
        GROUP BY cl.org_id, i.platform, i.currency
      `,
    },
  ];

  await uygulama.$transaction(
    async (tx) => {
      // `PrismaService.withTenant` ile BİREBİR aynı liste; biri eksik
      // kalırsa politikalar başka bir dala düşer ve plan yanıltıcı olur.
      await tx.$queryRawUnsafe(
        `SELECT
           set_config('app.current_org_id', $1, true),
           set_config('app.current_user_id', $2, true),
           set_config('app.current_client_ids', $3, true),
           set_config('app.is_org_admin', 'on', true),
           set_config('app.can_manage_pool', 'on', true),
           set_config('app.can_create_clients', 'on', true),
           set_config('app.current_active_client_id', '', true),
           set_config('app.current_manager_account_id', $4, true),
           set_config('app.tum_sirketler', $5, true)`,
        kullanici.orgId,
        kullanici.id,
        clientIdler.join(','),
        ustHesap?.managerAccountId ?? '',
        ustHesap ? 'on' : 'off',
      );

      console.log('\n═══ TABLO BÜYÜKLÜĞÜ ═══');
      const boyut = await tx.$queryRawUnsafe<Array<{ partition: string; satir: bigint }>>(
        `SELECT c.relname AS partition, c.reltuples::bigint AS satir
           FROM pg_class c
           JOIN pg_inherits i ON i.inhrelid = c.oid
           JOIN pg_class p ON p.oid = i.inhparent
          WHERE p.relname = 'insights_daily'
          ORDER BY c.relname`,
      );
      for (const b of boyut) console.log(`  ${b.partition.padEnd(28)} ~${b.satir} satır (tahmin)`);
      if (boyut.length === 0) console.log('  (partition bulunamadı — 03_partitions.sql koşmamış olabilir)');

      for (const o of olcumler) {
        console.log(`\n═══ ${o.ad} ═══`);
        const baslangic = Date.now();
        const plan = await tx.$queryRawUnsafe<Array<Record<string, string>>>(
          `EXPLAIN (ANALYZE, BUFFERS, TIMING) ${o.sql}`,
          clientIdler,
        );
        console.log(`(duvar saati: ${Date.now() - baslangic} ms)`);
        for (const satir of plan) console.log('  ' + Object.values(satir)[0]);
      }

      /*
       * TRANSACTION BİLEREK GERİ ALINIYOR. Ölçüm yalnızca SELECT yapıyor
       * ama bir ölçüm aracının "hiçbir şey yazmadığı" iddiası koda
       * yazılmalı; sonraki bakımda buraya bir UPDATE eklenirse de geri
       * alınır.
       */
      throw new GeriAl();
    },
    { timeout: 180_000, maxWait: 180_000 },
  ).catch((e: unknown) => {
    if (!(e instanceof GeriAl)) throw e;
  });

  console.log('\nBitti — hiçbir satır yazılmadı (transaction geri alındı).');
}

/** Transaction'ı geri almak için kullanılan iç sinyal; hata değil. */
class GeriAl extends Error {}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.$disconnect();
    await uygulama.$disconnect();
  });
