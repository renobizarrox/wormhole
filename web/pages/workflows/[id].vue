<template>
  <v-container class="workflow-page" fluid fill-height>
    <div class="d-flex align-center gap-2 mb-2 flex-shrink-0">
      <v-btn icon variant="text" :to="'/workflows'">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <h1 class="text-h4">{{ workflow?.name ?? 'Workflow' }}</h1>
      <v-chip v-if="workflow" :color="workflow.status === 'Active' ? 'success' : 'grey'" size="small">{{ workflow.status }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="workflow?.status === 'Active'"
        color="primary"
        :loading="running"
        @click="runWorkflow"
      >
        Run
      </v-btn>
      <v-btn
        v-if="hasDraft"
        color="primary"
        variant="tonal"
        :loading="publishing"
        @click="publish"
      >
        Publish version
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" dismissible class="flex-shrink-0" @click="error = ''">{{ error }}</v-alert>

    <v-card class="workflow-blueprint-card">
      <v-card-title class="flex-shrink-0 pa-0">
        <div class="workflow-blueprint-toolbar">
          <span class="workflow-blueprint-title-label">Blueprint</span>
          <v-spacer />
          <div class="workflow-blueprint-toolbar-icons">
            <v-tooltip location="bottom" text="Trigger">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  icon
                  variant="text"
                  size="small"
                  class="workflow-blueprint-toolbar-btn"
                  @click="addTriggerAtViewportCenter"
                >
                  <v-icon size="20" color="#876b98">mdi-lightning-bolt-outline</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip location="bottom" text="Action">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  icon
                  variant="text"
                  size="small"
                  class="workflow-blueprint-toolbar-btn"
                  @click="addStepAtViewportCenter('action')"
                >
                  <v-icon size="20" color="#5d9e5d">mdi-cog-outline</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip location="bottom" text="Map">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  icon
                  variant="text"
                  size="small"
                  class="workflow-blueprint-toolbar-btn"
                  @click="addStepAtViewportCenter('MAP')"
                >
                  <v-icon size="20" color="#6b92b5">mdi-map-outline</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip location="bottom" text="Filter">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  icon
                  variant="text"
                  size="small"
                  class="workflow-blueprint-toolbar-btn"
                  @click="addStepAtViewportCenter('FILTER')"
                >
                  <v-icon size="20" color="#9570a0">mdi-filter-outline</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip location="bottom" text="Loop">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  icon
                  variant="text"
                  size="small"
                  class="workflow-blueprint-toolbar-btn"
                  @click="addStepAtViewportCenter('LOOP')"
                >
                  <v-icon size="20" color="#c9a855">mdi-repeat</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip location="bottom" text="If">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  icon
                  variant="text"
                  size="small"
                  class="workflow-blueprint-toolbar-btn"
                  @click="addStepAtViewportCenter('IF')"
                >
                  <v-icon size="20" color="#b86d6a">mdi-source-branch</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
          </div>
          <v-spacer />
          <v-btn color="primary" size="small" variant="tonal" :loading="saving" :disabled="!dirty" @click="saveVersion">
            Save draft
          </v-btn>
        </div>
      </v-card-title>
      <v-card-text class="workflow-blueprint-card-text">
        <div class="workflow-blueprint-canvas-wrap">
        <v-sheet
          ref="blueprintCanvas"
          class="blueprint-canvas"
          rounded
          :class="{ 'blueprint-canvas-panning': isPanning }"
          @contextmenu.prevent="onCanvasContextMenu"
          @wheel.prevent="onCanvasWheel"
          @mousedown="onCanvasMouseDown"
        >
          <div
            ref="blueprintCanvasInner"
            class="blueprint-canvas-camera"
            :style="{
              width: canvasContentSize.width + 'px',
              height: canvasContentSize.height + 'px',
              transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
              transformOrigin: '0 0',
            }"
          >
            <div
              ref="blueprintLane"
              class="blueprint-lane"
              :style="{ width: canvasContentSize.width + 'px', height: canvasContentSize.height + 'px' }"
            >
            <!-- Trigger nodes -->
            <WorkflowTriggerNode
              v-for="t in triggers"
              :key="t.id"
              :id="t.id"
              :name="t.name"
              :type="t.type"
              :webhook-path="t.webhookPath"
              :cron-expression="t.cronExpression"
              :selected="selectedTriggerId === t.id"
              :style="triggerNodeStyle(t)"
              color="#876b98"
              type-label="Trigger"
              :is-editing-name="editingTriggerId === t.id"
              :editing-name-value="editingNameValue"
              :on-node-mouse-down="(event) => onTriggerNodeMouseDown(t, event)"
              :on-select="() => selectTrigger(t.id)"
              :on-start-edit-name="() => startEditingTriggerName(t)"
              :on-save-edit-name="saveEditingTriggerName"
              :on-edit="() => editTrigger(t)"
              :on-delete="() => confirmDeleteTrigger(t)"
              :on-port-mouse-down="(event) => onTriggerPortMouseDown(t, event)"
              :is-output-drag-source="!!(connectionDrag?.from.kind === 'trigger' && connectionDrag.from.key === t.id)"
              @update:editingNameValue="val => editingNameValue = val"
            />
            <!-- Step nodes -->
            <template v-for="(step, idx) in steps" :key="step.stepKey">
              <WorkflowActionNode
                v-if="isAppStep(step)"
                :selected="selectedStepKey === step.stepKey"
                :style="nodeStyle(step, idx)"
                :color="nodeColor(step)"
                :name="stepDisplayName(step)"
                :type-label="nodeType(step)"
                :is-editing-name="editingStepKey === step.stepKey"
                :editing-name-value="editingNameValue"
                :step-key="step.stepKey"
                :show-input="hasInputPort(step)"
                :body-main="stepActionName(step.actionId)"
                :connection-label="step.connectionId ? `Connection: ${connectionName(step.connectionId)}` : ''"
                :inputs-mapped-count="step.inputMapping ? Object.keys(step.inputMapping).length : 0"
                :on-node-mouse-down="(event) => onNodeMouseDown(step, event)"
                :on-select="() => selectStep(step.stepKey)"
                :on-context-menu="(event) => onNodeContextMenu(step, idx, event)"
                :on-start-edit-name="() => startEditingStepName(step)"
                :on-save-edit-name="saveEditingStepName"
                :on-port-mouse-down="(event) => onPortMouseDown(step, event)"
                :on-remove="() => confirmRemoveStep(idx)"
                :on-edit="() => openStepEditModal(step, idx)"
                :is-input-drop-target="!!(connectionDrag && connectionDropTargetKey === step.stepKey)"
                :is-output-drag-source="!!(connectionDrag?.from.kind === 'step' && connectionDrag?.from.key === step.stepKey)"
                @update:editingNameValue="val => editingNameValue = val"
              />
              <WorkflowMapNode
                v-else-if="step.type === 'MAP'"
                :selected="selectedStepKey === step.stepKey"
                :style="nodeStyle(step, idx)"
                :color="nodeColor(step)"
                :name="stepDisplayName(step)"
                :type-label="nodeType(step)"
                :is-editing-name="editingStepKey === step.stepKey"
                :editing-name-value="editingNameValue"
                :step-key="step.stepKey"
                :show-input="hasInputPort(step)"
                :source-label="step.sourceStepKey ? stepDisplayNameByKey(step.sourceStepKey) : 'Not connected'"
                :code-full="step.code"
                :code-preview="codePreview(step.code)"
                :on-node-mouse-down="(event) => onNodeMouseDown(step, event)"
                :on-select="() => selectStep(step.stepKey)"
                :on-context-menu="(event) => onNodeContextMenu(step, idx, event)"
                :on-start-edit-name="() => startEditingStepName(step)"
                :on-save-edit-name="saveEditingStepName"
                :on-port-mouse-down="(event) => onPortMouseDown(step, event)"
                :on-remove="() => confirmRemoveStep(idx)"
                :on-edit="() => openStepEditModal(step, idx)"
                :is-input-drop-target="!!(connectionDrag && connectionDropTargetKey === step.stepKey)"
                :is-output-drag-source="!!(connectionDrag?.from.kind === 'step' && connectionDrag?.from.key === step.stepKey)"
                @update:editingNameValue="val => editingNameValue = val"
              />
              <WorkflowFilterNode
                v-else-if="step.type === 'FILTER'"
                :selected="selectedStepKey === step.stepKey"
                :style="nodeStyle(step, idx)"
                :color="nodeColor(step)"
                :name="stepDisplayName(step)"
                :type-label="nodeType(step)"
                :is-editing-name="editingStepKey === step.stepKey"
                :editing-name-value="editingNameValue"
                :step-key="step.stepKey"
                :show-input="hasInputPort(step)"
                :source-label="step.sourceStepKey ? stepDisplayNameByKey(step.sourceStepKey) : 'Not connected'"
                :code-full="step.code"
                :code-preview="codePreview(step.code)"
                :on-node-mouse-down="(event) => onNodeMouseDown(step, event)"
                :on-select="() => selectStep(step.stepKey)"
                :on-context-menu="(event) => onNodeContextMenu(step, idx, event)"
                :on-start-edit-name="() => startEditingStepName(step)"
                :on-save-edit-name="saveEditingStepName"
                :on-port-mouse-down="(event) => onPortMouseDown(step, event)"
                :on-remove="() => confirmRemoveStep(idx)"
                :on-edit="() => openStepEditModal(step, idx)"
                :is-input-drop-target="!!(connectionDrag && connectionDropTargetKey === step.stepKey)"
                :is-output-drag-source="!!(connectionDrag?.from.kind === 'step' && connectionDrag?.from.key === step.stepKey)"
                @update:editingNameValue="val => editingNameValue = val"
              />
              <WorkflowLoopNode
                v-else-if="step.type === 'LOOP'"
                :selected="selectedStepKey === step.stepKey"
                :style="nodeStyle(step, idx)"
                :color="nodeColor(step)"
                :name="stepDisplayName(step)"
                :type-label="nodeType(step)"
                :is-editing-name="editingStepKey === step.stepKey"
                :editing-name-value="editingNameValue"
                :step-key="step.stepKey"
                :show-input="hasInputPort(step)"
                :source-label="step.sourceStepKey ? stepDisplayNameByKey(step.sourceStepKey) : 'Not connected'"
                :body-steps-count="step.bodySteps?.length ?? 0"
                :on-node-mouse-down="(event) => onNodeMouseDown(step, event)"
                :on-select="() => selectStep(step.stepKey)"
                :on-context-menu="(event) => onNodeContextMenu(step, idx, event)"
                :on-start-edit-name="() => startEditingStepName(step)"
                :on-save-edit-name="saveEditingStepName"
                :on-port-mouse-down="(event) => onPortMouseDown(step, event)"
                :on-remove="() => confirmRemoveStep(idx)"
                :on-edit="() => openStepEditModal(step, idx)"
                :is-input-drop-target="!!(connectionDrag && connectionDropTargetKey === step.stepKey)"
                :is-output-drag-source="!!(connectionDrag?.from.kind === 'step' && connectionDrag?.from.key === step.stepKey)"
                @update:editingNameValue="val => editingNameValue = val"
              />
              <WorkflowIfNode
                v-else-if="step.type === 'IF'"
                :selected="selectedStepKey === step.stepKey"
                :style="nodeStyle(step, idx)"
                :color="nodeColor(step)"
                :name="stepDisplayName(step)"
                :type-label="nodeType(step)"
                :is-editing-name="editingStepKey === step.stepKey"
                :editing-name-value="editingNameValue"
                :step-key="step.stepKey"
                :show-input="hasInputPort(step)"
                :source-label="step.sourceStepKey ? stepDisplayNameByKey(step.sourceStepKey) : 'Not connected'"
                :branches="step.branches.map(br => ({ condition: br.condition, conditionPreview: codePreview(br.condition, 28), stepsCount: br.steps?.length ?? 0 }))"
                :else-steps-count="step.elseSteps?.length ?? 0"
                :on-node-mouse-down="(event) => onNodeMouseDown(step, event)"
                :on-select="() => selectStep(step.stepKey)"
                :on-context-menu="(event) => onNodeContextMenu(step, idx, event)"
                :on-start-edit-name="() => startEditingStepName(step)"
                :on-save-edit-name="saveEditingStepName"
                :on-port-mouse-down="(event) => onPortMouseDown(step, event)"
                :on-remove="() => confirmRemoveStep(idx)"
                :on-edit="() => openStepEditModal(step, idx)"
                :is-input-drop-target="!!(connectionDrag && connectionDropTargetKey === step.stepKey)"
                :is-output-drag-source="!!(connectionDrag?.from.kind === 'step' && connectionDrag?.from.key === step.stepKey)"
                @update:editingNameValue="val => editingNameValue = val"
              />
            </template>
            <div v-if="steps.length === 0 && triggers.length === 0" class="blueprint-empty-hint">
              Right-click on the canvas to add a trigger or step.
            </div>
              </div>
              <!-- Connector lines SVG -->
              <svg
                class="blueprint-connectors"
                aria-hidden="true"
                :width="canvasContentSize.width"
                :height="canvasContentSize.height"
              >
            <defs>
              <marker id="arrowhead" markerWidth="13" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#7da3c4" />
              </marker>
            </defs>
            <g v-for="(seg, i) in connectorSegments" :key="'seg-' + i">
              <path
                :d="connectorPath(seg)"
                class="connector-line connector-line-animated"
                marker-end="url(#arrowhead)"
              />
            </g>
            <path
              v-if="connectionDrag"
              :d="connectorPath({ x1: connectionDrag.from.x, y1: connectionDrag.from.y, x2: connectionDrag.x2, y2: connectionDrag.y2 })"
              class="connector-line connector-line-dragging"
              stroke-dasharray="4 4"
            />
          </svg>
          </div>
          <div class="blueprint-zoom-controls" @mousedown.stop>
            <v-btn icon size="small" variant="tonal" @click="setZoom(canvasZoom - 0.25)" :disabled="canvasZoom <= 0.25">
              <v-icon>mdi-minus</v-icon>
            </v-btn>
            <span class="blueprint-zoom-label">{{ Math.round(canvasZoom * 100) }}%</span>
            <v-btn icon size="small" variant="tonal" @click="setZoom(canvasZoom + 0.25)" :disabled="canvasZoom >= 2">
              <v-icon>mdi-plus</v-icon>
            </v-btn>
            <v-btn size="x-small" variant="text" @click="setZoom(1)">100%</v-btn>
          </div>
        </v-sheet>
        </div>
      </v-card-text>
    </v-card>

    <!-- Delete step confirmation -->
    <v-dialog v-model="deleteStepDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Delete step?</v-card-title>
        <v-card-text>
          This action cannot be undone. The step will be permanently removed from the workflow.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="deleteStepDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="false" @click="doRemoveStep">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Trigger dialog -->
    <v-dialog v-model="triggerDialog" max-width="500" persistent>
      <v-card>
        <v-card-title>{{ editingTrigger ? 'Edit Trigger' : 'Add Trigger' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="triggerForm.key" label="Key" :disabled="!!editingTrigger" />
          <v-text-field v-model="triggerForm.name" label="Name" />
          <v-select v-model="triggerForm.type" label="Type" :items="['MANUAL', 'WEBHOOK', 'CRON']" />
          <v-text-field v-if="triggerForm.type === 'WEBHOOK'" v-model="triggerForm.webhookPath" label="Webhook path slug" />
          <v-text-field v-if="triggerForm.type === 'WEBHOOK'" v-model="triggerForm.webhookSecret" label="Webhook secret (optional)" type="password" />
          <v-text-field v-if="triggerForm.type === 'CRON'" v-model="triggerForm.cronExpression" label="Cron expression (e.g. 0 * * * * for hourly)" />
          <v-text-field v-if="triggerForm.type === 'CRON'" v-model="triggerForm.cronTimezone" label="Timezone (e.g. UTC)" />
          <v-alert v-if="triggerForm.type === 'WEBHOOK' && webhookFullUrl" type="info" density="compact" class="mt-2">
            Webhook URL: <code>{{ webhookFullUrl }}</code>
          </v-alert>
          <v-alert v-if="triggerError" type="error" density="compact">{{ triggerError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="triggerDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="triggerSaving" @click="saveTrigger">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Step edit dialog -->
    <v-dialog :model-value="!!editingStep" max-width="560" persistent @update:model-value="(v) => !v && closeStepEditModal()">
      <v-card v-if="editingStep">
        <v-card-title>Edit {{ editingStep.step && isAppStep(editingStep.step) ? 'Action' : editingStep.step?.type ?? 'Step' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="stepEditForm.name" label="Name (optional)" placeholder="Display name for this block" class="mb-2" />

          <!-- Action -->
          <template v-if="editingStep.step && isAppStep(editingStep.step)">
            <v-select
              v-model="stepEditForm.actionId"
              label="Action"
              :items="allActionsFlat.map(a => ({ value: a.id, title: a.label }))"
              item-title="title"
              item-value="value"
              density="compact"
            />
            <v-select
              v-model="stepEditForm.connectionId"
              label="Connection (optional)"
              :items="stepEditConnections.map(c => ({ value: c.id, title: c.name }))"
              item-title="title"
              item-value="value"
              clearable
              density="compact"
            />
          </template>

          <!-- Map / Filter -->
          <template v-else-if="editingStep.step && (editingStep.step.type === 'MAP' || editingStep.step.type === 'FILTER')">
            <v-select
              v-model="stepEditForm.sourceStepKey"
              label="Source step"
              :items="[{ value: '', title: '— None —' }, ...stepEditSourceOptions]"
              item-title="title"
              item-value="value"
              density="compact"
            />
            <v-textarea v-model="stepEditForm.code" label="Code" rows="6" placeholder="e.g. return input;" class="mt-2" />
          </template>

          <!-- Loop -->
          <template v-else-if="editingStep.step && editingStep.step.type === 'LOOP'">
            <v-select
              v-model="stepEditForm.sourceStepKey"
              label="Source step"
              :items="[{ value: '', title: '— None —' }, ...stepEditSourceOptions]"
              item-title="title"
              item-value="value"
              density="compact"
            />
            <div class="mt-3">
              <div class="text-caption text-medium-emphasis mb-1">Body steps</div>
              <div v-for="(body, bi) in (stepEditForm.bodySteps ?? [])" :key="body.stepKey" class="d-flex align-center gap-1 mb-1">
                <v-select
                  :model-value="body.actionId"
                  :items="allActionsFlat.map(a => ({ value: a.id, title: a.label }))"
                  item-title="title"
                  item-value="value"
                  density="compact"
                  hide-details
                  class="flex-grow-1"
                  @update:model-value="(id) => stepEditSetBodyStepAction(bi, String(id ?? ''))"
                />
                <v-btn icon size="small" variant="text" @click="stepEditRemoveBodyStep(bi)">
                  <v-icon size="18">mdi-close</v-icon>
                </v-btn>
              </div>
              <v-btn size="small" variant="tonal" @click="stepEditAddBodyStep">Add step</v-btn>
            </div>
          </template>

          <!-- IF -->
          <template v-else-if="editingStep.step && editingStep.step.type === 'IF'">
            <v-select
              v-model="stepEditForm.sourceStepKey"
              label="Source step"
              :items="[{ value: '', title: '— None —' }, ...stepEditSourceOptions]"
              item-title="title"
              item-value="value"
              density="compact"
            />
            <div class="mt-3">
              <div class="text-caption text-medium-emphasis mb-1">Branches</div>
              <div v-for="(branch, bi) in (stepEditForm.branches ?? [])" :key="bi" class="mb-3 pa-2 rounded border">
                <v-textarea v-model="branch.condition" label="Condition" rows="2" density="compact" hide-details class="mb-2" />
                <div v-for="(s, si) in branch.steps" :key="s.stepKey" class="d-flex align-center gap-1 mb-1">
                  <v-select
                    :model-value="s.actionId"
                    :items="allActionsFlat.map(a => ({ value: a.id, title: a.label }))"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    hide-details
                    class="flex-grow-1"
                    @update:model-value="(id) => stepEditSetBranchStepAction(bi, si, String(id ?? ''))"
                  />
                  <v-btn icon size="small" variant="text" @click="stepEditRemoveBranchStep(bi, si)">
                    <v-icon size="18">mdi-close</v-icon>
                  </v-btn>
                </div>
                <div class="d-flex gap-1">
                  <v-btn size="small" variant="tonal" @click="stepEditAddBranchStep(bi)">Add step</v-btn>
                  <v-btn size="small" variant="text" color="error" @click="stepEditRemoveBranch(bi)">Remove branch</v-btn>
                </div>
              </div>
              <v-btn size="small" variant="tonal" class="mb-3" @click="stepEditAddBranch">Add branch</v-btn>
            </div>
            <div class="mt-2">
              <div class="text-caption text-medium-emphasis mb-1">Else steps</div>
              <div v-for="(s, si) in (stepEditForm.elseSteps ?? [])" :key="s.stepKey" class="d-flex align-center gap-1 mb-1">
                <v-select
                  :model-value="s.actionId"
                  :items="allActionsFlat.map(a => ({ value: a.id, title: a.label }))"
                  item-title="title"
                  item-value="value"
                  density="compact"
                  hide-details
                  class="flex-grow-1"
                  @update:model-value="(id) => stepEditSetElseStepAction(si, String(id ?? ''))"
                />
                <v-btn icon size="small" variant="text" @click="stepEditRemoveElseStep(si)">
                  <v-icon size="18">mdi-close</v-icon>
                </v-btn>
              </div>
              <v-btn size="small" variant="tonal" @click="stepEditAddElseStep">Add else step</v-btn>
            </div>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeStepEditModal">Cancel</v-btn>
          <v-btn color="primary" @click="saveStepEdit">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Context menu: teleport to body so it's above everything and receives clicks -->
    <Teleport to="body">
      <template v-if="contextMenu.open">
        <div
          class="blueprint-context-menu-backdrop"
          @click="contextMenu.open = false"
        ></div>
        <div
          class="blueprint-context-menu"
          :style="{ left: contextMenu.clientX + 'px', top: contextMenu.clientY + 'px' }"
          role="menu"
        >
          <template v-if="!contextMenu.connection">
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('action')">Add Action</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('MAP')">Add Map</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('FILTER')">Add Filter</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('LOOP')">Add Loop</div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('IF')">Add If</div>
            <div class="blueprint-context-menu-divider"></div>
            <div class="blueprint-context-menu-item" role="menuitem" @click="onContextMenuAction('trigger')">Add Trigger</div>
          </template>
          <template v-else>
            <div class="blueprint-context-menu-item" role="menuitem" @click="removeConnectionFromContext">Remove connection</div>
          </template>
        </div>
      </template>
    </Teleport>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});

/** App action step */
interface AppStepDef {
  stepKey: string;
  actionId: string;
  connectionId?: string;
  inputMapping?: Record<string, unknown>;
  name?: string;
  x?: number;
  y?: number;
}
/** Native: Map - transform source output with JS, return array */
interface MapStepDef {
  stepKey: string;
  type: 'MAP';
  sourceStepKey?: string;
  code: string;
  name?: string;
  x?: number;
  y?: number;
}
/** Native: Filter - filter source array with JS */
interface FilterStepDef {
  stepKey: string;
  type: 'FILTER';
  sourceStepKey?: string;
  code: string;
  name?: string;
  x?: number;
  y?: number;
}
/** Native: Loop - run body steps for each item in source array */
interface LoopStepDef {
  stepKey: string;
  type: 'LOOP';
  sourceStepKey?: string;
  bodySteps: AppStepDef[];
  name?: string;
  x?: number;
  y?: number;
}
/** Native: IF - run first matching branch or else steps. Exactly two outputs: then and else. */
interface IfStepDef {
  stepKey: string;
  type: 'IF';
  sourceStepKey?: string;
  /** Step key connected to the "then" output (at most one) */
  thenStepKey?: string;
  /** Step key connected to the "else" output (at most one) */
  elseStepKey?: string;
  branches: { condition: string; steps: AppStepDef[] }[];
  elseSteps?: AppStepDef[];
  name?: string;
  x?: number;
  y?: number;
}
type StepDef = AppStepDef | MapStepDef | FilterStepDef | LoopStepDef | IfStepDef;

function isAppStep(s: StepDef): s is AppStepDef {
  return 'actionId' in s && typeof (s as AppStepDef).actionId === 'string';
}
function isIfStep(s: StepDef): s is IfStepDef {
  return !isAppStep(s) && (s as IfStepDef).type === 'IF';
}

interface TriggerEdge {
  triggerId: string;
  stepKey: string;
}
interface WorkflowVersion {
  id: string;
  version: number;
  graph: {
    steps?: StepDef[];
    triggerPositions?: Record<string, { x: number; y: number }>;
    triggerEdges?: TriggerEdge[];
  };
  publishedAt: string | null;
}
interface Workflow {
  id: string;
  name: string;
  key: string;
  status: string;
  versions: WorkflowVersion[];
}
interface Trigger {
  id: string;
  key: string;
  name: string;
  type: string;
  webhookPath: string | null;
  cronExpression: string | null;
}
interface ActionRef {
  id: string;
  appId: string;
  label: string;
}
interface ConnectionItem {
  id: string;
  name: string;
  appId: string;
}

const route = useRoute();
const config = useRuntimeConfig();
const api = useApi();
const workflowId = computed(() => route.params.id as string);

const workflow = ref<Workflow | null>(null);
const error = ref('');
const steps = ref<StepDef[]>([]);
const triggerPositions = ref<Record<string, { x: number; y: number }>>({});
const triggerEdges = ref<TriggerEdge[]>([]);
const dirty = ref(false);
const saving = ref(false);
const publishing = ref(false);
const running = ref(false);
const triggers = ref<Trigger[]>([]);
const selectedStepKey = ref<string | null>(null);
const selectedTriggerId = ref<string | null>(null);
const deleteStepDialog = ref(false);
const deleteStepIdx = ref<number | null>(null);
const triggerDialog = ref(false);
const editingTrigger = ref<Trigger | null>(null);
const triggerForm = ref({
  key: '',
  name: '',
  type: 'MANUAL',
  webhookPath: '',
  webhookSecret: '',
  cronExpression: '',
  cronTimezone: 'UTC',
});
const triggerError = ref('');
const triggerSaving = ref(false);

/** Step edit modal: which step is being edited */
const editingStep = ref<{ step: StepDef; idx: number } | null>(null);
/** Form state for step edit (populated when opening by step type) */
const stepEditForm = ref<{
  name: string;
  actionId?: string;
  connectionId?: string;
  sourceStepKey?: string;
  code?: string;
  bodySteps?: AppStepDef[];
  branches?: { condition: string; steps: AppStepDef[] }[];
  elseSteps?: AppStepDef[];
}>({ name: '' });

/** Connections list for the currently edited action (by stepEditForm.actionId) */
const stepEditConnections = computed(() => {
  if (!stepEditForm.value.actionId) return [];
  const appId = allActionsFlat.value.find(a => a.id === stepEditForm.value.actionId)?.appId;
  if (!appId) return [];
  return connections.value.filter(c => c.appId === appId);
});

/** Available step keys for source dropdown (steps before current in list, or all for simplicity) */
const stepEditSourceOptions = computed(() =>
  steps.value.map(s => ({ value: s.stepKey, title: stepDisplayName(s) }))
);

function openStepEditModal(step: StepDef, idx: number) {
  editingStep.value = { step, idx };
  const base = { name: (step as { name?: string }).name ?? '' };
  if (isAppStep(step)) {
    stepEditForm.value = {
      ...base,
      actionId: step.actionId,
      connectionId: step.connectionId ?? '',
    };
  } else if (step.type === 'MAP' || step.type === 'FILTER') {
    stepEditForm.value = {
      ...base,
      sourceStepKey: step.sourceStepKey ?? '',
      code: step.code ?? '',
    };
  } else if (step.type === 'LOOP') {
    stepEditForm.value = {
      ...base,
      sourceStepKey: (step as LoopStepDef).sourceStepKey ?? '',
      bodySteps: [...((step as LoopStepDef).bodySteps ?? [])],
    };
  } else if (step.type === 'IF') {
    const s = step as IfStepDef;
    stepEditForm.value = {
      ...base,
      sourceStepKey: s.sourceStepKey ?? '',
      branches: (s.branches ?? []).map(b => ({ condition: b.condition, steps: [...(b.steps ?? [])] })),
      elseSteps: [...(s.elseSteps ?? [])],
    };
  } else {
    stepEditForm.value = base;
  }
}

function saveStepEdit() {
  const edit = editingStep.value;
  if (!edit) return;
  const { step, idx } = edit;
  const form = stepEditForm.value;
  const name = form.name?.trim() || undefined;

  if (isAppStep(step)) {
    (steps.value[idx] as AppStepDef).name = name;
    (steps.value[idx] as AppStepDef).actionId = form.actionId ?? step.actionId;
    (steps.value[idx] as AppStepDef).connectionId = form.connectionId?.trim() || undefined;
  } else if (step.type === 'MAP') {
    (steps.value[idx] as MapStepDef).name = name;
    (steps.value[idx] as MapStepDef).sourceStepKey = form.sourceStepKey?.trim() || undefined;
    (steps.value[idx] as MapStepDef).code = form.code?.trim() ?? '';
  } else if (step.type === 'FILTER') {
    (steps.value[idx] as FilterStepDef).name = name;
    (steps.value[idx] as FilterStepDef).sourceStepKey = form.sourceStepKey?.trim() || undefined;
    (steps.value[idx] as FilterStepDef).code = form.code?.trim() ?? '';
  } else if (step.type === 'LOOP') {
    (steps.value[idx] as LoopStepDef).name = name;
    (steps.value[idx] as LoopStepDef).sourceStepKey = form.sourceStepKey?.trim() || undefined;
    (steps.value[idx] as LoopStepDef).bodySteps = form.bodySteps ?? [];
  } else if (step.type === 'IF') {
    (steps.value[idx] as IfStepDef).name = name;
    (steps.value[idx] as IfStepDef).sourceStepKey = form.sourceStepKey?.trim() || undefined;
    (steps.value[idx] as IfStepDef).branches = form.branches ?? [];
    (steps.value[idx] as IfStepDef).elseSteps = form.elseSteps?.length ? form.elseSteps : undefined;
  }
  editingStep.value = null;
  dirty.value = true;
}

function closeStepEditModal() {
  editingStep.value = null;
}

/** Add one body step to the loop being edited */
function stepEditAddBodyStep() {
  const list = stepEditForm.value.bodySteps ?? [];
  const stepKey = `step_${Date.now()}_${list.length}`;
  stepEditForm.value = {
    ...stepEditForm.value,
    bodySteps: [...list, { stepKey, actionId: allActionsFlat.value[0]?.id ?? '', connectionId: undefined }],
  };
}

function stepEditRemoveBodyStep(bodyIdx: number) {
  const list = [...(stepEditForm.value.bodySteps ?? [])];
  list.splice(bodyIdx, 1);
  stepEditForm.value = { ...stepEditForm.value, bodySteps: list };
}

function stepEditSetBodyStepAction(bodyIdx: number, actionId: string) {
  const list = [...(stepEditForm.value.bodySteps ?? [])];
  if (!list[bodyIdx]) return;
  list[bodyIdx] = { ...list[bodyIdx], actionId, connectionId: undefined };
  stepEditForm.value = { ...stepEditForm.value, bodySteps: list };
}

/** Add a branch to the IF being edited */
function stepEditAddBranch() {
  const branches = [...(stepEditForm.value.branches ?? [])];
  branches.push({ condition: 'true', steps: [] });
  stepEditForm.value = { ...stepEditForm.value, branches };
}

function stepEditRemoveBranch(branchIdx: number) {
  const branches = [...(stepEditForm.value.branches ?? [])];
  branches.splice(branchIdx, 1);
  stepEditForm.value = { ...stepEditForm.value, branches };
}

function stepEditAddBranchStep(branchIdx: number) {
  const branches = (stepEditForm.value.branches ?? []).map((b, i) =>
    i === branchIdx
      ? { ...b, steps: [...b.steps, { stepKey: `step_${Date.now()}`, actionId: allActionsFlat.value[0]?.id ?? '', connectionId: undefined }] }
      : b
  );
  stepEditForm.value = { ...stepEditForm.value, branches };
}

function stepEditRemoveBranchStep(branchIdx: number, stepIdx: number) {
  const branches = (stepEditForm.value.branches ?? []).map((b, i) =>
    i === branchIdx ? { ...b, steps: b.steps.filter((_, j) => j !== stepIdx) } : b
  );
  stepEditForm.value = { ...stepEditForm.value, branches };
}

function stepEditSetBranchStepAction(branchIdx: number, stepIdx: number, actionId: string) {
  const branches = (stepEditForm.value.branches ?? []).map((b, i) =>
    i === branchIdx
      ? { ...b, steps: b.steps.map((s, j) => (j === stepIdx ? { ...s, actionId } : s)) }
      : b
  );
  stepEditForm.value = { ...stepEditForm.value, branches };
}

function stepEditAddElseStep() {
  const elseSteps = [...(stepEditForm.value.elseSteps ?? [])];
  elseSteps.push({ stepKey: `step_${Date.now()}`, actionId: allActionsFlat.value[0]?.id ?? '', connectionId: undefined });
  stepEditForm.value = { ...stepEditForm.value, elseSteps };
}

function stepEditRemoveElseStep(stepIdx: number) {
  const elseSteps = (stepEditForm.value.elseSteps ?? []).filter((_, j) => j !== stepIdx);
  stepEditForm.value = { ...stepEditForm.value, elseSteps };
}

function stepEditSetElseStepAction(stepIdx: number, actionId: string) {
  const elseSteps = [...(stepEditForm.value.elseSteps ?? [])];
  if (!elseSteps[stepIdx]) return;
  elseSteps[stepIdx] = { ...elseSteps[stepIdx], actionId };
  stepEditForm.value = { ...stepEditForm.value, elseSteps };
}

const apps = ref<{ id: string; name: string; versions: { id: string; actions: { id: string; key: string; name: string }[] }[] }[]>([]);
const allActionsFlat = computed(() => {
  const out: { id: string; appId: string; label: string }[] = [];
  for (const app of apps.value) {
    const v = app.versions?.[0];
    if (!v) continue;
    for (const a of v.actions || []) {
      out.push({ id: a.id, appId: app.id, label: `${app.name} / ${a.name} (${a.key})` });
    }
  }
  return out;
});
const newStepActionId = ref<string | null>(null);
const newStepConnectionId = ref<string | null>(null);
const connectionsForSelectedAction = computed(() => {
  if (!newStepActionId.value) return [];
  const appId = allActionsFlat.value.find(a => a.id === newStepActionId.value)?.appId;
  if (!appId) return [];
  return connections.value.filter(c => c.appId === appId);
});
const connections = ref<ConnectionItem[]>([]);

const latestVersion = computed(() => workflow.value?.versions?.[0] ?? null);
const hasDraft = computed(() => latestVersion.value && !latestVersion.value.publishedAt && steps.value.length > 0);
const webhookFullUrl = computed(() => {
  if (triggerForm.value.type !== 'WEBHOOK' || !triggerForm.value.webhookPath) return '';
  return `${config.public.apiBaseUrl}/api/webhooks/${triggerForm.value.webhookPath}`;
});

function stepActionName(actionId: string) {
  const a = allActionsFlat.value.find(x => x.id === actionId);
  return a?.label ?? actionId;
}

function stepLabel(step: StepDef): string {
  if (isAppStep(step)) return stepActionName(step.actionId);
  switch (step.type) {
    case 'MAP': return step.sourceStepKey ? `Map (from ${step.sourceStepKey})` : 'Map';
    case 'FILTER': return step.sourceStepKey ? `Filter (from ${step.sourceStepKey})` : 'Filter';
    case 'LOOP': return step.sourceStepKey ? `Loop (from ${step.sourceStepKey}, ${step.bodySteps?.length ?? 0} body steps)` : `Loop (${step.bodySteps?.length ?? 0} body steps)`;
    case 'IF': return step.sourceStepKey ? `If (from ${step.sourceStepKey})` : 'If';
    default: return (step as { stepKey: string }).stepKey;
  }
}

/** Display name: user-edited name or fallback label */
function stepDisplayName(step: StepDef): string {
  const n = (step as { name?: string }).name;
  return (n != null && n.trim() !== '') ? n.trim() : stepLabel(step);
}

function stepDisplayNameByKey(stepKey: string): string {
  const step = steps.value.find(s => s.stepKey === stepKey);
  return step ? stepDisplayName(step) : stepKey;
}

function connectionName(connectionId: string): string {
  const c = connections.value.find(x => x.id === connectionId);
  return c?.name ?? connectionId;
}

/** One-line preview of code (expression/code block) */
function codePreview(code: string, maxLen = 40): string {
  const one = code.replace(/\s+/g, ' ').trim();
  return one.length <= maxLen ? one : one.slice(0, maxLen) + '…';
}

function nodeType(step: StepDef): string {
  if (isAppStep(step)) return 'Action';
  return step.type;
}

function nodeColor(step: StepDef): string {
  if (isAppStep(step)) return '#5d9e5d'; // soft green for actions
  switch (step.type) {
    case 'MAP': return '#6b92b5'; // soft blue
    case 'FILTER': return '#9570a0'; // soft purple
    case 'LOOP': return '#c9a855'; // soft amber
    case 'IF': return '#b86d6a'; // soft red
    default: return '#6d88a5'; // soft grey-blue
  }
}

function nodeStyle(step: StepDef, index: number): Record<string, string> {
  const { x, y } = stepPosition(step, index);
  return {
    borderColor: nodeColor(step),
    left: `${x}px`,
    top: `${y}px`,
  };
}

const newStepType = ref<'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF'>('action');
const newNativeSourceStepKey = ref('');
const newNativeCode = ref('');
const newLoopSourceStepKey = ref('');
const newLoopBodySteps = ref<{ stepKey: string; actionId: string }[]>([]);
const newIfSourceStepKey = ref('');
const newIfBranches = ref<{ condition: string; steps: { stepKey: string; actionId: string }[] }[]>([]);
const newIfElseSteps = ref<{ stepKey: string; actionId: string }[]>([]);

const blueprintCanvas = ref<any | null>(null);
const blueprintLane = ref<HTMLElement | null>(null);
const draggingStepKey = ref<string | null>(null);
const draggingTriggerId = ref<string | null>(null);
const dragOffset = ref({ x: 0, y: 0 });
const editingStepKey = ref<string | null>(null);
const editingTriggerId = ref<string | null>(null);
const editingNameValue = ref('');
const pendingPosition = ref<{ x: number; y: number } | null>(null);
const pendingTriggerPosition = ref<{ x: number; y: number } | null>(null);

/** Connection drag: from step or trigger output to a step input */
const connectionDrag = ref<{
  from: { kind: 'step' | 'trigger'; key: string; x: number; y: number; port?: 'then' | 'else' };
  x2: number;
  y2: number;
} | null>(null);
/** While dragging a connection, the stepKey of the input port under the cursor (for drop-target glow) */
const connectionDropTargetKey = ref<string | null>(null);

function getCanvasElement(): HTMLElement | null {
  const raw = blueprintCanvas.value as any;
  if (!raw) return null;
  return (raw.$el ?? raw) as HTMLElement;
}

const NODE_WIDTH = 240;
const NODE_HEADER_H = 32;
const NODE_BODY_H = 72;
const NODE_HEIGHT = NODE_HEADER_H + NODE_BODY_H;
/** Port vertical center: empirically aligned so connector lines hit the dot centers (header 32px + body offset to port center) */
const PORT_CENTER_Y = NODE_HEADER_H + 55;
/** IF block: then port center Y from node top (margin-top 12px + half port 5px) */
const IF_PORT_THEN_Y = NODE_HEADER_H + 12 + 5;
/** IF block: else port center Y from node top (body height - margin-bottom 12 - half port 5) */
const IF_PORT_ELSE_Y = NODE_HEADER_H + NODE_BODY_H - 12 - 5;
/** Input port: body padding-left 12px + node border 2px = 14px to content; port margin-left -8, total port width 14px → center at 14 - 8 + 7 = 13 from node left */
const PORT_INPUT_X_OFFSET = 1;
/** Output port: from node right edge, port center is at -(12 + 2 - 8 + 7) = -13 (body pad + border - margin + half port) */
//const PORT_OUTPUT_X_OFFSET = -13;
const PORT_OUTPUT_X_OFFSET = 5;
const CANVAS_PADDING = 400;
const MIN_CANVAS_WIDTH = 2000;
const MIN_CANVAS_HEIGHT = 1500;

const canvasZoom = ref(1);
const canvasPan = ref({ x: 0, y: 0 });
const blueprintCanvasInner = ref<HTMLElement | null>(null);
const CANVAS_PADDING_VIEW = 24;

const isPanning = ref(false);
const panStart = ref({ clientX: 0, clientY: 0, panX: 0, panY: 0 });

function setZoom(z: number) {
  canvasZoom.value = Math.max(0.25, Math.min(2, Math.round(z * 100) / 100));
}

function onCanvasWheel(event: WheelEvent) {
  event.preventDefault();
  const container = getCanvasElement();
  if (!container) return;
  const r = container.getBoundingClientRect();
  const originLeft = r.left + CANVAS_PADDING_VIEW;
  const originTop = r.top + CANVAS_PADDING_VIEW;
  const laneX = (event.clientX - originLeft - canvasPan.value.x) / canvasZoom.value;
  const laneY = (event.clientY - originTop - canvasPan.value.y) / canvasZoom.value;
  const delta = event.deltaY > 0 ? -0.08 : 0.08;
  const newZoom = Math.max(0.25, Math.min(2, canvasZoom.value + delta));
  canvasZoom.value = newZoom;
  canvasPan.value = {
    x: event.clientX - originLeft - laneX * newZoom,
    y: event.clientY - originTop - laneY * newZoom,
  };
}

function onCanvasMouseDown(event: MouseEvent) {
  if ((event.target as Element).closest('.blueprint-node')) return;
  if ((event.target as Element).closest('.blueprint-zoom-controls')) return;
  event.preventDefault();
  isPanning.value = true;
  panStart.value = {
    clientX: event.clientX,
    clientY: event.clientY,
    panX: canvasPan.value.x,
    panY: canvasPan.value.y,
  };
  window.addEventListener('mousemove', onCanvasPanMove);
  window.addEventListener('mouseup', onCanvasPanUp);
}

function onCanvasPanMove(event: MouseEvent) {
  if (!isPanning.value) return;
  canvasPan.value = {
    x: panStart.value.panX + (event.clientX - panStart.value.clientX),
    y: panStart.value.panY + (event.clientY - panStart.value.clientY),
  };
}

function onCanvasPanUp() {
  isPanning.value = false;
  window.removeEventListener('mousemove', onCanvasPanMove);
  window.removeEventListener('mouseup', onCanvasPanUp);
}

const canvasContentSize = computed(() => {
  let minX = 0;
  let minY = 0;
  let maxX = MIN_CANVAS_WIDTH;
  let maxY = MIN_CANVAS_HEIGHT;
  for (const t of triggers.value) {
    const pos = triggerPositions.value[t.id] ?? { x: 20, y: 40 + triggers.value.indexOf(t) * (NODE_HEIGHT + 16) };
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + NODE_WIDTH);
    maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
  }
  steps.value.forEach((step, idx) => {
    const pos = stepPosition(step, idx);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + NODE_WIDTH);
    maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
  });
  return {
    width: Math.max(MIN_CANVAS_WIDTH, maxX + CANVAS_PADDING),
    height: Math.max(MIN_CANVAS_HEIGHT, maxY + CANVAS_PADDING),
  };
});

function hasInputPort(step: StepDef): boolean {
  if (isAppStep(step)) return true;
  return step.type === 'MAP' || step.type === 'FILTER' || step.type === 'LOOP' || step.type === 'IF';
}

function stepPosition(step: StepDef, index: number): { x: number; y: number } {
  const anyStep = step as { x?: number; y?: number };
  const x = typeof anyStep.x === 'number' ? anyStep.x : index * (NODE_WIDTH + 24);
  const y = typeof anyStep.y === 'number' ? anyStep.y : 40;
  return { x, y };
}

interface ConnectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Actual y of the destination input dot (for dynamic arrow refY) */
  inputPortY: number;
  kind: 'step' | 'trigger';
  fromKey: string;
  toKey: string;
  /** For step segments from an IF block: which output port (then vs else) */
  fromPort?: 'then' | 'else';
}

/** Input port center Y offset from node top; use same as LOOP for all blocks so alignment is consistent */
function getInputPortCenterY(_step: StepDef): number {
  return PORT_CENTER_Y;
}

/** Try to read the actual output port center from the DOM so lines originate from the dot (esp. IF blocks). Uses the same coordinate system as the connector SVG (inner canvas). */
function getOutputPortCenter(step: StepDef, port?: 'then' | 'else'): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null;
  const lane = getLaneElement();
  if (!lane) return null;
  let selector: string;
  if (isIfStep(step)) {
    selector = port === 'else'
      ? `.blueprint-node[data-step-key="${step.stepKey}"] .port-out-else`
      : `.blueprint-node[data-step-key="${step.stepKey}"] .port-out-then`;
  } else {
    selector = `.blueprint-node[data-step-key="${step.stepKey}"] .port-out`;
  }
  const el = lane.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const laneRect = lane.getBoundingClientRect();
  const zoom = canvasZoom.value;
  const x = (rect.left + rect.width / 2 - laneRect.left) / zoom;
  const y = (rect.top + rect.height / 2 - laneRect.top) / zoom;
  return { x, y };
}

function connectorLine(step: StepDef): ConnectorSegment {
  if (!('sourceStepKey' in step) || !step.sourceStepKey) {
    return { x1: 0, y1: 0, x2: 0, y2: 0, inputPortY: 0, kind: 'step', fromKey: '', toKey: '' };
  }
  const src = steps.value.find(s => s.stepKey === step.sourceStepKey);
  if (src && isIfStep(src)) {
    return { x1: 0, y1: 0, x2: 0, y2: 0, inputPortY: 0, kind: 'step', fromKey: '', toKey: '' };
  }
  const srcIdx = src ? steps.value.indexOf(src) : -1;
  const dstIdx = steps.value.indexOf(step);
  const srcPos = src ? stepPosition(src, srcIdx) : { x: 0, y: 0 };
  const dstPos = stepPosition(step, dstIdx);
  const inputPortY = dstPos.y + getInputPortCenterY(step);
  return {
    x1: srcPos.x + NODE_WIDTH + PORT_OUTPUT_X_OFFSET,
    y1: srcPos.y + PORT_CENTER_Y,
    x2: dstPos.x + PORT_INPUT_X_OFFSET,
    y2: dstPos.y + PORT_CENTER_Y,
    inputPortY,
    kind: 'step',
    fromKey: step.sourceStepKey,
    toKey: (step as any).stepKey,
  };
}

/** Segment from an IF step's then or else port to a single target step. */
function connectorLineFromIf(ifStep: IfStepDef, port: 'then' | 'else', toStepKey: string): ConnectorSegment {
  const dst = steps.value.find(s => s.stepKey === toStepKey);
  if (!dst) return { x1: 0, y1: 0, x2: 0, y2: 0, inputPortY: 0, kind: 'step', fromKey: '', toKey: '' };
  const dstIdx = steps.value.indexOf(dst);
  const dstPos = stepPosition(dst, dstIdx);
  const inputPortY = dstPos.y + getInputPortCenterY(dst);
  const ifIdx = steps.value.indexOf(ifStep);
  const ifPos = stepPosition(ifStep, ifIdx);
  return {
    x1: ifPos.x + NODE_WIDTH + PORT_OUTPUT_X_OFFSET,
    y1: ifPos.y + PORT_CENTER_Y,
    x2: dstPos.x + PORT_INPUT_X_OFFSET,
    y2: dstPos.y + PORT_CENTER_Y,
    inputPortY,
    kind: 'step',
    fromKey: ifStep.stepKey,
    toKey: toStepKey,
    fromPort: port,
  };
}

function triggerConnectorLine(edge: TriggerEdge): ConnectorSegment {
  const trig = triggers.value.find(t => t.id === edge.triggerId);
  if (!trig) return { x1: 0, y1: 0, x2: 0, y2: 0, inputPortY: 0, kind: 'trigger', fromKey: '', toKey: '' };
  const pos = triggerPositions.value[edge.triggerId] ?? {
    x: 20,
    y: 40 + triggers.value.indexOf(trig) * (NODE_HEIGHT + 16),
  };
  const dst = steps.value.find(s => s.stepKey === edge.stepKey);
  if (!dst) return { x1: 0, y1: 0, x2: 0, y2: 0, inputPortY: 0, kind: 'trigger', fromKey: '', toKey: '' };
  const dstIdx = steps.value.indexOf(dst);
  const dstPos = stepPosition(dst, dstIdx);
  const inputPortY = dstPos.y + getInputPortCenterY(dst);
  return {
    x1: pos.x + NODE_WIDTH + PORT_OUTPUT_X_OFFSET,
    y1: pos.y + PORT_CENTER_Y,
    x2: dstPos.x + PORT_INPUT_X_OFFSET,
    y2: dstPos.y + PORT_CENTER_Y,
    inputPortY,
    kind: 'trigger',
    fromKey: edge.triggerId,
    toKey: edge.stepKey,
  };
}

const connectorSegments = computed<ConnectorSegment[]>(() => {
  const segs: ConnectorSegment[] = [];
  for (const step of steps.value) {
    if (!('sourceStepKey' in step) || !step.sourceStepKey) continue;
    const src = steps.value.find(s => s.stepKey === step.sourceStepKey);
    if (src && isIfStep(src)) continue;
    segs.push(connectorLine(step));
  }
  for (const step of steps.value) {
    if (!isIfStep(step)) continue;
    const ifStep = step as IfStepDef;
    if (ifStep.thenStepKey) segs.push(connectorLineFromIf(ifStep, 'then', ifStep.thenStepKey));
    if (ifStep.elseStepKey) segs.push(connectorLineFromIf(ifStep, 'else', ifStep.elseStepKey));
  }
  for (const edge of triggerEdges.value) {
    segs.push(triggerConnectorLine(edge));
  }
  return segs;
});

/** Path stops at node edge; arrow (13px) spans from edge to input dot so the line does not go into the box */
const ARROW_MARKER_LENGTH = 13;

function connectorPath(seg: ConnectorSegment): string {
  let x1 = seg.x1;
  let y1 = seg.y1;
  if (seg.kind === 'step') {
    const src = steps.value.find(s => s.stepKey === seg.fromKey);
    if (src && isIfStep(src)) {
      const out = getOutputPortCenter(src, seg.fromPort);
      if (out) {
        x1 = out.x;
        y1 = out.y;
      } else {
        const srcIdx = steps.value.indexOf(src);
        const pos = stepPosition(src, srcIdx);
        x1 = pos.x + NODE_WIDTH + PORT_OUTPUT_X_OFFSET;
        y1 = pos.y + (seg.fromPort === 'else' ? IF_PORT_ELSE_Y : IF_PORT_THEN_Y);
      }
    }
  }
  const dx = Math.max(40, Math.abs(seg.x2 - x1) / 2);
  const cx1 = x1 + dx;
  const endX = seg.x2 - ARROW_MARKER_LENGTH;
  const endY = seg.inputPortY ?? seg.y2;
  const cx2 = endX - dx;
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${endY}, ${endX} ${endY}`;
}

function removeConnectionFromContext() {
  const conn = contextMenu.value.connection;
  contextMenu.value.open = false;
  if (!conn) return;
  if (conn.kind === 'step') {
    const fromKey = conn.fromKey;
    const toKey = conn.toKey;
    const srcStep = steps.value.find(s => s.stepKey === fromKey);
    if (srcStep && isIfStep(srcStep)) {
      const ifStep = srcStep as IfStepDef;
      steps.value = steps.value.map((s) => {
        if (s.stepKey === fromKey) {
          const def = s as IfStepDef;
          return {
            ...s,
            thenStepKey: def.thenStepKey === toKey ? undefined : def.thenStepKey,
            elseStepKey: def.elseStepKey === toKey ? undefined : def.elseStepKey,
          } as StepDef;
        }
        if (s.stepKey === toKey && ('sourceStepKey' in s) && (s as any).sourceStepKey === fromKey) {
          return { ...s, sourceStepKey: undefined } as StepDef;
        }
        return s;
      });
    } else {
      steps.value = steps.value.map((s) => {
        if (!('sourceStepKey' in s)) return s;
        const any = s as any;
        const current = any.sourceStepKey as string | undefined;
        if (!current) return s;
        if (s.stepKey === toKey && current === fromKey) return { ...s, sourceStepKey: undefined } as StepDef;
        return s;
      });
    }
  } else {
    triggerEdges.value = triggerEdges.value.filter(
      (e) => !(e.triggerId === conn.fromKey && e.stepKey === conn.toKey),
    );
  }
  dirty.value = true;
}

function getLaneElement(): HTMLElement | null {
  return blueprintCanvasInner.value;
}

function laneOffset(): { left: number; top: number; zoom: number } {
  const el = getCanvasElement();
  const zoom = canvasZoom.value;
  const pan = canvasPan.value;
  if (!el) return { left: 0, top: 0, zoom };
  const r = el.getBoundingClientRect();
  return {
    left: r.left + CANVAS_PADDING_VIEW + pan.x,
    top: r.top + CANVAS_PADDING_VIEW + pan.y,
    zoom,
  };
}

function onPortMouseDown(step: StepDef, event: MouseEvent) {
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  const dataPort = target.getAttribute('data-port');
  let port: 'then' | 'else' | undefined;
  if (isIfStep(step) && dataPort === 'out-then') port = 'then';
  else if (isIfStep(step) && dataPort === 'out-else') port = 'else';
  const rect = target.getBoundingClientRect();
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  const x = (rect.left + rect.width / 2 - laneLeft) / zoom;
  const y = (rect.top + rect.height / 2 - laneTop) / zoom;
  connectionDrag.value = { from: { kind: 'step', key: step.stepKey, x, y, port }, x2: x, y2: y };
  window.addEventListener('mousemove', onConnectionMouseMove);
  window.addEventListener('mouseup', onConnectionMouseUp);
}

function onConnectionMouseMove(event: MouseEvent) {
  if (!connectionDrag.value) return;
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  connectionDrag.value.x2 = (event.clientX - laneLeft) / zoom;
  connectionDrag.value.y2 = (event.clientY - laneTop) / zoom;
  const el = document.elementFromPoint(event.clientX, event.clientY);
  const inPort = el?.closest?.('[data-port="in"]');
  const stepKey = inPort?.getAttribute('data-step-key') ?? null;
  connectionDropTargetKey.value = stepKey;
}

function onConnectionMouseUp(event: MouseEvent) {
  if (!connectionDrag.value) return;
  const el = document.elementFromPoint(event.clientX, event.clientY);
  const from = connectionDrag.value.from;
  const fromKey = from.key;
  let stepKey = el?.closest?.('[data-port="in"]')?.getAttribute('data-step-key');
  if (!stepKey) stepKey = el?.closest?.('[data-step-key]')?.getAttribute('data-step-key');
  if (stepKey && stepKey !== fromKey) {
    const step = steps.value.find(s => s.stepKey === stepKey);
    if (step && hasInputPort(step)) {
      if (from.kind === 'step') {
        const newSourceKey = from.key;
        const srcStep = steps.value.find(x => x.stepKey === newSourceKey);
        if (srcStep && isIfStep(srcStep) && (from.port === 'then' || from.port === 'else')) {
          const ifStep = srcStep as IfStepDef;
          const oldThen = ifStep.thenStepKey;
          const oldElse = ifStep.elseStepKey;
          steps.value = steps.value.map((s) => {
            if (s.stepKey === newSourceKey) {
              return {
                ...s,
                thenStepKey: from.port === 'then' ? stepKey : (s as IfStepDef).thenStepKey,
                elseStepKey: from.port === 'else' ? stepKey : (s as IfStepDef).elseStepKey,
              } as StepDef;
            }
            if (from.port === 'then' && s.stepKey === oldThen) return { ...s, sourceStepKey: undefined } as StepDef;
            if (from.port === 'else' && s.stepKey === oldElse) return { ...s, sourceStepKey: undefined } as StepDef;
            if (s.stepKey === stepKey) return { ...s, sourceStepKey: newSourceKey } as StepDef;
            return s;
          });
        } else {
          steps.value = steps.value.map((s) => {
            if (!('sourceStepKey' in s)) return s;
            const any = s as any;
            const current = any.sourceStepKey as string | undefined;
            if (current === newSourceKey && s.stepKey !== stepKey) return { ...s, sourceStepKey: undefined } as StepDef;
            if (s.stepKey === stepKey) return { ...s, sourceStepKey: newSourceKey } as StepDef;
            return s;
          });
        }
      } else if (from.kind === 'trigger') {
        const trigId = from.key;
        triggerEdges.value = [
          ...triggerEdges.value.filter(e => !(e.triggerId === trigId && e.stepKey === stepKey)),
          { triggerId: trigId, stepKey },
        ];
      }
      dirty.value = true;
    }
  } else {
    // Dropped on empty space or same node: treat as "delete connection" from this output
    if (from.kind === 'step') {
      const outKey = from.key;
      const srcStep = steps.value.find(s => s.stepKey === outKey);
      if (srcStep && isIfStep(srcStep) && (from.port === 'then' || from.port === 'else')) {
        const ifStep = srcStep as IfStepDef;
        const keyToClear = from.port === 'then' ? ifStep.thenStepKey : ifStep.elseStepKey;
        steps.value = steps.value.map((s) => {
          if (s.stepKey === outKey) {
            return {
              ...s,
              thenStepKey: from.port === 'then' ? undefined : (s as IfStepDef).thenStepKey,
              elseStepKey: from.port === 'else' ? undefined : (s as IfStepDef).elseStepKey,
            } as StepDef;
          }
          if (keyToClear && s.stepKey === keyToClear) return { ...s, sourceStepKey: undefined } as StepDef;
          return s;
        });
      } else {
        steps.value = steps.value.map((s) => {
          if (!('sourceStepKey' in s)) return s;
          const any = s as any;
          const current = any.sourceStepKey as string | undefined;
          if (current === outKey) return { ...s, sourceStepKey: undefined } as StepDef;
          return s;
        });
      }
    } else if (from.kind === 'trigger') {
      const trigId = from.key;
      triggerEdges.value = triggerEdges.value.filter(e => e.triggerId !== trigId);
    }
    dirty.value = true;
  }
  connectionDrag.value = null;
  connectionDropTargetKey.value = null;
  window.removeEventListener('mousemove', onConnectionMouseMove);
  window.removeEventListener('mouseup', onConnectionMouseUp);
}

function onNodeMouseDown(step: StepDef, event: MouseEvent) {
  if (!getLaneElement()) return;
  if ((event.target as HTMLElement).closest?.('button')) return;
  event.preventDefault();
  const key = step.stepKey;
  const idx = steps.value.findIndex(s => s.stepKey === key);
  const nodePos = stepPosition(step, idx >= 0 ? idx : 0);
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  draggingStepKey.value = key;
  dragOffset.value = {
    x: (event.clientX - laneLeft) / zoom - nodePos.x,
    y: (event.clientY - laneTop) / zoom - nodePos.y,
  };
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
}

function onWindowMouseMove(event: MouseEvent) {
  if (!draggingStepKey.value) return;
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  const x = Math.round((event.clientX - laneLeft) / zoom - dragOffset.value.x);
  const y = Math.round((event.clientY - laneTop) / zoom - dragOffset.value.y);
  const key = draggingStepKey.value;
  steps.value = steps.value.map((s) => {
    if (s.stepKey !== key) return s;
    return { ...s, x, y } as StepDef;
  });
  dirty.value = true;
}

function onWindowMouseUp() {
  draggingStepKey.value = null;
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
}

function triggerNodeStyle(t: Trigger): Record<string, string> {
  const pos = triggerPositions.value[t.id] ?? { x: 20, y: 40 + triggers.value.indexOf(t) * (NODE_HEIGHT + 16) };
  return {
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    borderColor: '#876b98',
  };
}

function onTriggerNodeMouseDown(t: Trigger, event: MouseEvent) {
  if (!getLaneElement()) return;
  event.preventDefault();
  const pos = triggerPositions.value[t.id] ?? { x: 20, y: 40 + triggers.value.indexOf(t) * (NODE_HEIGHT + 16) };
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  draggingTriggerId.value = t.id;
  dragOffset.value = {
    x: (event.clientX - laneLeft) / zoom - pos.x,
    y: (event.clientY - laneTop) / zoom - pos.y,
  };
  window.addEventListener('mousemove', onTriggerMouseMove);
  window.addEventListener('mouseup', onTriggerMouseUp);
}

function onTriggerMouseMove(event: MouseEvent) {
  if (!draggingTriggerId.value) return;
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  const x = Math.round((event.clientX - laneLeft) / zoom - dragOffset.value.x);
  const y = Math.round((event.clientY - laneTop) / zoom - dragOffset.value.y);
  triggerPositions.value = { ...triggerPositions.value, [draggingTriggerId.value]: { x, y } };
  dirty.value = true;
}

function onTriggerMouseUp() {
  draggingTriggerId.value = null;
  window.removeEventListener('mousemove', onTriggerMouseMove);
  window.removeEventListener('mouseup', onTriggerMouseUp);
}

function onTriggerPortMouseDown(t: Trigger, event: MouseEvent) {
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  const x = (rect.left + rect.width / 2 - laneLeft) / zoom;
  const y = (rect.top + rect.height / 2 - laneTop) / zoom;
  connectionDrag.value = { from: { kind: 'trigger', key: t.id, x, y }, x2: x, y2: y };
  window.addEventListener('mousemove', onConnectionMouseMove);
  window.addEventListener('mouseup', onConnectionMouseUp);
}

function selectStep(stepKey: string) {
  selectedStepKey.value = stepKey;
  selectedTriggerId.value = null;
}

function selectTrigger(id: string) {
  selectedTriggerId.value = id;
  selectedStepKey.value = null;
}

function startEditingStepName(step: StepDef) {
  editingStepKey.value = step.stepKey;
  editingTriggerId.value = null;
  editingNameValue.value = stepDisplayName(step);
  nextTick(() => (document.querySelector<HTMLInputElement>('.blueprint-node-title-input')?.focus()));
}

function startEditingTriggerName(t: Trigger) {
  editingTriggerId.value = t.id;
  editingStepKey.value = null;
  editingNameValue.value = t.name;
  nextTick(() => (document.querySelector<HTMLInputElement>('.blueprint-node-title-input')?.focus()));
}

function saveEditingStepName() {
  const key = editingStepKey.value;
  if (!key) return;
  const step = steps.value.find(s => s.stepKey === key);
  if (step) {
    const val = editingNameValue.value.trim();
    (step as { name?: string }).name = val || undefined;
    steps.value = [...steps.value];
    dirty.value = true;
  }
  editingStepKey.value = null;
  editingNameValue.value = '';
}

async function saveEditingTriggerName() {
  const id = editingTriggerId.value;
  if (!id) return;
  const val = editingNameValue.value.trim();
  if (!val) {
    editingTriggerId.value = null;
    editingNameValue.value = '';
    return;
  }
  try {
    await api.patch(`/triggers/${id}`, { name: val });
    const t = triggers.value.find(x => x.id === id);
    if (t) (t as { name: string }).name = val;
    editingTriggerId.value = null;
    editingNameValue.value = '';
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  }
}

function onNodeContextMenu(step: StepDef, idx: number, event: MouseEvent) {
  selectedStepKey.value = step.stepKey;
  contextMenu.value = { open: true, clientX: event.clientX, clientY: event.clientY, nodeIdx: idx, connection: null };
}

const contextMenu = ref<{
  open: boolean;
  clientX: number;
  clientY: number;
  nodeIdx?: number;
  connection?: { kind: 'step' | 'trigger'; fromKey: string; toKey: string } | null;
}>({
  open: false,
  clientX: 0,
  clientY: 0,
  connection: null,
});

function distanceToSegment(px: number, py: number, seg: ConnectorSegment): number {
  const { x1, y1, x2, y2 } = seg;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const ddx = px - x1;
    const ddy = py - y1;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const cx = x1 + clamped * dx;
  const cy = y1 + clamped * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

function onContextMenuAction(action: 'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF' | 'trigger') {
  const clientX = contextMenu.value.clientX;
  const clientY = contextMenu.value.clientY;
  contextMenu.value.open = false;
  nextTick(() => {
    if (action === 'trigger') {
      addTriggerFromContextAt(clientX, clientY);
    } else {
      addStepFromContextAt(action, clientX, clientY);
    }
  });
}

function onCanvasContextMenu(event: MouseEvent) {
  selectedStepKey.value = null;
  selectedTriggerId.value = null;
  // Hit-test connections near the cursor so we can offer "Remove connection"
  let connection: { kind: 'step' | 'trigger'; fromKey: string; toKey: string } | null = null;
  const el = getCanvasElement();
  if (el) {
    const { left, top, zoom } = laneOffset();
    const x = (event.clientX - left) / zoom;
    const y = (event.clientY - top) / zoom;
    let bestDist = Infinity;
    const threshold = 10 / zoom; // ~10px in screen space
    for (const seg of connectorSegments.value) {
      const d = distanceToSegment(x, y, seg);
      if (d < threshold && d < bestDist) {
        bestDist = d;
        connection = { kind: seg.kind, fromKey: seg.fromKey, toKey: seg.toKey };
      }
    }
  }
  contextMenu.value = {
    open: true,
    clientX: event.clientX,
    clientY: event.clientY,
    nodeIdx: undefined,
    connection,
  };
}

function addStepFromContextAt(type: 'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF', clientX: number, clientY: number) {
  if (!getLaneElement()) return;
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  const canvasX = Math.round((clientX - laneLeft) / zoom);
  const canvasY = Math.round((clientY - laneTop) / zoom);
  pendingPosition.value = { x: canvasX, y: canvasY };
  newStepType.value = type;
  if (type === 'action') {
    newStepActionId.value = allActionsFlat.value[0]?.id ?? null;
    newStepConnectionId.value = null;
  } else if (type === 'MAP' || type === 'FILTER') {
    newNativeSourceStepKey.value = '';
    newNativeCode.value = type === 'MAP' ? 'return input;' : 'return true;';
  } else if (type === 'LOOP') {
    newLoopSourceStepKey.value = '';
    newLoopBodySteps.value = allActionsFlat.value[0] ? [{ stepKey: `loop_body_0`, actionId: allActionsFlat.value[0].id }] : [];
  } else if (type === 'IF') {
    newIfSourceStepKey.value = '';
    newIfBranches.value = [{ condition: 'true', steps: allActionsFlat.value[0] ? [{ stepKey: 'if_0', actionId: allActionsFlat.value[0].id }] : [] }];
    newIfElseSteps.value = [];
  }
  addStep();
}

function addStepFromContext(type: 'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF') {
  addStepFromContextAt(type, contextMenu.value.clientX, contextMenu.value.clientY);
}

function getViewportCenterInLaneCoords(): { x: number; y: number } {
  const el = getCanvasElement();
  const zoom = canvasZoom.value;
  const pan = canvasPan.value;
  if (!el) return { x: 200, y: 120 };
  const r = el.getBoundingClientRect();
  const padding = CANVAS_PADDING_VIEW;
  return {
    x: Math.round((r.width / 2 - padding - pan.x) / zoom),
    y: Math.round((r.height / 2 - padding - pan.y) / zoom),
  };
}

function addTriggerAtViewportCenter() {
  const { x, y } = getViewportCenterInLaneCoords();
  pendingTriggerPosition.value = { x, y };
  openTriggerDialog();
}

function addStepAtViewportCenter(type: 'action' | 'MAP' | 'FILTER' | 'LOOP' | 'IF') {
  const { x, y } = getViewportCenterInLaneCoords();
  pendingPosition.value = { x, y };
  newStepType.value = type;
  if (type === 'action') {
    newStepActionId.value = allActionsFlat.value[0]?.id ?? null;
    newStepConnectionId.value = null;
  } else if (type === 'MAP' || type === 'FILTER') {
    newNativeSourceStepKey.value = '';
    newNativeCode.value = type === 'MAP' ? 'return input;' : 'return true;';
  } else if (type === 'LOOP') {
    newLoopSourceStepKey.value = '';
    newLoopBodySteps.value = allActionsFlat.value[0] ? [{ stepKey: `loop_body_0`, actionId: allActionsFlat.value[0].id }] : [];
  } else if (type === 'IF') {
    newIfSourceStepKey.value = '';
    newIfBranches.value = [{ condition: 'true', steps: allActionsFlat.value[0] ? [{ stepKey: 'if_0', actionId: allActionsFlat.value[0].id }] : [] }];
    newIfElseSteps.value = [];
  }
  addStep();
}

function addTriggerFromContextAt(clientX: number, clientY: number) {
  if (!getLaneElement()) return;
  const { left: laneLeft, top: laneTop, zoom } = laneOffset();
  pendingTriggerPosition.value = {
    x: Math.round((clientX - laneLeft) / zoom),
    y: Math.round((clientY - laneTop) / zoom),
  };
  openTriggerDialog();
}

const canAddNewStep = computed(() => {
  if (newStepType.value === 'action') return !!newStepActionId.value;
  if (newStepType.value === 'MAP' || newStepType.value === 'FILTER') return !!newNativeCode.value.trim();
  if (newStepType.value === 'LOOP') return newLoopBodySteps.value.length > 0;
  if (newStepType.value === 'IF') return newIfBranches.value.some(b => b.condition.trim());
  return false;
});

async function loadWorkflow() {
  try {
    workflow.value = await api.get<Workflow>(`/workflows/${workflowId.value}`);
    const graph = latestVersion.value?.graph as { steps?: StepDef[] } | undefined;
    let rawSteps = graph?.steps ?? [];
    rawSteps = migrateIfStepConnections(rawSteps);
    steps.value = rawSteps;
    dirty.value = false;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  }
}

/** Migrate legacy IF steps: set thenStepKey/elseStepKey from first two steps with sourceStepKey = this IF */
function migrateIfStepConnections(stepsList: StepDef[]): StepDef[] {
  return stepsList.map((s) => {
    if (!isIfStep(s)) return s;
    const ifStep = s as IfStepDef;
    if (ifStep.thenStepKey != null && ifStep.elseStepKey != null) return s;
    const targets = stepsList.filter(
      (t): t is StepDef & { sourceStepKey: string } =>
        'sourceStepKey' in t && t.sourceStepKey === ifStep.stepKey
    );
    const thenKey = ifStep.thenStepKey ?? targets[0]?.stepKey;
    const elseKey = ifStep.elseStepKey ?? targets[1]?.stepKey;
    return { ...ifStep, thenStepKey: thenKey, elseStepKey: elseKey } as IfStepDef;
  });
}

async function loadTriggers() {
  try {
    const res = await api.get<{ items: Trigger[] }>(`/workflows/${workflowId.value}/triggers`);
    triggers.value = res.items;
  } catch {
    triggers.value = [];
  }
}

async function loadAppsAndConnections() {
  try {
    const [appRes, connRes] = await Promise.all([
      api.get<{ items: typeof apps.value }>('/apps', { limit: 100 }),
      api.get<{ items: ConnectionItem[] }>('/connections', { limit: 100 }),
    ]);
    const appIds = appRes.items.map(a => a.id);
    const appsWithVersions = await Promise.all(
      appIds.map(id => api.get<typeof apps.value[0]>(`/apps/${id}`))
    );
    apps.value = appsWithVersions;
    connections.value = connRes.items;
  } catch {
    apps.value = [];
    connections.value = [];
  }
}

function addStep() {
  const stepKey = `step_${Date.now()}`;
  const pos = pendingPosition.value ?? { x: steps.value.length * 260, y: 40 };
  if (newStepType.value === 'action') {
    if (!newStepActionId.value) {
      error.value = 'Add at least one app and action in Apps first, then add an Action step.';
      return;
    }
    steps.value.push({
      stepKey,
      actionId: newStepActionId.value,
      connectionId: newStepConnectionId.value ?? undefined,
      x: pos.x,
      y: pos.y,
    });
    newStepActionId.value = null;
    newStepConnectionId.value = null;
  } else if (newStepType.value === 'MAP') {
    steps.value.push({
      stepKey,
      type: 'MAP',
      sourceStepKey: newNativeSourceStepKey.value.trim() || undefined,
      code: newNativeCode.value.trim(),
      x: pos.x,
      y: pos.y,
    });
    newNativeSourceStepKey.value = '';
    newNativeCode.value = '';
  } else if (newStepType.value === 'FILTER') {
    steps.value.push({
      stepKey,
      type: 'FILTER',
      sourceStepKey: newNativeSourceStepKey.value.trim() || undefined,
      code: newNativeCode.value.trim(),
      x: pos.x,
      y: pos.y,
    });
    newNativeSourceStepKey.value = '';
    newNativeCode.value = '';
  } else if (newStepType.value === 'LOOP') {
    const body = newLoopBodySteps.value.map((b, i) => ({
      stepKey: `${stepKey}_body_${i}`,
      actionId: b.actionId,
      connectionId: undefined as string | undefined,
    }));
    steps.value.push({
      stepKey,
      type: 'LOOP',
      sourceStepKey: newLoopSourceStepKey.value.trim() || undefined,
      bodySteps: body,
      x: pos.x,
      y: pos.y,
    });
    newLoopSourceStepKey.value = '';
    newLoopBodySteps.value = [];
  } else if (newStepType.value === 'IF') {
    const branches = newIfBranches.value
      .filter(b => b.condition.trim())
      .map(b => ({
        condition: b.condition.trim(),
        steps: b.steps.filter(s => s.actionId).map((s, i) => ({ stepKey: `${stepKey}_b_${i}`, actionId: s.actionId, connectionId: undefined as string | undefined })),
      }));
    const elseSteps = newIfElseSteps.value.filter(s => s.actionId).map((s, i) => ({ stepKey: `${stepKey}_else_${i}`, actionId: s.actionId, connectionId: undefined as string | undefined }));
    steps.value.push({
      stepKey,
      type: 'IF',
      sourceStepKey: newIfSourceStepKey.value.trim() || undefined,
      branches,
      elseSteps: elseSteps.length ? elseSteps : undefined,
      x: pos.x,
      y: pos.y,
    });
    newIfSourceStepKey.value = '';
    newIfBranches.value = [];
    newIfElseSteps.value = [];
  }
  pendingPosition.value = null;
  dirty.value = true;
}

function confirmRemoveStep(idx: number) {
  deleteStepIdx.value = idx;
  deleteStepDialog.value = true;
}

function doRemoveStep() {
  if (deleteStepIdx.value === null) return;
  const removed = steps.value[deleteStepIdx.value];
  steps.value.splice(deleteStepIdx.value, 1);
  if (removed) {
    triggerEdges.value = triggerEdges.value.filter(e => e.stepKey !== (removed as any).stepKey);
  }
  if (selectedStepKey.value && steps.value.every(s => s.stepKey !== selectedStepKey.value)) selectedStepKey.value = null;
  deleteStepIdx.value = null;
  deleteStepDialog.value = false;
  dirty.value = true;
}

function moveStep(idx: number, delta: number) {
  const next = idx + delta;
  if (next < 0 || next >= steps.value.length) return;
  [steps.value[idx], steps.value[next]] = [steps.value[next], steps.value[idx]];
  dirty.value = true;
}

async function saveVersion() {
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/workflows/${workflowId.value}/versions`, {
      graph: {
        steps: steps.value,
        triggerPositions: triggerPositions.value,
        triggerEdges: triggerEdges.value,
      },
    });
    await loadWorkflow();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function publish() {
  publishing.value = true;
  error.value = '';
  try {
    await api.post(`/workflows/${workflowId.value}/publish`, {});
    await loadWorkflow();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  } finally {
    publishing.value = false;
  }
}

async function runWorkflow() {
  running.value = true;
  error.value = '';
  try {
    const res = await api.post<{ workflowRunId: string; status: string }>(`/workflows/${workflowId.value}/run`, {});
    await navigateTo(`/runs/${res.workflowRunId}`);
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
    else error.value = 'Run failed';
  } finally {
    running.value = false;
  }
}

function openTriggerDialog(trigger?: Trigger) {
  editingTrigger.value = trigger ?? null;
  if (trigger) {
    triggerForm.value = {
      key: trigger.key,
      name: trigger.name,
      type: trigger.type,
      webhookPath: trigger.webhookPath ?? '',
      webhookSecret: '',
      cronExpression: trigger.cronExpression ?? '',
      cronTimezone: 'UTC',
    };
  } else {
    triggerForm.value = {
      key: '',
      name: '',
      type: 'MANUAL',
      webhookPath: '',
      webhookSecret: '',
      cronExpression: '',
      cronTimezone: 'UTC',
    };
  }
  triggerError.value = '';
  triggerDialog.value = true;
}

async function saveTrigger() {
  if (triggerForm.value.type === 'WEBHOOK' && !triggerForm.value.webhookPath) {
    triggerError.value = 'Webhook path required';
    return;
  }
  if (triggerForm.value.type === 'CRON' && !triggerForm.value.cronExpression) {
    triggerError.value = 'Cron expression required';
    return;
  }
  triggerSaving.value = true;
  triggerError.value = '';
  try {
    if (editingTrigger.value) {
      await api.patch(`/triggers/${editingTrigger.value.id}`, {
        name: triggerForm.value.name,
        type: triggerForm.value.type,
        webhookPath: triggerForm.value.webhookPath || undefined,
        webhookSecret: triggerForm.value.webhookSecret || undefined,
        cronExpression: triggerForm.value.cronExpression || undefined,
        cronTimezone: triggerForm.value.cronTimezone || undefined,
      });
    } else {
      const created = await api.post<Trigger>(`/workflows/${workflowId.value}/triggers`, {
        key: triggerForm.value.key || `trigger_${Date.now()}`,
        name: triggerForm.value.name,
        type: triggerForm.value.type,
        webhookPath: triggerForm.value.webhookPath || undefined,
        webhookSecret: triggerForm.value.webhookSecret || undefined,
        cronExpression: triggerForm.value.cronExpression || undefined,
        cronTimezone: triggerForm.value.cronTimezone || undefined,
      });
      if (pendingTriggerPosition.value && created?.id) {
        triggerPositions.value = { ...triggerPositions.value, [created.id]: pendingTriggerPosition.value };
        pendingTriggerPosition.value = null;
        dirty.value = true;
      }
    }
    triggerDialog.value = false;
    await loadTriggers();
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) triggerError.value = e.data.message;
    else triggerError.value = 'Save failed';
  } finally {
    triggerSaving.value = false;
  }
}

function editTrigger(t: Trigger) {
  openTriggerDialog(t);
}

function confirmDeleteTrigger(t: Trigger) {
  if (!confirm(`Delete trigger "${t.name}"? This action cannot be undone.`)) return;
  deleteTrigger(t);
}

async function deleteTrigger(t: Trigger) {
  try {
    await api.del(`/triggers/${t.id}`);
    const { [t.id]: _, ...rest } = triggerPositions.value;
    triggerPositions.value = rest;
    if (selectedTriggerId.value === t.id) selectedTriggerId.value = null;
    await loadTriggers();
    dirty.value = true;
  } catch (e: unknown) {
    if (isApiError(e) && e.data?.message) error.value = e.data.message;
  }
}

watch(workflowId, () => { loadWorkflow(); loadTriggers(); }, { immediate: true });
watch(latestVersion, () => {
  const graph = latestVersion.value?.graph as {
    steps?: StepDef[];
    triggerPositions?: Record<string, { x: number; y: number }>;
    triggerEdges?: TriggerEdge[];
  } | undefined;
  const rawSteps = graph?.steps ?? [];
  steps.value = migrateIfStepConnections(rawSteps);
  triggerPositions.value = graph?.triggerPositions ?? {};
  triggerEdges.value = graph?.triggerEdges ?? [];
  dirty.value = false;
}, { immediate: true });
onMounted(loadAppsAndConnections);
</script>

<style>
/* Use 100% of space below app bar: no main scroll, canvas fills remaining area */
.workflow-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  max-height: calc(100vh - 64px);
  overflow: hidden;
  padding-top: 16px;
}

.workflow-blueprint-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workflow-blueprint-card-text {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.workflow-blueprint-toolbar {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 16px;
  gap: 12px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.workflow-blueprint-title-label {
  font-weight: 600;
  font-size: 1rem;
}

.workflow-blueprint-toolbar-icons {
  display: flex;
  align-items: center;
  gap: 2px;
}

.workflow-blueprint-toolbar-btn {
  margin: 0 2px;
}

.workflow-blueprint-canvas-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.v-sheet.blueprint-canvas {
  position: relative;
  flex: 1;
  min-height: 300px;
  height: 100%;
  max-height: 100%;
  background-color: #0b1020;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 24px;
  overflow: hidden;
  width: 100%;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.blueprint-canvas.blueprint-canvas-panning {
  cursor: grabbing;
}

.blueprint-canvas-camera {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}

.blueprint-lane {
  position: relative;
}

.blueprint-node {
  position: absolute;
  width: 240px;
  min-width: 240px;
  max-width: 240px;
  border-radius: 12px;
  border: 2px solid #6b92b5;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8), 0 10px 22px rgba(0, 0, 0, 0.6);
  color: #e3f2fd;
  overflow: visible;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.blueprint-node:active {
  cursor: grabbing;
}

.blueprint-node-selected {
  box-shadow: 0 0 0 2px #7da3c4, 0 0 20px rgba(125, 163, 196, 0.4);
}

.blueprint-connectors {
  position: absolute;
  left: 0;
  top: 0;
  /* Let pointer events pass through to nodes; we hit-test lines manually */
  pointer-events: none;
}

.blueprint-zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 10;
}

.blueprint-zoom-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.8);
  min-width: 3rem;
  text-align: center;
}

.connector-line {
  stroke: #7da3c4;
  stroke-width: 2;
  fill: none;
}

.connector-line-animated {
  stroke-dasharray: 8 16;
  animation: connector-flow 1.2s linear infinite;
}

.connector-line-dragging {
  stroke: #6b92b5;
  stroke-width: 2;
  pointer-events: none;
}

@keyframes connector-flow {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -24;
  }
}

.blueprint-context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 160px;
  padding: 4px 0;
  background: rgb(var(--v-theme-surface));
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.blueprint-context-menu-item {
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
}

.blueprint-context-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.blueprint-context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.12);
}

.blueprint-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  cursor: default;
}

.blueprint-node-header {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  color: #0b1020;
  border-radius: 10px 10px 0 0; /* match node top corners (12px - 2px border) */
}

.blueprint-node-header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.blueprint-node-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.blueprint-node-type-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.85;
}

.blueprint-node-title-input {
  width: 100%;
  max-width: 180px;
  font-size: 13px;
  font-weight: 600;
  color: #0b1020;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
}

.blueprint-node-title-input:focus {
  border-color: rgba(0, 0, 0, 0.4);
  background: #fff;
}

.blueprint-node-label-editable {
  cursor: text;
}

.blueprint-node-label-editable:hover {
  text-decoration: underline;
  text-decoration-style: dotted;
}

.blueprint-node-body {
  padding: 10px 12px 12px;
  position: relative;
  border-radius: 0 0 10px 10px; /* match node bottom corners */
  min-height: 72px; /* fixed height so port Y is predictable for connector lines */
  box-sizing: border-box;
}

.blueprint-block-info {
  font-size: 11px;
  line-height: 1.35;
  padding: 4px 0 0 2px;
  margin: 0;
  pointer-events: none;
  user-select: text;
}

.blueprint-block-info-line {
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.blueprint-block-info-muted {
  color: var(--vc-muted, #6b7a8c);
}

.blueprint-block-info-code {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: var(--vc-muted, #5a6575);
}

.blueprint-node-ports {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
}

.blueprint-node-ports-left,
.blueprint-node-ports-right {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
}

.blueprint-node-ports-right {
  justify-content: flex-end;
}

.blueprint-node-ports-right-if {
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
}

.port {
  width: 10px;
  height: 10px;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  border: 2px solid #7da3c4;
  background: #253550;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 8px rgba(125, 163, 196, 0.4);
  pointer-events: auto;
  cursor: crosshair;
  flex-shrink: 0;
  box-sizing: content-box;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.port:hover,
.port.port-drag-source,
.port.port-drop-target {
  box-shadow: 0 0 0 2px rgba(125, 163, 196, 0.9), 0 0 16px rgba(125, 163, 196, 0.7), 0 0 24px rgba(125, 163, 196, 0.4);
  transform: scale(1.35);
}
.port.port-drop-target {
  border-color: #9ec5e8;
  background: #3a5a7a;
}

.blueprint-node-trigger .blueprint-node-ports-right {
  justify-content: flex-end;
}

.port-in {
  margin-left: -8px;
}

.port-out {
  margin-right: -8px;
}

.port-out-then {
  border-color: #6a9a6a;
  background: #3d7a3d;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 8px rgba(106, 154, 106, 0.45);
  margin-top: 12px;
}

.port-out-else {
  border-color: #c07875;
  background: #9a4a48;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 8px rgba(192, 120, 117, 0.45);
  margin-bottom: 12px;
}

.blueprint-node-label {
  font-size: 13px;
}

.blueprint-node-meta {
  font-size: 11px;
  opacity: 0.7;
}

.blueprint-empty-hint {
  color: #7da3c4;
  font-size: 13px;
  opacity: 0.8;
}
</style>
