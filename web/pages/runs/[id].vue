<template>
  <v-container>
    <div class="d-flex align-center gap-2 mb-4">
      <v-btn icon variant="text" :to="'/runs'">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <h1 class="text-h4">Run {{ run?.id?.slice(0, 8) ?? '' }}</h1>
      <v-chip :color="statusColor(run?.status)" size="small">{{ run?.status }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="run?.status === 'QUEUED' || run?.status === 'RUNNING'"
        color="error"
        variant="tonal"
        :loading="canceling"
        @click="cancelRun"
      >
        Cancel
      </v-btn>
      <v-btn
        v-if="run && ['SUCCESS', 'FAILED', 'CANCELED'].includes(run.status)"
        color="primary"
        :loading="rerunning"
        @click="rerun"
      >
        Re-run
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" dismissible @click="error = ''">{{ error }}</v-alert>

    <v-card v-if="run" class="mb-4">
      <v-card-title>Details</v-card-title>
      <v-card-text>
        <p><strong>Workflow:</strong> {{ run.workflow?.name ?? run.workflowId }}</p>
        <p><strong>Started:</strong> {{ formatDate(run.createdAt) }}</p>
        <p v-if="run.finishedAt"><strong>Finished:</strong> {{ formatDate(run.finishedAt) }}</p>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>Steps</v-card-title>
      <v-card-text>
        <v-list v-if="steps.length">
          <v-list-item v-for="s in steps" :key="s.id" class="d-flex align-center">
            <v-chip :color="statusColor(s.status)" size="small" class="mr-2">{{ s.status }}</v-chip>
            <span class="flex-grow-1">{{ s.action?.name ?? s.stepKey }}</span>
            <span v-if="s.errorMessage" class="text-error text-caption">{{ s.errorMessage }}</span>
            <span v-if="s.startedAt" class="text-caption ml-2">{{ formatDate(s.startedAt) }}</span>
          </v-list-item>
        </v-list>
        <p v-else class="text-medium-emphasis">No steps yet.</p>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Logs</v-card-title>
      <v-card-text>
        <v-list v-if="logs.length">
          <v-list-item v-for="(log, idx) in logs" :key="idx" class="d-flex flex-column align-start">
            <span><strong>{{ log.stepKey }}</strong>: {{ log.message }}</span>
            <span v-if="log.status === 'FAILED' && log.output" class="text-caption text-error mt-1">{{ JSON.stringify(log.output) }}</span>
            <span class="text-caption text-medium-emphasis">{{ log.startedAt ? formatDate(log.startedAt) : '' }} – {{ log.finishedAt ? formatDate(log.finishedAt) : '' }}</span>
          </v-list-item>
        </v-list>
        <p v-else class="text-medium-emphasis">No logs yet.</p>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});

interface RunDetail {
  id: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  workflowId: string;
  workflow?: { name: string };
}
interface StepRun {
  id: string;
  stepKey: string;
  status: string;
  errorMessage: string | null;
  startedAt: string | null;
  action?: { name: string };
}
interface LogEntry {
  stepKey: string;
  status: string;
  message: string;
  output?: unknown;
  startedAt: string | null;
  finishedAt: string | null;
}

const route = useRoute();
const api = useApi();
const runId = computed(() => route.params.id as string);

const run = ref<RunDetail | null>(null);
const steps = ref<StepRun[]>([]);
const logs = ref<LogEntry[]>([]);
const error = ref('');
const canceling = ref(false);
const rerunning = ref(false);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function statusColor(s: string) {
  const map: Record<string, string> = {
    QUEUED: 'grey',
    RUNNING: 'info',
    SUCCESS: 'success',
    FAILED: 'error',
    CANCELED: 'warning',
  };
  return map[s] ?? 'grey';
}

function formatDate(iso: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

async function loadRun() {
  try {
    run.value = await api.get<RunDetail>(`/runs/${runId.value}`);
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  }
}

async function loadSteps() {
  try {
    const res = await api.get<{ items: StepRun[] }>(`/runs/${runId.value}/steps`);
    steps.value = res.items;
  } catch {
    steps.value = [];
  }
}

async function loadLogs() {
  try {
    const res = await api.get<{ items: LogEntry[] }>(`/runs/${runId.value}/logs`);
    logs.value = res.items;
  } catch {
    logs.value = [];
  }
}

async function refresh() {
  await loadRun();
  await loadSteps();
  await loadLogs();
}

function startPolling() {
  if (pollTimer) return;
  const poll = async () => {
    await refresh();
    if (run.value && (run.value.status === 'RUNNING' || run.value.status === 'QUEUED')) {
      pollTimer = setTimeout(poll, 3000);
    } else {
      pollTimer = null;
    }
  };
  pollTimer = setTimeout(poll, 3000);
}

async function cancelRun() {
  canceling.value = true;
  error.value = '';
  try {
    await api.post(`/runs/${runId.value}/cancel`);
    await refresh();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    canceling.value = false;
  }
}

async function rerun() {
  rerunning.value = true;
  error.value = '';
  try {
    const res = await api.post<{ workflowRunId: string }>(`/runs/${runId.value}/rerun`);
    await navigateTo(`/runs/${res.workflowRunId}`);
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    rerunning.value = false;
  }
}

watch(runId, refresh, { immediate: true });
watch(run, (r) => {
  if (r && (r.status === 'RUNNING' || r.status === 'QUEUED')) startPolling();
}, { immediate: true });
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
});
</script>
