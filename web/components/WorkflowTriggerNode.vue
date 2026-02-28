<template>
  <div
    class="blueprint-node blueprint-node-trigger"
    :class="{ 'blueprint-node-selected': selected }"
    :style="style"
    @mousedown.stop="onNodeMouseDown"
    @click.stop="onSelect"
  >
    <div class="blueprint-node-header" :style="{ backgroundColor: color }">
      <div class="blueprint-node-header-text" @mousedown.stop>
        <input
          v-if="isEditingName"
          :value="editingNameValue"
          class="blueprint-node-title-input"
          @input="onEditNameInput"
          @blur="onSaveEditName"
          @keydown.enter="onSaveEditName"
        />
        <span
          v-else
          class="blueprint-node-title blueprint-node-label-editable"
          @click="onStartEditName"
        >{{ name }}</span>
        <span class="blueprint-node-type-label">{{ typeLabel }}</span>
      </div>
      <v-spacer />
      <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="onEdit">
        <v-icon size="14">mdi-pencil</v-icon>
      </v-btn>
      <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="onDelete">
        <v-icon size="14">mdi-close</v-icon>
      </v-btn>
    </div>
    <div class="blueprint-node-body">
      <div class="blueprint-node-ports">
        <div class="blueprint-node-ports-left"></div>
        <div class="blueprint-node-ports-right">
          <div
            class="port port-out"
            data-port="out"
            :data-trigger-id="id"
            @mousedown.stop="onPortMouseDown"
          ></div>
        </div>
      </div>
      <div class="blueprint-block-info">
        <div class="blueprint-block-info-line">{{ type }}</div>
        <template v-if="type === 'WEBHOOK' && webhookPath">
          <div class="blueprint-block-info-line blueprint-block-info-muted">/{{ webhookPath }}</div>
        </template>
        <template v-else-if="type === 'CRON' && cronExpression">
          <div class="blueprint-block-info-line blueprint-block-info-muted">{{ cronExpression }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  id: string;
  name: string;
  type: string;
  webhookPath?: string | null;
  cronExpression?: string | null;
  selected: boolean;
  style: Record<string, string>;
  color: string;
  typeLabel: string;
  isEditingName: boolean;
  editingNameValue: string;
  onNodeMouseDown: (event: MouseEvent) => void;
  onSelect: () => void;
  onStartEditName: () => void;
  onSaveEditName: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPortMouseDown: (event: MouseEvent) => void;
}>();

const emit = defineEmits<{
  (e: 'update:editingNameValue', value: string): void;
}>();

function onEditNameInput(event: Event) {
  emit('update:editingNameValue', (event.target as HTMLInputElement).value);
}
</script>

