import { useQuery, useMutation } from '@vue/apollo-composable';
import { gql } from 'graphql-tag';

export const useGraphQL = () => {
  const { $apollo } = useNuxtApp();
  const authStore = useAuthStore();

  const setAuthHeaders = () => {
    const tokenCookie = useCookie('auth-token');
    if (tokenCookie.value) {
      return {
        Authorization: `Bearer ${tokenCookie.value}`,
        'x-tenant-id': authStore.tenant?.id || '',
      };
    }
    return {};
  };

  const query = <T = any>(queryString: string, variables?: Record<string, any>) => {
    return useQuery<T>(
      gql`
        ${queryString}
      `,
      variables,
      {
        context: {
          headers: setAuthHeaders(),
        },
      }
    );
  };

  const mutate = <T = any>(mutationString: string, variables?: Record<string, any>) => {
    return useMutation<T>(
      gql`
        ${mutationString}
      `,
      {
        context: {
          headers: setAuthHeaders(),
        },
      }
    );
  };

  return {
    query,
    mutate,
  };
};
