import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';
import { SigningModule } from '../signing/signing.module';
import { PaymentsModule } from '../payments/payments.module';

import { FormsRepository } from './forms.repository';
import { FormsService } from './forms.service';
import { FormsSubmissionService } from './forms-submission.service';
import { FormsRoutingService } from './forms-routing.service';
import { FormsMagicLinkService } from './forms-magic-link.service';
import { ProcessFormSubmissionProcessor } from './processors/process-form-submission.processor';

import { FormsController } from './forms.controller';
import { FormsPublicController } from './forms-public.controller';

@Module({
  imports: [NotificationModule, SigningModule, PaymentsModule],
  controllers: [FormsController, FormsPublicController],
  providers: [
    PrismaService,
    FormsRepository,
    FormsService,
    FormsSubmissionService,
    FormsRoutingService,
    FormsMagicLinkService,
    ProcessFormSubmissionProcessor,
  ],
  exports: [
    FormsService,
    FormsSubmissionService,
    FormsRoutingService,
    FormsMagicLinkService,
    FormsRepository,
  ],
})
export class FormsModule {}
