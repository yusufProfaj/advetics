import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RuleExecutorService } from './rule-executor.service';

/**
 * Modül 5 — Kural motoru.
 *
 * QueueModule İÇE ALINMIYOR ve alınmamalı: o modül `@Global` olduğu için
 * `QuotaGuardService` zaten enjekte edilebiliyor. İçe almak, QueueModule'ün
 * bu modülü (zamanlanmış değerlendirme için) içe almasıyla birlikte DÖNGÜSEL
 * bağımlılık üretirdi ve Nest'in çözümü `forwardRef` — teşhisi zor bir
 * başlatma hatası sınıfı.
 */
@Module({
  imports: [ConnectionsModule],
  controllers: [RulesController],
  providers: [RulesService, RuleExecutorService],
  exports: [RulesService, RuleExecutorService],
})
export class RulesModule {}
