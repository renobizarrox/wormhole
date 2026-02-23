<template>
  <v-container>
    <h1 class="text-h4 mb-4">Actions</h1>
    <v-card>
      <v-card-text>
        <v-select
          v-model="selectedAppId"
          label="Select app"
          :items="apps"
          item-title="name"
          item-value="id"
          clearable
          class="mb-4"
          @update:model-value="onAppSelect"
        />
        <p v-if="!selectedAppId" class="text-medium-emphasis">Select an app to view and manage its actions, or open an app from the Apps page.</p>
        <template v-else>
          <v-data-table
            :headers="headers"
            :items="actions"
            :loading="loading"
          >
            <template #item.method="{ item }">
              <v-chip size="small">{{ item.method }}</v-chip>
            </template>
            <template #item.actions="{ item }">
              <v-btn variant="text" size="small" :to="`/apps/${selectedAppId}`">Manage in App</v-btn>
            </template>
          </v-data-table>
          <v-btn class="mt-2" :to="`/apps/${selectedAppId}`">Edit app & actions</v-btn>
        </template>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});

interface Action {
  id: string;
  key: string;
  name: string;
  method: string;
  endpointTemplate: string;
}
interface AppVersion {
  id: string;
  version: number;
  actions: Action[];
}
interface App {
  id: string;
  name: string;
  key: string;
  versions: AppVersion[];
}

const api = useApi();
const apps = ref<App[]>([]);
const selectedAppId = ref<string | null>(null);
const actions = ref<Action[]>([]);
const loading = ref(false);
const headers = [
  { title: 'Key', key: 'key' },
  { title: 'Name', key: 'name' },
  { title: 'Method', key: 'method' },
  { title: 'Endpoint', key: 'endpointTemplate' },
  { title: '', key: 'actions', sortable: false },
];

async function loadApps() {
  try {
    const res = await api.get<{ items: App[] }>('/apps', { limit: 100 });
    apps.value = res.items;
  } catch {
    apps.value = [];
  }
}

async function onAppSelect(appId: string | null) {
  if (!appId) {
    actions.value = [];
    return;
  }
  loading.value = true;
  try {
    const app = await api.get<App>(`/apps/${appId}`);
    const latest = app.versions?.[0];
    actions.value = latest?.actions ?? [];
  } catch {
    actions.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadApps);
</script>
