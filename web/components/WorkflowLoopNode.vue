<template>
  <div
    class="blueprint-node"
    :class="{ 'blueprint-node-selected': selected }"
    :style="style"
    :data-step-key="stepKey"
    @mousedown.stop="onNodeMouseDown"
    @click.stop="onSelect"
    @contextmenu.prevent="onContextMenu"
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
      <v-btn v-if="onEdit" icon size="x-small" variant="text" @mousedown.stop @click.stop="onEdit">
        <v-icon size="14">mdi-pencil</v-icon>
      </v-btn>
      <v-btn icon size="x-small" variant="text" @mousedown.stop @click.stop="onRemove">
        <v-icon size="16">mdi-close</v-icon>
      </v-btn>
    </div>
    <div class="blueprint-node-body">
      <div class="blueprint-node-ports">
        <div class="blueprint-node-ports-left">
          <div
            v-if="showInput"
            class="port port-in"
            :class="{ 'port-drop-target': isInputDropTarget }"
            data-port="in"
            :data-step-key="stepKey"
          ></div>
        </div>
        <div class="blueprint-node-ports-right">
          <div
            class="port port-out"
            :class="{ 'port-drag-source': isOutputDragSource }"
            data-port="out"
            :data-step-key="stepKey"
            @mousedown.stop="onPortMouseDown"
          ></div>
        </div>
      </div>
      <div class="blueprint-block-info">
        <div class="blueprint-block-info-line">From: {{ sourceLabel }}</div>
        <div class="blueprint-block-info-line blueprint-block-info-muted">
          {{ bodyStepsCount }} step(s) in loop
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  selected: boolean;
  style: Record<string, string>;
  color: string;
  name: string;
  typeLabel: string;
  isEditingName: boolean;
  editingNameValue: string;
  stepKey: string;
  showInput: boolean;
  sourceLabel: string;
  bodyStepsCount: number;
  onNodeMouseDown: (event: MouseEvent) => void;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onStartEditName: () => void;
  onSaveEditName: () => void;
  onPortMouseDown: (event: MouseEvent) => void;
  onRemove: () => void;
  onEdit?: () => void;
  isInputDropTarget?: boolean;
  isOutputDragSource?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:editingNameValue', value: string): void;
}>();

function onEditNameInput(event: Event) {
  emit('update:editingNameValue', (event.target as HTMLInputElement).value);
}
</script>

