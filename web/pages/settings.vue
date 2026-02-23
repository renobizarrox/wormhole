<template>
  <v-container>
    <h1 class="text-h4 mb-4">Settings</h1>
    <v-card>
      <v-card-text>
        <p>Tenant settings and users - TODO: Implement</p>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default',
  middleware: 'auth',
});
</script>
