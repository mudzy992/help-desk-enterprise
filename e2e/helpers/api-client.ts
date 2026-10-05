import { readE2EEnvironment } from './environment';
import { currentStep, nextTotpCode, saveMfaSecret, totpForStep } from './mfa';

export type ApiErrorBody = {
  readonly code?: string;
  readonly message?: string;
};

export class ApiClient {
  private authorization: string | null = null;

  constructor(private readonly apiUrl = readE2EEnvironment().apiUrl) {}

  setBearerToken(token: string | null): void {
    this.authorization = token;
  }

  /**
   * Paket 2.1: password → (MFA verify | forced MFA enrollment) → token. The
   * enrollment secret is stored for later sign-ins (helpers/mfa.ts).
   */
  async login(email: string, password: string): Promise<string> {
    type LoginBody = {
      accessToken?: string;
      token?: string;
      status?: string;
      mfaToken?: string;
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
    const token = body.accessToken ?? body.token;
    if (token === undefined || token.length === 0) {
      throw new Error('Login response missing access token');
    }
    this.setBearerToken(token);
    return token;
  }

  async requestJson<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.request(path, init);
    const text = await response.text();
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      try {
        const parsed = JSON.parse(text) as ApiErrorBody;
        if (typeof parsed.code === 'string') {
          code = parsed.code;
        }
      } catch {
        // keep HTTP status code
      }
      throw new Error(`${code}: ${text}`);
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
   * A `GET` is retried once, because the e2e job runs against a live stack that
   * can be redeploying at the same moment; anything else fails immediately so a
   * retry can never duplicate a write.
   */
  private async send(
    path: string,
    init: RequestInit,
    headers: Headers,
    attempt: number,
  ): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    try {
      return await fetch(`${this.apiUrl}${path}`, { ...init, headers });
    } catch (error) {
      const cause = (error as { readonly cause?: unknown }).cause;
      const causeCode =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? String((cause as { readonly code?: unknown }).code)
          : '';
      const causeMessage = cause instanceof Error ? cause.message : String(cause ?? '');
      const detail = [causeCode, causeMessage].filter((part) => part.length > 0).join(' / ');
      if (method === 'GET' && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
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
