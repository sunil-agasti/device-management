function getCsrfToken(): string {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);

  if (options.method && options.method !== 'GET') {
    headers.set('x-csrf-token', getCsrfToken());
  }

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}
