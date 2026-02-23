<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <div class="d-flex align-center gap-2 mb-4">
          <v-btn icon variant="text" :to="'/apps'">
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>
          <h1 class="text-h4">{{ app?.name ?? 'App' }}</h1>
          <v-chip v-if="app" :color="app.status === 'Published' ? 'success' : 'grey'" size="small">{{ app.status }}</v-chip>
          <v-spacer />
          <v-btn v-if="app?.status !== 'Published'" color="primary" :loading="publishing" @click="publish">Publish</v-btn>
        </div>
      </v-col>
    </v-row>

    <v-alert v-if="error" type="error" dismissible @click="error = ''">{{ error }}</v-alert>

    <v-card v-if="app" class="mb-4">
      <v-card-title>Details</v-card-title>
      <v-card-text>
        <v-text-field :model-value="app.key" label="Key" disabled />
        <v-text-field :model-value="app.vendor" label="Vendor" disabled />
        <p class="text-caption">Version: {{ latestVersion?.version ?? 1 }}</p>
      </v-card-text>
    </v-card>

    <v-card v-if="app">
      <v-card-title class="d-flex align-center">
        Actions
        <v-spacer />
        <v-btn color="primary" size="small" :disabled="!appVersionId" @click="openActionDialog()">
          <v-icon start>mdi-plus</v-icon>
          Add Action
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-data-table
          :headers="actionHeaders"
          :items="actions"
          :loading="loadingActions"
        >
          <template #item.method="{ item }">
            <v-chip size="small">{{ item.method }}</v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn icon size="small" variant="text" @click="openActionDialog(item)">Edit</v-btn>
            <v-btn icon size="small" variant="text" @click="openTestDialog(item)">Test</v-btn>
            <v-btn icon size="small" variant="text" @click="confirmDeleteAction(item)">Delete</v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Create/Edit Action -->
    <v-dialog v-model="actionDialog" max-width="800" persistent>
      <v-card>
        <v-card-title>{{ editingAction ? 'Edit Action' : 'Add Action' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="actionForm.key" label="Key" :disabled="!!editingAction" :rules="[v => !!v || 'Required']" />
          <v-text-field v-model="actionForm.name" label="Name" :rules="[v => !!v || 'Required']" />
          <v-text-field v-model="actionForm.endpointTemplate" label="Endpoint template" />
          <v-select v-model="actionForm.method" label="Method" :items="['GET', 'POST', 'PUT', 'PATCH', 'DELETE']" />
          <v-textarea v-model="actionForm.bodySchemaJson" label="Body schema (JSON)" rows="4" />
          <v-textarea v-model="actionForm.querySchemaJson" label="Query schema (JSON)" rows="2" />
          <v-textarea v-model="actionForm.pathSchemaJson" label="Path schema (JSON)" rows="2" />
          <v-alert v-if="actionError" type="error" density="compact">{{ actionError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="actionDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="actionSaving" @click="saveAction">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Test Action -->
    <v-dialog v-model="testDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>Test: {{ testAction?.name }}</v-card-title>
        <v-card-text>
          <v-select
            v-model="testConnectionId"
            label="Connection (optional)"
            :items="connections"
            item-title="name"
            item-value="id"
            clearable
          />
          <v-textarea v-model="testInputJson" label="Input JSON (optional)" rows="4" />
          <v-alert v-if="testResult !== null" :type="testResult.success ? 'success' : 'error'" density="compact">
            {{ testResult.success ? 'Success' : testResult.error }}
            <pre v-if="testResult.output || testResult.diagnostics" class="mt-2 text-caption">{{ JSON.stringify(testResult.output ?? testResult.diagnostics, null, 2) }}</pre>
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="testDialog = false">Close</v-btn>
          <v-btn color="primary" :loading="testLoading" @click="runTest">Run test</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteActionConfirm" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete action?</v-card-title>
        <v-card-text>Delete "{{ actionToDelete?.name }}"?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="deleteActionConfirm = false">Cancel</v-btn>
          <v-btn color="error" :loading="actionDeleting" @click="doDeleteAction">Delete</v-btn>
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

interface AppVersion {
  id: string;
  version: number;
  actions: Action[];
}
interface Action {
  id: string;
  key: string;
  name: string;
  method: string;
  endpointTemplate: string;
  bodySchema: unknown;
  querySchema: unknown;
  pathSchema: unknown;
}
interface App {
  id: string;
  name: string;
  key: string;
  vendor: string | null;
  status: string;
  versions: AppVersion[];
}
interface Connection {
  id: string;
  name: string;
  appId: string;
}

const route = useRoute();
const api = useApi();
const appId = computed(() => route.params.id as string);

const app = ref<App | null>(null);
const error = ref('');
const publishing = ref(false);
const actions = ref<Action[]>([]);
const loadingActions = ref(false);
const connections = ref<Connection[]>([]);

const latestVersion = computed(() => app.value?.versions?.[0] ?? null);
const appVersionId = computed(() => latestVersion.value?.id ?? null);

const actionHeaders = [
  { title: 'Key', key: 'key' },
  { title: 'Name', key: 'name' },
  { title: 'Method', key: 'method' },
  { title: 'Endpoint', key: 'endpointTemplate' },
  { title: 'Actions', key: 'actions', sortable: false },
];

const actionDialog = ref(false);
const editingAction = ref<Action | null>(null);
const actionForm = ref({
  key: '',
  name: '',
  endpointTemplate: '',
  method: 'GET',
  bodySchemaJson: '{}',
  querySchemaJson: '{}',
  pathSchemaJson: '{}',
});
const actionError = ref('');
const actionSaving = ref(false);
const actionToDelete = ref<Action | null>(null);
const deleteActionConfirm = ref(false);
const actionDeleting = ref(false);

const testDialog = ref(false);
const testAction = ref<Action | null>(null);
const testConnectionId = ref<string | null>(null);
const testInputJson = ref('{}');
const testResult = ref<{ success: boolean; output?: unknown; error?: string; diagnostics?: unknown } | null>(null);
const testLoading = ref(false);

async function loadApp() {
  try {
    app.value = await api.get<App>(`/apps/${appId.value}`);
    actions.value = latestVersion.value?.actions ?? [];
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Failed to load app';
  }
}

async function loadConnections() {
  try {
    const res = await api.get<{ items: Connection[] }>('/connections', { limit: 100 });
    connections.value = res.items.filter(c => c.appId === appId.value);
  } catch {
    connections.value = [];
  }
}

function openActionDialog(action?: Action) {
  editingAction.value = action ?? null;
  if (action) {
    actionForm.value = {
      key: action.key,
      name: action.name,
      endpointTemplate: action.endpointTemplate,
      method: action.method,
      bodySchemaJson: JSON.stringify(action.bodySchema ?? {}, null, 2),
      querySchemaJson: JSON.stringify(action.querySchema ?? {}, null, 2),
      pathSchemaJson: JSON.stringify(action.pathSchema ?? {}, null, 2),
    };
  } else {
    actionForm.value = {
      key: '',
      name: '',
      endpointTemplate: '',
      method: 'GET',
      bodySchemaJson: '{}',
      querySchemaJson: '{}',
      pathSchemaJson: '{}',
    };
  }
  actionError.value = '';
  actionDialog.value = true;
}

function parseJson(s: string): Record<string, unknown> | null {
  try {
    if (!s.trim()) return {};
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function saveAction() {
  const bodySchema = parseJson(actionForm.value.bodySchemaJson);
  const querySchema = parseJson(actionForm.value.querySchemaJson);
  const pathSchema = parseJson(actionForm.value.pathSchemaJson);
  if (bodySchema === null || querySchema === null || pathSchema === null) {
    actionError.value = 'Invalid JSON in one or more schema fields';
    return;
  }
  actionSaving.value = true;
  actionError.value = '';
  try {
    if (editingAction.value) {
      await api.patch(`/actions/${editingAction.value.id}`, {
        name: actionForm.value.name,
        endpointTemplate: actionForm.value.endpointTemplate,
        method: actionForm.value.method,
        bodySchema,
        querySchema,
        pathSchema,
      });
    } else {
      if (!appVersionId.value) return;
      await api.post(`/app-versions/${appVersionId.value}/actions`, {
        key: actionForm.value.key,
        name: actionForm.value.name,
        endpointTemplate: actionForm.value.endpointTemplate,
        method: actionForm.value.method,
        bodySchema,
        querySchema,
        pathSchema,
      });
    }
    actionDialog.value = false;
    await loadApp();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) actionError.value = e.data.message;
    else actionError.value = 'Save failed';
  } finally {
    actionSaving.value = false;
  }
}

function confirmDeleteAction(action: Action) {
  actionToDelete.value = action;
  deleteActionConfirm.value = true;
}

async function doDeleteAction() {
  if (!actionToDelete.value) return;
  actionDeleting.value = true;
  try {
    await api.del(`/actions/${actionToDelete.value.id}`);
    deleteActionConfirm.value = false;
    actionToDelete.value = null;
    await loadApp();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) actionError.value = e.data.message;
  } finally {
    actionDeleting.value = false;
  }
}

function openTestDialog(action: Action) {
  testAction.value = action;
  testConnectionId.value = null;
  testInputJson.value = '{}';
  testResult.value = null;
  testDialog.value = true;
  loadConnections();
}

async function runTest() {
  if (!testAction.value) return;
  let input: Record<string, unknown> | undefined;
  try {
    input = testInputJson.value.trim() ? (JSON.parse(testInputJson.value) as Record<string, unknown>) : undefined;
  } catch {
    testResult.value = { success: false, error: 'Invalid JSON input' };
    return;
  }
  testLoading.value = true;
  testResult.value = null;
  try {
    const res = await api.post<{ success: boolean; output?: unknown; error?: string; diagnostics?: unknown }>(
      `/actions/${testAction.value.id}/test`,
      { connectionId: testConnectionId.value || undefined, input }
    );
    testResult.value = res;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) testResult.value = { success: false, error: e.data.message };
    else testResult.value = { success: false, error: 'Test request failed' };
  } finally {
    testLoading.value = false;
  }
}

async function publish() {
  if (!app.value) return;
  publishing.value = true;
  try {
    await api.post(`/apps/${app.value.id}/publish`, {});
    await loadApp();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    publishing.value = false;
  }
}

watch(appId, loadApp, { immediate: true });
watch(latestVersion, (v) => { actions.value = v?.actions ?? []; }, { immediate: true });
</script>
