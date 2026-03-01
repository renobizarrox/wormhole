import { prisma } from '../db.js';
import { decrypt } from './encryption.js';
import type { StepDef, AppStep, MapStep, FilterStep, LoopStep, IfStep } from '../types/workflowSteps.js';
import { isAppStep } from '../types/workflowSteps.js';

type RunContext = {
  workflowRunId: string;
  tenantId: string;
  runInput: Record<string, unknown>;
  outputsByStepKey: Record<string, unknown>;
  stepRunsByKey: Map<string, { id: string }>;
};

function runUserCode<T>(code: string, input: unknown): T {
  const fn = new Function('input', `
    "use strict";
    try {
      return (${code})(input);
    } catch (e) {
      throw new Error(\`\${e.message}\`);
    }
  `);
  const result = fn(input);
  return result as T;
}

function runUserCondition(condition: string, input: unknown): boolean {
  const fn = new Function('input', `
    "use strict";
    try {
      return Boolean((${condition}));
    } catch (e) {
      throw new Error(\`Condition error: \${e.message}\`);
    }
  `);
  return fn(input);
}

async function executeAppStep(
  stepDef: AppStep,
  ctx: RunContext
): Promise<unknown> {
  const action = await prisma.action.findUnique({
    where: { id: stepDef.actionId },
    include: { appVersion: { include: { app: true } } },
  });
  if (!action) throw new Error('Action not found');

  let connection: { config: unknown; secretCipher: Buffer } | null = null;
  if (stepDef.connectionId) {
    const conn = await prisma.connection.findFirst({
      where: {
        id: stepDef.connectionId,
        tenantId: ctx.tenantId,
        appId: action.appVersion.appId,
        isActive: true,
      },
    });
    if (conn) connection = { config: conn.config, secretCipher: conn.secretCipher };
  }

  const secrets = connection
    ? (JSON.parse(decrypt(connection.secretCipher)) as Record<string, string>)
    : {};
  const appBaseUrl = (action.appVersion.app as { baseUrl?: string | null })?.baseUrl ?? '';
  const connectionBaseUrl = (connection?.config as { baseUrl?: string })?.baseUrl ?? '';
  const baseUrl =
    action.overrideBaseUrl && action.baseUrlOverride
      ? action.baseUrlOverride
      : connectionBaseUrl || appBaseUrl || '';
  const inputMapping = stepDef.inputMapping ?? {};
  const stepInput: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inputMapping)) {
    if (typeof v === 'string' && v.startsWith('$.')) {
      const path = v.slice(2).split('.');
      const first = path[0];
      let val: unknown = first === 'currentItem' ? ctx.outputsByStepKey['_currentItem'] : ctx.outputsByStepKey[first];
      for (let i = 1; i < path.length && val !== undefined; i++) val = (val as Record<string, unknown>)?.[path[i]];
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
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(output)}`);
  }
  return output;
}

async function executeOneStep(stepDef: StepDef, ctx: RunContext): Promise<unknown> {
  if (isAppStep(stepDef)) {
    return executeAppStep(stepDef, ctx);
  }

  const native = stepDef as MapStep | FilterStep | LoopStep | IfStep;
  const sourceKey = native.sourceStepKey?.trim();
  if (!sourceKey) {
    throw new Error(`Step "${native.stepKey}" is not connected to a source. Connect it to another step or trigger.`);
  }
  const sourceOutput = ctx.outputsByStepKey[sourceKey];
  if (sourceOutput === undefined) {
    throw new Error(`Source step "${sourceKey}" output not found`);
  }

  switch (native.type) {
    case 'MAP': {
      const result = runUserCode<unknown[]>(native.code, sourceOutput);
      if (!Array.isArray(result)) {
        throw new Error('Map code must return an array');
      }
      return result;
    }
    case 'FILTER': {
      const result = runUserCode<unknown[]>(native.code, sourceOutput);
      if (!Array.isArray(result)) {
        throw new Error('Filter code must return an array');
      }
      return result;
    }
    case 'LOOP': {
      const arr = Array.isArray(sourceOutput) ? sourceOutput : [];
      const results: unknown[] = [];
      const bodySteps = native.bodySteps ?? [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const loopCtx: RunContext = {
          ...ctx,
          outputsByStepKey: { ...ctx.outputsByStepKey, _currentItem: item },
        };
        let last: unknown = item;
        for (const bodyStep of bodySteps) {
          last = await executeOneStep(bodyStep, loopCtx);
          loopCtx.outputsByStepKey[bodyStep.stepKey] = last;
        }
        results.push(last);
      }
      return results;
    }
    case 'IF': {
      let chosen: StepDef[] | undefined;
      for (const branch of native.branches) {
        try {
          if (runUserCondition(branch.condition, sourceOutput)) {
            chosen = branch.steps;
            break;
          }
        } catch {
          // condition error: skip branch
        }
      }
      if (!chosen && native.elseSteps?.length) chosen = native.elseSteps;
      if (!chosen || chosen.length === 0) return sourceOutput;
      const ifCtx: RunContext = { ...ctx, outputsByStepKey: { ...ctx.outputsByStepKey } };
      let last: unknown = sourceOutput;
      for (const s of chosen) {
        last = await executeOneStep(s, ifCtx);
        ifCtx.outputsByStepKey[s.stepKey] = last;
      }
      return last;
    }
    default:
      throw new Error(`Unknown native step type: ${(native as { type: string }).type}`);
  }
}

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

  const graph = run.workflowVersion.graph as { steps?: StepDef[] };
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
  const outputsByStepKey: Record<string, unknown> = { input: runInput };
  const stepRunsByKey = new Map<string, { id: string }>();
  for (const sr of run.steps) {
    stepRunsByKey.set(sr.stepKey, { id: sr.id });
  }

  const ctx: RunContext = {
    workflowRunId,
    tenantId: run.tenantId,
    runInput,
    outputsByStepKey,
    stepRunsByKey,
  };

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
      const output = await executeOneStep(stepDef, ctx);
      outputsByStepKey[stepDef.stepKey] = output;

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
