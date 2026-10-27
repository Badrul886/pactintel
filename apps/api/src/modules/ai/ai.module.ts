import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiGateway } from './gateway/ai.gateway';
import { AiRepository } from './ai.repository';
import { VertexAiAdapter } from './adapters/vertex-ai/vertex-ai.adapter';
import { AnthropicAdapter } from './adapters/anthropic/anthropic.adapter';
import { OrganizationModule } from '../organization/organization.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [OrganizationModule, AuthModule],
  controllers: [AiController],
  providers: [
    AiGateway,
    AiService,
    AiRepository,
    VertexAiAdapter,
    AnthropicAdapter,
    {
      provide: 'LLM_PORT',
      useClass: VertexAiAdapter,
    },
    PrismaService,
  ],
  exports: [AiGateway, AiService, AiRepository, 'LLM_PORT', VertexAiAdapter, AnthropicAdapter],
})
export class AiModule {}
