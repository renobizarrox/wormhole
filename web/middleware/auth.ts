export default defineNuxtRouteMiddleware((to, from) => {
  const authStore = useAuthStore();
  const tokenCookie = useCookie<string | null>('auth-token');

  // Hydrate store from cookie on first navigation/refresh
  if (!authStore.token && tokenCookie.value) {
    authStore.token = tokenCookie.value;
  }

  if (!authStore.isAuthenticated) {
    return navigateTo('/login');
  }
});
