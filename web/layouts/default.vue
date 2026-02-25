<template>
  <v-app>
    <v-navigation-drawer
      v-model="drawer"
      :temporary="$vuetify.display.mobile"
      app
    >
      <v-list>
        <v-list-item
          prepend-icon="mdi-view-dashboard"
          title="Dashboard"
          :to="{ name: 'index' }"
        />
        <v-list-item
          prepend-icon="mdi-apps"
          title="Apps"
          :to="{ name: 'apps' }"
        />
        <v-list-item
          prepend-icon="mdi-play-circle"
          title="Actions"
          :to="{ name: 'actions' }"
        />
        <v-list-item
          prepend-icon="mdi-link-variant"
          title="Connections"
          :to="{ name: 'connections' }"
        />
        <v-list-item
          prepend-icon="mdi-sitemap"
          title="Workflows"
          :to="{ name: 'workflows' }"
        />
        <v-list-item
          prepend-icon="mdi-lightning-bolt"
          title="Triggers"
          :to="{ name: 'triggers' }"
        />
        <v-list-item
          prepend-icon="mdi-play-network"
          title="Runs"
          :to="{ name: 'runs' }"
        />
        <v-list-item
          prepend-icon="mdi-cog"
          title="Settings"
          :to="{ name: 'settings' }"
        />
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app>
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-toolbar-title>Wormhole</v-toolbar-title>
      <v-spacer />
      <v-menu>
        <template #activator="{ props }">
          <v-btn icon v-bind="props">
            <v-icon>mdi-account-circle</v-icon>
          </v-btn>
        </template>
        <v-list>
          <v-list-item>
            <v-list-item-title>{{ userEmail }}</v-list-item-title>
            <v-list-item-subtitle>{{ tenantName }}</v-list-item-subtitle>
          </v-list-item>
          <v-divider />
          <v-list-item :to="{ name: 'tenants' }">
            <v-list-item-title>Switch Tenant</v-list-item-title>
          </v-list-item>
          <v-divider />
          <v-list-item @click="logout">
            <v-list-item-title>Logout</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main>
      <slot />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const drawer = ref(true);
const authStore = useAuthStore();
const userEmail = computed(() => authStore.user?.email || '');
const tenantName = computed(() => authStore.tenant?.name || '');

const logout = () => {
  authStore.logout();
  navigateTo('/login');
};
</script>
