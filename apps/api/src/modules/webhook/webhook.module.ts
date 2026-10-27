import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookRepository } from './webhook.repository';
import { WebhookAdapter } from './adapters/webhook.adapter';
import { WEBHOOK_PORT } from './ports/webhook.port';
import { WebhookDeliveryJob } from './jobs/webhook-delivery.job';
import { WebhookListener } from './listeners/webhook.listener';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [WebhookController],
  providers: [
    WebhookRepository,
    WebhookService,
    WebhookDeliveryJob,
    WebhookListener,
    PrismaService,
    {
      provide: WEBHOOK_PORT,
      useClass: WebhookAdapter,
    },
  ],
  exports: [WebhookService, WebhookRepository, WebhookDeliveryJob, WebhookListener, WEBHOOK_PORT],
})
export class WebhookModule {}
