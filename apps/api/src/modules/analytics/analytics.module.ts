import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';
import { AbilityFactory } from '../organization/casl/ability.factory';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository, AbilityFactory],
  exports: [AnalyticsService, AnalyticsRepository],
})
export class AnalyticsModule {}
