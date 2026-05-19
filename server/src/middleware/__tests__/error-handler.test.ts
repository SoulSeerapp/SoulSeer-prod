import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globalErrorHandler, AppError } from '../error-handler';
import { Request, Response, NextFunction } from 'express';

vi.mock('../../config', () => ({
  config: { isProduction: false }
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  }
}));

describe('globalErrorHandler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('handles UnauthorizedError', () => {
    const err = new Error('Not auth') as any;
    err.name = 'UnauthorizedError';
    globalErrorHandler(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('handles AppError', () => {
    const err = new AppError(403, 'Forbidden', 'FORBIDDEN_CODE');
    globalErrorHandler(err, req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
