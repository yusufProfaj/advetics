/* eslint-disable */
/**
 * ═══ NEST BAĞIMLILIK GRAFİĞİNİ AYAĞA KALDIRAN KOŞUCU (Ajan 4) ═══
 *
 * `src/nest-grafigi.spec.ts` bunu AYRI SÜREÇTE çalıştırıyor. Neden ayrı
 * süreç ve neden esbuild/tsx değil:
 *
 *  - Nest DI, kurucu parametrelerinin tipini `design:paramtypes`
 *    meta verisinden okuyor. esbuild (vitest, tsx) bu meta veriyi ÜRETMİYOR:
 *    vitest içinde grafik kurulursa her sınıf "bağımlılık çözülemedi" ile
 *    düşerdi ve test gerçek hatayı değil kendi ortamını ölçerdi. Burada
 *    TypeScript'in kendisi (`transpileModule`, `emitDecoratorMetadata`)
 *    kullanılıyor: üretimdeki `nest build` ile AYNI meta veri.
 *  - `@nestjs/testing` depoda yok; `Test.createTestingModule`ın yaptığı şey
 *    (tara → sağlayıcıları değiştir → örnekle) `@nestjs/core`un kendi
 *    sınıflarıyla yapılıyor. `NestFactory.createApplicationContext`
 *    KULLANILMIYOR: o `init()` de çağırıyor ve `onModuleInit` Prisma'yı
 *    veritabanına bağlamaya kalkıyor. Amaç YALNIZ DI çözümü.
 *
 * Dış bağlantı: REDIS_URL verilmiyor (kuyruk servisleri kurucuda Redis'e
 * ancak adres varsa bağlanıyor) ve CONFIG sahte nesneyle değiştiriliyor
 * (deponun kökündeki yerel `.env` ConfigModule ile yüklenip REDIS_URL
 * getirse bile). Prisma istemcileri kurucuda BAĞLANMIYOR, yine de
 * değiştiriliyor: test veritabanı istemesin.
 *
 * Çıkış: başarıda stdout'a `GRAFIK_TAMAM <modül sayısı>`, düşüşte
 * `GRAFIK_DUSTU <mesaj>` ve kod 1.
 */
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const KOK = path.resolve(__dirname, '..');
const SRC = path.join(KOK, 'src');

const DERLEME = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  sourceMap: false,
};

require.extensions['.ts'] = function (mod, dosya) {
  const kaynak = fs.readFileSync(dosya, 'utf8');
  const { outputText } = ts.transpileModule(kaynak, { compilerOptions: DERLEME, fileName: dosya });
  mod._compile(outputText, dosya);
};

// Ortam: yapılandırma şemasının zorunlu alanları. Hiçbiri bağlantı açmıyor.
const ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://grafik:grafik@127.0.0.1:1/grafik',
  DIRECT_DATABASE_URL: 'postgresql://grafik:grafik@127.0.0.1:1/grafik',
  WORKER_DATABASE_URL: 'postgresql://grafik:grafik@127.0.0.1:1/grafik',
  JWT_ACCESS_SECRET: 'g'.repeat(40),
  JWT_REFRESH_SECRET: 'h'.repeat(40),
  ENCRYPTION_KEY_V1: Buffer.alloc(32, 7).toString('base64'),
};
for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
delete process.env.REDIS_URL;

async function main() {
  require('reflect-metadata');
  const { NestContainer } = require('@nestjs/core/injector/container');
  const { DependenciesScanner } = require('@nestjs/core/scanner');
  const { MetadataScanner } = require('@nestjs/core/metadata-scanner');
  const { InstanceLoader } = require('@nestjs/core/injector/instance-loader');
  const { Injector } = require('@nestjs/core/injector/injector');
  const { NoopGraphInspector } = require('@nestjs/core/inspector/noop-graph-inspector');
  const { ApplicationConfig } = require('@nestjs/core/application-config');
  const { Logger } = require('@nestjs/common');
  Logger.overrideLogger(false);

  const { AppModule } = require(path.join(SRC, 'app.module.ts'));
  const { CONFIG, loadConfig } = require(path.join(SRC, 'config/configuration.ts'));
  const { PrismaService } = require(path.join(SRC, 'prisma/prisma.service.ts'));
  const { PrismaAdminService } = require(path.join(SRC, 'prisma/prisma-admin.service.ts'));

  const config = loadConfig();
  config.redis.url = undefined;

  const appConfig = new ApplicationConfig();
  const container = new NestContainer(appConfig);
  const scanner = new DependenciesScanner(container, new MetadataScanner(), NoopGraphInspector, appConfig);
  await scanner.scan(AppModule);

  // Sahteler: `Test.createTestingModule(...).overrideProvider(...)` ile aynı yol.
  const sahte = new Proxy(
    {},
    {
      get: (_, ad) => {
        if (ad === 'then') return undefined;
        return () => {
          throw new Error(`Grafik testinde Prisma çağrıldı (${String(ad)}): kurucu veritabanına gitmemeli`);
        };
      },
    },
  );
  container.replace(CONFIG, { useValue: config, isProvider: true });
  container.replace(PrismaService, { useValue: sahte, isProvider: true });
  container.replace(PrismaAdminService, { useValue: sahte, isProvider: true });

  const loader = new InstanceLoader(container, new Injector(), NoopGraphInspector);
  await loader.createInstancesOfDependencies();
  scanner.applyApplicationProviders();

  /*
   * `@Optional()` BAĞIMLILIK GRAFİKTE SESSİZCE `undefined` OLUR. DI çözümü
   * başarılı görünür ama özellik kapanır: `BildirimTeslimService.ozet`
   * yoksa ajans kanalına haftalık özet HİÇ üretilmez (yalnız süpürme
   * notunda bir cümle). Üretimde var olması gereken isteğe bağlı
   * bağımlılıklar örnek üzerinden ayrıca soruluyor.
   */
  const { BildirimTeslimService } = require(path.join(SRC, 'modules/sinyal/bildirim-teslim.service.ts'));
  const { OzetService } = require(path.join(SRC, 'modules/haftalik-ozet/ozet.service.ts'));
  const { IyilestirService } = require(path.join(SRC, 'modules/iyilestir/iyilestir.service.ts'));
  const ornekler = (sinif) =>
    [...container.getModules().values()].flatMap((m) => {
      const w = m.providers.get(sinif);
      return w && w.instance ? [w.instance] : [];
    });
  const eksik = [];
  const teslimler = ornekler(BildirimTeslimService);
  if (teslimler.length === 0) eksik.push('BildirimTeslimService hiç örneklenmedi');
  for (const t of teslimler) if (!t.ozet) eksik.push('BildirimTeslimService.ozet (OzetService) yok');
  const ozetler = ornekler(OzetService);
  if (ozetler.length === 0) eksik.push('OzetService hiç örneklenmedi');
  for (const o of ozetler) {
    if (!o.moduleRef) {
      eksik.push('OzetService.moduleRef yok');
      continue;
    }
    try {
      if (!o.moduleRef.get(IyilestirService, { strict: false })) eksik.push('OzetService → IyilestirService çözülemedi');
    } catch (e) {
      eksik.push(`OzetService → IyilestirService çözülemedi: ${e.message}`);
    }
  }
  // Kitle önerisinin Google karşılığı (2026-10-16): kasa ve sağlayıcılar
  // yoksa öneri "Google bağlantısı bu ortamda kurulu değil" der, hata vermez.
  const { KitleOnerisiService } = require(path.join(SRC, 'modules/ai-assistant/kitle-onerisi.service.ts'));
  const oneriler = ornekler(KitleOnerisiService);
  if (oneriler.length === 0) eksik.push('KitleOnerisiService hiç örneklenmedi');
  for (const o of oneriler) {
    if (!o.kasa) eksik.push('KitleOnerisiService.kasa (TokenVaultService) yok');
    if (!o.saglayicilar) eksik.push('KitleOnerisiService.saglayicilar (ProviderRegistry) yok');
  }
  if (eksik.length > 0) throw new Error(`İsteğe bağlı bağımlılık eksik: ${eksik.join('; ')}`);

  const moduller = [...container.getModules().values()].map((m) => m.metatype?.name).filter(Boolean);
  process.stdout.write(`GRAFIK_TAMAM ${moduller.length} ${moduller.sort().join(',')}\n`);
}

main().then(
  () => process.exit(0),
  (e) => {
    process.stdout.write(`GRAFIK_DUSTU ${e && e.message ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
