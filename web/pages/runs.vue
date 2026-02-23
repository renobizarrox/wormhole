<template>
  <v-container>
    <h1 class="text-h4 mb-4">Runs</h1>
    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="4">
            <v-select
              v-model="filters.workflowId"
              label="Workflow"
              :items="workflows"
              item-title="name"
              item-value="id"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filters.status"
              label="Status"
              :items="['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED']"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="4" class="d-flex align-center">
            <v-btn color="primary" @click="load">Apply</v-btn>
          </v-col>
        </v-row>
        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
        >
          <template #item.status="{ item }">
            <v-chip :color="statusColor(item.status)" size="small">{{ item.status }}</v-chip>
          </template>
          <template #item.workflow="{ item }">
            {{ item.workflow?.name ?? '-' }}
          </template>
          <template #item.createdAt="{ item }">
            {{ formatDate(item.createdAt) }}
          </template>
          <template #item.actions="{ item }">
            <v-btn variant="text" size="small" :to="`/runs/${item.id}`">View</v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});

interface RunItem {
  id: string;
  status: string;
  createdAt: string;
  workflow?: { id: string; name: string; key: string };
}
interface WorkflowItem {
  id: string;
  name: string;
}

const api = useApi();
const headers = [
  { title: 'Run ID', key: 'id', width: '280px' },
  { title: 'Workflow', key: 'workflow' },
  { title: 'Status', key: 'status' },
  { title: 'Started', key: 'createdAt' },
  { title: '', key: 'actions', sortable: false },
];

const items = ref<RunItem[]>([]);
const workflows = ref<WorkflowItem[]>([]);
const loading = ref(false);
const filters = ref({ workflowId: '' as string | null, status: '' as string | null });

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
  const d = new Date(iso);
  return d.toLocaleString();
}

async function load() {
  loading.value = true;
  try {
    const params: Record<string, string> = { limit: '50', offset: '0' };
    if (filters.value.workflowId) params.workflowId = filters.value.workflowId;
    if (filters.value.status) params.status = filters.value.status;
    const res = await api.get<{ items: RunItem[] }>('/runs', params);
    items.value = res.items;
    const wfRes = await api.get<{ items: WorkflowItem[] }>('/workflows', { limit: 100 });
    workflows.value = wfRes.items;
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
