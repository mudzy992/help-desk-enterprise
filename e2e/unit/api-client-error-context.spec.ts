import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiClient, ApiRequestError } from '../helpers/api-client';

/*
  Nightly run 44999494543 (2026-11-22): the full suite was green except for a flaky
  `09-config-ops` retry that recorded

    ApiRequestError: CONFIG_VALIDATION_FAILED:
      {"code":"CONFIG_VALIDATION_FAILED","message":"Config version validation failed",
       "details":{},"requestId":"ff9db3d1-…"}

  Two things were missing: the call that failed (create / validate / shadow / rollback
  all live in that spec) and the reason (the issues travel as an array and the API
  dropped them — see `format-error-response.ts`). This cover pins the client half: the
  message keeps the `CODE: <body>` prefix every assertion matches on, names the
  request, and keeps `details` for assertions. No stack, no browser.
*/

async function withServer(
  handler: (response: import('node:http').ServerResponse) => void,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((_request, response) => handler(response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function jsonError(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown,
): void {
  response.setHeader('content-type', 'application/json');
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

test('a refused call names its method and path and keeps the code and details', async () => {
  const body = {
    code: 'CONFIG_VALIDATION_FAILED',
    message: 'Config version validation failed',
    details: {
      issues: [
        { code: 'ROUTING_UNCOVERED', path: 'routing.coverage.ou-1.svc-9', message: 'ROUTING_UNCOVERED' },
      ],
    },
    requestId: 'ff9db3d1-f015-4acf-af7d-16b2e7cfef46',
  };
  await withServer(
    (response) => jsonError(response, 400, body),
    async (url) => {
      const api = new ApiClient(url, url);
      const failure = await api
        .requestJson('/config-versions/cv-1/rollback', {
          method: 'POST',
          body: JSON.stringify({ reason: 'E2E rollback' }),
        })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ApiRequestError);
      const error = failure as ApiRequestError;
      expect(error.code).toBe('CONFIG_VALIDATION_FAILED');
      expect(error.status).toBe(400);
      expect(error.message.startsWith('CONFIG_VALIDATION_FAILED: ')).toBe(true);
      expect(error.message.endsWith('(from POST /config-versions/cv-1/rollback)')).toBe(true);
      // The reason is the whole answer here; it must survive the client too.
      expect(error.details).toEqual(body.details);
      expect(error.message).toContain('ROUTING_UNCOVERED');
    },
  );
});

test('a refused GET says GET, not POST', async () => {
  await withServer(
    (response) => jsonError(response, 404, { code: 'NOT_FOUND', message: 'Config version not found' }),
    async (url) => {
      const api = new ApiClient(url, url);
      const failure = await api
        .requestJson('/config-versions/missing')
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ApiRequestError);
      expect((failure as ApiRequestError).message.endsWith('(from GET /config-versions/missing)')).toBe(true);
    },
  );
});
