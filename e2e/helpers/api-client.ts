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
    if (!headers.has('Content-Type') && init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    const installToken = process.env.E2E_INSTALL_TOKEN;
    if (path.startsWith('/install/') && installToken) {
      headers.set('X-Install-Token', installToken);
    }
    if (this.authorization !== null) {
      headers.set('Authorization', `Bearer ${this.authorization}`);
    }
    return fetch(`${this.apiUrl}${path}`, { ...init, headers });
  }
}
