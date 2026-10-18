import { Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateRepository } from './template.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [TemplateController],
  providers: [TemplateService, TemplateRepository, PrismaService],
  exports: [TemplateService, TemplateRepository],
})
export class TemplateModule {}
