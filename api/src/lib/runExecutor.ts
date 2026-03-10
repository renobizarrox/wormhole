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

/** True if code looks like a function expression so we can call it as (code)(input). */
function isFunctionExpression(code: string): boolean {
  const t = code.trim();
  return (
    t.startsWith('(') ||
    t.startsWith('function') ||
    t.startsWith('async ')
  );
}

function runUserCode<T>(code: string, input: unknown): T {
  const body = isFunctionExpression(code)
    ? `return (${code})(input);`
    : `return (function(input) { ${code} })(input);`;
  const fn = new Function('input', `
    "use strict";
    try {
      ${body}
    } catch (e) {
      throw new Error(\`\${e.message}\`);
    }
  `);
  const result = fn(input);
  return result as T;
}

function runUserCondition(condition: string, input: unknown): boolean {
  const body = isFunctionExpression(condition)
    ? `return Boolean((${condition})(input));`
    : `return Boolean((function(input) { ${condition} })(input));`;
  const fn = new Function('input', `
    "use strict";
    try {
      ${body}
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

  switch (native.type) {
    case 'MAP': {
      // Multi-input mapper: build an input object keyed by selected source step keys.
      const mapNative = native as MapStep & { sourceStepKeys?: string[] };
      const keys =
        (Array.isArray((mapNative as any).sourceStepKeys) && (mapNative as any).sourceStepKeys.length
          ? ((mapNative as any).sourceStepKeys as string[])
          : (mapNative.sourceStepKey ? [mapNative.sourceStepKey] : []));
      if (!keys.length) {
        throw new Error(`Step "${mapNative.stepKey}" has no inputs selected. Choose one or more previous steps.`);
      }
      const input: Record<string, unknown> = {};
      for (const rawKey of keys) {
        const key = rawKey.trim();
        if (!key) continue;
        // Prefer explicit runInput (used by executeSingleStep where the UI passes a pre-built input object),
        // otherwise fall back to the outputsByStepKey map (full workflow runs).
        const fromRunInput =
          ctx.runInput && Object.prototype.hasOwnProperty.call(ctx.runInput, key)
            ? (ctx.runInput as Record<string, unknown>)[key]
            : undefined;
        input[key] = fromRunInput !== undefined ? fromRunInput : ctx.outputsByStepKey[key];
      }
      const result = runUserCode<unknown>(mapNative.code, input);
      if (result === undefined || result === null) {
        throw new Error('Map code must return an array');
      }
      return Array.isArray(result) ? result : [result];
    }
    case 'FILTER': {
      const sourceKey = (native.dataStepKey ?? native.sourceStepKey)?.trim();
      if (!sourceKey) {
        throw new Error(`Step "${native.stepKey}" is not connected to a source. Connect it to another step or trigger.`);
      }
      const sourceOutput = ctx.outputsByStepKey[sourceKey];
      if (sourceOutput === undefined) {
        throw new Error(`Source step "${sourceKey}" output not found`);
      }
      const result = runUserCode<unknown[]>(native.code, sourceOutput);
      if (!Array.isArray(result)) {
        throw new Error('Filter code must return an array');
      }
      return result;
    }
    case 'LOOP': {
      const sourceKey = (native.dataStepKey ?? native.sourceStepKey)?.trim();
      if (!sourceKey) {
        throw new Error(`Step "${native.stepKey}" is not connected to a source. Connect it to another step or trigger.`);
      }
      const sourceOutput = ctx.outputsByStepKey[sourceKey];
      if (sourceOutput === undefined) {
        throw new Error(`Source step "${sourceKey}" output not found`);
      }
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
      const ifNative = native as IfStep & { sourceStepKeys?: string[] };
      const keys =
        (Array.isArray((ifNative as any).sourceStepKeys) && (ifNative as any).sourceStepKeys.length
          ? ((ifNative as any).sourceStepKeys as string[])
          : (ifNative.dataStepKey ? [ifNative.dataStepKey] : ifNative.sourceStepKey ? [ifNative.sourceStepKey] : []));
      if (!keys.length) {
        throw new Error(`Step "${ifNative.stepKey}" has no inputs selected. Choose one or more previous steps.`);
      }
      const conditionInput: unknown = (() => {
        if (keys.length === 1) {
          const key = keys[0]?.trim();
          if (!key) return undefined;
          const fromRunInput =
            ctx.runInput && Object.prototype.hasOwnProperty.call(ctx.runInput, key)
              ? (ctx.runInput as Record<string, unknown>)[key]
              : undefined;
          return fromRunInput !== undefined ? fromRunInput : ctx.outputsByStepKey[key];
        }
        const obj: Record<string, unknown> = {};
        for (const rawKey of keys) {
          const key = rawKey.trim();
          if (!key) continue;
          const fromRunInput =
            ctx.runInput && Object.prototype.hasOwnProperty.call(ctx.runInput, key)
              ? (ctx.runInput as Record<string, unknown>)[key]
              : undefined;
          obj[key] = fromRunInput !== undefined ? fromRunInput : ctx.outputsByStepKey[key];
        }
        return obj;
      })();

      // Evaluate the condition; the step's output is the boolean result (for run-step UI and downstream).
      const firstCondition = native.branches && native.branches[0]?.condition;
      if (!firstCondition || !firstCondition.trim()) {
        return true;
      }
      const conditionResult = runUserCondition(firstCondition, conditionInput);
      return conditionResult;
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

/**
 * Execute a single step from a workflow (for "Run step" in the editor).
 * Uses the latest version (draft or published). Step receives the provided input as its source.
 */
export async function executeSingleStep(
  workflowId: string,
  tenantId: string,
  stepKey: string,
  input: Record<string, unknown>
): Promise<{ success: true; output: unknown } | { success: false; error: string }> {
  const w = await prisma.workflow.findFirst({
    where: { id: workflowId, tenantId },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!w) return { success: false, error: 'Workflow not found' };
  const version = w.versions[0];
  if (!version) return { success: false, error: 'No workflow version' };
  const graph = version.graph as { steps?: StepDef[] };
  const steps = graph?.steps ?? [];
  const stepDef = steps.find((s) => s.stepKey === stepKey);
  if (!stepDef) return { success: false, error: 'Step not found' };

  const sourceKey =
    'dataStepKey' in stepDef && typeof (stepDef as any).dataStepKey === 'string' && (stepDef as any).dataStepKey.trim()
      ? (stepDef as any).dataStepKey.trim()
      : 'sourceStepKey' in stepDef && typeof (stepDef as { sourceStepKey?: string }).sourceStepKey === 'string'
      ? (stepDef as { sourceStepKey: string }).sourceStepKey.trim()
      : null;
  const outputsByStepKey: Record<string, unknown> = { input };
  if (sourceKey) outputsByStepKey[sourceKey] = input;

  const ctx: RunContext = {
    workflowRunId: '',
    tenantId,
    runInput: input,
    outputsByStepKey,
    stepRunsByKey: new Map(),
  };

  try {
    const output = await executeOneStep(stepDef, ctx);
    return { success: true, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
