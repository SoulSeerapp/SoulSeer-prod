import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/error-handler';

const mockCreatePaymentIntent = vi.fn();

vi.mock('stripe', () => {
  return {
    default: class StripeMock {
      paymentIntents = {
        create: mockCreatePaymentIntent,
      };
    },
  };
});

let selectQueue: any[] = [];

const mockDb = {
  select: () => {
    const chain: any = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(selectQueue.shift() ?? []);
    return chain;
  },
};

vi.mock('../db/db', () => ({
  getDb: () => mockDb,
}));

let stripeService: typeof import('../services/stripe-service');

beforeEach(async () => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  if (!stripeService) {
    stripeService = await import('../services/stripe-service');
  }
});

describe('StripeService.createPaymentIntent', () => {
  it('should throw an error if the user is not found', async () => {
    selectQueue.push([]); // No user found

    await expect(stripeService.createPaymentIntent(1, 1000)).rejects.toThrow(
      new AppError(404, 'User not found')
    );
  });

  it('should throw an error if the amount is less than 500 cents', async () => {
    selectQueue.push([{ id: 1 }]); // User found

    await expect(stripeService.createPaymentIntent(1, 499)).rejects.toThrow(
      new AppError(400, 'Min top-up $5.00')
    );
  });

  it('should create a payment intent and return clientSecret and paymentIntentId', async () => {
    selectQueue.push([{ id: 1 }]); // User found

    const mockIntent = {
      id: 'pi_123',
      client_secret: 'secret_123',
    };
    mockCreatePaymentIntent.mockResolvedValue(mockIntent);

    const result = await stripeService.createPaymentIntent(1, 1000);

    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith({
      amount: 1000,
      currency: 'usd',
      metadata: { userId: '1', type: 'balance_topup' },
      automatic_payment_methods: { enabled: true },
    });
    expect(result).toEqual({
      clientSecret: 'secret_123',
      paymentIntentId: 'pi_123',
    });
  });
});
