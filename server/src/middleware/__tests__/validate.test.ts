import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate, validateBody, validateQuery } from '../validate';

describe('validate middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  const bodySchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    age: z.number().int().positive().optional(),
  });

  const querySchema = z.object({
    search: z.string().optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a number string").optional(),
  });

  describe('validate & validateBody', () => {
    it('should alias validateBody to validate', () => {
      expect(validateBody).toBe(validate);
    });

    it('should call next() and populate req.body when validation succeeds', () => {
      const validData = { name: 'Alice', age: 30 };
      req.body = validData;

      const middleware = validate(bodySchema);
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.body).toEqual(validData);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should strip unknown fields and update req.body when validation succeeds', () => {
      const inputData = { name: 'Bob', extraField: 'should be removed' };
      req.body = inputData;

      const middleware = validate(bodySchema);
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.body).toEqual({ name: 'Bob' });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 400 and validation error details when validation fails', () => {
      req.body = { name: 'Al' }; // Too short, fails minimum length

      const middleware = validate(bodySchema);
      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [
          {
            path: 'name',
            message: 'Name must be at least 3 characters',
          },
        ],
      });
    });

    it('should handle multiple validation errors', () => {
      req.body = { name: 'Al', age: -5 };

      const middleware = validate(bodySchema);
      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: expect.arrayContaining([
            expect.objectContaining({ path: 'name' }),
            expect.objectContaining({ path: 'age' }),
          ]),
        })
      );
    });
  });

  describe('validateQuery', () => {
    it('should call next() and populate req.query when validation succeeds', () => {
      const validQuery = { search: 'test', limit: '10' };
      req.query = validQuery as any;

      const middleware = validateQuery(querySchema);
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.query).toEqual(validQuery);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should strip unknown fields and update req.query when validation succeeds', () => {
      req.query = { search: 'hello', extra: 'world' } as any;

      const middleware = validateQuery(querySchema);
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.query).toEqual({ search: 'hello' });
    });

    it('should return 400 and validation error details when validation fails', () => {
      req.query = { limit: 'abc' } as any;

      const middleware = validateQuery(querySchema);
      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        details: [
          {
            path: 'limit',
            message: 'Limit must be a number string',
          },
        ],
      });
    });
  });
});
