import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiClient, ApiRequestError } from '../helpers/api-client';

/*
  Offline cover for the gateway retry added after nightly run 44049572740
  (2026-11-17): the reverse proxy answered its own HTML page with HTTP 503 while
  the stack was restarting, and 13 specs died on it. `ApiClient` must repeat such
  an answer (the app never saw the request) and must not repeat a 503 that is our
  own JSON error. No stack, no browser: a local server plays the proxy.
  `E2E_GATEWAY_RETRY_DELAYS_MS` keeps the retries at 10 ms here.
*/

const proxyPage =
  '<!DOCTYPE html><html><head><title>Site not available</title></head><body>down</body></html>';

type Handler = (hit: number, response: import('node:http').ServerResponse) => void;

async function withServer(handler: Handler, run: (url: string, hits: () => number) => Promise<void>): Promise<void> {
  let hits = 0;
  const server: Server = createServer((_request, response) => {
    hits += 1;
    handler(hits, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`, () => hits);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function proxyAnswer(response: import('node:http').ServerResponse): void {
  response.setHeader('content-type', 'text/html');
  response.statusCode = 503;
  response.end(proxyPage);
}

test('a write is retried through the proxy and succeeds when the app answers again', async () => {
  process.env.E2E_GATEWAY_RETRY_DELAYS_MS = '10,10';
  try {
    await withServer(
      (hit, response) => {
        if (hit <= 2) {
          proxyAnswer(response);
          return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ status: 'ok' }));
      },
      async (url, hits) => {
        const api = new ApiClient(url, url);
        const body = await api.requestJson<{ status: string }>('/auth/login', {
          method: 'POST',
          body: '{}',
        });
        expect(body.status).toBe('ok');
        expect(hits()).toBe(3); // two proxy answers, then the app
      },
    );
  } finally {
    delete process.env.E2E_GATEWAY_RETRY_DELAYS_MS;
  }
});

test('a proxy that never steps aside ends as STACK_UNAVAILABLE, not as an HTML dump', async () => {
  process.env.E2E_GATEWAY_RETRY_DELAYS_MS = '10,10';
  try {
    await withServer(
      (_hit, response) => proxyAnswer(response),
      async (url, hits) => {
        const api = new ApiClient(url, url);
        const failure = await api
          .request('/problems', { method: 'POST', body: '{}' })
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(ApiRequestError);
        const error = failure as ApiRequestError;
        expect(error.code).toBe('STACK_UNAVAILABLE');
        expect(error.status).toBe(503);
        expect(error.message).toContain('never reached the app');
        expect(error.message).not.toContain('<!DOCTYPE html>');
        expect(hits()).toBe(3); // 1 attempt + the 2 retries of the budget
      },
    );
  } finally {
    delete process.env.E2E_GATEWAY_RETRY_DELAYS_MS;
  }
});

test('our own JSON 503 is an application answer and is never retried', async () => {
  process.env.E2E_GATEWAY_RETRY_DELAYS_MS = '10,10';
  try {
    await withServer(
      (_hit, response) => {
        response.setHeader('content-type', 'application/json');
        response.statusCode = 503;
        response.end(JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'maintenance window' }));
      },
      async (url, hits) => {
        const api = new ApiClient(url, url);
        const failure = await api.requestJson('/settings').catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(ApiRequestError);
        expect((failure as ApiRequestError).code).toBe('SERVICE_UNAVAILABLE');
        expect(hits()).toBe(1); // the app answered, so there is nothing to retry
      },
    );
  } finally {
    delete process.env.E2E_GATEWAY_RETRY_DELAYS_MS;
  }
});

test('a 502 with an empty body is treated as the proxy too', async () => {
  process.env.E2E_GATEWAY_RETRY_DELAYS_MS = '10';
  try {
    await withServer(
      (hit, response) => {
        if (hit === 1) {
          response.statusCode = 502;
          response.end();
          return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true }));
      },
      async (url, hits) => {
        const api = new ApiClient(url, url);
        await expect(api.requestJson<{ ok: boolean }>('/problems')).resolves.toEqual({ ok: true });
        expect(hits()).toBe(2);
      },
    );
  } finally {
    delete process.env.E2E_GATEWAY_RETRY_DELAYS_MS;
  }
});
