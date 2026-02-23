/**
 * Security hardening: auth and role checks.
 * - Unauthenticated request to protected route → 401
 * - Viewer calling write route (requires Builder) → 403
 * - Valid token with allowed role → request proceeds (handler may return 200 with mocked data)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types/auth.js';

const mockFindMany = vi.fn().mockResolvedValue([]);
vi.mock('../db.js', () => ({
  prisma: {
    app: { findMany: mockFindMany },
    workflowRun: { findMany: vi.fn().mockResolvedValue([]) },
    workflow: { findMany: vi.fn().mockResolvedValue([]) },
    connection: { findMany: vi.fn().mockResolvedValue([]) },
    tenant: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe('Auth and RBAC', () => {
  let app: Awaited<ReturnType<typeof import('../app.js').buildApp>>;

  beforeAll(async () => {
    const { buildApp } = await import('../app.js');
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  function signToken(overrides: Partial<JwtPayload> = {}): string {
    const secret = process.env.JWT_SECRET ?? 'test-secret-min-32-chars-long!!!!!!!!';
    const payload: JwtPayload = {
      sub: 'user-id',
      email: 'u@example.com',
      tenantId: 'tenant-id',
      membershipId: 'mem-id',
      role: 'Viewer',
      ...overrides,
    };
    return jwt.sign(payload, secret, { issuer: 'wormhole-api', expiresIn: '1h' });
  }

  it('returns 401 for unauthenticated request to protected route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/apps',
      headers: {},
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when Viewer calls write route (requires Builder)', async () => {
    const token = signToken({ role: 'Viewer' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/apps',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        key: 'test-app',
        name: 'Test',
        authType: 'API_KEY',
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FORBIDDEN');
    expect(body.message).toMatch(/[Ii]nsufficient role/);
  });

  it('allows Viewer to call read route (GET /api/apps)', async () => {
    const token = signToken({ role: 'Viewer' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/apps',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });
});
