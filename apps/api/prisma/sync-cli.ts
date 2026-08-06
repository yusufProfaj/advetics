/**
 * Senkronizasyon ops aracı — hesapları listeler, açar ve elle iş tetikler.
 *
 * NEDEN GEREKLİ: zamanlanmış işler `structure` için 6 saatte bir çalışıyor.
 * Yeni bir hesabı bağladıktan sonra veya bir düzeltmeyi doğrularken o kadar
 * beklemek anlamsız. Panelde "şimdi yenile" butonu Modül 3'ün UI kısmında
 * gelecek; o zamana kadar tetikleyici bu.
 *
 * Kuyruğa iş koyar, ÇALIŞTIRMAZ. İşi worker süreci alıyor — böylece kota
 * bekçisi, retry ve devre kesici normal yolundan geçiyor. Script'in kendi
 * içinde senkronizasyon koşturmak bu korumaları atlamak olurdu.
 *
 * Kullanım:
 *   pnpm --filter @advetics/api sync -- list
 *   pnpm --filter @advetics/api sync -- enable --account <uuid>
 *   pnpm --filter @advetics/api sync -- disable --account <uuid>
 *   pnpm --filter @advetics/api sync -- run --account <uuid>
 *   pnpm --filter @advetics/api sync -- jobs
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

loadEnv({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

/**
 * Argümanlar — çıplak `--` ayıklanmış.
 *
 * pnpm 9, `pnpm ... sync -- list` çağrısında `--`'yı GERÇEK bir argüman olarak
 * geçiriyor: script `["--", "list"]` alıyor. Konumsal komutu argv[2]'den
 * okumak bu yüzden `--` buluyor ve her komut yardım ekranına düşüyordu.
 */
const ARGV = process.argv.slice(2).filter((a) => a !== '--');

function arg(name: string): string | undefined {
  const i = ARGV.indexOf(`--${name}`);
  return i !== -1 ? ARGV[i + 1] : undefined;
}

const COMMAND = ARGV[0];
const REDIS_URL = process.env.REDIS_URL;
const REDIS_DB = Number(process.env.REDIS_DB ?? 3);
const PREFIX = process.env.REDIS_KEY_PREFIX ?? 'advetics';

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/** Micros → okunabilir para. Bütçeleri gözle doğrulamak için. */
function money(micros: bigint | null, currency: string): string {
  if (micros === null) return '—';
  const value = Number(micros) / 1_000_000;
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency}`;
}

async function listAccounts(): Promise<void> {
  const accounts = await prisma.adAccount.findMany({
    select: {
      id: true,
      platform: true,
      externalId: true,
      name: true,
      currency: true,
      timezone: true,
      status: true,
      syncEnabled: true,
      managerExternalId: true,
      lastStructureSyncAt: true,
      client: { select: { name: true } },
      connection: { select: { status: true } },
      _count: { select: { campaigns: true } },
    },
    orderBy: [{ platform: 'asc' }, { name: 'asc' }],
  });

  if (accounts.length === 0) {
    console.log('\nHiç reklam hesabı yok. Panelden bir platform bağlaman gerekiyor.\n');
    return;
  }

  console.log(`\n${accounts.length} reklam hesabı:\n`);
  for (const a of accounts) {
    const flag = a.syncEnabled ? '\x1b[32m●\x1b[0m açık ' : '\x1b[90m○\x1b[0m kapalı';
    console.log(`  ${flag}  ${a.platform.padEnd(6)}  ${a.name}`);
    console.log(`           id: ${a.id}`);
    console.log(
      `           dış kimlik: ${a.externalId}${
        a.managerExternalId ? `  ·  MCC: ${a.managerExternalId}` : ''
      }`,
    );
    console.log(
      `           müşteri: ${a.client.name}  ·  ${a.currency}  ·  ${a.timezone}  ·  durum: ${a.status}`,
    );
    console.log(
      `           bağlantı: ${a.connection.status}  ·  kampanya: ${a._count.campaigns}  ·  son yapı sync: ${
        a.lastStructureSyncAt?.toISOString() ?? 'hiç'
      }`,
    );
    console.log('');
  }

  const off = accounts.filter((a) => !a.syncEnabled).length;
  if (off > 0) {
    console.log(
      `  ${off} hesap KAPALI. Bağlantı kurulduğunda hesaplar kasıtlı olarak kapalı\n` +
        '  geliyor — 40 hesaplı bir Business Manager\'ı bağlayan biri istemeden\n' +
        '  40 hesabın kotasını yakmasın diye.\n',
    );
    console.log(`  Açmak için:\n    pnpm --filter @advetics/api sync -- enable --account <id>\n`);
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  const id = arg('account') ?? die('--account <uuid> zorunlu. Kimlikleri görmek için: sync -- list');

  const account = await prisma.adAccount.findUnique({
    where: { id },
    select: { id: true, name: true, platform: true, syncEnabled: true, connection: { select: { status: true } } },
  });
  if (!account) die(`Hesap bulunamadı: ${id}`);

  if (enabled && account.connection.status !== 'active') {
    die(
      `Bağlantı durumu "${account.connection.status}" — senkronizasyon çalışmaz.\n` +
        '  Panelden yeniden bağlanman gerekiyor.',
    );
  }

  if (account.syncEnabled === enabled) {
    console.log(`\n${account.name} zaten ${enabled ? 'açık' : 'kapalı'}.\n`);
    return;
  }

  await prisma.adAccount.update({ where: { id }, data: { syncEnabled: enabled } });
  console.log(`\n✓ ${account.name} (${account.platform}) → ${enabled ? 'AÇIK' : 'KAPALI'}\n`);
  if (enabled) {
    console.log(`  Hemen tetiklemek için:\n    pnpm --filter @advetics/api sync -- run --account ${id}\n`);
  }
}

async function runStructure(): Promise<void> {
  const id = arg('account') ?? die('--account <uuid> zorunlu.');
  if (!REDIS_URL) die('REDIS_URL tanımlı değil — kuyruğa iş konulamaz.');

  const account = await prisma.adAccount.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      platform: true,
      name: true,
      externalId: true,
      syncEnabled: true,
      connection: { select: { status: true } },
    },
  });
  if (!account) die(`Hesap bulunamadı: ${id}`);
  if (!account.syncEnabled) {
    die(`Hesap KAPALI. Önce aç:\n    pnpm --filter @advetics/api sync -- enable --account ${id}`);
  }
  if (account.connection.status !== 'active') {
    die(`Bağlantı durumu "${account.connection.status}" — yeniden bağlanmak gerekiyor.`);
  }

  // sync_jobs kaydı ÖNCE, kuyruk SONRA — worker işi kayıt oluşmadan alırsa
  // syncJobId'yi bulamaz.
  const record = await prisma.syncJob.create({
    data: {
      clientId: account.clientId,
      adAccountId: account.id,
      jobType: 'structure',
      status: 'queued',
      priority: 1,
      queueJobId: null,
    },
    select: { id: true },
  });

  const connection = new Redis(REDIS_URL, { db: REDIS_DB, maxRetriesPerRequest: null });
  const queue = new Queue('sync', { connection, prefix: PREFIX });

  // jobId'ye zaman damgası koyuyoruz: aynı hesap için tamamlanmış bir işin
  // kimliğini yeniden kullanmak BullMQ tarafında sessizce yok sayılabiliyor.
  const jobId = `manual:structure:${account.id}:${record.id}`;
  await queue.add(
    'structure',
    {
      syncJobId: record.id.toString(),
      clientId: account.clientId,
      platform: account.platform,
      jobType: 'structure',
      adAccountId: account.id,
      // interactive: worker'a TAM TARAMA yaptırıyor. Elle tetikleyen biri
      // silinmiş kampanyaların da kaybolmasını bekliyor; delta bunu yapamaz.
      interactive: true,
    },
    { jobId, priority: 1 },
  );

  console.log(`\n▸ İş kuyruğa eklendi`);
  console.log(`  hesap:   ${account.name} (${account.platform} ${account.externalId})`);
  console.log(`  iş no:   ${record.id}`);
  console.log(`  mod:     tam tarama\n`);

  // Sonucu bekle. Worker ayrı süreçte çalışıyor; tabloyu yoklayarak izliyoruz.
  const deadline = Date.now() + 180_000;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const job = await prisma.syncJob.findUnique({
      where: { id: record.id },
      select: {
        status: true,
        rowsUpserted: true,
        apiCallsUsed: true,
        errorCode: true,
        errorMessage: true,
        attempts: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    if (!job) break;

    if (job.status !== lastStatus) {
      console.log(`  durum: ${job.status}${job.attempts > 1 ? ` (deneme ${job.attempts})` : ''}`);
      lastStatus = job.status;
    }

    if (job.status === 'succeeded') {
      const elapsed =
        job.finishedAt && job.startedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : 0;
      console.log(`\n\x1b[32m✓ Tamamlandı\x1b[0m — ${job.rowsUpserted} satır, ${job.apiCallsUsed} API çağrısı, ${elapsed}ms\n`);
      await printHierarchy(account.id);
      break;
    }
    if (job.status === 'failed') {
      console.error(`\n\x1b[31m✗ Başarısız\x1b[0m — ${job.errorCode}\n  ${job.errorMessage}\n`);
      console.error(`  Worker log'u:  pm2 logs advetics-worker --lines 40 --nostream\n`);
      break;
    }
    if (job.status === 'throttled') {
      console.log(`  kota nedeniyle beklemede: ${job.errorCode} — worker tekrar deneyecek`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  if (Date.now() >= deadline) {
    console.error(
      '\n! 180 saniyede sonuçlanmadı. Worker çalışıyor mu?\n' +
        '    pm2 list\n    pm2 logs advetics-worker --lines 40 --nostream\n',
    );
  }

  await queue.close();
  await connection.quit().catch(() => connection.disconnect());
}

/** Senkronizasyon sonrası yazılanları göster — gözle doğrulama için. */
async function printHierarchy(adAccountId: string): Promise<void> {
  const account = await prisma.adAccount.findUniqueOrThrow({
    where: { id: adAccountId },
    select: { currency: true },
  });

  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId },
    select: {
      id: true,
      externalId: true,
      name: true,
      status: true,
      effectiveStatus: true,
      objective: true,
      budgetMode: true,
      budgetAmountMicros: true,
      deletedAt: true,
      _count: { select: { adGroups: true } },
    },
    orderBy: { name: 'asc' },
    take: 25,
  });

  const [groupCount, adCount, creativeCount] = await Promise.all([
    prisma.adGroup.count({ where: { adAccountId } }),
    prisma.ad.count({ where: { adAccountId } }),
    prisma.creative.count({ where: { adAccountId } }),
  ]);

  console.log(
    `  Veritabanı: ${campaigns.length} kampanya (ilk 25), ${groupCount} ad group, ${adCount} reklam, ${creativeCount} creative\n`,
  );

  for (const c of campaigns) {
    const del = c.deletedAt ? ' \x1b[90m[silinmiş]\x1b[0m' : '';
    console.log(`  · ${c.name}${del}`);
    console.log(
      `      ${c.status}${c.effectiveStatus && c.effectiveStatus !== c.status ? ` (${c.effectiveStatus})` : ''}` +
        `  ·  ${c.objective ?? 'amaç yok'}  ·  bütçe: ${c.budgetMode} ${money(c.budgetAmountMicros, account.currency)}` +
        `  ·  ${c._count.adGroups} ad group`,
    );
  }
  console.log('');
}

async function listJobs(): Promise<void> {
  const jobs = await prisma.syncJob.findMany({
    select: {
      id: true,
      jobType: true,
      status: true,
      rowsUpserted: true,
      apiCallsUsed: true,
      attempts: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      finishedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (jobs.length === 0) {
    console.log('\nHiç senkronizasyon işi yok.\n');
    return;
  }

  console.log(`\nSon ${jobs.length} iş:\n`);
  for (const j of jobs) {
    const color =
      j.status === 'succeeded' ? '\x1b[32m' : j.status === 'failed' ? '\x1b[31m' : '\x1b[33m';
    console.log(
      `  ${j.createdAt.toISOString().slice(0, 19)}  ${color}${j.status.padEnd(9)}\x1b[0m` +
        `  ${j.jobType.padEnd(18)}  satır: ${String(j.rowsUpserted).padStart(5)}  çağrı: ${String(j.apiCallsUsed).padStart(3)}` +
        `  deneme: ${j.attempts}`,
    );
    if (j.errorCode) console.log(`      \x1b[90m${j.errorCode}: ${j.errorMessage ?? ''}\x1b[0m`);
  }
  console.log('');
}

async function main(): Promise<void> {
  switch (COMMAND) {
    case 'list':
      await listAccounts();
      break;
    case 'enable':
      await setEnabled(true);
      break;
    case 'disable':
      await setEnabled(false);
      break;
    case 'run':
      await runStructure();
      break;
    case 'jobs':
      await listJobs();
      break;
    default:
      console.log(`
Senkronizasyon ops aracı

  sync -- list                        reklam hesaplarını ve sync durumunu listeler
  sync -- enable  --account <uuid>    hesabı senkronizasyona açar
  sync -- disable --account <uuid>    hesabı kapatır
  sync -- run     --account <uuid>    yapı senkronizasyonunu ŞİMDİ tetikler (tam tarama)
  sync -- jobs                        son 20 senkronizasyon işini gösterir

Örnek:
  pnpm --filter @advetics/api sync -- list
  pnpm --filter @advetics/api sync -- enable --account 1234abcd-...
  pnpm --filter @advetics/api sync -- run --account 1234abcd-...

pnpm'in \`--\` aktarımıyla uğraşmadan, doğrudan:
  cd apps/api && pnpm exec tsx prisma/sync-cli.ts list
`);
  }
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
