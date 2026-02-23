export default defineNuxtPlugin(() => {
  const { $apollo } = useNuxtApp();
  const authStore = useAuthStore();
  const tokenCookie = useCookie('auth-token');

  // Set auth token in Apollo client headers
  if (tokenCookie.value) {
    const apolloClient = $apollo?.defaultClient;
    if (apolloClient) {
      apolloClient.setHeaders({
        Authorization: `Bearer ${tokenCookie.value}`,
      });
    }
  }
});
