<template>
  <v-container>
    <div class="d-flex justify-space-between align-center mb-4">
      <h1 class="text-h4">Workflows</h1>
      <v-btn color="primary" @click="openCreate">
        <v-icon start>mdi-plus</v-icon>
        Create Workflow
      </v-btn>
    </div>
    <v-card>
      <v-card-text>
        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
        >
          <template #item.status="{ item }">
            <v-chip :color="item.status === 'Active' ? 'success' : 'grey'" size="small">{{ item.status }}</v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn variant="text" size="small" :to="`/workflows/${item.id}`">Edit</v-btn>
            <v-btn variant="text" size="small" :to="`/runs?workflowId=${item.id}`">Runs</v-btn>
            <v-btn icon size="small" variant="text" @click="confirmDelete(item)">
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="showDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>{{ editingId ? 'Edit Workflow' : 'Create Workflow' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Name" :rules="[v => !!v || 'Required']" />
          <v-text-field v-model="form.key" label="Key (slug)" :rules="[v => !!v || 'Required']" :disabled="!!editingId" />
          <v-textarea v-model="form.description" label="Description" />
          <v-alert v-if="error" type="error" density="compact">{{ error }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteConfirm" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete workflow?</v-card-title>
        <v-card-text>Delete "{{ workflowToDelete?.name }}"?</v-card-text>
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

interface WorkflowItem {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: string;
}

const api = useApi();
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Key', key: 'key' },
  { title: 'Status', key: 'status' },
  { title: 'Actions', key: 'actions', sortable: false },
];

const items = ref<WorkflowItem[]>([]);
const loading = ref(false);
const showDialog = ref(false);
const editingId = ref<string | null>(null);
const form = ref({ name: '', key: '', description: '' });
const error = ref('');
const saving = ref(false);
const workflowToDelete = ref<WorkflowItem | null>(null);
const showDeleteConfirm = ref(false);
const deleting = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ items: WorkflowItem[] }>('/workflows', { limit: 100 });
    items.value = res.items;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.value = { name: '', key: '', description: '' };
  error.value = '';
  showDialog.value = true;
}

async function save() {
  if (!form.value.name || !form.value.key) return;
  saving.value = true;
  error.value = '';
  try {
    if (editingId.value) {
      await api.patch(`/workflows/${editingId.value}`, {
        name: form.value.name,
        description: form.value.description || undefined,
      });
    } else {
      await api.post('/workflows', {
        name: form.value.name,
        key: form.value.key,
        description: form.value.description || undefined,
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

function confirmDelete(w: WorkflowItem) {
  workflowToDelete.value = w;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!workflowToDelete.value) return;
  deleting.value = true;
  try {
    await api.del(`/workflows/${workflowToDelete.value.id}`);
    showDeleteConfirm.value = false;
    workflowToDelete.value = null;
    await load();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

