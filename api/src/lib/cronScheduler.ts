import cron from 'node-cron';
import { prisma } from '../db.js';
import { executeWorkflowRun } from './runExecutor.js';
import { addWorkflowRunJob } from './queue.js';
import type { Prisma } from '@prisma/client';

const json = (v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

async function fireCronTrigger(
  triggerId: string,
  log: { info: (o: object, msg: string) => void; error: (o: object, msg: string) => void }
): Promise<void> {
  const trigger = await prisma.trigger.findUnique({
    where: { id: triggerId },
    include: { workflow: { include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: 'desc' }, take: 1 } } } },
  });
  if (!trigger || !trigger.isActive || trigger.type !== 'CRON' || !trigger.cronExpression) return;
  const version = trigger.workflow.versions[0];
  if (!version) return;
  const graph = version.graph as { steps?: { stepKey: string; actionId?: string }[] };
  const steps = graph?.steps ?? [];
  try {
    const run = await prisma.workflowRun.create({
      data: {
        tenantId: trigger.tenantId,
        workflowId: trigger.workflowId,
        workflowVersionId: version.id,
        triggerId: trigger.id,
        status: 'QUEUED',
        input: json({ triggeredAt: new Date().toISOString(), trigger: 'cron' }),
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
    if (!enqueued) executeWorkflowRun(run.id).catch((err) => log.error({ err, workflowRunId: run.id }, 'cron executeWorkflowRun failed'));
    log.info({ workflowRunId: run.id, triggerId: trigger.id }, 'Cron run created');
  } catch (err) {
    log.error({ err, triggerId }, 'Cron run create failed');
  }
}

export function startCronScheduler(log: { info: (o: object, msg: string) => void; error: (o: object, msg: string) => void }): void {
  async function registerCronTriggers() {
    const triggers = await prisma.trigger.findMany({
      where: { type: 'CRON', isActive: true, cronExpression: { not: null } },
      select: { id: true, cronExpression: true },
    });
    for (const t of triggers) {
      if (!t.cronExpression || !cron.validate(t.cronExpression)) continue;
      cron.schedule(t.cronExpression, () => fireCronTrigger(t.id, log));
    }
  }
  registerCronTriggers().then(() => log.info({}, 'Cron scheduler: triggers registered')).catch((err) => log.error({ err }, 'Cron scheduler: failed to register'));
}
