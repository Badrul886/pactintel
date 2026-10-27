import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  InitiatePaymentDto,
  InitiatePaymentDtoSchema,
  AddPaymentCredentialDto,
  AddPaymentCredentialDtoSchema,
} from '@pactintel/shared-types';
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

  // --- BYOK Payment Credential Endpoints ---

  @Get('payment-credentials')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'PaymentCredential' })
  async listPaymentCredentials() {
    const orgId = this.cls.get<string>('organizationId');
    return this.paymentsService.listCredentials(orgId);
  }

  @Post('payment-credentials')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'PaymentCredential' })
  @UsePipes(new ZodValidationPipe(AddPaymentCredentialDtoSchema))
  async addPaymentCredential(@Body() dto: AddPaymentCredentialDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.paymentsService.storeCredential(orgId, dto, userId);
  }

  @Delete('payment-credentials/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'PaymentCredential' })
  async revokePaymentCredential(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.paymentsService.revokeCredential(orgId, id, userId);
  }

  @Post('payment-credentials/:id/test')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'PaymentCredential' })
  async testPaymentCredential(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.paymentsService.testConnectivity(orgId, id, userId);
  }

  @Get('payment-credentials/:id/audit')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'PaymentCredential' })
  async getPaymentCredentialAuditLogs(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.paymentsService.getCredentialAuditLogs(orgId, id);
  }
}
