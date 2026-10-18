import { Module } from '@nestjs/common';
import { BrandKitController } from './brand-kit.controller';
import { BrandKitService } from './brand-kit.service';
import { BrandKitRepository } from './brand-kit.repository';
import { AbilityFactory } from '../organization/casl/ability.factory';

@Module({
  controllers: [BrandKitController],
  providers: [BrandKitService, BrandKitRepository, AbilityFactory],
  exports: [BrandKitService, BrandKitRepository],
})
export class BrandKitModule {}
