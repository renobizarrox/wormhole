import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { executeWorkflowRun, executeSingleStep } from '../lib/runExecutor.js';
import { addWorkflowRunJob } from '../lib/queue.js';
import type { JwtPayload } from '../types/auth.js';

const json = (v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

const runWorkflowBody = z.object({
  workflowVersionId: z.string().uuid().optional(),
  input: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

const runStepBody = z.object({
  stepKey: z.string().min(1),
  input: z.record(z.unknown()).optional(),
});

const listRunsQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  workflowId: z.string().uuid().optional(),
  status: z.enum(['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED']).optional(),
});

export default async function runsRoutes(app: FastifyInstance) {
  const canWrite = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder')];
  const canRead = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder', 'Viewer')];

  app.post<{ Params: { id: string }; Body: z.infer<typeof runWorkflowBody> }>(
    '/workflows/:id/run',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const body = runWorkflowBody.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const version = body.data.workflowVersionId
        ? w.versions.find((v) => v.id === body.data!.workflowVersionId) ?? w.versions[0]
        : w.versions[0];
      if (!version) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'No published version to run' });
      }
      const graph = version.graph as { steps?: { stepKey: string; actionId?: string }[] };
      const steps = graph?.steps ?? [];
      if (body.data.idempotencyKey) {
        const existing = await prisma.workflowRun.findFirst({
          where: { tenantId: payload.tenantId, idempotencyKey: body.data.idempotencyKey },
        });
        if (existing) {
          return reply.send({ workflowRunId: existing.id, status: existing.status });
        }
      }
      const manualTrigger = await prisma.trigger.findFirst({
        where: { workflowId: w.id, tenantId: payload.tenantId, type: 'MANUAL', manualAllowed: true, isActive: true },
      });
      const run = await prisma.workflowRun.create({
        data: {
          tenantId: payload.tenantId,
          workflowId: w.id,
          workflowVersionId: version.id,
          triggerId: manualTrigger?.id ?? null,
          status: 'QUEUED',
          idempotencyKey: body.data.idempotencyKey ?? null,
          input: json(body.data.input ?? undefined),
        },
      });
      for (const s of steps) {
        await prisma.stepRun.create({
          data: {
            workflowRunId: run.id,
            stepKey: s.stepKey,
            actionId: 'actionId' in s ? s.actionId ?? null : null,
            status: 'QUEUED',
          },
        });
      }
      const enqueued = await addWorkflowRunJob(run.id);
      if (!enqueued) executeWorkflowRun(run.id).catch((err) => request.log.error(err, 'executeWorkflowRun failed'));
      return reply.status(201).send({ workflowRunId: run.id, status: run.status });
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof runStepBody> }>(
    '/workflows/:id/run-step',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const workflowId = request.params.id;
      const body = runStepBody.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const w = await prisma.workflow.findFirst({
        where: { id: workflowId, tenantId: payload.tenantId },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const result = await executeSingleStep(
        workflowId,
        payload.tenantId,
        body.data.stepKey,
        body.data.input ?? {}
      );
      await prisma.workflowStepOutput.upsert({
        where: {
          workflowId_stepKey: { workflowId, stepKey: body.data.stepKey },
        },
        create: {
          workflowId,
          stepKey: body.data.stepKey,
          success: result.success,
          output: result.success ? (result.output as Prisma.InputJsonValue) : undefined,
          error: result.success ? undefined : result.error,
        },
        update: {
          success: result.success,
          output: result.success ? (result.output as Prisma.InputJsonValue) : undefined,
          error: result.success ? undefined : result.error,
        },
      });
      if (result.success) {
        return reply.send({ success: true, output: result.output });
      }
      return reply.send({ success: false, error: result.error });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/workflows/:id/step-outputs',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const w = await prisma.workflow.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { stepOutputsCache: true },
      });
      if (!w) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Workflow not found' });
      const map: Record<string, { success: true; output: unknown } | { success: false; error: string }> = {};
      for (const row of w.stepOutputsCache) {
        map[row.stepKey] = row.success
          ? { success: true, output: row.output ?? undefined }
          : { success: false, error: row.error ?? 'Unknown error' };
      }
      return reply.send(map);
    }
  );

  app.get<{ Querystring: z.infer<typeof listRunsQuery> }>(
    '/runs',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const query = listRunsQuery.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid query', details: query.error.flatten() });
      }
      const where = { tenantId: payload.tenantId } as Record<string, unknown>;
      if (query.data.workflowId) where.workflowId = query.data.workflowId;
      if (query.data.status) where.status = query.data.status;
      const items = await prisma.workflowRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.data.limit,
        skip: query.data.offset,
        include: { workflow: { select: { id: true, name: true, key: true } } },
      });
      return reply.send({ items, limit: query.data.limit, offset: query.data.offset });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/runs/:id',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const run = await prisma.workflowRun.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { workflow: true, workflowVersion: true, trigger: true },
      });
      if (!run) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Run not found' });
      return reply.send(run);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/runs/:id/steps',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const run = await prisma.workflowRun.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!run) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Run not found' });
      const steps = await prisma.stepRun.findMany({
        where: { workflowRunId: run.id },
        orderBy: { stepKey: 'asc' },
        include: { action: { select: { id: true, key: true, name: true } } },
      });
      return reply.send({ items: steps });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/runs/:id/logs',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const run = await prisma.workflowRun.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { steps: { orderBy: { stepKey: 'asc' } } },
      });
      if (!run) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Run not found' });
      const logs = run.steps.map((s) => ({
        stepRunId: s.id,
        stepKey: s.stepKey,
        status: s.status,
        message: s.errorMessage ?? (s.status === 'SUCCESS' ? 'Step completed' : 'Pending'),
        output: s.output,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
      }));
      return reply.send({ items: logs });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/runs/:id/cancel',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const run = await prisma.workflowRun.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!run) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Run not found' });
      if (run.status !== 'QUEUED' && run.status !== 'RUNNING') {
        return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Run cannot be canceled' });
      }
      await prisma.$transaction([
        prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: 'CANCELED', canceledAt: new Date() },
        }),
        prisma.stepRun.updateMany({
          where: { workflowRunId: run.id, status: 'QUEUED' },
          data: { status: 'CANCELED' },
        }),
      ]);
      const updated = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
      return reply.send(updated);
    }
  );

  app.post<{ Params: { id: string } }>(
    '/runs/:id/rerun',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const existing = await prisma.workflowRun.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { workflowVersion: true },
      });
      if (!existing) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Run not found' });
      const graph = existing.workflowVersion.graph as { steps?: { stepKey: string; actionId: string }[] };
      const steps = graph?.steps ?? [];
      const run = await prisma.workflowRun.create({
        data: {
          tenantId: payload.tenantId,
          workflowId: existing.workflowId,
          workflowVersionId: existing.workflowVersionId,
          triggerId: existing.triggerId,
          status: 'QUEUED',
          input: (existing.input != null ? existing.input : undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      for (const s of steps) {
        await prisma.stepRun.create({
          data: {
            workflowRunId: run.id,
            stepKey: s.stepKey,
            actionId: 'actionId' in s ? s.actionId ?? null : null,
            status: 'QUEUED',
          },
        });
      }
      const enqueued = await addWorkflowRunJob(run.id);
      if (!enqueued) executeWorkflowRun(run.id).catch((err) => request.log.error(err, 'executeWorkflowRun failed'));
      return reply.status(201).send({ workflowRunId: run.id, status: run.status });
    }
  );
}
