/**
 * Minimalni, strogi HTTP klijent prema EP-HelpDesk API-ju.
 *
 * - 15 s timeout (SW kontekst, bez vječnog visenja).
 * - 401 → {@link AuthExpiredError}; pozivatelj (edge-session) čisti sesiju.
 * - Greške se mapiraju u {@link HelpdeskHttpError} (status + server `code`).
 */
export class HelpdeskHttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HelpdeskHttpError';
    this.status = status;
    this.code = code;
  }
}

export class AuthExpiredError extends HelpdeskHttpError {
  constructor(message = 'Sesija je istekla. Prijavite se ponovo.') {
    super(401, message, 'AUTH_EXPIRED');
    this.name = 'AuthExpiredError';
  }
}

const defaultTimeoutMs = 15_000;

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function helpdeskRequest<T>(input: {
  readonly apiBaseUrl: string;
  readonly path: string;
  readonly accessToken?: string;
  readonly method?: HttpMethod;
  readonly body?: unknown;
  readonly timeoutMs?: number;
}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (input.accessToken !== undefined) {
    headers.Authorization = `Bearer ${input.accessToken}`;
  }
  if (input.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs ?? defaultTimeoutMs);

  let response: Response;
  try {
    response = await fetch(`${input.apiBaseUrl}${input.path}`, {
      method: input.method ?? 'GET',
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HelpdeskHttpError(
        0,
        'Server ne odgovara (timeout). Pokušajte ponovo.',
        'TIMEOUT',
      );
    }
    throw new HelpdeskHttpError(
      0,
      'Server nije dostupan. Provjerite API URL i mrežu.',
      'NETWORK',
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readJsonSafely(response);

  if (response.status === 401) {
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const message =
      typeof payload?.message === 'string' && payload.message.length > 0
        ? payload.message
        : `Greška ${response.status}`;
    throw new HelpdeskHttpError(response.status, message, payload?.code);
  }
  return payload as T;
}

async function readJsonSafely(
  response: Response,
): Promise<{ message?: string; code?: string } & Record<string, unknown>> {
  try {
    const text = await response.text();
    if (text.length === 0) {
      return {};
    }
    return JSON.parse(text) as { message?: string; code?: string } &
      Record<string, unknown>;
  } catch {
    return {};
  }
}
