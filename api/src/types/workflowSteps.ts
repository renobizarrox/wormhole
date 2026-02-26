/**
 * Workflow graph step definitions.
 * - App steps: call an external action (actionId required).
 * - Native steps: Map, Filter, Loop, IF (type + params, no actionId).
 */

/** App action step (HTTP call) */
export interface AppStep {
  stepKey: string;
  actionId: string;
  connectionId?: string;
  inputMapping?: Record<string, unknown>;
  x?: number;
  y?: number;
}

/** Map: transform output of source step with JS; must return array of objects */
export interface MapStep {
  stepKey: string;
  type: 'MAP';
  sourceStepKey: string;
  code: string; // JS: (input) => array
  x?: number;
  y?: number;
}

/** Filter: filter array output of source step with JS */
export interface FilterStep {
  stepKey: string;
  type: 'FILTER';
  sourceStepKey: string;
  code: string; // JS: (input) => filtered array, e.g. "input.filter(x => x.active)"
  x?: number;
  y?: number;
}

/** Nested step def (app or native) for Loop body / IF branches */
export type StepDef = AppStep | MapStep | FilterStep | LoopStep | IfStep;

/** Loop: iterate over array from source, run bodySteps for each item; output = array of last body output per item */
export interface LoopStep {
  stepKey: string;
  type: 'LOOP';
  sourceStepKey: string;
  bodySteps: StepDef[];
  x?: number;
  y?: number;
}

/** IF: evaluate conditions on source output; run first matching branch steps or elseSteps */
export interface IfStep {
  stepKey: string;
  type: 'IF';
  sourceStepKey: string;
  branches: { condition: string; steps: StepDef[] }[]; // condition: JS expr on input, e.g. "input.count > 0"
  elseSteps?: StepDef[];
  x?: number;
  y?: number;
}

export function isAppStep(s: StepDef): s is AppStep {
  return 'actionId' in s && typeof (s as AppStep).actionId === 'string';
}

export function isNativeStep(s: StepDef): s is MapStep | FilterStep | LoopStep | IfStep {
  return 'type' in s && typeof (s as { type: string }).type === 'string';
}
