import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { JwtPayload } from '../types/auth.js';

const json = (v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

const createWorkflowBody = z.object({
  key: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateWorkflowBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['Draft', 'Active', 'Archived']).optional(),
});

/** graph.steps: { stepKey, actionId, connectionId?, inputMapping? }[] */
const graphSchema = z.object({
  steps: z.array(z.object({
    stepKey: z.string(),
    actionId: z.string().uuid(),
    connectionId: z.string().uuid().optional(),
    inputMapping: z.record(z.unknown()).optional(),
  })),
});

const createVersionBody = z.object({
  graph: graphSchema,
  parameterSchema: z.record(z.unknown()).nullable().optional(),
  envConfig: z.record(z.unknown()).nullable().optional(),
});

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export default async function workflowsRoutes(app: FastifyInstance) {
  const canWrite = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder')];
  const canRead = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder', 'Viewer')];

  app.get<{ Querystring: z.infer<typeof listQuery> }>(
    '/workflows',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const query = listQuery.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid query', details: query.error.flatten() });
      }
      const items = await prisma.workflow.findMany({
        where: { tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        take: query.data.limit,
        skip: query.data.offset,
      });
      return reply.send({ items, limit: query.data.limit, offset: query.data.offset });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/workflows/:id',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' } }, triggers: true },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      return reply.send(w);
    }
  );

  app.post<{ Body: z.infer<typeof createWorkflowBody> }>(
    '/workflows',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const body = createWorkflowBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const existing = await prisma.workflow.findUnique({
        where: { tenantId_key: { tenantId: payload.tenantId, key: body.data.key } },
      });
      if (existing) {
        return reply.status(409).send({ code: 'CONFLICT', message: 'Workflow key already exists' });
      }
      const workflow = await prisma.$transaction(async (tx) => {
        const w = await tx.workflow.create({
          data: {
            tenantId: payload.tenantId,
            key: body.data.key,
            name: body.data.name,
            description: body.data.description ?? null,
          },
        });
        await tx.workflowVersion.create({
          data: { workflowId: w.id, version: 1, graph: { steps: [] }, isLatest: true },
        });
        return tx.workflow.findUniqueOrThrow({ where: { id: w.id }, include: { versions: true } });
      });
      return reply.status(201).send(workflow);
    }
  );

  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateWorkflowBody> }>(
    '/workflows/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const body = updateWorkflowBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const updated = await prisma.workflow.update({
        where: { id: w.id },
        data: {
          ...(body.data.name != null && { name: body.data.name }),
          ...(body.data.description !== undefined && { description: body.data.description ?? null }),
          ...(body.data.status != null && { status: body.data.status }),
        },
      });
      return reply.send(updated);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/workflows/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      await prisma.workflow.delete({ where: { id: w.id } });
      return reply.status(204).send();
    }
  );

  app.get<{ Params: { id: string } }>(
    '/workflows/:id/versions',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const versions = await prisma.workflowVersion.findMany({
        where: { workflowId: w.id },
        orderBy: { version: 'desc' },
      });
      return reply.send({ items: versions });
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof createVersionBody> }>(
    '/workflows/:id/versions',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const body = createVersionBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const nextVersion = (w.versions[0]?.version ?? 0) + 1;
      await prisma.workflowVersion.updateMany({
        where: { workflowId: w.id },
        data: { isLatest: false },
      });
      const version = await prisma.workflowVersion.create({
        data: {
          workflowId: w.id,
          version: nextVersion,
          graph: json(body.data.graph as unknown as Record<string, unknown>) ?? { steps: [] },
          parameterSchema: json(body.data.parameterSchema ?? undefined),
          envConfig: json(body.data.envConfig ?? undefined),
          isLatest: true,
        },
      });
      return reply.status(201).send(version);
    }
  );

  const publishBody = z.object({ workflowVersionId: z.string().uuid().optional() });

  app.post<{ Params: { id: string }; Body: z.infer<typeof publishBody> }>(
    '/workflows/:id/publish',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const body = publishBody.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const toPublish = body.data.workflowVersionId
        ? w.versions.find((v) => v.id === body.data!.workflowVersionId)
        : w.versions[0];
      if (!toPublish) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Version not found' });
      await prisma.workflowVersion.update({
        where: { id: toPublish.id },
        data: { publishedAt: new Date() },
      });
      await prisma.workflow.update({
        where: { id: w.id },
        data: { status: 'Active' },
      });
      const updated = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: toPublish.id } });
      return reply.send(updated);
    }
  );
}
