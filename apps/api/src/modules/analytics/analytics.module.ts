import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';
import { EngagementScoringService } from './engagement-scoring.service';
import { CustomReportService } from './custom-report.service';
import { CustomReportSchedulerService } from './custom-report-scheduler.service';
import { ComputeEngagementScoreProcessor } from './processors/compute-engagement-score.processor';
import { RunScheduledReportProcessor } from './processors/run-scheduled-report.processor';
import { AbilityFactory } from '../organization/casl/ability.factory';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [forwardRef(() => NotificationModule)],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsRepository,
    EngagementScoringService,
    CustomReportService,
    CustomReportSchedulerService,
    ComputeEngagementScoreProcessor,
    RunScheduledReportProcessor,
    AbilityFactory,
  ],
  exports: [
    AnalyticsService,
    AnalyticsRepository,
    EngagementScoringService,
    CustomReportService,
    CustomReportSchedulerService,
  ],
})
export class AnalyticsModule {}
