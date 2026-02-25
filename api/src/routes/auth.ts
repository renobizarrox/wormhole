import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../db.js';
import type { AuthUser } from '../types/auth.js';

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  tenantName: z.string().min(1),
  tenantSlug: z.string().min(1).regex(/^[a-z0-9-]+$/),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().uuid().optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post<{
    Body: z.infer<typeof registerBody>;
  }>('/auth/register', async (request, reply) => {
    const body = registerBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid body',
        details: body.error.flatten(),
      });
    }

    const { email, password, name, tenantName, tenantSlug } = body.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.status(409).send({
        code: 'CONFLICT',
        message: 'User with this email already exists',
      });
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (existingTenant) {
      return reply.status(409).send({
        code: 'CONFLICT',
        message: 'Tenant slug already taken',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [tenant, user] = await prisma.$transaction([
      prisma.tenant.create({
        data: { name: tenantName, slug: tenantSlug },
      }),
      prisma.user.create({
        data: { email, passwordHash, name: name ?? null },
      }),
    ]);

    const membership = await prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'Owner',
      },
    });

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      membershipId: membership.id,
      role: 'Owner',
    });

    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      role: 'Owner',
    });
  });

  app.post<{
    Body: z.infer<typeof loginBody>;
  }>('/auth/login', async (request, reply) => {
    const body = loginBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid body',
        details: body.error.flatten(),
      });
    }

    const { email, password, tenantId } = body.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    const allMemberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { tenant: true },
    });

    if (allMemberships.length === 0) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'User does not belong to any tenant',
      });
    }

    let membership =
      tenantId != null
        ? allMemberships.find((m) => m.tenantId === tenantId)
        : allMemberships.find((m) => m.role === 'Owner') ?? allMemberships[0];

    if (!membership) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'User is not a member of this tenant',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      role: membership.role,
    });
  });

  const switchTenantBody = z.object({
    tenantId: z.string().uuid(),
  });

  app.post<{
    Body: z.infer<typeof switchTenantBody>;
  }>(
    '/auth/switch-tenant',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = switchTenantBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid body',
          details: body.error.flatten(),
        });
      }

      const payload = request.user as AuthUser;
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'User not found',
        });
      }

      const membership = await prisma.membership.findFirst({
        where: { userId: user.id, tenantId: body.data.tenantId },
        include: { tenant: true },
      });
      if (!membership) {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'User is not a member of this tenant',
        });
      }

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        tenantId: membership.tenantId,
        membershipId: membership.id,
        role: membership.role,
      });

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
        },
        role: membership.role,
      });
    }
  );

  app.get(
    '/auth/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const payload = request.user as AuthUser;
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true },
      });
      if (!user) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' });
      }
      const membership = await prisma.membership.findUnique({
        where: { id: payload.membershipId },
        include: { tenant: true },
      });
      if (!membership) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Membership not found' });
      }
      return reply.send({
        user: { id: user.id, email: user.email, name: user.name },
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
        },
        role: membership.role,
      });
    }
  );
}
