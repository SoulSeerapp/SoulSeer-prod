import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireParticipant, resolveUser, requireRole } from '../rbac';
import { Request, Response, NextFunction } from 'express';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });

vi.mock('../../db/db', () => ({
  getDb: () => ({ select: mockSelect }),
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn() }
}));

describe('rbac middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { params: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('resolveUser error edge case', () => {
    it('returns 500 on db error', async () => {
      req.auth = { payload: { sub: 'auth0|123' } } as any;
      mockLimit.mockRejectedValueOnce(new Error('DB connection failed'));
      await resolveUser(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('requireParticipant edge cases', () => {
    it('returns 400 for invalid reading id', async () => {
      req.params = { id: 'invalid' };
      await requireParticipant(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
