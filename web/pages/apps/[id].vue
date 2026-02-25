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
    <v-dialog v-model="actionDialog" max-width="800" persistent scrollable>
      <v-card>
        <v-card-title>{{ editingAction ? 'Edit Action' : 'Add Action' }}</v-card-title>
        <v-card-text>
          <v-tabs v-model="actionTab" class="mb-4">
            <v-tab value="properties">Properties</v-tab>
            <v-tab value="request">Request</v-tab>
            <v-tab value="arguments">Arguments</v-tab>
          </v-tabs>
          <v-window v-model="actionTab">
            <v-window-item value="properties">
              <p class="text-caption text-medium-emphasis mb-2">Settings to help us understand what the action is doing. Useful for workflow builder and logging.</p>
              <v-text-field v-model="actionForm.model" label="Model" hint="Resource type this action interacts with (e.g. Commerce / Product)" persistent-hint />
              <v-radio-group v-model="actionForm.operation" label="Operation" inline>
                <v-radio label="None" value="NONE" />
                <v-radio label="Read" value="READ" />
                <v-radio label="Create" value="CREATE" />
                <v-radio label="Update" value="UPDATE" />
                <v-radio label="Delete" value="DELETE" />
              </v-radio-group>
              <v-divider class="my-3" />
              <p class="text-caption text-medium-emphasis mb-2">Features</p>
              <div class="d-flex flex-wrap gap-4">
                <v-checkbox v-model="actionForm.isGraphQL" label="Is GraphQL?" density="compact" hide-details />
                <v-checkbox v-model="actionForm.hasPaginationLimit" label="Pagination limit" density="compact" hide-details />
                <v-checkbox v-model="actionForm.hasPaginationOffset" label="Pagination offset" density="compact" hide-details />
                <v-checkbox v-model="actionForm.hasCustomArguments" label="Custom arguments" density="compact" hide-details />
                <v-checkbox v-model="actionForm.hasFilters" label="Filters" density="compact" hide-details />
                <v-checkbox v-model="actionForm.hasSorting" label="Sorting" density="compact" hide-details />
              </div>
              <v-divider class="my-3" />
              <v-textarea v-model="actionForm.notes" label="Notes" hint="Relevant quirks or action info for workflow builders. Markdown supported." persistent-hint rows="3" />
              <v-select v-model="actionForm.notesAppearance" label="Notes appearance" :items="[{ title: 'Info', value: 'info' }, { title: 'Warning', value: 'warning' }, { title: 'Error', value: 'error' }]" clearable />
            </v-window-item>
            <v-window-item value="request">
              <v-text-field v-model="actionForm.key" label="Key" :disabled="!!editingAction" :rules="[v => !!v || 'Required']" />
              <v-text-field v-model="actionForm.name" label="Name" :rules="[v => !!v || 'Required']" />
              <v-text-field v-model="actionForm.endpointTemplate" label="Endpoint template" />
              <v-select v-model="actionForm.method" label="Method" :items="['GET', 'POST', 'PUT', 'PATCH', 'DELETE']" />
            </v-window-item>
            <v-window-item value="arguments">
              <v-textarea v-model="actionForm.bodySchemaJson" label="Body schema (JSON)" rows="4" />
              <v-textarea v-model="actionForm.querySchemaJson" label="Query schema (JSON)" rows="2" />
              <v-textarea v-model="actionForm.pathSchemaJson" label="Path schema (JSON)" rows="2" />
            </v-window-item>
          </v-window>
          <v-alert v-if="actionError" type="error" density="compact" class="mt-3">{{ actionError }}</v-alert>
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
  model?: string | null;
  operation?: string | null;
  isGraphQL?: boolean;
  hasPaginationLimit?: boolean;
  hasPaginationOffset?: boolean;
  hasCustomArguments?: boolean;
  hasFilters?: boolean;
  hasSorting?: boolean;
  notes?: string | null;
  notesAppearance?: string | null;
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
const actionTab = ref('properties');
const editingAction = ref<Action | null>(null);
const actionForm = ref({
  key: '',
  name: '',
  endpointTemplate: '',
  method: 'GET',
  bodySchemaJson: '{}',
  querySchemaJson: '{}',
  pathSchemaJson: '{}',
  model: '' as string | null,
  operation: 'NONE' as string,
  isGraphQL: false,
  hasPaginationLimit: false,
  hasPaginationOffset: false,
  hasCustomArguments: false,
  hasFilters: false,
  hasSorting: false,
  notes: '' as string | null,
  notesAppearance: null as string | null,
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
  actionTab.value = 'properties';
  if (action) {
    actionForm.value = {
      key: action.key,
      name: action.name,
      endpointTemplate: action.endpointTemplate,
      method: action.method,
      bodySchemaJson: JSON.stringify(action.bodySchema ?? {}, null, 2),
      querySchemaJson: JSON.stringify(action.querySchema ?? {}, null, 2),
      pathSchemaJson: JSON.stringify(action.pathSchema ?? {}, null, 2),
      model: action.model ?? null,
      operation: action.operation ?? 'NONE',
      isGraphQL: action.isGraphQL ?? false,
      hasPaginationLimit: action.hasPaginationLimit ?? false,
      hasPaginationOffset: action.hasPaginationOffset ?? false,
      hasCustomArguments: action.hasCustomArguments ?? false,
      hasFilters: action.hasFilters ?? false,
      hasSorting: action.hasSorting ?? false,
      notes: action.notes ?? null,
      notesAppearance: action.notesAppearance ?? null,
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
      model: null,
      operation: 'NONE',
      isGraphQL: false,
      hasPaginationLimit: false,
      hasPaginationOffset: false,
      hasCustomArguments: false,
      hasFilters: false,
      hasSorting: false,
      notes: null,
      notesAppearance: null,
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
    const props = {
      model: actionForm.value.model || null,
      operation: actionForm.value.operation === 'NONE' ? null : actionForm.value.operation,
      isGraphQL: actionForm.value.isGraphQL,
      hasPaginationLimit: actionForm.value.hasPaginationLimit,
      hasPaginationOffset: actionForm.value.hasPaginationOffset,
      hasCustomArguments: actionForm.value.hasCustomArguments,
      hasFilters: actionForm.value.hasFilters,
      hasSorting: actionForm.value.hasSorting,
      notes: actionForm.value.notes || null,
      notesAppearance: actionForm.value.notesAppearance || null,
    };
    if (editingAction.value) {
      await api.patch(`/actions/${editingAction.value.id}`, {
        name: actionForm.value.name,
        endpointTemplate: actionForm.value.endpointTemplate,
        method: actionForm.value.method,
        bodySchema,
        querySchema,
        pathSchema,
        ...props,
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
        ...props,
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
