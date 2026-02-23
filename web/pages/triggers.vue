<template>
  <v-container>
    <h1 class="text-h4 mb-4">Triggers</h1>
    <v-card>
      <v-card-text>
        <p class="text-medium-emphasis mb-4">Triggers are configured per workflow. Open a workflow to add or edit manual, webhook, and cron triggers.</p>
        <v-list v-if="workflowsWithTriggers.length">
          <v-list-item v-for="w in workflowsWithTriggers" :key="w.id" :to="`/workflows/${w.id}`" class="d-flex align-center">
            <span class="flex-grow-1">{{ w.name }}</span>
            <v-chip v-for="t in w.triggers" :key="t.id" size="small" class="mr-1">{{ t.type }}</v-chip>
            <v-icon>mdi-chevron-right</v-icon>
          </v-list-item>
        </v-list>
        <p v-else class="text-medium-emphasis">No workflows yet. Create a workflow to add triggers.</p>
        <v-btn class="mt-2" :to="'/workflows'">Go to Workflows</v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});

interface Trigger {
  id: string;
  type: string;
  name: string;
}
interface WorkflowWithTriggers {
  id: string;
  name: string;
  triggers: Trigger[];
}

const api = useApi();
const workflowsWithTriggers = ref<WorkflowWithTriggers[]>([]);

async function load() {
  try {
    const wfRes = await api.get<{ items: { id: string; name: string }[] }>('/workflows', { limit: 100 });
    const withTriggers = await Promise.all(
      wfRes.items.map(async (w) => {
        const tRes = await api.get<{ items: Trigger[] }>(`/workflows/${w.id}/triggers`);
        return { id: w.id, name: w.name, triggers: tRes.items };
      })
    );
    workflowsWithTriggers.value = withTriggers;
  } catch {
    workflowsWithTriggers.value = [];
  }
}

onMounted(load);
</script>
