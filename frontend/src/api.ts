const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';

export type AuthUser = { id: string; name: string | null; email: string; image: string | null };
export type EmailListItem = { email: string; subject: string; scheduled_time: string; sent_time: string | null; status: 'scheduled' | 'sent' | 'failed' };
export type EmailListResponse = { emails: EmailListItem[] };

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

export async function fetchEmails(status: 'scheduled' | 'sent|failed'): Promise<EmailListResponse> {
  const response = await apiFetch(`/api/emails?status=${encodeURIComponent(status)}`);
  if (!response.ok) throw new Error('Unable to load emails.');
  return (await response.json()) as EmailListResponse;
}

export async function searchEmails(query: string): Promise<EmailListResponse> {
  const response = await apiFetch(`/api/emails/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error('Unable to search emails.');
  return (await response.json()) as EmailListResponse;
}

