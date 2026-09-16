import { readE2EEnvironment } from './environment';

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

  async login(email: string, password: string): Promise<string> {
    const body = await this.requestJson<{
      accessToken?: string;
      token?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
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
    if (this.authorization !== null) {
      headers.set('Authorization', `Bearer ${this.authorization}`);
    }
    return fetch(`${this.apiUrl}${path}`, { ...init, headers });
  }
}
