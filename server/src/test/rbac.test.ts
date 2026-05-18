import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireRole } from '../middleware/rbac';
import { Request, Response, NextFunction } from 'express';

describe('RBAC Middleware - requireRole', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    nextFunction = vi.fn();
  });

  it('should return 401 if req.user is undefined', () => {
    const middleware = requireRole('admin');

    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 403 if user role is not in allowed roles', () => {
    mockRequest.user = { role: 'client' } as any;
    const middleware = requireRole('admin', 'reader');

    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next if user role is in allowed roles', () => {
    mockRequest.user = { role: 'admin' } as any;
    const middleware = requireRole('admin', 'reader');

    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(mockResponse.json).not.toHaveBeenCalled();
    expect(nextFunction).toHaveBeenCalled();
  });
});
