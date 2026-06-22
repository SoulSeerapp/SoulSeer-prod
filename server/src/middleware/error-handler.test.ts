import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { globalErrorHandler, AppError } from './error-handler';
import { logger } from '../utils/logger';
import { config } from '../config';

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('../config', () => ({
  config: {
    isProduction: false,
  },
}));

describe('globalErrorHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
    config.isProduction = false;
  });

  it('should handle UnauthorizedError (err.name === "UnauthorizedError")', () => {
    const error = new Error('Not authorized');
    error.name = 'UnauthorizedError';

    globalErrorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Invalid or missing authentication token',
      code: 'UNAUTHORIZED',
    });
  });

  it('should handle unauthorized error via status 401 ((err as any).status === 401)', () => {
    const error: any = new Error('Not authorized');
    error.status = 401;

    globalErrorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Invalid or missing authentication token',
      code: 'UNAUTHORIZED',
    });
  });

  it('should handle AppError with code', () => {
    const error = new AppError(404, 'Not Found', 'NOT_FOUND_CODE');

    globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Not Found',
      code: 'NOT_FOUND_CODE',
    });
  });

  it('should handle AppError without code', () => {
    const error = new AppError(403, 'Forbidden');

    globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Forbidden',
    });
  });

  it('should handle ZodError', () => {
    const error: any = new Error('Zod validation failed');
    error.name = 'ZodError';
    error.issues = [
      { path: ['field1', 'subfield'], message: 'Required' },
      { path: ['field2'], message: 'Too short' },
    ];

    globalErrorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [
        { path: 'field1.subfield', message: 'Required' },
        { path: 'field2', message: 'Too short' },
      ],
    });
  });

  it('should handle ZodError with missing path elements gracefully', () => {
    const error: any = new Error('Zod validation failed');
    error.name = 'ZodError';
    error.issues = [
      { message: 'General issue' }, // No path
    ];

    globalErrorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [
        { path: undefined, message: 'General issue' },
      ],
    });
  });

  it('should handle Stripe errors (type starts with Stripe)', () => {
    const error: any = new Error('Stripe card declined');
    error.type = 'StripeCardError';

    globalErrorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Stripe error');
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Payment processing error. Please try again.',
      code: 'PAYMENT_ERROR',
    });
  });

  it('should handle unknown errors in development mode (returns detail)', () => {
    config.isProduction = false;
    const error = new Error('Something went terribly wrong');

    globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Unhandled server error');
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'An unexpected error occurred. Please try again later.',
      code: 'INTERNAL_ERROR',
      detail: 'Something went terribly wrong',
    });
  });

  it('should handle unknown errors in production mode (hides detail)', () => {
    config.isProduction = true;
    const error = new Error('Something went terribly wrong');

    globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Unhandled server error');
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'An unexpected error occurred. Please try again later.',
      code: 'INTERNAL_ERROR',
    });
  });
});
