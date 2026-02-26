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

    <v-row>
      <v-col cols="12" md="8">
        <v-card class="mb-4">
          <v-card-title>Blueprint</v-card-title>
          <v-card-text>
            <v-sheet class="blueprint-canvas" rounded>
              <div class="blueprint-lane">
                <div
                  v-for="(step, idx) in steps"
                  :key="step.stepKey"
                  class="blueprint-node"
                  :style="{ borderColor: nodeColor(step) }"
                >
                  <div class="blueprint-node-header" :style="{ backgroundColor: nodeColor(step) }">
                    <span class="blueprint-node-title">{{ nodeType(step) }}</span>
                    <v-spacer />
                    <v-btn icon size="x-small" variant="text" @click="moveStep(idx, -1)" :disabled="idx === 0">
                      <v-icon size="16">mdi-arrow-left</v-icon>
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" @click="moveStep(idx, 1)" :disabled="idx === steps.length - 1">
                      <v-icon size="16">mdi-arrow-right</v-icon>
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" @click="removeStep(idx)">
                      <v-icon size="16">mdi-close</v-icon>
                    </v-btn>
                  </div>
                  <div class="blueprint-node-body">
                    <div class="blueprint-node-ports">
                      <div class="port port-in"></div>
                      <div class="port port-out"></div>
                    </div>
                    <p class="blueprint-node-label">{{ stepLabel(step) }}</p>
                    <p class="blueprint-node-meta">Key: {{ step.stepKey }}</p>
                  </div>
                </div>
                <div v-if="steps.length === 0" class="blueprint-empty-hint">
                  Click Add step on the right to start your blueprint.
                </div>
              </div>
            </v-sheet>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card class="mb-4">
          <v-card-title>Step Inspector</v-card-title>
          <v-card-text>
            <v-select
              v-model="newStepType"
              label="Step type"
              :items="[{ title: 'Action (API call)', value: 'action' }, { title: 'Map', value: 'MAP' }, { title: 'Filter', value: 'FILTER' }, { title: 'Loop', value: 'LOOP' }, { title: 'If', value: 'IF' }]"
              class="mb-2"
            />
            <template v-if="newStepType === 'action'">
              <v-select
                v-model="newStepActionId"
                label="Action"
                :items="allActionsFlat"
                item-title="label"
                item-value="id"
                clearable
                class="mb-2"
              />
              <v-select
                v-if="newStepActionId"
                v-model="newStepConnectionId"
                label="Connection (optional)"
                :items="connectionsForSelectedAction"
                item-title="name"
                item-value="id"
                clearable
              />
            </template>
            <template v-else-if="newStepType === 'MAP' || newStepType === 'FILTER'">
              <v-select
                v-model="newNativeSourceStepKey"
                label="Source step"
                :items="steps.map(s => s.stepKey)"
                class="mb-2"
              />
              <v-textarea
                v-model="newNativeCode"
                :label="newStepType === 'MAP' ? 'Code (return array)' : 'Code (return filtered array)'"
                rows="4"
                class="mb-2"
              />
            </template>
            <template v-else-if="newStepType === 'LOOP'">
              <v-select
                v-model="newLoopSourceStepKey"
                label="Source step (array)"
                :items="steps.map(s => s.stepKey)"
                class="mb-2"
              />
              <p class="text-caption text-medium-emphasis mb-1">Body steps (run per item; use $.currentItem in mappings)</p>
              <v-list density="compact" class="mb-2">
                <v-list-item v-for="(body, bi) in newLoopBodySteps" :key="bi" class="d-flex align-center">
                  <v-select
                    v-model="body.actionId"
                    :items="allActionsFlat"
                    item-title="label"
                    item-value="id"
                    density="compact"
                    hide-details
                    class="flex-grow-1 mr-2"
                  />
                  <v-btn icon size="x-small" variant="text" @click="newLoopBodySteps.splice(bi, 1)">
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </v-list-item>
              </v-list>
              <v-btn
                size="small"
                variant="outlined"
                @click="newLoopBodySteps.push({ stepKey: `loop_body_${Date.now()}`, actionId: allActionsFlat[0]?.id ?? '' })"
              >
                Add body step
              </v-btn>
            </template>
            <template v-else-if="newStepType === 'IF'">
              <v-select
                v-model="newIfSourceStepKey"
                label="Source step"
                :items="steps.map(s => s.stepKey)"
                class="mb-2"
              />
              <p class="text-caption text-medium-emphasis mb-1">Branches (first matching condition runs its steps)</p>
              <div v-for="(branch, bi) in newIfBranches" :key="bi" class="mb-2 pa-2 border rounded">
                <v-text-field
                  v-model="branch.condition"
                  label="Condition (JS on input)"
                  density="compact"
                  placeholder="input.count > 0"
                />
                <v-list density="compact">
                  <v-list-item v-for="(s, si) in branch.steps" :key="si" class="d-flex align-center">
                    <v-select
                      v-model="s.actionId"
                      :items="allActionsFlat"
                      item-title="label"
                      item-value="id"
                      density="compact"
                      hide-details
                      class="flex-grow-1 mr-2"
                    />
                    <v-btn icon size="x-small" variant="text" @click="branch.steps.splice(si, 1)">
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </v-list-item>
                </v-list>
                <v-btn
                  size="x-small"
                  variant="text"
                  @click="branch.steps.push({ stepKey: `if_${bi}_${branch.steps.length}`, actionId: allActionsFlat[0]?.id ?? '' })"
                >
                  + Step
                </v-btn>
                <v-btn size="x-small" variant="text" color="error" @click="newIfBranches.splice(bi, 1)">
                  Remove branch
                </v-btn>
              </div>
              <v-btn
                size="small"
                variant="outlined"
                class="mr-2"
                @click="newIfBranches.push({ condition: '', steps: [] })"
              >
                + Branch
              </v-btn>
              <p class="text-caption mt-2">Else steps (optional)</p>
              <v-list density="compact">
                <v-list-item v-for="(s, si) in newIfElseSteps" :key="si" class="d-flex align-center">
                  <v-select
                    v-model="s.actionId"
                    :items="allActionsFlat"
                    item-title="label"
                    item-value="id"
                    density="compact"
                    hide-details
                    class="flex-grow-1 mr-2"
                  />
                  <v-btn icon size="x-small" variant="text" @click="newIfElseSteps.splice(si, 1)">
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </v-list-item>
              </v-list>
              <v-btn
                size="x-small"
                variant="text"
                @click="newIfElseSteps.push({ stepKey: `else_${newIfElseSteps.length}`, actionId: allActionsFlat[0]?.id ?? '' })"
              >
                + Else step
              </v-btn>
            </template>
            <v-btn class="mt-2" color="primary" size="small" :disabled="!canAddNewStep" @click="addStep">
              Add step
            </v-btn>
            <v-btn class="mt-2 ml-2" color="secondary" size="small" :loading="saving" :disabled="!dirty" @click="saveVersion">
              Save draft
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="5">
        <v-card class="mb-4">
          <v-card-title>Triggers</v-card-title>
          <v-card-text>
            <v-list v-if="triggers.length">
              <v-list-item v-for="t in triggers" :key="t.id" class="d-flex align-center">
                <span class="flex-grow-1">{{ t.name }} ({{ t.type }})</span>
                <v-btn icon size="small" variant="text" @click="editTrigger(t)">Edit</v-btn>
                <v-btn icon size="small" variant="text" @click="deleteTrigger(t)">Delete</v-btn>
              </v-list-item>
            </v-list>
            <p v-else class="text-medium-emphasis">No triggers. Add manual, webhook, or cron.</p>
            <v-btn class="mt-2" size="small" @click="openTriggerDialog()">Add trigger</v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

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
}
/** Native: Map - transform source output with JS, return array */
interface MapStepDef {
  stepKey: string;
  type: 'MAP';
  sourceStepKey: string;
  code: string;
}
/** Native: Filter - filter source array with JS */
interface FilterStepDef {
  stepKey: string;
  type: 'FILTER';
  sourceStepKey: string;
  code: string;
}
/** Native: Loop - run body steps for each item in source array */
interface LoopStepDef {
  stepKey: string;
  type: 'LOOP';
  sourceStepKey: string;
  bodySteps: AppStepDef[];
}
/** Native: IF - run first matching branch or else steps */
interface IfStepDef {
  stepKey: string;
  type: 'IF';
  sourceStepKey: string;
  branches: { condition: string; steps: AppStepDef[] }[];
  elseSteps?: AppStepDef[];
}
type StepDef = AppStepDef | MapStepDef | FilterStepDef | LoopStepDef | IfStepDef;

function isAppStep(s: StepDef): s is AppStepDef {
  return 'actionId' in s && typeof (s as AppStepDef).actionId === 'string';
}
interface WorkflowVersion {
  id: string;
  version: number;
  graph: { steps?: StepDef[] };
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
const dirty = ref(false);
const saving = ref(false);
const publishing = ref(false);
const running = ref(false);
const triggers = ref<Trigger[]>([]);
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

const newStepType = ref<'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF'>('action');
const newNativeSourceStepKey = ref('');
const newNativeCode = ref('');
const newLoopSourceStepKey = ref('');
const newLoopBodySteps = ref<{ stepKey: string; actionId: string }[]>([]);
const newIfSourceStepKey = ref('');
const newIfBranches = ref<{ condition: string; steps: { stepKey: string; actionId: string }[] }[]>([]);
const newIfElseSteps = ref<{ stepKey: string; actionId: string }[]>([]);

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
  if (newStepType.value === 'action') {
    if (!newStepActionId.value) return;
    steps.value.push({
      stepKey,
      actionId: newStepActionId.value,
      connectionId: newStepConnectionId.value ?? undefined,
    });
    newStepActionId.value = null;
    newStepConnectionId.value = null;
  } else if (newStepType.value === 'MAP') {
    steps.value.push({
      stepKey,
      type: 'MAP',
      sourceStepKey: newNativeSourceStepKey.value,
      code: newNativeCode.value.trim(),
    });
    newNativeSourceStepKey.value = '';
    newNativeCode.value = '';
  } else if (newStepType.value === 'FILTER') {
    steps.value.push({
      stepKey,
      type: 'FILTER',
      sourceStepKey: newNativeSourceStepKey.value,
      code: newNativeCode.value.trim(),
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
    });
    newIfSourceStepKey.value = '';
    newIfBranches.value = [];
    newIfElseSteps.value = [];
  }
  dirty.value = true;
}

function removeStep(idx: number) {
  steps.value.splice(idx, 1);
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
    await api.post(`/workflows/${workflowId.value}/versions`, { graph: { steps: steps.value } });
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
      await api.post(`/workflows/${workflowId.value}/triggers`, {
        key: triggerForm.value.key || `trigger_${Date.now()}`,
        name: triggerForm.value.name,
        type: triggerForm.value.type,
        webhookPath: triggerForm.value.webhookPath || undefined,
        webhookSecret: triggerForm.value.webhookSecret || undefined,
        cronExpression: triggerForm.value.cronExpression || undefined,
        cronTimezone: triggerForm.value.cronTimezone || undefined,
      });
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

async function deleteTrigger(t: Trigger) {
  try {
    await api.del(`/triggers/${t.id}`);
    await loadTriggers();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  }
}

watch(workflowId, () => { loadWorkflow(); loadTriggers(); }, { immediate: true });
watch(latestVersion, () => {
  const graph = latestVersion.value?.graph as { steps?: StepDef[] } | undefined;
  steps.value = graph?.steps ?? [];
  dirty.value = false;
}, { immediate: true });
onMounted(loadAppsAndConnections);
</script>

<style scoped>
.blueprint-canvas {
  background-color: #0b1020;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 24px;
  overflow-x: auto;
  min-height: 220px;
}

.blueprint-lane {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 24px;
}

.blueprint-node {
  min-width: 220px;
  max-width: 260px;
  border-radius: 12px;
  border: 2px solid #42a5f5;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8), 0 10px 22px rgba(0, 0, 0, 0.6);
  color: #e3f2fd;
  overflow: hidden;
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
  pointer-events: none;
}

.port {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #90caf9;
  background: #0b1020;
}

.port-in {
  margin-left: -5px;
}

.port-out {
  margin-right: -5px;
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
