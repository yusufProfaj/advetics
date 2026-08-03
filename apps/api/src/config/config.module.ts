import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfig } from './configuration';

/**
 * Doğrulanmış yapılandırmayı uygulama genelinde sağlar.
 *
 * @Global olmak zorunda: PrismaModule, CryptoModule ve AuthModule bu değere
 * ihtiyaç duyuyor. AppModule'ün kendi `providers` dizisine koymak yetmez —
 * oradaki provider'lar import edilen modüllere görünmez.
 *
 * `useFactory` uygulama açılışında bir kez çalışır ve env geçersizse
 * fırlatır; böylece "ayakta ama yanlış yapılandırılmış" bir sunucu oluşmaz.
 */
@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: loadConfig }],
  exports: [CONFIG],
})
export class AppConfigModule {}
