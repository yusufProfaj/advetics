import 'reflect-metadata';
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
  });

  const config = app.get<AppConfig>(CONFIG);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.globalPrefix);

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

  await app.listen(config.port);

  logger.log(`API hazır → http://localhost:${config.port}/${config.globalPrefix}`);
  logger.log(`Ortam: ${config.env} | CORS: ${config.corsOrigins.join(', ')}`);
  if (!config.isProduction) {
    logger.warn('Geliştirme modu: davet ve şifre sıfırlama token\'ları log\'a yazılıyor.');
  }
}

void bootstrap();
