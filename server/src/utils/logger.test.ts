import { describe, it, expect, vi, beforeEach } from 'vitest';

const logState = { output: '' };

vi.mock('pino', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pino')>();
  const Writable = (await import('stream')).Writable;
  return {
    default: vi.fn((options) => {
      const testOptions = { ...options };
      delete testOptions.transport; // Prevent collision with custom stream
      return actual.default(testOptions, new Writable({
        write(chunk, encoding, callback) {
          logState.output += chunk.toString();
          callback();
        }
      }));
    }),
  };
});

import { logger } from './logger';

describe('logger redaction', () => {
  beforeEach(() => {
    logState.output = '';
  });

  it('redacts sensitive req.headers.authorization', () => {
    logger.info({ req: { headers: { authorization: 'Bearer 12345' } } }, 'test message');
    const parsedLog = JSON.parse(logState.output);
    expect(parsedLog.req.headers.authorization).toBe('[REDACTED]');
  });

  it('redacts sensitive req.headers.cookie', () => {
    logger.info({ req: { headers: { cookie: 'session=12345' } } }, 'test message');
    const parsedLog = JSON.parse(logState.output);
    expect(parsedLog.req.headers.cookie).toBe('[REDACTED]');
  });

  it('redacts wildcard password fields', () => {
    logger.info({ user: { password: 'my-secret-password' } }, 'test message');
    const parsedLog = JSON.parse(logState.output);
    expect(parsedLog.user.password).toBe('[REDACTED]');
  });

  it('redacts wildcard token fields', () => {
    logger.info({ auth: { token: 'my-token' } }, 'test message');
    const parsedLog = JSON.parse(logState.output);
    expect(parsedLog.auth.token).toBe('[REDACTED]');
  });

  it('redacts wildcard secret fields', () => {
    logger.info({ config: { secret: 'my-secret' } }, 'test message');
    const parsedLog = JSON.parse(logState.output);
    expect(parsedLog.config.secret).toBe('[REDACTED]');
  });

  it('leaves non-sensitive fields alone', () => {
    logger.info({ req: { headers: { host: 'localhost' } }, user: { name: 'alice' } }, 'test message');
    const parsedLog = JSON.parse(logState.output);
    expect(parsedLog.req.headers.host).toBe('localhost');
    expect(parsedLog.user.name).toBe('alice');
  });
});
