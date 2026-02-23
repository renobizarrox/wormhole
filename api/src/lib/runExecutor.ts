import { prisma } from '../db.js';
import { decrypt } from './encryption.js';

type GraphStep = { stepKey: string; actionId: string; connectionId?: string; inputMapping?: Record<string, unknown> };

export async function executeWorkflowRun(workflowRunId: string): Promise<void> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: {
      workflowVersion: true,
      workflow: true,
      steps: { orderBy: { stepKey: 'asc' } },
    },
  });
  if (!run || run.status !== 'QUEUED') return;

  const graph = run.workflowVersion.graph as { steps?: GraphStep[] };
  const steps = graph?.steps ?? [];
  if (steps.length === 0) {
    await prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: { status: 'SUCCESS', startedAt: new Date(), finishedAt: new Date() },
    });
    return;
  }

  await prisma.workflowRun.update({
    where: { id: workflowRunId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  const runInput = (run.input as Record<string, unknown>) ?? {};
  let lastOutput: unknown = runInput;

  for (const stepDef of steps) {
    const stepRun = run.steps.find((s) => s.stepKey === stepDef.stepKey);
    if (!stepRun) continue;
    const runCheck = await prisma.workflowRun.findUnique({ where: { id: workflowRunId }, select: { status: true } });
    if (runCheck?.status === 'CANCELED') break;

    await prisma.stepRun.update({
      where: { id: stepRun.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      const action = await prisma.action.findUnique({
        where: { id: stepDef.actionId },
        include: { appVersion: { include: { app: true } } },
      });
      if (!action) {
        await prisma.stepRun.update({
          where: { id: stepRun.id },
          data: { status: 'FAILED', finishedAt: new Date(), errorCode: 'ACTION_NOT_FOUND', errorMessage: 'Action not found' },
        });
        await prisma.workflowRun.update({
          where: { id: workflowRunId },
          data: { status: 'FAILED', finishedAt: new Date(), errorCode: 'ACTION_NOT_FOUND', errorMessage: 'Action not found' },
        });
        return;
      }

      let connection: { config: unknown; secretCipher: Buffer } | null = null;
      if (stepDef.connectionId) {
        const conn = await prisma.connection.findFirst({
          where: { id: stepDef.connectionId, tenantId: run.tenantId, appId: action.appVersion.appId, isActive: true },
        });
        if (conn) connection = { config: conn.config, secretCipher: conn.secretCipher };
      }

      const secrets = connection
        ? (JSON.parse(decrypt(connection.secretCipher)) as Record<string, string>)
        : {};
      const baseUrl = (connection?.config as { baseUrl?: string })?.baseUrl ?? '';
      const inputMapping = stepDef.inputMapping ?? {};
      const stepInput: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inputMapping)) {
        if (typeof v === 'string' && v.startsWith('$.')) {
          const path = v.slice(2).split('.');
          let val: unknown = lastOutput;
          for (const p of path) val = (val as Record<string, unknown>)?.[p];
          stepInput[k] = val;
        } else {
          stepInput[k] = v;
        }
      }
      const url = baseUrl + action.endpointTemplate.replace(/\{(\w+)\}/g, (_, k) => String(stepInput[k] ?? ''));
      const headers: Record<string, string> = {};
      if (action.headersTemplate && typeof action.headersTemplate === 'object') {
        for (const [k, v] of Object.entries(action.headersTemplate)) {
          if (typeof v === 'string') {
            headers[k] = v.replace(/\{(\w+)\}/g, (_, key) => secrets[key] ?? String(stepInput[key] ?? ''));
          }
        }
      }
      if (secrets.apiKey) headers['Authorization'] = `Bearer ${secrets.apiKey}`;
      if (secrets.api_key) headers['X-API-Key'] = secrets.api_key;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), action.timeoutMs);
      const res = await fetch(url, {
        method: action.method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: action.method !== 'GET' && Object.keys(stepInput).length ? JSON.stringify(stepInput) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      let output: unknown;
      try {
        output = text ? JSON.parse(text) : null;
      } catch {
        output = text;
      }

      if (!res.ok) {
        await prisma.stepRun.update({
          where: { id: stepRun.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorCode: `HTTP_${res.status}`,
            errorMessage: String(output),
            output: output as object,
          },
        });
        await prisma.workflowRun.update({
          where: { id: workflowRunId },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorCode: `HTTP_${res.status}`,
            errorMessage: String(output),
          },
        });
        return;
      }

      lastOutput = output;
      await prisma.stepRun.update({
        where: { id: stepRun.id },
        data: { status: 'SUCCESS', finishedAt: new Date(), output: output as object },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await prisma.stepRun.update({
        where: { id: stepRun.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorCode: 'EXECUTION_ERROR', errorMessage: message },
      });
      await prisma.workflowRun.update({
        where: { id: workflowRunId },
        data: { status: 'FAILED', finishedAt: new Date(), errorCode: 'EXECUTION_ERROR', errorMessage: message },
      });
      return;
    }
  }

  const runNow = await prisma.workflowRun.findUnique({ where: { id: workflowRunId } });
  if (runNow?.status === 'RUNNING') {
    await prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: { status: 'SUCCESS', finishedAt: new Date() },
    });
  }
}
