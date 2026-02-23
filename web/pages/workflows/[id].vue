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
      <v-col cols="12" md="7">
        <v-card class="mb-4">
          <v-card-title>Steps</v-card-title>
          <v-card-text>
            <v-list>
              <v-list-item v-for="(step, idx) in steps" :key="idx" class="d-flex align-center">
                <span class="mr-2">{{ idx + 1 }}.</span>
                <span class="flex-grow-1">{{ stepActionName(step.actionId) }}</span>
                <v-btn icon size="small" variant="text" @click="moveStep(idx, -1)" :disabled="idx === 0">
                  <v-icon>mdi-arrow-up</v-icon>
                </v-btn>
                <v-btn icon size="small" variant="text" @click="moveStep(idx, 1)" :disabled="idx === steps.length - 1">
                  <v-icon>mdi-arrow-down</v-icon>
                </v-btn>
                <v-btn icon size="small" variant="text" @click="removeStep(idx)">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </v-list-item>
            </v-list>
            <v-divider class="my-2" />
            <v-select
              v-model="newStepActionId"
              label="Add step (action)"
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
            <v-btn class="mt-2" color="primary" size="small" :disabled="!newStepActionId" @click="addStep">
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

interface StepDef {
  stepKey: string;
  actionId: string;
  connectionId?: string;
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
  if (!newStepActionId.value) return;
  const stepKey = `step_${steps.value.length + 1}`;
  steps.value.push({
    stepKey,
    actionId: newStepActionId.value,
    connectionId: newStepConnectionId.value ?? undefined,
  });
  newStepActionId.value = null;
  newStepConnectionId.value = null;
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
