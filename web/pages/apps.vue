<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <div class="d-flex justify-space-between align-center mb-4">
          <h1 class="text-h4">Apps</h1>
          <v-btn color="primary" @click="openCreate">
            <v-icon start>mdi-plus</v-icon>
            Create App
          </v-btn>
        </div>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-text>
            <v-data-table
              :headers="headers"
              :items="items"
              :loading="loading"
              :items-length="total"
            >
              <template #item.status="{ item }">
                <v-chip :color="statusColor(item.status)" size="small">
                  {{ item.status }}
                </v-chip>
              </template>
              <template #item.actions="{ item }">
                <v-btn icon size="small" variant="text" :to="`/apps/${item.id}`" title="Manage">
                  <v-icon>mdi-cog</v-icon>
                </v-btn>
                <v-btn icon size="small" variant="text" @click="editApp(item)" title="Edit">
                  <v-icon>mdi-pencil</v-icon>
                </v-btn>
                <v-btn
                  v-if="item.status !== 'Published'"
                  icon
                  size="small"
                  variant="text"
                  @click="publishApp(item)"
                  title="Publish"
                >
                  <v-icon>mdi-publish</v-icon>
                </v-btn>
                <v-btn icon size="small" variant="text" @click="confirmDelete(item)" title="Delete">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="showDialog" max-width="600" persistent>
      <v-card>
        <v-card-title>{{ editingId ? 'Edit App' : 'Create App' }}</v-card-title>
        <v-card-text>
          <v-form ref="formRef">
            <v-text-field
              v-model="form.name"
              label="Name"
              :rules="[v => !!v || 'Required']"
              required
            />
            <v-text-field
              v-model="form.key"
              label="Key (slug)"
              :rules="[v => !!v || 'Required', v => /^[a-z0-9-]+$/.test(v || '') || 'Lowercase, numbers, hyphens only']"
              :disabled="!!editingId"
              required
            />
            <v-text-field v-model="form.vendor" label="Vendor" />
            <v-text-field v-model="form.category" label="Category" />
            <v-textarea v-model="form.description" label="Description" />
            <template v-if="editingId">
              <v-select
                v-model="form.status"
                label="Status"
                :items="['Draft', 'Published', 'Deprecated']"
              />
            </template>
          </v-form>
          <v-alert v-if="error" type="error" density="compact" class="mt-2">{{ error }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveApp">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteConfirm" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete app?</v-card-title>
        <v-card-text>
          This will delete "{{ appToDelete?.name }}" and its versions and actions. This cannot be undone.
        </v-card-text>
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

interface AppItem {
  id: string;
  name: string;
  key: string;
  vendor: string | null;
  category: string | null;
  description: string | null;
  status: string;
  versions?: { id: string; version: number }[];
}

const api = useApi();
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Key', key: 'key' },
  { title: 'Vendor', key: 'vendor' },
  { title: 'Status', key: 'status' },
  { title: 'Actions', key: 'actions', sortable: false },
];

const items = ref<AppItem[]>([]);
const total = ref(0);
const loading = ref(false);
const showDialog = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref();
const error = ref('');
const saving = ref(false);
const appToDelete = ref<AppItem | null>(null);
const showDeleteConfirm = ref(false);
const deleting = ref(false);

const form = ref({
  name: '',
  key: '',
  vendor: '',
  category: '',
  description: '',
  status: 'Draft',
});

function statusColor(status: string) {
  const map: Record<string, string> = { Draft: 'grey', Published: 'success', Deprecated: 'warning' };
  return map[status] || 'grey';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get<{ items: AppItem[]; limit: number; offset: number }>('/apps', { limit: 100, offset: 0 });
    items.value = res.items;
    total.value = res.items.length;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Failed to load apps';
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.value = { name: '', key: '', vendor: '', category: '', description: '', status: 'Draft' };
  error.value = '';
  showDialog.value = true;
}

function editApp(app: AppItem) {
  editingId.value = app.id;
  form.value = {
    name: app.name,
    key: app.key,
    vendor: app.vendor ?? '',
    category: app.category ?? '',
    description: app.description ?? '',
    status: app.status,
  };
  error.value = '';
  showDialog.value = true;
}

async function saveApp() {
  const valid = await formRef.value?.validate();
  if (!valid?.valid) return;
  saving.value = true;
  error.value = '';
  try {
    if (editingId.value) {
      await api.patch(`/apps/${editingId.value}`, {
        name: form.value.name,
        vendor: form.value.vendor || undefined,
        category: form.value.category || undefined,
        description: form.value.description || undefined,
        status: form.value.status,
      });
    } else {
      await api.post('/apps', {
        key: form.value.key,
        name: form.value.name,
        vendor: form.value.vendor || undefined,
        category: form.value.category || undefined,
        description: form.value.description || undefined,
        authType: 'API_KEY',
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

async function publishApp(app: AppItem) {
  try {
    await api.post(`/apps/${app.id}/publish`, {});
    await load();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Publish failed';
  }
}

function confirmDelete(app: AppItem) {
  appToDelete.value = app;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!appToDelete.value) return;
  deleting.value = true;
  try {
    await api.del(`/apps/${appToDelete.value.id}`);
    showDeleteConfirm.value = false;
    appToDelete.value = null;
    await load();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Delete failed';
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>
