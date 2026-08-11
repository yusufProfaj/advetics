/**
 * Google Ads canlı bağlantı tanısı — ADIM ADIM.
 *
 * NEDEN AYRI BİR ARAÇ: Google tarafı bugüne kadar canlı API'ye hiç çıkmadı.
 * İlk çalıştırmada bir şey kırılacak ve tam senkronizasyon içinde hangi
 * adımda kırıldığını görmek çok zor — `structure` işi altı ayrı çağrı yapıyor
 * ve hepsi tek bir "başarısız" satırına düşüyor.
 *
 * Bu araç zinciri parça parça yürütüyor ve HER ADIMI ayrı raporluyor:
 *
 *   1. Yapılandırma      — client id/secret/developer token var mı
 *   2. Token             — kayıtlı token çözülüyor ve tazeleniyor mu
 *   3. Erişilebilir hesaplar — listAccessibleCustomers
 *   4. Müşteri okuma     — her kök için `customer` kaynağı
 *   5. Hiyerarşi         — MCC altındaki hesaplar
 *   6. Kampanyalar       — yapı sorgusu
 *   7. Metrikler         — son 7 günün verisi
 *
 * GERÇEK SAĞLAYICI KODUNU kullanıyor, elle HTTP atmıyor. Elle atmak, üretimde
 * çalışan koddan FARKLI bir yolu test etmek olurdu ve tanı değersizleşirdi.
 *
 * NEDEN src/ ALTINDA VE NEDEN DERLENMİŞ ÇALIŞIYOR:
 *
 * İlk hâli `prisma/google-check.ts` idi ve `tsx` ile koşuyordu — diğer ops
 * araçları gibi. Nest açılışta patladı:
 *
 *     Nest can't resolve dependencies of the TokenService (?, +, APP_CONFIG)
 *
 * Sebep DI yapılandırması DEĞİL: `tsx` esbuild kullanıyor ve esbuild
 * `emitDecoratorMetadata` DESTEKLEMİYOR. O metadata olmadan Nest constructor
 * parametrelerinin tiplerini göremiyor ve hepsini `undefined` sanıyor.
 *
 * `sync-cli.ts` tsx ile sorunsuz çalışıyor çünkü Nest'i hiç açmıyor, doğrudan
 * PrismaClient kullanıyor. Worker ise `dist/worker.js`ten koşuyor — derlenmiş.
 *
 * Bu araç da aynı yolu izliyor: `src/` altında duruyor, `nest build` ile
 * derleniyor ve `node dist/google-check.js` ile çalışıyor. Ek fayda: üretimde
 * koşan İKİLİNİN AYNISINI test ediyoruz, ayrı bir derleyicinin ürettiğini
 * değil.
 *
 * Kullanım (deploy sonrası, derlenmiş çıktı hazırken):
 *   pnpm --filter @advetics/api google-check
 *   pnpm --filter @advetics/api google-check -- --client <uuid>
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

loadEnv({ path: resolve(__dirname, '../.env') });

import { AppModule } from './app.module';
import { PrismaAdminService } from './prisma/prisma-admin.service';
import { ProviderRegistry } from './modules/connections/provider.registry';
import { TokenVaultService } from './modules/connections/token-vault.service';
import { CONFIG, type AppConfig } from './config/configuration';
import { PlatformApiError } from './modules/connections/provider.types';

const ARGV = process.argv.slice(2).filter((a) => a !== '--');
function arg(name: string): string | undefined {
  const i = ARGV.indexOf(`--${name}`);
  return i !== -1 ? ARGV[i + 1] : undefined;
}

let failed = 0;

function ok(step: string, detail?: string): void {
  console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Hata YUTULMUYOR ve ham hâliyle basılıyor.
 *
 * Google hata gövdesinde `details[].errors[].errorCode` altında gerçek sebebi
 * veriyor ve normalize edilmiş mesaj onu kaybediyor. İlk canlı denemede
 * ihtiyacımız olan tam da o ayrıntı.
 */
function bad(step: string, err: unknown): void {
  failed++;
  console.log(`  ✗ ${step}`);
  if (err instanceof PlatformApiError) {
    console.log(`      tür: ${err.kind}`);
    console.log(`      mesaj: ${err.message}`);
    // ALAN ADI `detail`, `details` DEĞİL. İlk yazımda çoğul yazılmıştı ve
    // araç hiçbir ham gövde basmıyordu — tanının tek değeri tam da bu gövde.
    if (err.detail?.httpStatus) console.log(`      http: ${err.detail.httpStatus}`);
    if (err.detail?.platformCode) console.log(`      kod: ${err.detail.platformCode}`);
    if (err.detail?.raw) {
      console.log(`      ham gövde:`);
      console.log(indent(JSON.stringify(err.detail.raw, null, 2).slice(0, 3000)));
    }
  } else {
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `        ${l}`)
    .join('\n');
}

function head(title: string): void {
  console.log(`\n${title}`);
  console.log('─'.repeat(Math.max(title.length, 40)));
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const config = app.get<AppConfig>(CONFIG);
  const db = app.get(PrismaAdminService);
  const registry = app.get(ProviderRegistry);
  const vault = app.get(TokenVaultService);
  const provider = registry.get('google');

  head('1. Yapılandırma');
  const g = config.platforms.google;
  for (const [label, value] of [
    ['GOOGLE_CLIENT_ID', g.clientId],
    ['GOOGLE_CLIENT_SECRET', g.clientSecret],
    ['GOOGLE_ADS_DEVELOPER_TOKEN', g.developerToken],
  ] as const) {
    if (value) ok(label, `${String(value).slice(0, 6)}…`);
    else bad(label, new Error('tanımlı değil — .env dosyasına ekle'));
  }
  ok('API sürümü', g.apiVersion);
  if (!provider.isConfigured()) {
    console.log('\n✗ Yapılandırma eksik, devam edilemiyor.\n');
    await app.close();
    process.exit(1);
  }

  head('2. Bağlantı ve token');
  const clientFilter = arg('client');
  const connection = await db.platformConnection.findFirst({
    where: {
      platform: 'google',
      status: { not: 'revoked' },
      ...(clientFilter ? { clientId: clientFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!connection) {
    console.log(
      '  ✗ Google bağlantısı yok.\n' +
        '      Panelden Platform Bağlantıları → Google Ads ile bağlan, sonra tekrar çalıştır.\n',
    );
    await app.close();
    process.exit(1);
  }
  ok('bağlantı', `${connection.accountLabel} (${connection.status})`);
  ok('izinler', connection.grantedScopes.join(', ') || '(boş)');

  let accessToken: string;
  try {
    // GERÇEK YOL: kasa token'ı çözüyor, gerekiyorsa tazeliyor ve hatayı
    // bağlantıya işliyor. Elle çözmek bu davranışı atlardı.
    accessToken = await vault.getAccessToken(connection.id, provider);
    ok('erişim token’ı alındı');
  } catch (err) {
    bad('token alınamadı', err);
    console.log(
      '\n  Muhtemel sebep: refresh token yok ya da iptal edilmiş.\n' +
        '  Çözüm: bağlantıyı kaldırıp yeniden kur (access_type=offline ile).\n',
    );
    await app.close();
    process.exit(1);
  }

  head('3. Erişilebilir hesaplar');
  let accounts: Awaited<ReturnType<typeof provider.listAdAccounts>> = [];
  try {
    accounts = await provider.listAdAccounts(accessToken);
    ok('hesap keşfi', `${accounts.length} hesap`);
    for (const a of accounts.slice(0, 20)) {
      console.log(
        `      · ${a.name} (${a.externalId})` +
          ` ${a.currency ?? '?'} ${a.timezone ?? '?'}` +
          `${a.managerExternalId ? ` — MCC ${a.managerExternalId}` : ''}`,
      );
    }
    if (accounts.length > 20) console.log(`      … ve ${accounts.length - 20} tane daha`);
  } catch (err) {
    bad('hesap keşfi', err);
    console.log(
      '\n  Bu adım en sık şu üç sebeple kırılıyor:\n' +
        '    · developer token Basic Access değil (test token yalnızca test hesabı görür)\n' +
        `    · API sürümü yanlış (şu an ${g.apiVersion}) — Google eski sürümleri kapatıyor\n` +
        '    · OAuth kapsamı eksik (adwords scope’u verilmemiş)\n',
    );
    await app.close();
    process.exit(failed > 0 ? 1 : 0);
  }

  if (accounts.length === 0) {
    console.log(
      '\n  ! Hiç hesap dönmedi. Token geçerli ama bu kullanıcıya bağlı reklam\n' +
        '    hesabı yok ya da MCC erişimi verilmemiş.\n',
    );
    await app.close();
    process.exit(0);
  }

  // Yapı ve metrik testi için gerçek bir reklam hesabı seç: MCC'ler reklam
  // yayınlamıyor ve onlarda kampanya sorgusu boş döner — bu bir hata değil
  // ama tanıyı yanıltır.
  const target =
    accounts.find((a) => a.status !== 'closed' && a.externalId !== a.managerExternalId) ??
    accounts[0]!;

  head(`4. Yapı sorgusu — ${target.name} (${target.externalId})`);
  try {
    const structure = await provider.fetchStructure({
      accessToken,
      accountExternalId: target.externalId,
      loginCustomerId: target.managerExternalId,
    });
    ok(
      'yapı çekildi',
      `${structure.campaigns.length} kampanya · ${structure.adGroups.length} ad group · ` +
        `${structure.ads.length} reklam · ${structure.apiCalls} API çağrısı`,
    );
    for (const c of structure.campaigns.slice(0, 5)) {
      console.log(`      · ${c.name} [${c.status}] ${c.objective ?? ''}`);
    }
  } catch (err) {
    bad('yapı sorgusu', err);
    console.log(
      '\n  Ham gövdedeki `errorCode` gerçek sebebi söylüyor; üst seviye mesaj\n' +
        '  ("Request contains an invalid argument") her şey için aynı.\n' +
        '  Sık görülenler:\n' +
        '    · PAGE_SIZE_NOT_SUPPORTED   → istek gövdesinde desteklenmeyen alan\n' +
        '    · UNRECOGNIZED_FIELD        → GAQL alan adı bu sürümde yok\n' +
        '    · USER_PERMISSION_DENIED    → login-customer-id eksik ya da yanlış\n',
    );
  }

  head(`5. Metrik sorgusu — son 7 gün`);
  const to = new Date(Date.now() - 86_400_000);
  const from = new Date(to.getTime() - 6 * 86_400_000);
  const iso = (d: Date): string => d.toISOString().slice(0, 10);

  for (const level of ['account', 'campaign'] as const) {
    try {
      const insights = await provider.fetchInsights(
        {
          accessToken,
          accountExternalId: target.externalId,
          loginCustomerId: target.managerExternalId,
        },
        {
          level,
          dateFrom: iso(from),
          dateTo: iso(to),
          // Hesabın KENDİ zaman dilimi: Google tarihleri müşteri zaman
          // dilimine göre yorumluyor ve UTC varsaymak bir günlük kaymaya yol
          // açıyor. Keşiften gelen değer kullanılıyor.
          timezone: target.timezone ?? 'Europe/Istanbul',
        },
      );
      const spend = insights.rows.reduce((sum, r) => sum + r.spendMicros, 0n);
      ok(
        `${level} metrikleri`,
        `${insights.rows.length} satır · ${(Number(spend) / 1_000_000).toFixed(2)} harcama`,
      );
      const sample = insights.rows[0];
      if (sample) {
        console.log(
          `      örnek: ${sample.date} · ${sample.impressions} gösterim · ` +
            `${sample.clicks} tıklama · ${sample.conversions} dönüşüm · ${sample.currency}`,
        );
      }
    } catch (err) {
      bad(`${level} metrikleri`, err);
    }
  }

  head('Sonuç');
  if (failed === 0) {
    console.log(
      '  Google zinciri baştan sona çalışıyor.\n\n' +
        '  Sıradaki adım — hesabı senkronizasyona aç ve gerçek işi çalıştır:\n' +
        '    pnpm --filter @advetics/api sync -- list\n' +
        '    pnpm --filter @advetics/api sync -- enable --account <uuid>\n' +
        '    pnpm --filter @advetics/api sync -- run --account <uuid>\n',
    );
  } else {
    console.log(`  ${failed} adım başarısız. Yukarıdaki ham hata gövdelerine bak.\n`);
  }

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n✗ Tanı aracı çöktü:', err);
  process.exit(1);
});
