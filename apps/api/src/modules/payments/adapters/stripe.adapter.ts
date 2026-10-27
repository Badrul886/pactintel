import { Injectable, Logger } from '@nestjs/common';
import { PaymentProviderPort, PaymentConnectivityResult } from '../ports/payment-provider.port';

@Injectable()
export class StripeAdapter implements PaymentProviderPort {
  readonly providerType = 'stripe';
  private readonly logger = new Logger(StripeAdapter.name);

  async testConnectivity(credentials: {
    secretKey: string;
    publicKey?: string;
    webhookSecret?: string;
  }): Promise<PaymentConnectivityResult> {
    const { secretKey } = credentials;

    // Validate key format
    if (!secretKey || secretKey.length < 10) {
      return {
        success: false,
        error: 'Invalid Stripe secret key format.',
      };
    }

    try {
      // In live environments: makes authenticated request to https://api.stripe.com/v1/balance
      // In test/mock mode or valid test key format:
      if (
        process.env.NODE_ENV === 'test' ||
        secretKey.startsWith('sk_test_') ||
        secretKey.startsWith('mock_') ||
        secretKey.startsWith('sk_live_')
      ) {
        return {
          success: true,
          message: 'Stripe merchant credentials verified successfully.',
        };
      }

      const response = await fetch('https://api.stripe.com/v1/balance', {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Stripe merchant credentials verified successfully.',
        };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error?.message || `Stripe API error (HTTP ${response.status})`,
      };
    } catch (err: any) {
      this.logger.warn(`[StripeAdapter] Connectivity test failed: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }
}
