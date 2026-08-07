import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { QueueModule } from '../../queue/queue.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RuleExecutorService } from './rule-executor.service';

/** Modül 5 — Kural motoru. */
@Module({
  imports: [ConnectionsModule, QueueModule],
  controllers: [RulesController],
  providers: [RulesService, RuleExecutorService],
  exports: [RulesService, RuleExecutorService],
})
export class RulesModule {}
