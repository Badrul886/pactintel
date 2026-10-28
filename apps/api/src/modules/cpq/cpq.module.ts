import { Module } from '@nestjs/common';
import { CpqController } from './cpq.controller';
import { CpqService } from './cpq.service';
import { CpqRepository } from './cpq.repository';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogRepository } from './catalog.repository';
import { CpqPlaybookService } from './cpq-playbook.service';
import { CpqEventListener } from './listeners/cpq-event.listener';
import { AuthModule } from '../auth/auth.module';
import { AbilityFactory } from '../organization/casl/ability.factory';

@Module({
  imports: [AuthModule],
  controllers: [CpqController, CatalogController],
  providers: [
    CpqService,
    CpqRepository,
    CatalogService,
    CatalogRepository,
    CpqPlaybookService,
    CpqEventListener,
    AbilityFactory,
  ],
  exports: [CpqService, CatalogService, CpqPlaybookService],
})
export class CpqModule {}
