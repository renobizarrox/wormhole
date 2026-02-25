import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { decrypt } from '../lib/encryption.js';
import { executeWorkflowRun } from '../lib/runExecutor.js';
import { addWorkflowRunJob } from '../lib/queue.js';
import type { Prisma } from '@prisma/client';

const json = (v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

/** POST /api/webhooks/:tenantId/:webhookPath - no auth; trigger identified by tenant + path. Signature in header. */
export default async function webhooksRoutes(app: FastifyInstance) {
  app.post<{
    Params: { tenantId: string; webhookPath: string };
    Body: unknown;
    Headers: { [k: string]: string | undefined };
  }>(
    '/webhooks/:tenantId/:webhookPath',
    async (request, reply) => {
      const { tenantId, webhookPath } = request.params;
      const trigger = await prisma.trigger.findFirst({
        where: { tenantId, webhookPath, type: 'WEBHOOK', isActive: true },
        include: { workflow: { include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: 'desc' }, take: 1 } } } },
      });
      if (!trigger) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Webhook not found' });
      }
      const version = trigger.workflow.versions[0];
      if (!version) {
        return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Workflow has no published version' });
      }
      if (trigger.webhookSecretCipher) {
        const sigHeader = trigger.webhookSignatureHeader ?? 'x-signature';
        const signature = request.headers[sigHeader.toLowerCase()] ?? request.headers[sigHeader];
        if (!signature || typeof signature !== 'string') {
          return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Missing signature' });
        }
        const secret = decrypt(trigger.webhookSecretCipher);
        const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
        const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
        const provided = signature.replace(/^sha256=/, '');
        if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))) {
          return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid signature' });
        }
      }
      const graph = version.graph as { steps?: { stepKey: string; actionId?: string }[] };
      const steps = graph?.steps ?? [];
      const run = await prisma.workflowRun.create({
        data: {
          tenantId: trigger.tenantId,
          workflowId: trigger.workflowId,
          workflowVersionId: version.id,
          triggerId: trigger.id,
          status: 'QUEUED',
          input: json((request.body as Record<string, unknown>) ?? {}),
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
      return reply.status(202).send({ workflowRunId: run.id, status: 'QUEUED' });
    }
  );
}
