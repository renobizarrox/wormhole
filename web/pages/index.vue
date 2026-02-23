<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h4 mb-4">Dashboard</h1>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Workflows</v-card-title>
          <v-card-text>
            <div class="text-h2">{{ stats.workflows }}</div>
            <div class="text-caption">Total workflows</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Runs</v-card-title>
          <v-card-text>
            <div class="text-h2">{{ stats.runs }}</div>
            <div class="text-caption">Total runs</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Connections</v-card-title>
          <v-card-text>
            <div class="text-h2">{{ stats.connections }}</div>
            <div class="text-caption">Active connections</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});

const stats = ref({
  workflows: 0,
  runs: 0,
  connections: 0,
});

// TODO: Fetch stats from GraphQL
</script>
