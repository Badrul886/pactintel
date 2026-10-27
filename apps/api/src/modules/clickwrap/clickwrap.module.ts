import { Module } from '@nestjs/common';
import { ClickwrapController } from './clickwrap.controller';
import { ClickwrapWidgetController } from './widget/clickwrap-widget.controller';
import { ClickwrapService } from './clickwrap.service';
import { ClickwrapRepository } from './clickwrap.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentModule } from '../document/document.module';

@Module({
  imports: [DocumentModule],
  controllers: [ClickwrapController, ClickwrapWidgetController],
  providers: [ClickwrapRepository, ClickwrapService, PrismaService],
  exports: [ClickwrapService, ClickwrapRepository],
})
export class ClickwrapModule {}
