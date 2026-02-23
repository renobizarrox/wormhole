<template>
  <v-container>
    <div class="d-flex justify-space-between align-center mb-4">
      <h1 class="text-h4">Connections</h1>
      <v-btn color="primary" @click="openCreate">
        <v-icon start>mdi-plus</v-icon>
        Create Connection
      </v-btn>
    </div>
    <v-card>
      <v-card-text>
        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
        >
          <template #item.app="{ item }">
            {{ appName(item.appId) }}
          </template>
          <template #item.isActive="{ item }">
            <v-chip :color="item.isActive ? 'success' : 'grey'" size="small">{{ item.isActive ? 'Active' : 'Inactive' }}</v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn icon size="small" variant="text" @click="testConnection(item)" :loading="testingId === item.id">Test</v-btn>
            <v-btn icon size="small" variant="text" @click="editConnection(item)">Edit</v-btn>
            <v-btn icon size="small" variant="text" @click="confirmDelete(item)">Delete</v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="showDialog" max-width="600" persistent>
      <v-card>
        <v-card-title>{{ editingId ? 'Edit Connection' : 'Create Connection' }}</v-card-title>
        <v-card-text>
          <v-select
            v-model="form.appId"
            label="App"
            :items="apps"
            item-title="name"
            item-value="id"
            :disabled="!!editingId"
            :rules="[v => !!v || 'Required']"
          />
          <v-text-field v-model="form.name" label="Name" :rules="[v => !!v || 'Required']" />
          <v-select v-model="form.authType" label="Auth type" :items="['API_KEY', 'OAUTH2', 'BASIC', 'CUSTOM_HEADER']" :disabled="!!editingId" />
          <p class="text-caption text-medium-emphasis mt-2">Credentials (stored encrypted). Leave blank when editing to keep existing.</p>
          <v-textarea v-model="form.credentialsJson" label="Credentials (JSON, e.g. {\"apiKey\": \"...\"})" rows="3" />
          <v-alert v-if="error" type="error" density="compact" class="mt-2">{{ error }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="testResultDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Test result</v-card-title>
        <v-card-text>
          <v-alert :type="testResult?.success ? 'success' : 'error'">
            {{ testResult?.success ? 'Connection OK' : testResult?.error ?? 'Failed' }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="testResultDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteConfirm" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete connection?</v-card-title>
        <v-card-text>Delete "{{ connToDelete?.name }}"?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeleteConfirm = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="doDelete">Delete</v-btn>
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

interface ConnectionItem {
  id: string;
  appId: string;
  name: string;
  authType: string;
  isActive: boolean;
}
interface AppItem {
  id: string;
  name: string;
}

const api = useApi();
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'App', key: 'app' },
  { title: 'Auth', key: 'authType' },
  { title: 'Status', key: 'isActive' },
  { title: 'Actions', key: 'actions', sortable: false },
];

const items = ref<ConnectionItem[]>([]);
const apps = ref<AppItem[]>([]);
const loading = ref(false);
const showDialog = ref(false);
const editingId = ref<string | null>(null);
const error = ref('');
const saving = ref(false);
const connToDelete = ref<ConnectionItem | null>(null);
const showDeleteConfirm = ref(false);
const deleting = ref(false);
const testingId = ref<string | null>(null);
const testResult = ref<{ success: boolean; error?: string } | null>(null);
const testResultDialog = ref(false);

const form = ref({
  appId: '',
  name: '',
  authType: 'API_KEY',
  credentialsJson: '{}',
});

function appName(appId: string) {
  return apps.value.find(a => a.id === appId)?.name ?? appId;
}

async function load() {
  loading.value = true;
  try {
    const [connRes, appRes] = await Promise.all([
      api.get<{ items: ConnectionItem[] }>('/connections', { limit: 100 }),
      api.get<{ items: AppItem[] }>('/apps', { limit: 100 }),
    ]);
    items.value = connRes.items;
    apps.value = appRes.items;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.value = { appId: '', name: '', authType: 'API_KEY', credentialsJson: '{}' };
  error.value = '';
  showDialog.value = true;
}

function editConnection(conn: ConnectionItem) {
  editingId.value = conn.id;
  form.value = {
    appId: conn.appId,
    name: conn.name,
    authType: conn.authType,
    credentialsJson: '{}',
  };
  error.value = '';
  showDialog.value = true;
}

async function save() {
  let credentials: Record<string, string | number | boolean> = {};
  if (form.value.credentialsJson.trim()) {
    try {
      credentials = JSON.parse(form.value.credentialsJson) as Record<string, string | number | boolean>;
    } catch {
      error.value = 'Invalid credentials JSON';
      return;
    }
  }
  if (!editingId.value && Object.keys(credentials).length === 0) {
    error.value = 'Credentials required when creating';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    if (editingId.value) {
      const body: { name?: string; credentials?: Record<string, string | number | boolean> } = { name: form.value.name };
      if (Object.keys(credentials).length) body.credentials = credentials;
      await api.patch(`/connections/${editingId.value}`, body);
    } else {
      await api.post('/connections', {
        appId: form.value.appId,
        name: form.value.name,
        authType: form.value.authType,
        credentials,
      });
    }
    showDialog.value = false;
    await load();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function testConnection(conn: ConnectionItem) {
  testingId.value = conn.id;
  testResult.value = null;
  try {
    const res = await api.post<{ success: boolean; error?: string }>(`/connections/${conn.id}/test`);
    testResult.value = res;
    testResultDialog.value = true;
  } catch (e: unknown) {
    testResult.value = { success: false, error: isApiError(e) && e.data?.message ? e.data.message : 'Test failed' };
    testResultDialog.value = true;
  } finally {
    testingId.value = null;
  }
}

function confirmDelete(conn: ConnectionItem) {
  connToDelete.value = conn;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!connToDelete.value) return;
  deleting.value = true;
  try {
    await api.del(`/connections/${connToDelete.value.id}`);
    showDeleteConfirm.value = false;
    connToDelete.value = null;
    await load();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>
