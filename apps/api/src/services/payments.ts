import { randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { HttpError } from '../middleware/errors';

/**
 * Payment provider boundary. Checkout only talks to this interface, so Razorpay or Stripe can be added
 * later without touching the checkout controller. v1 ships the mock provider only.
 */
export interface PaymentProvider {
  readonly name: string;
  /** True when no real money moves (the UI shows a "test payment" banner). */
  readonly testMode: boolean;
  createOrder(input: { amountMinor: number; currency: string; description: string }): Promise<{ providerRef: string }>;
  /** Asks the provider for the final result of an order. */
  settle(providerRef: string, hint: { simulate: 'success' | 'decline' }): Promise<'SUCCEEDED' | 'FAILED'>;
}

const mockProvider: PaymentProvider = {
  name: 'mock',
  testMode: true,
  async createOrder() {
    return { providerRef: `mock_${randomBytes(12).toString('hex')}` };
  },
  async settle(_providerRef, hint) {
    return hint.simulate === 'decline' ? 'FAILED' : 'SUCCEEDED';
  },
};

export function getPaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === 'mock') return mockProvider;
  throw new HttpError(
    501,
    'PAYMENT_NOT_CONFIGURED',
    `Payment provider "${env.PAYMENT_PROVIDER}" is not implemented in this version. Set PAYMENT_PROVIDER=mock.`,
  );
}
