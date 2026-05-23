import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadServiceWithEnv(env: Record<string, string>) {
  vi.resetModules();
  // Need to provide the required base env vars for config to not exit
  const baseEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/soulseer_test',
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_AUDIENCE: 'https://api.soulseer.test',
  };

  // Clear any existing auth0 mgmt env vars that might bleed from .env
  process.env.AUTH0_MGMT_CLIENT_ID = '';
  process.env.AUTH0_APP_ID = '';
  process.env.AUTH0_MGMT_CLIENT_SECRET = '';
  process.env.AUTH0_CLIENT_SECRET = '';

  // Apply our specific test environment variables over the current ones
  for (const [k, v] of Object.entries({ ...baseEnv, ...env })) {
      process.env[k] = v;
  }

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

  it('throws an error when calling createUserWithPassword if not configured', async () => {
    const svc = await loadServiceWithEnv({
      AUTH0_MGMT_CLIENT_ID: '', // explicitly disable
      AUTH0_MGMT_CLIENT_SECRET: '',
    });

    expect(svc.enabled).toBe(false);

    await expect(
      svc.createUserWithPassword({
        email: 'test@example.com',
        fullName: 'Test User',
      })
    ).rejects.toThrow('Auth0 Management API is not configured. Set AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET.');
  });

  it('throws an error when calling upsertUserWithPassword if not configured', async () => {
    const svc = await loadServiceWithEnv({
      AUTH0_MGMT_CLIENT_ID: '', // explicitly disable
      AUTH0_MGMT_CLIENT_SECRET: '',
    });

    expect(svc.enabled).toBe(false);

    await expect(
      svc.upsertUserWithPassword({
        email: 'test@example.com',
        fullName: 'Test User',
        password: 'Password1!',
        role: 'reader'
      })
    ).rejects.toThrow('Auth0 Management API is not configured. Set AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET.');
  });

  it('deleteUser returns false and logs a warning when not configured', async () => {
      const svc = await loadServiceWithEnv({
        AUTH0_MGMT_CLIENT_ID: '',
        AUTH0_MGMT_CLIENT_SECRET: '',
      });

      expect(svc.enabled).toBe(false);

      const result = await svc.deleteUser('some-id');
      expect(result).toBe(false);
  });
});
