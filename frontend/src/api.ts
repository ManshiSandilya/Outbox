const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';

export type AuthUser = { id: string; name: string | null; email: string; image: string | null };

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}
