import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveUser, requireRole, requireParticipant } from '../middleware/rbac';
import { Request, Response, NextFunction } from 'express';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Mock db
const selectQueue: any[] = [];
function makeSelectChain(result: any) {
  const chain: any = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = () => Promise.resolve(result);
  return chain;
}

const mockDb = {
  select: () => makeSelectChain(selectQueue.shift() ?? []),
};

vi.mock('../db/db', () => ({
  getDb: () => mockDb,
}));

// Helper to create express objects
function createMockExpress() {
  const req = {
    auth: {},
    params: {},
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('RBAC Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue.length = 0;
  });

  describe('resolveUser', () => {
    it('returns 401 if missing authentication subject', async () => {
      const { req, res, next } = createMockExpress();
      req.auth = {}; // No payload or sub

      await resolveUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing authentication subject' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 if user not found in database', async () => {
      const { req, res, next } = createMockExpress();
      req.auth = { payload: { sub: 'auth0|123' } };
      selectQueue.push([]); // DB returns empty array

      await resolveUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found. Please sync your account first.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('sets req.user and calls next if user found', async () => {
      const { req, res, next } = createMockExpress();
      req.auth = { payload: { sub: 'auth0|123' } };
      const mockUser = { id: 1, auth0Id: 'auth0|123', role: 'client' };
      selectQueue.push([mockUser]);

      await resolveUser(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 500 on database error', async () => {
      const { req, res, next } = createMockExpress();
      req.auth = { payload: { sub: 'auth0|123' } };
      // Make DB throw
      vi.spyOn(mockDb, 'select').mockImplementationOnce(() => {
        throw new Error('DB Error');
      });

      await resolveUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('returns 401 if req.user is missing', () => {
      const { req, res, next } = createMockExpress();
      const middleware = requireRole('admin');

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 if user role is not allowed', () => {
      const { req, res, next } = createMockExpress();
      req.user = { id: 1, role: 'client' } as any;
      const middleware = requireRole('admin', 'reader');

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next if user role is allowed', () => {
      const { req, res, next } = createMockExpress();
      req.user = { id: 1, role: 'reader' } as any;
      const middleware = requireRole('admin', 'reader');

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireParticipant', () => {
    it('returns 400 if reading ID is invalid', async () => {
      const { req, res, next } = createMockExpress();
      req.params = { id: 'invalid' };

      await requireParticipant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid reading ID' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 404 if reading not found', async () => {
      const { req, res, next } = createMockExpress();
      req.params = { id: '1' };
      selectQueue.push([]); // DB returns empty array

      await requireParticipant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Reading not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 if req.user is missing', async () => {
      const { req, res, next } = createMockExpress();
      req.params = { id: '1' };
      selectQueue.push([{ id: 1, clientId: 1, readerId: 2 }]);

      await requireParticipant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 if user is not participant', async () => {
      const { req, res, next } = createMockExpress();
      req.params = { id: '1' };
      req.user = { id: 3 } as any; // Not 1 or 2
      selectQueue.push([{ id: 1, clientId: 1, readerId: 2 }]);

      await requireParticipant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'You are not a participant in this reading' });
      expect(next).not.toHaveBeenCalled();
    });

    it('sets req.reading and calls next if user is client', async () => {
      const { req, res, next } = createMockExpress();
      req.params = { id: '1' };
      req.user = { id: 1 } as any;
      const mockReading = { id: 1, clientId: 1, readerId: 2 };
      selectQueue.push([mockReading]);

      await requireParticipant(req, res, next);

      expect(req.reading).toEqual(mockReading);
      expect(next).toHaveBeenCalled();
    });

    it('sets req.reading and calls next if user is reader', async () => {
      const { req, res, next } = createMockExpress();
      req.params = { id: '1' };
      req.user = { id: 2 } as any;
      const mockReading = { id: 1, clientId: 1, readerId: 2 };
      selectQueue.push([mockReading]);

      await requireParticipant(req, res, next);

      expect(req.reading).toEqual(mockReading);
      expect(next).toHaveBeenCalled();
    });

    it('returns 500 on database error', async () => {
      const { req, res, next } = createMockExpress();
      req.params = { id: '1' };
      vi.spyOn(mockDb, 'select').mockImplementationOnce(() => {
        throw new Error('DB Error');
      });

      await requireParticipant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
