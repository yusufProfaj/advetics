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
import { Prisma, PrismaClient } from '@prisma/client';
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

/** YYYY-MM-DD, UTC. Tarihler string taşınıyor — bkz. queues.ts saat dilimi notu. */
function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function runJob(jobType: 'structure' | 'insights_realtime' | 'insights_daily' | 'insights_backfill'): Promise<void> {
  const id = arg('account') ?? die('--account <uuid> zorunlu.');
  if (!REDIS_URL) die('REDIS_URL tanımlı değil — kuyruğa iş konulamaz.');

  // Metrik işleri tarih ZORUNLU. Varsayılan: realtime bugün, daily dün.
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  if (jobType !== 'structure') {
    dateFrom = arg('from') ?? (jobType === 'insights_realtime' ? isoDate(0) : isoDate(-1));
    dateTo = arg('to') ?? dateFrom;
    for (const d of [dateFrom, dateTo]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) die(`Geçersiz tarih: ${d} (YYYY-MM-DD bekleniyor)`);
    }
    if (dateFrom > dateTo) die(`--from (${dateFrom}) --to (${dateTo}) tarihinden sonra olamaz.`);
  }

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
      jobType,
      status: 'queued',
      priority: 1,
      queueJobId: null,
      dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00Z`) : null,
      dateTo: dateTo ? new Date(`${dateTo}T00:00:00Z`) : null,
    },
    select: { id: true },
  });

  const connection = new Redis(REDIS_URL, { db: REDIS_DB, maxRetriesPerRequest: null });
  const queue = new Queue('sync', { connection, prefix: PREFIX });

  // Ayırıcı `:` DEĞİL: BullMQ özel iş kimliğinde `:` yasaklıyor (bkz. queues.ts).
  // İş numarasını kimliğe katıyoruz — tamamlanmış bir işin kimliğini yeniden
  // kullanmak BullMQ tarafında sessizce yok sayılabiliyor.
  const jobId = `manual__${jobType}__${account.id}__${record.id}`;
  // Kuyruğa ekleme başarısız olursa tablo kaydını öksüz bırakma: satır
  // sonsuza kadar `queued` kalır, hiçbir worker almaz ve `sync -- jobs`
  // çıktısında hiç sonuçlanmayan bir iş olarak durur.
  try {
    await queue.add(
      jobType,
      {
        syncJobId: record.id.toString(),
        clientId: account.clientId,
        platform: account.platform,
        jobType,
        adAccountId: account.id,
        dateFrom,
        dateTo,
        // interactive: yapı işinde worker'a TAM TARAMA yaptırıyor. Elle
        // tetikleyen biri silinmiş kampanyaların da kaybolmasını bekliyor;
        // delta bunu yapamaz.
        interactive: true,
      },
      { jobId, priority: 1 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncJob.update({
      where: { id: record.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorCode: 'enqueue_failed',
        errorMessage: message.slice(0, 1000),
      },
    });
    await queue.close();
    await connection.quit().catch(() => connection.disconnect());
    die(`İş kuyruğa eklenemedi: ${message}`);
  }

  console.log(`\n▸ İş kuyruğa eklendi`);
  console.log(`  hesap:   ${account.name} (${account.platform} ${account.externalId})`);
  console.log(`  iş:      ${jobType}`);
  console.log(`  iş no:   ${record.id}`);
  console.log(
    `  mod:     ${jobType === 'structure' ? 'tam tarama' : `${dateFrom}${dateFrom === dateTo ? '' : ` .. ${dateTo}`}`}\n`,
  );

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
      if (jobType === 'structure') await printHierarchy(account.id);
      else await printMetrics(account.id, dateFrom!, dateTo!);
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

/**
 * Senkronize edilen veriyi derinlemesine gösterir.
 *
 * NEDEN GEREKLİ: `run` çıktısı kampanya seviyesinde özet veriyor ve ilk gerçek
 * senkronizasyonda tüm kampanyalar `bütçe: none` göründü. Bu ya ABO (bütçe ad
 * set seviyesinde) demek ya da bütçe ayrıştırmamızın bozuk olduğu anlamına
 * geliyor — ikisini ayırt etmeden Modül 5'in kural motoruna geçilemez, çünkü
 * kural motorunun değiştireceği şey tam olarak bu alan.
 */
async function inspect(): Promise<void> {
  const id = arg('account') ?? die('--account <uuid> zorunlu.');
  const account = await prisma.adAccount.findUnique({
    where: { id },
    select: { id: true, name: true, currency: true, platform: true },
  });
  if (!account) die(`Hesap bulunamadı: ${id}`);

  // Bütçe hangi seviyede? Boş/dolu sayıları sorunun cevabı.
  const [campTotal, campWithBudget, groupTotal, groupWithBudget, groupWithBid] = await Promise.all([
    prisma.campaign.count({ where: { adAccountId: id } }),
    prisma.campaign.count({ where: { adAccountId: id, budgetAmountMicros: { not: null } } }),
    prisma.adGroup.count({ where: { adAccountId: id } }),
    prisma.adGroup.count({ where: { adAccountId: id, budgetAmountMicros: { not: null } } }),
    prisma.adGroup.count({ where: { adAccountId: id, bidAmountMicros: { not: null } } }),
  ]);

  console.log(`\n${account.name} (${account.platform}, ${account.currency})\n`);
  console.log('  BÜTÇE DAĞILIMI');
  console.log(`    kampanya:  ${campWithBudget}/${campTotal} bütçeli`);
  console.log(`    ad group:  ${groupWithBudget}/${groupTotal} bütçeli · ${groupWithBid}/${groupTotal} teklifli`);
  if (campWithBudget === 0 && groupWithBudget === 0) {
    console.log(
      '\n    ! HİÇBİR SEVİYEDE BÜTÇE YOK. Bu beklenmeyen bir durum: her aktif\n' +
        '      Meta kampanyasının ya kendi bütçesi (CBO) ya da ad set bütçesi\n' +
        '      (ABO) olmak zorunda. Ayrıştırma hatası olabilir — aşağıdaki ham\n' +
        '      alanlara bak.',
    );
  } else if (campWithBudget === 0) {
    console.log('\n    → ABO: bütçe ad set seviyesinde. Normal.');
  }

  const groups = await prisma.adGroup.findMany({
    where: { adAccountId: id },
    select: {
      name: true,
      status: true,
      budgetMode: true,
      budgetAmountMicros: true,
      bidAmountMicros: true,
      optimizationGoal: true,
      raw: true,
      campaign: { select: { name: true } },
      _count: { select: { ads: true } },
    },
    orderBy: { name: 'asc' },
    take: 12,
  });

  console.log(`\n  AD GROUP'LAR (ilk ${groups.length})\n`);
  for (const g of groups) {
    console.log(`  · ${g.name}   \x1b[90m← ${g.campaign.name}\x1b[0m`);
    console.log(
      `      ${g.status}  ·  bütçe: ${g.budgetMode} ${money(g.budgetAmountMicros, account.currency)}` +
        `  ·  teklif: ${money(g.bidAmountMicros, account.currency)}` +
        `  ·  ${g.optimizationGoal ?? 'hedef yok'}  ·  ${g._count.ads} reklam`,
    );
    // HAM ALANLAR: ayrıştırma hatasını yalnızca bunlar kanıtlar. Platformun
    // gönderdiği değeri bizim okuduğumuzla yan yana görmek gerekiyor.
    const raw = (g.raw ?? {}) as Record<string, unknown>;
    const rawBudget = {
      daily_budget: raw.daily_budget,
      lifetime_budget: raw.lifetime_budget,
      bid_amount: raw.bid_amount,
    };
    if (Object.values(rawBudget).some((v) => v !== undefined)) {
      console.log(`      \x1b[90mham: ${JSON.stringify(rawBudget)}\x1b[0m`);
    }
  }

  const creatives = await prisma.creative.findMany({
    where: { adAccountId: id },
    select: {
      externalId: true,
      creativeType: true,
      headline: true,
      primaryText: true,
      ctaType: true,
      destinationUrl: true,
      displayUrl: true,
      assetUrls: true,
      raw: true,
      ads: { select: { adGroup: { select: { campaign: { select: { name: true } } } } }, take: 1 },
    },
    take: 6,
  });

  // Creative tipi dağılımı ve URL kapsaması: "hedef URL yok" ne zaman DOĞRU
  // (lead formu, WhatsApp) ne zaman EKSİK (trafik kampanyası) — ayırt etmek
  // için tip bazında bakmak gerekiyor.
  const byType = await prisma.creative.groupBy({
    by: ['creativeType'],
    where: { adAccountId: id },
    _count: true,
  });
  console.log('\n  CREATIVE TİPİ DAĞILIMI');
  for (const t of byType) {
    const withUrl = await prisma.creative.count({
      where: { adAccountId: id, creativeType: t.creativeType, destinationUrl: { not: null } },
    });
    const withCta = await prisma.creative.count({
      where: { adAccountId: id, creativeType: t.creativeType, ctaType: { not: null } },
    });
    const withDisplay = await prisma.creative.count({
      where: { adAccountId: id, creativeType: t.creativeType, displayUrl: { not: null } },
    });
    console.log(
      `    ${t.creativeType ?? '(tip yok)'}: ${t._count} · hedef URL ${withUrl}/${t._count}` +
        ` · görünen URL ${withDisplay}/${t._count} · CTA ${withCta}/${t._count}`,
    );
  }

  console.log(`\n  CREATIVE'LER (ilk ${creatives.length})\n`);
  const emptyText = await prisma.creative.count({
    where: { adAccountId: id, headline: null, primaryText: null },
  });
  const totalCreatives = await prisma.creative.count({ where: { adAccountId: id } });
  if (emptyText > 0) {
    console.log(
      `    ! ${emptyText}/${totalCreatives} creative'de hem başlık hem metin BOŞ.\n` +
        '      Meta creative metnini üç ayrı şekilde taşıyor (düz alanlar,\n' +
        '      object_story_spec, asset_feed_spec); biri kaçırılmış olabilir.\n',
    );
  }
  for (const c of creatives) {
    const campaign = c.ads[0]?.adGroup.campaign.name ?? '?';
    console.log(`  · [${c.creativeType ?? 'tip yok'}] ${c.headline ?? '\x1b[90m(başlık yok)\x1b[0m'}   \x1b[90m← ${campaign}\x1b[0m`);
    console.log(
      `      metin: ${c.primaryText ? `${c.primaryText.replace(/\s+/g, ' ').slice(0, 70)}${c.primaryText.length > 70 ? '…' : ''}` : '\x1b[90myok\x1b[0m'}`,
    );
    console.log(
      `      CTA: ${c.ctaType ?? '—'}  ·  hedef: ${c.destinationUrl?.slice(0, 60) ?? '—'}` +
        `  ·  görünen: ${c.displayUrl?.slice(0, 40) ?? '—'}` +
        `  ·  görsel: ${Array.isArray(c.assetUrls) ? c.assetUrls.length : 0}`,
    );

    // HAM ALANLAR — hedef URL'in gerçekten yok mu, yoksa okumadığımız bir
    // yerde mi durduğunu yalnızca bu gösterir. Bütçe sorusunu çözen yöntem.
    const raw = (c.raw ?? {}) as Record<string, unknown>;
    const linkFields: Record<string, unknown> = {};
    for (const k of [
      'object_type',
      'link_url',
      'call_to_action_type',
      'object_story_id',
      'effective_object_story_id',
      'link_destination_display_url',
      'url_tags',
    ]) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') linkFields[k] = raw[k];
    }
    // Hangi yapılar GELDİ, hangileri gelmedi — Meta üç ayrı şekilde taşıyor.
    const shapes = [
      raw.object_story_spec ? 'object_story_spec✓' : 'object_story_spec✗',
      raw.asset_feed_spec ? 'asset_feed_spec✓' : 'asset_feed_spec✗',
    ].join(' ');
    console.log(`      \x1b[90mham: ${JSON.stringify(linkFields)}\x1b[0m`);
    console.log(`      \x1b[90m     ${shapes}\x1b[0m`);
    // object_story_spec varsa içindeki link_data'ya bak: URL orada olmalı.
    const story = raw.object_story_spec as Record<string, unknown> | undefined;
    if (story) {
      const linkData = story.link_data as Record<string, unknown> | undefined;
      console.log(
        `      \x1b[90m     object_story_spec anahtarları: ${Object.keys(story).join(', ')}` +
          `${linkData ? ` · link_data: ${Object.keys(linkData).join(', ')}` : ''}\x1b[0m`,
      );
    }
  }

  // Reklam inceleme durumu — Modül 4 bunu gösterecek.
  const review = await prisma.ad.groupBy({
    by: ['reviewStatus'],
    where: { adAccountId: id },
    _count: true,
  });
  console.log(`\n  REKLAM İNCELEME DURUMU`);
  for (const r of review) {
    // NULL = inceleme ile ilgili bir durum bildirilmemiş, yani reklam normal
    // akışta. "Reddedildi" ile "bilgi yok" arasındaki fark önemli.
    console.log(`    ${r.reviewStatus ?? 'inceleme bilgisi yok (normal)'}: ${r._count}`);
  }

  // Json kolonunda NULL sorgusu: Prisma `null` kabul etmiyor, `Prisma.DbNull`
  // (SQL NULL) ile `Prisma.JsonNull` (JSON `null` değeri) ayrımını zorunlu
  // kılıyor. Bize gereken SQL NULL.
  const disapproved = await prisma.ad.count({
    where: { adAccountId: id, disapprovalReasons: { not: Prisma.DbNull } },
  });
  if (disapproved > 0) {
    console.log(`    ! ${disapproved} reklamda inceleme geri bildirimi var (ad_review_feedback)`);
  }
  console.log('');
}

/**
 * Yazılan metrikleri türetilmiş oranlarla gösterir.
 *
 * CPA / ROAS / CTR KAYDEDİLMİYOR, sorgu anında hesaplanıyor. Saklamak, bölen
 * değiştiğinde (geri düzeltme dönüşümleri yukarı çektiğinde) bayat bir değer
 * bırakır ve iki kaynak arasında tutarsızlık üretir.
 */
async function printMetrics(adAccountId: string, dateFrom: string, dateTo: string): Promise<void> {
  const rows = await prisma.$queryRaw<
    Array<{
      entity_level: string;
      name: string | null;
      parent: string | null;
      date: Date;
      impressions: number;
      clicks: number;
      spend_micros: bigint;
      conversions: string;
      conversion_value_micros: bigint;
      currency: string;
    }>
  >`
    SELECT i.entity_level::text, i.date, i.impressions, i.clicks, i.spend_micros,
           i.conversions::text, i.conversion_value_micros, i.currency,
           COALESCE(c.name, g.name, a.name, 'Hesap') AS name,
           -- Reklam adları ad set'ler arasında TEKRAR EDİYOR (aynı creative
           -- birden fazla sette kullanılıyor). Üst varlık olmadan çıktıda
           -- hangi satırın hangisi olduğu ayırt edilemiyor.
           COALESCE(ag.name, gc.name) AS parent
    FROM insights_daily i
    LEFT JOIN campaigns c ON i.entity_level = 'campaign' AND c.id = i.entity_id
    LEFT JOIN ad_groups g ON i.entity_level = 'ad_group' AND g.id = i.entity_id
    LEFT JOIN ads a       ON i.entity_level = 'ad'       AND a.id = i.entity_id
    LEFT JOIN ad_groups ag ON i.entity_level = 'ad' AND ag.id = a.ad_group_id
    LEFT JOIN campaigns gc ON i.entity_level = 'ad_group' AND gc.id = g.campaign_id
    WHERE i.ad_account_id = ${adAccountId}::uuid
      AND i.date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    ORDER BY i.entity_level, i.date DESC, i.spend_micros DESC
    LIMIT 40
  `;

  if (rows.length === 0) {
    console.log('  Bu aralıkta metrik satırı yok.\n');
    console.log('  Bu beklenebilir: harcaması olmayan günlerde platform satır döndürmüyor.\n');
    return;
  }

  const byLevel = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byLevel.get(r.entity_level) ?? [];
    list.push(r);
    byLevel.set(r.entity_level, list);
  }

  for (const [level, list] of byLevel) {
    console.log(`  ${level.toUpperCase()}\n`);
    for (const r of list) {
      const spend = Number(r.spend_micros) / 1_000_000;
      const conv = Number(r.conversions);
      const value = Number(r.conversion_value_micros) / 1_000_000;
      const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
      const cpa = conv > 0 ? spend / conv : null;
      // ROAS yalnızca DEĞER varsa anlamlı.
      //
      // `value === 0` iki farklı şey olabiliyor: gelir takip edilmiyor (lead
      // formu, WhatsApp — bu hesabın tamamı böyle) ya da gerçekten sıfır
      // getiri. Ayırt edemiyoruz, ama "0.00×" göstermek ikinci anlamı
      // dayatıyor ve müşteriye kampanyanın battığını söylüyor. "—" ise
      // "bu metrik burada geçerli değil" diyor — dürüst olan bu.
      const roas = spend > 0 && value > 0 ? value / spend : null;
      const day = r.date.toISOString().slice(0, 10);

      console.log(
        `  · ${day}  ${r.name ?? '?'}${r.parent ? `   \x1b[90m← ${r.parent}\x1b[0m` : ''}`,
      );
      console.log(
        `      ${r.impressions.toLocaleString('tr-TR')} gösterim  ·  ${r.clicks} tık  ·  ` +
          `CTR ${ctr.toFixed(2)}%  ·  harcama ${spend.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${r.currency}`,
      );
      console.log(
        `      ${conv} dönüşüm  ·  CPA ${cpa === null ? '—' : `${cpa.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${r.currency}`}` +
          `  ·  değer ${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${r.currency}` +
          `  ·  ROAS ${roas === null ? '—' : `${roas.toFixed(2)}×`}`,
      );
    }
    console.log('');
  }
}

/**
 * Ham Meta aksiyon türlerini döker.
 *
 * NEDEN GEREKLİ: "dönüşüm" tanımı bir KARAR ve Meta aynı olayı birden fazla
 * aksiyon türü altında raporlayabiliyor (`lead`, `leadgen_grouped`,
 * `onsite_conversion.lead_grouped` çoğu zaman AYNI lead'i anlatıyor). Hangi
 * türlerin gerçekten geldiğini ve değerlerinin nasıl örtüştüğünü görmeden
 * kova tanımı yapmak tahmin olur — ve tahmin, müşteriye çift sayılmış dönüşüm
 * raporlamakla sonuçlanır.
 */
async function dumpActions(): Promise<void> {
  const id = arg('account') ?? die('--account <uuid> zorunlu.');
  const from = arg('from') ?? isoDate(-7);
  const to = arg('to') ?? isoDate(-1);

  const rows = await prisma.$queryRaw<
    Array<{ action_type: string; total: string; days: number; entities: number }>
  >`
    SELECT act->>'action_type' AS action_type,
           SUM(COALESCE((act->>'value')::numeric, 0))::text AS total,
           COUNT(DISTINCT i.date)::int AS days,
           COUNT(DISTINCT i.entity_id)::int AS entities
    FROM insights_daily i
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(i.raw_metrics -> 'actions') = 'array'
           THEN i.raw_metrics -> 'actions' ELSE '[]'::jsonb END
    ) AS act
    WHERE i.ad_account_id = ${id}::uuid
      AND i.entity_level = 'campaign'
      AND i.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY act->>'action_type'
    ORDER BY SUM(COALESCE((act->>'value')::numeric, 0)) DESC
  `;

  if (rows.length === 0) {
    console.log('\nBu aralıkta aksiyon verisi yok.\n');
    return;
  }

  console.log(`\n${from} .. ${to} · kampanya seviyesi ham aksiyon türleri\n`);
  console.log('  DEĞER      GÜN  VARLIK  AKSİYON TÜRÜ');
  for (const r of rows) {
    const value = Number(r.total).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    console.log(
      `  ${value.padStart(9)}  ${String(r.days).padStart(3)}  ${String(r.entities).padStart(6)}  ${r.action_type}`,
    );
  }

  // Örtüşme şüphesi: lead ve mesaj aileleri.
  const value = (type: string) => Number(rows.find((r) => r.action_type === type)?.total ?? 0);
  const lead = value('lead');
  const onsiteLead = value('onsite_conversion.lead_grouped');
  const pixelLead = value('offsite_conversion.fb_pixel_lead');
  const groupedLead = value('leadgen_grouped');

  console.log('\n  ÖRTÜŞME KONTROLÜ');
  console.log(`    lead                            ${lead}`);
  console.log(`    onsite_conversion.lead_grouped  ${onsiteLead}`);
  console.log(`    offsite_conversion.fb_pixel_lead ${pixelLead}`);
  console.log(`    leadgen_grouped                 ${groupedLead}`);
  if (lead > 0 && Math.abs(lead - (onsiteLead + pixelLead)) < 0.51) {
    console.log(
      '\n    → `lead` = onsite + offsite. Üçünü TOPLAMAK çift sayım.\n' +
        '      Kova tanımı yalnızca `lead` kullanmalı.',
    );
  } else if (lead > 0 && onsiteLead > 0) {
    console.log('\n    → `lead` ve onsite ikisi de dolu; örtüşme el ile doğrulanmalı.');
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

  // Uzun süredir `queued` duran işler öksüz kalmış olabilir: kayıt oluşmuş
  // ama kuyruğa ekleme başarısız olmuş. Yeni kodda bu `enqueue_failed` olarak
  // işaretleniyor; eski satırlar için uyarı veriyoruz.
  const stale = jobs.filter(
    (j) => j.status === 'queued' && Date.now() - j.createdAt.getTime() > 600_000,
  );
  if (stale.length > 0) {
    console.log(
      `  ! ${stale.length} iş 10 dakikadan uzun süredir "queued": ${stale.map((j) => j.id).join(', ')}\n` +
        '    Worker çalışmıyor olabilir ya da kuyruğa ekleme başarısız olmuş.\n' +
        '    Kontrol:  pm2 logs advetics-worker --lines 40 --nostream\n',
    );
  }
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
      await runJob('structure');
      break;
    case 'insights':
      await runJob('insights_daily');
      break;
    case 'realtime':
      await runJob('insights_realtime');
      break;
    case 'backfill':
      await runJob('insights_backfill');
      break;
    case 'inspect':
      await inspect();
      break;
    case 'actions':
      await dumpActions();
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
  sync -- run      --account <uuid>   yapı senkronizasyonunu ŞİMDİ tetikler (tam tarama)
  sync -- insights --account <uuid>   dünün metriklerini çeker (--from/--to ile aralık)
  sync -- realtime --account <uuid>   bugünün metriklerini çeker (hesap + kampanya)
  sync -- backfill --account <uuid>   geri düzeltme (--from/--to zorunlu değil, varsayılan dün)
  sync -- inspect --account <uuid>    senkronize edilen veriyi ham alanlarla inceler
  sync -- actions --account <uuid>    ham Meta aksiyon türlerini ve değerlerini döker
  sync -- jobs                        son 20 senkronizasyon işini gösterir

Örnek:
  pnpm --filter @advetics/api sync -- list
  pnpm --filter @advetics/api sync -- enable --account 1234abcd-...
  pnpm --filter @advetics/api sync -- run --account 1234abcd-...
  pnpm --filter @advetics/api sync -- insights --account 1234abcd-... --from 2026-08-01 --to 2026-08-05

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
