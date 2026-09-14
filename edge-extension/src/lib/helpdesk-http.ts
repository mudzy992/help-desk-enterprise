export async function helpdeskRequest<T>(input: {
  readonly apiBaseUrl: string;
  readonly path: string;
  readonly accessToken?: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (input.accessToken !== undefined) {
    headers.Authorization = `Bearer ${input.accessToken}`;
  }
  if (input.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${input.apiBaseUrl}${input.path}`, {
    method: input.method ?? 'GET',
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    const message =
      typeof payload.message === 'string' ? payload.message : response.statusText;
    throw new Error(message);
  }
  return payload;
}
