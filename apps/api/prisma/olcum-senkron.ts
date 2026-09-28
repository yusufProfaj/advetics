/**
 * ═══ SENKRONİZASYON DURUMU UCUNU ÜRETİMDE ÖLÇ ═══
 *
 * `GET /sync/status` "Tüm şirketler" modunda 3,1-3,5 saniye sürüyor ve
 * soğuk başlangıçta 5 saniyelik transaction sınırını aşıp 500 dönüyor
 * (2026-09-28). Bu araç ucun her sorgusunu ayrı ayrı ölçüyor ve adaylarla
 * karşılaştırıyor; hangi parçanın ağır olduğu ölçülmeden düzeltme
 * yazılmıyor. Adaylar ve gerekçeleri `olcum-senkron-sorgular.ts` içinde.
 *
 * `olcum-rapor.ts` ile aynı güvenceler:
 *   · Kimlik BYPASSRLS istemcisiyle çözülüyor, ÖLÇÜM uygulamanın kendi
 *     rolüyle yapılıyor: RLS'siz bir `EXPLAIN` politikaların yüklemini
 *     taşımaz ve başka bir plan gösterir.
 *   · Oturum değişkenleri `PrismaService.withTenant` ile BİREBİR aynı
 *     (`olcum-senkron.spec.ts` karşılaştırıyor).
 *   · Her sorgu 7 kez koşuyor, ORTANCA alınıyor: paylaşımlı VPS'te tek bir
 *     koşum komşu sitenin yükünü ölçer.
 *   · HİÇBİR ŞEY YAZMIYOR: tek transaction, sonunda ROLLBACK. Şema da
 *     değişmiyor.
 *
 * Kullanım (advetics kullanıcısı, depo kökünde):
 *   pnpm --filter @advetics/api olcum-senkron -- --eposta=kisi@ornek.com
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { senkronSorgulari } from './olcum-senkron-sorgular';

loadEnv({ path: resolve(__dirname, '../../../.env') });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const arg = (ad: string) =>
  ARGV.find((a) => a.startsWith(`--${ad}=`))?.slice(ad.length + 3);

const EPOSTA = arg('eposta') ?? process.env.SEED_ADMIN_EMAIL;
const TEKRAR = 7;
/** Tek bir sorgunun sınırı. Uç 5 sn'de düşüyor; 30 sn çok daha kötüsünü ayırt ediyor. */
const SORGU_SINIRI_MS = 30_000;

const admin = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const uygulama = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

/** Transaction'ı geri almak için kullanılan iç sinyal; hata değil. */
class GeriAl extends Error {}

interface Tx {
  $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T>;
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

  const ustHesap = await admin.managerMembership.findFirst({
    where: { userId: kullanici.id },
    select: { managerAccountId: true },
    orderBy: { createdAt: 'asc' },
  });
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
  console.log(`kullanıcı : ${EPOSTA}`);
  console.log(`üst hesap : ${ustHesap ? ustHesap.managerAccountId : 'YOK'}`);
  console.log(`mod       : ${ustHesap ? 'Tüm şirketler (canlıda düşen hâl)' : 'tek şirket'}`);

  await uygulama
    .$transaction(
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

        /*
         * SORGU BAŞINA SÜRE SINIRI. İlk sürümde yoktu ve canlıda araç "hesap
         * başına son iş" parçasında hiçbir şey basmadan takılı kaldı: yavaş mı
         * ilerliyor yoksa bir sorgu mu asılı, ekrandan anlaşılmıyordu.
         * `SET LOCAL` yalnızca bu transaction'ı etkiliyor ve geri alınıyor.
         * Zaman aşımına düşen sorgu transaction'ı bozduğu için her ölçüm
         * kendi SAVEPOINT'inde koşuyor (`olc`).
         */
        await tx.$queryRawUnsafe(`SET LOCAL statement_timeout = '${SORGU_SINIRI_MS}ms'`);

        console.log('\n═══ ENVANTER (bu bağlamda GÖRÜNEN) ═══');
        const [e] = await tx.$queryRawUnsafe<Array<{ isler: number; hesap: number }>>(
          `SELECT (SELECT COUNT(*)::int FROM sync_jobs) AS isler,
                  (SELECT COUNT(*)::int FROM ad_accounts WHERE client_id IS NOT NULL) AS hesap`,
        );
        console.log(`  sync_jobs satırı  : ${e?.isler ?? 0}`);
        console.log(`  atanmış hesap     : ${e?.hesap ?? 0}`);

        let toplamBugun = 0;
        let toplamAday = 0;
        let eksik = false;
        for (const s of senkronSorgulari()) {
          // BAŞLIK ÖNCE: ölçüm sürerken hangi parçada olunduğu görünsün.
          console.log(`\n═══ ${s.ad}${s.anlamDegisiyor ? ' — ANLAM DEĞİŞİYOR, yalnızca karşılaştırma' : ''} ═══`);
          const bugunMs = s.bugun.length ? await parcaOrtancasi(tx, 'bugün', s.bugun) : 0;
          const adayMs = s.aday ? await parcaOrtancasi(tx, 'aday ', s.aday) : undefined;
          if (bugunMs === null || adayMs === null) eksik = true;
          if (!s.anlamDegisiyor && bugunMs !== null) {
            toplamBugun += bugunMs;
            toplamAday += adayMs ?? bugunMs;
          }
          if (s.bugun.length) console.log(`  bugün : ${yaz(bugunMs)} (${s.bugun.length} sorgu, ortanca)`);
          if (adayMs !== undefined) {
            console.log(`  aday  : ${yaz(adayMs)} (ortanca)`);
            if (s.bugun.length && bugunMs !== null && adayMs !== null) {
              console.log(`  fark  : ${(bugunMs - adayMs).toFixed(1)} ms`);
            }
          }
        }
        if (eksik) {
          console.log(`\n  ! En az bir sorgu ${SORGU_SINIRI_MS / 1000} sn sınırını aştı; toplamlar EKSİK.`);
        }

        console.log('\n═══ SONUÇ (anlamı değişmeyen parçalar) ═══');
        console.log(`  bugün           : ${toplamBugun.toFixed(1)} ms`);
        console.log(`  adaylarla       : ${toplamAday.toFixed(1)} ms`);
        console.log(`  sınır           : 5000 ms (Prisma etkileşimli transaction)`);

        throw new GeriAl();
      },
      { timeout: 600_000, maxWait: 600_000 },
    )
    .catch((e: unknown) => {
      if (!(e instanceof GeriAl)) throw e;
    });

  console.log('\nBitti — hiçbir satır yazılmadı (transaction geri alındı).');
}

/**
 * Bir parçanın toplam süresi (birden çok sorgu olabilir), `TEKRAR` koşumun
 * ORTANCASI. Süre `EXPLAIN ANALYZE`dan okunuyor, duvar saatinden değil:
 * duvar saati ağ gidiş-dönüşünü ve Prisma'nın dönüşümünü de sayıyor.
 */
/**
 * `null` = zaman aşımı. Bir koşum sınırı aşarsa kalan koşumlar denenmiyor:
 * aynı sorguyu altı kez daha 30 saniye beklemek bir şey öğretmez.
 * HER KOŞUM ANINDA BASILIYOR — ilk sürüm yalnızca sonucu basıyordu ve takılı
 * gibi görünüyordu.
 */
async function parcaOrtancasi(tx: Tx, etiket: string, sorgular: string[]): Promise<number | null> {
  const olcumler: number[] = [];
  for (let i = 0; i < TEKRAR; i++) {
    let toplam = 0;
    for (const sql of sorgular) {
      const ms = await olc(tx, sql);
      if (ms === null) {
        console.log(`    ${etiket} ${i + 1}/${TEKRAR}: ZAMAN AŞIMI (> ${SORGU_SINIRI_MS / 1000} sn)`);
        return null;
      }
      toplam += ms;
    }
    olcumler.push(toplam);
    console.log(`    ${etiket} ${i + 1}/${TEKRAR}: ${toplam.toFixed(1)} ms`);
  }
  return [...olcumler].sort((a, b) => a - b)[Math.floor(olcumler.length / 2)] ?? 0;
}

/** Zaman aşımında `null`; SAVEPOINT sayesinde transaction kullanılabilir kalıyor. */
async function olc(tx: Tx, sql: string): Promise<number | null> {
  await tx.$queryRawUnsafe('SAVEPOINT olcum');
  try {
    const satirlar = (
      await tx.$queryRawUnsafe<Array<Record<string, string>>>(`EXPLAIN (ANALYZE, TIMING) ${sql}`)
    ).map((r) => String(Object.values(r)[0]));
    await tx.$queryRawUnsafe('RELEASE SAVEPOINT olcum');
    const exec = satirlar.find((l) => l.trimStart().startsWith('Execution Time:'));
    return Number(exec?.replace(/[^0-9.]/g, '') ?? 0);
  } catch (e) {
    // 57014 = query_canceled (statement_timeout). Başka bir hata YUTULMUYOR.
    if (String((e as { message?: string }).message ?? e).includes('57014') ||
        String((e as { message?: string }).message ?? e).includes('statement timeout')) {
      await tx.$queryRawUnsafe('ROLLBACK TO SAVEPOINT olcum');
      return null;
    }
    throw e;
  }
}

function yaz(ms: number | null): string {
  return ms === null ? 'ZAMAN AŞIMI' : `${ms.toFixed(1)} ms`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.$disconnect();
    await uygulama.$disconnect();
  });
