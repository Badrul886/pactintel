import { Controller, Post, Get, Patch, Body, Param, UseGuards, UsePipes } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InitiatePaymentDto, InitiatePaymentDtoSchema } from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly cls: ClsService,
  ) {}

  @Post('organizations/payment-connections')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'Payment' })
  async registerPaymentLink(
    @Body('displayName') displayName: string,
    @Body('paymentLinkUrlTemplate') paymentLinkUrlTemplate: string,
    @Body('supportedCurrencies') supportedCurrencies?: string[],
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.paymentsService.registerPaymentLink(
      orgId,
      displayName,
      paymentLinkUrlTemplate,
      supportedCurrencies,
    );
  }

  @Get('organizations/payment-connections')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Payment' })
  async listPaymentConnections() {
    const orgId = this.cls.get<string>('organizationId');
    return this.paymentsService.listConnections(orgId);
  }

  @Post('documents/:id/payments/initiate')
  @UsePipes(new ZodValidationPipe(InitiatePaymentDtoSchema))
  async initiatePayment(@Param('id') documentId: string, @Body() dto: InitiatePaymentDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.paymentsService.initiatePayment(orgId, {
      ...dto,
      documentId,
    });
  }

  @Patch('payments/:id/confirm')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Payment' })
  async confirmPayment(@Param('id') paymentId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.paymentsService.confirmPayment(orgId, paymentId);
  }
}
