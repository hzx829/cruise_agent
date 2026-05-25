'use client';

function getCurrentNextPath(): string {
  if (typeof window === 'undefined') return '/chat';

  const nextPath = `${window.location.pathname}${window.location.search}`;
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) return '/chat';

  return nextPath;
}

export function getLoginUrl(nextPath = getCurrentNextPath()): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function redirectToLogin(nextPath?: string): void {
  if (typeof window === 'undefined') return;
  window.location.assign(getLoginUrl(nextPath));
}

export async function fetchWithAuthRedirect(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status === 401) {
    redirectToLogin();
  }

  return response;
}

export async function fetchJsonWithAuthRedirect<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithAuthRedirect(input, init);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
