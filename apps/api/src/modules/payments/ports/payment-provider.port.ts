export interface PaymentConnectivityResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface PaymentProviderPort {
  readonly providerType: 'stripe' | 'paypal';
  testConnectivity(credentials: {
    secretKey: string;
    publicKey?: string;
    webhookSecret?: string;
  }): Promise<PaymentConnectivityResult>;
}

export const PAYMENT_PROVIDER_PORT = Symbol('PAYMENT_PROVIDER_PORT');
