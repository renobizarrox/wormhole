import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { JwtPayload } from '../types/auth.js';

const json = (v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

const createAppBody = z.object({
  key: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  vendor: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  iconUrl: z.string().url().optional(),
  authType: z.enum(['API_KEY', 'OAUTH2', 'BASIC', 'CUSTOM_HEADER']),
  settingsSchema: z.record(z.unknown()).nullable().optional(),
});

const updateAppBody = z.object({
  name: z.string().min(1).optional(),
  vendor: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  iconUrl: z.string().url().optional().nullable(),
  status: z.enum(['Draft', 'Published', 'Deprecated']).optional(),
});

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export default async function appsRoutes(app: FastifyInstance) {
  const canWrite = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder')];
  const canRead = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder', 'Viewer')];

  app.get<{ Querystring: z.infer<typeof listQuery> }>(
    '/apps',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const query = listQuery.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid query', details: query.error.flatten() });
      }
      const apps = await prisma.app.findMany({
        where: { tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        take: query.data.limit,
        skip: query.data.offset,
      });
      return reply.send({ items: apps, limit: query.data.limit, offset: query.data.offset });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/apps/:id',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id } = request.params;
      const app = await prisma.app.findFirst({
        where: { id, tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' }, include: { actions: true } } },
      });
      if (!app) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      return reply.send(app);
    }
  );

  app.post<{ Body: z.infer<typeof createAppBody> }>(
    '/apps',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const body = createAppBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const existing = await prisma.app.findUnique({
        where: { tenantId_key: { tenantId: payload.tenantId, key: body.data.key } },
      });
      if (existing) {
        return reply.status(409).send({ code: 'CONFLICT', message: 'App key already exists for this tenant' });
      }
      const app = await prisma.$transaction(async (tx) => {
        const created = await tx.app.create({
          data: {
            tenantId: payload.tenantId,
            key: body.data.key,
            name: body.data.name,
            vendor: body.data.vendor ?? null,
            category: body.data.category ?? null,
            description: body.data.description ?? null,
            iconUrl: body.data.iconUrl ?? null,
          },
        });
        await tx.appVersion.create({
          data: {
            appId: created.id,
            version: 1,
            authType: body.data.authType,
            settingsSchema: json(body.data.settingsSchema ?? undefined),
          },
        });
        return tx.app.findUniqueOrThrow({
          where: { id: created.id },
          include: { versions: true },
        });
      });
      return reply.status(201).send(app);
    }
  );

  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateAppBody> }>(
    '/apps/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id } = request.params;
      const body = updateAppBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const app = await prisma.app.findFirst({
        where: { id, tenantId: payload.tenantId },
      });
      if (!app) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      const updated = await prisma.app.update({
        where: { id },
        data: {
          ...(body.data.name != null && { name: body.data.name }),
          ...(body.data.vendor !== undefined && { vendor: body.data.vendor ?? null }),
          ...(body.data.category !== undefined && { category: body.data.category ?? null }),
          ...(body.data.description !== undefined && { description: body.data.description ?? null }),
          ...(body.data.iconUrl !== undefined && { iconUrl: body.data.iconUrl }),
          ...(body.data.status != null && { status: body.data.status }),
        },
      });
      return reply.send(updated);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/apps/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id } = request.params;
      const app = await prisma.app.findFirst({
        where: { id, tenantId: payload.tenantId },
      });
      if (!app) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      await prisma.app.delete({ where: { id } });
      return reply.status(204).send();
    }
  );

  app.get<{ Params: { id: string } }>(
    '/apps/:id/versions',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id } = request.params;
      const app = await prisma.app.findFirst({
        where: { id, tenantId: payload.tenantId },
      });
      if (!app) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      const versions = await prisma.appVersion.findMany({
        where: { appId: id },
        orderBy: { version: 'desc' },
        include: { actions: true },
      });
      return reply.send({ items: versions });
    }
  );

  const createVersionBody = z.object({
    authType: z.enum(['API_KEY', 'OAUTH2', 'BASIC', 'CUSTOM_HEADER']),
    settingsSchema: z.record(z.unknown()).nullable().optional(),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof createVersionBody> }>(
    '/apps/:id/versions',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id } = request.params;
      const body = createVersionBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const app = await prisma.app.findFirst({
        where: { id, tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!app) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      const nextVersion = (app.versions[0]?.version ?? 0) + 1;
      const version = await prisma.appVersion.create({
        data: {
          appId: id,
          version: nextVersion,
          authType: body.data.authType,
          settingsSchema: json(body.data.settingsSchema ?? undefined),
        },
      });
      return reply.status(201).send(version);
    }
  );

  const publishBody = z.object({ appVersionId: z.string().uuid().optional() });

  app.post<{ Params: { id: string }; Body: z.infer<typeof publishBody> }>(
    '/apps/:id/publish',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id } = request.params;
      const body = publishBody.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const app = await prisma.app.findFirst({
        where: { id, tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
      if (!app) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      const versionToPublish = body.data.appVersionId
        ? app.versions.find((v) => v.id === body.data.appVersionId)
        : app.versions[0];
      if (!versionToPublish) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App version not found' });
      }
      await prisma.$transaction([
        prisma.appVersion.update({
          where: { id: versionToPublish.id },
          data: { publishedAt: new Date() },
        }),
        prisma.app.update({
          where: { id },
          data: { status: 'Published' },
        }),
      ]);
      const updated = await prisma.appVersion.findUniqueOrThrow({
        where: { id: versionToPublish.id },
      });
      return reply.send(updated);
    }
  );
}
