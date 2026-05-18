import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadServiceWithEnv(env: Record<string, string>) {
  vi.resetModules();

  // Clean up any potential conflicting variables from the process environment
  delete process.env.AUTH0_MGMT_CLIENT_ID;
  delete process.env.AUTH0_MGMT_CLIENT_SECRET;
  delete process.env.AUTH0_APP_ID;
  delete process.env.AUTH0_CLIENT_SECRET;

  // Set required variables so config.ts doesn't throw
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/soulseer_test';
  process.env.AUTH0_DOMAIN = 'test.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.soulseer.test';

  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const mod = await import('../services/auth0-management');
  return mod.auth0ManagementService;
}

describe('Auth0ManagementService', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws ensureConfigured error when credentials are not set', async () => {
    // Omitting AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET
    const svc = await loadServiceWithEnv({
      AUTH0_MGMT_CLIENT_ID: '',
      AUTH0_MGMT_CLIENT_SECRET: '',
    });

    expect(svc.enabled).toBe(false);

    await expect(
      svc.createUserWithPassword({
        email: 'test@example.com',
        fullName: 'Test User',
      }),
    ).rejects.toThrowError(
      'Auth0 Management API is not configured. Set AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET.',
    );
  });
});
