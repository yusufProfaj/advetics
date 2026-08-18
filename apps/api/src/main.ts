import 'reflect-metadata';
/*
 * `express` DOĞRUDAN BAĞIMLILIK olarak eklendi ve bu zorunluydu.
 *
 * Paket zaten ağaçta vardı — `@nestjs/platform-express` onu çekiyor — ama
 * pnpm sıkı kurulumda GEÇİŞLİ bağımlılıklar içe aktarılamıyor. TypeScript
 * hiçbir şey demiyordu (`@types/express` mevcut) ve derleme de geçiyordu;
 * uygulama yalnızca AÇILIRKEN "Cannot find module 'express'" ile ölüyordu.
 *
 * Kendi ham gövde ara katmanımızı yazmak da mümkündü ama akış tüketmenin
 * kenar durumları (boyut sınırı, yarıda kesilen istek, iki kez okunan akış)
 * yeni bir hata yüzeyi açardı; zaten kurulu olan paketi açıkça beyan etmek
 * daha az riskli.
 */
import express from 'express';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { CONFIG, type AppConfig } from './config/configuration';

/**
 * BigInt JSON serileştirmesi.
 *
 * Prisma `audit_logs.id` gibi alanları BigInt döndürür ve JSON.stringify
 * bunları serileştiremez (TypeError fırlatır). Global bir çözüm yerine
 * ilgili yerlerde `.toString()` çağırmayı tercih ediyoruz; bu satır yalnızca
 * gözden kaçan bir durumda 500 hatası yerine string dönmesini sağlar.
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    /**
     * HAM GÖVDEYİ SAKLA — leadgen webhook imzası için ZORUNLU.
     *
     * Meta `X-Hub-Signature-256` imzasını gönderdiği baytlar üzerinden
     * üretiyor. Ayrıştırılmış nesneyi yeniden `JSON.stringify` etmek işe
     * yaramıyor: anahtar sırası, boşluk ve sayı biçimi değişiyor, imza
     * tutmuyor ve webhook "hiç çalışmıyor" gibi görünüyor.
     */
    rawBody: true,
  });

  const config = app.get<AppConfig>(CONFIG);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.globalPrefix);

  /**
   * YOUTUBE BİLDİRİM UCU İÇİN HAM GÖVDE — Nest'in `rawBody` seçeneği BURADA
   * ÇALIŞMIYOR.
   *
   * Yukarıdaki `rawBody: true` kancası yalnızca `json` ve `urlencoded`
   * parser'lara takılıyor. YouTube WebSub bildirimi `application/atom+xml`
   * gönderiyor; o içerik türü hiçbir parser'a uğramadığı için `req.rawBody`
   * TANIMSIZ kalıyor.
   *
   * İmza ham baytlar üzerinden hesaplanıyor ve ayrıştırılmış bir gövdeden
   * geri üretilemiyor — yani bu satır olmadan imza HER ZAMAN geçersiz çıkar
   * ve sebebi hiçbir yerde görünmez. Tuzak kod yazılmadan önce araştırmada
   * tespit edildi.
   *
   * İÇERİK TÜRÜ JOKERLE eşleniyor (yıldız bölü yıldız) — bilinçli: hub'ın
   * hangi türü göndereceğine güvenmiyoruz. Yalnızca BU YOL için geçerli;
   * diğer uçların gövde ayrıştırması değişmiyor.
   *
   * (Jokerin kendisi bu yorumda YAZILAMIYOR: dizge blok yorumunu ortasından
   * kapatıyor ve hata `TS1109: Expression expected` olarak çıkıyor —
   * `Prisma.sql` yorumlarındaki ters tırnak tuzağının aynısı.)
   *
   * SINIR 1 MB: uç kimlik doğrulamasız ve internete açık; sınırsız gövde
   * kabul etmek belleği tüketmenin en ucuz yolu olurdu. Gerçek bildirimler
   * birkaç kilobayt.
   */
  app.use(
    `/${config.globalPrefix}/webhooks/youtube`,
    express.raw({ type: '*/*', limit: '1mb' }),
  );

  // Sıra önemli: requestId önce gelmeli ki hata filtresi bile onu kullanabilsin.
  app.use(requestIdMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // Reverse proxy arkasında gerçek istemci IP'si için. Denetim kaydında
  // proxy'nin IP'sini görmek işe yaramaz.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true, // httpOnly cookie tabanlı oturum için zorunlu
    exposedHeaders: ['x-request-id'],
  });

  // Global ValidationPipe KASITLI olarak kurulmadı.
  //
  // Doğrulama tamamen Zod ile yapılıyor (@advetics/shared içindeki şemalar
  // frontend tarafından da kullanılıyor). Nest'in ValidationPipe'ı
  // class-validator + class-transformer gerektirir; iki paralel doğrulama
  // sistemi taşımak, hangi kuralın nerede geçerli olduğunu belirsizleştirir.
  // ParseUUIDPipe gibi tekil pipe'lar kendi başlarına çalışır, sorun değil.

  app.enableShutdownHooks();

  // İkinci argüman ŞART: verilmezse Node 0.0.0.0'a bağlanır ve API'yi tüm
  // arayüzlerde açar. Tek meşru giriş Nginx'tir.
  await app.listen(config.port, config.host);

  logger.log(`API hazır → http://${config.host}:${config.port}/${config.globalPrefix}`);
  if (config.host === '0.0.0.0') {
    logger.warn('API TÜM arayüzlerde dinliyor. Üretimde API_HOST=127.0.0.1 olmalı.');
  }
  logger.log(`Ortam: ${config.env} | CORS: ${config.corsOrigins.join(', ')}`);
  if (!config.isProduction) {
    logger.warn('Geliştirme modu: davet ve şifre sıfırlama token\'ları log\'a yazılıyor.');
  }
}

void bootstrap();
