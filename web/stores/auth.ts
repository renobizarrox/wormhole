import { defineStore } from 'pinia';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  role: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    tenant: null,
    token: null,
    role: null,
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
    hasRole: (state) => (role: string) => state.role === role,
  },
  actions: {
    async login(credentials: { email: string; password: string; tenantId: string }) {
      const config = useRuntimeConfig();
      const response = await $fetch(`${config.public.apiBaseUrl}/auth/login`, {
        method: 'POST',
        body: credentials,
      });
      this.token = response.token;
      this.user = response.user;
      this.tenant = response.tenant;
      this.role = response.role;
      // Store token in cookie for Apollo client
      const tokenCookie = useCookie('auth-token', { secure: true, sameSite: 'strict' });
      tokenCookie.value = response.token;
    },
    async logout() {
      this.token = null;
      this.user = null;
      this.tenant = null;
      this.role = null;
      const tokenCookie = useCookie('auth-token');
      tokenCookie.value = null;
    },
    async fetchMe() {
      // TODO: Fetch current user/tenant from GraphQL
    },
  },
});
