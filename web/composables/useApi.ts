/**
 * Composable for calling the Node REST API with auth.
 * Uses apiBaseUrl and Bearer token from cookie.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const base = `${config.public.apiBaseUrl}/api`;

  function headers(): Record<string, string> {
    const token = useCookie('auth-token');
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token.value) h.Authorization = `Bearer ${token.value}`;
    return h;
  }

  async function get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const q = query && Object.keys(query).length
      ? '?' + new URLSearchParams(
          Object.entries(query).filter(([, v]) => v !== undefined && v !== '') as [string, string][]
        ).toString()
      : '';
    return $fetch<T>(`${base}${path}${q}`, { headers: headers() });
  }

  async function post<T>(path: string, body?: unknown): Promise<T> {
    return $fetch<T>(`${base}${path}`, { method: 'POST', headers: headers(), body });
  }

  async function patch<T>(path: string, body?: unknown): Promise<T> {
    return $fetch<T>(`${base}${path}`, { method: 'PATCH', headers: headers(), body });
  }

  async function del(path: string): Promise<void> {
    return $fetch(`${base}${path}`, { method: 'DELETE', headers: headers() });
  }

  return { get, post, patch, del, base, headers };
}

export type ApiError = {
  code?: string;
  message?: string;
  details?: unknown;
};

export function isApiError(e: unknown): e is { data?: ApiError; statusCode?: number } {
  return typeof e === 'object' && e !== null && 'data' in e;
}
