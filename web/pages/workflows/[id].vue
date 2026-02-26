<template>
  <v-container>
    <div class="d-flex align-center gap-2 mb-4">
      <v-btn icon variant="text" :to="'/workflows'">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <h1 class="text-h4">{{ workflow?.name ?? 'Workflow' }}</h1>
      <v-chip v-if="workflow" :color="workflow.status === 'Active' ? 'success' : 'grey'" size="small">{{ workflow.status }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="workflow?.status === 'Active'"
        color="primary"
        :loading="running"
        @click="runWorkflow"
      >
        Run
      </v-btn>
      <v-btn
        v-if="hasDraft"
        color="primary"
        variant="tonal"
        :loading="publishing"
        @click="publish"
      >
        Publish version
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" dismissible @click="error = ''">{{ error }}</v-alert>

    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        Blueprint
        <v-spacer />
        <v-btn color="primary" size="small" :loading="saving" :disabled="!dirty" @click="saveVersion">
          Save draft
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-sheet
          ref="blueprintCanvas"
          class="blueprint-canvas"
          rounded
          @contextmenu.prevent="onCanvasContextMenu"
        >
          <div ref="blueprintLane" class="blueprint-lane">
            <!-- Trigger nodes -->
            <div
              v-for="t in triggers"
              :key="t.id"
              class="blueprint-node blueprint-node-trigger"
              :class="{ 'blueprint-node-selected': selectedTriggerId === t.id }"
              :style="triggerNodeStyle(t)"
              @mousedown.stop="onTriggerNodeMouseDown(t, $event)"
              @click.stop="selectTrigger(t.id)"
            >
              <div class="blueprint-node-header" style="background-color: #7e57c2;">
                <span class="blueprint-node-title">Trigger</span>
                <v-spacer />
                <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="editTrigger(t)">
                  <v-icon size="14">mdi-pencil</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="confirmDeleteTrigger(t)">
                  <v-icon size="14">mdi-close</v-icon>
                </v-btn>
              </div>
              <div class="blueprint-node-body">
                <div class="blueprint-node-ports">
                  <div class="port port-out" data-port="out" :data-trigger-id="t.id" @mousedown.stop="onTriggerPortMouseDown(t, $event)"></div>
                </div>
                <p class="blueprint-node-label">{{ t.name }}</p>
                <p class="blueprint-node-meta">{{ t.type }}</p>
              </div>
            </div>
            <!-- Step nodes -->
            <div
              v-for="(step, idx) in steps"
              :key="step.stepKey"
              class="blueprint-node"
              :class="{ 'blueprint-node-selected': selectedStepKey === step.stepKey, 'blueprint-node-if': isIfStep(step) }"
              :style="nodeStyle(step, idx)"
              :data-step-key="step.stepKey"
              @mousedown.stop="onNodeMouseDown(step, $event)"
              @click.stop="selectStep(step.stepKey)"
              @contextmenu.prevent="onNodeContextMenu(step, idx, $event)"
            >
              <div class="blueprint-node-header" :style="{ backgroundColor: nodeColor(step) }">
                <span class="blueprint-node-title">{{ nodeType(step) }}</span>
                <v-spacer />
                <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="moveStep(idx, -1)" :disabled="idx === 0">
                  <v-icon size="16">mdi-arrow-left</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="moveStep(idx, 1)" :disabled="idx === steps.length - 1">
                  <v-icon size="16">mdi-arrow-right</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="confirmRemoveStep(idx)">
                  <v-icon size="16">mdi-close</v-icon>
                </v-btn>
              </div>
              <div class="blueprint-node-body">
                <div class="blueprint-node-ports">
                  <div
                    v-if="hasInputPort(step)"
                    class="port port-in"
                    data-port="in"
                    :data-step-key="step.stepKey"
                  ></div>
                  <template v-if="isIfStep(step)">
                    <div
                      class="port port-out port-out-then"
                      data-port="out-then"
                      :data-step-key="step.stepKey"
                      @mousedown.stop="onPortMouseDown(step, $event)"
                    ></div>
                    <div
                      class="port port-out port-out-else"
                      data-port="out-else"
                      :data-step-key="step.stepKey"
                      @mousedown.stop="onPortMouseDown(step, $event)"
                    ></div>
                  </template>
                  <div
                    v-else
                    class="port port-out"
                    data-port="out"
                    :data-step-key="step.stepKey"
                    @mousedown.stop="onPortMouseDown(step, $event)"
                  ></div>
                </div>
                <p class="blueprint-node-label">{{ stepLabel(step) }}</p>
                <p class="blueprint-node-meta">Key: {{ step.stepKey }}</p>
              </div>
            </div>
            <div v-if="steps.length === 0 && triggers.length === 0" class="blueprint-empty-hint">
              Right-click on the canvas to add a trigger or step.
            </div>
          </div>
          <!-- Connector lines SVG -->
          <svg class="blueprint-connectors" aria-hidden="true">
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#90caf9" />
              </marker>
            </defs>
            <g v-for="(seg, i) in connectorSegments" :key="'seg-' + i">
              <path
                :d="connectorPath(seg)"
                class="connector-line connector-line-animated"
                marker-end="url(#arrowhead)"
                @contextmenu.prevent="onConnectionContextMenu(seg, $event)"
              />
            </g>
            <path
              v-if="connectionDrag"
              :d="connectorPath({ x1: connectionDrag.from.x, y1: connectionDrag.from.y, x2: connectionDrag.x2, y2: connectionDrag.y2 })"
              class="connector-line connector-line-dragging"
              stroke-dasharray="4 4"
            />
          </svg>
        </v-sheet>
      </v-card-text>
    </v-card>

    <!-- Delete step confirmation -->
    <v-dialog v-model="deleteStepDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete step?</v-card-title>
        <v-card-text>
          This action cannot be undone. The step will be permanently removed from the workflow.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="deleteStepDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="false" @click="doRemoveStep">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Trigger dialog -->
    <v-dialog v-model="triggerDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>{{ editingTrigger ? 'Edit Trigger' : 'Add Trigger' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="triggerForm.key" label="Key" :disabled="!!editingTrigger" />
          <v-text-field v-model="triggerForm.name" label="Name" />
          <v-select v-model="triggerForm.type" label="Type" :items="['MANUAL', 'WEBHOOK', 'CRON']" />
          <v-text-field v-if="triggerForm.type === 'WEBHOOK'" v-model="triggerForm.webhookPath" label="Webhook path slug" />
          <v-text-field v-if="triggerForm.type === 'WEBHOOK'" v-model="triggerForm.webhookSecret" label="Webhook secret (optional)" type="password" />
          <v-text-field v-if="triggerForm.type === 'CRON'" v-model="triggerForm.cronExpression" label="Cron expression (e.g. 0 * * * * for hourly)" />
          <v-text-field v-if="triggerForm.type === 'CRON'" v-model="triggerForm.cronTimezone" label="Timezone (e.g. UTC)" />
          <v-alert v-if="triggerForm.type === 'WEBHOOK' && webhookFullUrl" type="info" density="compact" class="mt-2">
            Webhook URL: <code>{{ webhookFullUrl }}</code>
          </v-alert>
          <v-alert v-if="triggerError" type="error" density="compact">{{ triggerError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="triggerDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="triggerSaving" @click="saveTrigger">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Context menu: teleport to body so it's above everything and receives clicks -->
    <Teleport to="body">
      <template v-if="contextMenu.open">
        <div
          class="blueprint-context-menu-backdrop"
          @click="contextMenu.open = false"
        ></div>
        <div
          class="blueprint-context-menu"
          :style="{ left: contextMenu.clientX + 'px', top: contextMenu.clientY + 'px' }"
          role="menu"
        >
          <template v-if="!contextMenu.connection">
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('action')">Add Action</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('MAP')">Add Map</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('FILTER')">Add Filter</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('LOOP')">Add Loop</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('IF')">Add If</div>
            <div class="blueprint-context-menu-divider"></div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('trigger')">Add Trigger</div>
          </template>
          <template v-else>
            <div class="blueprint-context-menu-item" role="menuitem" @click="removeConnectionFromContext">Remove connection</div>
          </template>
        </div>
      </template>
    </Teleport>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});

/** App action step */
interface AppStepDef {
  stepKey: string;
  actionId: string;
  connectionId?: string;
  inputMapping?: Record<string, unknown>;
  x?: number;
  y?: number;
}
/** Native: Map - transform source output with JS, return array */
interface MapStepDef {
  stepKey: string;
  type: 'MAP';
  sourceStepKey: string;
  code: string;
  x?: number;
  y?: number;
}
/** Native: Filter - filter source array with JS */
interface FilterStepDef {
  stepKey: string;
  type: 'FILTER';
  sourceStepKey: string;
  code: string;
  x?: number;
  y?: number;
}
/** Native: Loop - run body steps for each item in source array */
interface LoopStepDef {
  stepKey: string;
  type: 'LOOP';
  sourceStepKey: string;
  bodySteps: AppStepDef[];
  x?: number;
  y?: number;
}
/** Native: IF - run first matching branch or else steps */
interface IfStepDef {
  stepKey: string;
  type: 'IF';
  sourceStepKey: string;
  branches: { condition: string; steps: AppStepDef[] }[];
  elseSteps?: AppStepDef[];
  x?: number;
  y?: number;
}
type StepDef = AppStepDef | MapStepDef | FilterStepDef | LoopStepDef | IfStepDef;

function isAppStep(s: StepDef): s is AppStepDef {
  return 'actionId' in s && typeof (s as AppStepDef).actionId === 'string';
}
function isIfStep(s: StepDef): s is IfStepDef {
  return !isAppStep(s) && (s as IfStepDef).type === 'IF';
}

interface TriggerEdge {
  triggerId: string;
  stepKey: string;
}
interface WorkflowVersion {
  id: string;
  version: number;
  graph: {
    steps?: StepDef[];
    triggerPositions?: Record<string, { x: number; y: number }>;
    triggerEdges?: TriggerEdge[];
  };
  publishedAt: string | null;
}
interface Workflow {
  id: string;
  name: string;
  key: string;
  status: string;
  versions: WorkflowVersion[];
}
interface Trigger {
  id: string;
  key: string;
  name: string;
  type: string;
  webhookPath: string | null;
  cronExpression: string | null;
}
interface ActionRef {
  id: string;
  appId: string;
  label: string;
}
interface ConnectionItem {
  id: string;
  name: string;
  appId: string;
}

const route = useRoute();
const config = useRuntimeConfig();
const api = useApi();
const workflowId = computed(() => route.params.id as string);

const workflow = ref<Workflow | null>(null);
const error = ref('');
const steps = ref<StepDef[]>([]);
const triggerPositions = ref<Record<string, { x: number; y: number }>>({});
const triggerEdges = ref<TriggerEdge[]>([]);
const dirty = ref(false);
const saving = ref(false);
const publishing = ref(false);
const running = ref(false);
const triggers = ref<Trigger[]>([]);
const selectedStepKey = ref<string | null>(null);
const selectedTriggerId = ref<string | null>(null);
const deleteStepDialog = ref(false);
const deleteStepIdx = ref<number | null>(null);
const triggerDialog = ref(false);
const editingTrigger = ref<Trigger | null>(null);
const triggerForm = ref({
  key: '',
  name: '',
  type: 'MANUAL',
  webhookPath: '',
  webhookSecret: '',
  cronExpression: '',
  cronTimezone: 'UTC',
});
const triggerError = ref('');
const triggerSaving = ref(false);

const apps = ref<{ id: string; name: string; versions: { id: string; actions: { id: string; key: string; name: string }[] }[] }[]>([]);
const allActionsFlat = computed(() => {
  const out: { id: string; appId: string; label: string }[] = [];
  for (const app of apps.value) {
    const v = app.versions?.[0];
    if (!v) continue;
    for (const a of v.actions || []) {
      out.push({ id: a.id, appId: app.id, label: `${app.name} / ${a.name} (${a.key})` });
    }
  }
  return out;
});
const newStepActionId = ref<string | null>(null);
const newStepConnectionId = ref<string | null>(null);
const connectionsForSelectedAction = computed(() => {
  if (!newStepActionId.value) return [];
  const appId = allActionsFlat.value.find(a => a.id === newStepActionId.value)?.appId;
  if (!appId) return [];
  return connections.value.filter(c => c.appId === appId);
});
const connections = ref<ConnectionItem[]>([]);

const latestVersion = computed(() => workflow.value?.versions?.[0] ?? null);
const hasDraft = computed(() => latestVersion.value && !latestVersion.value.publishedAt && steps.value.length > 0);
const webhookFullUrl = computed(() => {
  if (triggerForm.value.type !== 'WEBHOOK' || !triggerForm.value.webhookPath) return '';
  return `${config.public.apiBaseUrl}/api/webhooks/${triggerForm.value.webhookPath}`;
});

function stepActionName(actionId: string) {
  const a = allActionsFlat.value.find(x => x.id === actionId);
  return a?.label ?? actionId;
}

function stepLabel(step: StepDef): string {
  if (isAppStep(step)) return stepActionName(step.actionId);
  switch (step.type) {
    case 'MAP': return `Map (from ${step.sourceStepKey})`;
    case 'FILTER': return `Filter (from ${step.sourceStepKey})`;
    case 'LOOP': return `Loop (from ${step.sourceStepKey}, ${step.bodySteps?.length ?? 0} body steps)`;
    case 'IF': return `If (from ${step.sourceStepKey})`;
    default: return (step as { stepKey: string }).stepKey;
  }
}

function nodeType(step: StepDef): string {
  if (isAppStep(step)) return 'Action';
  return step.type;
}

function nodeColor(step: StepDef): string {
  if (isAppStep(step)) return '#4CAF50'; // green for actions
  switch (step.type) {
    case 'MAP': return '#42A5F5'; // blue
    case 'FILTER': return '#AB47BC'; // purple
    case 'LOOP': return '#FFB300'; // amber
    case 'IF': return '#EF5350'; // red
    default: return '#607D8B'; // grey-blue
  }
}

function nodeStyle(step: StepDef, index: number): Record<string, string> {
  const { x, y } = stepPosition(step, index);
  return {
    borderColor: nodeColor(step),
    left: `${x}px`,
    top: `${y}px`,
  };
}

const newStepType = ref<'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF'>('action');
const newNativeSourceStepKey = ref('');
const newNativeCode = ref('');
const newLoopSourceStepKey = ref('');
const newLoopBodySteps = ref<{ stepKey: string; actionId: string }[]>([]);
const newIfSourceStepKey = ref('');
const newIfBranches = ref<{ condition: string; steps: { stepKey: string; actionId: string }[] }[]>([]);
const newIfElseSteps = ref<{ stepKey: string; actionId: string }[]>([]);

const blueprintCanvas = ref<any | null>(null);
const blueprintLane = ref<HTMLElement | null>(null);
const draggingStepKey = ref<string | null>(null);
const draggingTriggerId = ref<string | null>(null);
const dragOffset = ref({ x: 0, y: 0 });
const pendingPosition = ref<{ x: number; y: number } | null>(null);
const pendingTriggerPosition = ref<{ x: number; y: number } | null>(null);

/** Connection drag: from step or trigger output to a step input */
const connectionDrag = ref<{
  from: { kind: 'step' | 'trigger'; key: string; x: number; y: number };
  x2: number;
  y2: number;
} | null>(null);

function getCanvasElement(): HTMLElement | null {
  const raw = blueprintCanvas.value as any;
  if (!raw) return null;
  return (raw.$el ?? raw) as HTMLElement;
}

const NODE_WIDTH = 240;
const NODE_HEADER_H = 32;
const NODE_BODY_H = 72;
const NODE_HEIGHT = NODE_HEADER_H + NODE_BODY_H;
const PORT_OFFSET_Y = 10 + 36; // body top + half of body

function hasInputPort(step: StepDef): boolean {
  if (isAppStep(step)) return false;
  return step.type === 'MAP' || step.type === 'FILTER' || step.type === 'LOOP' || step.type === 'IF';
}

function stepPosition(step: StepDef, index: number): { x: number; y: number } {
  const anyStep = step as { x?: number; y?: number };
  const x = typeof anyStep.x === 'number' ? anyStep.x : index * (NODE_WIDTH + 24);
  const y = typeof anyStep.y === 'number' ? anyStep.y : 40;
  return { x, y };
}

interface ConnectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'step' | 'trigger';
  fromKey: string;
  toKey: string;
}

function connectorLine(step: StepDef): ConnectorSegment {
  if (!('sourceStepKey' in step) || !step.sourceStepKey) {
    return { x1: 0, y1: 0, x2: 0, y2: 0, kind: 'step', fromKey: '', toKey: '' };
  }
  const src = steps.value.find(s => s.stepKey === step.sourceStepKey);
  const srcIdx = src ? steps.value.indexOf(src) : -1;
  const dstIdx = steps.value.indexOf(step);
  const srcPos = src ? stepPosition(src, srcIdx) : { x: 0, y: 0 };
  const dstPos = stepPosition(step, dstIdx);
  return {
    x1: srcPos.x + NODE_WIDTH,
    y1: srcPos.y + NODE_HEADER_H + PORT_OFFSET_Y - 10,
    x2: dstPos.x,
    y2: dstPos.y + NODE_HEADER_H + PORT_OFFSET_Y - 10,
    kind: 'step',
    fromKey: step.sourceStepKey,
    toKey: (step as any).stepKey,
  };
}

function triggerConnectorLine(edge: TriggerEdge): ConnectorSegment {
  const trig = triggers.value.find(t => t.id === edge.triggerId);
  if (!trig) return { x1: 0, y1: 0, x2: 0, y2: 0, kind: 'trigger', fromKey: '', toKey: '' };
  const pos = triggerPositions.value[edge.triggerId] ?? {
    x: 20,
    y: 40 + triggers.value.indexOf(trig) * (NODE_HEIGHT + 16),
  };
  const dst = steps.value.find(s => s.stepKey === edge.stepKey);
  if (!dst) return { x1: 0, y1: 0, x2: 0, y2: 0, kind: 'trigger', fromKey: '', toKey: '' };
  const dstIdx = steps.value.indexOf(dst);
  const dstPos = stepPosition(dst, dstIdx);
  return {
    x1: pos.x + NODE_WIDTH,
    y1: pos.y + NODE_HEADER_H + PORT_OFFSET_Y - 10,
    x2: dstPos.x,
    y2: dstPos.y + NODE_HEADER_H + PORT_OFFSET_Y - 10,
    kind: 'trigger',
    fromKey: edge.triggerId,
    toKey: edge.stepKey,
  };
}

const connectorSegments = computed<ConnectorSegment[]>(() => {
  const segs: ConnectorSegment[] = [];
  for (const step of steps.value) {
    if (!('sourceStepKey' in step) || !step.sourceStepKey) continue;
    segs.push(connectorLine(step));
  }
  for (const edge of triggerEdges.value) {
    segs.push(triggerConnectorLine(edge));
  }
  return segs;
});

function connectorPath(seg: ConnectorSegment): string {
  const dx = Math.max(40, Math.abs(seg.x2 - seg.x1) / 2);
  const cx1 = seg.x1 + dx;
  const cx2 = seg.x2 - dx;
  return `M ${seg.x1} ${seg.y1} C ${cx1} ${seg.y1}, ${cx2} ${seg.y2}, ${seg.x2} ${seg.y2}`;
}

function onConnectionContextMenu(seg: ConnectorSegment, event: MouseEvent) {
  event.preventDefault();
  contextMenu.value = {
    open: true,
    clientX: event.clientX,
    clientY: event.clientY,
    nodeIdx: undefined,
    connection: { kind: seg.kind, fromKey: seg.fromKey, toKey: seg.toKey },
  };
}

function removeConnectionFromContext() {
  const conn = contextMenu.value.connection;
  contextMenu.value.open = false;
  if (!conn) return;
  if (conn.kind === 'step') {
    const fromKey = conn.fromKey;
    const toKey = conn.toKey;
    steps.value = steps.value.map((s) => {
      if (!( 'sourceStepKey' in s)) return s;
      const any = s as any;
      const current = any.sourceStepKey as string | undefined;
      if (!current) return s;
      if (s.stepKey === toKey && current === fromKey) {
        return { ...s, sourceStepKey: undefined } as StepDef;
      }
      return s;
    });
  } else {
    triggerEdges.value = triggerEdges.value.filter(
      (e) => !(e.triggerId === conn.fromKey && e.stepKey === conn.toKey),
    );
  }
  dirty.value = true;
}

function laneOffset() {
  const el = getCanvasElement();
  if (!el) return { left: 0, top: 0 };
  const r = el.getBoundingClientRect();
  return { left: r.left + 24, top: r.top + 24 };
}

function onPortMouseDown(step: StepDef, event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const { left: laneLeft, top: laneTop } = laneOffset();
  const x = rect.left + rect.width / 2 - laneLeft;
  const y = rect.top + rect.height / 2 - laneTop;
  connectionDrag.value = { from: { kind: 'step', key: step.stepKey, x, y }, x2: x, y2: y };
  window.addEventListener('mousemove', onConnectionMouseMove);
  window.addEventListener('mouseup', onConnectionMouseUp);
}

function onConnectionMouseMove(event: MouseEvent) {
  const el = getCanvasElement();
  if (!connectionDrag.value || !el) return;
  const { left: laneLeft, top: laneTop } = laneOffset();
  connectionDrag.value.x2 = event.clientX - laneLeft;
  connectionDrag.value.y2 = event.clientY - laneTop;
}

function onConnectionMouseUp(event: MouseEvent) {
  if (!connectionDrag.value) return;
  const el = document.elementFromPoint(event.clientX, event.clientY);
  const from = connectionDrag.value.from;
  const fromKey = from.key;
  let stepKey = el?.closest?.('[data-port="in"]')?.getAttribute('data-step-key');
  if (!stepKey) stepKey = el?.closest?.('[data-step-key]')?.getAttribute('data-step-key');
  if (stepKey && stepKey !== fromKey) {
    const step = steps.value.find(s => s.stepKey === stepKey);
    if (step && hasInputPort(step)) {
      if (from.kind === 'step') {
        const newSourceKey = from.key;
        steps.value = steps.value.map((s) => {
          if (s.stepKey !== stepKey) return s;
          return { ...s, sourceStepKey: newSourceKey } as StepDef;
        });
      } else if (from.kind === 'trigger') {
        const trigId = from.key;
        triggerEdges.value = [
          ...triggerEdges.value.filter(e => !(e.triggerId === trigId && e.stepKey === stepKey)),
          { triggerId: trigId, stepKey },
        ];
      }
      dirty.value = true;
    }
  }
  connectionDrag.value = null;
  window.removeEventListener('mousemove', onConnectionMouseMove);
  window.removeEventListener('mouseup', onConnectionMouseUp);
}

function onNodeMouseDown(step: StepDef, event: MouseEvent) {
  if (!getCanvasElement()) return;
  if ((event.target as HTMLElement).closest?.('button')) return;
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  draggingStepKey.value = step.stepKey;
  dragOffset.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
}

function onWindowMouseMove(event: MouseEvent) {
  const el = getCanvasElement();
  if (!draggingStepKey.value || !el) return;
  const canvasRect = el.getBoundingClientRect();
  const scrollLeft = el.scrollLeft ?? 0;
  const scrollTop = el.scrollTop ?? 0;
  const laneLeft = canvasRect.left + 24;
  const laneTop = canvasRect.top + 24;
  const x = Math.round(event.clientX - laneLeft + scrollLeft - dragOffset.value.x);
  const y = Math.round(event.clientY - laneTop + scrollTop - dragOffset.value.y);
  const key = draggingStepKey.value;
  steps.value = steps.value.map((s) => {
    if (s.stepKey !== key) return s;
    return { ...s, x, y } as StepDef;
  });
  dirty.value = true;
}

function onWindowMouseUp() {
  draggingStepKey.value = null;
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
}

function triggerNodeStyle(t: Trigger): Record<string, string> {
  const pos = triggerPositions.value[t.id] ?? { x: 20, y: 40 + triggers.value.indexOf(t) * (NODE_HEIGHT + 16) };
  return {
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    borderColor: '#7e57c2',
  };
}

function onTriggerNodeMouseDown(t: Trigger, event: MouseEvent) {
  if (!getCanvasElement()) return;
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  draggingTriggerId.value = t.id;
  dragOffset.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  window.addEventListener('mousemove', onTriggerMouseMove);
  window.addEventListener('mouseup', onTriggerMouseUp);
}

function onTriggerMouseMove(event: MouseEvent) {
  const el = getCanvasElement();
  if (!draggingTriggerId.value || !el) return;
  const canvasRect = el.getBoundingClientRect();
  const scrollLeft = el.scrollLeft ?? 0;
  const scrollTop = el.scrollTop ?? 0;
  const laneLeft = canvasRect.left + 24;
  const laneTop = canvasRect.top + 24;
  const x = Math.round(event.clientX - laneLeft + scrollLeft - dragOffset.value.x);
  const y = Math.round(event.clientY - laneTop + scrollTop - dragOffset.value.y);
  triggerPositions.value = { ...triggerPositions.value, [draggingTriggerId.value]: { x, y } };
  dirty.value = true;
}

function onTriggerMouseUp() {
  draggingTriggerId.value = null;
  window.removeEventListener('mousemove', onTriggerMouseMove);
  window.removeEventListener('mouseup', onTriggerMouseUp);
}

function onTriggerPortMouseDown(t: Trigger, event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const { left: laneLeft, top: laneTop } = laneOffset();
  const x = rect.left + rect.width / 2 - laneLeft;
  const y = rect.top + rect.height / 2 - laneTop;
  connectionDrag.value = { from: { kind: 'trigger', key: t.id, x, y }, x2: x, y2: y };
  window.addEventListener('mousemove', onConnectionMouseMove);
  window.addEventListener('mouseup', onConnectionMouseUp);
}

function selectStep(stepKey: string) {
  selectedStepKey.value = stepKey;
  selectedTriggerId.value = null;
}

function selectTrigger(id: string) {
  selectedTriggerId.value = id;
  selectedStepKey.value = null;
}

function onNodeContextMenu(step: StepDef, idx: number, event: MouseEvent) {
  selectedStepKey.value = step.stepKey;
  contextMenu.value = { open: true, clientX: event.clientX, clientY: event.clientY, nodeIdx: idx, connection: null };
}

const contextMenu = ref<{
  open: boolean;
  clientX: number;
  clientY: number;
  nodeIdx?: number;
  connection?: { kind: 'step' | 'trigger'; fromKey: string; toKey: string } | null;
}>({
  open: false,
  clientX: 0,
  clientY: 0,
  connection: null,
});

function onContextMenuAction(action: 'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF' | 'trigger') {
  const clientX = contextMenu.value.clientX;
  const clientY = contextMenu.value.clientY;
  contextMenu.value.open = false;
  nextTick(() => {
    if (action === 'trigger') {
      addTriggerFromContextAt(clientX, clientY);
    } else {
      addStepFromContextAt(action, clientX, clientY);
    }
  });
}

function onCanvasContextMenu(event: MouseEvent) {
  selectedStepKey.value = null;
  selectedTriggerId.value = null;
  contextMenu.value = {
    open: true,
    clientX: event.clientX,
    clientY: event.clientY,
    nodeIdx: undefined,
    connection: null,
  };
}

function addStepFromContextAt(type: 'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF', clientX: number, clientY: number) {
  const el = getCanvasElement();
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const scrollLeft = el.scrollLeft ?? 0;
  const scrollTop = el.scrollTop ?? 0;
  const laneLeft = rect.left + 24;
  const laneTop = rect.top + 24;
  const canvasX = Math.round(clientX - laneLeft + scrollLeft);
  const canvasY = Math.round(clientY - laneTop + scrollTop);
  pendingPosition.value = { x: canvasX, y: canvasY };
  newStepType.value = type;
  if (type === 'action') {
    newStepActionId.value = allActionsFlat.value[0]?.id ?? null;
    newStepConnectionId.value = null;
  } else if (type === 'MAP' || type === 'FILTER') {
    newNativeSourceStepKey.value = steps.value[0]?.stepKey ?? '';
    newNativeCode.value = type === 'MAP' ? 'return input;' : 'return true;';
  } else if (type === 'LOOP') {
    newLoopSourceStepKey.value = steps.value[0]?.stepKey ?? '';
    newLoopBodySteps.value = allActionsFlat.value[0] ? [{ stepKey: `loop_body_0`, actionId: allActionsFlat.value[0].id }] : [];
  } else if (type === 'IF') {
    newIfSourceStepKey.value = steps.value[0]?.stepKey ?? '';
    newIfBranches.value = [{ condition: 'true', steps: allActionsFlat.value[0] ? [{ stepKey: 'if_0', actionId: allActionsFlat.value[0].id }] : [] }];
    newIfElseSteps.value = [];
  }
  addStep();
}

function addStepFromContext(type: 'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF') {
  addStepFromContextAt(type, contextMenu.value.clientX, contextMenu.value.clientY);
}

function addTriggerFromContextAt(clientX: number, clientY: number) {
  const el = getCanvasElement();
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const scrollLeft = el.scrollLeft ?? 0;
  const scrollTop = el.scrollTop ?? 0;
  const laneLeft = rect.left + 24;
  const laneTop = rect.top + 24;
  pendingTriggerPosition.value = {
    x: Math.round(clientX - laneLeft + scrollLeft),
    y: Math.round(clientY - laneTop + scrollTop),
  };
  openTriggerDialog();
}

const canAddNewStep = computed(() => {
  if (newStepType.value === 'action') return !!newStepActionId.value;
  if (newStepType.value === 'MAP' || newStepType.value === 'FILTER') return !!newNativeSourceStepKey.value && !!newNativeCode.value.trim();
  if (newStepType.value === 'LOOP') return !!newLoopSourceStepKey.value && newLoopBodySteps.value.length > 0;
  if (newStepType.value === 'IF') return !!newIfSourceStepKey.value && newIfBranches.value.some(b => b.condition.trim());
  return false;
});

async function loadWorkflow() {
  try {
    workflow.value = await api.get<Workflow>(`/workflows/${workflowId.value}`);
    const graph = latestVersion.value?.graph as { steps?: StepDef[] } | undefined;
    steps.value = graph?.steps ?? [];
    dirty.value = false;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  }
}

async function loadTriggers() {
  try {
    const res = await api.get<{ items: Trigger[] }>(`/workflows/${workflowId.value}/triggers`);
    triggers.value = res.items;
  } catch {
    triggers.value = [];
  }
}

async function loadAppsAndConnections() {
  try {
    const [appRes, connRes] = await Promise.all([
      api.get<{ items: typeof apps.value }>('/apps', { limit: 100 }),
      api.get<{ items: ConnectionItem[] }>('/connections', { limit: 100 }),
    ]);
    const appIds = appRes.items.map(a => a.id);
    const appsWithVersions = await Promise.all(
      appIds.map(id => api.get<typeof apps.value[0]>(`/apps/${id}`))
    );
    apps.value = appsWithVersions;
    connections.value = connRes.items;
  } catch {
    apps.value = [];
    connections.value = [];
  }
}

function addStep() {
  const stepKey = `step_${Date.now()}`;
  const pos = pendingPosition.value ?? { x: steps.value.length * 260, y: 40 };
  if (newStepType.value === 'action') {
    if (!newStepActionId.value) {
      error.value = 'Add at least one app and action in Apps first, then add an Action step.';
      return;
    }
    steps.value.push({
      stepKey,
      actionId: newStepActionId.value,
      connectionId: newStepConnectionId.value ?? undefined,
      x: pos.x,
      y: pos.y,
    });
    newStepActionId.value = null;
    newStepConnectionId.value = null;
  } else if (newStepType.value === 'MAP') {
    steps.value.push({
      stepKey,
      type: 'MAP',
      sourceStepKey: newNativeSourceStepKey.value,
      code: newNativeCode.value.trim(),
      x: pos.x,
      y: pos.y,
    });
    newNativeSourceStepKey.value = '';
    newNativeCode.value = '';
  } else if (newStepType.value === 'FILTER') {
    steps.value.push({
      stepKey,
      type: 'FILTER',
      sourceStepKey: newNativeSourceStepKey.value,
      code: newNativeCode.value.trim(),
      x: pos.x,
      y: pos.y,
    });
    newNativeSourceStepKey.value = '';
    newNativeCode.value = '';
  } else if (newStepType.value === 'LOOP') {
    const body = newLoopBodySteps.value.map((b, i) => ({
      stepKey: `${stepKey}_body_${i}`,
      actionId: b.actionId,
      connectionId: undefined as string | undefined,
    }));
    steps.value.push({
      stepKey,
      type: 'LOOP',
      sourceStepKey: newLoopSourceStepKey.value,
      bodySteps: body,
      x: pos.x,
      y: pos.y,
    });
    newLoopSourceStepKey.value = '';
    newLoopBodySteps.value = [];
  } else if (newStepType.value === 'IF') {
    const branches = newIfBranches.value
      .filter(b => b.condition.trim())
      .map(b => ({
        condition: b.condition.trim(),
        steps: b.steps.filter(s => s.actionId).map((s, i) => ({ stepKey: `${stepKey}_b_${i}`, actionId: s.actionId, connectionId: undefined as string | undefined })),
      }));
    const elseSteps = newIfElseSteps.value.filter(s => s.actionId).map((s, i) => ({ stepKey: `${stepKey}_else_${i}`, actionId: s.actionId, connectionId: undefined as string | undefined }));
    steps.value.push({
      stepKey,
      type: 'IF',
      sourceStepKey: newIfSourceStepKey.value,
      branches,
      elseSteps: elseSteps.length ? elseSteps : undefined,
      x: pos.x,
      y: pos.y,
    });
    newIfSourceStepKey.value = '';
    newIfBranches.value = [];
    newIfElseSteps.value = [];
  }
  pendingPosition.value = null;
  dirty.value = true;
}

function confirmRemoveStep(idx: number) {
  deleteStepIdx.value = idx;
  deleteStepDialog.value = true;
}

function doRemoveStep() {
  if (deleteStepIdx.value === null) return;
  const removed = steps.value[deleteStepIdx.value];
  steps.value.splice(deleteStepIdx.value, 1);
  if (removed) {
    triggerEdges.value = triggerEdges.value.filter(e => e.stepKey !== (removed as any).stepKey);
  }
  if (selectedStepKey.value && steps.value.every(s => s.stepKey !== selectedStepKey.value)) selectedStepKey.value = null;
  deleteStepIdx.value = null;
  deleteStepDialog.value = false;
  dirty.value = true;
}

function moveStep(idx: number, delta: number) {
  const next = idx + delta;
  if (next < 0 || next >= steps.value.length) return;
  [steps.value[idx], steps.value[next]] = [steps.value[next], steps.value[idx]];
  dirty.value = true;
}

async function saveVersion() {
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/workflows/${workflowId.value}/versions`, {
      graph: {
        steps: steps.value,
        triggerPositions: triggerPositions.value,
        triggerEdges: triggerEdges.value,
      },
    });
    await loadWorkflow();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function publish() {
  publishing.value = true;
  error.value = '';
  try {
    await api.post(`/workflows/${workflowId.value}/publish`, {});
    await loadWorkflow();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    publishing.value = false;
  }
}

async function runWorkflow() {
  running.value = true;
  error.value = '';
  try {
    const res = await api.post<{ workflowRunId: string; status: string }>(`/workflows/${workflowId.value}/run`, {});
    await navigateTo(`/runs/${res.workflowRunId}`);
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Run failed';
  } finally {
    running.value = false;
  }
}

function openTriggerDialog(trigger?: Trigger) {
  editingTrigger.value = trigger ?? null;
  if (trigger) {
    triggerForm.value = {
      key: trigger.key,
      name: trigger.name,
      type: trigger.type,
      webhookPath: trigger.webhookPath ?? '',
      webhookSecret: '',
      cronExpression: trigger.cronExpression ?? '',
      cronTimezone: 'UTC',
    };
  } else {
    triggerForm.value = {
      key: '',
      name: '',
      type: 'MANUAL',
      webhookPath: '',
      webhookSecret: '',
      cronExpression: '',
      cronTimezone: 'UTC',
    };
  }
  triggerError.value = '';
  triggerDialog.value = true;
}

async function saveTrigger() {
  if (triggerForm.value.type === 'WEBHOOK' && !triggerForm.value.webhookPath) {
    triggerError.value = 'Webhook path required';
    return;
  }
  if (triggerForm.value.type === 'CRON' && !triggerForm.value.cronExpression) {
    triggerError.value = 'Cron expression required';
    return;
  }
  triggerSaving.value = true;
  triggerError.value = '';
  try {
    if (editingTrigger.value) {
      await api.patch(`/triggers/${editingTrigger.value.id}`, {
        name: triggerForm.value.name,
        type: triggerForm.value.type,
        webhookPath: triggerForm.value.webhookPath || undefined,
        webhookSecret: triggerForm.value.webhookSecret || undefined,
        cronExpression: triggerForm.value.cronExpression || undefined,
        cronTimezone: triggerForm.value.cronTimezone || undefined,
      });
    } else {
      const created = await api.post<Trigger>(`/workflows/${workflowId.value}/triggers`, {
        key: triggerForm.value.key || `trigger_${Date.now()}`,
        name: triggerForm.value.name,
        type: triggerForm.value.type,
        webhookPath: triggerForm.value.webhookPath || undefined,
        webhookSecret: triggerForm.value.webhookSecret || undefined,
        cronExpression: triggerForm.value.cronExpression || undefined,
        cronTimezone: triggerForm.value.cronTimezone || undefined,
      });
      if (pendingTriggerPosition.value && created?.id) {
        triggerPositions.value = { ...triggerPositions.value, [created.id]: pendingTriggerPosition.value };
        pendingTriggerPosition.value = null;
        dirty.value = true;
      }
    }
    triggerDialog.value = false;
    await loadTriggers();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) triggerError.value = e.data.message;
    else triggerError.value = 'Save failed';
  } finally {
    triggerSaving.value = false;
  }
}

function editTrigger(t: Trigger) {
  openTriggerDialog(t);
}

function confirmDeleteTrigger(t: Trigger) {
  if (!confirm(`Delete trigger "${t.name}"? This action cannot be undone.`)) return;
  deleteTrigger(t);
}

async function deleteTrigger(t: Trigger) {
  try {
    await api.del(`/triggers/${t.id}`);
    const { [t.id]: _, ...rest } = triggerPositions.value;
    triggerPositions.value = rest;
    if (selectedTriggerId.value === t.id) selectedTriggerId.value = null;
    await loadTriggers();
    dirty.value = true;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  }
}

watch(workflowId, () => { loadWorkflow(); loadTriggers(); }, { immediate: true });
watch(latestVersion, () => {
  const graph = latestVersion.value?.graph as {
    steps?: StepDef[];
    triggerPositions?: Record<string, { x: number; y: number }>;
    triggerEdges?: TriggerEdge[];
  } | undefined;
  steps.value = graph?.steps ?? [];
  triggerPositions.value = graph?.triggerPositions ?? {};
  triggerEdges.value = graph?.triggerEdges ?? [];
  dirty.value = false;
}, { immediate: true });
onMounted(loadAppsAndConnections);
</script>

<style scoped>
.blueprint-canvas {
  position: relative;
  background-color: #0b1020;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 24px;
  overflow: auto;
  min-height: 80vh;
  width: 100%;
}

.blueprint-lane {
  position: relative;
  min-height: 800px;
  width: 100%;
}

.blueprint-node {
  position: absolute;
  width: 240px;
  min-width: 240px;
  max-width: 240px;
  border-radius: 12px;
  border: 2px solid #42a5f5;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8), 0 10px 22px rgba(0, 0, 0, 0.6);
  color: #e3f2fd;
  overflow: hidden;
  cursor: grab;
}

.blueprint-node:active {
  cursor: grabbing;
}

.blueprint-node-selected {
  box-shadow: 0 0 0 2px #90caf9, 0 0 20px rgba(66, 165, 245, 0.4);
}

.blueprint-connectors {
  position: absolute;
  left: 24px;
  top: 24px;
  width: calc(100% - 48px);
  height: calc(100% - 48px);
  pointer-events: none;
}

.connector-line {
  stroke: #90caf9;
  stroke-width: 2;
  fill: none;
}

.connector-line-animated {
  stroke-dasharray: 8 16;
  animation: connector-flow 1.2s linear infinite;
}

.connector-line-dragging {
  stroke: #42a5f5;
  stroke-width: 2;
}

@keyframes connector-flow {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -24;
  }
}

.blueprint-context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 160px;
  padding: 4px 0;
  background: rgb(var(--v-theme-surface));
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.blueprint-context-menu-item {
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
}

.blueprint-context-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.blueprint-context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.12);
}

.blueprint-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  cursor: default;
}

.blueprint-node-header {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #0b1020;
}

.blueprint-node-title {
  white-space: nowrap;
}

.blueprint-node-body {
  padding: 10px 12px 12px;
  position: relative;
}

.blueprint-node-ports {
  position: absolute;
  top: 10px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
}

.port {
  width: 8px;
  height: 8px;
  padding: 10px;
  margin: -10px;
  border-radius: 50%;
  border: 2px solid #90caf9;
  background: #0b1020;
  pointer-events: auto;
  cursor: crosshair;
  flex-shrink: 0;
  box-sizing: content-box;
}

.blueprint-node-trigger .blueprint-node-ports {
  justify-content: flex-end;
}

.blueprint-node-if .blueprint-node-ports {
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
}

.port-in {
  margin-left: -6px;
}

.port-out {
  margin-right: -6px;
}

.port-out-then {
  border-color: #66bb6a;
  background: #1b5e20;
}

.port-out-else {
  border-color: #ef5350;
  background: #7f0000;
}

.blueprint-node-label {
  font-size: 13px;
  margin: 14px 0 4px;
}

.blueprint-node-meta {
  font-size: 11px;
  opacity: 0.7;
}

.blueprint-empty-hint {
  color: #90caf9;
  font-size: 13px;
  opacity: 0.8;
}
</style>
