import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import type { JwtPayload } from '../types/auth.js';

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export default async function tenantsRoutes(app: FastifyInstance) {
  app.get(
    '/tenants',
    { preHandler: [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder', 'Viewer')] },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const query = listQuery.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid query',
          details: query.error.flatten(),
        });
      }

      const memberships = await prisma.membership.findMany({
        where: { userId: payload.sub },
        include: { tenant: true },
        take: query.data.limit,
        skip: query.data.offset,
      });

      return reply.send({
        items: memberships.map((m) => ({
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          role: m.role,
        })),
        limit: query.data.limit,
        offset: query.data.offset,
      });
    }
  );
}
