import { Controller, Post, Body, Param, UseGuards, UsePipes } from '@nestjs/common';
import { SigningService } from './signing.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateSignatureRequestDto,
  CreateSignatureRequestDtoSchema,
  ReassignSignerDto,
  ReassignSignerDtoSchema,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1')
export class SigningController {
  constructor(
    private readonly signingService: SigningService,
    private readonly cls: ClsService,
  ) {}

  @Post('documents/:id/signature-requests')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Signature' })
  @UsePipes(new ZodValidationPipe(CreateSignatureRequestDtoSchema))
  async createSignatureRequest(
    @Param('id') documentId: string,
    @Body() dto: CreateSignatureRequestDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.signingService.createSignatureRequest(orgId, {
      ...dto,
      documentId,
    });
  }

  /**
   * RULE SIG-005: Signer substitution preserves full audit trail.
   */
  @Post('signature-requests/:id/signers/:signerId/reassign')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Signature' })
  @UsePipes(new ZodValidationPipe(ReassignSignerDtoSchema))
  async reassignSigner(
    @Param('id') requestId: string,
    @Param('signerId') signerId: string,
    @Body() dto: ReassignSignerDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.signingService.reassignSigner(orgId, requestId, signerId, dto);
  }

  @Post('signature-requests/:id/void')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Signature' })
  async voidSignatureRequest(@Param('id') requestId: string, @Body('reason') reason?: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.signingService.voidSignatureRequest(orgId, requestId, reason || 'Voided by sender');
  }
}
