<template>
  <v-card>
    <v-card-title class="text-h5">Login</v-card-title>
    <v-card-text>
      <v-form @submit.prevent="handleLogin">
        <v-text-field
          v-model="email"
          label="Email"
          type="email"
          required
          :error-messages="errors.email"
        />
        <v-text-field
          v-model="password"
          label="Password"
          type="password"
          required
          :error-messages="errors.password"
        />
        <v-btn type="submit" color="primary" block :loading="loading">
          Login
        </v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'auth',
});

const authStore = useAuthStore();
const email = ref('');
const password = ref('');
const loading = ref(false);
const errors = ref<Record<string, string>>({});

const handleLogin = async () => {
  loading.value = true;
  errors.value = {};
  try {
    await authStore.login({
      email: email.value,
      password: password.value,
    });
    navigateTo('/');
  } catch (error: any) {
    errors.value = { general: error.message || 'Login failed' };
  } finally {
    loading.value = false;
  }
};
</script>
