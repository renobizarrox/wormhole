<template>
  <v-card>
    <v-card-title class="text-h5">Select Tenant</v-card-title>
    <v-card-text>
      <v-alert v-if="error" type="error" dense class="mb-4">
        {{ error }}
      </v-alert>
      <v-list v-if="tenants.length">
        <v-list-item
          v-for="tenant in tenants"
          :key="tenant.id"
          @click="handleSelect(tenant.id)"
          class="cursor-pointer"
        >
          <v-list-item-title>{{ tenant.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ tenant.slug }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-else class="text-body-2">
        No tenants found.
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'default',
});

const authStore = useAuthStore();
const tenants = ref<Array<{ id: string; name: string; slug: string }>>([]);
const error = ref<string | null>(null);

const config = useRuntimeConfig();

const loadTenants = async () => {
  error.value = null;
  try {
    const tokenCookie = useCookie('auth-token');
    const response = await $fetch<{ items: typeof tenants.value }>(
      `${config.public.apiBaseUrl}/tenants`,
      {
        headers: {
          Authorization: `Bearer ${tokenCookie.value}`,
        },
      }
    );
    tenants.value = response.items;
  } catch (err: any) {
    error.value = err?.message || 'Failed to load tenants';
  }
};

const handleSelect = async (tenantId: string) => {
  error.value = null;
  try {
    const tokenCookie = useCookie('auth-token');
    const response = await $fetch<{
      token: string;
      user: { id: string; email: string; name?: string | null };
      tenant: { id: string; name: string; slug: string };
      role: string;
    }>(`${config.public.apiBaseUrl}/auth/switch-tenant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCookie.value}`,
      },
      body: { tenantId },
    });

    authStore.token = response.token;
    authStore.user = response.user;
    authStore.tenant = response.tenant;
    authStore.role = response.role;
    tokenCookie.value = response.token;

    navigateTo('/');
  } catch (err: any) {
    error.value = err?.message || 'Failed to switch tenant';
  }
};

onMounted(loadTenants);
</script>

