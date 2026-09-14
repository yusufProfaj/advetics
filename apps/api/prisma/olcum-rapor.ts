/**
 * ═══ RAPOR SORGULARININ PLANINI ÜRETİMDE ÖLÇ ═══
 *
 * `metrics.service.ts` içindeki `ad_account_id IN (SELECT id FROM ad_accounts
 * WHERE sync_enabled = true)` alt sorgusu ajans genel bakışındaki yavaşlığın
 * TAMAMIYDI (commit f6972fe): sekiz bin satırın her biri için `ad_accounts`
 * politikası yeniden değerlendiriliyordu. `reports.service.ts` AYNI alt
 * sorguyu yazıyor ve akla yakın olan aynı düzeltmeyi oraya da taşımak.
 *
 * AKLA YAKIN OLAN YANLIŞ OLABİLİR ve bu araç tam olarak onu ayırt etmek için
 * var. İki sorgu farklı bir soru soruyor:
 *
 *   · Panel  : 48 workspace, yüzlerce reklam hesabı, tek sorguda 8.054 satır.
 *   · Rapor  : TEK workspace, o workspace'in bir avuç hesabı.
 *
 * Ayrım plana yansıyor. Ölçerken bakılacak yer `ad_accounts` düğümündeki
 * `loops=` değeri:
 *
 *   loops ≈ satır sayısı  →  politika satır başına koşuyor, düzeltme kazandırır.
 *   loops ≈ hesap sayısı  →  Postgres `Memoize` koydu, alt sorgu zaten ucuz.
 *
 * İkinci hâlde düzeltme ZARARLI: listeyi önden çekmek, havuzdaki BÜTÜN
 * hesapları (üretimde 481) politikadan geçirmek demek ve bu sabit maliyet
 * rapor başına bir kez ödeniyor.
 *
 * ┌─ NEDEN AYRI BİR SCRIPT ───────────────────────────────────────────────┐
 * │ `olcum-metrik.ts` ile aynı gerekçe: RLS bağlamı olmadan alınan bir     │
 * │ `EXPLAIN` üretimdekinden BAŞKA bir planı gösterir, çünkü politikalar   │
 * │ sorguya yüklem ekliyor. Buradaki GUC'lar `PrismaService.withTenant`    │
 * │ ile BİREBİR aynı ve `olcum-rapor.spec.ts` ikisini karşılaştırıyor.     │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * HİÇBİR ŞEY YAZMIYOR: bütün iş tek transaction'da ve sonunda `ROLLBACK`.
 * Şema da değiştirmiyor — ayrıcalık isteyen bir teşhis aracı üretimde
 * koşulamaz (`olcum-metrik.ts`'in `--aday` bayrağı tam olarak bu yüzden
 * kaldırıldı).
 *
 * Kullanım (advetics kullanıcısı, depo kökünde):
 *   pnpm --filter @advetics/api olcum-rapor -- --eposta=kisi@ornek.com
 *
 * Seçimlik:
 *   --workspace=<uuid>  Ölçülecek workspace. Verilmezse pencerede EN ÇOK
 *                       satırı olan workspace seçiliyor — en pahalı hâl ve
 *                       ölçülmek istenen hâl.
 *   --gun=<n>           Rapor penceresi (varsayılan 30). Panelde en sık
 *                       istenen aralık bu; 90 için `--gun=90`.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { planKisalt } from './olcum-plan-kisalt';
import { raporSorgulari, SUZGEC_ALT, SUZGEC_DIZI } from './olcum-rapor-sorgular';

loadEnv({ path: resolve(__dirname, '../../../.env') });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const arg = (ad: string) =>
  ARGV.find((a) => a.startsWith(`--${ad}=`))?.slice(ad.length + 3);

const EPOSTA = arg('eposta') ?? process.env.SEED_ADMIN_EMAIL;
const WORKSPACE = arg('workspace');
const GUN = Number(arg('gun') ?? 30);

/**
 * Her sorgu kaç kez koşuyor — ORTANCA alınıyor, ortalama değil.
 *
 * Paylaşımlı VPS'te tek bir koşum komşu sitenin yükünü ölçer. Ortalama da
 * yetmiyor: tek bir kötü koşum onu yukarı çekiyor ve "düzeltme kazandırdı"
 * sonucunu uyduruyor.
 */
const TEKRAR = 7;

/*
 * İKİ İSTEMCİ VE İKİSİ DE GEREKLİ — `olcum-metrik.ts` ile aynı gerekçe.
 * Kimliği çözmek BYPASSRLS istiyor (yumurta-tavuk); ÖLÇÜM ise uygulamanın
 * kendi rolüyle yapılmak zorunda, yoksa plan politikaların yüklemini hiç
 * taşımaz.
 */
const admin = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const uygulama = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

function gun(gerideGun: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - gerideGun);
  return d.toISOString().slice(0, 10);
}

/** Transaction'ı geri almak için kullanılan iç sinyal; hata değil. */
class GeriAl extends Error {}

async function main() {
  if (!EPOSTA) {
    throw new Error('E-posta verilmedi. --eposta=... geçir ya da .env içine SEED_ADMIN_EMAIL yaz.');
  }
  if (!Number.isFinite(GUN) || GUN < 1) throw new Error(`--gun geçersiz: ${arg('gun')}`);

  const kullanici = await admin.user.findFirst({
    where: { email: { equals: EPOSTA, mode: 'insensitive' } },
    select: { id: true, orgId: true },
  });
  if (!kullanici) throw new Error(`Kullanıcı bulunamadı: ${EPOSTA}`);

  /*
   * `findFirst`, `findUnique` DEĞİL: bir kullanıcı artık BİRDEN ÇOK üst
   * hesaba üye olabiliyor (çoklu üyelik), yani `userId` tekil anahtar değil.
   * Ölçüm için ilk üyelik yeterli ama hangisi olduğu KEYFİ — bu yüzden
   * seçilen hesap kimliği aşağıda basılıyor, yoksa iki farklı kapsamda
   * alınan iki ölçüm aynı sanılır.
   */
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

  const to = gun(1);
  const from = gun(GUN);

  /*
   * ÖLÇÜLECEK WORKSPACE: PENCEREDE EN ÇOK SATIRI OLAN.
   *
   * Rastgele bir workspace seçmek, verisi olmayan birini seçip "alt sorgu
   * bedava" sonucuna götürürdü. En pahalı hâl ölçülmeli; düzeltme orada
   * kazandırmıyorsa hiçbir yerde kazandırmıyor.
   */
  let clientId = WORKSPACE;
  if (!clientId) {
    const [enBuyuk] = await admin.$queryRawUnsafe<Array<{ client_id: string; n: bigint }>>(
      `SELECT client_id, COUNT(*) AS n
         FROM insights_daily
        WHERE client_id = ANY($1::uuid[])
          AND date BETWEEN $2::date AND $3::date
        GROUP BY client_id ORDER BY n DESC LIMIT 1`,
      clientIdler,
      from,
      to,
    );
    if (!enBuyuk) throw new Error('Pencerede hiç metrik satırı yok — ölçülecek bir şey bulunamadı.');
    clientId = enBuyuk.client_id;
  }
  if (!clientIdler.includes(clientId)) {
    throw new Error(`Workspace kullanıcının kapsamında değil: ${clientId}`);
  }

  console.log('═══ KAPSAM ═══');
  console.log(`kullanıcı      : ${EPOSTA}`);
  console.log(`üst hesap      : ${ustHesap ? ustHesap.managerAccountId : 'YOK'}`);
  console.log(`workspace      : ${clientId}${WORKSPACE ? '' : ' (pencerede en çok satırı olan)'}`);
  console.log(`pencere        : ${from} → ${to} (${GUN} gün)`);

  const sorgular = raporSorgulari({ clientId, from, to });

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
         * ═══ ENVANTER ═══
         *
         * Kararın tamamı iki sayının oranına bağlı: taranan METRİK SATIRI
         * (alt sorgunun satır başına ödediği yer) ve HAVUZ BÜYÜKLÜĞÜ
         * (önden çekmenin bir kez ödediği yer). Plan okunmadan önce ikisi
         * bilinmeli, yoksa hangi sayının neyi anlattığı belirsiz kalıyor.
         */
        console.log('\n═══ ENVANTER ═══');
        const [envanter] = await tx.$queryRawUnsafe<
          Array<{ havuz: bigint; izlenen: bigint; musterinin: bigint }>
        >(
          `SELECT COUNT(*) AS havuz,
                  COUNT(*) FILTER (WHERE sync_enabled) AS izlenen,
                  COUNT(*) FILTER (WHERE sync_enabled AND client_id = $1::uuid) AS musterinin
             FROM ad_accounts`,
          clientId,
        );
        console.log(`  görülebilen reklam hesabı : ${envanter?.havuz ?? 0}`);
        console.log(`  izlemesi açık             : ${envanter?.izlenen ?? 0}  ← önden çekmenin bedeli bu sayıya bağlı`);
        console.log(`  bu workspace'in hesabı    : ${envanter?.musterinin ?? 0}  ← Memoize anahtar sayısı bu`);

        const seviyeler = await tx.$queryRawUnsafe<Array<{ entity_level: string; n: bigint; hesap: bigint }>>(
          `SELECT entity_level::text, COUNT(*) AS n, COUNT(DISTINCT ad_account_id) AS hesap
             FROM insights_daily
            WHERE client_id = $1::uuid AND date BETWEEN $2::date AND $3::date
            GROUP BY entity_level ORDER BY n DESC`,
          clientId,
          from,
          to,
        );
        console.log('  pencere içindeki metrik satırı:');
        for (const s of seviyeler) {
          console.log(`    ${s.entity_level.padEnd(14)} ${String(s.n).padStart(8)} satır · ${s.hesap} ayrı hesap`);
        }
        if (seviyeler.length === 0) console.log('    (hiç satır yok — bu workspace ölçüm için uygun değil)');

        /*
         * ═══ ÖNDEN ÇEKMENİN SABİT MALİYETİ ═══
         *
         * Düzeltme uygulanırsa rapor başına BİR KEZ ödenen şey bu ve
         * kazancın ondan BÜYÜK olması gerekiyor. Maliyet metrik satırına
         * değil HAVUZ BÜYÜKLÜĞÜNE bağlı: izlemesi açık her hesap için
         * `ad_accounts` politikası bir kez koşuyor.
         */
        console.log('\n═══ İZLENEN HESAP LİSTESİNİN KENDİ MALİYETİ (rapor başına bir kez) ═══');
        const listeSure: number[] = [];
        for (let i = 0; i < TEKRAR; i++) {
          listeSure.push((await olc(tx, 'SELECT id FROM ad_accounts WHERE sync_enabled = true')).ms);
        }
        const listeMs = ortanca(listeSure);
        console.log(`  ortanca: ${listeMs.toFixed(2)} ms`);

        const hesapIdleri = (
          await tx.$queryRawUnsafe<Array<{ id: string }>>(
            'SELECT id FROM ad_accounts WHERE sync_enabled = true',
          )
        ).map((r) => r.id);

        let toplamAlt = 0;
        let toplamDizi = 0;
        for (const s of sorgular) {
          const alt: number[] = [];
          const dizi: number[] = [];
          let altPlan: string[] = [];
          for (let i = 0; i < TEKRAR; i++) {
            const a = await olc(tx, s.sql(SUZGEC_ALT));
            const d = await olc(tx, s.sql(SUZGEC_DIZI), hesapIdleri);
            alt.push(a.ms);
            dizi.push(d.ms);
            altPlan = a.plan;
          }
          const oa = ortanca(alt);
          const od = ortanca(dizi);
          toplamAlt += oa;
          toplamDizi += od;
          console.log(`\n═══ ${s.ad} ═══`);
          console.log(
            `  alt sorgu ${oa.toFixed(2)} ms · dizi ${od.toFixed(2)} ms · fark ${(oa - od).toFixed(2)} ms`,
          );
          /*
           * KARARI VEREN SATIRLAR. `loops=` hesap sayısına yakınsa Postgres
           * `Memoize` koymuş demek ve alt sorgu zaten ucuz; satır sayısına
           * yakınsa politika satır başına koşuyor ve düzeltme kazandırır.
           */
          for (const l of altPlan) {
            if (/ad_accounts|Memoize|Cache Key|Hits:/.test(l)) console.log('    ' + planKisalt(l).trim());
          }
        }

        console.log('\n═══ SONUÇ ═══');
        console.log(`  bugünkü hâl (alt sorgu) : ${toplamAlt.toFixed(2)} ms`);
        console.log(
          `  düzeltilmiş hâl (dizi)  : ${toplamDizi.toFixed(2)} ms + ${listeMs.toFixed(2)} ms liste = ` +
            `${(toplamDizi + listeMs).toFixed(2)} ms`,
        );
        const fark = toplamAlt - (toplamDizi + listeMs);
        console.log(
          fark > 0
            ? `  → DÜZELTME ${fark.toFixed(2)} ms KAZANDIRIYOR.`
            : `  → DÜZELTME ${(-fark).toFixed(2)} ms KAYBETTİRİYOR — uygulanmamalı.`,
        );

        /*
         * TRANSACTION BİLEREK GERİ ALINIYOR. Ölçüm yalnızca SELECT yapıyor
         * ama bir ölçüm aracının "hiçbir şey yazmadığı" iddiası koda
         * yazılmalı; sonraki bakımda buraya bir UPDATE eklenirse de geri
         * alınır.
         */
        throw new GeriAl();
      },
      { timeout: 600_000, maxWait: 600_000 },
    )
    .catch((e: unknown) => {
      if (!(e instanceof GeriAl)) throw e;
    });

  console.log('\nBitti — hiçbir satır yazılmadı (transaction geri alındı).');
}

/** Prisma transaction'ının bu araçta kullanılan yüzeyi. */
interface Tx {
  $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T>;
}

/**
 * Tek bir ölçüm — süre `EXPLAIN ANALYZE` çıktısından okunuyor, duvar
 * saatinden DEĞİL.
 *
 * Duvar saati ağ gidiş-dönüşünü ve Prisma'nın satır dönüşümünü de sayıyor;
 * ikisi de sorgunun planıyla ilgisiz ve ölçülmek istenen farkın (tek haneli
 * milisaniye) üstünde gürültü üretiyor.
 */
async function olc(tx: Tx, sql: string, params: unknown[] = []): Promise<{ ms: number; plan: string[] }> {
  const satirlar = (
    await tx.$queryRawUnsafe<Array<Record<string, string>>>(
      `EXPLAIN (ANALYZE, BUFFERS, TIMING) ${sql}`,
      ...params,
    )
  ).map((r) => String(Object.values(r)[0]));
  const exec = satirlar.find((l) => l.trimStart().startsWith('Execution Time:'));
  return { ms: Number(exec?.replace(/[^0-9.]/g, '') ?? 0), plan: satirlar };
}

function ortanca(a: number[]): number {
  return [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
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
