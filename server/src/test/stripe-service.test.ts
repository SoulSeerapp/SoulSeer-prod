import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { config } from '../config';
import { users } from '../db/schema';

// We must initialize the spies inside a mock factory or via module mock
// Using vi.hoisted to ensure they are initialized before the mock factory runs
const { createAccountSpy, createAccountLinkSpy } = vi.hoisted(() => {
  return {
    createAccountSpy: vi.fn(),
    createAccountLinkSpy: vi.fn()
  }
})

vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      accounts = {
        create: createAccountSpy,
      };
      accountLinks = {
        create: createAccountLinkSpy,
      };
    },
  };
});

// 2. Mock Database (similar to billing-service.test.ts)
const { updateWhereSpy, updateSetSpy, updateSpy } = vi.hoisted(() => {
  const updateWhereSpy = vi.fn().mockResolvedValue([]);
  const updateSetSpy = vi.fn().mockReturnValue({ where: updateWhereSpy });
  const updateSpy = vi.fn().mockReturnValue({ set: updateSetSpy });
  return { updateWhereSpy, updateSetSpy, updateSpy };
});

const mockDb = {
  update: updateSpy,
};

vi.mock('../db/db', () => ({
  getDb: () => mockDb,
}));

// Import AFTER mocks so it binds to the mocked dependencies
import { createConnectAccount } from '../services/stripe-service';

describe('StripeService.createConnectAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a Stripe Connect account, updates the database, and returns the onboarding URL', async () => {
    // Arrange
    const userId = 123;
    const email = 'reader@example.com';
    const mockAccountId = 'acct_12345';
    const mockOnboardingUrl = 'https://connect.stripe.com/setup/s/mock';

    createAccountSpy.mockResolvedValue({ id: mockAccountId });
    createAccountLinkSpy.mockResolvedValue({ url: mockOnboardingUrl });

    // Act
    const result = await createConnectAccount(userId, email);

    // Assert
    // 1. Check stripe.accounts.create
    expect(createAccountSpy).toHaveBeenCalledTimes(1);
    expect(createAccountSpy).toHaveBeenCalledWith({
      type: 'express',
      email,
      metadata: { userId: '123' },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // 2. Check DB update
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(users);

    expect(updateSetSpy).toHaveBeenCalledTimes(1);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: mockAccountId,
        updatedAt: expect.any(Date),
      })
    );

    expect(updateWhereSpy).toHaveBeenCalledTimes(1);

    // 3. Check stripe.accountLinks.create
    expect(createAccountLinkSpy).toHaveBeenCalledTimes(1);
    expect(createAccountLinkSpy).toHaveBeenCalledWith({
      account: mockAccountId,
      refresh_url: `${config.corsOrigin}/dashboard`,
      return_url: `${config.corsOrigin}/dashboard`,
      type: 'account_onboarding',
    });

    // 4. Check return value
    expect(result).toEqual({
      accountId: mockAccountId,
      onboardingUrl: mockOnboardingUrl,
    });
  });

  it('propagates errors if stripe.accounts.create fails', async () => {
    const userId = 456;
    const email = 'fail@example.com';
    const error = new Error('Stripe API Error');

    createAccountSpy.mockRejectedValue(error);

    await expect(createConnectAccount(userId, email)).rejects.toThrow('Stripe API Error');

    // DB update and accountLinks.create should not be called
    expect(updateSpy).not.toHaveBeenCalled();
    expect(createAccountLinkSpy).not.toHaveBeenCalled();
  });

  it('propagates errors if database update fails', async () => {
    const userId = 789;
    const email = 'dbfail@example.com';
    const mockAccountId = 'acct_dbfail';
    const dbError = new Error('Database Error');

    createAccountSpy.mockResolvedValue({ id: mockAccountId });
    updateWhereSpy.mockRejectedValue(dbError);

    await expect(createConnectAccount(userId, email)).rejects.toThrow('Database Error');

    // accountLinks.create should not be called
    expect(createAccountSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(createAccountLinkSpy).not.toHaveBeenCalled();
  });
});
