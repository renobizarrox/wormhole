import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt } from '../lib/encryption.js';
import type { JwtPayload } from '../types/auth.js';

const createTriggerBody = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['MANUAL', 'WEBHOOK', 'CRON']),
  isActive: z.boolean().optional(),
  manualAllowed: z.boolean().optional(),
  webhookPath: z.string().min(1).optional(),
  webhookSecret: z.string().optional(),
  webhookSignatureHeader: z.string().optional(),
  cronExpression: z.string().optional(),
  cronTimezone: z.string().optional(),
});

const updateTriggerBody = createTriggerBody.partial();

function maskTrigger<T extends { webhookSecretCipher?: Buffer | null }>(row: T) {
  const { webhookSecretCipher, ...rest } = row as T & { webhookSecretCipher?: Buffer };
  return { ...rest, webhookSecretCipher: webhookSecretCipher ? '[REDACTED]' : null };
}

export default async function triggersRoutes(app: FastifyInstance) {
  const canWrite = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder')];
  const canRead = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder', 'Viewer')];

  app.get<{ Params: { workflowId: string } }>(
    '/workflows/:workflowId/triggers',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.workflowId, tenantId: payload.tenantId },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const items = await prisma.trigger.findMany({
        where: { workflowId: w.id },
      });
      return reply.send({ items: items.map(maskTrigger) });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/triggers/:id',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const t = await prisma.trigger.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!t) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Trigger not found' });
      return reply.send(maskTrigger(t));
    }
  );

  app.post<{ Params: { workflowId: string }; Body: z.infer<typeof createTriggerBody> }>(
    '/workflows/:workflowId/triggers',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.workflowId, tenantId: payload.tenantId },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const body = createTriggerBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      if (body.data.type === 'WEBHOOK' && !body.data.webhookPath) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'webhookPath required for WEBHOOK trigger' });
      }
      if (body.data.type === 'CRON' && !body.data.cronExpression) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'cronExpression required for CRON trigger' });
      }
      const existing = await prisma.trigger.findUnique({
        where: { tenantId_key: { tenantId: payload.tenantId, key: body.data.key } },
      });
      if (existing) {
        return reply.status(409).send({ code: 'CONFLICT', message: 'Trigger key already exists' });
      }
      const webhookSecretCipher = body.data.webhookSecret
        ? encrypt(body.data.webhookSecret)
        : null;
      const trigger = await prisma.trigger.create({
        data: {
          tenantId: payload.tenantId,
          workflowId: w.id,
          key: body.data.key,
          name: body.data.name,
          description: body.data.description ?? null,
          type: body.data.type,
          isActive: body.data.isActive ?? true,
          manualAllowed: body.data.manualAllowed ?? body.data.type === 'MANUAL',
          webhookPath: body.data.webhookPath ?? null,
          webhookSecretCipher,
          webhookSignatureHeader: body.data.webhookSignatureHeader ?? null,
          cronExpression: body.data.cronExpression ?? null,
          cronTimezone: body.data.cronTimezone ?? null,
        },
      });
      return reply.status(201).send(maskTrigger(trigger));
    }
  );

  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateTriggerBody> }>(
    '/triggers/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const t = await prisma.trigger.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!t) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Trigger not found' });
      const body = updateTriggerBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const webhookSecretCipher = body.data.webhookSecret !== undefined
        ? (body.data.webhookSecret ? encrypt(body.data.webhookSecret) : null)
        : undefined;
      const updated = await prisma.trigger.update({
        where: { id: t.id },
        data: {
          ...(body.data.key != null && { key: body.data.key }),
          ...(body.data.name != null && { name: body.data.name }),
          ...(body.data.description !== undefined && { description: body.data.description ?? null }),
          ...(body.data.type != null && { type: body.data.type }),
          ...(body.data.isActive != null && { isActive: body.data.isActive }),
          ...(body.data.manualAllowed != null && { manualAllowed: body.data.manualAllowed }),
          ...(body.data.webhookPath !== undefined && { webhookPath: body.data.webhookPath ?? null }),
          ...(webhookSecretCipher !== undefined && { webhookSecretCipher }),
          ...(body.data.webhookSignatureHeader !== undefined && { webhookSignatureHeader: body.data.webhookSignatureHeader ?? null }),
          ...(body.data.cronExpression !== undefined && { cronExpression: body.data.cronExpression ?? null }),
          ...(body.data.cronTimezone !== undefined && { cronTimezone: body.data.cronTimezone ?? null }),
        },
      });
      return reply.send(maskTrigger(updated));
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/triggers/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const t = await prisma.trigger.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!t) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Trigger not found' });
      await prisma.trigger.delete({ where: { id: t.id } });
      return reply.status(204).send();
    }
  );
}
