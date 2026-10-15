import { readE2EEnvironment } from './environment';
import { currentStep, nextTotpCode, saveMfaSecret, totpForStep } from './mfa';

/**
 * Connect-phase network errors: the request never reached the API, so repeating
 * it cannot duplicate a write (undici throws these from the connector).
 */
const connectFailures = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

export type ApiErrorBody = {
  readonly code?: string;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
};

/**
 * Paket 5.4.0-f: a non-2xx answer with its parsed body. The message stays the
 * `CODE: <json>` shape every existing caller matches on (`canSignIn`, the specs
 * that assert on `INVALID_CREDENTIALS` / `MUST_REQUIRED_PASSWORD`), while the
 * code, the status and `details` become fields — the password provisioning needs
 * `details.violations` to tell "the deployment refused this password" (policy,
 * Pwned Passwords) from a real failure.
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** `details.violations`, as the password policy reports them. */
  get violations(): readonly string[] {
    const violations = this.details?.violations;
    return Array.isArray(violations) ? violations.filter((entry): entry is string => typeof entry === 'string') : [];
  }
}

const SESSION_COOKIE_NAME = 'helpdesk_session';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiClient {
  private authorization: string | null = null;
  /** The HttpOnly session cookie the API set on sign-in, replayed like a browser would. */
  private sessionCookie: string | null = null;

  constructor(
    private readonly apiUrl = readE2EEnvironment().apiUrl,
    private readonly appOrigin = readE2EEnvironment().baseUrl,
  ) {}

  setBearerToken(token: string | null): void {
    this.authorization = token;
  }

  /**
   * Paket 2.1: password → (MFA verify | forced MFA enrollment) → session cookie.
   * The enrollment secret is stored for later sign-ins (helpers/mfa.ts). Returns
   * the opaque session value so callers can assert that a session was issued.
   */
  async login(email: string, password: string): Promise<string> {
    type LoginBody = {
      status?: string;
      mfaToken?: string;
      /** Only from a stack that predates the httpOnly session cookie. */
      accessToken?: string;
    };
    let body = await this.requestJson<LoginBody>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (body.status === 'MFA_ENROLLMENT_REQUIRED' && body.mfaToken) {
      const { secret } = await this.requestJson<{ secret: string }>('/auth/mfa/enroll/start', {
        method: 'POST',
        body: JSON.stringify({ mfaToken: body.mfaToken }),
      });
      const step = currentStep();
      body = await this.requestJson<LoginBody>('/auth/mfa/enroll/confirm', {
        method: 'POST',
        body: JSON.stringify({ mfaToken: body.mfaToken, code: totpForStep(secret, step) }),
      });
      saveMfaSecret(email, secret, step);
    } else if (body.status === 'MFA_REQUIRED' && body.mfaToken) {
      body = await this.requestJson<LoginBody>('/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ mfaToken: body.mfaToken, code: await nextTotpCode(email) }),
      });
    } else if (body.status !== undefined) {
      throw new Error(`Login requires ${body.status}`);
    }
    if (this.sessionCookie !== null) {
      return this.sessionCookie;
    }
    // Prelazni režim: stack koji je trenutno deployovan iz master-a još vraća token u tijelu
    // i ne šalje kolačić. PR gate testira taj stack, pa se koristi bearer do deploya grane.
    // Ukloniti kad E2E stack izdaje kolačić (specovi 37 i 39 provjeravaju kolačić).
    if (typeof body.accessToken === 'string' && body.accessToken.length > 0) {
      this.setBearerToken(body.accessToken);
      return body.accessToken;
    }
    throw new Error('Login response did not set the session cookie');
  }

  async requestJson<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.request(path, init);
    const text = await response.text();
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let details: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(text) as ApiErrorBody;
        if (typeof parsed.code === 'string') {
          code = parsed.code;
        }
        details =
          typeof parsed.details === 'object' && parsed.details !== null ? parsed.details : null;
      } catch {
        // keep HTTP status code
      }
      throw new ApiRequestError(`${code}: ${text}`, response.status, code, details);
    }
    if (text.length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    // FormData (uploads) sets its own multipart boundary.
    if (!headers.has('Content-Type') && init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const installToken = process.env.E2E_INSTALL_TOKEN;
    if (path.startsWith('/install/') && installToken) {
      headers.set('X-Install-Token', installToken);
    }
    if (this.authorization !== null) {
      headers.set('Authorization', `Bearer ${this.authorization}`);
    } else if (this.sessionCookie !== null) {
      headers.set('Cookie', `${SESSION_COOKIE_NAME}=${this.sessionCookie}`);
      // Browsers send Origin on state-changing requests; the API trusts a cookie session only from an allowed origin.
      if (UNSAFE_METHODS.has((init.method ?? 'GET').toUpperCase())) {
        headers.set('Origin', this.appOrigin);
      }
    }
    return this.send(path, init, headers, 0);
  }

  /**
   * First real e2e run (2026-10-05): two asset specs failed with a bare
   * `TypeError: fetch failed` — no method, no path, no cause, so the job log did
   * not say whether the API was unreachable (a redeploy?) or the TLS/DNS broke.
   * Every network-level failure now names the request and carries the cause
   * (`ECONNREFUSED`, `ENOTFOUND`, `UND_ERR_SOCKET`, …).
   *
   * Retry policy, both cases up to twice with a short backoff:
   *
   * - a `GET` is always safe to repeat;
   * - **any method is repeated when the connection never opened** — the full run
   *   of 2026-10-05 lost specs 23 and 24 to `UND_ERR_CONNECT_TIMEOUT` after 57
   *   minutes, and a request that never reached the API cannot have written
   *   anything. `CONNECT_FAILURES` lists exactly the connect-phase codes;
   *   a reset/timeout after sending (`UND_ERR_SOCKET`, `ECONNRESET`) is never
   *   repeated for a write.
   */
  private captureSessionCookie(response: Response): void {
    const cookie = response.headers
      .getSetCookie()
      .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (cookie === undefined) {
      return;
    }
    const value = cookie.slice(SESSION_COOKIE_NAME.length + 1).split(';')[0] ?? '';
    this.sessionCookie = value.length > 0 ? value : null;
  }

  private async send(
    path: string,
    init: RequestInit,
    headers: Headers,
    attempt: number,
  ): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    try {
      const response = await fetch(`${this.apiUrl}${path}`, { ...init, headers });
      this.captureSessionCookie(response);
      return response;
    } catch (error) {
      const cause = (error as { readonly cause?: unknown }).cause;
      const causeCode =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? String((cause as { readonly code?: unknown }).code)
          : '';
      const causeMessage = cause instanceof Error ? cause.message : String(cause ?? '');
      const detail = [causeCode, causeMessage].filter((part) => part.length > 0).join(' / ');
      const retryable = method === 'GET' || connectFailures.has(causeCode);
      if (retryable && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
        return this.send(path, init, headers, attempt + 1);
      }
      throw new Error(
        `NETWORK ${method} ${path} failed: ${error instanceof Error ? error.message : String(error)}` +
          (detail.length > 0 ? ` (cause: ${detail})` : '') +
          ` — the API at ${this.apiUrl} was not reachable from the runner.`,
        { cause: error },
      );
    }
  }
}
